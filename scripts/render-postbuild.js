const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATIC_SRC = path.join(ROOT, ".next", "static");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const STATIC_DST = path.join(STANDALONE, ".next", "static");
const STANDALONE_NM = path.join(STANDALONE, "node_modules");
const SRC_NEXT_NM = path.join(ROOT, ".next", "node_modules");

if (!fs.existsSync(STANDALONE)) {
  console.error("[render-postbuild] .next/standalone not found — did next build run?");
  process.exit(1);
}

// 1. Next.js standalone omits .next/static — copy it in
if (fs.existsSync(STATIC_SRC)) {
  if (fs.existsSync(STATIC_DST)) fs.rmSync(STATIC_DST, { recursive: true, force: true });
  fs.cpSync(STATIC_SRC, STATIC_DST, { recursive: true, force: true });
  console.log("[render-postbuild] copied .next/static into standalone");
} else {
  console.warn("[render-postbuild] no .next/static to copy");
}

// 2. Ensure public/ is present (sql-wasm.wasm, jsbarcode, etc.)
const PUBLIC_SRC = path.join(ROOT, "public");
const PUBLIC_DST = path.join(STANDALONE, "public");
if (fs.existsSync(PUBLIC_SRC)) {
  if (!fs.existsSync(PUBLIC_DST)) {
    fs.cpSync(PUBLIC_SRC, PUBLIC_DST, { recursive: true, force: true });
    console.log("[render-postbuild] copied public/ into standalone");
  }
}

// 3. Copy hashed external modules (e.g. sql.js-<hash>) that Turbopack SSR
//    chunks may require directly — mirrors scripts/build-electron.js step 4b
if (fs.existsSync(SRC_NEXT_NM) && fs.existsSync(STANDALONE_NM)) {
  const srcEntries = fs.readdirSync(SRC_NEXT_NM, { withFileTypes: true });
  const hashedExternals = srcEntries
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && /^[a-z].*-[a-f0-9]{16}$/.test(e.name));
  let copied = 0;
  for (const entry of hashedExternals) {
    const src = path.join(SRC_NEXT_NM, entry.name);
    const dst = path.join(STANDALONE_NM, entry.name);
    if (!fs.existsSync(dst)) {
      let realSrc = src;
      try {
        if (fs.lstatSync(src).isSymbolicLink()) {
          realSrc = path.resolve(SRC_NEXT_NM, fs.readlinkSync(src));
        }
      } catch (e) { /* ignore */ }
      fs.cpSync(realSrc, dst, { recursive: true, force: true, dereference: true });
      copied++;
    }
  }
  if (copied > 0) console.log(`[render-postbuild] copied ${copied} hashed external modules`);
}

// 4. Ensure sql.js itself is present (serverExternalPackages resolves at runtime)
const sqlSrc = path.join(ROOT, "node_modules", "sql.js");
const sqlDst = path.join(STANDALONE_NM, "sql.js");
if (fs.existsSync(sqlSrc) && !fs.existsSync(sqlDst)) {
  fs.cpSync(sqlSrc, sqlDst, { recursive: true, force: true, dereference: true });
  console.log("[render-postbuild] copied sql.js into standalone node_modules");
}

console.log("[render-postbuild] done");
