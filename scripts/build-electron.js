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
  fs.mkdirSync(dst, { recursive: true });
  execSync(`xcopy /e /i /q "${src}" "${dst}\\"`, { stdio: "inherit" });
}

console.log("=== Build Electron (full pipeline) ===");

// Step 1: Build Next.js standalone
console.log("\n[1/5] Building Next.js standalone...");
run("npm run build", ROOT);

// Step 2: Copy standalone server into electron/
console.log("\n[2/5] Copying standalone server to electron/...");
if (fs.existsSync(STANDALONE_DST)) fs.rmSync(STANDALONE_DST, { recursive: true, force: true });
copyDir(STANDALONE_SRC, STANDALONE_DST);

// Step 3: Create unpacked Electron app
console.log("\n[3/5] Creating unpacked Electron app...");
run("npm run package", ELECTRON);

// Step 4: Copy standalone server (with node_modules) into unpacked resources
console.log("\n[4/5] Copying standalone server to win-unpacked...");
if (fs.existsSync(RESOURCES)) fs.rmSync(RESOURCES, { recursive: true, force: true });
copyDir(STANDALONE_DST, RESOURCES);

const hasNext = fs.existsSync(path.join(RESOURCES, "node_modules", "next"));
console.log(`  node_modules/next: ${hasNext ? "PRESENT" : "MISSING"}`);

// Step 5: Build installer from prepackaged
console.log("\n[5/5] Building installer from prepackaged...");
run("npm run installer", ELECTRON);

console.log("\n=== Done ===");
console.log("Output files:");
console.log("  " + path.join(ELECTRON, "dist", "ProfManager Setup 1.0.0.exe"));
console.log("  " + path.join(ELECTRON, "dist", "ProfManager-Portable-1.0.0.exe"));
