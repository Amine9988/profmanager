const path = require("path");
const sharp = require(path.join(__dirname, "..", "electron", "node_modules", "sharp"));

const PUBLIC = path.join(__dirname, "..", "electron", "public");
const LOGO = path.join(PUBLIC, "icon-512.png");

async function make(scale) {
  const w = 560 * scale;
  const h = 480 * scale;
  const banner = 110 * scale;
  const logoSize = 72 * scale;
  const svg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#ecf2f8"/>
    <rect width="${w}" height="${banner}" fill="#0f1a3d"/>
    <text x="${40 * scale + logoSize + 16 * scale}" y="${66 * scale}"
      fill="#ffffff" font-size="${28 * scale}" font-family="Segoe UI, Helvetica, Arial, sans-serif"
      font-weight="700">ProfManager</text>
    <text x="${40 * scale + logoSize + 16 * scale}" y="${90 * scale}"
      fill="#93c5fd" font-size="${13 * scale}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
      اسحب التطبيق إلى Applications
    </text>
  </svg>`);
  const logo = await sharp(LOGO).resize(logoSize, logoSize).png().toBuffer();
  const name = scale === 2 ? "dmg-background@2x.png" : "dmg-background.png";
  await sharp(svg)
    .composite([{ input: logo, top: 19 * scale, left: 40 * scale }])
    .png()
    .toFile(path.join(PUBLIC, name));
  console.log("wrote", name);
}

(async () => {
  await make(1);
  await make(2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
