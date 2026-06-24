import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getProfileById, getAppSetting, setAppSetting, upsertProfile, updateUserSettings } from '@quant/shared';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const adminToken = process.env.ADMIN_API_TOKEN;

app.use(cors());
app.use(express.json());

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!adminToken || token !== adminToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/settings', async (_req, res) => {
  const freeMode = await getAppSetting('free_mode');
  const devMode = await getAppSetting('dev_mode');
  res.json({ freeMode: Boolean(freeMode), devMode: Boolean(devMode) });
});

app.get('/api/profile/:userId', async (req, res) => {
  try {
    const profile = await getProfileById(req.params.userId);
    res.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/profile/:userId', async (req, res) => {
  try {
    const profile = await upsertProfile({ id: req.params.userId, ...req.body });
    res.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/profile/:userId/settings', async (req, res) => {
  try {
    const settings = await updateUserSettings(req.params.userId, req.body);
    res.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/admin/toggle', requireAdmin, async (req, res) => {
  const { key, value } = req.body as { key?: string; value?: unknown };
  if (key !== 'free_mode' && key !== 'dev_mode') {
    return res.status(400).json({ error: 'Invalid toggle key' });
  }
  await setAppSetting(key, Boolean(value), 'Website admin toggle');
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Website server listening on port ${port}`);
});
