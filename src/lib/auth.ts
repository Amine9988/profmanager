import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";

export class AuthError extends Error {}

async function requireUser() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login");
  return session.user;
}

export const getTenantContext = cache(async () => {
  const user = await requireUser();

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: tenantUser } = await admin
    .from("tenant_users")
    .select("tenantId, roleId, roles(name, role_permissions(permissions(key)))")
    .eq("userId", user.id)
    .eq("status", "active")
    .order("createdAt", { ascending: true })
    .limit(1)
    .single();

  if (!tenantUser) {
    redirect("/onboarding");
  }

  const role = tenantUser.roles as unknown as Record<string, unknown>;
  const rolePermissions = (role.role_permissions || []) as Array<Record<string, unknown>>;

  return {
    userId: user.id,
    email: user.email!,
    tenantId: tenantUser.tenantId as string,
    roleId: tenantUser.roleId as string,
    roleName: role.name as string,
    permissions: rolePermissions.map((rp: Record<string, unknown>) => {
      const perm = rp.permissions as Record<string, unknown>;
      return perm.key as string;
    }),
    supabase: admin,
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

export async function createAuditLog(params: {
  tenantId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await admin.from("audit_logs").insert({
    tenantId: params.tenantId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata,
  });
}
