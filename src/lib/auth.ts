import "server-only";
import { cache } from "react";
import { createLocalClient, getDb } from "@/lib/db/supabase-shim";
import { DEFAULT_USER_ID } from "@/lib/db/schema";
import { getT } from "@/lib/i18n";

export class AuthError extends Error {}

function getLocalUser() {
  return {
    id: process.env.DEFAULT_USER_ID ?? DEFAULT_USER_ID,
    email: "desktop@profmanager.local",
  };
}

export const getTenantContext = cache(async () => {
  const user = getLocalUser();
  const client = createLocalClient();

  const { data: tenantUser } = await client
    .from("tenant_users")
    .select("tenantId, roleId, roles!inner(name, role_permissions!inner(permissions!inner(key)))")
    .eq("userId", user.id)
    .eq("status", "active")
    .order("createdAt", { ascending: true })
    .limit(1)
    .single();

  if (!tenantUser) {
    const db = await getDb();
    const existing = db.exec("SELECT id, tenantId, roleId FROM tenant_users WHERE status = 'active' ORDER BY createdAt ASC LIMIT 1");
    if (existing.length > 0 && existing[0].values.length > 0) {
      const row = existing[0].values[0];
      const tenantId = row[1] as string;
      const roleId = row[2] as string;
      const roleRow = db.exec(`SELECT name FROM roles WHERE id = '${roleId}'`);
      const roleName = (roleRow.length > 0 && roleRow[0].values.length > 0)
        ? String(roleRow[0].values[0]) : "owner";
      return {
        userId: user.id,
        email: user.email,
        tenantId,
        roleId,
        roleName,
        permissions: [],
        supabase: client,
      };
    }
    return {
      userId: user.id,
      email: user.email,
      tenantId: "default-tenant-id",
      roleId: "owner-role",
      roleName: "owner",
      permissions: [],
      supabase: client,
    };
  }

  const role = tenantUser.roles as unknown as Record<string, unknown>;
  const rolePermissions = (role.role_permissions || []) as Array<Record<string, unknown>>;

  return {
    userId: user.id,
    email: user.email,
    tenantId: tenantUser.tenantId as string,
    roleId: tenantUser.roleId as string,
    roleName: role.name as string,
    permissions: rolePermissions.map((rp: Record<string, unknown>) => {
      const perm = rp.permissions as Record<string, unknown>;
      return perm.key as string;
    }),
    supabase: client,
  };
});

export async function requirePermission(permissionKey: string) {
  const ctx = await getTenantContext();
  if (ctx.roleName === "owner") return ctx;
  if (!ctx.permissions.includes(permissionKey)) {
    const t = await getT();
    throw new AuthError(t("errors.permission_denied", { key: permissionKey }));
  }
  return ctx;
}

export async function createAuditLog(_params: {
  tenantId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  // Audit log disabled in local desktop mode
}
