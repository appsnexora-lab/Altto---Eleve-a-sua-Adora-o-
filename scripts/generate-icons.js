import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generatePNG(size, isMaskable = false) {
  // Raw scanlines: width * 4 bytes + 1 filter byte per line
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  // Colors in Minimalist Lilac
  // Background: #FBF9FF (251, 249, 255)
  // Border: #EEEAF5 (238, 234, 245)
  // Primary: #77619E (119, 97, 158)
  // Accent dot: #B6A2DB (182, 162, 219)
  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 251, g = 249, b = 255, a = 255; // #FBF9FF

      if (!isMaskable) {
        // Rounded squircle / circular boundary
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        if (cornerDist > radius) {
          // Outside icon boundary
          r = 255; g = 255; b = 255; a = 0;
        } else if (cornerDist > radius - 2) {
          // Border #EEEAF5
          r = 238; g = 234; b = 245; a = 255;
        }
      }

      // Draw stylized serif letter "A" and book bookmark in the center
      // Normalize coords to [-1, 1]
      const nx = (x - center) / (size * 0.32);
      const ny = (y - center) / (size * 0.32);

      // Check if within the "A" stroke or accent dot
      let inShape = false;

      // Left leg of A (ny between -0.7 and 0.6)
      if (ny >= -0.7 && ny <= 0.6) {
        const expectedXLeft = -0.55 * (ny + 0.7) / 1.3;
        if (Math.abs(nx - expectedXLeft) < 0.14) inShape = true;
      }
      // Right leg of A
      if (ny >= -0.7 && ny <= 0.6) {
        const expectedXRight = 0.55 * (ny + 0.7) / 1.3;
        if (Math.abs(nx - expectedXRight) < 0.14) inShape = true;
      }
      // Horizontal bar of A (ny around 0.1)
      if (ny >= 0.04 && ny <= 0.18 && nx >= -0.35 && nx <= 0.35) {
        inShape = true;
      }
      // Top cap of A
      if (ny >= -0.75 && ny <= -0.65 && Math.abs(nx) < 0.18) {
        inShape = true;
      }

      // Accent lilac dot at top right of A: (nx: 0.42, ny: -0.68)
      const dotDx = nx - 0.45;
      const dotDy = ny - (-0.68);
      const inDot = Math.sqrt(dotDx * dotDx + dotDy * dotDy) < 0.14;

      // Small open book accent beneath A: (ny around 0.8)
      const inBook = (ny >= 0.75 && ny <= 0.85 && Math.abs(nx) <= 0.5);

      if (inDot) {
        r = 182; g = 162; b = 219; a = 255; // #B6A2DB
      } else if (inShape || inBook) {
        r = 119; g = 97; b = 158; a = 255; // #77619E
      }

      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  // Header
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate 192x192
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePNG(192, false));
console.log('✓ Created pwa-192x192.png');

// 2. Generate 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePNG(512, false));
console.log('✓ Created pwa-512x512.png');

// 3. Generate 512x512 Maskable
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePNG(512, true));
console.log('✓ Created pwa-maskable-512x512.png');

// 4. Generate 180x180 Apple Touch Icon
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePNG(180, true));
console.log('✓ Created apple-touch-icon.png');

// 5. Generate favicon.ico (can be a small PNG)
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePNG(64, false));
console.log('✓ Created favicon.ico');
