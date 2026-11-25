import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, exportJWK, SignJWT, type JSONWebKeySet } from 'jose';
import {
  handleAdminBootstrap,
  handleAgentEnroll,
  handleAgentHeartbeat,
  handleAgentSyncPrinters,
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_FIREBASE_UID = 'firebase_admin_uid_aman_01';
const TEST_KID = 'firebase-phase8-kid-1';

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

test('[P8-01] Inno Setup Production Installer Script Enforces Service Recovery, Delayed Auto-Start & Safe Upgrade', () => {
  const root = process.cwd();
  const issPath = path.join(root, 'agent', 'installer', 'ACScan2PrintAgent.iss');
  assert.ok(fs.existsSync(issPath), 'ACScan2PrintAgent.iss must exist');

  const iss = fs.readFileSync(issPath, 'utf8');
  assert.ok(iss.includes('PrivilegesRequired=admin'), 'Installer must require Administrator elevation');
  assert.ok(iss.includes('ArchitecturesAllowed=x64compatible'), 'Installer must target Windows 11 x64');
  assert.ok(iss.includes('start= delayed-auto'), 'Service must register with delayed-auto start');
  assert.ok(iss.includes('failure {#MyServiceName} reset= 86400 actions= restart/5000/restart/15000/restart/30000'), 'Service must configure crash recovery');
  assert.ok(iss.includes('icacls.exe'), 'Installer must harden ProgramData ACLs');
  assert.ok(iss.includes('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'), 'Installer must register Tray auto-start');
  assert.ok(iss.includes('PrepareToInstall'), 'Installer must stop running service cleanly before upgrading binaries');
  assert.ok(iss.includes('[UninstallRun]'), 'Installer must cleanly remove service during uninstall');
});

test('[P8-02] PowerShell Deployment, Release Packaging, Uninstall & Health Scripts Exist with Safeguards', () => {
  const root = process.cwd();
  const scriptsDir = path.join(root, 'agent', 'installer', 'scripts');

  const publishScript = fs.readFileSync(path.join(scriptsDir, 'publish-release.ps1'), 'utf8');
  assert.ok(publishScript.includes('--self-contained true'), 'publish-release.ps1 must publish self-contained binaries');
  assert.ok(publishScript.includes('checksums.sha256'), 'publish-release.ps1 must emit SHA-256 manifest');

  const installScript = fs.readFileSync(path.join(scriptsDir, 'install-agent.ps1'), 'utf8');
  assert.ok(installScript.includes('WindowsBuiltInRole]::Administrator'), 'install-agent.ps1 must verify admin elevation');
  assert.ok(installScript.includes('SHA256'), 'install-agent.ps1 must verify staged binary checksums');
  assert.ok(installScript.includes('start= delayed-auto'), 'install-agent.ps1 must configure delayed auto-start');
  assert.ok(installScript.includes('restart/5000/restart/15000/restart/30000'), 'install-agent.ps1 must configure service recovery');

  const uninstallScript = fs.readFileSync(path.join(scriptsDir, 'uninstall-agent.ps1'), 'utf8');
  assert.ok(uninstallScript.includes('sc.exe delete'), 'uninstall-agent.ps1 must delete Windows Service');
  assert.ok(uninstallScript.includes('-PurgeData'), 'uninstall-agent.ps1 must support optional -PurgeData flag');

  const healthScript = fs.readFileSync(path.join(scriptsDir, 'health-check.ps1'), 'utf8');
  assert.ok(healthScript.includes('ACScan2PrintAgent'), 'health-check.ps1 must inspect Agent service');
  assert.ok(healthScript.includes('Spooler'), 'health-check.ps1 must inspect Windows Print Spooler');
  assert.ok(healthScript.includes('tvtfgsijxlxpwgakpeag.supabase.co'), 'health-check.ps1 must verify backend TLS reachability');
});

test('[P8-03] SafeLogger Implements Rolling File Logging, 14-Day Retention & Secret Redaction', () => {
  const root = process.cwd();
  const loggerPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Diagnostics', 'SafeLogger.cs');
  const logger = fs.readFileSync(loggerPath, 'utf8');

  assert.ok(logger.includes('CommonApplicationData'), 'SafeLogger must target ProgramData\\ACScan2Print\\Logs');
  assert.ok(logger.includes('agent-{DateTime.UtcNow:yyyyMMdd}.log'), 'SafeLogger must write rolling daily log files');
  assert.ok(logger.includes('PruneOldLogs'), 'SafeLogger must implement log retention pruning');
  assert.ok(logger.includes('[REDACTED_HASH]'), 'SafeLogger must redact 64-char hex hashes');
  assert.ok(logger.includes('token=[REDACTED]'), 'SafeLogger must redact URL tokens');
  assert.ok(logger.includes('x-device-credential'), 'SafeLogger must redact credential headers');

  const workerPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'Worker.cs');
  const worker = fs.readFileSync(workerPath, 'utf8');
  assert.ok(worker.includes('SafeLogger.PruneOldLogs(14)'), 'Worker must prune logs older than 14 days');
});

