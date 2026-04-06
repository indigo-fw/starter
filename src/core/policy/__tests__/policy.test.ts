import { describe, expect, it } from 'vitest';
import { Policy, Role, isSuperAdmin } from '../policy';

describe('Policy', () => {
  describe('for()', () => {
    it('normalizes null/undefined to USER role', () => {
      const policy = Policy.for(null);
      expect(policy.canAccessAdmin()).toBe(false);
    });

    it('normalizes unknown strings to USER role', () => {
      const policy = Policy.for('bogus');
      expect(policy.canAccessAdmin()).toBe(false);
    });

    it('normalizes undefined to USER role', () => {
      const policy = Policy.for(undefined);
      expect(policy.canAccessAdmin()).toBe(false);
    });
  });

  describe('can()', () => {
    it('user has no capabilities', () => {
      const p = Policy.for(Role.USER);
      expect(p.can('section.dashboard')).toBe(false);
      expect(p.can('section.content')).toBe(false);
      expect(p.can('section.users')).toBe(false);
    });

    it('editor can access dashboard, content, media', () => {
      const p = Policy.for(Role.EDITOR);
      expect(p.can('section.dashboard')).toBe(true);
      expect(p.can('section.content')).toBe(true);
      expect(p.can('section.media')).toBe(true);
      expect(p.can('section.users')).toBe(false);
      expect(p.can('section.settings')).toBe(false);
    });

    it('admin can access all sections', () => {
      const p = Policy.for(Role.ADMIN);
      expect(p.can('section.dashboard')).toBe(true);
      expect(p.can('section.content')).toBe(true);
      expect(p.can('section.media')).toBe(true);
      expect(p.can('section.users')).toBe(true);
      expect(p.can('section.settings')).toBe(true);
      expect(p.can('privilege.manage_roles')).toBe(true);
    });

    it('superadmin can do everything', () => {
      const p = Policy.for(Role.SUPERADMIN);
      expect(p.can('section.dashboard')).toBe(true);
      expect(p.can('section.users')).toBe(true);
      expect(p.can('section.settings')).toBe(true);
      expect(p.can('privilege.manage_roles')).toBe(true);
    });
  });

  describe('canAccessAdmin()', () => {
    it('user cannot access admin', () => {
      expect(Policy.for(Role.USER).canAccessAdmin()).toBe(false);
    });

    it('editor can access admin', () => {
      expect(Policy.for(Role.EDITOR).canAccessAdmin()).toBe(true);
    });

    it('admin can access admin', () => {
      expect(Policy.for(Role.ADMIN).canAccessAdmin()).toBe(true);
    });

    it('superadmin can access admin', () => {
      expect(Policy.for(Role.SUPERADMIN).canAccessAdmin()).toBe(true);
    });
  });

  describe('getSections()', () => {
    it('editor gets 4 sections', () => {
      const sections = Policy.for(Role.EDITOR).getSections();
      expect(sections).toEqual(['dashboard', 'content', 'media', 'structure']);
    });

    it('superadmin gets all 8 sections', () => {
      const sections = Policy.for(Role.SUPERADMIN).getSections();
      expect(sections).toHaveLength(8);
    });
  });
});

describe('isSuperAdmin', () => {
  it('returns true for superadmin role', () => {
    expect(isSuperAdmin(Role.SUPERADMIN)).toBe(true);
  });

  it('returns false for admin role', () => {
    expect(isSuperAdmin(Role.ADMIN)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSuperAdmin(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});
