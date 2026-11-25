import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  detectQueueNotifications,
  type QueueAlertSnapshot,
} from '../../src/utils/counterAlerts.ts';

test('[P9-01] Counter Alerts Detect Incoming Jobs, Payment Claims, Needs-Review Faults & Completions', () => {
  const baseline: QueueAlertSnapshot = {
    totalJobs: 10,
    pendingPayments: 1,
    attentionJobs: 0,
    completedJobs: 6,
  };

  // Initial load with null previous snapshot must emit zero false alarms
  assert.deepEqual(detectQueueNotifications(null, baseline), []);

  // No change emits zero events
  assert.deepEqual(detectQueueNotifications(baseline, { ...baseline }), []);

  // Failed / needs-review job takes top priority
  const attentionEvents = detectQueueNotifications(baseline, {
    ...baseline,
    attentionJobs: 2,
  });
  assert.equal(attentionEvents.length, 1);
  assert.equal(attentionEvents[0].kind, 'attention');
  assert.equal(attentionEvents[0].tone, 'bad');

  // New payment claim
  const paymentEvents = detectQueueNotifications(baseline, {
    ...baseline,
    pendingPayments: 3,
  });
  assert.equal(paymentEvents[0].kind, 'payment_claim');
  assert.equal(paymentEvents[0].tone, 'warn');

  // New incoming print job
  const newJobEvents = detectQueueNotifications(baseline, {
    ...baseline,
    totalJobs: 12,
  });
  assert.equal(newJobEvents[0].kind, 'new_job');
  assert.equal(newJobEvents[0].tone, 'info');

  // Completion event when no higher-severity alerts fired
  const completedEvents = detectQueueNotifications(baseline, {
    ...baseline,
    completedJobs: 7,
  });
  assert.equal(completedEvents[0].kind, 'completed');
  assert.equal(completedEvents[0].tone, 'good');
});

test('[P9-02] Shop QR Poster Generates Valid Vector SVG & DataURL Offline for Permanent Portal URL', async () => {
  const portalUrl = 'https://ac-scan2print.web.app/quick-print';
  const svgOutput = await QRCode.toString(portalUrl, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#111318', light: '#FFFFFF' },
  });
  assert.ok(svgOutput.includes('<svg'), 'Must produce valid SVG markup');
  assert.ok(svgOutput.includes('#111318'), 'Must use Obsidian Dark module fill');

  const dataUrl = await QRCode.toDataURL(portalUrl, { width: 320, margin: 2 });
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Must produce self-contained PNG data URL');

  const modalPath = path.join(
    process.cwd(),
    'src',
    'components',
    'print-management',
    'ShopQrPosterModal.tsx'
  );
  const modalSource = fs.readFileSync(modalPath, 'utf8');
  assert.ok(modalSource.includes('ShopQrPosterModal'), 'ShopQrPosterModal must exist');
  assert.ok(!modalSource.includes('dangerouslySetInnerHTML'), 'Must not inject raw HTML for QR rendering');
  assert.ok(!modalSource.includes('window.open'), 'Must avoid window.open inside iframe environments');
});

test('[P9-03] Customer TrackingPage Implements 5s Live Polling, Status Banners, Sound Chime & Browser Notification Opt-In', () => {
  const trackingPath = path.join(process.cwd(), 'customer-portal', 'src', 'pages', 'TrackingPage.tsx');
  const content = fs.readFileSync(trackingPath, 'utf8');

  assert.ok(content.includes('ACTIVE_POLLABLE_STATUSES'), 'Must define active non-terminal statuses');
  assert.ok(content.includes('5000'), 'Must poll active jobs every 5 seconds');
  assert.ok(content.includes('statusUpdateBanner'), 'Must render in-page live status update banner');
  assert.ok(content.includes('playCustomerPickupChime'), 'Must provide customer pickup audio chime');
  assert.ok(content.includes('Notification.requestPermission'), 'Must support browser notification opt-in');
  assert.ok(content.includes('Live (5s)'), 'Must display live polling indicator');
});

test('[P9-04] Customer ConfirmationPage Supports Native Share & Clipboard Fallbacks', () => {
  const confirmPath = path.join(process.cwd(), 'customer-portal', 'src', 'pages', 'ConfirmationPage.tsx');
  const content = fs.readFileSync(confirmPath, 'utf8');

  assert.ok(content.includes('handleShareTracking'), 'Must support share handler');
  assert.ok(content.includes('navigator.share'), 'Must use navigator.share when available');
  assert.ok(content.includes('Share link'), 'Must expose Share link action button');
});

test('[P9-05] Admin PrintManagementPage Integrates Background Queue Polling, Sound Alerts & Shop QR Poster', () => {
  const pagePath = path.join(process.cwd(), 'src', 'pages', 'PrintManagementPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('ShopQrPosterModal'), 'Must mount ShopQrPosterModal');
  assert.ok(content.includes('Shop QR Poster'), 'Must expose Shop QR Poster button');
  assert.ok(content.includes('detectQueueNotifications'), 'Must detect incoming queue changes');
  assert.ok(content.includes('playCounterChime'), 'Must play counter audio chimes when unmuted');
  assert.ok(content.includes('20000'), 'Must poll workspace every 20 seconds');
});
