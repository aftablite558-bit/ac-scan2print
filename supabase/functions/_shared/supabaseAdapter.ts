// AC Scan2Print — Live Supabase Client Backend Adapter (Deno Edge Function Runtime)
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY strictly from server-side Deno.env.

// @ts-ignore Deno npm specifier resolved at Edge Function bundle/deploy time
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { verifyFirebaseIdToken } from './firebaseAuth.ts';
import {
  AppError,
  type ClaimedJobResult,
  type PaperSize,
  type PrintAdminAccount,
  type PrintCleanupLog,
  type PrintDevice,
  type PrintEvent,
  type PrintFile,
  type PrintJob,
  type PrintJobAttempt,
  type PrintMode,
  type PrintPayment,
  type PrintPaymentSettings,
  type PrintPricingRule,
  type PrintPrinter,
  type PrintSides,
  type PrintSystemSettings,
  type PublicPortalBootstrapData,
  type RuntimeEnv,
  type Scan2PrintBackendAdapter,
} from './types.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export function readDenoRuntimeEnv(): RuntimeEnv {
  return {
    FIREBASE_PROJECT_ID: Deno.env.get('FIREBASE_PROJECT_ID'),
    CUSTOMER_PORTAL_URL: Deno.env.get('CUSTOMER_PORTAL_URL'),
    ADMIN_BOOTSTRAP_SECRET: Deno.env.get('ADMIN_BOOTSTRAP_SECRET'),
    ADMIN_BOOTSTRAP_ALLOWED_UID: Deno.env.get('ADMIN_BOOTSTRAP_ALLOWED_UID'),
    CRON_SECRET: Deno.env.get('CRON_SECRET'),
    ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS'),
    AGENT_CLAIM_LEASE_SECONDS: Deno.env.get('AGENT_CLAIM_LEASE_SECONDS'),
  };
}

