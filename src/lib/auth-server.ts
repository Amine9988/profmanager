import "server-only";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDb, persist } from "@/lib/db/supabase-shim";

export const SESSION_COOKIE = "pm_session";
export const SESSION_DAYS = 30;
export const TRIAL_DAYS = 3;

export const accountsMode = () => process.env.AUTH_MODE === "accounts";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

interface SessionRow {
  userId: string;
  tenantId: string;
  expiresAt: string;
}

export async function createSession(userId: string, tenantId: string): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  db.exec(
    `INSERT INTO auth_sessions (id, userId, tenantId, tokenHash, createdAt, expiresAt) VALUES ('${randomUUID()}', '${userId}', '${tenantId}', '${sha256(token)}', '${now.toISOString()}', '${expiresAt}')`
  );
  _persist();
  return token;
}

export async function getSession(token: string): Promise<SessionRow | null> {
  if (!token) return null;
  const db = await getDb();
  const rows = db.exec(`SELECT userId, tenantId, expiresAt FROM auth_sessions WHERE tokenHash = '${sha256(token)}'`);
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const v = rows[0].values[0];
  const row: SessionRow = { userId: String(v[0]), tenantId: String(v[1]), expiresAt: String(v[2]) };
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await deleteSession(token);
    return null;
  }
  return row;
}

export async function deleteSession(token: string) {
  if (!token) return;
  const db = await getDb();
  db.exec(`DELETE FROM auth_sessions WHERE tokenHash = '${sha256(token)}'`);
  _persist();
}

export async function clearExpiredSessions() {
  const db = await getDb();
  db.exec(`DELETE FROM auth_sessions WHERE expiresAt < '${new Date().toISOString()}'`);
  _persist();
}

export async function tenantIsFrozen(tenantId: string): Promise<boolean> {
  const db = await getDb();
  const rows = db.exec(`SELECT trialEndsAt FROM tenants WHERE id = '${tenantId}'`);
  if (rows.length === 0 || rows[0].values.length === 0) return false;
  const trialEndsAt = String(rows[0].values[0]);
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() < Date.now();
}

export async function userExistsByEmail(email: string): Promise<boolean> {
  const db = await getDb();
  const rows = db.exec(`SELECT id FROM users WHERE email = '${email.replace(/'/g, "''")}'`);
  return rows.length > 0 && rows[0].values.length > 0;
}

export async function findUserByEmail(email: string): Promise<{ id: string; passwordHash: string | null } | null> {
  const db = await getDb();
  const rows = db.exec(`SELECT id, passwordHash FROM users WHERE email = '${email.replace(/'/g, "''")}'`);
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const v = rows[0].values[0];
  return { id: String(v[0]), passwordHash: v[1] == null ? null : String(v[1]) };
}

export async function getUserById(id: string): Promise<{ id: string; email: string | null; fullName: string | null } | null> {
  const db = await getDb();
  const rows = db.exec(`SELECT id, email, fullName FROM users WHERE id = '${id.replace(/'/g, "''")}'`);
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const v = rows[0].values[0];
  return { id: String(v[0]), email: v[1] == null ? null : String(v[1]), fullName: v[2] == null ? null : String(v[2]) };
}

export async function seedTenantDefaults(tenantId: string, tenantName: string, nowIso: string) {
  const db = await getDb();
  const slug = `t${tenantId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
  db.exec(
    `INSERT OR IGNORE INTO tenants (id, name, slug, createdAt, updatedAt, trialStartsAt, trialEndsAt) VALUES ('${tenantId}', '${tenantName.replace(/'/g, "''")}', '${slug}', '${nowIso}', '${nowIso}', '${nowIso}', '${new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000).toISOString()}')`
  );

  const levelNames: Array<[string, string, string, string, string]> = [
    ["1", "أولى ابتدائي", "1ère Primaire", "1st Primary", "primary"],
    ["2", "ثانية ابتدائي", "2ème Primaire", "2nd Primary", "primary"],
    ["3", "ثالثة ابتدائي", "3ème Primaire", "3rd Primary", "primary"],
    ["4", "رابعة ابتدائي", "4ème Primaire", "4th Primary", "primary"],
    ["5", "خامسة ابتدائي", "5ème Primaire", "5th Primary", "primary"],
    ["6", "أولى متوسط", "1ère AM", "1st Middle", "middle"],
    ["7", "ثانية متوسط", "2ème AM", "2nd Middle", "middle"],
    ["8", "ثالثة متوسط", "3ème AM", "3rd Middle", "middle"],
    ["9", "رابعة متوسط", "4ème AM", "4th Middle", "middle"],
    ["10", "أولى ثانوي", "1ère AS", "1st Secondary", "secondary"],
    ["11", "ثانية ثانوي", "2ème AS", "2nd Secondary", "secondary"],
    ["12", "ثالثة ثانوي", "3ème AS", "3rd Secondary", "secondary"],
  ];
  for (const [idx, ar, fr, en, cycle] of levelNames) {
    db.exec(
      `INSERT OR IGNORE INTO levels (id, tenantId, nameAr, nameFr, nameEn, cycle, sortOrder, status, createdAt, updatedAt) VALUES ('${tenantId}-level-${idx}', '${tenantId}', '${ar}', '${fr}', '${en}', '${cycle}', ${Number(idx) - 1}, 'active', '${nowIso}', '${nowIso}')`
    );
  }

  const cashCategories: Array<[string, string, string]> = [
    ["cat-income-1", "income", "Paiement"],
    ["cat-income-2", "income", "Inscription"],
    ["cat-income-3", "income", "Vente"],
    ["cat-income-4", "income", "Autre revenu"],
    ["cat-expense-1", "expense", "Salaire"],
    ["cat-expense-2", "expense", "Loyer"],
    ["cat-expense-3", "expense", "Électricité"],
    ["cat-expense-4", "expense", "Fournitures"],
    ["cat-expense-5", "expense", "Entretien"],
    ["cat-expense-6", "expense", "Autre dépense"],
  ];
  for (const [key, type, name] of cashCategories) {
    db.exec(
      `INSERT OR IGNORE INTO cash_categories (id, tenantId, name, type, color, createdAt) VALUES ('${tenantId}-${key}', '${tenantId}', '${name}', '${type}', '${key.includes("income") ? "#22c55e" : "#ef4444"}', '${nowIso}')`
    );
  }
  _persist();
}

function _persist() {
  persist();
}
