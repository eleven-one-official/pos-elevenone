// Optimizes source photos into web-ready assets (WebP + JPG fallback).
//
// Usage:  npm run optimize:images
//
// Add a new entry to JOBS for each source image you want optimized.
// Source files stay untouched; outputs are (re)generated next to `out`.

import sharp from 'sharp'
import { statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** @type {{ src: string, out: string, maxEdge?: number, quality?: number }[]} */
const JOBS = [
  {
    // Login brand-panel background.
    src: 'images/menu/IMG_6957.JPG',
    out: 'images/login-bg', // .webp + .jpg are appended
    maxEdge: 1600,
    quality: 80,
  },
]

const kb = (p) => (statSync(p).size / 1024).toFixed(0) + ' KB'

let failed = false

for (const job of JOBS) {
  const src = resolve(publicDir, job.src)
  if (!existsSync(src)) {
    console.warn(`skip: source not found — ${job.src}`)
    failed = true
    continue
  }

  const maxEdge = job.maxEdge ?? 1600
  const quality = job.quality ?? 80
  const base = sharp(src)
    .rotate() // bake in EXIF orientation
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })

  const meta = await sharp(src).metadata()
  const webp = resolve(publicDir, `${job.out}.webp`)
  const jpg = resolve(publicDir, `${job.out}.jpg`)

  await base.clone().webp({ quality }).toFile(webp)
  await base.clone().jpeg({ quality: quality + 2, mozjpeg: true }).toFile(jpg)

  console.log(
    `${job.src}  (${meta.width}x${meta.height}, ${kb(src)})\n` +
      `  → ${job.out}.webp  ${kb(webp)}\n` +
      `  → ${job.out}.jpg   ${kb(jpg)}`,
  )
}

if (failed) process.exitCode = 1
