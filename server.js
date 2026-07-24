const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // Add CORS headers for smooth local API integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Endpoint to handle auto-saving updates directly back to admin_data.json on disk
  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(path.join(__dirname, 'admin_data.json'), JSON.stringify(data, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Successfully auto-saved to admin_data.json' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Serve static files (HTML, CSS, JS, JSON)
  let urlPath = req.url === '/' || req.url === '' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0]; // Strip query parameters

  let filePath;
  // Serve admin_data.json from root (since saving is written to root)
  if (urlPath === '/admin_data.json') {
    filePath = path.join(__dirname, 'admin_data.json');
  } else {
    filePath = path.join(__dirname, 'dist', 'buproject', 'browser', urlPath);
  }

  // If the path doesn't exist or is a directory, fallback to index.html (SPA routing)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'dist', 'buproject', 'browser', 'index.html');
  }

  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  else if (ext === '.css') contentType = 'text/css';
  else if (ext === '.json') contentType = 'application/json';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.ico') contentType = 'image/x-icon';

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` E-Doc Server running locally at:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` Updates will automatically save to admin_data.json`);
  console.log(`=======================================================`);
});
