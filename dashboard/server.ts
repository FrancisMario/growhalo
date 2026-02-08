// ──────────────────────────────────────────
// Dashboard: lightweight UI server on port 3001
// Proxies API calls to the main server on port 3000
// ──────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const PORT = process.env.DASHBOARD_PORT || 3001;

// Resolve API key: env var → .api_key file
let apiKey = process.env.GROWHALO_API_KEY || '';
if (!apiKey) {
  try {
    apiKey = fs.readFileSync(path.join(__dirname, '..', '.api_key'), 'utf-8').trim();
    console.log('[Dashboard] Loaded API key from .api_key file');
  } catch {}
}
if (!apiKey) {
  console.error('[Dashboard] Set GROWHALO_API_KEY or run seed first (writes .api_key)');
  process.exit(1);
}

app.use(express.json());

// Proxy all /api requests to the backend with the API key injected
app.use('/api', async (req, res) => {
  try {
    const url = `${API_BASE}${req.originalUrl}`;
    const resp = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'API proxy error', detail: String(err) });
  }
});

// Serve the dashboard HTML
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Dashboard] UI running at http://localhost:${PORT}`);
});
