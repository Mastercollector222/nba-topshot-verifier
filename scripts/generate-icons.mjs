import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

function drawIcon(size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const pad = maskable ? size * 0.1 : 0;
  const inner = size - pad * 2;

  // Background
  const bg = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  bg.addColorStop(0, "#fb923c");
  bg.addColorStop(1, "#dc2626");
  ctx.fillStyle = bg;

  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    const r = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Inner overlay
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  if (maskable) {
    ctx.fillRect(pad, pad, inner, inner);
  } else {
    ctx.fill();
  }

  // Flame shape drawn with bezier curves, scaled to icon size
  const flameSize = inner * 0.52;
  const scale = flameSize / 24;
  const ox = pad + (inner - flameSize) / 2;
  const oy = pad + (inner - flameSize) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0.75)";

  ctx.beginPath();
  // Start at top center (12,2)
  ctx.moveTo(12, 2);
  // curve right side down to ball bottom
  ctx.bezierCurveTo(13.8, 5.6, 16, 7.2, 16, 10.2);
  ctx.bezierCurveTo(16, 12.4, 14.6, 14, 13, 14);
  // inner dip
  ctx.bezierCurveTo(13, 12.4, 12.2, 11, 11, 10);
  // curve left inner
  ctx.bezierCurveTo(10.4, 12, 9, 13, 9, 15);
  // bottom arc
  ctx.bezierCurveTo(9, 17.8, 11.2, 20, 14, 20);
  ctx.bezierCurveTo(16.8, 20, 19, 17.8, 19, 15);
  ctx.bezierCurveTo(19, 9.4, 14, 7, 12, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer("image/png");
}

const sizes = [
  { size: 192, maskable: false, name: "icon-192.png" },
  { size: 192, maskable: true,  name: "icon-192-maskable.png" },
  { size: 512, maskable: false, name: "icon-512.png" },
  { size: 512, maskable: true,  name: "icon-512-maskable.png" },
  { size: 180, maskable: false, name: "apple-touch-icon-180.png" },
];

for (const { size, maskable, name } of sizes) {
  const buf = drawIcon(size, maskable);
  writeFileSync(join(OUT, name), buf);
  console.log(`✓ ${name} (${size}x${size})`);
}
