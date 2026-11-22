// AC Scan2Print — Decoupled HTTP Request Handlers for All 18 Edge Functions
// Executed identically by Deno Edge Functions (Supabase runtime) and Node 22 automated tests.

import { computeServerPrice } from './pricing.ts';
import {
  buildCorsHeaders,
  constantTimeEqual,
  generateCryptographicToken,
  generateJobNumber,
  getClientIp,
  handleErrorResponse,
  inspectUploadedBytes,
  jsonResponse,
  parseAndValidatePageRange,
  sha256Hex,
  validateDeclaredUploadMeta,
  validateUtrReference,
} from './security.ts';
import {
  assertAgentMayRetry,
  assertCanReleaseToQueue,
  assertTransition,
  canCleanupDeleteFiles,
  isTerminalStatus,
} from './stateMachine.ts';
import {
  computeHardwareAuditSummary,
  normalizeConnectionType,
  normalizeSupportedPaperSizes,
  sanitizeOptionalText,
  triStateToNullableBoolean,
  validatePrinterName,
} from './printers.ts';
import {
  AppError,
  type JobStatus,
  type Orientation,
  type PaperSize,
  type PrintAdminAccount,
  type PrintDevice,
  type PrintJob,
  type PrintMode,
  type PrintPrinter,
  type PrintSides,
  type RuntimeEnv,
  type ScalingMode,
  type Scan2PrintBackendAdapter,
} from './types.ts';

const PAPER_SIZES = new Set<PaperSize>(['A4', 'A3', 'Legal']);
const PRINT_MODES = new Set<PrintMode>(['bw', 'colour']);
const PRINT_SIDES = new Set<PrintSides>(['single', 'duplex']);
const ORIENTATIONS = new Set<Orientation>(['auto', 'portrait', 'landscape']);
const SCALING_MODES = new Set<ScalingMode>(['fit', 'actual']);

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError(400, 'INVALID_JSON', 'Request body must be a JSON object.');
    }
    return data as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'INVALID_JSON', 'Malformed JSON request body.');
  }
}

async function withHttpWrapper(
  req: Request,
  allowedMethod: 'GET' | 'POST' | 'GET_OR_POST',
  env: RuntimeEnv,
  fn: (cors: Record<string, string>) => Promise<Response>
): Promise<Response> {
  const cors = buildCorsHeaders(req, env.ALLOWED_ORIGINS);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  const methodOk =
    allowedMethod === 'GET_OR_POST'
      ? req.method === 'GET' || req.method === 'POST'
      : req.method === allowedMethod;
  if (!methodOk) {
    return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, cors);
  }
  try {
    return await fn(cors);
  } catch (err) {
    return handleErrorResponse(err, cors);
  }
}

async function requireRateLimit(
  adapter: Scan2PrintBackendAdapter,
  key: string,
  maxHits: number,
  windowSeconds: number
): Promise<void> {
  const ok = await adapter.checkRateLimit(key, maxHits, windowSeconds);
  if (!ok) {
    throw new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please wait before trying again.');
  }
}

async function requireMvpAdmin(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv
): Promise<PrintAdminAccount> {
  if (!env.FIREBASE_PROJECT_ID?.trim()) {
    throw new AppError(
      500,
      'SERVER_MISCONFIGURED',
      'FIREBASE_PROJECT_ID is not configured on the backend.'
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing Bearer authorization token.');
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing Bearer authorization token.');
  }

  const verified = await adapter.verifyFirebaseAdminToken(jwt, env);
  if (!verified || !verified.firebaseUid) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired Firebase authorization token.');
  }

  const admin = await adapter.getActiveAdminByFirebaseUid(verified.firebaseUid);
  if (!admin || !admin.is_active) {
    throw new AppError(403, 'FORBIDDEN', 'Active MVP Admin authorization required.');
  }
  return admin;
}

async function requireActiveDevice(
  req: Request,
  adapter: Scan2PrintBackendAdapter
): Promise<PrintDevice> {
  const credential = req.headers.get('x-device-credential')?.trim() ?? '';
  if (!credential || credential.length < 16) {
    throw new AppError(401, 'DEVICE_UNAUTHORIZED', 'Missing device credential.');
  }
  const hash = await sha256Hex(credential);
  const device = await adapter.getDeviceByCredentialHash(hash);
  if (!device) {
    throw new AppError(401, 'DEVICE_UNAUTHORIZED', 'Unknown device credential.');
  }
  if (device.device_status !== 'active') {
    throw new AppError(403, 'DEVICE_NOT_ACTIVE', `Device status '${device.device_status}' cannot execute print operations.`);
  }
  return device;
}

async function resolveCustomerJobByTrackingToken(
  req: Request,
  body: Record<string, unknown> | null,
  adapter: Scan2PrintBackendAdapter
): Promise<PrintJob> {
  const url = new URL(req.url);
  if (url.searchParams.has('token') || url.searchParams.has('tracking_token') || url.searchParams.has('trackingToken')) {
    throw new AppError(
      400,
      'TOKEN_IN_QUERY_DISALLOWED',
      'Tracking tokens must not be passed in URL query strings; send via x-tracking-token header or POST body.'
    );
  }

  const headerToken = req.headers.get('x-tracking-token')?.trim() ?? '';
  const bodyToken = typeof body?.trackingToken === 'string' ? body.trackingToken.trim() : '';
  const token = headerToken || bodyToken;

  if (!token || token.length < 24) {
    throw new AppError(401, 'INVALID_TRACKING_TOKEN', 'Valid tracking token is required.');
  }

  const tokenHash = await sha256Hex(token);
  const job = await adapter.getJobByTrackingHash(tokenHash);
  if (!job || !job.tracking_token_hash || !constantTimeEqual(job.tracking_token_hash, tokenHash)) {
    throw new AppError(401, 'INVALID_TRACKING_TOKEN', 'Invalid tracking token.');
  }

  return job;
}

async function verifyDraftSecret(job: PrintJob, req: Request, body: Record<string, unknown>): Promise<void> {
  const headerSecret = req.headers.get('x-draft-secret')?.trim() ?? '';
  const bodySecret = typeof body.draftUploadSecret === 'string' ? body.draftUploadSecret.trim() : '';
  const secret = headerSecret || bodySecret;

  if (!secret || !job.draft_upload_secret_hash) {
    throw new AppError(401, 'INVALID_DRAFT_SECRET', 'Valid draft upload secret is required.');
  }
  const secretHash = await sha256Hex(secret);
  if (!constantTimeEqual(job.draft_upload_secret_hash, secretHash)) {
    throw new AppError(401, 'INVALID_DRAFT_SECRET', 'Invalid draft upload secret.');
  }
}

