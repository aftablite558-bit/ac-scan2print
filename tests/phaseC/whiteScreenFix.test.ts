// AC Scan2Print — Post-Login White Screen Root-Cause & Regression Tests
// Verifies apiRequest HTML rejection, workspaceState normalizers, ErrorBoundary recovery,
// direct-path/hash routing, and Admin session + static-hosting fallback resilience.

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ErrorBoundary } from '../../src/components/ErrorBoundary.tsx';
import { ApiError, apiRequest } from '../../src/lib/api.ts';
import {
  canAccessAdminRoute,
  createAdminSessionFromBackend,
} from '../../src/lib/scan2printAdmin.ts';
import { DEFAULT_APPEARANCE } from '../../src/utils/adminLogic.ts';
import {
  EMPTY_ACCESS_STATE,
  EMPTY_DASHBOARD_METRICS,
  normalizeAccessStatePayload,
  normalizeCmsStatePayload,
  normalizeDashboardOverviewPayload,
  normalizeEnquiriesPayload,
  normalizeGovtStatePayload,
  parseAppearanceSettings,
  parseLocationRoute,
  sanitizeErrorMessage,
} from '../../src/utils/workspaceState.ts';

test('[WhiteScreenFix-1] apiRequest rejects HTTP 200 HTML SPA fallback instead of resolving { error: html }', async () => {
  const spaHtmlResponse: typeof fetch = async () =>
    new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  await assert.rejects(
    async () => {
      await apiRequest('/dashboard/overview', undefined, spaHtmlResponse);
    },
    (err: unknown) =>
      err instanceof ApiError &&
      err.isNonJson === true &&
      err.status === 404 &&
      !err.message.includes('<!doctype html>')
  );

  // Also reject non-JSON body disguised as 200 text/plain
  const plainText200: typeof fetch = async () =>
    new Response('not json payload', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });

  await assert.rejects(
    async () => {
      await apiRequest('/cms/state', undefined, plainText200);
    },
    (err: unknown) => err instanceof ApiError && err.isNonJson === true && err.status === 502
  );

  // Valid JSON resolves normally
  const validJson: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, count: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const okPayload = await apiRequest<{ ok: boolean; count: number }>('/health', undefined, validJson);
  assert.deepEqual(okPayload, { ok: true, count: 3 });
});

test('[WhiteScreenFix-2] Workspace normalizers guarantee valid non-undefined arrays and metrics on corrupt/HTML payloads', () => {
  const corruptedInputs: unknown[] = [
    undefined,
    null,
    '<!doctype html><html></html>',
    { error: '<!doctype html>' },
    { metrics: null, recentActivities: 'oops' },
  ];

  for (const input of corruptedInputs) {
    const overview = normalizeDashboardOverviewPayload(input);
    assert.deepEqual(overview.metrics, EMPTY_DASHBOARD_METRICS);
    assert.deepEqual(overview.recentActivities, []);

    const cms = normalizeCmsStatePayload(input);
    assert.equal(cms.businessProfile, null);
    assert.equal(cms.heroSection, null);
    assert.ok(Array.isArray(cms.notifications));
    assert.ok(Array.isArray(cms.services));
    assert.ok(Array.isArray(cms.galleryItems));

    const access = normalizeAccessStatePayload(input);
    assert.deepEqual(access, EMPTY_ACCESS_STATE);

    const enquiries = normalizeEnquiriesPayload(input);
    assert.deepEqual(enquiries, []);

    const govt = normalizeGovtStatePayload(input);
    assert.deepEqual(govt, { sources: [], updates: [], fetchLogs: [] });
  }

  // Partial enquiries normalize missing notes arrays cleanly
  const partialEnquiries = normalizeEnquiriesPayload({
    enquiries: [{ id: 'enq-1', customer_name: 'Ravi', status: 'new' }],
  });
  assert.equal(partialEnquiries.length, 1);
  assert.deepEqual(partialEnquiries[0].notes, []);
});

