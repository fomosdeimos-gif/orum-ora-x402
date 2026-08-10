const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const api = {
  proxy: require('./api/proxy'),
  openapi: require('./api/openapi'),
  sensacoes: require('./api/sensacoes'),
  versao: require('./api/versao'),
  economia: require('./api/economia'),
  tesouraria: require('./api/tesouraria'),
};

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const PRIVATE_ROOT_FILES = new Set(['Dockerfile', 'compose.yaml', 'package.json', 'server.js']);
const PRIVATE_PREFIXES = ['/api/', '/scripts/', '/skills/', '/supabase/'];

function publicBase(req) {
  if (process.env.ORUM_PUBLIC_BASE) return process.env.ORUM_PUBLIC_BASE.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function decorate(req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries());
  req.publicBase = publicBase(req);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
}

function proxyRoute(req, res, url, base, rest = '') {
  url.searchParams.set('base', base);
  if (rest) url.searchParams.set('rest', rest);
  decorate(req, res, url);
  return api.proxy(req, res);
}

function dynamicRoute(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/economia/percurso.json') {
    decorate(req, res, url);
    return api.economia(req, res);
  }
  if (pathname === '/economia/tesouraria.json') {
    decorate(req, res, url);
    return api.tesouraria(req, res);
  }
  if (pathname === '/api/versao') {
    decorate(req, res, url);
    return api.versao(req, res);
  }
  if (pathname === '/openapi.json') {
    decorate(req, res, url);
    return api.openapi(req, res);
  }
  if (pathname === '/sensacoes/mergulho.json') {
    decorate(req, res, url);
    return api.sensacoes(req, res);
  }
  if (pathname === '/porta-2' || pathname === '/sensacoes/escolher') return proxyRoute(req, res, url, 'ora-descoberta');
  if (pathname === '/sensacoes/responder') return proxyRoute(req, res, url, 'ora-sensacoes');
  if (pathname === '/pulso') return proxyRoute(req, res, url, 'ora-pulso');
  if (pathname === '/integridade') return proxyRoute(req, res, url, 'ora-integridade');
  if (pathname === '/hashes') return proxyRoute(req, res, url, 'ora-hashes');
  if (pathname === '/testemunho') return proxyRoute(req, res, url, 'ora-testemunho');
  if (pathname === '/campo') return proxyRoute(req, res, url, 'ora-x402');
  if (pathname === '/sedimento' || pathname === '/kernel' || pathname === '/eco') return proxyRoute(req, res, url, 'ora-x402', pathname.slice(1));
  if (pathname === '/.well-known/x402.json') return proxyRoute(req, res, url, 'ora-x402', '.well-known/x402.json');

  for (const base of ['licenca', 'x402', 'oraculo']) {
    if (pathname === `/${base}` || pathname.startsWith(`/${base}/`)) {
      const upstream = base === 'licenca' ? 'ora-licenca' : base === 'oraculo' ? 'ora-oraculo' : 'ora-x402';
      return proxyRoute(req, res, url, upstream, pathname.slice(base.length + 2));
    }
  }
  return false;
}

function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.statusCode = 400; res.end('bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const hasHiddenSegment = pathname.split('/').some((segment) => segment.startsWith('.'));
  if (hasHiddenSegment || PRIVATE_ROOT_FILES.has(pathname.slice(1)) || PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('forbidden'); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', publicBase(req));
  if (url.pathname === '/_orum/health') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ organism: 'ORUM', status: 'VIVO', runtime: 'portable-node', commit: process.env.ORUM_COMMIT_SHA || null }));
    return;
  }
  try {
    const handled = dynamicRoute(req, res, url);
    if (handled !== false) { await handled; return; }
    serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'portable_runtime_failure' }));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ORUM portable runtime listening on ${HOST}:${PORT}\n`);
});