// ---------------------------------------------------------------------------
// 1. Customer: create-print-job
// ---------------------------------------------------------------------------
export async function handleCreatePrintJob(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    await requireRateLimit(adapter, `create_job:${getClientIp(req)}`, 30, 60);
    const body = await parseJsonBody(req);

    // Reject client-supplied pricing or workflow state overrides
    for (const forbidden of ['status', 'paymentStatus', 'payment_status', 'subtotal', 'finalAmount', 'final_amount', 'verifiedPageCount']) {
      if (forbidden in body) {
        throw new AppError(400, 'FORBIDDEN_CLIENT_FIELD', `Field '${forbidden}' is server-controlled and cannot be set by client.`);
      }
    }

    const sys = await adapter.getSystemSettings();

    const paperSize = (typeof body.paperSize === 'string' ? body.paperSize : 'A4') as PaperSize;
    const printMode = (typeof body.printMode === 'string' ? body.printMode : 'bw') as PrintMode;
    const printSides = (typeof body.printSides === 'string' ? body.printSides : 'single') as PrintSides;
    const orientation = (typeof body.orientation === 'string' ? body.orientation : 'auto') as Orientation;
    const scaling = (typeof body.scaling === 'string' ? body.scaling : 'fit') as ScalingMode;
    const copies = typeof body.copies === 'number' ? body.copies : Number(body.copies ?? 1);
    const rawRange =
      typeof body.requestedPageRange === 'string' && body.requestedPageRange.trim()
        ? body.requestedPageRange.trim().slice(0, 64)
        : 'all';
    const requestedPageRange = parseAndValidatePageRange(rawRange).normalized;

    if (!PAPER_SIZES.has(paperSize)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported paperSize '${paperSize}'.`);
    }
    if (!PRINT_MODES.has(printMode)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported printMode '${printMode}'.`);
    }
    if (!PRINT_SIDES.has(printSides)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported printSides '${printSides}'.`);
    }
    if (!ORIENTATIONS.has(orientation)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported orientation '${orientation}'.`);
    }
    if (!SCALING_MODES.has(scaling)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported scaling '${scaling}'.`);
    }
    if (!Number.isInteger(copies) || copies < 1 || copies > sys.max_copies) {
      throw new AppError(400, 'INVALID_COPIES', `Copies must be an integer between 1 and ${sys.max_copies}.`);
    }

    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim()
        ? body.customerName.trim().slice(0, 100)
        : null;
    const customerPhone =
      typeof body.customerPhone === 'string' && body.customerPhone.trim()
        ? body.customerPhone.trim().slice(0, 24)
        : null;
    if (customerPhone && !/^[+0-9\s-]{7,20}$/.test(customerPhone)) {
      throw new AppError(400, 'INVALID_PHONE', 'Customer phone number format is invalid.');
    }

    const idempotencyKey =
      typeof body.submissionIdempotencyKey === 'string' && body.submissionIdempotencyKey.trim()
        ? body.submissionIdempotencyKey.trim().slice(0, 128)
        : null;

    if (idempotencyKey) {
      const existing = await adapter.getJobByIdempotencyKey(idempotencyKey);
      if (existing) {
        return jsonResponse(
          200,
          {
            jobId: existing.id,
            jobNumber: existing.job_number,
            status: existing.status,
            idempotentReplay: true,
          },
          cors
        );
      }
    }

    const draftUploadSecret = generateCryptographicToken(32);
    const draftUploadSecretHash = await sha256Hex(draftUploadSecret);
    const jobNumber = generateJobNumber();

    const job = await adapter.createJob({
      jobNumber,
      draftUploadSecretHash,
      customerName,
      customerPhone,
      paperSize,
      printMode,
      printSides,
      copies,
      orientation,
      scaling,
      requestedPageRange,
      submissionIdempotencyKey: idempotencyKey,
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'customer',
      actorId: null,
      eventType: 'job_draft_created',
      previousStatus: null,
      newStatus: 'draft',
      metadata: {
        paper_size: paperSize,
        print_mode: printMode,
        print_sides: printSides,
        copies,
      },
    });

    return jsonResponse(
      201,
      {
        jobId: job.id,
        jobNumber: job.job_number,
        status: job.status,
        draftUploadSecret,
        maxFileSizeBytes: sys.max_file_size_bytes,
        maxFilesPerJob: sys.max_files_per_job,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 2. Customer: create-print-upload-url
// ---------------------------------------------------------------------------
export async function handleCreatePrintUploadUrl(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    await requireRateLimit(adapter, `upload_url:${getClientIp(req)}`, 40, 60);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!jobId) {
      throw new AppError(400, 'MISSING_JOB_ID', 'jobId is required.');
    }

    const job = await adapter.getJobById(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');
    }

    await verifyDraftSecret(job, req, body);

    if (job.status !== 'draft') {
      throw new AppError(409, 'JOB_NOT_DRAFT', 'Files may only be modified while job is in draft state.');
    }

    const action = typeof body.action === 'string' ? body.action.trim() : 'issue';
    if (action === 'remove_file') {
      const fileId = typeof body.fileId === 'string' ? body.fileId.trim() : '';
      if (!fileId) {
        throw new AppError(400, 'MISSING_FILE_ID', 'fileId is required to remove a draft file.');
      }
      const files = await adapter.getFilesForJob(job.id);
      const target = files.find((f) => f.id === fileId && !f.deleted_at);
      if (!target) {
        throw new AppError(404, 'FILE_NOT_FOUND', 'Draft file record not found.');
      }
      await adapter.deleteStorageObject(target.storage_bucket, target.storage_path);
      await adapter.updateFileRecord(target.id, {
        deleted_at: new Date().toISOString(),
      });
      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'customer',
        actorId: null,
        eventType: 'draft_file_removed',
        previousStatus: 'draft',
        newStatus: 'draft',
        metadata: { file_id: target.id },
      });
      return jsonResponse(200, { removed: true, fileId: target.id }, cors);
    }

    const sys = await adapter.getSystemSettings();
    const currentFileCount = await adapter.countActiveFilesForJob(job.id);
    if (currentFileCount >= sys.max_files_per_job) {
      throw new AppError(400, 'MAX_FILES_EXCEEDED', `Maximum ${sys.max_files_per_job} files allowed per job.`);
    }

    const filename = typeof body.filename === 'string' ? body.filename : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    const fileSizeBytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : Number(body.fileSizeBytes);

    const validated = validateDeclaredUploadMeta(
      filename,
      mimeType,
      fileSizeBytes,
      sys.max_file_size_bytes,
      'document'
    );

    const storagePath = `jobs/${job.id}/${crypto.randomUUID()}.${validated.extension}`;
    const fileRecord = await adapter.createFileRecord({
      jobId: job.id,
      storageBucket: 'print-uploads',
      storagePath,
      originalFilename: validated.sanitizedFilename,
      detectedMimeType: validated.normalizedMime,
      fileSizeBytes,
    });

    const signed = await adapter.createSignedUploadUrl('print-uploads', storagePath, 120);

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'customer',
      actorId: null,
      eventType: 'upload_url_issued',
      previousStatus: 'draft',
      newStatus: 'draft',
      metadata: { file_id: fileRecord.id, file_size_bytes: fileSizeBytes },
    });

    return jsonResponse(
      201,
      {
        fileId: fileRecord.id,
        bucket: 'print-uploads',
        storagePath,
        signedUrl: signed.signedUrl,
        expiresInSeconds: signed.expiresInSeconds,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 3. Customer: finalize-print-upload
// ---------------------------------------------------------------------------
export async function handleFinalizePrintUpload(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    await requireRateLimit(adapter, `finalize_upload:${getClientIp(req)}`, 30, 60);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!jobId) {
      throw new AppError(400, 'MISSING_JOB_ID', 'jobId is required.');
    }

    const job = await adapter.getJobById(jobId);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');
    }

    await verifyDraftSecret(job, req, body);

    if (job.status !== 'draft') {
      throw new AppError(409, 'ALREADY_FINALIZED', 'Print job has already been finalized.');
    }

    const sys = await adapter.getSystemSettings();

    for (const forbidden of ['status', 'paymentStatus', 'payment_status', 'subtotal', 'finalAmount', 'final_amount', 'verifiedPageCount']) {
      if (forbidden in body) {
        throw new AppError(400, 'FORBIDDEN_CLIENT_FIELD', `Field '${forbidden}' is server-controlled and cannot be set by client.`);
      }
    }

    const effectivePaperSize = (typeof body.paperSize === 'string' ? body.paperSize : job.paper_size) as PaperSize;
    const effectivePrintMode = (typeof body.printMode === 'string' ? body.printMode : job.print_mode) as PrintMode;
    const effectivePrintSides = (typeof body.printSides === 'string' ? body.printSides : job.print_sides) as PrintSides;
    const effectiveOrientation = (typeof body.orientation === 'string' ? body.orientation : job.orientation) as Orientation;
    const effectiveScaling = (typeof body.scaling === 'string' ? body.scaling : job.scaling) as ScalingMode;
    const effectiveCopies =
      body.copies !== undefined
        ? typeof body.copies === 'number'
          ? body.copies
          : Number(body.copies)
        : job.copies;
    const rawRequestedRange =
      typeof body.requestedPageRange === 'string'
        ? body.requestedPageRange.trim().slice(0, 64) || 'all'
        : job.requested_page_range;
    const effectiveCustomerName =
      body.customerName !== undefined
        ? typeof body.customerName === 'string' && body.customerName.trim()
          ? body.customerName.trim().slice(0, 100)
          : null
        : job.customer_name;
    const effectiveCustomerPhone =
      body.customerPhone !== undefined
        ? typeof body.customerPhone === 'string' && body.customerPhone.trim()
          ? body.customerPhone.trim().slice(0, 24)
          : null
        : job.customer_phone;

    if (!PAPER_SIZES.has(effectivePaperSize)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported paperSize '${effectivePaperSize}'.`);
    }
    if (!PRINT_MODES.has(effectivePrintMode)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported printMode '${effectivePrintMode}'.`);
    }
    if (!PRINT_SIDES.has(effectivePrintSides)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported printSides '${effectivePrintSides}'.`);
    }
    if (!ORIENTATIONS.has(effectiveOrientation)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported orientation '${effectiveOrientation}'.`);
    }
    if (!SCALING_MODES.has(effectiveScaling)) {
      throw new AppError(400, 'INVALID_OPTION', `Unsupported scaling '${effectiveScaling}'.`);
    }
    if (!Number.isInteger(effectiveCopies) || effectiveCopies < 1 || effectiveCopies > sys.max_copies) {
      throw new AppError(400, 'INVALID_COPIES', `Copies must be an integer between 1 and ${sys.max_copies}.`);
    }
    if (effectiveCustomerPhone && !/^[+0-9\s-]{7,20}$/.test(effectiveCustomerPhone)) {
      throw new AppError(400, 'INVALID_PHONE', 'Customer phone number format is invalid.');
    }

    const files = (await adapter.getFilesForJob(job.id)).filter((f) => !f.deleted_at);
    if (files.length === 0) {
      throw new AppError(400, 'NO_FILES_UPLOADED', 'At least one uploaded document is required before finalizing.');
    }
    if (files.length > sys.max_files_per_job) {
      throw new AppError(400, 'MAX_FILES_EXCEEDED', `Maximum ${sys.max_files_per_job} files allowed per job.`);
    }

    let totalVerifiedPages = 0;

    for (const file of files) {
      const rawBytes = await adapter.readStorageObject(file.storage_bucket, file.storage_path);
      if (!rawBytes) {
        throw new AppError(400, 'UPLOAD_MISSING', `Uploaded object for file '${file.original_filename}' was not found in storage.`);
      }

      try {
        const expectedMime = file.detected_mime_type ?? 'application/pdf';
        const inspected = inspectUploadedBytes(rawBytes, expectedMime, sys.max_file_size_bytes, 'document');
        const checksum = await sha256Hex(rawBytes);

        await adapter.updateFileRecord(file.id, {
          detected_mime_type: inspected.detectedMime,
          file_size_bytes: rawBytes.byteLength,
          sha256_checksum: checksum,
          detected_page_count: inspected.pageCount,
          validation_status: 'valid',
          validation_error: null,
        });

        totalVerifiedPages += inspected.pageCount;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'File validation failed.';
        await adapter.updateFileRecord(file.id, {
          validation_status: 'invalid',
          validation_error: msg,
          deleted_at: new Date().toISOString(),
        });
        // Immediately purge invalid/spoofed object from private bucket
        await adapter.deleteStorageObject(file.storage_bucket, file.storage_path);
        await adapter.appendEvent({
          jobId: job.id,
          actorType: 'system',
          actorId: null,
          eventType: 'file_validation_failed',
          previousStatus: 'draft',
          newStatus: 'draft',
          metadata: { file_id: file.id, error: msg },
        });
        throw err;
      }
    }

    const parsedRange = parseAndValidatePageRange(rawRequestedRange, totalVerifiedPages);
    const billablePagesPerCopy = parsedRange.selectedPageCount ?? totalVerifiedPages;

    // Authoritative server-side pricing lookup (never trusts client amounts; fails safely if unconfigured)
    const pricingRule = await adapter.findActivePricingRule({
      paperSize: effectivePaperSize,
      printMode: effectivePrintMode,
      printSides: effectivePrintSides,
    });

    const price = computeServerPrice({
      paperSize: effectivePaperSize,
      printMode: effectivePrintMode,
      printSides: effectivePrintSides,
      verifiedPageCount: billablePagesPerCopy,
      copies: effectiveCopies,
      rule: pricingRule,
    });

    assertTransition('draft', 'submitted');

    const trackingToken = generateCryptographicToken(32);
    const trackingTokenHash = await sha256Hex(trackingToken);
    const nowIso = new Date().toISOString();

    const updated = await adapter.updateJob(job.id, {
      status: 'submitted',
      tracking_token_hash: trackingTokenHash,
      draft_upload_secret_hash: null,
      paper_size: effectivePaperSize,
      print_mode: effectivePrintMode,
      print_sides: effectivePrintSides,
      copies: effectiveCopies,
      orientation: effectiveOrientation,
      scaling: effectiveScaling,
      requested_page_range: parsedRange.normalized,
      customer_name: effectiveCustomerName,
      customer_phone: effectiveCustomerPhone,
      verified_page_count: price.verifiedPageCount,
      physical_sheet_count: price.physicalSheetCount,
      pricing_rule_id: price.pricingRuleId,
      subtotal: price.subtotal,
      final_amount: price.finalAmount,
      submitted_at: nowIso,
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'customer',
      actorId: null,
      eventType: 'job_submitted',
      previousStatus: 'draft',
      newStatus: 'submitted',
      metadata: {
        verified_page_count: price.verifiedPageCount,
        physical_sheet_count: price.physicalSheetCount,
        final_amount: price.finalAmount,
        pricing_rule_id: price.pricingRuleId,
      },
    });

    return jsonResponse(
      200,
      {
        jobId: updated.id,
        jobNumber: updated.job_number,
        status: updated.status,
        paymentStatus: updated.payment_status,
        verifiedPageCount: updated.verified_page_count,
        physicalSheetCount: updated.physical_sheet_count,
        subtotal: updated.subtotal,
        finalAmount: updated.final_amount,
        currency: updated.currency,
        trackingToken,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 4. Customer: get-print-job-status
// ---------------------------------------------------------------------------
export async function handleGetPrintJobStatus(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'GET_OR_POST', env, async (cors) => {
    await requireRateLimit(adapter, `job_status:${getClientIp(req)}`, 60, 60);
    const body = req.method === 'POST' ? await parseJsonBody(req) : null;
    const job = await resolveCustomerJobByTrackingToken(req, body, adapter);

    const files = (await adapter.getFilesForJob(job.id)).filter((f) => !f.deleted_at);
    const payments = await adapter.getPaymentsForJob(job.id);
    const latestPayment = payments[payments.length - 1] ?? null;

    return jsonResponse(
      200,
      {
        jobId: job.id,
        jobNumber: job.job_number,
        status: job.status,
        paymentStatus: job.payment_status,
        paymentMethod: job.payment_method,
        paperSize: job.paper_size,
        printMode: job.print_mode,
        printSides: job.print_sides,
        copies: job.copies,
        verifiedPageCount: job.verified_page_count,
        physicalSheetCount: job.physical_sheet_count,
        subtotal: job.subtotal,
        finalAmount: job.final_amount,
        currency: job.currency,
        rejectionReason: job.rejection_reason,
        submittedAt: job.submitted_at,
        approvedAt: job.approved_at,
        completedAt: job.completed_at,
        files: files.map((f) => ({
          id: f.id,
          originalFilename: f.original_filename,
          fileSizeBytes: f.file_size_bytes,
          detectedPageCount: f.detected_page_count,
          validationStatus: f.validation_status,
        })),
        payment: latestPayment
          ? {
              id: latestPayment.id,
              method: latestPayment.payment_method,
              status: latestPayment.payment_status,
              amount: latestPayment.amount,
              submittedAt: latestPayment.submitted_at,
              verifiedAt: latestPayment.verified_at,
              rejectionReason: latestPayment.rejection_reason,
            }
          : null,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Customer: get-public-payment-settings
// ---------------------------------------------------------------------------
export async function handleGetPublicPaymentSettings(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'GET', env, async (cors) => {
    await requireRateLimit(adapter, `public_payment_settings:${getClientIp(req)}`, 60, 60);
    const settings = await adapter.getPaymentSettings();

    let upiQrSignedUrl: string | null = null;
    if (settings.upi_enabled && settings.upi_qr_storage_path) {
      const signed = await adapter.createSignedDownloadUrl(
        settings.upi_qr_storage_bucket,
        settings.upi_qr_storage_path,
        300
      );
      upiQrSignedUrl = signed.signedUrl;
    }

    let portalConfig: Record<string, unknown> | undefined;
    if (adapter.getPublicPortalBootstrapData) {
      const boot = await adapter.getPublicPortalBootstrapData();
      const nowMs = Date.now();
      const eligiblePrinters = boot.printers.filter(
        (p) =>
          !p.archived_at &&
          p.is_enabled &&
          (p.approval_status === 'manual' || p.approval_status === 'approved') &&
          p.printer_status !== 'disabled'
      );

      const configuredPrinterCount = eligiblePrinters.length;
      const verifiedPrinterCount = eligiblePrinters.filter((p) => p.capabilities_verified).length;
      const colourSupported: 'yes' | 'no' | 'unknown' = eligiblePrinters.some((p) => p.supports_colour === true)
        ? 'yes'
        : configuredPrinterCount > 0 && eligiblePrinters.every((p) => p.supports_colour === false)
          ? 'no'
          : 'unknown';
      const duplexSupported: 'yes' | 'no' | 'unknown' = eligiblePrinters.some((p) => p.supports_duplex === true)
        ? 'yes'
        : configuredPrinterCount > 0 && eligiblePrinters.every((p) => p.supports_duplex === false)
          ? 'no'
          : 'unknown';

      const sizeSet = new Set<PaperSize>();
      for (const printer of eligiblePrinters) {
        for (const sz of printer.supported_paper_sizes ?? []) {
          if (PAPER_SIZES.has(sz as PaperSize)) {
            sizeSet.add(sz as PaperSize);
          }
        }
      }
      const orderedPaperSizes: PaperSize[] = (['A4', 'Legal', 'A3'] as const).filter((s) => sizeSet.has(s));
      const paperSizesKnown = orderedPaperSizes.length > 0;
      const capabilitiesKnown =
        configuredPrinterCount > 0 &&
        (verifiedPrinterCount > 0 ||
          colourSupported !== 'unknown' ||
          duplexSupported !== 'unknown' ||
          paperSizesKnown);

      const activeRules = boot.pricingRules
        .filter((r) => {
          if (!r.is_active) return false;
          const validFrom = Date.parse(r.valid_from);
          if (Number.isFinite(validFrom) && nowMs < validFrom) return false;
          if (r.valid_until) {
            const validUntil = Date.parse(r.valid_until);
            if (Number.isFinite(validUntil) && nowMs > validUntil) return false;
          }
          return true;
        })
        .map((r) => ({
          id: r.id,
          ruleName: r.rule_name,
          paperSize: r.paper_size,
          printMode: r.print_mode,
          printSides: r.print_sides,
          pricingUnit: r.pricing_unit,
          rate: Number(r.rate),
          minimumCharge: Number(r.minimum_charge),
          isMockSample: false,
        }));

      portalConfig = {
        systemLimits: {
          maxFilesPerJob: boot.systemSettings.max_files_per_job,
          maxFileSizeBytes: boot.systemSettings.max_file_size_bytes,
          maxCopies: boot.systemSettings.max_copies,
          draftRetentionHours: boot.systemSettings.draft_retention_hours,
          completedRetentionHours: boot.systemSettings.completed_retention_hours,
        },
        printerCapabilities: {
          configuredPrinterCount,
          verifiedPrinterCount,
          capabilitiesKnown,
          colourSupported,
          duplexSupported,
          paperSizesKnown,
          supportedPaperSizes: orderedPaperSizes,
        },
        pricingRules: activeRules,
      };
    }

    return jsonResponse(
      200,
      {
        upiEnabled: settings.upi_enabled,
        upiId: settings.upi_enabled ? settings.upi_id : null,
        upiQrSignedUrl,
        displayName: settings.display_name,
        paymentInstructions: settings.payment_instructions,
        cashEnabled: true,
        ...(portalConfig ? { portalConfig } : {}),
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 6. Customer: submit-upi-payment (Supports UPI UTR + evidence upload OR Cash selection)
// ---------------------------------------------------------------------------
export async function handleSubmitUpiPayment(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    await requireRateLimit(adapter, `submit_payment:${getClientIp(req)}`, 30, 60);
    const body = await parseJsonBody(req);

    // Explicitly block any client attempt to mark payment paid
    if ('paymentStatus' in body || 'payment_status' in body || 'verifiedBy' in body || 'verified_at' in body) {
      throw new AppError(403, 'FORBIDDEN_PAYMENT_STATUS_OVERRIDE', 'Customers cannot mark payments as paid or verified.');
    }

    const job = await resolveCustomerJobByTrackingToken(req, body, adapter);

    if (isTerminalStatus(job.status)) {
      throw new AppError(409, 'JOB_TERMINAL', `Cannot submit payment for job in '${job.status}' state.`);
    }
    if (job.payment_status === 'paid') {
      throw new AppError(409, 'ALREADY_PAID', 'Job payment is already verified as paid.');
    }

    const action = typeof body.action === 'string' ? body.action : 'submit';

    if (action === 'prepare_evidence_upload') {
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      const fileSizeBytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : Number(body.fileSizeBytes);

      const validated = validateDeclaredUploadMeta(
        filename,
        mimeType,
        fileSizeBytes,
        10 * 1024 * 1024,
        'evidence'
      );

      const evidenceStoragePath = `evidence/${job.id}/${crypto.randomUUID()}.${validated.extension}`;
      const signed = await adapter.createSignedUploadUrl('payment-evidence', evidenceStoragePath, 120);

      return jsonResponse(
        201,
        {
          bucket: 'payment-evidence',
          evidenceStoragePath,
          expectedMimeType: validated.normalizedMime,
          signedUrl: signed.signedUrl,
          expiresInSeconds: signed.expiresInSeconds,
        },
        cors
      );
    }

    if (job.final_amount === null) {
      throw new AppError(409, 'AMOUNT_NOT_CALCULATED', 'Server pricing has not been calculated for this job yet.');
    }

    const paymentMethod = body.paymentMethod === 'cash' ? 'cash' : 'upi';

    if (paymentMethod === 'cash') {
      if (job.payment_status === 'pending_verification') {
        throw new AppError(409, 'PAYMENT_PENDING_VERIFICATION', 'A UPI verification is already pending for this job.');
      }
      const nextStatus: JobStatus =
        job.status === 'submitted' || job.status === 'under_review' ? 'awaiting_payment' : job.status;
      if (nextStatus !== job.status) {
        assertTransition(job.status, nextStatus);
      }

      const updated = await adapter.updateJob(job.id, {
        payment_method: 'cash',
        payment_status: 'unpaid',
        status: nextStatus,
      });

      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'customer',
        actorId: null,
        eventType: 'cash_payment_selected',
        previousStatus: job.status,
        newStatus: updated.status,
        metadata: { amount: job.final_amount },
      });

      return jsonResponse(
        200,
        {
          jobId: updated.id,
          status: updated.status,
          paymentMethod: 'cash',
          paymentStatus: 'unpaid',
          amount: updated.final_amount,
        },
        cors
      );
    }

    // UPI submission
    const settings = await adapter.getPaymentSettings();
    if (!settings.upi_enabled || !settings.upi_id) {
      throw new AppError(409, 'UPI_NOT_CONFIGURED', 'UPI payments are currently disabled or not configured.');
    }

    if (job.payment_status === 'pending_verification') {
      throw new AppError(409, 'PAYMENT_ALREADY_PENDING', 'A payment verification submission is already pending for this job.');
    }

    const utr = validateUtrReference(typeof body.transactionReference === 'string' ? body.transactionReference : '');
    const duplicateUtr = await adapter.findActivePaymentByUtr(utr);
    if (duplicateUtr) {
      throw new AppError(409, 'DUPLICATE_UTR', 'This transaction reference (UTR) has already been submitted.');
    }

    let evidenceStoragePath: string | null = null;
    if (typeof body.evidenceStoragePath === 'string' && body.evidenceStoragePath.trim()) {
      const candidatePath = body.evidenceStoragePath.trim();
      if (!candidatePath.startsWith(`evidence/${job.id}/`)) {
        throw new AppError(403, 'INVALID_EVIDENCE_PATH', 'Payment evidence path does not belong to this job.');
      }
      const bytes = await adapter.readStorageObject('payment-evidence', candidatePath);
      if (!bytes) {
        throw new AppError(400, 'EVIDENCE_NOT_FOUND', 'Uploaded payment screenshot not found in storage.');
      }
      try {
        const expectedMime =
          typeof body.evidenceMimeType === 'string' && body.evidenceMimeType
            ? body.evidenceMimeType.trim().toLowerCase()
            : candidatePath.endsWith('.png')
              ? 'image/png'
              : candidatePath.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg';
        inspectUploadedBytes(bytes, expectedMime, 10 * 1024 * 1024, 'evidence');
      } catch (err) {
        await adapter.deleteStorageObject('payment-evidence', candidatePath);
        throw err;
      }
      evidenceStoragePath = candidatePath;
    }

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 128)
        : null;

    const nowIso = new Date().toISOString();
    const payment = await adapter.createPayment({
      jobId: job.id,
      paymentMethod: 'upi',
      paymentStatus: 'pending_verification',
      amount: job.final_amount,
      currency: job.currency,
      transactionReference: utr,
      screenshotStorageBucket: evidenceStoragePath ? 'payment-evidence' : null,
      screenshotStoragePath: evidenceStoragePath,
      submittedAt: nowIso,
      verifiedAt: null,
      verifiedBy: null,
      idempotencyKey,
    });

    const nextStatus: JobStatus =
      job.status === 'submitted' || job.status === 'under_review' ? 'awaiting_payment' : job.status;
    if (nextStatus !== job.status) {
      assertTransition(job.status, nextStatus);
    }

    const updatedJob = await adapter.updateJob(job.id, {
      payment_method: 'upi',
      payment_status: 'pending_verification',
      status: nextStatus,
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'customer',
      actorId: null,
      eventType: 'upi_payment_submitted',
      previousStatus: job.status,
      newStatus: updatedJob.status,
      metadata: { payment_id: payment.id, amount: payment.amount },
    });

    return jsonResponse(
      201,
      {
        paymentId: payment.id,
        jobId: updatedJob.id,
        status: updatedJob.status,
        paymentMethod: 'upi',
        paymentStatus: 'pending_verification',
        amount: payment.amount,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 7. Admin: admin-bootstrap (Strict single MVP Admin enforcement)
// ---------------------------------------------------------------------------
export async function handleAdminBootstrap(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const expectedSecret = env.ADMIN_BOOTSTRAP_SECRET?.trim() ?? '';
    if (!expectedSecret) {
      throw new AppError(503, 'BOOTSTRAP_NOT_CONFIGURED', 'ADMIN_BOOTSTRAP_SECRET is not configured on the server.');
    }

    const providedSecret = req.headers.get('x-admin-bootstrap-secret')?.trim() ?? '';
    if (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
      throw new AppError(403, 'INVALID_BOOTSTRAP_SECRET', 'Invalid admin bootstrap secret.');
    }

    if (!env.FIREBASE_PROJECT_ID?.trim()) {
      throw new AppError(
        500,
        'SERVER_MISCONFIGURED',
        'FIREBASE_PROJECT_ID is not configured on the backend.'
      );
    }

    const existingCount = await adapter.countAdminAccounts();
    if (existingCount > 0) {
      throw new AppError(
        409,
        'SINGLE_ADMIN_ALREADY_EXISTS',
        'MVP permits strictly ONE Admin account and it has already been bootstrapped.'
      );
    }

    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Firebase Admin Bearer ID token is required to bootstrap.');
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Firebase Admin Bearer ID token is required to bootstrap.');
    }

    const verified = await adapter.verifyFirebaseAdminToken(idToken, env);
    if (!verified || !verified.firebaseUid) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.');
    }

    const body = await parseJsonBody(req);
    const bodyEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const email = (verified.email ?? bodyEmail).trim().toLowerCase();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (bodyEmail && verified.email && bodyEmail !== verified.email.toLowerCase()) {
      throw new AppError(400, 'EMAIL_MISMATCH', 'Submitted email does not match verified Firebase ID token email.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(400, 'INVALID_EMAIL', 'Valid admin email address is required.');
    }
    if (!fullName || fullName.length < 2) {
      throw new AppError(400, 'INVALID_NAME', 'Admin fullName is required.');
    }

    // Reject spoofed UID overrides that disagree with the verified Firebase ID token subject
    const clientFirebaseUid = typeof body.firebaseUid === 'string' ? body.firebaseUid.trim() : '';
    if (clientFirebaseUid && clientFirebaseUid !== verified.firebaseUid) {
      throw new AppError(403, 'UID_MISMATCH', 'firebaseUid must come exclusively from the verified Firebase ID token.');
    }

    const admin = await adapter.createAdminAccount({
      firebaseUid: verified.firebaseUid,
      email,
      fullName,
    });

    await adapter.appendEvent({
      jobId: null,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'admin_bootstrapped',
      previousStatus: null,
      newStatus: null,
      metadata: { email: admin.email, auth_provider: 'firebase' },
    });

    return jsonResponse(
      201,
      {
        adminId: admin.id,
        firebaseUid: admin.firebase_uid,
        email: admin.email,
        fullName: admin.full_name,
        isActive: admin.is_active,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 8. Admin: admin-review-print-job
// ---------------------------------------------------------------------------
export async function handleAdminReviewPrintJob(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!jobId) throw new AppError(400, 'MISSING_JOB_ID', 'jobId is required.');

    const job = await adapter.getJobById(jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');

    if (action === 'override_price') {
      if (isTerminalStatus(job.status) || job.payment_status === 'paid') {
        throw new AppError(409, 'PRICE_LOCKED', 'Cannot override price after payment or terminal job completion.');
      }
      const newAmount = typeof body.finalAmount === 'number' ? body.finalAmount : Number(body.finalAmount);
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!Number.isFinite(newAmount) || newAmount < 0) {
        throw new AppError(400, 'INVALID_AMOUNT', 'finalAmount must be a non-negative number.');
      }
      if (reason.length < 5) {
        throw new AppError(400, 'OVERRIDE_REASON_REQUIRED', 'Price override requires an explanation of at least 5 characters.');
      }
      const rounded = Math.round(newAmount * 100) / 100;
      const updated = await adapter.updateJob(job.id, {
        final_amount: rounded,
        price_override_reason: reason,
      });
      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'admin_price_overridden',
        previousStatus: job.status,
        newStatus: job.status,
        metadata: { previous_amount: job.final_amount, new_amount: rounded, reason },
      });
      return jsonResponse(200, { job: updated }, cors);
    }

    const actionToStatus: Record<string, JobStatus> = {
      start_review: 'under_review',
      request_payment: 'awaiting_payment',
      approve: 'approved',
      reject: 'rejected',
      cancel: 'cancelled',
    };

    const nextStatus = actionToStatus[action];
    if (!nextStatus) {
      throw new AppError(400, 'INVALID_ACTION', `Unsupported review action '${action}'.`);
    }

    assertTransition(job.status, nextStatus);

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (nextStatus === 'rejected' && reason.length < 3) {
      throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'A rejection reason is required.');
    }

    const nowIso = new Date().toISOString();
    const patch: Partial<PrintJob> = {
      status: nextStatus,
      ...(nextStatus === 'approved' ? { approved_at: nowIso } : {}),
      ...(nextStatus === 'rejected' ? { rejection_reason: reason } : {}),
      ...(nextStatus === 'cancelled' ? { cancellation_reason: reason || 'Cancelled by Admin' } : {}),
    };

    const updated = await adapter.updateJob(job.id, patch);

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'admin',
      actorId: admin.id,
      eventType: `admin_${action}`,
      previousStatus: job.status,
      newStatus: nextStatus,
      metadata: reason ? { reason } : {},
    });

    return jsonResponse(200, { jobId: updated.id, status: updated.status, approvedAt: updated.approved_at }, cors);
  });
}

// ---------------------------------------------------------------------------
// 9. Admin: admin-verify-payment
// ---------------------------------------------------------------------------
export async function handleAdminVerifyPayment(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    if (!paymentId || !decision) {
      throw new AppError(400, 'INVALID_INPUT', 'paymentId and decision (approve|reject) are required.');
    }

    const payment = await adapter.getPaymentById(paymentId);
    if (!payment) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    }
    if (payment.payment_status !== 'pending_verification') {
      throw new AppError(
        409,
        'PAYMENT_NOT_PENDING',
        `Only payments in 'pending_verification' can be verified (current='${payment.payment_status}').`
      );
    }

    const job = await adapter.getJobById(payment.job_id);
    if (!job) {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Associated job not found.');
    }

    const nowIso = new Date().toISOString();

    if (decision === 'approve') {
      const updatedPayment = await adapter.updatePayment(payment.id, {
        payment_status: 'paid',
        verified_by: admin.id,
        verified_at: nowIso,
        rejection_reason: null,
      });

      const updatedJob = await adapter.updateJob(job.id, {
        payment_status: 'paid',
        payment_method: payment.payment_method,
      });

      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'payment_verified_paid',
        previousStatus: job.status,
        newStatus: updatedJob.status,
        metadata: { payment_id: payment.id, method: payment.payment_method, amount: payment.amount },
      });

      return jsonResponse(
        200,
        { paymentId: updatedPayment.id, paymentStatus: updatedPayment.payment_status, jobPaymentStatus: updatedJob.payment_status },
        cors
      );
    }

    // Reject verification -> return job to unpaid so customer can re-submit valid UTR or pay cash
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'Payment rejection requires a reason.');
    }

    const updatedPayment = await adapter.updatePayment(payment.id, {
      payment_status: 'unpaid',
      verified_by: admin.id,
      verified_at: nowIso,
      rejection_reason: reason,
    });

    const updatedJob = await adapter.updateJob(job.id, {
      payment_status: 'unpaid',
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'payment_verification_rejected',
      previousStatus: job.status,
      newStatus: updatedJob.status,
      metadata: { payment_id: payment.id, reason },
    });

    return jsonResponse(
      200,
      { paymentId: updatedPayment.id, paymentStatus: updatedPayment.payment_status, jobPaymentStatus: updatedJob.payment_status },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 10. Admin: admin-confirm-cash
// ---------------------------------------------------------------------------
export async function handleAdminConfirmCash(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!jobId) throw new AppError(400, 'MISSING_JOB_ID', 'jobId is required.');

    const job = await adapter.getJobById(jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');

    if (isTerminalStatus(job.status)) {
      throw new AppError(409, 'JOB_TERMINAL', `Cannot confirm cash for job in '${job.status}' state.`);
    }
    if (job.payment_status === 'paid') {
      throw new AppError(409, 'ALREADY_PAID', 'Job payment is already verified as paid.');
    }
    if (job.payment_status === 'pending_verification') {
      throw new AppError(409, 'PENDING_UPI_EXISTS', 'Resolve the pending UPI verification before confirming cash.');
    }
    if (job.final_amount === null) {
      throw new AppError(409, 'AMOUNT_NOT_CALCULATED', 'Job pricing must be computed before confirming cash.');
    }

    const nowIso = new Date().toISOString();
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 128)
        : null;

    const payment = await adapter.createPayment({
      jobId: job.id,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      amount: job.final_amount,
      currency: job.currency,
      transactionReference: null,
      screenshotStorageBucket: null,
      screenshotStoragePath: null,
      submittedAt: nowIso,
      verifiedAt: nowIso,
      verifiedBy: admin.id,
      idempotencyKey,
    });

    const updatedJob = await adapter.updateJob(job.id, {
      payment_method: 'cash',
      payment_status: 'paid',
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'cash_payment_confirmed',
      previousStatus: job.status,
      newStatus: updatedJob.status,
      metadata: { payment_id: payment.id, amount: payment.amount },
    });

    return jsonResponse(
      200,
      {
        paymentId: payment.id,
        jobId: updatedJob.id,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        amount: payment.amount,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 11. Admin: admin-update-payment-settings
// ---------------------------------------------------------------------------
export async function handleAdminUpdatePaymentSettings(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'GET_OR_POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    if (req.method === 'GET') {
      const settings = await adapter.getPaymentSettings();
      return jsonResponse(
        200,
        {
          authorized: true,
          admin: {
            id: admin.id,
            firebaseUid: admin.firebase_uid,
            email: admin.email,
            fullName: admin.full_name,
            isActive: admin.is_active,
          },
          settings,
        },
        cors
      );
    }

    const body = await parseJsonBody(req);
    const action = typeof body.action === 'string' ? body.action : 'update';

    if (action === 'prepare_qr_upload') {
      const filename = typeof body.filename === 'string' ? body.filename : '';
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      const fileSizeBytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : Number(body.fileSizeBytes);
      const validated = validateDeclaredUploadMeta(filename, mimeType, fileSizeBytes, 5 * 1024 * 1024, 'qr');

      const storagePath = `upi-qr/${crypto.randomUUID()}.${validated.extension}`;
      const signed = await adapter.createSignedUploadUrl('payment-assets', storagePath, 120);
      return jsonResponse(
        201,
        {
          bucket: 'payment-assets',
          storagePath,
          signedUrl: signed.signedUrl,
          expiresInSeconds: signed.expiresInSeconds,
        },
        cors
      );
    }

    const current = await adapter.getPaymentSettings();
    const upiEnabled = typeof body.upiEnabled === 'boolean' ? body.upiEnabled : current.upi_enabled;
    const upiId =
      body.upiId === null
        ? null
        : typeof body.upiId === 'string'
          ? body.upiId.trim() || null
          : current.upi_id;

    if (upiId !== null && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$/.test(upiId)) {
      throw new AppError(400, 'INVALID_UPI_ID', 'UPI ID must follow standard handle@bank format.');
    }
    if (upiEnabled && !upiId) {
      throw new AppError(400, 'UPI_ID_REQUIRED', 'Cannot enable UPI without setting a valid UPI ID.');
    }

    let upiQrStoragePath = current.upi_qr_storage_path;
    if (body.upiQrStoragePath === null) {
      upiQrStoragePath = null;
    } else if (typeof body.upiQrStoragePath === 'string' && body.upiQrStoragePath.trim()) {
      const candidate = body.upiQrStoragePath.trim();
      const bytes = await adapter.readStorageObject('payment-assets', candidate);
      if (!bytes) {
        throw new AppError(400, 'QR_OBJECT_MISSING', 'Uploaded QR image object not found in payment-assets bucket.');
      }
      const expectedMime = candidate.endsWith('.png')
        ? 'image/png'
        : candidate.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      inspectUploadedBytes(bytes, expectedMime, 5 * 1024 * 1024, 'qr');
      upiQrStoragePath = candidate;
    }

    const updated = await adapter.updatePaymentSettings({
      upi_enabled: upiEnabled,
      upi_id: upiId,
      upi_qr_storage_path: upiQrStoragePath,
      display_name:
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim().slice(0, 80)
          : current.display_name,
      payment_instructions:
        typeof body.paymentInstructions === 'string'
          ? body.paymentInstructions.trim().slice(0, 500)
          : current.payment_instructions,
      updated_by: admin.id,
    });

    await adapter.appendEvent({
      jobId: null,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'payment_settings_updated',
      previousStatus: null,
      newStatus: null,
      metadata: { upi_enabled: updated.upi_enabled, has_qr: Boolean(updated.upi_qr_storage_path) },
    });

    return jsonResponse(200, { settings: updated }, cors);
  });
}

// ---------------------------------------------------------------------------
// 12. Admin: admin-release-print-job
// ---------------------------------------------------------------------------
export async function handleAdminReleasePrintJob(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    const printerId = typeof body.printerId === 'string' ? body.printerId.trim() : '';
    if (!jobId || !printerId) {
      throw new AppError(400, 'MISSING_FIELDS', 'jobId and printerId are required.');
    }

    const job = await adapter.getJobById(jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');

    assertCanReleaseToQueue(job);

    const printer = await adapter.getPrinterById(printerId);
    if (!printer || !printer.is_enabled || printer.printer_status === 'disabled') {
      throw new AppError(409, 'PRINTER_UNAVAILABLE', 'Selected printer is missing or disabled.');
    }

    const activeAttempts = await adapter.getActiveAttemptsForJob(job.id);
    if (activeAttempts.length > 0) {
      throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'An active print attempt already exists for this job.');
    }

    const released = await adapter.releaseJobToQueue({
      jobId: job.id,
      printerId: printer.id,
      adminId: admin.id,
    });

    return jsonResponse(
      200,
      {
        jobId: released.id,
        status: released.status,
        assignedPrinterId: released.assigned_printer_id,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 13. Admin: admin-retry-print-job (Explicit Admin reconciliation / manual retry)
// ---------------------------------------------------------------------------
export async function handleAdminRetryPrintJob(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    const action = typeof body.action === 'string' ? body.action : 'retry';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!jobId) throw new AppError(400, 'MISSING_JOB_ID', 'jobId is required.');
    if (reason.length < 3) {
      throw new AppError(400, 'REASON_REQUIRED', 'Admin reconciliation/retry requires an explicit reason.');
    }

    const job = await adapter.getJobById(jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Print job not found.');

    if (job.status !== 'failed' && job.status !== 'needs_review') {
      throw new AppError(
        409,
        'INVALID_RETRY_STATE',
        `Only 'failed' or 'needs_review' jobs may be retried or reconciled (current='${job.status}').`
      );
    }

    const activeAttempts = await adapter.getActiveAttemptsForJob(job.id);
    if (activeAttempts.length > 0) {
      throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'Cannot retry/reconcile while an active attempt is still open.');
    }

    if (action === 'mark_completed') {
      assertTransition(job.status, 'completed');
      const nowIso = new Date().toISOString();
      const updated = await adapter.updateJob(job.id, { status: 'completed', completed_at: nowIso });
      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'admin_reconciled_completed',
        previousStatus: job.status,
        newStatus: 'completed',
        metadata: { reason },
      });
      return jsonResponse(200, { jobId: updated.id, status: updated.status }, cors);
    }

    if (action === 'cancel') {
      assertTransition(job.status, 'cancelled');
      const updated = await adapter.updateJob(job.id, { status: 'cancelled', cancellation_reason: reason });
      await adapter.appendEvent({
        jobId: job.id,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'admin_cancelled_failed_job',
        previousStatus: job.status,
        newStatus: 'cancelled',
        metadata: { reason },
      });
      return jsonResponse(200, { jobId: updated.id, status: updated.status }, cors);
    }

    // Explicit Admin retry back to queued
    if (job.payment_status !== 'paid') {
      throw new AppError(409, 'PAYMENT_NOT_VERIFIED', 'Cannot requeue job unless payment_status is paid.');
    }
    const printerId =
      typeof body.printerId === 'string' && body.printerId.trim()
        ? body.printerId.trim()
        : job.assigned_printer_id ?? '';
    if (!printerId) {
      throw new AppError(400, 'MISSING_PRINTER_ID', 'printerId is required to requeue job.');
    }
    const printer = await adapter.getPrinterById(printerId);
    if (!printer || !printer.is_enabled || printer.printer_status === 'disabled') {
      throw new AppError(409, 'PRINTER_UNAVAILABLE', 'Assigned printer is unavailable or disabled.');
    }

    assertTransition(job.status, 'queued');
    const updated = await adapter.updateJob(job.id, {
      status: 'queued',
      assigned_printer_id: printer.id,
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'admin_manual_retry_authorized',
      previousStatus: job.status,
      newStatus: 'queued',
      metadata: { reason, printer_id: printer.id },
    });

    return jsonResponse(200, { jobId: updated.id, status: updated.status, assignedPrinterId: updated.assigned_printer_id }, cors);
  });
}

// ---------------------------------------------------------------------------
// 14. Retention Cleanup: cleanup-expired-print-files
// ---------------------------------------------------------------------------
export async function handleCleanupExpiredPrintFiles(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const cronSecret = req.headers.get('x-cron-secret')?.trim() ?? '';
    const expectedCron = env.CRON_SECRET?.trim() ?? '';
    let executedBy = 'cron';

    if (cronSecret && expectedCron && constantTimeEqual(cronSecret, expectedCron)) {
      executedBy = 'cron';
    } else {
      const admin = await requireMvpAdmin(req, adapter, env);
      executedBy = `admin:${admin.id}`;
    }

    const body = await parseJsonBody(req).catch((): Record<string, unknown> => ({}));
    const sys = await adapter.getSystemSettings();

    const requestedDryRun = typeof body.dryRun === 'boolean' ? body.dryRun : false;
    const effectiveDryRun =
      requestedDryRun || (executedBy === 'cron' && (!sys.retention_policy_confirmed || !sys.auto_cleanup_enabled));

    const nowMs = typeof body.nowIso === 'string' ? Date.parse(body.nowIso) : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const jobs = await adapter.listJobsForRetentionCheck();
    let jobsExpired = 0;
    let filesMarkedDeleted = 0;
    let storageObjectsRemoved = 0;
    let skippedActiveOrDisputed = 0;
    const processedJobIds: string[] = [];

    for (const job of jobs) {
      const payments = await adapter.getPaymentsForJob(job.id);
      const hasPendingVerification = payments.some((p) => p.payment_status === 'pending_verification');

      const verdict = canCleanupDeleteFiles(job, hasPendingVerification, nowMs, {
        draftHours: sys.draft_retention_hours,
        completedHours: sys.completed_retention_hours,
        failedHours: sys.failed_retention_hours,
      });

      if (!verdict.eligible) {
        if (verdict.reason === 'active_job_protected' || verdict.reason === 'disputed_or_pending_payment') {
          skippedActiveOrDisputed += 1;
        }
        continue;
      }

      const files = (await adapter.getFilesForJob(job.id)).filter((f) => !f.deleted_at);
      if (files.length === 0 && job.status !== 'draft') {
        continue;
      }

      processedJobIds.push(job.id);

      if (!effectiveDryRun) {
        for (const f of files) {
          const deleted = await adapter.deleteStorageObject(f.storage_bucket, f.storage_path);
          if (deleted) storageObjectsRemoved += 1;
          await adapter.updateFileRecord(f.id, { deleted_at: nowIso });
          filesMarkedDeleted += 1;
        }

        if (job.status === 'draft' || job.status === 'failed' || job.status === 'needs_review') {
          assertTransition(job.status, 'expired');
          await adapter.updateJob(job.id, { status: 'expired', expires_at: nowIso, draft_upload_secret_hash: null });
          await adapter.appendEvent({
            jobId: job.id,
            actorType: 'system',
            actorId: null,
            eventType: 'retention_job_expired',
            previousStatus: job.status,
            newStatus: 'expired',
            metadata: { reason: verdict.reason, files_deleted: files.length },
          });
          jobsExpired += 1;
        } else {
          await adapter.updateJob(job.id, { expires_at: nowIso });
          await adapter.appendEvent({
            jobId: job.id,
            actorType: 'system',
            actorId: null,
            eventType: 'retention_files_purged',
            previousStatus: job.status,
            newStatus: job.status,
            metadata: { reason: verdict.reason, files_deleted: files.length },
          });
        }
      } else {
        filesMarkedDeleted += files.length;
        if (job.status === 'draft' || job.status === 'failed' || job.status === 'needs_review') {
          jobsExpired += 1;
        }
      }
    }

    const log = await adapter.createCleanupLog({
      run_mode: effectiveDryRun ? 'dry_run' : 'execute',
      jobs_expired: jobsExpired,
      files_marked_deleted: filesMarkedDeleted,
      storage_objects_removed: storageObjectsRemoved,
      skipped_active_or_disputed: skippedActiveOrDisputed,
      details: { processed_job_ids: processedJobIds },
      executed_by: executedBy,
    });

    return jsonResponse(
      200,
      {
        mode: log.run_mode,
        retentionPolicyConfirmed: sys.retention_policy_confirmed,
        jobsExpired,
        filesMarkedDeleted,
        storageObjectsRemoved,
        skippedActiveOrDisputed,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 15. Future Device Foundation: agent-enroll (Admin-authorized enrollment)
// ---------------------------------------------------------------------------
export async function handleAgentEnroll(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    const body = await parseJsonBody(req);

    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : '';
    if (deviceName.length < 2) {
      throw new AppError(400, 'INVALID_DEVICE_NAME', 'deviceName is required.');
    }

    const rawCredential = generateCryptographicToken(32);
    const credentialHash = await sha256Hex(rawCredential);

    const device = await adapter.createDevice({
      deviceName: deviceName.slice(0, 80),
      credentialHash,
      osVersion: typeof body.osVersion === 'string' ? body.osVersion.slice(0, 80) : null,
      agentVersion: typeof body.agentVersion === 'string' ? body.agentVersion.slice(0, 40) : null,
      activateImmediately: body.activateImmediately !== false,
    });

    await adapter.appendEvent({
      jobId: null,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'agent_device_enrolled',
      previousStatus: null,
      newStatus: null,
      metadata: { device_id: device.id, device_name: device.device_name, device_status: device.device_status },
    });

    return jsonResponse(
      201,
      {
        deviceId: device.id,
        deviceName: device.device_name,
        deviceStatus: device.device_status,
        deviceCredential: rawCredential,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 16. Future Device Foundation: agent-heartbeat
// ---------------------------------------------------------------------------
export async function handleAgentHeartbeat(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const device = await requireActiveDevice(req, adapter);
    const body = await parseJsonBody(req).catch((): Record<string, unknown> => ({}));
    const nowIso = new Date().toISOString();

    await adapter.updateDevice(device.id, {
      last_heartbeat_at: nowIso,
      ...(typeof body.agentVersion === 'string' ? { agent_version: body.agentVersion.slice(0, 40) } : {}),
      ...(typeof body.osVersion === 'string' ? { os_version: body.osVersion.slice(0, 80) } : {}),
    });

    if (Array.isArray(body.printers) && adapter.updatePrinterStatus) {
      for (const item of body.printers) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        if (typeof p.printerId === 'string' && typeof p.printerStatus === 'string') {
          const allowed = new Set(['online', 'offline', 'error', 'paused', 'disabled', 'unknown']);
          if (allowed.has(p.printerStatus)) {
            await adapter.updatePrinterStatus(p.printerId, {
              printer_status: p.printerStatus as 'online' | 'offline' | 'error' | 'paused' | 'disabled' | 'unknown',
              last_seen_at: nowIso,
            });
          }
        }
      }
    }

    return jsonResponse(200, { ok: true, deviceId: device.id, serverTime: nowIso }, cors);
  });
}

// ---------------------------------------------------------------------------
// 17. Future Device Foundation: agent-claim-job
// ---------------------------------------------------------------------------
export async function handleAgentClaimJob(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const device = await requireActiveDevice(req, adapter);
    const body = await parseJsonBody(req).catch((): Record<string, unknown> => ({}));

    const configuredLease = Number(env.AGENT_CLAIM_LEASE_SECONDS ?? 180);
    const leaseSeconds =
      typeof body.leaseSeconds === 'number' && Number.isInteger(body.leaseSeconds)
        ? Math.max(30, Math.min(body.leaseSeconds, 600))
        : Number.isFinite(configuredLease)
          ? Math.max(30, Math.min(configuredLease, 600))
          : 180;

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : crypto.randomUUID();

    const claimed = await adapter.claimNextJob({
      deviceId: device.id,
      leaseSeconds,
      idempotencyKey,
    });

    if (!claimed) {
      return jsonResponse(200, { claimed: false, job: null }, cors);
    }

    const job = await adapter.getJobById(claimed.job_id);
    const files = (await adapter.getFilesForJob(claimed.job_id)).filter(
      (f) => !f.deleted_at && f.validation_status === 'valid'
    );

    const fileDownloads = await Promise.all(
      files.map(async (f) => {
        const signed = await adapter.createSignedDownloadUrl(f.storage_bucket, f.storage_path, 120);
        return {
          fileId: f.id,
          originalFilename: f.original_filename,
          mimeType: f.detected_mime_type,
          sha256Checksum: f.sha256_checksum,
          detectedPageCount: f.detected_page_count,
          signedDownloadUrl: signed.signedUrl,
          expiresInSeconds: signed.expiresInSeconds,
        };
      })
    );

    return jsonResponse(
      200,
      {
        claimed: true,
        attemptId: claimed.attempt_id,
        attemptNumber: claimed.attempt_number,
        leaseExpiresAt: claimed.lease_expires_at,
        job: job
          ? {
              jobId: job.id,
              jobNumber: job.job_number,
              printerId: claimed.printer_id,
              paperSize: job.paper_size,
              printMode: job.print_mode,
              printSides: job.print_sides,
              copies: job.copies,
              orientation: job.orientation,
              scaling: job.scaling,
              requestedPageRange: job.requested_page_range,
              files: fileDownloads,
            }
          : null,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 18. Future Device Foundation: agent-report-job-event
// ---------------------------------------------------------------------------
export async function handleAgentReportJobEvent(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const device = await requireActiveDevice(req, adapter);
    const body = await parseJsonBody(req);

    const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : '';
    const nextStatus = typeof body.nextStatus === 'string' ? (body.nextStatus.trim() as JobStatus) : null;
    if (!attemptId || !nextStatus) {
      throw new AppError(400, 'MISSING_FIELDS', 'attemptId and nextStatus are required.');
    }

    const allowedAgentStatuses = new Set<JobStatus>([
      'downloading',
      'printing',
      'submitted_to_spooler',
      'completed',
      'failed',
      'needs_review',
    ]);
    if (!allowedAgentStatuses.has(nextStatus)) {
      throw new AppError(400, 'INVALID_AGENT_STATUS', `Agent cannot report status '${nextStatus}'.`);
    }

    const attempt = await adapter.getAttemptById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Print attempt not found.');
    }
    if (attempt.device_id !== device.id) {
      throw new AppError(403, 'ATTEMPT_DEVICE_MISMATCH', 'Attempt belongs to a different device.');
    }
    if (attempt.finished_at !== null) {
      throw new AppError(409, 'ATTEMPT_ALREADY_FINISHED', 'Print attempt has already terminated.');
    }

    const job = await adapter.getJobById(attempt.job_id);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Associated job not found.');

    assertAgentMayRetry(job.status);
    assertTransition(job.status, nextStatus);

    const nowIso = new Date().toISOString();
    const isAttemptTerminal = nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'needs_review';

    await adapter.updateAttempt(attempt.id, {
      attempt_status: nextStatus as
        | 'downloading'
        | 'printing'
        | 'submitted_to_spooler'
        | 'completed'
        | 'failed'
        | 'needs_review',
      ...(typeof body.spoolerJobId === 'string' ? { windows_spooler_job_id: body.spoolerJobId.slice(0, 64) } : {}),
      ...(nextStatus === 'submitted_to_spooler' ? { submitted_to_spooler_at: nowIso } : {}),
      ...(nextStatus === 'completed' ? { completed_at: nowIso } : {}),
      ...(isAttemptTerminal ? { finished_at: nowIso } : {}),
      ...(typeof body.errorCode === 'string' ? { error_code: body.errorCode.slice(0, 64) } : {}),
      ...(typeof body.errorMessage === 'string' ? { error_message: body.errorMessage.slice(0, 300) } : {}),
    });

    const updatedJob = await adapter.updateJob(job.id, {
      status: nextStatus,
      ...(nextStatus === 'completed' ? { completed_at: nowIso } : {}),
    });

    await adapter.appendEvent({
      jobId: job.id,
      actorType: 'agent',
      actorId: device.id,
      eventType: `agent_status_${nextStatus}`,
      previousStatus: job.status,
      newStatus: nextStatus,
      metadata: {
        attempt_id: attempt.id,
        spooler_job_id: typeof body.spoolerJobId === 'string' ? body.spoolerJobId : null,
        error_code: typeof body.errorCode === 'string' ? body.errorCode : null,
      },
    });

    return jsonResponse(
      200,
      {
        jobId: updatedJob.id,
        status: updatedJob.status,
        attemptId: attempt.id,
        finished: isAttemptTerminal,
      },
      cors
    );
  });
}

// ---------------------------------------------------------------------------
// 19. Phase 0 Admin: admin-printers (Manual Printer CRUD, Archive, Device Binding & Audit Summary)
// ---------------------------------------------------------------------------
function toPublicDeviceSummary(d: PrintDevice) {
  return {
    id: d.id,
    device_name: d.device_name,
    device_status: d.device_status,
    agent_version: d.agent_version,
    os_version: d.os_version,
    last_heartbeat_at: d.last_heartbeat_at,
    approved_at: d.approved_at,
    revoked_at: d.revoked_at,
    created_at: d.created_at,
  };
}

export async function handleAdminPrinters(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'GET_OR_POST', env, async (cors) => {
    const admin = await requireMvpAdmin(req, adapter, env);
    if (!adapter.listPrinters || !adapter.createPrinter || !adapter.updatePrinter || !adapter.listDevices) {
      throw new AppError(500, 'SERVER_MISCONFIGURED', 'Printer management adapter methods are not configured.');
    }

    const buildSnapshot = async () => {
      const [printers, devices, recentEvents] = await Promise.all([
        adapter.listPrinters!({ includeArchived: true }),
        adapter.listDevices!(),
        adapter.listRecentEvents
          ? adapter.listRecentEvents(25, [
              'printer_created',
              'printer_updated',
              'printer_enabled',
              'printer_disabled',
              'printer_device_assigned',
              'printer_discovery_reviewed',
              'printer_archived',
              'printer_deleted',
              'agent_printers_synced',
              'agent_device_enrolled',
            ])
          : Promise.resolve([]),
      ]);
      const publicDevices = devices.map(toPublicDeviceSummary);
      const auditSummary = computeHardwareAuditSummary(printers, devices);
      return { printers, devices: publicDevices, auditSummary, recentEvents };
    };

    if (req.method === 'GET') {
      const snapshot = await buildSnapshot();
      return jsonResponse(200, snapshot, cors);
    }

    const body = await parseJsonBody(req);
    const action = typeof body.action === 'string' ? body.action.trim() : 'list';

    if (action === 'list') {
      const snapshot = await buildSnapshot();
      return jsonResponse(200, snapshot, cors);
    }

    if (action === 'create') {
      const printerName = validatePrinterName(body.printerName);
      const printerModel = sanitizeOptionalText(body.printerModel, 80);
      const systemPrinterName = sanitizeOptionalText(body.systemPrinterName, 120);
      const connectionType = normalizeConnectionType(body.connectionType);
      const supportsColour = triStateToNullableBoolean(body.supportsColour);
      const supportsDuplex = triStateToNullableBoolean(body.supportsDuplex);
      const supportedPaperSizes = normalizeSupportedPaperSizes(body.supportedPaperSizes);
      const auditNotes = sanitizeOptionalText(body.auditNotes, 400);
      const isEnabled = body.isEnabled === true;

      let deviceId: string | null = null;
      if (typeof body.deviceId === 'string' && body.deviceId.trim()) {
        const dev = adapter.getDeviceById ? await adapter.getDeviceById(body.deviceId.trim()) : null;
        if (!dev) {
          throw new AppError(404, 'DEVICE_NOT_FOUND', 'Assigned Print Agent device not found.');
        }
        if (dev.device_status === 'revoked') {
          throw new AppError(409, 'DEVICE_REVOKED', 'Cannot assign printer to a revoked Print Agent device.');
        }
        deviceId = dev.id;
      }

      const created = await adapter.createPrinter({
        printerName,
        printerModel,
        systemPrinterName,
        deviceId,
        connectionType,
        supportedPaperSizes,
        supportsColour,
        supportsDuplex,
        capabilitiesVerified: false,
        printerStatus: isEnabled ? 'unknown' : 'disabled',
        isEnabled,
        isDefault: false,
        discoverySource: 'manual',
        approvalStatus: 'manual',
        lastSeenAt: null,
        lastVerifiedAt: null,
        auditNotes,
      });

      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_created',
        previousStatus: null,
        newStatus: created.printer_status,
        metadata: {
          printer_id: created.id,
          printer_name: created.printer_name,
          connection_type: created.connection_type,
          supports_colour: created.supports_colour,
          supports_duplex: created.supports_duplex,
          supported_paper_sizes: created.supported_paper_sizes,
        },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(201, { printer: created, ...snapshot }, cors);
    }

    const printerId = typeof body.printerId === 'string' ? body.printerId.trim() : '';
    if (!printerId) {
      throw new AppError(400, 'MISSING_PRINTER_ID', 'printerId is required.');
    }
    const existing = await adapter.getPrinterById(printerId);
    if (!existing) {
      throw new AppError(404, 'PRINTER_NOT_FOUND', 'Printer not found.');
    }

    if (action === 'update') {
      if (existing.archived_at) {
        throw new AppError(409, 'PRINTER_ARCHIVED', 'Archived printers cannot be edited.');
      }

      const nextName =
        body.printerName !== undefined ? validatePrinterName(body.printerName) : existing.printer_name;
      const nextModel =
        body.printerModel !== undefined
          ? sanitizeOptionalText(body.printerModel, 80)
          : (existing.printer_model ?? null);
      const nextSystemName =
        body.systemPrinterName !== undefined
          ? sanitizeOptionalText(body.systemPrinterName, 120)
          : existing.system_printer_name;
      const nextConnection =
        body.connectionType !== undefined
          ? normalizeConnectionType(body.connectionType)
          : existing.connection_type;
      const nextColour =
        body.supportsColour !== undefined
          ? triStateToNullableBoolean(body.supportsColour)
          : existing.supports_colour;
      const nextDuplex =
        body.supportsDuplex !== undefined
          ? triStateToNullableBoolean(body.supportsDuplex)
          : existing.supports_duplex;
      const nextSizes =
        body.supportedPaperSizes !== undefined
          ? normalizeSupportedPaperSizes(body.supportedPaperSizes)
          : existing.supported_paper_sizes;
      const nextNotes =
        body.auditNotes !== undefined
          ? sanitizeOptionalText(body.auditNotes, 400)
          : (existing.audit_notes ?? null);

      let nextDeviceId = existing.device_id;
      if (body.deviceId !== undefined) {
        if (body.deviceId === null || body.deviceId === '') {
          nextDeviceId = null;
        } else if (typeof body.deviceId === 'string') {
          const dev = adapter.getDeviceById ? await adapter.getDeviceById(body.deviceId.trim()) : null;
          if (!dev) {
            throw new AppError(404, 'DEVICE_NOT_FOUND', 'Assigned Print Agent device not found.');
          }
          if (dev.device_status === 'revoked') {
            throw new AppError(409, 'DEVICE_REVOKED', 'Cannot assign printer to a revoked Print Agent device.');
          }
          nextDeviceId = dev.id;
        }
      }

      const nextEnabled =
        typeof body.isEnabled === 'boolean' ? body.isEnabled : existing.is_enabled;
      if (
        nextEnabled &&
        (existing.approval_status === 'pending_review' || existing.approval_status === 'rejected')
      ) {
        throw new AppError(
          409,
          'PRINTER_APPROVAL_REQUIRED',
          'Approve agent-discovered printer before enabling it.'
        );
      }

      let nextVerified = existing.capabilities_verified;
      let nextVerifiedAt = existing.last_verified_at ?? null;
      if (body.markPhysicallyVerified === true) {
        if (
          nextColour === null ||
          nextDuplex === null ||
          nextConnection === 'unknown' ||
          nextSizes.length === 0
        ) {
          throw new AppError(
            400,
            'INCOMPLETE_CAPABILITIES',
            'Cannot mark physically verified while connection, colour, duplex, or paper sizes remain unknown.'
          );
        }
        nextVerified = true;
        nextVerifiedAt = new Date().toISOString();
      } else if (body.markPhysicallyVerified === false) {
        nextVerified = false;
        nextVerifiedAt = null;
      }

      const nextStatus: PrintPrinter['printer_status'] = !nextEnabled
        ? 'disabled'
        : existing.printer_status === 'disabled'
          ? 'unknown'
          : existing.printer_status;

      const updated = await adapter.updatePrinter(printerId, {
        printer_name: nextName,
        printer_model: nextModel,
        system_printer_name: nextSystemName,
        connection_type: nextConnection,
        supports_colour: nextColour,
        supports_duplex: nextDuplex,
        supported_paper_sizes: nextSizes,
        device_id: nextDeviceId,
        is_enabled: nextEnabled,
        printer_status: nextStatus,
        capabilities_verified: nextVerified,
        last_verified_at: nextVerifiedAt,
        audit_notes: nextNotes,
      });

      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_updated',
        previousStatus: existing.printer_status,
        newStatus: updated.printer_status,
        metadata: {
          printer_id: updated.id,
          printer_name: updated.printer_name,
          capabilities_verified: updated.capabilities_verified,
        },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { printer: updated, ...snapshot }, cors);
    }

    if (action === 'set_enabled') {
      if (existing.archived_at) {
        throw new AppError(409, 'PRINTER_ARCHIVED', 'Cannot enable or disable an archived printer.');
      }
      if (typeof body.isEnabled !== 'boolean') {
        throw new AppError(400, 'INVALID_ENABLED_FLAG', 'isEnabled boolean is required.');
      }
      const nextEnabled = body.isEnabled;
      if (
        nextEnabled &&
        (existing.approval_status === 'pending_review' || existing.approval_status === 'rejected')
      ) {
        throw new AppError(
          409,
          'PRINTER_APPROVAL_REQUIRED',
          'Discovered printer must be approved by Admin before enabling.'
        );
      }

      const nextStatus: PrintPrinter['printer_status'] = nextEnabled
        ? existing.printer_status === 'disabled'
          ? 'unknown'
          : existing.printer_status
        : 'disabled';

      const updated = await adapter.updatePrinter(printerId, {
        is_enabled: nextEnabled,
        printer_status: nextStatus,
        ...(nextEnabled ? {} : { is_default: false }),
      });

      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: nextEnabled ? 'printer_enabled' : 'printer_disabled',
        previousStatus: existing.printer_status,
        newStatus: updated.printer_status,
        metadata: { printer_id: updated.id, printer_name: updated.printer_name },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { printer: updated, ...snapshot }, cors);
    }

    if (action === 'assign_device') {
      if (existing.archived_at) {
        throw new AppError(409, 'PRINTER_ARCHIVED', 'Cannot assign an archived printer to a device.');
      }
      let nextDeviceId: string | null = null;
      if (typeof body.deviceId === 'string' && body.deviceId.trim()) {
        const dev = adapter.getDeviceById ? await adapter.getDeviceById(body.deviceId.trim()) : null;
        if (!dev) {
          throw new AppError(404, 'DEVICE_NOT_FOUND', 'Assigned Print Agent device not found.');
        }
        if (dev.device_status === 'revoked') {
          throw new AppError(409, 'DEVICE_REVOKED', 'Cannot assign printer to a revoked device.');
        }
        nextDeviceId = dev.id;
      }

      const updated = await adapter.updatePrinter(printerId, { device_id: nextDeviceId });
      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_device_assigned',
        previousStatus: existing.printer_status,
        newStatus: updated.printer_status,
        metadata: { printer_id: updated.id, device_id: nextDeviceId },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { printer: updated, ...snapshot }, cors);
    }

    if (action === 'review_discovered') {
      if (existing.archived_at) {
        throw new AppError(409, 'PRINTER_ARCHIVED', 'Cannot review an archived printer.');
      }
      const decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : null;
      if (!decision) {
        throw new AppError(400, 'INVALID_DECISION', "decision must be 'approve' or 'reject'.");
      }

      const enableAfterApprove = decision === 'approve' && body.enableNow === true;
      const updated = await adapter.updatePrinter(printerId, {
        approval_status: decision === 'approve' ? 'approved' : 'rejected',
        is_enabled: enableAfterApprove,
        printer_status: enableAfterApprove
          ? existing.printer_status === 'disabled'
            ? 'unknown'
            : existing.printer_status
          : 'disabled',
        ...(enableAfterApprove ? {} : { is_default: false }),
      });

      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_discovery_reviewed',
        previousStatus: existing.approval_status ?? 'pending_review',
        newStatus: updated.approval_status ?? decision,
        metadata: {
          printer_id: updated.id,
          decision,
          is_enabled: updated.is_enabled,
        },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { printer: updated, ...snapshot }, cors);
    }

    if (action === 'archive') {
      if (existing.archived_at) {
        throw new AppError(409, 'PRINTER_ALREADY_ARCHIVED', 'Printer is already archived.');
      }
      if (adapter.countPrinterReferences) {
        const refs = await adapter.countPrinterReferences(printerId);
        if (refs.activeJobs > 0) {
          throw new AppError(
            409,
            'PRINTER_IN_USE',
            `Cannot archive printer while ${refs.activeJobs} active print job(s) are queued or printing.`
          );
        }
      }

      const nowIso = new Date().toISOString();
      const updated = await adapter.updatePrinter(printerId, {
        archived_at: nowIso,
        archived_by: admin.id,
        is_enabled: false,
        is_default: false,
        printer_status: 'disabled',
      });

      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_archived',
        previousStatus: existing.printer_status,
        newStatus: 'disabled',
        metadata: {
          printer_id: updated.id,
          printer_name: updated.printer_name,
          archived_at: nowIso,
        },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { printer: updated, ...snapshot }, cors);
    }

    if (action === 'delete') {
      const refs = adapter.countPrinterReferences
        ? await adapter.countPrinterReferences(printerId)
        : { jobs: 0, attempts: 0, activeJobs: 0 };

      if (refs.jobs > 0 || refs.attempts > 0) {
        throw new AppError(
          409,
          'HISTORICAL_RECORDS_EXIST',
          'Printer is referenced by historical print jobs/attempts. Archive the printer instead to preserve audit integrity.'
        );
      }
      if (body.confirmPermanentDelete !== true || !adapter.deletePrinter) {
        throw new AppError(
          400,
          'CONFIRMATION_REQUIRED',
          'confirmPermanentDelete=true is required to permanently delete a printer with zero job history.'
        );
      }

      await adapter.deletePrinter(printerId);
      await adapter.appendEvent({
        jobId: null,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'printer_deleted',
        previousStatus: existing.printer_status,
        newStatus: 'deleted',
        metadata: { printer_id: existing.id, printer_name: existing.printer_name },
      });

      const snapshot = await buildSnapshot();
      return jsonResponse(200, { deletedPrinterId: printerId, ...snapshot }, cors);
    }

    throw new AppError(400, 'UNSUPPORTED_ACTION', `Unsupported printer action '${action}'.`);
  });
}

// ---------------------------------------------------------------------------
// 20. Phase 0 Future Agent Prep: agent-sync-printers (Windows Agent Printer Discovery)
// ---------------------------------------------------------------------------
export async function handleAgentSyncPrinters(
  req: Request,
  adapter: Scan2PrintBackendAdapter,
  env: RuntimeEnv = {}
): Promise<Response> {
  return withHttpWrapper(req, 'POST', env, async (cors) => {
    const device = await requireActiveDevice(req, adapter);
    if (!adapter.listPrinters || !adapter.createPrinter || !adapter.updatePrinter) {
      throw new AppError(500, 'SERVER_MISCONFIGURED', 'Printer sync adapter methods are not configured.');
    }

    const body = await parseJsonBody(req);
    if (!Array.isArray(body.printers) || body.printers.length === 0) {
      throw new AppError(400, 'PRINTERS_ARRAY_REQUIRED', 'printers must be a non-empty array.');
    }
    if (body.printers.length > 25) {
      throw new AppError(400, 'TOO_MANY_PRINTERS', 'At most 25 printers may be synced per request.');
    }

    const existingPrinters = await adapter.listPrinters({ includeArchived: false });
    const nowIso = new Date().toISOString();
    const allowedStatuses = new Set<PrintPrinter['printer_status']>([
      'online',
      'offline',
      'error',
      'paused',
      'disabled',
      'unknown',
    ]);

    const synced: Array<{ id: string; systemPrinterName: string; approvalStatus: string; created: boolean }> = [];

    for (const rawItem of body.printers) {
      if (!rawItem || typeof rawItem !== 'object') {
        throw new AppError(400, 'INVALID_PRINTER_ITEM', 'Each printer entry must be an object.');
      }
      const item = rawItem as Record<string, unknown>;
      const systemPrinterName = sanitizeOptionalText(item.systemPrinterName, 120);
      if (!systemPrinterName) {
        throw new AppError(400, 'MISSING_SYSTEM_PRINTER_NAME', 'systemPrinterName is required.');
      }

      const displayName = sanitizeOptionalText(item.printerName, 80) ?? systemPrinterName.slice(0, 80);
      const printerModel = sanitizeOptionalText(item.printerModel, 80);
      const connectionType = normalizeConnectionType(item.connectionType);
      const supportsColour =
        item.supportsColour !== undefined ? triStateToNullableBoolean(item.supportsColour) : null;
      const supportsDuplex =
        item.supportsDuplex !== undefined ? triStateToNullableBoolean(item.supportsDuplex) : null;
      const supportedPaperSizes = normalizeSupportedPaperSizes(item.supportedPaperSizes);
      const reportedStatus =
        typeof item.printerStatus === 'string' && allowedStatuses.has(item.printerStatus as PrintPrinter['printer_status'])
          ? (item.printerStatus as PrintPrinter['printer_status'])
          : 'unknown';

      const match = existingPrinters.find(
        (p) => p.device_id === device.id && p.system_printer_name === systemPrinterName
      );

      if (match) {
        const updated = await adapter.updatePrinter(match.id, {
          last_seen_at: nowIso,
          printer_status: match.is_enabled ? reportedStatus : 'disabled',
          ...(match.printer_model ? {} : printerModel ? { printer_model: printerModel } : {}),
        });
        synced.push({
          id: updated.id,
          systemPrinterName,
          approvalStatus: updated.approval_status ?? 'approved',
          created: false,
        });
      } else {
        const created = await adapter.createPrinter({
          printerName: displayName,
          printerModel,
          systemPrinterName,
          deviceId: device.id,
          connectionType,
          supportedPaperSizes,
          supportsColour,
          supportsDuplex,
          capabilitiesVerified: false,
          printerStatus: reportedStatus,
          isEnabled: false,
          isDefault: false,
          discoverySource: 'agent',
          approvalStatus: 'pending_review',
          lastSeenAt: nowIso,
          lastVerifiedAt: null,
          auditNotes: 'Discovered by Windows Local Print Agent; awaiting Admin review and physical verification.',
        });
        synced.push({
          id: created.id,
          systemPrinterName,
          approvalStatus: 'pending_review',
          created: true,
        });
      }
    }

    await adapter.appendEvent({
      jobId: null,
      actorType: 'agent',
      actorId: device.id,
      eventType: 'agent_printers_synced',
      previousStatus: null,
      newStatus: null,
      metadata: {
        device_id: device.id,
        count: synced.length,
        newly_discovered: synced.filter((s) => s.created).length,
      },
    });

    return jsonResponse(200, { ok: true, deviceId: device.id, synced }, cors);
  });
}

