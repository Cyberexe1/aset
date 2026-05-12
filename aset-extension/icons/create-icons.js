/**
 * Run this once to generate PNG icons for the extension
 * node create-icons.js
 * Requires: npm install canvas
 */
const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // ASET dot grid (simplified)
  ctx.fillStyle = '#00ffaa';
  const dotSize = size * 0.08;
  const positions = [
    [0.6, 0.15], [0.75, 0.15], [0.9, 0.15],
    [0.4, 0.35], [0.6, 0.35], [0.75, 0.35], [0.9, 0.35],
    [0.4, 0.55], [0.55, 0.55], [0.7, 0.55], [0.85, 0.55],
  ];

  positions.forEach(([x, y], i) => {
    const r = dotSize * (0.3 + (i % 4) * 0.2);
    ctx.beginPath();
    ctx.arc(x * size, y * size, r, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas.toBuffer('image/png');
}

[16, 48, 128].forEach(size => {
  fs.writeFileSync(`icon${size}.png`, createIcon(size));
  console.log(`Created icon${size}.png`);
});
