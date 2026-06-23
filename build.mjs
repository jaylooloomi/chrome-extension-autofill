// Build script for the Autofy MV3 extension.
//
// We bundle with esbuild rather than @crxjs/vite-plugin for predictable output:
//  - content script must be a single self-contained file (MV3 registers classic
//    scripts), so it is built as an IIFE.
//  - the service worker is declared `type: module`, so it is built as ESM.
//  - options / popup are HTML pages that load their JS as ES modules.
// (vitest still provides the Vite-based test toolchain.)

import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const common = {
  bundle: true,
  platform: 'browser',
  target: 'chrome111',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions[]} */
const builds = [
  { ...common, entryPoints: { background: 'src/background/index.ts' }, outdir, format: 'esm' },
  { ...common, entryPoints: { content: 'src/content/index.ts' }, outdir, format: 'iife' },
  { ...common, entryPoints: { options: 'src/options/options.ts' }, outdir, format: 'esm' },
  { ...common, entryPoints: { popup: 'src/popup/popup.ts' }, outdir, format: 'esm' },
];

const staticAssets = [
  ['manifest.json', 'dist/manifest.json'],
  ['src/options/options.html', 'dist/options.html'],
  ['src/options/options.css', 'dist/options.css'],
  ['src/popup/popup.html', 'dist/popup.html'],
  ['src/popup/popup.css', 'dist/popup.css'],
];

async function copyStatic() {
  for (const [from, to] of staticAssets) {
    if (existsSync(from)) await cp(from, to);
  }
  if (existsSync('icons')) await cp('icons', 'dist/icons', { recursive: true });
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  if (watch) {
    const ctxs = await Promise.all(builds.map((b) => esbuild.context(b)));
    await Promise.all(ctxs.map((c) => c.watch()));
    await copyStatic();
    console.log('[autofy] watching for changes…');
  } else {
    await Promise.all(builds.map((b) => esbuild.build(b)));
    await copyStatic();
    console.log('[autofy] build complete → dist/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
