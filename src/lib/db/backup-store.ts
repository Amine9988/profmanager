const API = "https://api.github.com";
const DEFAULT_REPO = "Amine9988/profmanager-db-backup";

function envToken(): string {
  return process.env.DB_BACKUP_TOKEN || "";
}

function backupRepo(): string {
  return process.env.DB_BACKUP_REPO || DEFAULT_REPO;
}

function backupBranch(): string {
  return process.env.DB_BACKUP_BRANCH || "main";
}

function backupFile(): string {
  return process.env.DB_BACKUP_FILE || "profmanager.db";
}

function pathInRepo(): string {
  return encodeURIComponent(backupFile());
}

export function isBackupEnabled(): boolean {
  return !!envToken();
}

let _pushTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingBytes: Uint8Array | null = null;
let _inFlight = false;

export function queueBackupPush(bytes: Uint8Array): void {
  if (!isBackupEnabled()) return;
  _pendingBytes = bytes;
  if (_pushTimer) return;
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    void flushPush();
  }, 8000);
}

async function flushPush(): Promise<void> {
  if (_inFlight) return;
  const bytes = _pendingBytes;
  _pendingBytes = null;
  if (!bytes) return;
  _inFlight = true;
  try {
    await pushBytes(bytes);
    if (_pendingBytes) {
      _pushTimer = setTimeout(() => {
        _pushTimer = null;
        void flushPush();
      }, 2000);
    }
  } finally {
    _inFlight = false;
  }
}

export async function pushBytes(bytes: Uint8Array): Promise<boolean> {
  if (!isBackupEnabled()) return false;
  try {
    const base = `${API}/repos/${backupRepo()}/contents/${pathInRepo()}`;
    const headers = {
      Authorization: `Bearer ${envToken()}`,
      "User-Agent": "ProfManager",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    let sha: string | null = null;
    const getRes = await fetch(base, { headers });
    if (getRes.status === 200) {
      const j = await getRes.json();
      sha = j.sha ?? null;
    }

    const content = Buffer.from(bytes).toString("base64");
    const body: any = {
      message: `profmanager backup ${new Date().toISOString()}`,
      content,
      branch: backupBranch(),
    };
    if (sha) body.sha = sha;

    const res = await fetch(base, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    return res.status === 200 || res.status === 201;
  } catch {
    return false;
  }
}

export async function fetchBackup(): Promise<Uint8Array | null> {
  if (!isBackupEnabled()) return null;
  const res = await fetch(`${API}/repos/${backupRepo()}/contents/${pathInRepo()}`, {
    headers: {
      Authorization: `Bearer ${envToken()}`,
      "User-Agent": "ProfManager",
      Accept: "application/vnd.github.raw",
    },
  });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`fetchBackup failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}