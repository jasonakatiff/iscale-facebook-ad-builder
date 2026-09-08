import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = resolve(frontend, 'dist/prototype');
let html = await readFile(resolve(built, 'prototype/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length !== 1) throw new Error('Expected one self-contained JS and CSS bundle.');
for (const [tag, source] of scripts) {
  if (!source.startsWith('/assets/')) throw new Error('Unexpected script path.');
  const code = await readFile(resolve(built, source.slice(1)), 'utf8');
  html = html.replace(tag, () => `<script type="module">${code.replaceAll('</script', '<\\/script')}</script>`);
}
for (const [tag, source] of styles) {
  if (!source.startsWith('/assets/')) throw new Error('Unexpected stylesheet path.');
  const css = await readFile(resolve(built, source.slice(1)), 'utf8');
  html = html.replace(tag, () => `<style>${css.replaceAll('</style', '<\\/style')}</style>`);
}
html = html.replace(/connect-src [^;]+;/, "connect-src 'none';");
const output = resolve(homedir(), 'Documents/Breadwinner-workflow-prototype.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
process.stdout.write(`Exported ${output}\n`);
