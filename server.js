// Simple local dev server for Draftline
// Usage: node server.js
// Then open http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const WINDY_KEY = process.env.WINDY_POINT_API_KEY || loadDevVars();

function loadDevVars() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8');
    const match = raw.match(/WINDY_POINT_API_KEY\s*=\s*(.+)/);
    return match ? match[1].trim() : '';
  } catch { return ''; }
}

async function proxyWindy(lat, lon, model, res) {
  if (!WINDY_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API key not configured on server' }));
    return;
  }

  const body = JSON.stringify({
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    model: model || 'gfs',
    parameters: ['temp','dewpoint','precip','wind_u-surface','wind_v-surface','gust','humidity','lclouds','mclouds','hclouds','cape'],
    levels: ['surface'],
    key: WINDY_KEY,
  });

  // Node 18+ has native fetch
  try {
    const upstream = await fetch('https://api.windy.com/api/point-forecast/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=1800' });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API proxy
  if (url.pathname === '/api/weather') {
    await proxyWindy(
      url.searchParams.get('lat'),
      url.searchParams.get('lon'),
      url.searchParams.get('model'),
      res
    );
    return;
  }

  // Static files
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);

  if (!ext && !filePath.includes('.')) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const hasKey = !!WINDY_KEY;
  console.log(`\nDraftline running at http://localhost:${PORT}`);
  console.log(hasKey
    ? `Windy API key loaded — live data active`
    : `No Windy key — app will use demo data (add key to .dev.vars)`
  );
  console.log('Press Ctrl+C to stop\n');
});