test('[P8-04] Worker & Tray Projects & Production Appsettings Configure Release Metadata', () => {
  const root = process.cwd();
  const workerCsproj = fs.readFileSync(path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'ACScan2Print.Agent.Worker.csproj'), 'utf8');
  assert.ok(workerCsproj.includes('<Version>1.0.4</Version>'));
  assert.ok(workerCsproj.includes('<RuntimeIdentifiers>win-x64</RuntimeIdentifiers>'));
  assert.ok(workerCsproj.includes('<PublishSingleFile>true</PublishSingleFile>'));

  const trayCsproj = fs.readFileSync(path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Tray', 'ACScan2Print.Agent.Tray.csproj'), 'utf8');
  assert.ok(trayCsproj.includes('<Version>1.0.4</Version>'));
  assert.ok(trayCsproj.includes('<RuntimeIdentifiers>win-x64</RuntimeIdentifiers>'));

  const prodSettings = JSON.parse(
    fs.readFileSync(path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'appsettings.Production.json'), 'utf8')
  );
  assert.equal(prodSettings.ACScan2Print.ServiceName, 'ACScan2PrintAgent');
  assert.equal(prodSettings.ACScan2Print.LogRetentionDays, 14);
  assert.equal(prodSettings.ACScan2Print.LeaseDurationSeconds, 180);
});

test('[P8-05] Service Upgrade Continuity: Enrolled Device Resumes Heartbeat & Sync Without Re-Enrollment', async () => {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getTestJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signTestFirebaseToken();

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

  // Enroll v1.0.3 agent before upgrade
  const enrollRes = await handleAgentEnroll(
    new Request('https://edge.local/agent-enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({
        deviceName: 'COUNTER-PC-01',
        osVersion: 'Windows 11 Pro 23H2',
        agentVersion: '1.0.3',
        activateImmediately: true,
      }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(enrollRes.status, 201);
  const { deviceId, deviceCredential } = await enrollRes.json();

  // After installer upgrades service to v1.0.4 using preserved DPAPI credential:
  const hbRes = await handleAgentHeartbeat(
    new Request('https://edge.local/agent-heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': deviceCredential },
      body: JSON.stringify({
        agentVersion: '1.0.4',
        osVersion: 'Windows 11 Pro 24H2',
        printers: [],
      }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(hbRes.status, 200);
  const hbData = await hbRes.json();
  assert.equal(hbData.ok, true);
  assert.equal(hbData.deviceId, deviceId);

  const syncRes = await handleAgentSyncPrinters(
    new Request('https://edge.local/agent-sync-printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-credential': deviceCredential },
      body: JSON.stringify({
        printers: [
          {
            systemPrinterName: 'HP_LaserJet_M1005',
            printerName: 'HP LaserJet M1005 MFP',
            printerModel: 'HP LaserJet M1005 MFP',
            connectionType: 'usb',
            supportsColour: false,
            supportsDuplex: false,
            supportedPaperSizes: ['A4', 'Legal'],
            printerStatus: 'online',
          },
        ],
      }),
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(syncRes.status, 200);
  const deviceRecord = await adapter.getDeviceById!(deviceId);
  assert.equal(deviceRecord?.agent_version, '1.0.4');
});
