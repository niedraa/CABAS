/**
 * Mini-serveur statique pour le build web (`dist/`, sortie « single ») :
 * toute route sans extension renvoie `index.html` (routage côté client).
 * Aucune dépendance : http + fs de Node.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Démarre le serveur ; renvoie `{ url, close() }`. Port 0 = port libre. */
export function serveStatic(root, port = 0) {
  const base = resolve(root);
  if (!existsSync(join(base, 'index.html'))) {
    throw new Error(`Build web introuvable dans ${base} : lance d'abord « npm run build:web ».`);
  }
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    // Pas de sortie de la racine (« ../ »).
    let file = normalize(join(base, pathname));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const index = join(file, 'index.html');
      if (existsSync(index)) file = index;
      else if (extname(pathname) === '') file = join(base, 'index.html');
      else {
        res.writeHead(404).end('Not found');
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, ko) => {
    server.once('error', ko);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      ok({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
