const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  schoolYearStart TEXT,
  schoolYearEnd TEXT,
  timezone TEXT,
  trialStartsAt TEXT,
  trialEndsAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  fullName TEXT,
  passwordHash TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  tokenHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  roleId TEXT NOT NULL REFERENCES roles(id),
  permissionId TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (roleId, permissionId)
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  userId TEXT NOT NULL REFERENCES users(id),
  roleId TEXT NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  fullName TEXT NOT NULL,
  dateOfBirth TEXT,
  gradeLevel TEXT,
  schoolName TEXT,
  phone TEXT,
  fatherPhone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  enrolledAt TEXT NOT NULL,
  monthlyFee REAL NOT NULL DEFAULT 0,
  advanceBalance REAL NOT NULL DEFAULT 0,
  subscriptionStart TEXT,
  billingType TEXT,
  createdById TEXT,
  workspaceId TEXT REFERENCES workspaces(id),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  code TEXT,
  sessionDuration INTEGER DEFAULT 60,
  description TEXT,
  status TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  salaryType TEXT,
  salaryAmount REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacherId TEXT NOT NULL REFERENCES teachers(id),
  subjectId TEXT NOT NULL REFERENCES subjects(id),
  tenantId TEXT,
  PRIMARY KEY (teacherId, subjectId)
);

CREATE TABLE IF NOT EXISTS teacher_payments (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  teacherId TEXT REFERENCES teachers(id),
  periodMonth TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paidAt TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  floor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  nameEn TEXT NOT NULL,
  cycle TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (tenantId, nameAr)
);

