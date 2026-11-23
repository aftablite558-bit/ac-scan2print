// AC Scan2Print — Stateful In-Memory Postgres + Private Storage Simulator for Phase 2 Automated Tests
// Enforces SQL UNIQUE indexes, CHECK constraints, immutable print_events, private signed URL TTLs, and atomic locks.

import type { JSONWebKeySet } from 'jose';
import { verifyFirebaseIdToken } from '../../supabase/functions/_shared/firebaseAuth.ts';
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
} from '../../supabase/functions/_shared/types.ts';

interface SignedUrlTokenRecord {
  bucket: string;
  path: string;
  mode: 'upload' | 'download';
  expiresAtMs: number;
}

export class TestSupabaseSimulator {
  public nowMs = Date.now();
  public firebaseJwks: JSONWebKeySet = { keys: [] };
  public adminAccounts: PrintAdminAccount[] = [];
  public devices: PrintDevice[] = [];
  public printers: PrintPrinter[] = [];
  public pricingRules: PrintPricingRule[] = [];
  public jobs: PrintJob[] = [];
  public files: PrintFile[] = [];
  public payments: PrintPayment[] = [];
  public attempts: PrintJobAttempt[] = [];
  public events: PrintEvent[] = [];
  public cleanupLogs: PrintCleanupLog[] = [];
  public rateLimits = new Map<string, { hits: number; windowStartMs: number }>();
  public storageBuckets = new Map<string, { public: boolean; data: Map<string, Uint8Array> }>([
    ['print-uploads', { public: false, data: new Map() }],
    ['payment-evidence', { public: false, data: new Map() }],
    ['payment-assets', { public: false, data: new Map() }],
  ]);
  public signedUrls = new Map<string, SignedUrlTokenRecord>();

  public paymentSettings: PrintPaymentSettings = {
    id: 1,
    upi_enabled: false,
    upi_id: null,
    upi_qr_storage_bucket: 'payment-assets',
    upi_qr_storage_path: null,
    display_name: 'Aman Computer',
    payment_instructions: '',
    updated_at: new Date().toISOString(),
    updated_by: null,
  };

  public systemSettings: PrintSystemSettings = {
    id: 1,
    customer_portal_url: null,
    max_file_size_bytes: 20 * 1024 * 1024,
    max_files_per_job: 5,
    max_copies: 20,
    draft_retention_hours: 1,
    completed_retention_hours: 24,
    failed_retention_hours: 72,
    retention_policy_confirmed: false,
    auto_cleanup_enabled: false,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };

  public advanceTimeSeconds(seconds: number): void {
    this.nowMs += seconds * 1000;
  }

  public setFirebaseJwks(jwks: JSONWebKeySet): void {
    this.firebaseJwks = jwks;
  }

  public uploadObjectWithSignedUrl(signedUrl: string, bytes: Uint8Array): void {
    const token = signedUrl.split('token=')[1] ?? '';
    const record = this.signedUrls.get(token);
    if (!record || record.mode !== 'upload') {
      throw new Error('STORAGE_UNAUTHORIZED: Invalid signed upload URL');
    }
    if (this.nowMs > record.expiresAtMs) {
      throw new Error('STORAGE_URL_EXPIRED: Signed upload URL expired');
    }
    const bucket = this.storageBuckets.get(record.bucket);
    if (!bucket) throw new Error('Bucket missing');
    bucket.data.set(record.path, bytes);
  }

  public readObjectAnonDirect(bucketName: string, path: string): Uint8Array {
    const bucket = this.storageBuckets.get(bucketName);
    if (!bucket || !bucket.public) {
      throw new Error('RLS_STORAGE_DENIED: Anonymous direct access to private bucket is forbidden');
    }
    const obj = bucket.data.get(path);
    if (!obj) throw new Error('Not found');
    return obj;
  }

  public downloadObjectWithSignedUrl(signedUrl: string): Uint8Array {
    const token = signedUrl.split('token=')[1] ?? '';
    const record = this.signedUrls.get(token);
    if (!record || record.mode !== 'download') {
      throw new Error('STORAGE_UNAUTHORIZED: Invalid signed download URL');
    }
    if (this.nowMs > record.expiresAtMs) {
      throw new Error('STORAGE_URL_EXPIRED: Signed download URL expired');
    }
    const bucket = this.storageBuckets.get(record.bucket);
    const obj = bucket?.data.get(record.path);
    if (!obj) throw new Error('STORAGE_NOT_FOUND');
    return obj;
  }

