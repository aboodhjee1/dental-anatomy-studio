import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.stl': 'application/octet-stream' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
    // Serve only public app assets, including when testing over Wi-Fi.
    const segments = relative.split(path.sep);
    if (segments.some(segment => segment.startsWith('.')) ||
        !(relative === 'index.html' || ['css', 'js', 'data', 'meshes', 'vendor'].includes(segments[0]))) {
      response.writeHead(403); response.end(); return;
    }
    const content = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end('File not found'); }
});
server.on('error', error => { console.error(`Cannot start the atlas: ${error.message}. Try another port with PORT.`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Dental Anatomy Studio: http://${host}:${port}`));
