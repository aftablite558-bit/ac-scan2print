import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, type JSONWebKeySet } from 'jose';
import {
  handleAgentEnroll,
  handleAgentClaimJob,
  handleAgentReportJobEvent,
  handleAdminBootstrap,
  handleAdminRetryPrintJob,
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_FIREBASE_UID = 'firebase_admin_uid_aman_01';
const TEST_KID = 'firebase-phase7-kid-1';

const keyPairPromise = generateKeyPair('RS256');

const TEST_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'test-bootstrap-secret-32chars-min',
  CRON_SECRET: 'test-cron-secret-32chars-min',
};

async function getTestJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await keyPairPromise;
  const jwk = await exportJWK(publicKey);
  return {
    keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }],
  };
}

async function signTestFirebaseToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const { privateKey } = await keyPairPromise;

  return new SignJWT({
    email: 'owner@amancomputer.local',
    email_verified: true,
    auth_time: nowSec - 60,
    user_id: TEST_ADMIN_FIREBASE_UID,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID, typ: 'JWT' })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`)
    .setAudience(FIREBASE_TEST_PROJECT_ID)
    .setSubject(TEST_ADMIN_FIREBASE_UID)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(nowSec + 3600)
    .sign(privateKey);
}

async function setupTestEnvironment() {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getTestJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signTestFirebaseToken();

  // 1. Bootstrap super admin
  await handleAdminBootstrap(
    new Request('https://edge.local/admin-bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({ email: 'owner@amancomputer.local', fullName: 'Aman Owner' }),
    }),
    adapter,
    TEST_ENV
  );

  // 2. Enroll device
  const enrollRes = await handleAgentEnroll(
    new Request('https://edge.local/agent-enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({
        deviceName: 'COUNTER-PC-01',
        osVersion: 'Windows 11 Pro 23H2',
        agentVersion: '1.0.4',
        activateImmediately: true,
      }),
    }),
    adapter,
    TEST_ENV
  );
  const enrollData = await enrollRes.json();

  // 3. Register and enable printer assigned to this device
  const printer = await adapter.createPrinter!({
    deviceId: enrollData.deviceId,
    systemPrinterName: 'HP_LaserJet_M1005',
    printerName: 'HP LaserJet M1005 MFP',
    printerModel: 'HP LaserJet M1005 MFP',
    connectionType: 'usb',
    supportsColour: false,
    supportsDuplex: false,
    supportedPaperSizes: ['A4', 'Legal'],
    capabilitiesVerified: true,
    printerStatus: 'online',
    approvalStatus: 'approved',
    isEnabled: true,
    isDefault: true,
    discoverySource: 'agent',
    lastSeenAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    auditNotes: 'Phase 7 test printer',
  });

  return { sim, adapter, adminJwt, deviceId: enrollData.deviceId, credential: enrollData.deviceCredential, printer };
}

async function createQueuedPaidJob(
  adapter: ReturnType<TestSupabaseSimulator['asAdapter']>,
  printerId: string,
  jobNumber: string,
  withFile = true
) {
  const createdJob = await adapter.createJob({
    jobNumber,
    draftUploadSecretHash: `draft_hash_${jobNumber}`,
    customerName: 'Ramesh Kumar',
    customerPhone: '9876543210',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    copies: 2,
    orientation: 'portrait',
    scaling: 'fit',
    requestedPageRange: 'all',
    submissionIdempotencyKey: `idem_${jobNumber}`,
  });

  if (withFile) {
    const testSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const fileRec = await adapter.createFileRecord({
      jobId: createdJob.id,
      originalFilename: 'resume_ramesh.pdf',
      storageBucket: 'print-uploads',
      storagePath: `uploads/${createdJob.id}/resume_ramesh.pdf`,
      fileSizeBytes: 1024,
      detectedMimeType: 'application/pdf',
    });
    await adapter.updateFileRecord(fileRec.id, {
      detected_page_count: 1,
      sha256_checksum: testSha256,
      validation_status: 'valid',
    });
  }

  return adapter.updateJob(createdJob.id, {
    tracking_token_hash: `track_hash_${jobNumber}`,
    status: 'queued',
    payment_status: 'paid',
    assigned_printer_id: printerId,
  });
}

test('[P7-01] IAgentApiClient and AgentApiClient Implement ClaimJobAsync and ReportJobEventAsync', () => {
  const root = process.cwd();
  const apiInterfacePath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Core', 'Interfaces', 'IAgentApiClient.cs');
  assert.ok(fs.existsSync(apiInterfacePath), 'IAgentApiClient.cs must exist');

  const interfaceContent = fs.readFileSync(apiInterfacePath, 'utf8');
  assert.ok(interfaceContent.includes('ClaimJobAsync'), 'Must declare ClaimJobAsync');
  assert.ok(interfaceContent.includes('ReportJobEventAsync'), 'Must declare ReportJobEventAsync');
  assert.ok(interfaceContent.includes('ClaimedJobDetails'), 'Must define ClaimedJobDetails record');

  const apiClientPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Api', 'AgentApiClient.cs');
  assert.ok(fs.existsSync(apiClientPath), 'AgentApiClient.cs must exist');

  const clientContent = fs.readFileSync(apiClientPath, 'utf8');
  assert.ok(clientContent.includes('ClaimJobAsync'), 'Must implement ClaimJobAsync');
  assert.ok(clientContent.includes('ReportJobEventAsync'), 'Must implement ReportJobEventAsync');
  assert.ok(clientContent.includes('/agent-claim-job'), 'Must post to /agent-claim-job');
  assert.ok(clientContent.includes('/agent-report-job-event'), 'Must post to /agent-report-job-event');
  assert.ok(clientContent.includes('x-device-credential'), 'Must supply x-device-credential header');
  assert.ok(clientContent.includes('GetProperty("status")') || clientContent.includes('TryGetProperty("status"'), 'Must parse status from edge response');
});

test('[P7-02] Worker Implements PollAndExecuteJobsAsync with Safe Temporary Isolation, Spooler Check & Needs-Review Escalation', () => {
  const root = process.cwd();
  const workerPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'Worker.cs');
  assert.ok(fs.existsSync(workerPath), 'Worker.cs must exist');

  const workerContent = fs.readFileSync(workerPath, 'utf8');
  assert.ok(workerContent.includes('PollAndExecuteJobsAsync'), 'Must implement PollAndExecuteJobsAsync');
  assert.ok(workerContent.includes('SaveAndVerifyFileAsync'), 'Must verify downloaded files with SHA-256');
  assert.ok(workerContent.includes('CleanupAttemptDirectory'), 'Must clean up temporary files in finally block');
  assert.ok(workerContent.includes('WaitForSpoolerCompletionAsync'), 'Must verify Windows Spooler job status');
  assert.ok(workerContent.includes('downloading'), 'Must transition to downloading');
  assert.ok(workerContent.includes('printing'), 'Must transition to printing');
  assert.ok(workerContent.includes('submitted_to_spooler'), 'Must transition to submitted_to_spooler');
  assert.ok(workerContent.includes('needs_review'), 'Must escalate ambiguous spooler failures to needs_review');
  assert.ok(workerContent.includes('completed'), 'Must transition to completed');
});

test('[P7-03] End-to-End: Queued Job Claim, Signed URLs, and State Machine Transition Sequence', async () => {
  const { adapter, credential, printer } = await setupTestEnvironment();
  const createdJob = await createQueuedPaidJob(adapter, printer.id, 'AC-P7-001', true);

  // 1. Agent Claims Next Job
  const claimReq = new Request('https://edge.local/agent-claim-job', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-credential': credential,
    },
    body: JSON.stringify({ leaseSeconds: 120 }),
  });

  const claimRes = await handleAgentClaimJob(claimReq, adapter, TEST_ENV);
  assert.equal(claimRes.status, 200);
  const claimData = await claimRes.json();

  assert.equal(claimData.claimed, true, 'Job should be claimed');
  assert.ok(claimData.attemptId, 'Attempt ID must be returned');
  assert.equal(claimData.job.jobId, createdJob.id);
  assert.equal(claimData.job.copies, 2);
  assert.equal(claimData.job.files.length, 1);
  assert.equal(claimData.job.files[0].originalFilename, 'resume_ramesh.pdf');
  assert.ok(claimData.job.files[0].signedDownloadUrl, 'Must return signed storage download URL');

  const attemptId = claimData.attemptId;

  // 2. Transition to 'downloading'
  const dlRes = await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'downloading' }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(dlRes.status, 200);
  let updatedJob = await adapter.getJobById(createdJob.id);
  assert.equal(updatedJob?.status, 'downloading');

  // 3. Transition to 'printing'
  const prRes = await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'printing' }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(prRes.status, 200);
  updatedJob = await adapter.getJobById(createdJob.id);
  assert.equal(updatedJob?.status, 'printing');

  // 4. Transition to 'submitted_to_spooler'
  const spRes = await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'submitted_to_spooler', spoolerJobId: '4028' }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(spRes.status, 200);
  updatedJob = await adapter.getJobById(createdJob.id);
  assert.equal(updatedJob?.status, 'submitted_to_spooler');

  // 5. Transition to 'completed'
  const compRes = await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'completed', spoolerJobId: '4028' }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(compRes.status, 200);
  updatedJob = await adapter.getJobById(createdJob.id);
  assert.equal(updatedJob?.status, 'completed');
  assert.ok(updatedJob?.completed_at, 'Job completed_at timestamp must be set');

  const attempt = await adapter.getAttemptById(attemptId);
  assert.equal(attempt?.attempt_status, 'completed');
  assert.ok(attempt?.finished_at, 'Attempt finished_at timestamp must be set');
  assert.equal(attempt?.windows_spooler_job_id, '4028');
});

test('[P7-04] Secure File Verification & Path Traversal Prevention', () => {
  const root = process.cwd();
  const fileManagerPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Storage', 'LocalFileManager.cs');
  assert.ok(fs.existsSync(fileManagerPath), 'LocalFileManager.cs must exist');

  const content = fs.readFileSync(fileManagerPath, 'utf8');
  assert.ok(content.includes('StartsWith(attemptDir'), 'Must verify path stays within attempt directory');
  assert.ok(content.includes('UnauthorizedAccessException'), 'Must throw on path traversal attempts');
  assert.ok(content.includes('SHA256.Create()'), 'Must compute SHA-256');
  assert.ok(content.includes('File.Delete(targetPath)'), 'Must immediately delete corrupt/tampered file');
});

test('[P7-05] Error Recovery: Pre-Spooler Failure & Post-Spooler Needs-Review Reconciliation', async () => {
  const { adapter, adminJwt, credential, printer } = await setupTestEnvironment();
  const job = await createQueuedPaidJob(adapter, printer.id, 'AC-P7-002', false);

  // Claim job (Attempt 1)
  const claimRes = await handleAgentClaimJob(
    new Request('https://edge.local/agent-claim-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ leaseSeconds: 60 }),
    }),
    adapter,
    TEST_ENV
  );
  const claimData = await claimRes.json();
  const attemptId = claimData.attemptId;

  // Move to printing -> submitted_to_spooler -> needs_review (Paper Jam mid-print)
  await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'downloading' }),
    }),
    adapter,
    TEST_ENV
  );
  await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'printing' }),
    }),
    adapter,
    TEST_ENV
  );
  await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ attemptId, nextStatus: 'submitted_to_spooler', spoolerJobId: '9912' }),
    }),
    adapter,
    TEST_ENV
  );

  const reviewRes = await handleAgentReportJobEvent(
    new Request('https://edge.local/agent-report-job-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({
        attemptId,
        nextStatus: 'needs_review',
        spoolerJobId: '9912',
        errorCode: 'SPOOLER_PAPEROUT',
        errorMessage: 'Tray 1 out of paper mid-print. Needs manual check before reprint.',
      }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(reviewRes.status, 200);

  let updatedJob = await adapter.getJobById(job.id);
  assert.equal(updatedJob?.status, 'needs_review');

  const attempt = await adapter.getAttemptById(attemptId);
  assert.equal(attempt?.attempt_status, 'needs_review');
  assert.equal(attempt?.error_code, 'SPOOLER_PAPEROUT');
  assert.ok(attempt?.finished_at, 'Attempt finished_at must be set');

  // Verify agent CANNOT auto-claim a needs_review job
  const secondClaimRes = await handleAgentClaimJob(
    new Request('https://edge.local/agent-claim-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ leaseSeconds: 60 }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal((await secondClaimRes.json()).claimed, false);

  // Admin explicitly authorizes retry back to queued after refilling paper
  const adminRetryRes = await handleAdminRetryPrintJob(
    new Request('https://edge.local/admin-retry-print-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({
        jobId: job.id,
        action: 'retry',
        reason: 'Refilled A4 tray and cleared jam; verified pages did not print.',
        printerId: printer.id,
      }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(adminRetryRes.status, 200);
  updatedJob = await adapter.getJobById(job.id);
  assert.equal(updatedJob?.status, 'queued');
});

test('[P7-06] Concurrency Protection: Active Attempt Prevents Multiple Agents from Claiming Same Job', async () => {
  const { adapter, credential, printer } = await setupTestEnvironment();
  await createQueuedPaidJob(adapter, printer.id, 'AC-P7-003', false);

  // First claim succeeds
  const firstClaimRes = await handleAgentClaimJob(
    new Request('https://edge.local/agent-claim-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ leaseSeconds: 120 }),
    }),
    adapter,
    TEST_ENV
  );
  const firstData = await firstClaimRes.json();
  assert.equal(firstData.claimed, true);

  // Second claim immediately following finds NO available jobs (SKIP LOCKED / Active Attempt guard)
  const secondClaimRes = await handleAgentClaimJob(
    new Request('https://edge.local/agent-claim-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': credential },
      body: JSON.stringify({ leaseSeconds: 120 }),
    }),
    adapter,
    TEST_ENV
  );
  const secondData = await secondClaimRes.json();
  assert.equal(secondData.claimed, false);
  assert.equal(secondData.job, null);
});
