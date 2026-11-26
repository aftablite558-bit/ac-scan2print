// AC Scan2Print — Unified Firebase Hosting Bundle Assembler
// Builds Admin Control Center (dist/) + Customer QR Portal (dist-customer/ with base=/quick-print/)
// and mounts Customer Portal cleanly at dist/quick-print/ for single-site Firebase Hosting deploy.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function assembleUnifiedHostingDist(rootDir = process.cwd()) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  execFileSync(npmCmd, ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  execFileSync(
    npmCmd,
    ['exec', '--', 'vite', 'build', '--config', 'customer-portal/vite.config.ts', '--base=/quick-print/'],
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  );

  const distDir = path.join(rootDir, 'dist');
  const distCustomerDir = path.join(rootDir, 'dist-customer');
  const mountedCustomerDir = path.join(distDir, 'quick-print');

  const adminIndex = path.join(distDir, 'index.html');
  const customerIndex = path.join(distCustomerDir, 'index.html');
  if (!fs.existsSync(adminIndex) || !fs.existsSync(customerIndex)) {
    throw new Error('Missing dist/index.html or dist-customer/index.html after Vite builds.');
  }

  fs.rmSync(mountedCustomerDir, { recursive: true, force: true });
  fs.cpSync(distCustomerDir, mountedCustomerDir, { recursive: true });

  const mountedCustomerIndex = path.join(mountedCustomerDir, 'index.html');
  if (!fs.existsSync(mountedCustomerIndex)) {
    throw new Error('Failed to assemble dist/quick-print/index.html.');
  }

  return { adminIndex, customerIndex, mountedCustomerIndex };
}

const isCliEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('assemble-hosting-dist.mjs');

if (isCliEntry) {
  const res = assembleUnifiedHostingDist(process.cwd());
  console.log(`Unified hosting bundle ready:\n- Admin: ${res.adminIndex}\n- Customer (/quick-print): ${res.mountedCustomerIndex}`);
}
