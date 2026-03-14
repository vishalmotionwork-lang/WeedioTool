const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  // Background — rounded rect with gradient
  const bgGrad = ctx.createLinearGradient(0, 0, s, s);
  bgGrad.addColorStop(0, '#7c5ce7');
  bgGrad.addColorStop(1, '#4834d4');

  const r = s * 0.2; // corner radius
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Subtle inner shadow
  const innerGrad = ctx.createRadialGradient(s * 0.3, s * 0.3, 0, s * 0.5, s * 0.5, s * 0.7);
  innerGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
  innerGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // Draw download arrow
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.06;

  // Vertical line (arrow shaft)
  const cx = s * 0.5;
  const topY = s * 0.22;
  const bottomY = s * 0.58;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx, bottomY);
  ctx.stroke();

  // Arrow head
  const arrowW = s * 0.15;
  ctx.beginPath();
  ctx.moveTo(cx - arrowW, bottomY - arrowW);
  ctx.lineTo(cx, bottomY);
  ctx.lineTo(cx + arrowW, bottomY - arrowW);
  ctx.stroke();

  // Bottom tray/platform
  const trayY = s * 0.68;
  const trayW = s * 0.3;
  const trayH = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(cx - trayW, trayY);
  ctx.lineTo(cx - trayW, trayY + trayH);
  ctx.lineTo(cx + trayW, trayY + trayH);
  ctx.lineTo(cx + trayW, trayY);
  ctx.stroke();

  // "W" text at bottom
  ctx.font = `bold ${s * 0.1}px -apple-system, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WeedioTool', cx, s * 0.87);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

// Generate multiple sizes
generateIcon(1024, path.join(__dirname, 'assets', 'icon.png'));
generateIcon(512, path.join(__dirname, 'assets', 'icon-512.png'));
generateIcon(16, path.join(__dirname, 'assets', 'tray-icon.png'));

console.log('All icons generated!');
