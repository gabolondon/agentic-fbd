import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocApi } from './api.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** The prebuilt viewer: next to the bundled cli.mjs, or dist/viewer when running from source. */
export function findViewerDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'viewer'), resolve(here, '../../../dist/viewer')];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null;
}

export interface RunningServer {
  url: string;
  server: Server;
  close: () => Promise<void>;
}

export interface ServerOptions {
  file: string;
  /** 0 picks a free port. */
  port?: number;
  viewerDir: string;
}

export function startServer({ file, port = 0, viewerDir }: ServerOptions): Promise<RunningServer> {
  const api = createDocApi(file);
  const root = resolve(viewerDir);

  const server = createServer((req, res) => {
    if (api.handle(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const target = staticPath(root, req.url ?? '/');
    if (!target) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(target));
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    // Loopback only: the viewer exposes the file's contents.
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolvePromise({
        url: `http://127.0.0.1:${actualPort}/`,
        server,
        close: () =>
          new Promise((done) => {
            api.close();
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Resolves a request URL inside the viewer directory; null for anything outside it or missing. */
export function staticPath(root: string, url: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = normalize(join(root, relative));
  if (target !== root && !target.startsWith(root + sep)) return null;
  try {
    return statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}
