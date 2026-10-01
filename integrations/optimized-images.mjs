// After the build, point each <img> at the WebP that scripts/optimize-images.mjs
// wrote beside its PNG/JPEG source. Pages keep referencing the originals, and
// meta tags (og:image) are untouched because only <img> tags are rewritten.
import { existsSync } from 'node:fs';
import { glob, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function optimizedImages() {
  return {
    name: 'optimized-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let swapped = 0;
        for await (const file of glob('**/*.html', { cwd: root })) {
          const htmlPath = path.join(root, file);
          const html = await readFile(htmlPath, 'utf8');
          const output = html.replace(/<img\b[^>]*>/gi, (tag) =>
            tag.replace(/(\ssrc=")(\/img\/[^"?#]+)\.(?:png|jpe?g)"/i, (match, prefix, base) => {
              if (!existsSync(path.join(root, `${decodeURI(base)}.webp`))) return match;
              swapped++;
              return `${prefix}${base}.webp"`;
            }),
          );
          if (output !== html) await writeFile(htmlPath, output);
        }
        logger.info(`Serving WebP for ${swapped} image references.`);
      },
    },
  };
}