CREATE TABLE IF NOT EXISTS "groups" (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  subjectId TEXT REFERENCES subjects(id),
  teacherId TEXT REFERENCES teachers(id),
  level TEXT,
  maxCapacity INTEGER,
  pricePerSession REAL,
  priceType TEXT DEFAULT 'per_session',
  roomId TEXT REFERENCES rooms(id),
  workspaceId TEXT REFERENCES workspaces(id),
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_students (
  id TEXT PRIMARY KEY,
  tenantId TEXT REFERENCES tenants(id),
  groupId TEXT NOT NULL REFERENCES "groups"(id),
  studentId TEXT NOT NULL REFERENCES students(id),
  status TEXT NOT NULL DEFAULT 'active',
  enrolledAt TEXT
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  groupId TEXT NOT NULL REFERENCES "groups"(id),
  dayOfWeek INTEGER NOT NULL,
  startTime TEXT NOT NULL,
  endTime TEXT NOT NULL,
  location TEXT,
  isOnline INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  groupId TEXT NOT NULL REFERENCES "groups"(id),
  scheduleSlotId TEXT REFERENCES schedule_slots(id),
  sessionDate TEXT NOT NULL,
  startTime TEXT,
  endTime TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  type TEXT NOT NULL DEFAULT 'regular',
  cancellationReason TEXT,
  topicCovered TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendances (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  sessionId TEXT NOT NULL REFERENCES sessions(id),
  studentId TEXT NOT NULL REFERENCES students(id),
  status TEXT NOT NULL DEFAULT 'present',
  arrivedAt TEXT,
  notes TEXT,
  markedById TEXT,
  markedAt TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  studentId TEXT NOT NULL REFERENCES students(id),
  month TEXT NOT NULL,
  amountDue REAL NOT NULL,
  amountPaid REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paidAt TEXT,
  note TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  userId TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  category TEXT NOT NULL DEFAULT 'general',
  amount REAL NOT NULL,
  description TEXT,
  paymentMethod TEXT NOT NULL DEFAULT 'cash',
  date TEXT NOT NULL,
  referenceId TEXT,
  autoGenerated INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_categories (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  color TEXT NOT NULL DEFAULT '#6366f1',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_pricing (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  subjectId TEXT REFERENCES subjects(id),
  level TEXT,
  monthlyPrice REAL NOT NULL DEFAULT 0,
  sessionPrice REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenantId TEXT REFERENCES tenants(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  isRead INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenantId TEXT REFERENCES tenants(id),
  userId TEXT,
  action TEXT NOT NULL,
  entityType TEXT,
  entityId TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  userId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  schoolYearStart TEXT,
  schoolYearEnd TEXT,
  PRIMARY KEY (userId, tenantId)
);

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  fullName TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  relationship TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES students(id),
  guardianId TEXT NOT NULL REFERENCES guardians(id),
  relationship TEXT
);

CREATE TABLE IF NOT EXISTS certificates (
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
);

CREATE TABLE IF NOT EXISTS certificate_settings (
  tenantId TEXT NOT NULL PRIMARY KEY REFERENCES tenants(id),
  directorName TEXT,
  coachName TEXT,
  coachTitle TEXT,
  schoolName TEXT,
  referencePrefix TEXT NOT NULL DEFAULT 'DSK-'
);
`;

const SEED_SQL = `
INSERT OR IGNORE INTO roles (id, name, description) VALUES 
  ('owner-role', 'owner', 'Propriétaire — accès total'),
  ('admin-role', 'admin', 'Administrateur'),
  ('manager-role', 'manager', 'Gestionnaire'),
  ('teacher-role', 'teacher', 'Enseignant'),
  ('viewer-role', 'viewer', 'Consultation seule');

INSERT OR IGNORE INTO permissions (id, key) VALUES
  ('p1', 'students.read'), ('p2', 'students.write'),
  ('p3', 'payments.read'), ('p4', 'payments.write'),
  ('p5', 'groups.read'), ('p6', 'groups.write'),
  ('p7', 'teachers.read'), ('p8', 'teachers.write'),
  ('p9', 'settings.read'), ('p10', 'settings.write'),
  ('p11', 'caisse.read'), ('p12', 'caisse.write'),
  ('p13', 'levels.read'), ('p14', 'levels.write'),
  ('p16', 'rooms.read'), ('p17', 'rooms.write'),
  ('p18', 'subjects.read'), ('p19', 'subjects.write'),
  ('p20', 'attendance.read'), ('p21', 'attendance.write'),
  ('p22', 'workspaces.read'), ('p23', 'workspaces.write');

INSERT OR IGNORE INTO role_permissions (roleId, permissionId)
SELECT 'owner-role', id FROM permissions;

INSERT OR IGNORE INTO cash_categories (id, tenantId, name, type, color, createdAt) VALUES
  ('cat-income-1', 'default-tenant-id', 'Paiement', 'income', '#22c55e', '${now()}'),
  ('cat-income-2', 'default-tenant-id', 'Inscription', 'income', '#3b82f6', '${now()}'),
  ('cat-income-3', 'default-tenant-id', 'Vente', 'income', '#8b5cf6', '${now()}'),
  ('cat-income-4', 'default-tenant-id', 'Autre revenu', 'income', '#06b6d4', '${now()}'),
  ('cat-expense-1', 'default-tenant-id', 'Salaire', 'expense', '#ef4444', '${now()}'),
  ('cat-expense-2', 'default-tenant-id', 'Loyer', 'expense', '#f97316', '${now()}'),
  ('cat-expense-3', 'default-tenant-id', 'Électricité', 'expense', '#eab308', '${now()}'),
  ('cat-expense-4', 'default-tenant-id', 'Fournitures', 'expense', '#a855f7', '${now()}'),
  ('cat-expense-5', 'default-tenant-id', 'Entretien', 'expense', '#ec4899', '${now()}'),
  ('cat-expense-6', 'default-tenant-id', 'Autre dépense', 'expense', '#78716c', '${now()}');

INSERT OR IGNORE INTO levels (id, tenantId, nameAr, nameFr, nameEn, cycle, sortOrder, status, createdAt, updatedAt) VALUES
  ('default-tenant-id-level-1',  'default-tenant-id', 'أولى ابتدائي',   '1ère Primaire', '1st Primary',   'primary',   0, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-2',  'default-tenant-id', 'ثانية ابتدائي',   '2ème Primaire', '2nd Primary',  'primary',   1, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-3',  'default-tenant-id', 'ثالثة ابتدائي',   '3ème Primaire', '3rd Primary',  'primary',   2, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-4',  'default-tenant-id', 'رابعة ابتدائي',   '4ème Primaire', '4th Primary',  'primary',   3, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-5',  'default-tenant-id', 'خامسة ابتدائي',   '5ème Primaire', '5th Primary',  'primary',   4, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-6',  'default-tenant-id', 'أولى متوسط',      '1ère AM',       '1st Middle',   'middle',    5, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-7',  'default-tenant-id', 'ثانية متوسط',     '2ème AM',       '2nd Middle',   'middle',    6, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-8',  'default-tenant-id', 'ثالثة متوسط',     '3ème AM',       '3rd Middle',   'middle',    7, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-9',  'default-tenant-id', 'رابعة متوسط',     '4ème AM',       '4th Middle',   'middle',    8, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-10', 'default-tenant-id', 'أولى ثانوي',      '1ère AS',       '1st Secondary','secondary', 9, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-11', 'default-tenant-id', 'ثانية ثانوي',     '2ème AS',       '2nd Secondary','secondary',10, 'active', '${now()}', '${now()}'),
  ('default-tenant-id-level-12', 'default-tenant-id', 'ثالثة ثانوي',     '3ème AS',       '3rd Secondary','secondary',11, 'active', '${now()}', '${now()}');
`;

function now(): string {
  return new Date().toISOString();
}

const DEFAULT_TENANT_ID = "default-tenant-id";
const DEFAULT_USER_ID = "default-user";

export { SCHEMA_SQL, SEED_SQL, now, DEFAULT_TENANT_ID, DEFAULT_USER_ID };