export function createLiveSupabaseAdapter(): Scan2PrintBackendAdapter {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AppError(500, 'SERVER_MISCONFIGURED', 'Supabase server environment credentials are not configured.');
  }

  const adminClient: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async verifyFirebaseAdminToken(bearerToken: string, env: RuntimeEnv) {
      const projectId = env.FIREBASE_PROJECT_ID ?? Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
      const verified = await verifyFirebaseIdToken(bearerToken, projectId);
      if (!verified) {
        return null;
      }
      return { firebaseUid: verified.firebaseUid, email: verified.email };
    },

    async getActiveAdminByFirebaseUid(firebaseUid: string) {
      const { data, error } = await adminClient
        .from('print_admin_accounts')
        .select('*')
        .eq('firebase_uid', firebaseUid)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintAdminAccount | null;
    },

    async countAdminAccounts() {
      const { count, error } = await adminClient
        .from('print_admin_accounts')
        .select('id', { count: 'exact', head: true });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return count ?? 0;
    },

    async createAdminAccount(input) {
      const { data, error } = await adminClient
        .from('print_admin_accounts')
        .insert({
          firebase_uid: input.firebaseUid,
          user_id: null,
          email: input.email,
          full_name: input.fullName,
          is_active: true,
          singleton_guard: true,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new AppError(409, 'SINGLE_ADMIN_ALREADY_EXISTS', 'Only one Admin account is permitted for MVP.');
        }
        throw new AppError(500, 'DB_ERROR', error.message);
      }
      return data as PrintAdminAccount;
    },

    async checkRateLimit(key: string, maxHits: number, windowSeconds: number) {
      const { data, error } = await adminClient.rpc('rpc_check_rate_limit', {
        p_key: key,
        p_max_hits: maxHits,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new AppError(500, 'RATE_LIMIT_ERROR', error.message);
      return Boolean(data);
    },

    async getSystemSettings() {
      const { data, error } = await adminClient.from('print_system_settings').select('*').eq('id', 1).single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintSystemSettings;
    },

    async getPaymentSettings() {
      const { data, error } = await adminClient.from('print_payment_settings').select('*').eq('id', 1).single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPaymentSettings;
    },

    async getPublicPortalBootstrapData(): Promise<PublicPortalBootstrapData> {
      const [sysRes, printersRes, rulesRes] = await Promise.all([
        adminClient
          .from('print_system_settings')
          .select(
            'max_file_size_bytes, max_files_per_job, max_copies, draft_retention_hours, completed_retention_hours'
          )
          .eq('id', 1)
          .single(),
        adminClient
          .from('print_printers')
          .select(
            'is_enabled, approval_status, archived_at, printer_status, supported_paper_sizes, supports_colour, supports_duplex, capabilities_verified'
          )
          .is('archived_at', null)
          .eq('is_enabled', true),
        adminClient
          .from('print_pricing_rules')
          .select(
            'id, rule_name, paper_size, print_mode, print_sides, pricing_unit, rate, minimum_charge, is_active, valid_from, valid_until'
          )
          .eq('is_active', true),
      ]);
      if (sysRes.error) throw new AppError(500, 'DB_ERROR', sysRes.error.message);
      if (printersRes.error) throw new AppError(500, 'DB_ERROR', printersRes.error.message);
      if (rulesRes.error) throw new AppError(500, 'DB_ERROR', rulesRes.error.message);
      return {
        systemSettings: sysRes.data as PublicPortalBootstrapData['systemSettings'],
        printers: (printersRes.data ?? []) as PublicPortalBootstrapData['printers'],
        pricingRules: ((rulesRes.data ?? []) as PrintPricingRule[]).map((r) => ({
          ...r,
          rate: Number(r.rate),
          minimum_charge: Number(r.minimum_charge),
        })),
      };
    },

    async updatePaymentSettings(patch) {
      const { data, error } = await adminClient
        .from('print_payment_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPaymentSettings;
    },

    async findActivePricingRule(input: { paperSize: PaperSize; printMode: PrintMode; printSides: PrintSides; nowIso?: string }) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const { data, error } = await adminClient
        .from('print_pricing_rules')
        .select('*')
        .eq('paper_size', input.paperSize)
        .eq('print_mode', input.printMode)
        .eq('print_sides', input.printSides)
        .eq('is_active', true)
        .lte('valid_from', nowIso)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      if (!data) return null;
      const rule = data as PrintPricingRule;
      if (rule.valid_until && Date.parse(rule.valid_until) < Date.parse(nowIso)) {
        return null;
      }
      return {
        ...rule,
        rate: Number(rule.rate),
        minimum_charge: Number(rule.minimum_charge),
      };
    },

    async createJob(input) {
      const { data, error } = await adminClient
        .from('print_jobs')
        .insert({
          job_number: input.jobNumber,
          draft_upload_secret_hash: input.draftUploadSecretHash,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          paper_size: input.paperSize,
          print_mode: input.printMode,
          print_sides: input.printSides,
          copies: input.copies,
          orientation: input.orientation,
          scaling: input.scaling,
          requested_page_range: input.requestedPageRange,
          submission_idempotency_key: input.submissionIdempotencyKey,
        })
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJob;
    },

    async getJobById(jobId: string) {
      const { data, error } = await adminClient.from('print_jobs').select('*').eq('id', jobId).maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJob | null;
    },

    async getJobByTrackingHash(trackingTokenHash: string) {
      const { data, error } = await adminClient
        .from('print_jobs')
        .select('*')
        .eq('tracking_token_hash', trackingTokenHash)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJob | null;
    },

    async getJobByIdempotencyKey(key: string) {
      const { data, error } = await adminClient
        .from('print_jobs')
        .select('*')
        .eq('submission_idempotency_key', key)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJob | null;
    },

    async updateJob(jobId: string, patch: Partial<PrintJob>) {
      const { data, error } = await adminClient
        .from('print_jobs')
        .update(patch)
        .eq('id', jobId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJob;
    },

    async listJobsForRetentionCheck() {
      const { data, error } = await adminClient
        .from('print_jobs')
        .select('*')
        .in('status', ['draft', 'completed', 'rejected', 'cancelled', 'failed', 'needs_review', 'expired']);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintJob[];
    },

    async listPrintJobs() {
      const { data, error } = await adminClient
        .from('print_jobs')
        .select(
          'id, job_number, customer_name, customer_phone, status, payment_status, payment_method, subtotal, final_amount, currency, paper_size, print_mode, print_sides, copies, orientation, scaling, requested_page_range, verified_page_count, physical_sheet_count, pricing_rule_id, price_override_reason, assigned_printer_id, rejection_reason, cancellation_reason, created_at, updated_at, submitted_at, approved_at, completed_at, expires_at'
        )
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as PrintJob),
        subtotal: row.subtotal !== null && row.subtotal !== undefined ? Number(row.subtotal) : null,
        final_amount: row.final_amount !== null && row.final_amount !== undefined ? Number(row.final_amount) : null,
        tracking_token_hash: null,
        draft_upload_secret_hash: null,
        submission_idempotency_key: null,
      }));
    },

    async countActiveFilesForJob(jobId: string) {
      const { count, error } = await adminClient
        .from('print_files')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .is('deleted_at', null);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return count ?? 0;
    },

    async createFileRecord(input) {
      const { data, error } = await adminClient
        .from('print_files')
        .insert({
          job_id: input.jobId,
          storage_bucket: input.storageBucket,
          storage_path: input.storagePath,
          original_filename: input.originalFilename,
          detected_mime_type: input.detectedMimeType,
          file_size_bytes: input.fileSizeBytes,
        })
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintFile;
    },

    async getFilesForJob(jobId: string) {
      const { data, error } = await adminClient.from('print_files').select('*').eq('job_id', jobId);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintFile[];
    },

    async updateFileRecord(fileId: string, patch: Partial<PrintFile>) {
      const { data, error } = await adminClient
        .from('print_files')
        .update(patch)
        .eq('id', fileId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintFile;
    },

    async getPaymentsForJob(jobId: string) {
      const { data, error } = await adminClient
        .from('print_payments')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintPayment[];
    },

    async listAllPayments() {
      const { data, error } = await adminClient
        .from('print_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1500);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return ((data ?? []) as PrintPayment[]).map((p) => ({
        ...p,
        amount: Number(p.amount),
      }));
    },

    async listPricingRules() {
      const { data, error } = await adminClient
        .from('print_pricing_rules')
        .select('*')
        .order('paper_size', { ascending: true })
        .order('print_mode', { ascending: true })
        .order('print_sides', { ascending: true });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return ((data ?? []) as PrintPricingRule[]).map((r) => ({
        ...r,
        rate: Number(r.rate),
        minimum_charge: Number(r.minimum_charge),
      }));
    },

    async getPricingRuleById(ruleId: string) {
      const { data, error } = await adminClient
        .from('print_pricing_rules')
        .select('*')
        .eq('id', ruleId)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      if (!data) return null;
      const rule = data as PrintPricingRule;
      return {
        ...rule,
        rate: Number(rule.rate),
        minimum_charge: Number(rule.minimum_charge),
      };
    },

    async createPricingRule(input) {
      const { data, error } = await adminClient
        .from('print_pricing_rules')
        .insert({
          rule_name: input.ruleName,
          paper_size: input.paperSize,
          print_mode: input.printMode,
          print_sides: input.printSides,
          pricing_unit: input.pricingUnit,
          rate: input.rate,
          minimum_charge: input.minimumCharge,
          is_active: input.isActive,
          ...(input.validFrom ? { valid_from: input.validFrom } : {}),
          valid_until: input.validUntil ?? null,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            409,
            'ACTIVE_PRICING_RULE_CONFLICT',
            'Another active pricing rule already exists for this Paper Size + Print Mode + Sides combination.'
          );
        }
        throw new AppError(500, 'DB_ERROR', error.message);
      }
      const rule = data as PrintPricingRule;
      return {
        ...rule,
        rate: Number(rule.rate),
        minimum_charge: Number(rule.minimum_charge),
      };
    },

    async updatePricingRule(ruleId: string, patch: Partial<PrintPricingRule>) {
      const { data, error } = await adminClient
        .from('print_pricing_rules')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            409,
            'ACTIVE_PRICING_RULE_CONFLICT',
            'Another active pricing rule already exists for this Paper Size + Print Mode + Sides combination.'
          );
        }
        throw new AppError(500, 'DB_ERROR', error.message);
      }
      const rule = data as PrintPricingRule;
      return {
        ...rule,
        rate: Number(rule.rate),
        minimum_charge: Number(rule.minimum_charge),
      };
    },

    async getPaymentById(paymentId: string) {
      const { data, error } = await adminClient.from('print_payments').select('*').eq('id', paymentId).maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPayment | null;
    },

    async findActivePaymentByUtr(utrNormalized: string) {
      const { data, error } = await adminClient
        .from('print_payments')
        .select('*')
        .eq('transaction_reference', utrNormalized)
        .in('payment_status', ['pending_verification', 'paid'])
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPayment | null;
    },

    async createPayment(input) {
      const { data, error } = await adminClient
        .from('print_payments')
        .insert({
          job_id: input.jobId,
          payment_method: input.paymentMethod,
          payment_status: input.paymentStatus,
          amount: input.amount,
          currency: input.currency,
          transaction_reference: input.transactionReference,
          screenshot_storage_bucket: input.screenshotStorageBucket,
          screenshot_storage_path: input.screenshotStoragePath,
          submitted_at: input.submittedAt,
          verified_at: input.verifiedAt,
          verified_by: input.verifiedBy,
          idempotency_key: input.idempotencyKey,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new AppError(409, 'DUPLICATE_PAYMENT_OR_UTR', 'A payment or UTR already exists for this job.');
        }
        throw new AppError(500, 'DB_ERROR', error.message);
      }
      return data as PrintPayment;
    },

    async updatePayment(paymentId: string, patch: Partial<PrintPayment>) {
      const { data, error } = await adminClient
        .from('print_payments')
        .update(patch)
        .eq('id', paymentId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPayment;
    },

    async listPrinters(options) {
      let query = adminClient.from('print_printers').select('*').order('created_at', { ascending: false });
      if (!options?.includeArchived) {
        query = query.is('archived_at', null);
      }
      const { data, error } = await query;
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintPrinter[];
    },

    async getPrinterById(printerId: string) {
      const { data, error } = await adminClient.from('print_printers').select('*').eq('id', printerId).maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPrinter | null;
    },

    async createPrinter(input) {
      const { data, error } = await adminClient
        .from('print_printers')
        .insert({
          printer_name: input.printerName,
          printer_model: input.printerModel,
          system_printer_name: input.systemPrinterName,
          device_id: input.deviceId,
          connection_type: input.connectionType,
          supported_paper_sizes: input.supportedPaperSizes,
          supports_colour: input.supportsColour,
          supports_duplex: input.supportsDuplex,
          capabilities_verified: input.capabilitiesVerified,
          printer_status: input.printerStatus,
          is_enabled: input.isEnabled,
          is_default: input.isDefault,
          discovery_source: input.discoverySource,
          approval_status: input.approvalStatus,
          last_seen_at: input.lastSeenAt,
          last_verified_at: input.lastVerifiedAt,
          audit_notes: input.auditNotes,
        })
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPrinter;
    },

    async updatePrinter(printerId: string, patch: Partial<PrintPrinter>) {
      const { data, error } = await adminClient
        .from('print_printers')
        .update(patch)
        .eq('id', printerId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPrinter;
    },

    async deletePrinter(printerId: string) {
      const { error } = await adminClient.from('print_printers').delete().eq('id', printerId);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
    },

    async countPrinterReferences(printerId: string) {
      const [jobsRes, activeJobsRes, attemptsRes] = await Promise.all([
        adminClient
          .from('print_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_printer_id', printerId),
        adminClient
          .from('print_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_printer_id', printerId)
          .in('status', ['queued', 'claimed', 'downloading', 'printing', 'submitted_to_spooler']),
        adminClient
          .from('print_job_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('printer_id', printerId),
      ]);
      if (jobsRes.error) throw new AppError(500, 'DB_ERROR', jobsRes.error.message);
      if (activeJobsRes.error) throw new AppError(500, 'DB_ERROR', activeJobsRes.error.message);
      if (attemptsRes.error) throw new AppError(500, 'DB_ERROR', attemptsRes.error.message);
      return {
        jobs: jobsRes.count ?? 0,
        activeJobs: activeJobsRes.count ?? 0,
        attempts: attemptsRes.count ?? 0,
      };
    },

    async updatePrinterStatus(printerId: string, patch) {
      const { data, error } = await adminClient
        .from('print_printers')
        .update(patch)
        .eq('id', printerId)
        .select('*')
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintPrinter | null;
    },

    async listDevices() {
      const { data, error } = await adminClient
        .from('print_devices')
        .select('id, device_name, device_status, agent_version, os_version, last_heartbeat_at, approved_at, revoked_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintDevice[];
    },

    async getDeviceById(deviceId: string) {
      const { data, error } = await adminClient
        .from('print_devices')
        .select('*')
        .eq('id', deviceId)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintDevice | null;
    },

    async getDeviceByCredentialHash(hash: string) {
      const { data, error } = await adminClient
        .from('print_devices')
        .select('*')
        .eq('credential_hash', hash)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintDevice | null;
    },

    async createDevice(input) {
      const status = input.activateImmediately ? 'active' : 'pending';
      const nowIso = new Date().toISOString();
      const { data, error } = await adminClient
        .from('print_devices')
        .insert({
          device_name: input.deviceName,
          credential_hash: input.credentialHash,
          os_version: input.osVersion,
          agent_version: input.agentVersion,
          device_status: status,
          approved_at: status === 'active' ? nowIso : null,
        })
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintDevice;
    },

    async updateDevice(deviceId: string, patch: Partial<PrintDevice>) {
      const { data, error } = await adminClient
        .from('print_devices')
        .update(patch)
        .eq('id', deviceId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintDevice;
    },

    async getActiveAttemptsForJob(jobId: string) {
      const { data, error } = await adminClient
        .from('print_job_attempts')
        .select('*')
        .eq('job_id', jobId)
        .is('finished_at', null);
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintJobAttempt[];
    },

    async listAttemptsForJob(jobId: string) {
      const { data, error } = await adminClient
        .from('print_job_attempts')
        .select('*')
        .eq('job_id', jobId)
        .order('attempt_number', { ascending: false });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintJobAttempt[];
    },

    async getAttemptById(attemptId: string) {
      const { data, error } = await adminClient
        .from('print_job_attempts')
        .select('*')
        .eq('id', attemptId)
        .maybeSingle();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJobAttempt | null;
    },

    async updateAttempt(attemptId: string, patch: Partial<PrintJobAttempt>) {
      const { data, error } = await adminClient
        .from('print_job_attempts')
        .update(patch)
        .eq('id', attemptId)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintJobAttempt;
    },

    async releaseJobToQueue(input) {
      const { data, error } = await adminClient.rpc('rpc_release_print_job', {
        p_job_id: input.jobId,
        p_printer_id: input.printerId,
        p_admin_id: input.adminId,
      });
      if (error) {
        const msg = error.message || 'Release failed';
        if (msg.includes('JOB_ALREADY_QUEUED') || msg.includes('ACTIVE_ATTEMPT_EXISTS')) {
          throw new AppError(409, 'JOB_ALREADY_QUEUED', msg);
        }
        if (msg.includes('PAYMENT_NOT_VERIFIED')) {
          throw new AppError(409, 'PAYMENT_NOT_VERIFIED', msg);
        }
        throw new AppError(409, 'RELEASE_FAILED', msg);
      }
      return data as PrintJob;
    },

    async claimNextJob(input) {
      const { data, error } = await adminClient.rpc('rpc_claim_next_print_job', {
        p_device_id: input.deviceId,
        p_lease_seconds: input.leaseSeconds,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new AppError(409, 'CLAIM_FAILED', error.message);
      const rows = (data ?? []) as ClaimedJobResult[];
      return rows[0] ?? null;
    },

    async listRecentEvents(limit = 30, eventTypes?: string[]) {
      let query = adminClient
        .from('print_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (eventTypes && eventTypes.length > 0) {
        query = query.in('event_type', eventTypes);
      }
      const { data, error } = await query;
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintEvent[];
    },

    async listEventsForJob(jobId: string) {
      const { data, error } = await adminClient
        .from('print_events')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return (data ?? []) as PrintEvent[];
    },

    async appendEvent(input) {
      const { data, error } = await adminClient
        .from('print_events')
        .insert({
          job_id: input.jobId,
          actor_type: input.actorType,
          actor_id: input.actorId,
          event_type: input.eventType,
          previous_status: input.previousStatus,
          new_status: input.newStatus,
          metadata: input.metadata ?? {},
        })
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintEvent;
    },

    async createCleanupLog(input) {
      const { data, error } = await adminClient
        .from('print_cleanup_logs')
        .insert(input)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return data as PrintCleanupLog;
    },

    async createSignedUploadUrl(bucket: string, path: string, expiresInSeconds: number) {
      const { data, error } = await adminClient.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) {
        throw new AppError(500, 'STORAGE_SIGNED_URL_FAILED', error?.message ?? 'Failed to create signed upload URL.');
      }
      return { signedUrl: data.signedUrl, token: data.token, expiresInSeconds };
    },

    async createSignedDownloadUrl(bucket: string, path: string, expiresInSeconds: number) {
      const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) {
        throw new AppError(500, 'STORAGE_SIGNED_URL_FAILED', error?.message ?? 'Failed to create signed download URL.');
      }
      return { signedUrl: data.signedUrl, expiresInSeconds };
    },

    async readStorageObject(bucket: string, path: string) {
      const { data, error } = await adminClient.storage.from(bucket).download(path);
      if (error || !data) return null;
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },

    async deleteStorageObject(bucket: string, path: string) {
      const { error } = await adminClient.storage.from(bucket).remove([path]);
      return !error;
    },
  };
}