  public tryMutateEvent(eventId: string): void {
    const found = this.events.find((e) => e.id === eventId);
    if (found) {
      throw new Error('print_events is append-only and immutable');
    }
  }

  public asAdapter(): Scan2PrintBackendAdapter {
    const sim = this;

    return {
      async verifyFirebaseAdminToken(bearerToken: string, env: RuntimeEnv) {
        const verified = await verifyFirebaseIdToken(bearerToken, env.FIREBASE_PROJECT_ID ?? '', {
          localJwks: sim.firebaseJwks,
          currentDate: new Date(sim.nowMs),
        });
        if (!verified) {
          return null;
        }
        return { firebaseUid: verified.firebaseUid, email: verified.email };
      },

      async getActiveAdminByFirebaseUid(firebaseUid: string) {
        return sim.adminAccounts.find((a) => a.firebase_uid === firebaseUid && a.is_active) ?? null;
      },

      async countAdminAccounts() {
        return sim.adminAccounts.length;
      },

      async createAdminAccount(input) {
        if (sim.adminAccounts.length > 0) {
          throw new AppError(409, 'SINGLE_ADMIN_ALREADY_EXISTS', 'uq_print_admin_single_mvp_account violation');
        }
        const nowIso = new Date(sim.nowMs).toISOString();
        const row: PrintAdminAccount = {
          id: crypto.randomUUID(),
          firebase_uid: input.firebaseUid,
          user_id: null,
          email: input.email,
          full_name: input.fullName,
          is_active: true,
          singleton_guard: true,
          created_at: nowIso,
          updated_at: nowIso,
        };
        sim.adminAccounts.push(row);
        return row;
      },

      async checkRateLimit(key: string, maxHits: number, windowSeconds: number) {
        const entry = sim.rateLimits.get(key);
        if (!entry || sim.nowMs - entry.windowStartMs > windowSeconds * 1000) {
          sim.rateLimits.set(key, { hits: 1, windowStartMs: sim.nowMs });
          return true;
        }
        entry.hits += 1;
        return entry.hits <= maxHits;
      },

      async getSystemSettings() {
        return { ...sim.systemSettings };
      },

      async getPaymentSettings() {
        return { ...sim.paymentSettings };
      },

      async getPublicPortalBootstrapData(): Promise<PublicPortalBootstrapData> {
        return {
          systemSettings: {
            max_file_size_bytes: sim.systemSettings.max_file_size_bytes,
            max_files_per_job: sim.systemSettings.max_files_per_job,
            max_copies: sim.systemSettings.max_copies,
            draft_retention_hours: sim.systemSettings.draft_retention_hours,
            completed_retention_hours: sim.systemSettings.completed_retention_hours,
          },
          printers: sim.printers
            .filter((p) => !p.archived_at && p.is_enabled)
            .map((p) => ({
              is_enabled: p.is_enabled,
              approval_status: p.approval_status,
              archived_at: p.archived_at,
              printer_status: p.printer_status,
              supported_paper_sizes: [...p.supported_paper_sizes],
              supports_colour: p.supports_colour,
              supports_duplex: p.supports_duplex,
              capabilities_verified: p.capabilities_verified,
            })),
          pricingRules: sim.pricingRules
            .filter((r) => r.is_active)
            .map((r) => ({
              id: r.id,
              rule_name: r.rule_name,
              paper_size: r.paper_size,
              print_mode: r.print_mode,
              print_sides: r.print_sides,
              pricing_unit: r.pricing_unit,
              rate: r.rate,
              minimum_charge: r.minimum_charge,
              is_active: r.is_active,
              valid_from: r.valid_from,
              valid_until: r.valid_until,
            })),
        };
      },

      async updatePaymentSettings(patch) {
        sim.paymentSettings = {
          ...sim.paymentSettings,
          ...patch,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        return { ...sim.paymentSettings };
      },

      async findActivePricingRule(input: { paperSize: PaperSize; printMode: PrintMode; printSides: PrintSides }) {
        const rule =
          sim.pricingRules.find(
            (r) =>
              r.is_active &&
              r.paper_size === input.paperSize &&
              r.print_mode === input.printMode &&
              r.print_sides === input.printSides
          ) ?? null;
        return rule ? { ...rule } : null;
      },

      async createJob(input) {
        const nowIso = new Date(sim.nowMs).toISOString();
        const job: PrintJob = {
          id: crypto.randomUUID(),
          job_number: input.jobNumber,
          tracking_token_hash: null,
          draft_upload_secret_hash: input.draftUploadSecretHash,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          status: 'draft',
          payment_status: 'unpaid',
          payment_method: null,
          subtotal: null,
          final_amount: null,
          currency: 'INR',
          paper_size: input.paperSize,
          print_mode: input.printMode,
          print_sides: input.printSides,
          copies: input.copies,
          orientation: input.orientation,
          scaling: input.scaling,
          requested_page_range: input.requestedPageRange,
          verified_page_count: null,
          physical_sheet_count: null,
          pricing_rule_id: null,
          price_override_reason: null,
          assigned_printer_id: null,
          rejection_reason: null,
          cancellation_reason: null,
          submission_idempotency_key: input.submissionIdempotencyKey,
          created_at: nowIso,
          updated_at: nowIso,
          submitted_at: null,
          approved_at: null,
          completed_at: null,
          expires_at: null,
        };
        sim.jobs.push(job);
        return { ...job };
      },

      async getJobById(jobId: string) {
        const found = sim.jobs.find((j) => j.id === jobId);
        return found ? { ...found } : null;
      },

      async getJobByTrackingHash(trackingTokenHash: string) {
        const found = sim.jobs.find((j) => j.tracking_token_hash === trackingTokenHash);
        return found ? { ...found } : null;
      },

      async getJobByIdempotencyKey(key: string) {
        const found = sim.jobs.find((j) => j.submission_idempotency_key === key);
        return found ? { ...found } : null;
      },

      async updateJob(jobId: string, patch: Partial<PrintJob>) {
        const idx = sim.jobs.findIndex((j) => j.id === jobId);
        if (idx === -1) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
        const next: PrintJob = {
          ...sim.jobs[idx],
          ...patch,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        if (next.status !== 'draft' && next.status !== 'expired' && !next.tracking_token_hash) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_submitted_requires_tracking_hash');
        }
        if (next.status === 'queued' && (next.payment_status !== 'paid' || !next.assigned_printer_id)) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_queued_requires_paid_and_printer');
        }
        sim.jobs[idx] = next;
        return { ...next };
      },

      async listJobsForRetentionCheck() {
        return sim.jobs.map((j) => ({ ...j }));
      },

      async listPrintJobs() {
        return [...sim.jobs]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .map((j) => ({ ...j }));
      },

      async countActiveFilesForJob(jobId: string) {
        return sim.files.filter((f) => f.job_id === jobId && f.deleted_at === null).length;
      },

      async createFileRecord(input) {
        const file: PrintFile = {
          id: crypto.randomUUID(),
          job_id: input.jobId,
          storage_bucket: input.storageBucket,
          storage_path: input.storagePath,
          original_filename: input.originalFilename,
          detected_mime_type: input.detectedMimeType,
          file_size_bytes: input.fileSizeBytes,
          sha256_checksum: null,
          detected_page_count: null,
          validation_status: 'pending',
          validation_error: null,
          uploaded_at: new Date(sim.nowMs).toISOString(),
          deleted_at: null,
        };
        sim.files.push(file);
        return { ...file };
      },

      async getFilesForJob(jobId: string) {
        return sim.files.filter((f) => f.job_id === jobId).map((f) => ({ ...f }));
      },

      async updateFileRecord(fileId: string, patch: Partial<PrintFile>) {
        const idx = sim.files.findIndex((f) => f.id === fileId);
        if (idx === -1) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found');
        sim.files[idx] = { ...sim.files[idx], ...patch };
        return { ...sim.files[idx] };
      },

      async getPaymentsForJob(jobId: string) {
        return sim.payments.filter((p) => p.job_id === jobId).map((p) => ({ ...p }));
      },

      async listAllPayments() {
        return sim.payments.map((p) => ({ ...p }));
      },

      async listPricingRules() {
        return sim.pricingRules.map((r) => ({ ...r }));
      },

      async getPricingRuleById(ruleId: string) {
        const found = sim.pricingRules.find((r) => r.id === ruleId);
        return found ? { ...found } : null;
      },

      async createPricingRule(input) {
        if (input.printSides === 'duplex' && input.pricingUnit !== 'per_physical_sheet') {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_duplex_uses_per_physical_sheet violation');
        }
        const nowIso = new Date(sim.nowMs).toISOString();
        const validFrom = input.validFrom ?? nowIso;
        const validUntil = input.validUntil ?? null;
        if (validUntil !== null && Date.parse(validUntil) <= Date.parse(validFrom)) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_valid_window violation');
        }
        if (input.isActive) {
          const conflict = sim.pricingRules.find(
            (r) =>
              r.is_active &&
              r.paper_size === input.paperSize &&
              r.print_mode === input.printMode &&
              r.print_sides === input.printSides
          );
          if (conflict) {
            throw new AppError(409, 'ACTIVE_PRICING_RULE_CONFLICT', 'idx_print_pricing_rules_active_unique violation');
          }
        }
        const rule: PrintPricingRule = {
          id: crypto.randomUUID(),
          rule_name: input.ruleName,
          paper_size: input.paperSize,
          print_mode: input.printMode,
          print_sides: input.printSides,
          pricing_unit: input.pricingUnit,
          rate: input.rate,
          minimum_charge: input.minimumCharge,
          is_active: input.isActive,
          valid_from: validFrom,
          valid_until: validUntil,
          created_at: nowIso,
          updated_at: nowIso,
        };
        sim.pricingRules.push(rule);
        return { ...rule };
      },

      async updatePricingRule(ruleId: string, patch: Partial<PrintPricingRule>) {
        const idx = sim.pricingRules.findIndex((r) => r.id === ruleId);
        if (idx === -1) throw new AppError(404, 'RULE_NOT_FOUND', 'Pricing rule not found.');
        const next: PrintPricingRule = {
          ...sim.pricingRules[idx],
          ...patch,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        if (next.print_sides === 'duplex' && next.pricing_unit !== 'per_physical_sheet') {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_duplex_uses_per_physical_sheet violation');
        }
        if (next.valid_until !== null && Date.parse(next.valid_until) <= Date.parse(next.valid_from)) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_valid_window violation');
        }
        if (next.is_active) {
          const conflict = sim.pricingRules.find(
            (r) =>
              r.id !== ruleId &&
              r.is_active &&
              r.paper_size === next.paper_size &&
              r.print_mode === next.print_mode &&
              r.print_sides === next.print_sides
          );
          if (conflict) {
            throw new AppError(409, 'ACTIVE_PRICING_RULE_CONFLICT', 'idx_print_pricing_rules_active_unique violation');
          }
        }
        sim.pricingRules[idx] = next;
        return { ...next };
      },

      async getPaymentById(paymentId: string) {
        const found = sim.payments.find((p) => p.id === paymentId);
        return found ? { ...found } : null;
      },

      async findActivePaymentByUtr(utrNormalized: string) {
        const found = sim.payments.find(
          (p) =>
            p.transaction_reference?.toUpperCase() === utrNormalized.toUpperCase() &&
            (p.payment_status === 'pending_verification' || p.payment_status === 'paid')
        );
        return found ? { ...found } : null;
      },

      async createPayment(input) {
        if (input.paymentStatus === 'pending_verification' || input.paymentStatus === 'paid') {
          const activeForJob = sim.payments.find(
            (p) =>
              p.job_id === input.jobId &&
              (p.payment_status === 'pending_verification' || p.payment_status === 'paid')
          );
          if (activeForJob) {
            throw new AppError(409, 'DUPLICATE_PAYMENT_OR_UTR', 'idx_print_payments_active_job_unique violation');
          }
          if (input.transactionReference) {
            const dupUtr = sim.payments.find(
              (p) =>
                p.transaction_reference?.toUpperCase() === input.transactionReference?.toUpperCase() &&
                (p.payment_status === 'pending_verification' || p.payment_status === 'paid')
            );
            if (dupUtr) {
              throw new AppError(409, 'DUPLICATE_UTR', 'idx_print_payments_utr_unique violation');
            }
          }
        }
        if (input.paymentStatus === 'paid' && (!input.verifiedBy || !input.verifiedAt)) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_paid_requires_verifier violation');
        }
        const nowIso = new Date(sim.nowMs).toISOString();
        const payment: PrintPayment = {
          id: crypto.randomUUID(),
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
          rejection_reason: null,
          idempotency_key: input.idempotencyKey,
          created_at: nowIso,
          updated_at: nowIso,
        };
        sim.payments.push(payment);
        return { ...payment };
      },

