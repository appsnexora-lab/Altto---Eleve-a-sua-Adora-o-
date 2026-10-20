import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// Construct the high-fidelity SVG matching the user's uploaded icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="glyphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B29CE8" />
      <stop offset="50%" stop-color="#A58CE4" />
      <stop offset="100%" stop-color="#9C82DE" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#FBF9FE" />
    </linearGradient>
  </defs>

  <!-- Solid white base canvas -->
  <rect width="1024" height="1024" fill="#FFFFFF" />

  <!-- Outer Squircle with delicate lilac border -->
  <rect x="64" y="64" width="896" height="896" rx="260" ry="260" fill="url(#bgGrad)" stroke="#E8E1F5" stroke-width="12" />

  <!-- Inner subtle border matching user artwork -->
  <rect x="76" y="76" width="872" height="872" rx="248" ry="248" fill="none" stroke="#F3EEFA" stroke-width="4" />

  <!-- Stylized Modern "A" Motif -->
  <!-- Main A body with swooping left leg, bold right leg and dynamic swoosh crossbar -->
  <g id="logo-glyph" fill="url(#glyphGrad)">
    <!-- Main A Glyph combined path -->
    <!-- 1. The A Apex, Left Swoop, Right Leg and Counter -->
    <path d="
      M 518 252
      C 528 252 542 260 554 278
      C 580 320 632 414 690 522
      C 672 530 635 550 598 572
      C 560 488 530 412 516 384
      C 490 442 444 546 392 638
      C 350 670 295 704 235 722
      C 278 696 328 642 376 564
      C 432 468 488 344 508 274
      C 512 258 514 252 518 252
      Z
    " />

    <!-- 2. The Right Leg lower section and graceful foot -->
    <path d="
      M 598 572
      C 628 630 668 702 708 732
      C 740 754 772 748 782 738
      C 772 730 750 710 732 680
      C 700 630 664 558 642 512
      C 626 532 612 552 598 572
      Z
    " />

    <!-- 3. The Dynamic Upward Curved Crossbar / Swoosh -->
    <path d="
      M 235 722
      C 320 690 420 615 540 538
      C 620 488 710 492 770 542
      C 730 528 660 532 580 575
      C 480 628 380 690 280 726
      C 260 726 245 724 235 722
      Z
    " />
  </g>
</svg>
`;

const publicDir = path.resolve('public');
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg, 'utf-8');

// Rasterize using Resvg for pixel-perfect quality
function renderPng(targetSvg, width, height) {
  const resvg = new Resvg(targetSvg, {
    fitTo: { mode: 'width', value: width },
    shapeRendering: 2, // geometricPrecision
    textRendering: 1, // optimizeLegibility
    imageRendering: 0, // optimizeQuality
  });
  return resvg.render().asPng();
}

// 1. App Icon 192x192
const png192 = renderPng(svg, 192, 192);
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);

// 2. App Icon 512x512
const png512 = renderPng(svg, 512, 512);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);

// 3. Apple Touch Icon 180x180
const pngApple = renderPng(svg, 180, 180);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);

// 4. Favicon 64x64 PNG & ICO
const pngFavicon = renderPng(svg, 64, 64);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), pngFavicon);

// 5. Maskable Icon 512x512 (with safe-zone padding as required by PWA standards)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#FFFFFF" />
  <g transform="translate(102, 102) scale(0.8)">
    ${svg.replace(/<\/?svg[^>]*>/g, '')}
  </g>
</svg>`;
const pngMaskable = renderPng(maskableSvg, 512, 512);
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);

console.log('✓ All PWA and mobile icons generated successfully from user artwork!');
