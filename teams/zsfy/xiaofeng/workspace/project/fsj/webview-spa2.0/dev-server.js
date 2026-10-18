const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8899;
const ROOT = __dirname;

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type':'text/plain'});
      res.end('Not found: ' + urlPath);
      return;
    }
    let ext = path.extname(filePath);
    let ct = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[ext] || 'text/plain';
    res.writeHead(200, {
      'Content-Type': ct,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('Test URL: http://localhost:' + PORT + '/index.html?shangjia=65428a74-2f5e-46a8-a111-e1a59297b22e');
});
