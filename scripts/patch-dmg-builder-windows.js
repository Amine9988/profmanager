const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "electron", "node_modules", "dmg-builder", "out", "dmgUtil.js");
if (!fs.existsSync(file)) {
  console.log("skip dmg-builder patch (package not installed)");
  process.exit(0);
}

const src = fs.readFileSync(file, "utf8");
const needle = `async function getImageSizeUsingSips(background) {
    const stdout = await (0, builder_util_1.exec)("sips", ["-g", "pixelHeight", "-g", "pixelWidth", background]);`;
const patched = `async function getImageSizeUsingSips(background) {
    if (process.platform !== "darwin") {
        return { width: 540, height: 380 };
    }
    const stdout = await (0, builder_util_1.exec)("sips", ["-g", "pixelHeight", "-g", "pixelWidth", background]);`;

if (src.includes("process.platform !== \"darwin\"")) {
  console.log("dmg-builder already patched for Windows");
  process.exit(0);
}
if (!src.includes(needle)) {
  console.log("skip dmg-builder patch (source shape changed)");
  process.exit(0);
}
fs.writeFileSync(file, src.replace(needle, patched));
console.log("patched dmg-builder getImageSizeUsingSips for Windows");
