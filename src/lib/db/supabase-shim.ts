import initSqlJs, { SqlJsStatic, Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { SCHEMA_SQL, SEED_SQL, DEFAULT_TENANT_ID, DEFAULT_USER_ID } from "./schema";
import { queueBackupPush, fetchBackup } from "./backup-store";

interface Filter {
  column: string;
  operator: string;
  value: unknown;
}

interface OrderBy {
  column: string;
  ascending: boolean;
}

interface JoinDef {
  table: string;
  alias?: string;
  columns: string[];
  joins: JoinDef[];
  inner: boolean;
}

interface ParsedSelect {
  columns: string[];
  joins: JoinDef[];
}

type QueryResult = { data: any; error: any; count?: number };

let _sql: SqlJsStatic | null = null;
let _db: SqlJsDatabase | null = null;
let _dbPath: string | null = null;
let _dirty = false;
let _lastLoadMtime = 0;
let _lastLoadSize = 0;
let _backupState: "local" | "restored" | "absent" | "unknown" = "unknown";
let _heavyBackfillDone = false;

export function getDbPath(): string {
  if (_dbPath) return _dbPath;
  _dbPath = process.env.LOCAL_DB_PATH || path.join(process.cwd(), "profmanager.db");
  return _dbPath;
}

export function setDbPath(p: string) {
  _dbPath = p;
}

function saveDb() {
  if (!_db || !_dbPath || !_dirty) return;
  try {
    const data = _db.export();
    fs.writeFileSync(_dbPath, Buffer.from(data));
    _dirty = false;
    try {
      const st = fs.statSync(_dbPath);
      _lastLoadMtime = st.mtimeMs;
      _lastLoadSize = st.size;
    } catch {}
    try { if (_backupState !== "unknown") queueBackupPush(data); } catch {}
  } catch {} /* fail silently */
}

function sqliteVal(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  return v;
}

function jsVal(v: unknown): any {
  if (v instanceof Uint8Array) return v;
  return v;
}

class StmtWrapper {
  private db: SqlJsDatabase;
  private sql: string;
  private stmt: any;
  constructor(db: SqlJsDatabase, sql: string) { this.db = db; this.sql = sql; }

  private prepare() {
    if (!this.stmt) this.stmt = this.db.prepare(this.sql);
    return this.stmt;
  }

  bind(params: any[]) {
    const s = this.prepare();
    s.bind(params.map(sqliteVal));
    return this;
  }

  all(params: any[] = []): Record<string, any>[] {
    const s = this.prepare();
    if (params.length > 0) s.bind(params.map(sqliteVal));
    const rows: Record<string, any>[] = [];
    while (s.step()) {
      const row = s.getAsObject();
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) clean[k] = jsVal(v);
      rows.push(clean);
    }
    s.free();
    this.stmt = null;
    return rows;
  }

  get(params: any[] = []): Record<string, any> | null {
    const s = this.prepare();
    if (params.length > 0) s.bind(params.map(sqliteVal));
    let row: Record<string, any> | null = null;
    if (s.step()) {
      const raw = s.getAsObject();
      row = {};
      for (const [k, v] of Object.entries(raw)) row[k] = jsVal(v);
    }
    s.free();
    this.stmt = null;
    return row;
  }

  run(params: any[] = []) {
    const s = this.prepare();
    if (params.length > 0) s.bind(params.map(sqliteVal));
    s.step();
    s.free();
    this.stmt = null;
  }

  free() { if (this.stmt) { this.stmt.free(); this.stmt = null; } }
}

function refreshLoadMarkers() {
  try {
    const st = fs.statSync(getDbPath());
    _lastLoadMtime = st.mtimeMs;
    _lastLoadSize = st.size;
  } catch {
    _lastLoadMtime = 0;
    _lastLoadSize = 0;
  }
}

export async function getDb(): Promise<SqlJsDatabase> {
  const dbPath = getDbPath();
  if (_db) {
    try {
      const stat = fs.statSync(dbPath);
      // Reload whenever the file's mtime OR size changed since we last read it.
      // A pure `>` mtime check misses writes that land within the same millisecond
      // (different module instances save the same file back-to-back), and a same-size
      // rewrite can dodge an mtime-only comparison; bounding on both covers factory
      // resets, restores and concurrent instances.
      if (stat.mtimeMs !== _lastLoadMtime || stat.size !== _lastLoadSize) {
        _db.close();
        _db = null;
      }
    } catch {}
  }
  if (_db) return _db;
  if (!_sql) {
    _sql = await initSqlJs({
      locateFile: (file: string) => {
        const p = path.join(__dirname, "node_modules", "sql.js", "dist", file);
        try { if (fs.existsSync(p)) return p } catch {}
        return path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "sql.js", "dist", file);
      },
    });
  }
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    try {
      const remote = await fetchBackup();
      if (remote && remote.length > 0) {
        fs.writeFileSync(dbPath, Buffer.from(remote));
        _backupState = "restored";
      } else {
        _backupState = "absent";
      }
    } catch {
      _backupState = "unknown";
    }
  } else {
    _backupState = "local";
  }
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    _db = new _sql.Database(buf);
    refreshLoadMarkers();
  } else {
    _db = new _sql.Database();
  }
  const tableCount = (_db.exec("SELECT count(*) FROM sqlite_master WHERE type='table'")?.[0]?.values?.[0]?.[0] as number) || 0;
  if (tableCount === 0) {
    _db.exec(SCHEMA_SQL);
    _db.exec(SEED_SQL);
    _dirty = true;
    saveDb();
  } else {
    const levelCount = (_db.exec(`SELECT count(*) FROM levels WHERE tenantId = '${DEFAULT_TENANT_ID}'`)?.[0]?.values?.[0]?.[0] as number) || 0;
    if (levelCount === 0) {
      _db.exec(SEED_SQL);
      _dirty = true;
      saveDb();
    }
  }
  _db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendances_session_student ON attendances(sessionId, studentId)");
  try { _db.exec("ALTER TABLE payments ADD COLUMN groupId TEXT"); } catch {}
  // Backfill legacy payments (recorded before groupId existed): attribute each
  // to the active group whose price matches the amount due (earliest enrollment wins).
  try {
    const _nullPay = (_db.exec("SELECT count(*) FROM payments WHERE groupId IS NULL")[0]?.values[0][0] as number) || 0;
    if (_nullPay > 0) {
      _db.exec(`
      UPDATE payments
      SET groupId = (
        SELECT gs.groupId
        FROM group_students gs
        JOIN "groups" g ON g.id = gs.groupId
        WHERE gs.studentId = payments.studentId
          AND gs.status = 'active'
          AND g.pricePerSession = payments.amountDue
        ORDER BY gs.enrolledAt ASC
        LIMIT 1
      )
      WHERE groupId IS NULL
        AND EXISTS (
          SELECT 1 FROM group_students gs2
          JOIN "groups" g2 ON g2.id = gs2.groupId
          WHERE gs2.studentId = payments.studentId
            AND gs2.status = 'active'
            AND g2.pricePerSession = payments.amountDue
        )
    `);
    }
  } catch {}
  // Runtime migrations
  try { _db.exec("ALTER TABLE tenants ADD COLUMN schoolPhone TEXT"); } catch {}
  try { _db.exec("ALTER TABLE tenants ADD COLUMN schoolLogo TEXT"); } catch {}
  try { _db.exec("ALTER TABLE students ADD COLUMN fatherPhone TEXT"); } catch {}
