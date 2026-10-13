// Encodes an alpha mask as WebP with lossy alpha (OpenCV can only store alpha
// losslessly, which makes soft washes several times larger than they need to be).
// Usage: node encode-mask.mjs <input.png> <output.webp> <width>
import sharp from 'sharp';

const [input, output, width] = process.argv.slice(2);
await sharp(input)
  .resize({ width: Number(width) })
  .webp({ quality: 60, alphaQuality: 55, effort: 6 })
  .toFile(output);
