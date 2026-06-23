// Minimal static server for manual testing (no dependencies).
// Serves this folder over http so the content script (http/https only) injects.
//   node test/manual/serve.mjs  ->  http://localhost:8765/job-form.html

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = 8765;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

createServer(async (req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/') path = '/job-form.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`[autofy] test form: http://localhost:${port}/job-form.html`);
});
