import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Proxy /samples/* to client/public/samples/ (static file serve)
// In both dev and prod we serve the files directly from the filesystem.
// In production the Vite build copies public/ assets to dist/, so we
// fall back to the source tree as a convenience.
app.use('/samples', (req, res, next) => {
  // Prefer the built dist copy in production; fall back to source public/.
  const candidates = isProd
    ? [
        path.join(__dirname, '../client/dist/samples', req.path),
        path.join(__dirname, '../client/public/samples', req.path),
      ]
    : [path.join(__dirname, '../client/public/samples', req.path)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }
  }
  next();
});

if (isProd) {
  // Serve the Vite production build
  const distPath = path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));

  // SPA fallback — send index.html for any unmatched route
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('Express dev server running. Vite dev server is at http://localhost:5173');
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT} [${isProd ? 'production' : 'development'}]`);
});
