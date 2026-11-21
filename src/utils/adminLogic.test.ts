import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIHAR_CATEGORIES,
  HELP_FAQS,
  filterFaqs,
  getActiveSidebarKey,
  getPageTitle,
  hasPermission,
  isPortraitReadyForApproval,
  parseHash,
} from './adminLogic.ts';
import type { AdminUserSession } from '../types/admin.ts';

test('parseHash routes valid CMS, Enquiries, Door 5, Access, and Settings pages cleanly', () => {
  assert.deepEqual(parseHash('#/home'), { main: 'home' });
  assert.deepEqual(parseHash('#/cms/hero'), { main: 'cms', sub: 'hero' });
  assert.deepEqual(parseHash('#/cms/portrait'), { main: 'cms', sub: 'portrait' });
  assert.deepEqual(parseHash('#/cms/catalog'), { main: 'cms', sub: 'services' });
  assert.deepEqual(parseHash('#/cms/unknown'), { main: 'cms', sub: 'business' });
  assert.deepEqual(parseHash('#/enquiries'), { main: 'enquiries', sub: undefined });
  assert.deepEqual(parseHash('#/bihar-updates/sources'), {
    main: 'bihar-updates',
    sub: 'sources',
  });
  assert.deepEqual(parseHash('#/access/audit'), { main: 'access', sub: 'audit' });
  assert.deepEqual(parseHash('#/settings/appearance'), {
    main: 'settings',
    sub: 'appearance',
  });
  assert.deepEqual(parseHash('#/help'), { main: 'help', sub: undefined });
  assert.deepEqual(parseHash('#/content/videos'), { main: 'home' });
});

test('getActiveSidebarKey groups CMS tabs into 3 sidebar sections cleanly', () => {
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'business' }), 'cms:business');
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'portrait' }), 'cms:business');
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'services' }), 'cms:catalog');
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'gallery' }), 'cms:catalog');
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'testimonials' }), 'cms:community');
  assert.equal(getActiveSidebarKey({ main: 'cms', sub: 'faqs' }), 'cms:community');
  assert.equal(getActiveSidebarKey({ main: 'bihar-updates', sub: 'updates' }), 'bihar-updates');
});

test('getPageTitle uses AMAN COMPUTER and module titles', () => {
  assert.equal(getPageTitle({ main: 'home' }), 'Admin Dashboard — AMAN COMPUTER');
  assert.equal(getPageTitle({ main: 'bihar-updates' }), 'Bihar Govt Updates — AMAN COMPUTER');
  assert.equal(getPageTitle({ main: 'help' }), 'Help — AMAN COMPUTER');
});

test('hasPermission enforces active flag and permission membership', () => {
  const activeEditor: AdminUserSession = {
    id: 'u1',
    email: 'editor@aman.local',
    fullName: 'Editor',
    designation: 'Editor',
    roleId: 'r1',
    roleName: 'Editor',
    permissions: ['services.write', 'govt.read'],
    isActive: true,
  };
  assert.equal(hasPermission(activeEditor, 'services.write'), true);
  assert.equal(hasPermission(activeEditor, 'users.manage'), false);
  assert.equal(hasPermission({ ...activeEditor, isActive: false }, 'services.write'), false);
  assert.equal(hasPermission(null, 'services.write'), false);
});

test('isPortraitReadyForApproval blocks failed BiRefNet outputs when BG removal is enabled', () => {
  assert.equal(
    isPortraitReadyForApproval({
      bg_removal_enabled: 1,
      processing_status: 'failed',
      processed_url: null,
    }),
    false
  );
  assert.equal(
    isPortraitReadyForApproval({
      bg_removal_enabled: 1,
      processing_status: 'succeeded',
      processed_url: '/uploads/owner-portraits/cutout.png',
    }),
    true
  );
  assert.equal(
    isPortraitReadyForApproval({
      bg_removal_enabled: 0,
      processing_status: 'skipped',
      processed_url: null,
    }),
    true
  );
});

test('BIHAR_CATEGORIES includes all 10 required Bihar Government categories', () => {
  assert.equal(BIHAR_CATEGORIES.length, 10);
  assert.ok(BIHAR_CATEGORIES.includes('Latest Government Jobs'));
  assert.ok(BIHAR_CATEGORIES.includes('Scholarships'));
  assert.ok(BIHAR_CATEGORIES.includes('Admit Cards'));
});

test('filterFaqs matches topic, question, and answer case-insensitively', () => {
  assert.equal(filterFaqs(HELP_FAQS, '').length, HELP_FAQS.length);
  assert.ok(filterFaqs(HELP_FAQS, 'birefnet').length >= 1);
  assert.equal(filterFaqs(HELP_FAQS, 'zzzz_nonexistent').length, 0);
});
