"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/supabase-shim";
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  findUserByEmail,
  userExistsByEmail,
  seedTenantDefaults,
  SESSION_COOKIE,
} from "@/lib/auth-server";
import { getT } from "@/lib/i18n";

export type AuthResult = { error?: string };

export async function signIn(formData: FormData): Promise<AuthResult> {
  const t = await getT();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) return { error: t("auth.login_error") };

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { error: t("auth.login_error") };
  }

  const db = await getDb();
  const rows = db.exec(`SELECT tenantId FROM tenant_users WHERE userId = '${user.id}' AND status = 'active' ORDER BY createdAt ASC LIMIT 1`);
  if (rows.length === 0 || rows[0].values.length === 0) {
    return { error: t("auth.login_error") };
  }
  const tenantId = String(rows[0].values[0]);

  const token = await createSession(user.id, tenantId);
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });

  redirect("/overview");
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const t = await getT();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const tenantName = String(formData.get("tenantName") || "").trim();

  if (!email || !password || !fullName || !tenantName) {
    return { error: t("auth.signup_error") };
  }
  if (password.length < 6) {
    return { error: t("auth.password_short") };
  }
  if (await userExistsByEmail(email)) {
    return { error: t("auth.email_exists") };
  }

  const db = await getDb();
  const nowIso = new Date().toISOString();
  const userId = `user-${randomUUID()}`;
  const tenantId = `tenant-${randomUUID()}`;

  db.exec(
    `INSERT INTO users (id, email, fullName, passwordHash, createdAt, updatedAt) VALUES ('${userId}', '${email.replace(/'/g, "''")}', '${fullName.replace(/'/g, "''")}', '${hashPassword(password)}', '${nowIso}', '${nowIso}')`
  );
  await seedTenantDefaults(tenantId, tenantName, nowIso);
  db.exec(
    `INSERT INTO tenant_users (id, tenantId, userId, roleId, status, createdAt) VALUES ('${randomUUID()}', '${tenantId}', '${userId}', 'owner-role', 'active', '${nowIso}')`
  );
  db.exec(
    `INSERT OR IGNORE INTO settings (userId, tenantId) VALUES ('${userId}', '${tenantId}')`
  );
  const { persist } = await import("@/lib/db/supabase-shim");
  persist();

  const token = await createSession(userId, tenantId);
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });

  redirect("/overview");
}

export async function logout() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSession(token);
    store.delete(SESSION_COOKIE);
  }
  redirect("/login");
}

export async function getSessionStatus() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE)?.value);
}
