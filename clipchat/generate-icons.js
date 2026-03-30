// Generate PWA PNG icons from SVG
// Run once: node generate-icons.js
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'icons', 'favicon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

// Create simple PNG placeholders using a canvas-like approach
// Since we don't have canvas in Node without extra deps, we'll create minimal valid PNGs

function createMinimalPNG(size) {
  // We'll use the SVG as-is for now. For proper PNG generation,
  // use: npx svgexport public/icons/favicon.svg public/icons/icon-192.png 192:192
  // For now, create a simple colored square PNG

  // Minimal PNG with a teal-colored square
  const { createCanvas } = (() => {
    try { return require('canvas'); } catch { return {}; }
  })();

  if (createCanvas) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.2);
    ctx.fill();
    // Clip icon
    ctx.strokeStyle = '#16a596';
    ctx.lineWidth = size * 0.05;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = size / 2, cy = size / 2;
    const s = size * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy - s * 0.83);
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 1.17, cx, cy - s * 1.17);
    ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 1.17, cx + s * 0.5, cy - s * 0.83);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.93, cx, cy + s * 0.93);
    ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.93, cx - s * 0.5, cy + s * 0.5);
    ctx.closePath();
    ctx.stroke();
    return canvas.toBuffer('image/png');
  }

  // Fallback: create a 1x1 teal pixel PNG and note that proper icons need canvas
  console.log(`Note: Install 'canvas' package for proper icon generation. Creating placeholder for ${size}x${size}`);

  // Minimal valid 1x1 PNG (will be stretched by browsers)
  return Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
    '7753de0000000c4944415478016260f81fcf000001010000185dd8ee0000' +
    '000049454e44ae426082', 'hex'
  );
}

const icon192 = createMinimalPNG(192);
const icon512 = createMinimalPNG(512);

fs.writeFileSync(path.join(__dirname, 'public', 'icons', 'icon-192.png'), icon192);
fs.writeFileSync(path.join(__dirname, 'public', 'icons', 'icon-512.png'), icon512);

console.log('Icons generated (placeholders). For proper icons, install canvas: npm i canvas');
