const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Dark background with rounded corners
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  const r = size * 0.18;
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

  // Draw ASET dot matrix pattern (gradient dots)
  const cols = 6;
  const rows = 6;
  const padding = size * 0.12;
  const cellW = (size - padding * 2) / (cols - 1);
  const cellH = (size - padding * 2) / (rows - 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = padding + col * cellW;
      const y = padding + row * cellH;
      // Size increases from top-left to bottom-right (ASET logo pattern)
      const maxR = size * 0.07;
      const minR = size * 0.01;
      // Gradient: larger dots toward top-right
      const progress = (col / (cols - 1)) * 0.7 + (1 - row / (rows - 1)) * 0.3;
      const dotR = minR + (maxR - minR) * progress;

      // Color: teal/green for larger dots, dimmer for smaller
      const alpha = 0.3 + progress * 0.7;
      ctx.fillStyle = `rgba(0, 255, 170, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toBuffer('image/png');
}

const outDir = path.join(__dirname);
[16, 48, 128].forEach(size => {
  const buf = createIcon(size);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ icon${size}.png (${buf.length} bytes)`);
});
console.log('Done!');