      async updatePayment(paymentId: string, patch: Partial<PrintPayment>) {
        const idx = sim.payments.findIndex((p) => p.id === paymentId);
        if (idx === -1) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
        const next: PrintPayment = {
          ...sim.payments[idx],
          ...patch,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        if (next.payment_status === 'paid' && (!next.verified_by || !next.verified_at)) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_paid_requires_verifier violation');
        }
        sim.payments[idx] = next;
        return { ...next };
      },

      async listPrinters(options) {
        return sim.printers
          .filter((p) => (options?.includeArchived ? true : !p.archived_at))
          .map((p) => ({ ...p }));
      },

      async getPrinterById(printerId: string) {
        const found = sim.printers.find((p) => p.id === printerId);
        return found ? { ...found } : null;
      },

      async createPrinter(input) {
        const nowIso = new Date(sim.nowMs).toISOString();
        const printer: PrintPrinter = {
          id: crypto.randomUUID(),
          printer_name: input.printerName,
          printer_model: input.printerModel,
          system_printer_name: input.systemPrinterName,
          device_id: input.deviceId,
          connection_type: input.connectionType,
          supported_paper_sizes: [...input.supportedPaperSizes],
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
          archived_at: null,
          archived_by: null,
          audit_notes: input.auditNotes,
          created_at: nowIso,
          updated_at: nowIso,
        };
        sim.printers.push(printer);
        return { ...printer };
      },

