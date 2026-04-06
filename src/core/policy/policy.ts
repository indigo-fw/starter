/**
 * Centralized RBAC — capability-based access control.
 *
 * Policy.for(role).can('section.content')  — capability check
 * Policy.for(role).canAccessAdmin()        — any admin section
 * isSuperAdmin(role)                       — superadmin identity
 */

export const Role = {
  USER: 'user',
  EDITOR: 'editor',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
} as const;
export type UserRole = (typeof Role)[keyof typeof Role];
export const ROLES = Object.values(Role) as [UserRole, ...UserRole[]];

export type AdminSection = 'dashboard' | 'content' | 'media' | 'structure' | 'users' | 'settings' | 'billing' | 'organizations';

export type Capability =
  | `section.${AdminSection}`
  | 'privilege.manage_roles';

const ALL_SECTIONS: AdminSection[] = [
  'dashboard',
  'content',
  'media',
  'structure',
  'users',
  'settings',
  'billing',
  'organizations',
];

const ROLE_CAPABILITIES: Record<
  UserRole,
  Partial<Record<Capability, boolean>>
> = {
  [Role.USER]: {},
  [Role.EDITOR]: {
    'section.dashboard': true,
    'section.content': true,
    'section.media': true,
    'section.structure': true,
  },
  [Role.ADMIN]: {
    'section.dashboard': true,
    'section.content': true,
    'section.media': true,
    'section.structure': true,
    'section.users': true,
    'section.settings': true,
    'section.billing': true,
    'section.organizations': true,
    'privilege.manage_roles': true,
  },
  [Role.SUPERADMIN]: {
    // All capabilities return true via can() shortcut
  },
};

export class Policy {
  constructor(
    private role: string,
    private userId?: string
  ) {}

  static for(role: string | undefined | null, userId?: string): Policy {
    const normalized = role && role in ROLE_CAPABILITIES ? role : Role.USER;
    return new Policy(normalized, userId);
  }

  private get caps(): Partial<Record<Capability, boolean>> {
    return ROLE_CAPABILITIES[this.role as UserRole];
  }

  can(capability: Capability): boolean {
    if (this.role === Role.SUPERADMIN) return true;
    return this.caps[capability] === true;
  }

  canAccessAdmin(): boolean {
    if (this.role === Role.SUPERADMIN) return true;
    return (
      this.role !== Role.USER &&
      Object.keys(this.caps).some((k) => k.startsWith('section.'))
    );
  }

  getSections(): AdminSection[] {
    if (this.role === Role.SUPERADMIN) return ALL_SECTIONS;
    return ALL_SECTIONS.filter((s) => this.can(`section.${s}`));
  }
}

export function isSuperAdmin(userRole: string | undefined | null): boolean {
  return (userRole ?? Role.USER) === Role.SUPERADMIN;
}