test('[WhiteScreenFix-3] parseAppearanceSettings clamps frost and recovers safely from corrupt localStorage JSON', () => {
  const fallback = parseAppearanceSettings('{invalid-json');
  assert.equal(fallback.theme, DEFAULT_APPEARANCE.theme);
  assert.equal(fallback.wallpaper, DEFAULT_APPEARANCE.wallpaper);
  assert.equal(fallback.frost, DEFAULT_APPEARANCE.frost);

  const clamped = parseAppearanceSettings(
    JSON.stringify({
      theme: 'unexpected-mode',
      wallpaper: 'evil-wall',
      frost: 999,
      collapsedRail: true,
    })
  );
  assert.equal(clamped.theme, DEFAULT_APPEARANCE.theme);
  assert.equal(clamped.wallpaper, DEFAULT_APPEARANCE.wallpaper);
  assert.equal(clamped.frost, 95);
  assert.equal(clamped.collapsedRail, true);
});

test('[WhiteScreenFix-4] sanitizeErrorMessage strips HTML dumps and redacts Bearer/JWT/API tokens', () => {
  const htmlErr = new Error('<!DOCTYPE html><html><head></head><body>404</body></html>');
  assert.equal(
    sanitizeErrorMessage(htmlErr),
    'Received an HTML page instead of JSON from the backend endpoint.'
  );

  const jwtErr = new Error(
    'Failed with Authorization: Bearer secret_token_123 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig123 and ?apikey=sb_secret_xyz'
  );
  const sanitized = sanitizeErrorMessage(jwtErr);
  assert.equal(sanitized.includes('secret_token_123'), false);
  assert.equal(sanitized.includes('eyJhbGciOiJIUzI1NiJ9'), false);
  assert.equal(sanitized.includes('sb_secret_xyz'), false);
  assert.ok(sanitized.includes('Bearer [REDACTED]'));
  assert.ok(sanitized.includes('[REDACTED_JWT]'));
  assert.ok(sanitized.includes('?apikey=[REDACTED]'));
});

test('[WhiteScreenFix-5] parseLocationRoute supports hash routes and direct /admin subpaths', () => {
  assert.deepEqual(parseLocationRoute('', '/admin'), { main: 'home' });
  assert.deepEqual(parseLocationRoute('', '/admin/'), { main: 'home' });
  assert.deepEqual(parseLocationRoute('', '/admin/hardware'), { main: 'hardware', sub: 'printers' });
  assert.deepEqual(parseLocationRoute('', '/admin/cms/services'), {
    main: 'cms',
    sub: 'services',
  });
  assert.deepEqual(parseLocationRoute('#/settings/alerts', '/admin'), {
    main: 'settings',
    sub: 'alerts',
  });
});

test('[WhiteScreenFix-6] Admin session unlocks routes and ErrorBoundary renders sanitized recovery UI', () => {
  const session = createAdminSessionFromBackend({
    id: 'admin-row-1',
    firebaseUid: 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2',
    email: 'shariqueaman77@gmail.com',
    fullName: 'Sharique Aman',
    isActive: true,
  });
  assert.equal(canAccessAdminRoute(session), true);
  assert.equal(session.fullName, 'Sharique Aman');
  assert.ok(session.permissions.length > 0);

  // Deactivated admin must remain blocked
  assert.equal(
    canAccessAdminRoute(
      createAdminSessionFromBackend({
        id: 'admin-row-1',
        firebaseUid: 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2',
        email: 'shariqueaman77@gmail.com',
        fullName: 'Sharique Aman',
        isActive: false,
      })
    ),
    false
  );

  // ErrorBoundary healthy render passes child through
  const healthyHtml = renderToStaticMarkup(
    React.createElement(ErrorBoundary, {
      variant: 'fullscreen',
      children: React.createElement('div', null, 'Dashboard Ready'),
    })
  );
  assert.ok(healthyHtml.includes('Dashboard Ready'));

  // ErrorBoundary error state sanitizes message and renders recovery buttons
  const errState = ErrorBoundary.getDerivedStateFromError(
    new Error('Crash while reading Bearer top_secret_jwt')
  );
  assert.equal(errState.hasError, true);
  assert.equal(errState.errorMessage.includes('top_secret_jwt'), false);
  assert.ok(errState.errorMessage.includes('Bearer [REDACTED]'));

  const boundary = new ErrorBoundary({
    variant: 'fullscreen',
    onSignOut: () => {},
    onReturnOverview: () => {},
    children: null,
  });
  boundary.state = errState;
  const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);
  assert.ok(fallbackHtml.includes('Retry View'));
  assert.ok(fallbackHtml.includes('Overview'));
  assert.ok(fallbackHtml.includes('Reload Page'));
  assert.ok(fallbackHtml.includes('Sign Out'));
});