try { _db.exec("ALTER TABLE students ADD COLUMN clientType TEXT NOT NULL DEFAULT 'institution'"); } catch {}
try { _db.exec("ALTER TABLE teachers ADD COLUMN salaryAmountTeacher REAL NOT NULL DEFAULT 0"); } catch {}
try { _db.exec("ALTER TABLE group_students ADD COLUMN clientType TEXT NOT NULL DEFAULT 'institution'"); } catch {}
try { _db.exec("UPDATE group_students SET clientType = COALESCE((SELECT clientType FROM students WHERE students.id = group_students.studentId), 'institution') WHERE clientType = 'institution' AND EXISTS (SELECT 1 FROM students WHERE students.id = group_students.studentId AND students.clientType = 'teacher')"); } catch {}
// Attendance upsert relies on a real uniqueness constraint; without this index
// repeated marks silently pile up duplicate rows and inflate presence counts.
try {
  _db.exec("DELETE FROM attendances WHERE rowid NOT IN (SELECT MIN(rowid) FROM attendances GROUP BY sessionId, studentId)");
  _db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_attendances_session_student ON attendances(sessionId, studentId)");
} catch {}
try { _db.exec("ALTER TABLE payments ADD COLUMN discountPercent REAL NOT NULL DEFAULT 0"); } catch {}
try { _db.exec(`CREATE TABLE IF NOT EXISTS deleted_items (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, userId TEXT NOT NULL, sourceType TEXT NOT NULL, originalData TEXT NOT NULL, description TEXT, deletedAt TEXT NOT NULL)`); } catch {}
  try { _db.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT"); } catch {}
  try { _db.exec("ALTER TABLE tenants ADD COLUMN trialStartsAt TEXT"); } catch {}
  try { _db.exec("ALTER TABLE tenants ADD COLUMN trialEndsAt TEXT"); } catch {}
  try { _db.exec(`ALTER TABLE "groups" ADD COLUMN sessionsIncluded INTEGER`); } catch {}
  try { _db.exec(`ALTER TABLE "groups" ADD COLUMN color TEXT`); } catch {}
  try { _db.exec(`ALTER TABLE "groups" ADD COLUMN expiresAt TEXT`); } catch {}
  try { _db.exec("ALTER TABLE group_students ADD COLUMN remainingSessions INTEGER"); } catch {}
  try { _db.exec("ALTER TABLE group_students ADD COLUMN consumedSessions INTEGER DEFAULT 0"); } catch {}
  try { _db.exec("ALTER TABLE sessions ADD COLUMN creditsConsumed INTEGER DEFAULT 0"); } catch {}
  // Give each group without a color a distinct palette color so sessions of
  // different groups are easy to tell apart (rowid-stable; groups sharing a
  // subject still get their own color).
  try {
    const GROUP_COLOR_PALETTE = ["#6366f1", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#d97706", "#14b8a6", "#a855f7"];
    const nullColor = _db.exec(`SELECT rowid, id FROM "groups" WHERE color IS NULL OR color = '' ORDER BY rowid`);
    const rows = nullColor?.[0]?.values as [number, string][] | undefined;
    if (rows && rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const [rowid, id] = rows[i];
        const stmt = _db.prepare(`UPDATE "groups" SET color = ? WHERE rowid = ?`);
        stmt.run([GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length], rowid]);
        stmt.free();
        void id;
      }
      _dirty = true;
      saveDb();
    }
  } catch {}
  // Backfill the cumulative session counter: for every active member, count how
  // many expired sessions of the group happened on/after their first payment
  // for that group. Idempotent (recomputed on every boot) and also repairs
  // members whose sessions were already creditsConsumed=1 before this column
  // existed (consumeExpiredSessionCredits never reprocesses them).
  try {
    const sess = _db.exec(`SELECT id, groupId, sessionDate, startTime, endTime, status, creditsConsumed FROM sessions`);
    const nowMs = Date.now();
    const groupSessions = new Map<string, number[]>();
    for (const [, gId, sessionDate, startTime, endTime, status, creditsConsumed] of (sess?.[0]?.values ?? []) as [string, string | null, string | null, string | null, string | null, string | null, number | null][]) {
      // Only sessions already officially consumed count here. Sessions still
      // creditsConsumed=0 are accounted for by consumeExpiredSessionCredits
      // itself (which sets the flag right after incrementing the counter), so
      // they must NOT be tallied twice â€” that was the "2 Ø¨Ø¯Ù„ 3" overcount.
      if (!gId || status === "cancelled" || Number(creditsConsumed) !== 1) continue;
      const m0 = String(startTime || "").match(/^(\d{1,2}):(\d{2})/);
      const m1 = String(endTime || "").match(/^(\d{1,2}):(\d{2})/);
      const datePart = String(sessionDate || "").slice(0, 10);
      const d = datePart.split("-").map(Number);
      if (!m0 || !m1 || d.length !== 3 || !d[0]) continue;
      const start = new Date(d[0], d[1] - 1, d[2], Number(m0[1]), Number(m0[2])).getTime();
      const end = new Date(d[0], d[1] - 1, d[2], Number(m1[1]), Number(m1[2])).getTime();
      if (end <= start || end >= nowMs) continue;
      const list = groupSessions.get(gId) || [];
      list.push(end);
      groupSessions.set(gId, list);
    }

    const pay = _db.exec(`SELECT studentId, groupId, amountPaid, paidAt, createdAt FROM payments WHERE amountPaid > 0`);
    const firstPaid = new Map<string, number>();
    for (const [studentId, gId, , paidAt, createdAt] of (pay?.[0]?.values ?? []) as [string, string | null, number | null, string | null, string | null][]) {
      if (!studentId || !gId) continue;
      const ts = paidAt ? new Date(String(paidAt)).getTime() : createdAt ? new Date(String(createdAt)).getTime() : 0;
      if (!ts) continue;
      const key = `${studentId}|${gId}`;
      const prev = firstPaid.get(key);
      if (prev === undefined || ts < prev) firstPaid.set(key, ts);
    }

    const gs = _db.exec(`SELECT id, studentId, groupId FROM group_students`);
    let changed = false;
    for (const [id, studentId, gId] of (gs?.[0]?.values ?? []) as [string, string, string][]) {
      const first = firstPaid.get(`${studentId}|${gId}`);
      if (first === undefined) continue;
      const ends = groupSessions.get(gId) || [];
      const count = ends.filter((e) => e >= first).length;
      const stmt = _db.prepare(`UPDATE group_students SET consumedSessions = ? WHERE id = ?`);
      stmt.run([count, id]);
      stmt.free();
      changed = true;
    }
    if (changed) {
      _dirty = true;
      saveDb();
    }
  } catch {}
  // Backfill teacher salary expense labels: older records were created with the
  // generic "Salaire enseignant" description. Enrich them with the teacher name
  // so the cash ledger shows who was paid. Idempotent.
  try {
    const rows = _db.exec(`SELECT cm.rowid AS rid, t.firstName AS firstName, t.lastName AS lastName
      FROM cash_movements cm
      JOIN teacher_payments tp ON tp.id = cm.referenceId
      JOIN teachers t ON t.id = tp.teacherId
      WHERE cm.autoGenerated = 1 AND cm.type = 'expense' AND cm.description = 'Salaire enseignant'`);
    if (rows?.[0]?.values?.length) {
      const stmt = _db.prepare(`UPDATE cash_movements SET description = ? WHERE rowid = ?`);
      for (const [rid, firstName, lastName] of rows[0].values as [number, string | null, string | null][]) {
        stmt.run([`Salaire ${[firstName, lastName].filter(Boolean).join(" ")}`.trim(), rid]);
      }
      stmt.free();
      _dirty = true;
      saveDb();
    }
  } catch {}
  _db.exec(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    tenantId TEXT NOT NULL,
    tokenHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  )`);
  _db.exec("CREATE INDEX IF NOT EXISTS idx_auth_sessions_tokenHash ON auth_sessions(tokenHash)");
  // Performance indexes for 10k+ scale
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_students_tenant ON students(tenantId)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_students_tenant_fullName ON students(tenantId, fullName)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_teachers_tenant ON teachers(tenantId)"); } catch {}
  try { _db.exec('CREATE INDEX IF NOT EXISTS idx_groups_tenant ON "groups"(tenantId)'); } catch {}
  try { _db.exec('CREATE INDEX IF NOT EXISTS idx_groups_tenant_name ON "groups"(tenantId, name)'); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_payments_tenant_month ON payments(tenantId, month)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_payments_tenant_student ON payments(tenantId, studentId)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_cash_tenant_date ON cash_movements(tenantId, date)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_cash_tenant_created ON cash_movements(tenantId, createdAt)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_group_students_tenant_group ON group_students(tenantId, groupId)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_group_students_student ON group_students(studentId)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_tenant_date ON sessions(tenantId, sessionDate)"); } catch {}
  try { _db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(groupId)"); } catch {}
  // Mark dirty if indexes added
  const tenantCount = (_db.exec(`SELECT count(*) FROM tenants`)?.[0]?.values?.[0]?.[0] as number) || 0;
  if (tenantCount === 0) {
    const nowIso = new Date().toISOString();
    _db.exec(`INSERT OR IGNORE INTO tenants (id, name, slug, createdAt, updatedAt) VALUES ('${DEFAULT_TENANT_ID}', 'ProfManager', '${DEFAULT_TENANT_ID}', '${nowIso}', '${nowIso}')`);
    _dirty = true;
    saveDb();
  }
  try { _db.exec(`CREATE TABLE IF NOT EXISTS settings (
    userId TEXT NOT NULL,
    tenantId TEXT NOT NULL,
    schoolYearStart TEXT,
    schoolYearEnd TEXT,
    PRIMARY KEY (userId, tenantId)
  )`); } catch {}
  _db.exec(`CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL REFERENCES tenants(id),
    studentId TEXT NOT NULL REFERENCES students(id),
    type TEXT NOT NULL DEFAULT 'enrollment',
    title TEXT NOT NULL,
    description TEXT,
    template TEXT NOT NULL DEFAULT 'standard',
    issueDate TEXT NOT NULL,
    metadata TEXT,
    createdAt TEXT NOT NULL
  )`);
  _db.exec(`CREATE TABLE IF NOT EXISTS certificate_settings (
    tenantId TEXT NOT NULL PRIMARY KEY REFERENCES tenants(id),
    directorName TEXT,
    coachName TEXT,
    coachTitle TEXT,
    schoolName TEXT,
    referencePrefix TEXT NOT NULL DEFAULT 'DSK-'
  )`);
  return _db;
}

function prepare(db: SqlJsDatabase, sql: string): StmtWrapper {
  return new StmtWrapper(db, sql);
}

export function closeDb() {
  if (_db) { saveDb(); _db.close(); _db = null; }
}

// Hard factory reset: rebuild the local SQLite file from scratch (schema + seed
// only). Wipes ALL tenant data (students, teachers, payments, groups, rooms,
// cash movements, certificates, ...) while keeping the DB file alive in memory
// so subsequent requests see the empty state immediately.
export async function resetDatabase(): Promise<void> {
  if (!_sql) {
    _sql = await initSqlJs({
      locateFile: (file: string) => {
        const p = path.join(__dirname, "node_modules", "sql.js", "dist", file);
        try { if (fs.existsSync(p)) return p } catch {}
        return path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "sql.js", "dist", file);
      },
    });
  }
  if (_db) { _db.close(); _db = null; }
  const db = new _sql.Database();
  db.exec(SCHEMA_SQL);
  db.exec(SEED_SQL);
  _db = db;
  _dirty = true;
  saveDb();
  refreshLoadMarkers();
}

export function persist() {
  if (_db) {
    _dirty = true;
    saveDb();
  }
}

function parseSelectColumns(selectStr: string): ParsedSelect {
  const columns: string[] = [];
  const joins: JoinDef[] = [];
  if (!selectStr || selectStr.trim() === "*") return { columns: ["*"], joins: [] };
  let remaining = selectStr.trim();
  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (remaining.startsWith("*") && (remaining.length === 1 || remaining[1] === "," || remaining[1] === ")")) {
      columns.push("*");
      remaining = remaining.slice(1).trim();
      if (remaining.startsWith(",")) remaining = remaining.slice(1);
      continue;
    }
    const parenDepth = depthBefore(remaining, ",");
    let segment: string;
    if (parenDepth >= 0) {
      segment = remaining.slice(0, parenDepth).trim();
      remaining = remaining.slice(parenDepth).trim();
    } else {
      segment = remaining.trim();
      remaining = "";
    }
    if (remaining.startsWith(",")) remaining = remaining.slice(1);
    if (!segment) continue;
    if (segment.includes("(")) {
      const match = segment.match(/^(\w+(?:\.\w+)?)(?:!(\w+))?\((.+)\)\s*$/);
      if (match) {
        const [, tableName, joinType, innerSelect] = match;
        const parsed = parseSelectColumns(innerSelect);
        joins.push({ table: tableName, columns: parsed.columns, joins: parsed.joins, inner: joinType === "inner" });
      } else {
        columns.push(segment);
      }
    } else {
      columns.push(segment);
    }
  }
  return { columns, joins };
}

function depthBefore(str: string, char: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") depth--;
    else if (str[i] === char && depth === 0) return i;
  }
  return -1;
}

function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

class LocalAuth {
  private async resolveSessionUser() {
    try {
      const { cookies } = await import("next/headers");
      const store = await cookies();
      const token = store.get("pm_session")?.value;
      if (!token) return null;
      const crypto = await import("node:crypto");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      if (!_db) return null;
      const rows = _db.exec(`SELECT userId, expiresAt FROM auth_sessions WHERE tokenHash = '${tokenHash}'`);
      if (rows.length === 0 || rows[0].values.length === 0) return null;
      const v = rows[0].values[0];
      if (new Date(String(v[1])).getTime() < Date.now()) return null;
      const userRows = _db.exec(`SELECT id, email FROM users WHERE id = '${String(v[0])}'`);
      if (userRows.length === 0 || userRows[0].values.length === 0) return null;
      const uv = userRows[0].values[0];
      return { id: String(uv[0]), email: uv[1] == null ? "" : String(uv[1]) };
    } catch {
      return null;
    }
  }

  async getUser() {
    const sessionUser = await this.resolveSessionUser();
    if (sessionUser) {
      return { data: { user: sessionUser }, error: null };
    }
    return {
      data: {
        user: {
          id: process.env.DEFAULT_USER_ID ?? DEFAULT_USER_ID,
          email: "desktop@profmanager.local",
        },
      },
      error: null,
    };
  }
  async signInWithPassword() {
    return { data: { user: { id: DEFAULT_USER_ID, email: "desktop@profmanager.local" } }, error: null };
  }
  async signUp() {
    return { data: { user: { id: DEFAULT_USER_ID, email: "desktop@profmanager.local" } }, error: null };
  }
  async signOut() {
    return { error: null };
  }
}

class QueryBuilder implements PromiseLike<QueryResult> {
  private db!: SqlJsDatabase;
  private table: string;
  private readonlyMode: boolean;
  private operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns: string = "*";
  private insertValues: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updateValues: Record<string, unknown> | null = null;
  private upsertValues: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private upsertConflict: string | null = null;
  private filters: Filter[] = [];
  private orders: OrderBy[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private returnSingle = false;
  private returnMaybeSingle = false;
  private returnAfterMutate = false;
  private countQuery: "exact" | "planned" | "estimated" | null = null;
  private headMode = false;
  private aliasCounter = 0;
  private ready: Promise<void>;

  constructor(table: string, readonlyMode = false) {
    this.table = table;
    this.readonlyMode = readonlyMode;
    this.ready = getDb().then((db) => { this.db = db; });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.ready.then(() => this.execute()).then(onfulfilled as any, onrejected as any);
  }

  select(columns?: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (columns) this.columns = columns;
    if (opts?.count) this.countQuery = opts.count;
    if (opts?.head) this.headMode = opts.head;
    if (this.operation === "insert" || this.operation === "update" || this.operation === "upsert") {
      this.returnAfterMutate = true;
    } else {
      this.operation = "select";
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.insertValues = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.updateValues = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.operation = "upsert";
    this.upsertValues = values;
    this.upsertConflict = opts?.onConflict ?? null;
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push({ column: col, operator: "=", value: val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ column: col, operator: "!=", value: val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ column: col, operator: ">", value: val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ column: col, operator: ">=", value: val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ column: col, operator: "<", value: val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ column: col, operator: "<=", value: val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ column: col, operator: "IS", value: val }); return this; }
  not(col: string, op: string, val: unknown) { this.filters.push({ column: col, operator: `NOT ${op}`, value: val }); return this; }
  like(col: string, pattern: string) { this.filters.push({ column: col, operator: "LIKE", value: pattern }); return this; }
  ilike(col: string, pattern: string) { this.filters.push({ column: col, operator: "LIKE", value: pattern }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ column: col, operator: "IN", value: vals }); return this; }
  contains(col: string, val: unknown) { this.filters.push({ column: col, operator: "CONTAINS", value: val }); return this; }
  containedBy(col: string, val: unknown) { this.filters.push({ column: col, operator: "CONTAINED_BY", value: val }); return this; }
  textSearch(col: string, query: string) { this.filters.push({ column: col, operator: "TEXTSEARCH", value: query }); return this; }
  filter(col: string, op: string, val: unknown) { this.filters.push({ column: col, operator: op, value: val }); return this; }
  or(filterStr: string) { this.filters.push({ column: "", operator: "OR", value: filterStr }); return this; }
  match(query: Record<string, unknown>) {
    for (const [k, v] of Object.entries(query)) this.filters.push({ column: k, operator: "=", value: v });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column: col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(count: number) { this.limitCount = count; return this; }
  range(from: number, to: number) { this.limitCount = to - from + 1; this.offsetCount = from; return this; }
  single() { this.returnSingle = true; return this; }
  maybeSingle() { this.returnMaybeSingle = true; return this; }
  returns() { return this; }
  abortSignal() { return this; }

  private nextAlias(): string {
    this.aliasCounter++;
    return `j${this.aliasCounter}`;
  }

  private async buildJoinSQL(joins: JoinDef[]): Promise<{ joinClauses: string[]; joinMeta: { alias: string; table: string; columns: string[]; parentAlias: string }[]; }> {
    const joinClauses: string[] = [];
    const joinMeta: { alias: string; table: string; columns: string[]; parentAlias: string }[] = [];
    const pkMap: Record<string, string> = {
      students: "studentId", groups: "groupId", teachers: "teacherId",
      subjects: "subjectId", rooms: "roomId", sessions: "sessionId",
      workspaces: "workspaceId",
      group_students: "groupId", teacher_subjects: "teacherId",
      schedule_slots: "groupId", role_permissions: "roleId",
    };

    const allTablesArr = [this.table];
    const collectTables = (js: JoinDef[], dest: string[]) => { for (const j of js) { dest.push(j.table); collectTables(j.joins, dest); } };
    collectTables(joins, allTablesArr);
    const colPromises = allTablesArr.map((t) => this.getTableColumns(t));
    const colSets = await Promise.all(colPromises);
    const colMap = new Map<string, Set<string>>();
    allTablesArr.forEach((t, i) => colMap.set(t, colSets[i]));

    for (const j of joins) {
      const alias = `__${j.table}__`;
      const parentAlias = escapeIdent(this.table);
      const pkCol = pkMap[this.table] || `${this.table.slice(0, -1)}Id`;
      const fkCol = "id";
      const joinType = j.inner ? "INNER JOIN" : "LEFT JOIN";
      const jAlias = escapeIdent(alias);
      const jTable = escapeIdent(j.table);
      const joinedCols = colMap.get(j.table)!;
      if (joinedCols.has(pkCol)) {
        joinClauses.push(`${joinType} ${jTable} AS ${jAlias} ON ${jAlias}.${escapeIdent(pkCol)} = ${parentAlias}.${escapeIdent(fkCol)}`);
      } else {
        const fkInMain = pkMap[j.table] || `${j.table.slice(0, -1)}Id`;
        joinClauses.push(`${joinType} ${jTable} AS ${jAlias} ON ${jAlias}.${escapeIdent(fkCol)} = ${parentAlias}.${escapeIdent(fkInMain)}`);
      }
      joinMeta.push({ alias, table: j.table, columns: j.columns.includes("*") ? [] : j.columns, parentAlias: alias });
      if (j.joins.length > 0) {
        const childResult = this.buildChildJoins(j.joins, alias, colMap, j.table);
        joinClauses.push(...childResult.joinClauses);
        joinMeta.push(...childResult.joinMeta);
      }
    }
    return { joinClauses, joinMeta };
  }

  private buildChildJoins(joins: JoinDef[], parentAlias: string, colMap: Map<string, Set<string>>, parentTable: string): { joinClauses: string[]; joinMeta: { alias: string; table: string; columns: string[]; parentAlias: string }[] } {
    const joinClauses: string[] = [];
    const joinMeta: { alias: string; table: string; columns: string[]; parentAlias: string }[] = [];
    const parentAliasEscaped = escapeIdent(parentAlias);
    for (const j of joins) {
      const alias = `__${j.table}__`;
      const jAlias = escapeIdent(alias);
      const jTable = escapeIdent(j.table);
      const parentCols = colMap.get(parentTable);
      const childCols = colMap.get(j.table);
      const childFkCandidate = `${j.table.slice(0, -1)}Id`;
      const parentFkCandidate = `${parentTable.slice(0, -1)}Id`;
      if (parentCols && parentCols.has(childFkCandidate)) {
        joinClauses.push(`LEFT JOIN ${jTable} AS ${jAlias} ON ${jAlias}.${escapeIdent("id")} = ${parentAliasEscaped}.${escapeIdent(childFkCandidate)}`);
      } else if (childCols && childCols.has(parentFkCandidate)) {
        joinClauses.push(`LEFT JOIN ${jTable} AS ${jAlias} ON ${jAlias}.${escapeIdent(parentFkCandidate)} = ${parentAliasEscaped}.${escapeIdent("id")}`);
      } else {
        joinClauses.push(`LEFT JOIN ${jTable} AS ${jAlias} ON ${jAlias}.${escapeIdent("id")} = ${parentAliasEscaped}.${escapeIdent("id")}`);
      }
      joinMeta.push({ alias, table: j.table, columns: j.columns.includes("*") ? [] : j.columns, parentAlias: alias });
      if (j.joins.length > 0) {
        const deeper = this.buildChildJoins(j.joins, alias, colMap, j.table);
        joinClauses.push(...deeper.joinClauses);
        joinMeta.push(...deeper.joinMeta);
      }
    }
    return { joinClauses, joinMeta };
  }

  private colRef(col: string): string {
    if (col.includes(".")) {
      const parts = col.split(".").map((p) => escapeIdent(p));
      return parts.join(".");
    }
    return `${escapeIdent(this.table)}.${escapeIdent(col)}`;
  }

  private buildWhere(): { sql: string; params: any[] } {
    if (this.filters.length === 0) return { sql: "", params: [] };
    const clauses: string[] = [];
    const params: any[] = [];
    for (const f of this.filters) {
      const col = this.colRef(f.column);
      if (f.operator === "=") { clauses.push(`${col} = ?`); params.push(f.value); }
      else if (f.operator === "!=") { clauses.push(`${col} != ?`); params.push(f.value); }
      else if (f.operator === ">") { clauses.push(`${col} > ?`); params.push(f.value); }
      else if (f.operator === ">=") { clauses.push(`${col} >= ?`); params.push(f.value); }
      else if (f.operator === "<") { clauses.push(`${col} < ?`); params.push(f.value); }
      else if (f.operator === "<=") { clauses.push(`${col} <= ?`); params.push(f.value); }
      else if (f.operator === "IS") {
        if (f.value === null) clauses.push(`${col} IS NULL`);
        else { clauses.push(`${col} IS ?`); params.push(f.value); }
      }
      else if (f.operator === "LIKE") { clauses.push(`${col} LIKE ?`); params.push(f.value); }
      else if (f.operator === "IN") {
        const arr = f.value as any[];
        if (arr.length === 0) clauses.push("1=0");
        else clauses.push(`${col} IN (${arr.map(() => "?").join(",")})`), params.push(...arr);
      }
      else if (f.operator === "NOT IN") {
        const arr = f.value as any[];
        if (arr.length > 0) clauses.push(`${col} NOT IN (${arr.map(() => "?").join(",")})`), params.push(...arr);
      }
      else if (f.operator === "CONTAINS") {
        const arr = f.value as any[];
        if (arr.length > 0) {
          const orClauses = arr.map((v: any) => { params.push(v); return `? = ${col}`; });
          clauses.push(`(${orClauses.join(" OR ")})`);
        }
      }
      else if (f.operator === "TEXTSEARCH") {
        clauses.push(`${col} LIKE ?`);
        params.push(`%${String(f.value)}%`);
      }
      else if (f.operator === "OR") {
        const parts = String(f.value).split(",");
        const orClauses = parts.map((p: string) => {
          const m = p.trim().match(/^(\w+)\.(\w+)\.(.+)$/);
          if (m) {
            const [, colOp, op, rawVal] = m;
            const qualifiedCol = this.colRef(colOp);
            if (op === "ilike") { params.push(`%${rawVal.replace(/^%|%$/g, "")}%`); return `${qualifiedCol} LIKE ?`; }
            return `${qualifiedCol} ${op} ?`;
          }
          return "";
        }).filter(Boolean);
        clauses.push(`(${orClauses.join(" OR ")})`);
      }
    }
    return { sql: "WHERE " + clauses.join(" AND "), params };
  }

  private nestResults(rows: Record<string, any>[], parsed: ParsedSelect): Record<string, any>[] {
    if (parsed.joins.length === 0) return rows;
    const idKey = "id";

    const allKeys: { prefix: string; table: string; parentTable: string | null; isArray: boolean }[] = [];
    const colCache = new Map<string, Set<string>>();
    const tableCols = (table: string): Set<string> => {
      let cols = colCache.get(table);
      if (!cols) {
        const stmt = prepare(this.db, `PRAGMA table_info(${escapeIdent(table)})`);
        cols = new Set((stmt.all() as Array<{ name: string }>).map((r) => r.name));
        colCache.set(table, cols);
      }
      return cols;
    };
    const relPkMap: Record<string, string> = {
      students: "studentId", groups: "groupId", teachers: "teacherId",
      subjects: "subjectId", rooms: "roomId", sessions: "sessionId",
      workspaces: "workspaceId",
      group_students: "groupId", teacher_subjects: "teacherId",
      schedule_slots: "groupId", role_permissions: "roleId",
    };
    const collect = (joins: JoinDef[], parent: string | null) => {
      for (const j of joins) {
        const prefix = `__${j.table}__`;
        let isArray = false;
        if (j.table !== "students") {
          if (parent) {
            // Mirror buildChildJoins: child is "one" when the parent holds the child FK,
            // child is "many" when the child holds the parent FK.
            const childFkCandidate = `${j.table.slice(0, -1)}Id`;
            const parentFkCandidate = `${parent.slice(0, -1)}Id`;
            const parentCols = tableCols(parent);
            const childCols = tableCols(j.table);
            if (parentCols.has(childFkCandidate)) isArray = false;
            else if (childCols.has(parentFkCandidate)) isArray = true;
            else isArray = false;
          } else {
            // Mirror buildJoinSQL: the joined table is "many" when it holds the main table's FK.
            const mainFk = relPkMap[this.table] || `${this.table.slice(0, -1)}Id`;
            isArray = tableCols(j.table).has(mainFk);
          }
        }
        allKeys.push({ prefix, table: j.table, parentTable: parent, isArray });
        collect(j.joins, j.table);
      }
    };
    collect(parsed.joins, null);

    const tree: Record<string, typeof allKeys> = {};
    for (const k of allKeys) {
      const p = k.parentTable || "__base__";
      if (!tree[p]) tree[p] = [];
      tree[p].push(k);
    }

    const grouped = new Map<string, Record<string, any>>();

    for (const row of rows) {
      let pk: string;
      if (row.__rid__ !== undefined && row.__rid__ !== null) {
        // Physical row identity — immune to duplicate column values.
        pk = "rid|" + String(row.__rid__);
      } else if (row[idKey] === undefined || row[idKey] === null) {
        const parts: string[] = [];
        for (const [k, v] of Object.entries(row)) {
          let isJoin = false;
          for (const jk of allKeys) { if (k.startsWith(jk.prefix)) { isJoin = true; break; } }
          if (!isJoin) parts.push(`${k}=${String(v)}`);
        }
        pk = "base|" + parts.join("&");
      } else {
        pk = String(row[idKey]);
      }
      if (!pk) continue;

      if (!grouped.has(pk)) {
        const base: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === "__rid__") continue;
          let isJoin = false;
          for (const jk of allKeys) { if (k.startsWith(jk.prefix)) { isJoin = true; break; } }
          if (!isJoin) base[k] = v;
        }
        for (const jk of (tree["__base__"] || [])) {
          if (jk.isArray) base[jk.table] = [];
          else base[jk.table] = null;
        }
        grouped.set(pk, base);
      }

      const base = grouped.get(pk)!;

      const relRows: Record<string, Record<string, any>> = {};
      for (const jk of allKeys) {
        const r: Record<string, any> = {};
        let allNull = true;
        for (const [k, v] of Object.entries(row)) {
          if (k.startsWith(jk.prefix)) {
            r[k.slice(jk.prefix.length)] = v;
            if (v !== null && v !== undefined) allNull = false;
          }
        }
        if (!allNull) relRows[jk.table] = r;
      }

      const attachChildren = (table: string, entry: Record<string, any>): void => {
        const children = tree[table] || [];
        for (const ck of children) {
          if (!relRows[ck.table]) continue;
          if (ck.isArray) {
            const arr = entry[ck.table] || (entry[ck.table] = []);
            const cid = String(relRows[ck.table]["id"] || "");
            if (cid && !arr.some((e: any) => String(e["id"]) === cid)) {
              arr.push(relRows[ck.table]);
              attachChildren(ck.table, relRows[ck.table]);
            }
          } else {
            if (entry[ck.table] === null || entry[ck.table] === undefined) {
              entry[ck.table] = relRows[ck.table];
            }
            attachChildren(ck.table, entry[ck.table]);
          }
        }
      };

      for (const jk of (tree["__base__"] || [])) {
        if (!relRows[jk.table]) continue;
        if (jk.isArray) {
          const arr = base[jk.table] as Record<string, any>[];
          const rk = String(relRows[jk.table]["id"] || "");
          if (rk) {
            let entry = arr.find((e: any) => String(e["id"]) === rk);
            if (!entry) {
              entry = relRows[jk.table];
              attachChildren(jk.table, entry);
              arr.push(entry);
            }
          }
        } else {
          if (base[jk.table] === null || base[jk.table] === undefined) {
            base[jk.table] = relRows[jk.table];
          }
          attachChildren(jk.table, base[jk.table]);
        }
      }
    }

    return Array.from(grouped.values());
  }

  private async executeSelect(): Promise<QueryResult> {
    const _t0 = Date.now();
    const _dbgTable = this.table;
    const _dbgCols = this.columns.slice(0,80);
    try {
      const parsed = parseSelectColumns(this.columns);
      const _t1 = Date.now();
      const mainTable = escapeIdent(this.table);
      let selectCols = "";
      const prefixedCols: string[] = [];

    if (parsed.columns.includes("*")) {
      prefixedCols.push(`${mainTable}.*`);
    } else {
      for (const c of parsed.columns) {
        const cleaned = c.replace(/^[\w]+\s*:\s*/, "");
        prefixedCols.push(`${mainTable}.${escapeIdent(cleaned)}`);
      }
    }
    if (parsed.joins.length > 0) {
      prefixedCols.unshift(`${mainTable}.rowid AS __rid__`);
    }
      // ROOT FIX: always carry the physical rowid when joins are present.
      // nestResults groups rows by this key; without it, rows lacking a
      // selected unique column collapse into one (e.g. two attendances with
      // the same sessionId+status merged into one).
      if (parsed.joins.length > 0) {
        prefixedCols.unshift(`${mainTable}.rowid AS __rid__`);
      }

      const AGG_FNS = new Set(["count", "sum", "avg", "min", "max"]);
      const pkMap: Record<string, string> = {
        students: "studentId", groups: "groupId", teachers: "teacherId",
        subjects: "subjectId", rooms: "roomId", sessions: "sessionId",
        workspaces: "workspaceId",
        group_students: "groupId", teacher_subjects: "teacherId",
        schedule_slots: "groupId", role_permissions: "roleId",
      };
      for (const j of parsed.joins) {
        const alias = `__${j.table}__`;
        if (j.columns.length === 0 || j.columns.includes("*")) {
          const colSet = await this.getTableColumns(j.table);
          for (const col of colSet) {
            if (AGG_FNS.has(col)) continue;
            prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(col)} AS ${escapeIdent(`${alias}${col}`)}`);
          }
        } else {
          for (const c of j.columns) {
            if (AGG_FNS.has(c)) {
              const fkCol = pkMap[j.table] || `${j.table.slice(0, -1)}Id`;
              prefixedCols.push(`(SELECT ${c}(*) FROM ${escapeIdent(j.table)} AS ${escapeIdent(alias)} WHERE ${escapeIdent(alias)}.${escapeIdent(fkCol)} = ${escapeIdent(this.table)}.${escapeIdent("id")}) AS ${escapeIdent(`${alias}${c}`)}`);
            } else {
              prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(c)} AS ${escapeIdent(`${alias}${c}`)}`);
            }
          }
        }
        const addDescendantCols = async (parentJoins: JoinDef[]) => {
          for (const child of parentJoins) {
            const alias = `__${child.table}__`;
            const colSet = await this.getTableColumns(child.table);
            for (const col of colSet) {
              prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(col)} AS ${escapeIdent(`${alias}${col}`)}`);
            }
            if (child.joins.length > 0) await addDescendantCols(child.joins);
          }
        };
        await addDescendantCols(j.joins);
      }

      selectCols = prefixedCols.join(", ");
      if (!selectCols) selectCols = `${mainTable}.*`;

      if (this.headMode || this.countQuery) {
        let countClause = "";
        const countParams: any[] = [];
        if (this.filters.length > 0) {
          const w = this.buildWhere();
          countClause = w.sql;
          countParams.push(...w.params);
        }
        const result = prepare(this.db, `SELECT COUNT(*) as total FROM ${mainTable} ${countClause}`).get(countParams);
        const total = result?.total ?? 0;
        if (this.headMode) return { data: null, error: null, count: total };
        return { data: total, error: null, count: total };
      }

      const { sql: whereClause, params } = this.buildWhere();
      const orderClause = this.orders.length > 0
        ? "ORDER BY " + this.orders.map((o) => {
            const col = o.column;
            if (col.includes(".")) {
              const parts = col.split(".");
              const tablePart = parts[0];
              const colPart = parts.slice(1).join(".");
              if (tablePart !== this.table) {
                const alias = `__${tablePart}__`;
                return `${escapeIdent(alias)}.${escapeIdent(colPart)} ${o.ascending ? "ASC" : "DESC"}`;
              }
              return `${escapeIdent(tablePart)}.${escapeIdent(colPart)} ${o.ascending ? "ASC" : "DESC"}`;
            }
            return `${mainTable}.${escapeIdent(col)} ${o.ascending ? "ASC" : "DESC"}`;
          }).join(", ")
        : "";
      const limitClause = this.limitCount !== null ? `LIMIT ${this.limitCount}` : "";
      const offsetClause = this.offsetCount !== null ? `OFFSET ${this.offsetCount}` : "";

      const { joinClauses } = await this.buildJoinSQL(parsed.joins);
      const sql = `SELECT ${selectCols} FROM ${mainTable} ${joinClauses.join(" ")} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`;

      let rows: Record<string, any>[];
      try {
        rows = prepare(this.db, sql).all(params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[executeSelect] SQL ERROR:", this.table, msg, sql);
        return { data: null, error: { message: msg, code: "QUERY_FAILED", details: sql, hint: "" } };
      }
      const _dt = Date.now() - _t0;
      if (_dt > 500) console.log(`[slow-query] ${this.table} took ${_dt}ms sql=${sql.slice(0,400)} rows=${rows.length}`);

      if (parsed.joins.length > 0) {
        rows = this.nestResults(rows, parsed);
        const _dt2 = Date.now() - _t0;
        if (_dt2 > 500) console.log(`[slow-nest] ${this.table} nest took ${_dt2 - _dt}ms total ${_dt2}ms`);
      }

      if (this.returnSingle) {
        if (rows.length === 0) return { data: null, error: { message: "No rows found", code: "PGRST116", details: "The query returned no rows", hint: "" } };
        return { data: rows[0] as any, error: null };
      }
      if (this.returnMaybeSingle) {
        return { data: (rows.length > 0 ? rows[0] : null) as any, error: null };
      }
      return { data: rows as any, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.stack || err.message : String(err);
      console.error("[executeSelect] UNCAUGHT:", this.table, this.columns, msg);
      return { data: null, error: { message: msg, code: "QUERY_FAILED", details: "executeSelect error", hint: "" } };
    }
  }

  private async getTableColumns(table: string): Promise<Set<string>> {
    const stmt = prepare(this.db, `PRAGMA table_info(${escapeIdent(table)})`);
    const rows = stmt.all() as Array<{ name: string }>;
    return new Set(rows.map((r) => r.name));
  }

  private ensureTimestamps(
    record: Record<string, any>,
    tableCols: Set<string>,
    now: string
  ): Record<string, any> {
    const r = { ...record };
    if (tableCols.has("createdAt") && r.createdAt === undefined) r.createdAt = now;
    if (tableCols.has("updatedAt") && r.updatedAt === undefined) r.updatedAt = now;
    return r;
  }

  private async executeInsert(): Promise<QueryResult> {
    const vals = this.insertValues;
    if (!vals) return { data: null, error: { message: "No values provided", code: "400", details: "", hint: "" } };
    const arr = Array.isArray(vals) ? vals : [vals];
    const tableCols = await this.getTableColumns(this.table);
    const now = new Date().toISOString();
    const insertedRecords: Record<string, any>[] = [];
    const ids: string[] = [];
    const mainTable = escapeIdent(this.table);

    try {
      prepare(this.db, "BEGIN").run();
      for (const item of arr) {
        const record = this.ensureTimestamps(item as Record<string, any>, tableCols, now);
        const columns = Object.keys(record).filter((c) => tableCols.has(c) && record[c] !== undefined);
        if (columns.length === 0) continue;
        const colList = columns.map((c) => escapeIdent(c)).join(", ");
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map((c) => record[c]);
        const sql = `INSERT INTO ${mainTable} (${colList}) VALUES (${placeholders})`;
        prepare(this.db, sql).run(values);
        insertedRecords.push(record);
        ids.push(String(record.id ?? ""));
      }
      prepare(this.db, "COMMIT").run();
      _dirty = true;
      saveDb();
    } catch (err: unknown) {
      prepare(this.db, "ROLLBACK").run();
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg, code: "INSERT_FAILED", details: "", hint: "" } };
    }

    if (this.returnAfterMutate) {
      const validIds = ids.filter((x) => x && x.length > 0);
      if (validIds.length > 0) {
        return await this.fetchMutatedRows(validIds);
      }
      if (Array.isArray(vals) && vals.length > 1) return { data: insertedRecords as any, error: null };
      return { data: (insertedRecords[0] || null) as any, error: null };
    }

    if (Array.isArray(vals) && vals.length > 1) return { data: insertedRecords as any, error: null };
    return { data: (insertedRecords[0] || null) as any, error: null };
  }

  private async executeUpdate(): Promise<QueryResult> {
    const vals = this.updateValues;
    if (!vals) return { data: null, error: { message: "No values provided", code: "400", details: "", hint: "" } };
    const tableCols = await this.getTableColumns(this.table);
    const now = new Date().toISOString();
    const withTimestamps = { ...vals };
    if (tableCols.has("updatedAt") && withTimestamps.updatedAt === undefined) withTimestamps.updatedAt = now;
    const mainTable = escapeIdent(this.table);
    const columns = Object.keys(withTimestamps).filter((c) => tableCols.has(c) && withTimestamps[c] !== undefined);
    if (columns.length === 0) return { data: null, error: { message: "No columns to update", code: "400", details: "", hint: "" } };
    const setClause = columns.map((c) => `${escapeIdent(c)} = ?`).join(", ");
    const setValues = columns.map((c) => withTimestamps[c]);
    const { sql: whereClause, params } = this.buildWhere();
    const sql = `UPDATE ${mainTable} SET ${setClause} ${whereClause}`;
    const allParams = [...setValues, ...params];

    try {
      prepare(this.db, sql).run(allParams);
      _dirty = true;
      saveDb();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg, code: "UPDATE_FAILED", details: "", hint: "" } };
    }

    if (this.returnAfterMutate) {
      return await this.fetchMutatedRows([]);
    }

    return { data: null, error: null };
  }

  private async fetchMutatedRows(ids: string[]): Promise<QueryResult> {
    const parsed = this.columns ? parseSelectColumns(this.columns) : { columns: ["*"], joins: [] };
    const mainTable = escapeIdent(this.table);
    const prefixedCols: string[] = [];

    if (parsed.columns.includes("*")) {
      prefixedCols.push(`${mainTable}.*`);
    } else {
      for (const c of parsed.columns) {
        const cleaned = c.replace(/^[\w]+\s*:\s*/, "");
        prefixedCols.push(`${mainTable}.${escapeIdent(cleaned)}`);
      }
    }

    const AGG_FNS = new Set(["count", "sum", "avg", "min", "max"]);
    const pkMap: Record<string, string> = {
      students: "studentId", groups: "groupId", teachers: "teacherId",
      subjects: "subjectId", rooms: "roomId", sessions: "sessionId",
      workspaces: "workspaceId",
      group_students: "groupId", teacher_subjects: "teacherId",
      schedule_slots: "groupId", role_permissions: "roleId",
    };
    for (const j of parsed.joins) {
      const alias = `__${j.table}__`;
      if (j.columns.length === 0 || j.columns.includes("*")) {
        const colSet = await this.getTableColumns(j.table);
        for (const col of colSet) {
          if (AGG_FNS.has(col)) continue;
          prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(col)} AS ${escapeIdent(`${alias}${col}`)}`);
        }
      } else {
        for (const c of j.columns) {
          if (AGG_FNS.has(c)) {
            const fkCol = pkMap[j.table] || `${j.table.slice(0, -1)}Id`;
            prefixedCols.push(`(SELECT ${c}(*) FROM ${escapeIdent(j.table)} AS ${escapeIdent(alias)} WHERE ${escapeIdent(alias)}.${escapeIdent(fkCol)} = ${escapeIdent(this.table)}.${escapeIdent("id")}) AS ${escapeIdent(`${alias}${c}`)}`);
          } else {
            prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(c)} AS ${escapeIdent(`${alias}${c}`)}`);
          }
        }
      }
      const addChildCols = async (parentJoins: JoinDef[]) => {
        for (const child of parentJoins) {
          const alias = `__${child.table}__`;
          const colSet = await this.getTableColumns(child.table);
          for (const col of colSet) {
            prefixedCols.push(`${escapeIdent(alias)}.${escapeIdent(col)} AS ${escapeIdent(`${alias}${col}`)}`);
          }
          if (child.joins.length > 0) await addChildCols(child.joins);
        }
      };
      if (j.joins.length > 0) await addChildCols(j.joins);
    }

    const selectCols = prefixedCols.join(", ") || `${mainTable}.*`;
    const { joinClauses } = await this.buildJoinSQL(parsed.joins);

    let whereClause: string;
    let whereParams: any[];
    if (ids.length > 0) {
      const idCol = escapeIdent("id");
      const ph = ids.map(() => "?").join(", ");
      whereClause = `WHERE ${mainTable}.${idCol} IN (${ph})`;
      whereParams = ids;
    } else {
      const w = this.buildWhere();
      whereClause = w.sql;
      whereParams = w.params;
    }

    const orderClause = `ORDER BY ${mainTable}.${escapeIdent("rowid")}`;
    const limitClause = ids.length > 0 ? "" : "LIMIT 1";
    const sql = `SELECT ${selectCols} FROM ${mainTable} ${joinClauses.join(" ")} ${whereClause} ${orderClause} ${limitClause}`;

    let rows: Record<string, any>[];
    try {
      rows = prepare(this.db, sql).all(whereParams);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[fetchMutatedRows] SQL ERROR:", this.table, msg, sql);
      return { data: null, error: { message: msg, code: "QUERY_FAILED", details: sql, hint: "" } };
    }

    const mapped = rows.map((r: any) => {
      if (typeof r !== "object" || r === null) return r;
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) obj[k] = v;
      return obj;
    });

    if (parsed.joins.length > 0) {
      const nested = this.nestResults(mapped, parsed);
      if (this.returnSingle) {
        if (nested.length === 0) return { data: null, error: { message: "No rows found", code: "PGRST116", details: "", hint: "" } };
        return { data: nested[0] as any, error: null };
      }
      if (this.returnMaybeSingle) {
        return { data: (nested.length > 0 ? nested[0] : null) as any, error: null };
      }
      return { data: nested as any, error: null };
    }

    if (this.returnSingle) {
      if (mapped.length === 0) return { data: null, error: { message: "No rows found", code: "PGRST116", details: "", hint: "" } };
      return { data: mapped[0] as any, error: null };
    }
    if (this.returnMaybeSingle) {
      return { data: (mapped.length > 0 ? mapped[0] : null) as any, error: null };
    }
    return { data: mapped as any, error: null };
  }

  private async executeDelete(): Promise<QueryResult> {
    const mainTable = escapeIdent(this.table);
    const { sql: whereClause, params } = this.buildWhere();
    const sql = `DELETE FROM ${mainTable} ${whereClause}`;
    try {
      prepare(this.db, sql).run(params);
      _dirty = true;
      saveDb();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg, code: "DELETE_FAILED", details: "", hint: "" } };
    }
    return { data: null, error: null };
  }

  private async executeUpsert(): Promise<QueryResult> {
    const vals = this.upsertValues;
    if (!vals) return { data: null, error: { message: "No values provided", code: "400", details: "", hint: "" } };
    const arr = Array.isArray(vals) ? vals : [vals];
    const tableCols = await this.getTableColumns(this.table);
    const now = new Date().toISOString();
    const results: Record<string, any>[] = [];
    const mainTable = escapeIdent(this.table);

    try {
      prepare(this.db, "BEGIN").run();
      for (const item of arr) {
        const record = this.ensureTimestamps(item as Record<string, any>, tableCols, now);
        const columns = Object.keys(record);
        const colList = columns.map((c) => escapeIdent(c)).join(", ");
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map((c) => record[c]);
        const conflictCols = this.upsertConflict
          ? this.upsertConflict.split(",").map((c) => escapeIdent(c.trim())).join(", ")
          : escapeIdent("id");
        const updateSet = columns.map((c) => `${escapeIdent(c)} = excluded.${escapeIdent(c)}`).join(", ");
        const sql = `INSERT INTO ${mainTable} (${colList}) VALUES (${placeholders}) ON CONFLICT(${conflictCols}) DO UPDATE SET ${updateSet}`;
        prepare(this.db, sql).run(values);
        results.push(record);
      }
      prepare(this.db, "COMMIT").run();
      _dirty = true;
      saveDb();
    } catch (err: unknown) {
      prepare(this.db, "ROLLBACK").run();
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message: msg, code: "UPSERT_FAILED", details: "", hint: "" } };
    }

    if (Array.isArray(vals)) return { data: results as any, error: null };
    return { data: (results[0] || null) as any, error: null };
  }

  private async execute(): Promise<QueryResult> {
    if (this.readonlyMode && this.operation !== "select") {
      return { data: null, error: { message: "Account is in read-only mode (trial expired). Contact support to renew.", code: "READ_ONLY", details: "", hint: "" } };
    }
    switch (this.operation) {
      case "select": return this.executeSelect();
      case "insert": return this.executeInsert();
      case "update": return this.executeUpdate();
      case "delete": return this.executeDelete();
      case "upsert": return this.executeUpsert();
      default: return { data: null, error: { message: "Unknown operation", code: "400", details: "", hint: "" } };
    }
  }
}

function createLocalClient(options?: { readonly?: boolean }) {
  return {
    from(table: string) {
      return new QueryBuilder(table, options?.readonly ?? false);
    },
    auth: new LocalAuth(),
  };
}

export { createLocalClient, QueryBuilder, LocalAuth };




