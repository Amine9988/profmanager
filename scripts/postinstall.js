const fs = require("fs");
const path = require("path");

const lucideCjs = path.join(
  __dirname,
  "..",
  "node_modules",
  "lucide-react",
  "dist",
  "cjs",
  "lucide-react.js"
);

if (fs.existsSync(lucideCjs)) {
  const content = fs.readFileSync(lucideCjs, "utf8");
  if (!content.startsWith('"use client"')) {
    fs.writeFileSync(lucideCjs, '"use client";' + content);
    console.log("[postinstall] Added \"use client\" to lucide-react CJS entry");
  }
}