      async updatePrinter(printerId: string, patch: Partial<PrintPrinter>) {
        const idx = sim.printers.findIndex((p) => p.id === printerId);
        if (idx === -1) throw new AppError(404, 'PRINTER_NOT_FOUND', 'Printer not found.');
        const next: PrintPrinter = {
          ...sim.printers[idx],
          ...patch,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        if (next.archived_at && (next.is_enabled || next.is_default || next.printer_status !== 'disabled')) {
          throw new AppError(500, 'DB_CONSTRAINT', 'chk_print_printers_archived_disabled');
        }
        sim.printers[idx] = next;
        return { ...next };
      },

      async deletePrinter(printerId: string) {
        const refs = sim.attempts.some((a) => a.printer_id === printerId);
        if (refs) {
          throw new AppError(409, 'FK_CONSTRAINT', 'Cannot delete printer referenced by print_job_attempts.');
        }
        sim.printers = sim.printers.filter((p) => p.id !== printerId);
      },

      async countPrinterReferences(printerId: string) {
        const jobs = sim.jobs.filter((j) => j.assigned_printer_id === printerId);
        const activeStatuses = new Set(['queued', 'claimed', 'downloading', 'printing', 'submitted_to_spooler']);
        const activeJobs = jobs.filter((j) => activeStatuses.has(j.status)).length;
        const attempts = sim.attempts.filter((a) => a.printer_id === printerId).length;
        return { jobs: jobs.length, activeJobs, attempts };
      },

      async updatePrinterStatus(printerId: string, patch) {
        const idx = sim.printers.findIndex((p) => p.id === printerId);
        if (idx === -1) return null;
        sim.printers[idx] = { ...sim.printers[idx], ...patch, updated_at: new Date(sim.nowMs).toISOString() };
        return { ...sim.printers[idx] };
      },

      async listDevices() {
        return sim.devices.map((d) => ({ ...d, credential_hash: '' }));
      },

      async getDeviceById(deviceId: string) {
        const found = sim.devices.find((d) => d.id === deviceId);
        return found ? { ...found } : null;
      },

      async getDeviceByCredentialHash(hash: string) {
        const found = sim.devices.find((d) => d.credential_hash === hash);
        return found ? { ...found } : null;
      },

      async createDevice(input) {
        const nowIso = new Date(sim.nowMs).toISOString();
        const device: PrintDevice = {
          id: crypto.randomUUID(),
          device_name: input.deviceName,
          device_status: input.activateImmediately ? 'active' : 'pending',
          credential_hash: input.credentialHash,
          agent_version: input.agentVersion,
          os_version: input.osVersion,
          last_heartbeat_at: null,
          approved_at: input.activateImmediately ? nowIso : null,
          revoked_at: null,
          created_at: nowIso,
        };
        sim.devices.push(device);
        return { ...device };
      },

      async updateDevice(deviceId: string, patch: Partial<PrintDevice>) {
        const idx = sim.devices.findIndex((d) => d.id === deviceId);
        if (idx === -1) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Device not found');
        sim.devices[idx] = { ...sim.devices[idx], ...patch };
        return { ...sim.devices[idx] };
      },

      async getActiveAttemptsForJob(jobId: string) {
        return sim.attempts.filter((a) => a.job_id === jobId && a.finished_at === null).map((a) => ({ ...a }));
      },

      async listAttemptsForJob(jobId: string) {
        return sim.attempts
          .filter((a) => a.job_id === jobId)
          .sort((a, b) => b.attempt_number - a.attempt_number)
          .map((a) => ({ ...a }));
      },

      async getAttemptById(attemptId: string) {
        const found = sim.attempts.find((a) => a.id === attemptId);
        return found ? { ...found } : null;
      },

      async updateAttempt(attemptId: string, patch: Partial<PrintJobAttempt>) {
        const idx = sim.attempts.findIndex((a) => a.id === attemptId);
        if (idx === -1) throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
        sim.attempts[idx] = { ...sim.attempts[idx], ...patch };
        return { ...sim.attempts[idx] };
      },

      async releaseJobToQueue(input) {
        const idx = sim.jobs.findIndex((j) => j.id === input.jobId);
        if (idx === -1) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
        const job = sim.jobs[idx];
        if (job.status === 'queued') throw new AppError(409, 'JOB_ALREADY_QUEUED', 'Job already queued');
        if (job.status !== 'approved') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Must be approved');
        if (job.payment_status !== 'paid') throw new AppError(409, 'PAYMENT_NOT_VERIFIED', 'Must be paid');
        const printer = sim.printers.find((p) => p.id === input.printerId);
        if (
          !printer ||
          printer.archived_at ||
          printer.approval_status === 'pending_review' ||
          printer.approval_status === 'rejected' ||
          !printer.is_enabled ||
          printer.printer_status === 'disabled'
        ) {
          throw new AppError(409, 'PRINTER_UNAVAILABLE', 'Printer unavailable');
        }
        const activeAttempt = sim.attempts.find((a) => a.job_id === job.id && a.finished_at === null);
        if (activeAttempt) throw new AppError(409, 'ACTIVE_ATTEMPT_EXISTS', 'Active attempt exists');

        sim.jobs[idx] = {
          ...job,
          status: 'queued',
          assigned_printer_id: printer.id,
          updated_at: new Date(sim.nowMs).toISOString(),
        };
        sim.events.push({
          id: crypto.randomUUID(),
          job_id: job.id,
          actor_type: 'admin',
          actor_id: input.adminId,
          event_type: 'job_released_to_queue',
          previous_status: 'approved',
          new_status: 'queued',
          metadata: { assigned_printer_id: printer.id },
          created_at: new Date(sim.nowMs).toISOString(),
        });
        return { ...sim.jobs[idx] };
      },

      async claimNextJob(input): Promise<ClaimedJobResult | null> {
        const device = sim.devices.find((d) => d.id === input.deviceId);
        if (!device || device.device_status !== 'active') {
          throw new AppError(403, 'DEVICE_NOT_ACTIVE', 'Device not active');
        }

        const candidate = sim.jobs.find((j) => {
          if (j.status !== 'queued' || j.payment_status !== 'paid' || !j.assigned_printer_id) return false;
          const printer = sim.printers.find((p) => p.id === j.assigned_printer_id);
          if (
            !printer ||
            printer.archived_at ||
            printer.approval_status === 'pending_review' ||
            printer.approval_status === 'rejected' ||
            printer.device_id !== input.deviceId ||
            !printer.is_enabled
          ) {
            return false;
          }
          const hasActive = sim.attempts.some((a) => a.job_id === j.id && a.finished_at === null);
          return !hasActive;
        });

        if (!candidate) return null;

        const maxNum = sim.attempts
          .filter((a) => a.job_id === candidate.id)
          .reduce((acc, cur) => Math.max(acc, cur.attempt_number), 0);
        const attemptNumber = maxNum + 1;
        const leaseExpiresAt = new Date(sim.nowMs + input.leaseSeconds * 1000).toISOString();

        const attempt: PrintJobAttempt = {
          id: crypto.randomUUID(),
          job_id: candidate.id,
          attempt_number: attemptNumber,
          idempotency_key: input.idempotencyKey,
          device_id: input.deviceId,
          printer_id: candidate.assigned_printer_id!,
          attempt_status: 'claimed',
          lease_expires_at: leaseExpiresAt,
          windows_spooler_job_id: null,
          started_at: new Date(sim.nowMs).toISOString(),
          submitted_to_spooler_at: null,
          completed_at: null,
          finished_at: null,
          error_code: null,
          error_message: null,
        };
        sim.attempts.push(attempt);

        const idx = sim.jobs.findIndex((j) => j.id === candidate.id);
        sim.jobs[idx] = {
          ...sim.jobs[idx],
          status: 'claimed',
          updated_at: new Date(sim.nowMs).toISOString(),
        };

        sim.events.push({
          id: crypto.randomUUID(),
          job_id: candidate.id,
          actor_type: 'agent',
          actor_id: input.deviceId,
          event_type: 'job_claimed',
          previous_status: 'queued',
          new_status: 'claimed',
          metadata: { attempt_id: attempt.id, attempt_number: attemptNumber },
          created_at: new Date(sim.nowMs).toISOString(),
        });

        return {
          job_id: candidate.id,
          job_number: candidate.job_number,
          attempt_id: attempt.id,
          attempt_number: attemptNumber,
          printer_id: attempt.printer_id,
          lease_expires_at: leaseExpiresAt,
        };
      },

      async listRecentEvents(limit = 30, eventTypes?: string[]) {
        const filtered = eventTypes && eventTypes.length > 0
          ? sim.events.filter((e) => eventTypes.includes(e.event_type))
          : sim.events;
        return [...filtered]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, limit)
          .map((e) => ({ ...e }));
      },

