import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, type JSONWebKeySet } from 'jose';
import {
  handleAgentEnroll,
  handleAgentHeartbeat,
  handleAgentSyncPrinters,
  handleAdminBootstrap
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_FIREBASE_UID = 'firebase_admin_uid_aman_01';
const TEST_KID = 'firebase-phase6-kid-1';

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

async function setupAdminEnv() {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getTestJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signTestFirebaseToken();

  const bootRes = await handleAdminBootstrap(
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
  assert.equal(bootRes.status, 201);
  return { sim, adapter, adminJwt };
}

test('[P6-01] AgentApiClient Exists and Implements Required Interfaces', () => {
  const root = process.cwd();
  const apiInterfacePath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Core', 'Interfaces', 'IAgentApiClient.cs');
  assert.ok(fs.existsSync(apiInterfacePath), 'IAgentApiClient.cs must exist');

  const apiClientPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Api', 'AgentApiClient.cs');
  assert.ok(fs.existsSync(apiClientPath), 'AgentApiClient.cs must exist');

  const content = fs.readFileSync(apiClientPath, 'utf8');
  assert.ok(content.includes('EnrollDeviceAsync'), 'Must implement EnrollDeviceAsync');
  assert.ok(content.includes('SendHeartbeatAsync'), 'Must implement SendHeartbeatAsync');
  assert.ok(content.includes('SyncPrintersAsync'), 'Must implement SyncPrintersAsync');
  assert.ok(content.includes('x-device-credential'), 'Must send x-device-credential header');
});

test('[P6-02] Worker Implements 30s Heartbeat Loop & DPAPI Credential Loading', () => {
  const root = process.cwd();
  const workerPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'Worker.cs');
  assert.ok(fs.existsSync(workerPath), 'Worker.cs must exist');

  const content = fs.readFileSync(workerPath, 'utf8');
  assert.ok(content.includes('ACScan2Print_DeviceCredential'), 'Must load DPAPI credential');
  assert.ok(content.includes('SendHeartbeatAsync'), 'Must call SendHeartbeatAsync');
  assert.ok(content.includes('SyncPrintersAsync'), 'Must call SyncPrintersAsync');
  assert.ok(content.includes('ClearSecret'), 'Must purge DPAPI secret on revocation');
});

test('[P6-03] Tray UI Implements Device Enrollment Dialog', () => {
  const root = process.cwd();
  const dialogPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Tray', 'EnrollmentDialog.cs');
  assert.ok(fs.existsSync(dialogPath), 'EnrollmentDialog.cs must exist');

  const content = fs.readFileSync(dialogPath, 'utf8');
  assert.ok(content.includes('Enroll Windows 11 Counter PC'), 'Dialog must have enrollment title');
  assert.ok(content.includes('SaveProtectedSecret'), 'Must encrypt received credentials with DPAPI');
});

test('[P6-04] End-to-End: Admin Enrolls Device, Agent Sends Heartbeat & Syncs Printers', async () => {
  const { adapter, adminJwt } = await setupAdminEnv();

  // 1. Admin generates enrollment request
  const enrollReq = new Request('https://edge.local/agent-enroll', {
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
  });

  const enrollRes = await handleAgentEnroll(enrollReq, adapter, TEST_ENV);
  assert.equal(enrollRes.status, 201, 'Enrollment should return 201 Created');
  const enrollData = await enrollRes.json();
  assert.ok(enrollData.deviceId, 'Should return deviceId');
  assert.ok(enrollData.deviceCredential, 'Should return raw deviceCredential');
  assert.equal(enrollData.deviceStatus, 'active', 'Device status should be active');

  // 2. Agent sends heartbeat with returned credential
  const heartbeatReq = new Request('https://edge.local/agent-heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-credential': enrollData.deviceCredential,
    },
    body: JSON.stringify({
      agentVersion: '1.0.4',
      osVersion: 'Windows 11 Pro 23H2',
      printers: [
        { printerId: 'HP_LaserJet_M1005', printerStatus: 'online' },
      ],
    }),
  });

  const heartbeatRes = await handleAgentHeartbeat(heartbeatReq, adapter, TEST_ENV);
  assert.equal(heartbeatRes.status, 200, 'Heartbeat should succeed with 200 OK');
  const heartbeatData = await heartbeatRes.json();
  assert.equal(heartbeatData.ok, true, 'Heartbeat ok must be true');
  assert.equal(heartbeatData.deviceId, enrollData.deviceId, 'Heartbeat should match deviceId');

  // 3. Agent synchronizes detected printers
  const syncReq = new Request('https://edge.local/agent-sync-printers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-credential': enrollData.deviceCredential,
    },
    body: JSON.stringify({
      printers: [
        {
          systemPrinterName: 'HP LaserJet M1005',
          printerName: 'Counter Laser B&W',
          printerModel: 'HP LaserJet M1005 MFP',
          connectionType: 'usb',
          supportsColour: false,
          supportsDuplex: false,
          supportedPaperSizes: ['A4'],
          printerStatus: 'online',
        },
      ],
    }),
  });

  const syncRes = await handleAgentSyncPrinters(syncReq, adapter, TEST_ENV);
  assert.equal(syncRes.status, 200, 'Printer sync should succeed with 200 OK');
  const syncData = await syncRes.json();
  assert.ok(Array.isArray(syncData.synced), 'Should return synced printers list');
  assert.equal(syncData.synced.length, 1, 'Should have synced 1 printer');
  assert.equal(syncData.synced[0].systemPrinterName, 'HP LaserJet M1005');
});

test('[P6-05] Security: Unauthorized / Revoked Device Credentials Are Rejected', async () => {
  const { adapter } = await setupAdminEnv();

  // Test with invalid credential
  const invalidReq = new Request('https://edge.local/agent-heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-credential': 'invalid_secret_credential_1234567890',
    },
    body: JSON.stringify({ agentVersion: '1.0.4' }),
  });

  const res = await handleAgentHeartbeat(invalidReq, adapter, TEST_ENV);
  assert.equal(res.status, 401, 'Invalid device credential must be rejected with 401');
});
