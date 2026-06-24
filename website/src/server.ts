import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProfileById, getAppSetting, setAppSetting, upsertProfile, updateUserSettings } from '@quant/shared';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const adminToken = process.env.ADMIN_API_TOKEN;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  next();
}

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quant Tracker</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; }
      main { max-width: 720px; padding: 32px; }
      .card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 16px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
      h1 { margin-top: 0; }
      code { background: rgba(148, 163, 184, 0.15); padding: 2px 6px; border-radius: 6px; }
      a { color: #7dd3fc; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>Quant Tracker is running</h1>
        <p>API health: <a href="/health">/health</a></p>
        <p>Settings endpoint: <code>/api/settings</code></p>
      </div>
    </main>
  </body>
</html>`);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
