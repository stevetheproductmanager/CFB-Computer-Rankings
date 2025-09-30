
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeCfbdClient } from './cfbdClient.js';
import { ENDPOINTS } from './endpoints.js';
import { writeJson } from './save.js';
import { log } from './utils/logger.js';
import fs from 'fs';
import makeTeamsRouter from './routes/teams.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const {
  CFBD_API_KEY,
  CFBD_BASE_URL = 'https://apinext.collegefootballdata.com',
  PORT = 5050
} = process.env;

if (!CFBD_API_KEY) {
  console.warn('WARNING: CFBD_API_KEY is not set. Set it in server/.env.');
}

const cfbd = makeCfbdClient({ baseURL: CFBD_BASE_URL, apiKey: CFBD_API_KEY });


// ⬇️ Mount the router (it will expose /api/teams/season-stats and /api/teams/compare)
app.use('/api/teams', makeTeamsRouter({
  baseURL: CFBD_BASE_URL,
  apiKey: CFBD_API_KEY
}));

app.get('/api/data/manifest', (req, res) => {
  try {
    const year = String(req.query.year || '2025');
    const dir = path.join(__dirname, '..', 'data', year);
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { files = []; }
    res.json({ year, files });
  } catch (e) {
    res.json({ year: null, files: [], error: String(e?.message || e) });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, baseUrl: CFBD_BASE_URL });
});

async function tryCandidates(year, candidates) {
  let last = { status: 0, data: null, path: null };
  for (const tmpl of candidates) {
    const path = tmpl.replaceAll('{year}', String(year)).replaceAll('{season}', String(year));
    const { status, data } = await cfbd.get(path);
    if (status === 200) {
      return { ok: true, path, data };
    }
    last = { status, data, path };
    await new Promise(r => setTimeout(r, 120));
  }
  return { ok: false, ...last };
}

app.post('/api/download', async (req, res) => {
  try {
    const year = Number(req.body?.year || 2025);
    const results = [];
    const errors = [];

    for (const ep of ENDPOINTS) {
      const candidates = ep.candidates || [ep.path];
      try {
        const out = await tryCandidates(year, candidates);
        if (out.ok) {
          const savedTo = writeJson(year, ep.slug, out.data);
          const count = Array.isArray(out.data) ? out.data.length : (out.data ? 1 : 0);
          results.push({ slug: ep.slug, pathTried: out.path, savedTo, count });
        } else {
          errors.push({ slug: ep.slug, pathTried: out.path, status: out.status, message: typeof out.data === 'string' ? out.data : JSON.stringify(out.data).slice(0, 400) });
        }
      } catch (inner) {
        errors.push({ slug: ep.slug, message: String(inner?.message || inner) });
      }
      await new Promise(r => setTimeout(r, 150));
    }

    res.json({ year, baseUrl: CFBD_BASE_URL, results, errors, summary: { ok: errors.length === 0, downloaded: results.length, failed: errors.length } });
  } catch (e) {
    res.status(200).json({ fatal: true, message: String(e?.message || e) });
  }
});


app.use('/data', express.static(path.join(__dirname, '..', 'data')));

app.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);
});
