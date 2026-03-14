// Run this to generate a simple SVG icon placeholder
// Replace with actual icon later
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#6c5ce7"/>
  <path d="M256 120 L256 320 M176 260 L256 340 L336 260" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="160" y1="380" x2="352" y2="380" stroke="white" stroke-width="40" stroke-linecap="round"/>
</svg>`;

const traysvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path d="M8 2 L8 10 M5 8 L8 11 L11 8" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="4" y1="13" x2="12" y2="13" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);
fs.writeFileSync(path.join(__dirname, 'tray-icon.svg'), traysvg);
console.log('Icons created. Convert SVG to PNG/ICNS/ICO for production.');
