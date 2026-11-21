-- AC Scan2Print — Phase 2 Atomic RPCs for Queue Release, Agent Claiming, and Rate Limiting

-- 1. Atomic Admin Queue Release (Prevents duplicate release & unpaid release)
CREATE OR REPLACE FUNCTION public.rpc_release_print_job(
  p_job_id UUID,
  p_printer_id UUID,
  p_admin_id UUID
)
RETURNS public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.print_jobs;
  v_printer public.print_printers;
  v_active_attempt_count INTEGER;
BEGIN
  SELECT * INTO v_job FROM public.print_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  IF v_job.status = 'queued' THEN
    RAISE EXCEPTION 'JOB_ALREADY_QUEUED';
  END IF;

  IF v_job.status <> 'approved' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: job must be approved before release (current=%)', v_job.status;
  END IF;

  IF v_job.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED: payment_status must be paid before queue release';
  END IF;

  SELECT * INTO v_printer FROM public.print_printers WHERE id = p_printer_id;
  IF NOT FOUND OR v_printer.is_enabled = FALSE OR v_printer.printer_status = 'disabled' THEN
    RAISE EXCEPTION 'PRINTER_UNAVAILABLE';
  END IF;

  SELECT COUNT(*) INTO v_active_attempt_count
  FROM public.print_job_attempts
  WHERE job_id = p_job_id AND finished_at IS NULL;

  IF v_active_attempt_count > 0 THEN
    RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS';
  END IF;

  UPDATE public.print_jobs
  SET
    status = 'queued',
    assigned_printer_id = p_printer_id,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  INSERT INTO public.print_events (job_id, actor_type, actor_id, event_type, previous_status, new_status, metadata)
  VALUES (
    p_job_id,
    'admin',
    p_admin_id,
    'job_released_to_queue',
    'approved',
    'queued',
    jsonb_build_object('assigned_printer_id', p_printer_id)
  );

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_release_print_job(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_release_print_job(UUID, UUID, UUID) TO service_role;

-- 2. Atomic Agent Job Claim (SKIP LOCKED guarantees two agents never claim the same job)
CREATE OR REPLACE FUNCTION public.rpc_claim_next_print_job(
  p_device_id UUID,
  p_lease_seconds INTEGER DEFAULT 180,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TABLE (
  job_id UUID,
  job_number TEXT,
  attempt_id UUID,
  attempt_number INTEGER,
  printer_id UUID,
  lease_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device public.print_devices;
  v_job public.print_jobs;
  v_next_attempt INTEGER;
  v_attempt_id UUID;
  v_lease TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_device FROM public.print_devices WHERE id = p_device_id;
  IF NOT FOUND OR v_device.device_status <> 'active' THEN
    RAISE EXCEPTION 'DEVICE_NOT_ACTIVE';
  END IF;

  SELECT j.* INTO v_job
  FROM public.print_jobs j
  JOIN public.print_printers p ON p.id = j.assigned_printer_id
  WHERE j.status = 'queued'
    AND j.payment_status = 'paid'
    AND p.device_id = p_device_id
    AND p.is_enabled = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.print_job_attempts a
      WHERE a.job_id = j.id AND a.finished_at IS NULL
    )
  ORDER BY j.approved_at ASC NULLS LAST, j.created_at ASC
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(a.attempt_number), 0) + 1
  INTO v_next_attempt
  FROM public.print_job_attempts a
  WHERE a.job_id = v_job.id;

  v_lease := now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 600)));

  INSERT INTO public.print_job_attempts (
    job_id, attempt_number, idempotency_key, device_id, printer_id, attempt_status, lease_expires_at
  ) VALUES (
    v_job.id, v_next_attempt, p_idempotency_key, p_device_id, v_job.assigned_printer_id, 'claimed', v_lease
  )
  RETURNING id INTO v_attempt_id;

  UPDATE public.print_jobs
  SET status = 'claimed', updated_at = now()
  WHERE id = v_job.id;

  INSERT INTO public.print_events (job_id, actor_type, actor_id, event_type, previous_status, new_status, metadata)
  VALUES (
    v_job.id,
    'agent',
    p_device_id,
    'job_claimed',
    'queued',
    'claimed',
    jsonb_build_object('attempt_id', v_attempt_id, 'attempt_number', v_next_attempt, 'lease_expires_at', v_lease)
  );

  RETURN QUERY SELECT v_job.id, v_job.job_number, v_attempt_id, v_next_attempt, v_job.assigned_printer_id, v_lease;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_claim_next_print_job(UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_claim_next_print_job(UUID, INTEGER, UUID) TO service_role;

-- 3. Atomic Rate Limit Check
CREATE OR REPLACE FUNCTION public.rpc_check_rate_limit(
  p_key TEXT,
  p_max_hits INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.print_api_rate_limits;
  v_cutoff TIMESTAMPTZ := now() - make_interval(secs => p_window_seconds);
BEGIN
  INSERT INTO public.print_api_rate_limits (bucket_key, hit_count, window_started_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (bucket_key) DO UPDATE SET
    hit_count = CASE
      WHEN public.print_api_rate_limits.window_started_at < v_cutoff THEN 1
      ELSE public.print_api_rate_limits.hit_count + 1
    END,
    window_started_at = CASE
      WHEN public.print_api_rate_limits.window_started_at < v_cutoff THEN now()
      ELSE public.print_api_rate_limits.window_started_at
    END
  RETURNING * INTO v_row;

  RETURN v_row.hit_count <= p_max_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
