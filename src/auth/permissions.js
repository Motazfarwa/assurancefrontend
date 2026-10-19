export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MEMBER: 'member',
});

export const PERMISSIONS = Object.freeze({
  USERS_MANAGE: 'users:manage',
  POLICIES_VIEW_ALL: 'policies:view_all',
  POLICIES_VIEW_OWN: 'policies:view_own',
  POLICIES_MANAGE: 'policies:manage',
  CLAIMS_VIEW_ALL: 'claims:view_all',
  CLAIMS_VIEW_OWN: 'claims:view_own',
  CLAIMS_CREATE: 'claims:create',
  CLAIMS_REVIEW: 'claims:review',
  REPORTS_VIEW: 'reports:view',
  SETTINGS_MANAGE: 'settings:manage',
});

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: [
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.POLICIES_VIEW_ALL,
    PERMISSIONS.POLICIES_MANAGE,
    PERMISSIONS.CLAIMS_VIEW_ALL,
    PERMISSIONS.CLAIMS_REVIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
  ],
  [ROLES.MEMBER]: [
    PERMISSIONS.POLICIES_VIEW_OWN,
    PERMISSIONS.CLAIMS_VIEW_OWN,
    PERMISSIONS.CLAIMS_CREATE,
  ],
});

export function hasPermission(user, permission) {
  return Boolean(user && ROLE_PERMISSIONS[user.role]?.includes(permission));
}
