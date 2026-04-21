// Simple local dev server for Draftline
// Usage: node server.js
// Then open http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');

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

async function proxyYR(lat, lon, res) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${parseFloat(lat).toFixed(4)}&lon=${parseFloat(lon).toFixed(4)}`;
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Draftline/1.0 github.com/Daveshelly3/Draftline' },
    });
    const data = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=1800',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/weather') {
    await proxyYR(url.searchParams.get('lat'), url.searchParams.get('lon'), res);
    return;
  }

  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
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
  console.log(`\nDraftline running at http://localhost:${PORT}`);
  console.log('Weather data: YR / met.no (no API key needed)');
  console.log('Press Ctrl+C to stop\n');
});
