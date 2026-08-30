const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ELECTRON = path.join(ROOT, "electron");
const STANDALONE_SRC = path.join(ROOT, ".next", "standalone");
const STANDALONE_DST = path.join(ELECTRON, "standalone-server");
const WIN_UNPACKED = path.join(ELECTRON, "dist", "win-unpacked");
const RESOURCES = path.join(WIN_UNPACKED, "resources", "standalone-server");

function run(cmd, cwd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Source not found: ${src}`);
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  // Copy with verbatimSymlinks=true to preserve pnpm junction structure
  // (junctions must stay intact for Node.js module resolution to work)
  fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
}

console.log("=== Build Electron (full pipeline) ===");

// Step 1: Build Next.js standalone
console.log("\n[1/5] Building Next.js standalone...");
// Remove dev-only artifacts (.next/dev, .next/trace etc.) left behind by a
// running `next dev` — a stale dev build can fail the production type-check.
const STALE_DEV = [".next/dev", ".next/types"];
for (const dir of STALE_DEV) {
  const p = path.join(ROOT, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`  removed stale ${dir}/ (from a previous dev server)`);
  }
}
const NEXT_BUILD_CMD = "npx next build";
run(NEXT_BUILD_CMD, ROOT);

// Step 2: Remove project-root junctions from standalone .next/node_modules before copy
const STANDALONE_DOT_NEXT_NM = path.join(STANDALONE_SRC, ".next", "node_modules");
if (fs.existsSync(STANDALONE_DOT_NEXT_NM)) {
  console.log("\n[2/5] Removing standalone .next/node_modules/ (project-root junctions)...");
  fs.rmSync(STANDALONE_DOT_NEXT_NM, { recursive: true, force: true });
}

// Step 2b: Copy standalone server into electron/ (preserve pnpm junctions with verbatimSymlinks)
console.log("\n[2b/5] Copying standalone server to electron/...");
if (fs.existsSync(STANDALONE_DST)) fs.rmSync(STANDALONE_DST, { recursive: true, force: true });
copyDir(STANDALONE_SRC, STANDALONE_DST);

// Step 2c: Copy static assets into standalone .next (Next.js standalone omits them)
const STATIC_SRC = path.join(ROOT, ".next", "static");
const STATIC_DST = path.join(STANDALONE_DST, ".next", "static");
if (fs.existsSync(STATIC_SRC) && !fs.existsSync(STATIC_DST)) {
  console.log("\n[2c/5] Copying static assets...");
  copyDir(STATIC_SRC, STATIC_DST);
  const files = fs.readdirSync(path.join(STATIC_DST, "chunks"));
  const cssCount = files.filter(f => f.endsWith(".css")).length;
  console.log(`  ${files.length} chunks (${cssCount} CSS files)`);
}

// Step 2d: Clean up standalone server — remove source files, logs, duplicates
console.log("\n[2d/5] Cleaning standalone server...");
const CLEAN_DIRS = ["profmanager", "src", "electron", "scripts", "certafica", "tests-tmp"];
for (const dir of CLEAN_DIRS) {
  const p = path.join(STANDALONE_DST, dir);
  if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log(`  removed ${dir}/`); }
}
const CLEAN_GLOBS = [
  "*.log", "dev_error.txt", "dev_output.txt", "debug-select.js", "check-compiled.js",
  "resolve-*.js", "cookies*.txt", "done.txt", "response.txt", "stderr.txt", "stdout.txt",
  "test-*", "rebuild.bat", "setup-standalone-nm.js", "pnpm-*", "package-lock.json",
  "telecharger.html", "manuel-*.html", "migration-*.sql", "supabase-migration-*.sql",
  "0", "pm_logo.svg", "next-env.d.ts", "tsconfig.json", "eslint.config.mjs",
  "postcss.config.mjs", "CLAUDE.md", "DECISIONS.md", "README.md", "AGENTS.md",
  ".env", ".env.local", ".env.production", "debug-*.js", "*.bat", "*.cmd",
  "repro.mjs", "render.yaml", "tsconfig.tsbuildinfo"
];
for (const pattern of CLEAN_GLOBS) {
  const matches = fs.readdirSync(STANDALONE_DST).filter(f => {
    if (pattern.includes("*")) {
      const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return re.test(f);
    }
    return f === pattern;
  });
  for (const f of matches) {
    const fp = path.join(STANDALONE_DST, f);
    try { fs.rmSync(fp, { recursive: true, force: true }); } catch {}
  }
}
console.log("  cleanup done");

// Step 3: Bind to all interfaces (LAN access) so a phone can scan on the same network
console.log("\n[3/5] Binding server.js to 0.0.0.0...");
const SERVER_JS = path.join(STANDALONE_DST, "server.js");
let srv = fs.readFileSync(SERVER_JS, "utf8");
srv = srv.replace(/const hostname = process\.env\.HOSTNAME \|\| '127\.0\.0\.1'/, `const hostname = process.env.HOSTNAME || '0.0.0.0'`);
srv = srv.replace(/const hostname = process\.env\.HOSTNAME \|\| '0\.0\.0\.0'/, `const hostname = process.env.HOSTNAME || '0.0.0.0'`);
fs.writeFileSync(SERVER_JS, srv, "utf8");
console.log("  hostname default set to 0.0.0.0 (LAN scanning enabled)");

function writeAppUpdateYml() {
  const src = fs.existsSync(path.join(ELECTRON, "app-update.yml"))
    ? path.join(ELECTRON, "app-update.yml")
    : path.join(ELECTRON, "build", "app-update.yml");
  if (!fs.existsSync(src)) {
    console.log("  skip app-update.yml (src not found)");
    return;
  }
  const destWin = path.join(ELECTRON, "dist", "win-unpacked", "resources", "app-update.yml");
  try {
    fs.mkdirSync(path.dirname(destWin), { recursive: true });
    fs.copyFileSync(src, destWin);
    console.log("  wrote " + destWin);
  } catch (e) {
    console.log("  skip win app-update.yml:", e.message);
  }
  // Also for mac (if built)
  for (const dir of ["mac", "mac-arm64"]) {
    const destMac = path.join(ELECTRON, "dist", dir, "ProfManager.app", "Contents", "Resources", "app-update.yml");
    try {
      if (fs.existsSync(path.join(ELECTRON, "dist", dir))) {
        fs.mkdirSync(path.dirname(destMac), { recursive: true });
        fs.copyFileSync(src, destMac);
        console.log("  wrote " + destMac);
      }
    } catch {}
  }
}

if (process.env.STANDALONE_ONLY === "1") {
  const nm = path.join(STANDALONE_DST, "node_modules");
  if (!fs.existsSync(path.join(STANDALONE_DST, "server.js"))) {
    throw new Error("standalone-server/server.js missing after prepare");
  }
  if (!fs.existsSync(nm)) {
    throw new Error("standalone-server/node_modules missing after prepare");
  }
  console.log("\n=== standalone-only prepare done ===");
  console.log("  " + STANDALONE_DST);
  process.exit(0);
}

// Step 4a: Build unpackaged app directory
console.log("\n[4a/4] Building unpackaged app directory...");
run("npx electron-builder --dir", ELECTRON);
writeAppUpdateYml();

if (process.platform === 'win32') {
// Step 4b: Copy node_modules with junctions intact, then resolve all junctions for distribution
console.log("\n[4b/4] Copying node_modules into unpackaged app...");
const RESOURCES_NM = path.join(WIN_UNPACKED, "resources", "standalone-server", "node_modules");
if (fs.existsSync(RESOURCES_NM)) fs.rmSync(RESOURCES_NM, { recursive: true, force: true });
const srcNm = path.join(STANDALONE_DST, "node_modules");
const dstNm = path.join(WIN_UNPACKED, "resources", "standalone-server", "node_modules");
// Preserve junction structure (needed for module resolution)
fs.cpSync(srcNm, dstNm, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
console.log("  node_modules copied (with junctions)");

// Resolve all junctions in the destination to real directories (NSIS cannot handle junctions)
console.log("  resolving all junctions to real directories...");
(function resolveJunctions(dir, depth) {
  if (depth > 10) return; // safety limit
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = path.resolve(dir, fs.readlinkSync(fullPath));
      fs.unlinkSync(fullPath);
      try {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          resolveJunctions(target, depth + 1);
          fs.cpSync(target, fullPath, { recursive: true, force: true });
        } else {
          fs.cpSync(target, fullPath, { force: true });
        }
      } catch (e) {
        if (e.code === "ENOENT") {
          // broken junction — skip
        } else { throw e; }
      }
    } else if (entry.isDirectory()) {
      resolveJunctions(fullPath, depth + 1);
    }
  }
})(dstNm, 0);
console.log("  all junctions resolved");

// Promote packages from .pnpm/*/node_modules/ to root (needed after flattening)
console.log("  promoting .pnpm packages to root level...");
(function promote(nmDir) {
  const pnpmDir = path.join(nmDir, ".pnpm");
  if (!fs.existsSync(pnpmDir)) return;
  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  let promoted = 0;
  for (const pkgEntry of pnpmEntries) {
    if (!pkgEntry.isDirectory()) continue;
    const nm = path.join(pnpmDir, pkgEntry.name, "node_modules");
    if (!fs.existsSync(nm)) continue;
    const scopeEntries = fs.readdirSync(nm, { withFileTypes: true });
    for (const se of scopeEntries) {
      const src = path.join(nm, se.name);
      const dst = path.join(nmDir, se.name);
      if (fs.existsSync(dst)) continue;
      if (se.name === ".pnpm") continue;
      fs.cpSync(src, dst, { recursive: true, force: true });
      promoted++;
    }
  }
  console.log("  promoted " + promoted + " packages to root");
  fs.rmSync(pnpmDir, { recursive: true, force: true });
  console.log("  removed .pnpm/");
})(dstNm);

// Copy hashed external modules from source .next/node_modules to destination
// (Turbopack SSR chunks may require modules like sql.js-<hash> directly)
const SRC_NEXT_NM = path.join(ROOT, ".next", "node_modules");
if (fs.existsSync(SRC_NEXT_NM)) {
  const srcEntries = fs.readdirSync(SRC_NEXT_NM, { withFileTypes: true });
  const hashedExternals = srcEntries
    .filter(e => (e.isDirectory() || e.isSymbolicLink()) && /^[a-z].*-[a-f0-9]{16}$/.test(e.name));
  if (hashedExternals.length > 0) {
    console.log("  copying " + hashedExternals.length + " hashed external modules...");
    for (const entry of hashedExternals) {
      const src = path.join(SRC_NEXT_NM, entry.name);
      const dst = path.join(dstNm, entry.name);
      if (!fs.existsSync(dst)) {
        // Resolve junction target if needed
        let realSrc = src;
        try {
          if (fs.lstatSync(src).isSymbolicLink()) {
            realSrc = path.resolve(SRC_NEXT_NM, fs.readlinkSync(src));
          }
        } catch (e) { /* ignore */ }
        fs.cpSync(realSrc, dst, { recursive: true, force: true });
        console.log("    copied " + entry.name);
      }
    }
  }
}

// Step 4b5: Slim down the packaged server (production never needs these)
console.log("\n[4b5/4] Slimming production node_modules...");
(function slim(nmDir) {
  let removedBytes = 0;
  const rm = (p) => {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  };
  const dirSize = (p) => {
    if (!fs.existsSync(p)) return 0;
    let t = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fp);
        else if (entry.isFile()) { try { t += fs.statSync(fp).size; } catch {} }
      }
    };
    walk(p);
    return t;
  };
  const before = dirSize(nmDir);

  const nextDist = path.join(nmDir, "next", "dist");
  if (fs.existsSync(nextDist)) {
    // 1. Source maps: only used by devtools, never at runtime.
    const maps = fs.readdirSync(nextDist, { recursive: true }).filter(f => f.endsWith(".map"));
    for (const f of maps) rm(path.join(nextDist, f));
    removedBytes += maps.length;
    console.log("  removed " + maps.length + " source maps from next/dist");

    // 2. Dev-only runtime files (NODE_ENV=production loads *.prod.* variants).
    const devFiles = fs.readdirSync(nextDist, { recursive: true }).filter(f =>
      /\.dev\.(js|cjs|mjs)$/.test(f)
    );
    for (const f of devFiles) rm(path.join(nextDist, f));
    removedBytes += devFiles.length;
    console.log("  removed " + devFiles.length + " dev runtime files from next/dist");
  }

  // 3. sql.js debug/asm-growth variants (production loads sql-wasm.js/.wasm only).
  for (const sqlDir of ["sql.js", ...(fs.readdirSync(nmDir).filter(n => /^sql\.js-/.test(n)))]) {
    const d = path.join(nmDir, sqlDir, "dist");
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (/-(debug|memory-growth)\./.test(f)) rm(path.join(d, f));
    }
    console.log("  trimmed debug variants in " + sqlDir);
  }

  // 4. Chromium license HTML (11MB of pure text, not needed at runtime).
  const winUnpackedRoot = path.join(ELECTRON, "dist", "win-unpacked");
  for (const f of ["LICENSES.chromium.html", "LICENSE.electron.txt"]) {
    rm(path.join(winUnpackedRoot, f));
  }

  const after = dirSize(nmDir);
  console.log("  node_modules before=" + (before/1048576).toFixed(1) + "MB after=" + (after/1048576).toFixed(1) + "MB saved=" + ((before-after)/1048576).toFixed(1) + "MB");
})(dstNm);

// Step 4c: Build NSIS installer from the modified unpackaged app
console.log("\n[4c/4] Building NSIS installer from unpackaged app...");
writeAppUpdateYml();
run("npx electron-builder --win --prepackaged=dist/win-unpacked", ELECTRON);
} else {
  console.log("  skip win-specific steps on mac");
}

console.log("\n=== Done ===");
console.log("Output files:");
const pkg = JSON.parse(fs.readFileSync(path.join(ELECTRON, "package.json"), "utf8"));
console.log("  " + path.join(ELECTRON, "dist", `ProfManager Setup ${pkg.version}.exe`));
console.log("  " + path.join(ELECTRON, "dist", `ProfManager-Portable-${pkg.version}.exe`));