      async listEventsForJob(jobId: string) {
        return sim.events
          .filter((e) => e.job_id === jobId)
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
          .map((e) => ({ ...e }));
      },

      async appendEvent(input) {
        const evt: PrintEvent = {
          id: crypto.randomUUID(),
          job_id: input.jobId,
          actor_type: input.actorType,
          actor_id: input.actorId,
          event_type: input.eventType,
          previous_status: input.previousStatus,
          new_status: input.newStatus,
          metadata: input.metadata ?? {},
          created_at: new Date(sim.nowMs).toISOString(),
        };
        sim.events.push(evt);
        return { ...evt };
      },

      async createCleanupLog(input) {
        const log: PrintCleanupLog = {
          id: crypto.randomUUID(),
          ...input,
          executed_at: new Date(sim.nowMs).toISOString(),
        };
        sim.cleanupLogs.push(log);
        return { ...log };
      },

      async createSignedUploadUrl(bucket: string, path: string, expiresInSeconds: number) {
        const token = crypto.randomUUID();
        sim.signedUrls.set(token, {
          bucket,
          path,
          mode: 'upload',
          expiresAtMs: sim.nowMs + expiresInSeconds * 1000,
        });
        return {
          signedUrl: `https://storage.local/upload/${bucket}/${path}?token=${token}`,
          token,
          expiresInSeconds,
        };
      },

      async createSignedDownloadUrl(bucket: string, path: string, expiresInSeconds: number) {
        const token = crypto.randomUUID();
        sim.signedUrls.set(token, {
          bucket,
          path,
          mode: 'download',
          expiresAtMs: sim.nowMs + expiresInSeconds * 1000,
        });
        return {
          signedUrl: `https://storage.local/download/${bucket}/${path}?token=${token}`,
          expiresInSeconds,
        };
      },

      async readStorageObject(bucketName: string, path: string) {
        const bucket = sim.storageBuckets.get(bucketName);
        if (!bucket) return null;
        return bucket.data.get(path) ?? null;
      },

      async deleteStorageObject(bucketName: string, path: string) {
        const bucket = sim.storageBuckets.get(bucketName);
        if (!bucket) return false;
        return bucket.data.delete(path);
      },
    };
  }
}
