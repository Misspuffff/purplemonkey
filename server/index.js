import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ANTHROPIC_API_KEY etc. from a project-root .env if present (Node ≥ 21.7).
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const { vibeToScene, jam, hasCredentials, ClaudeRefusal } = await import('./claude.js');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '64kb' }));

// ── Claude API routes ────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({ claude: hasCredentials() });
});

/** Shared error mapping so the client can show a useful message. */
function sendError(res, err, label) {
  if (err instanceof ClaudeRefusal) return res.status(422).json({ error: err.message });
  if (err?.name === 'ZodError' || err instanceof SyntaxError) {
    console.error(`[${label}] invalid model output:`, err.message);
    return res.status(502).json({ error: 'Claude returned an unexpected shape — try again.' });
  }
  const status = err?.status ?? 500;
  console.error(`[${label}]`, status, err?.message);
  res.status(status === 401 ? 401 : 502).json({
    error: status === 401 ? 'Anthropic API key is missing or invalid.' : 'Claude is unavailable right now.',
  });
}

app.post('/api/vibe', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim().slice(0, 300);
  if (!prompt) return res.status(400).json({ error: 'Describe a vibe first.' });
  try {
    res.json({ scene: await vibeToScene(prompt, req.body?.current ?? null) });
  } catch (err) {
    sendError(res, err, 'vibe');
  }
});

app.post('/api/jam', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Missing performance.' });
  try {
    res.json(await jam(req.body));
  } catch (err) {
    sendError(res, err, 'jam');
  }
});

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
