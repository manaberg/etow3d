import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { createRepository } from './src/repository.mjs';
import { hashPassword, verifyPassword } from './src/security.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const distDir = path.join(projectRoot, 'dist');
const dbPath = path.join(dataDir, 'etow3d.sqlite');

const app = express();
const repo = createRepository(dbPath);

const PORT = Number(process.env.PORT || 8080);
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'change-me-in-production-etow3d-session-secret';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: 'etow3d.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

function normalizeAuthPayload(body = {}) {
  const login = String(body.login ?? body.username ?? body.email ?? '').trim();
  const username = String(body.username ?? '').trim();
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? body.passwd ?? '').trim();

  return { login, username, email, password };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'etow3d-backend',
    time: new Date().toISOString(),
  });
});

app.post('/auth/register', (req, res) => {
  const { username, email, password } = normalizeAuthPayload(req.body);

  if (!username || !email || !password) {
    res.status(400).json({ ok: false, error: 'username, email and password are required' });
    return;
  }

  if (repo.findUserByUsername(username)) {
    res.status(409).json({ ok: false, error: 'Username already exists' });
    return;
  }
  if (repo.findUserByEmail(email)) {
    res.status(409).json({ ok: false, error: 'Email already exists' });
    return;
  }

  try {
    const created = repo.createUser({
      username,
      email,
      passwordHash: hashPassword(password),
    });
    req.session.userId = created.id;

    res.status(201).json({
      ok: true,
      user: {
        id: created.id,
        username: created.username,
        email: created.email,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to register user' });
  }
});

app.post('/auth/login', (req, res) => {
  const { login, password } = normalizeAuthPayload(req.body);

  if (!login || !password) {
    res.status(400).json({ ok: false, error: 'login and password are required' });
    return;
  }

  const user = repo.findUserByLogin(login);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ ok: false, error: 'Invalid credentials' });
    return;
  }

  req.session.userId = user.id;
  repo.updateLoginInfo(user.id, req.ip || '');

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const user = repo.findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
    });
    return;
  }

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      activated: user.activated,
      banned: user.banned,
    },
  });
});

app.post('/gamestates/gamesave', (req, res) => {
  try {
    const userId = req.session.userId || 0;
    const saved = repo.saveGame(req.body ?? {}, userId);
    res.type('text/plain').send(
      ` Saved (user=${saved.userId}, win=${saved.win}, gameLength=${saved.gameLength})`,
    );
  } catch (error) {
    res.status(500).type('text/plain').send(' Failed to save game');
  }
});

app.get('/api/ladder', (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ ok: true, ladder: repo.getLadder(limit) });
});

app.get('/api/fastest-wins', (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ ok: true, fastestWins: repo.getFastestWins(limit) });
});

app.get('/api/users/:id/stats', (req, res) => {
  const stats = repo.getUserStatsById(req.params.id);
  if (!stats) {
    res.status(404).json({ ok: false, error: 'User stats not found' });
    return;
  }
  res.json({ ok: true, ...stats });
});

app.get('/api/users/by-username/:username/stats', (req, res) => {
  const stats = repo.getUserStatsByUsername(req.params.username);
  if (!stats) {
    res.status(404).json({ ok: false, error: 'User stats not found' });
    return;
  }
  res.json({ ok: true, ...stats });
});

// The game itself is the Vite build in dist/ (npm run build).
app.use(express.static(distDir, { extensions: ['html'] }));

app.get('/', (_req, res) => {
  res.status(503).type('text/plain').send('Run "npm run build" first, or use "npm run dev" for development.');
});

app.listen(PORT, () => {
  console.log(`EOTW 3D backend running on http://localhost:${PORT}`);
});
