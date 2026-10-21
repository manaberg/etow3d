import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCORE_FIELDS = [
  'killcount',
  'bosscount',
  'shamancount',
  'knightcount',
  'orccount',
  'redpotcount',
  'bluepotcount',
  'scrollcount',
  'magic_missile',
  'fireball',
  'chain_lightning',
  'iron_shot',
  'blizzard',
  'blink',
  'haste',
  'timestop',
  'shield',
  'lifesteal',
  'mirror_image',
  'fear',
  'invis',
  'chain_root',
  'telekinesis',
  'pwkill',
];

const POST_TO_SCORE_FIELD = {
  killcount: 'killcount',
  bosscount: 'bosscount',
  shamancount: 'shamancount',
  knightcount: 'knightcount',
  orccount: 'orccount',
  redpotcount: 'redpotcount',
  bluepotcount: 'bluepotcount',
  scrollcount: 'scrollcount',
  micount: 'magic_missile',
  fbcount: 'fireball',
  lgcount: 'chain_lightning',
  iscount: 'iron_shot',
  bzcount: 'blizzard',
  bkcount: 'blink',
  hscount: 'haste',
  tscount: 'timestop',
  shcount: 'shield',
  lscount: 'lifesteal',
  imcount: 'mirror_image',
  fecount: 'fear',
  incount: 'invis',
  crcount: 'chain_root',
  tlcount: 'telekinesis',
  pwkcount: 'pwkill',
};

function clampInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.trunc(number));
}

function clampFloat(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, number);
}

function timestamp() {
  return new Date().toISOString();
}

function normalizeGamePayload(payload = {}) {
  const normalized = {
    win: clampInt(payload.wincount),
    game_length: clampFloat(payload.timeplayed),
  };

  for (const field of SCORE_FIELDS) {
    normalized[field] = 0;
  }

  for (const [postKey, scoreField] of Object.entries(POST_TO_SCORE_FIELD)) {
    normalized[scoreField] = clampInt(payload[postKey]);
  }

  return normalized;
}

export function createRepository(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const db = new DatabaseSync(dbFilePath);
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      activated INTEGER NOT NULL DEFAULT 1,
      banned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      last_login_ip TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      killcount_total INTEGER NOT NULL DEFAULT 0,
      bosscount_total INTEGER NOT NULL DEFAULT 0,
      shamancount_total INTEGER NOT NULL DEFAULT 0,
      knightcount_total INTEGER NOT NULL DEFAULT 0,
      orccount_total INTEGER NOT NULL DEFAULT 0,
      redpotcount_total INTEGER NOT NULL DEFAULT 0,
      bluepotcount_total INTEGER NOT NULL DEFAULT 0,
      scrollcount_total INTEGER NOT NULL DEFAULT 0,
      magic_missile_total INTEGER NOT NULL DEFAULT 0,
      fireball_total INTEGER NOT NULL DEFAULT 0,
      chain_lightning_total INTEGER NOT NULL DEFAULT 0,
      iron_shot_total INTEGER NOT NULL DEFAULT 0,
      blizzard_total INTEGER NOT NULL DEFAULT 0,
      blink_total INTEGER NOT NULL DEFAULT 0,
      haste_total INTEGER NOT NULL DEFAULT 0,
      timestop_total INTEGER NOT NULL DEFAULT 0,
      shield_total INTEGER NOT NULL DEFAULT 0,
      lifesteal_total INTEGER NOT NULL DEFAULT 0,
      mirror_image_total INTEGER NOT NULL DEFAULT 0,
      fear_total INTEGER NOT NULL DEFAULT 0,
      invis_total INTEGER NOT NULL DEFAULT 0,
      chain_root_total INTEGER NOT NULL DEFAULT 0,
      telekinesis_total INTEGER NOT NULL DEFAULT 0,
      pwkill_total INTEGER NOT NULL DEFAULT 0,
      wins_total INTEGER NOT NULL DEFAULT 0,
      killcount_max INTEGER NOT NULL DEFAULT 0,
      bosscount_max INTEGER NOT NULL DEFAULT 0,
      shamancount_max INTEGER NOT NULL DEFAULT 0,
      knightcount_max INTEGER NOT NULL DEFAULT 0,
      orccount_max INTEGER NOT NULL DEFAULT 0,
      redpotcount_max INTEGER NOT NULL DEFAULT 0,
      bluepotcount_max INTEGER NOT NULL DEFAULT 0,
      scrollcount_max INTEGER NOT NULL DEFAULT 0,
      magic_missile_max INTEGER NOT NULL DEFAULT 0,
      fireball_max INTEGER NOT NULL DEFAULT 0,
      chain_lightning_max INTEGER NOT NULL DEFAULT 0,
      iron_shot_max INTEGER NOT NULL DEFAULT 0,
      blizzard_max INTEGER NOT NULL DEFAULT 0,
      blink_max INTEGER NOT NULL DEFAULT 0,
      haste_max INTEGER NOT NULL DEFAULT 0,
      timestop_max INTEGER NOT NULL DEFAULT 0,
      shield_max INTEGER NOT NULL DEFAULT 0,
      lifesteal_max INTEGER NOT NULL DEFAULT 0,
      mirror_image_max INTEGER NOT NULL DEFAULT 0,
      fear_max INTEGER NOT NULL DEFAULT 0,
      invis_max INTEGER NOT NULL DEFAULT 0,
      chain_root_max INTEGER NOT NULL DEFAULT 0,
      telekinesis_max INTEGER NOT NULL DEFAULT 0,
      pwkill_max INTEGER NOT NULL DEFAULT 0,
      longest_game REAL NOT NULL DEFAULT 0,
      total_game_time REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      killcount INTEGER NOT NULL DEFAULT 0,
      bosscount INTEGER NOT NULL DEFAULT 0,
      shamancount INTEGER NOT NULL DEFAULT 0,
      knightcount INTEGER NOT NULL DEFAULT 0,
      orccount INTEGER NOT NULL DEFAULT 0,
      redpotcount INTEGER NOT NULL DEFAULT 0,
      bluepotcount INTEGER NOT NULL DEFAULT 0,
      scrollcount INTEGER NOT NULL DEFAULT 0,
      magic_missile INTEGER NOT NULL DEFAULT 0,
      fireball INTEGER NOT NULL DEFAULT 0,
      chain_lightning INTEGER NOT NULL DEFAULT 0,
      iron_shot INTEGER NOT NULL DEFAULT 0,
      blizzard INTEGER NOT NULL DEFAULT 0,
      blink INTEGER NOT NULL DEFAULT 0,
      haste INTEGER NOT NULL DEFAULT 0,
      timestop INTEGER NOT NULL DEFAULT 0,
      shield INTEGER NOT NULL DEFAULT 0,
      lifesteal INTEGER NOT NULL DEFAULT 0,
      mirror_image INTEGER NOT NULL DEFAULT 0,
      fear INTEGER NOT NULL DEFAULT 0,
      invis INTEGER NOT NULL DEFAULT 0,
      chain_root INTEGER NOT NULL DEFAULT 0,
      telekinesis INTEGER NOT NULL DEFAULT 0,
      pwkill INTEGER NOT NULL DEFAULT 0,
      win INTEGER NOT NULL DEFAULT 0,
      game_length REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const statements = {
    createUser: db.prepare(`
      INSERT INTO users (
        username, email, password_hash, activated, banned,
        created_at, updated_at
      ) VALUES (?, ?, ?, 1, 0, ?, ?)
    `),
    findUserById: db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`),
    findUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ? LIMIT 1`),
    findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`),
    findUserByLogin: db.prepare(`
      SELECT * FROM users
      WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
      LIMIT 1
    `),
    updateLoginInfo: db.prepare(`
      UPDATE users
      SET last_login_at = ?, last_login_ip = ?, updated_at = ?
      WHERE id = ?
    `),
    getUserScore: db.prepare(`SELECT * FROM user_scores WHERE user_id = ? LIMIT 1`),
    getUserScoresById: db.prepare(`
      SELECT us.*, COALESCE(u.username, 'ANON') AS username
      FROM user_scores us
      LEFT JOIN users u ON u.id = us.user_id
      WHERE us.user_id = ?
      LIMIT 1
    `),
    getUserHistoryById: db.prepare(`
      SELECT gh.*, COALESCE(u.username, 'ANON') AS username
      FROM game_history gh
      LEFT JOIN users u ON u.id = gh.user_id
      WHERE gh.user_id = ?
      ORDER BY gh.id DESC
      LIMIT ?
    `),
    getLadder: db.prepare(`
      SELECT
        us.user_id,
        us.wins_total,
        us.killcount_max,
        us.killcount_total,
        us.total_game_time,
        COALESCE(u.username, 'ANON') AS username
      FROM user_scores us
      LEFT JOIN users u ON u.id = us.user_id
      WHERE us.killcount_max > 0
      ORDER BY us.wins_total DESC, us.killcount_max DESC
      LIMIT ?
    `),
    getFastestWins: db.prepare(`
      SELECT
        gh.user_id,
        gh.game_length,
        COALESCE(u.username, 'ANON') AS username
      FROM game_history gh
      LEFT JOIN users u ON u.id = gh.user_id
      WHERE gh.win = 1 AND gh.game_length > 0
      ORDER BY gh.game_length ASC
      LIMIT ?
    `),
  };

  function createUser({ username, email, passwordHash }) {
    const now = timestamp();
    statements.createUser.run(username.trim(), email.trim(), passwordHash, now, now);
    const created = statements.findUserByLogin.get(username.trim(), username.trim());
    return created;
  }

  function findUserById(id) {
    if (!id) {
      return null;
    }
    return statements.findUserById.get(id) ?? null;
  }

  function findUserByUsername(username) {
    if (!username) {
      return null;
    }
    return statements.findUserByUsername.get(username.trim()) ?? null;
  }

  function findUserByEmail(email) {
    if (!email) {
      return null;
    }
    return statements.findUserByEmail.get(email.trim()) ?? null;
  }

  function findUserByLogin(login) {
    const candidate = String(login || '').trim();
    if (!candidate) {
      return null;
    }
    return statements.findUserByLogin.get(candidate, candidate) ?? null;
  }

  function updateLoginInfo(userId, ipAddress = '') {
    const now = timestamp();
    statements.updateLoginInfo.run(now, ipAddress || '', now, userId);
  }

  function buildScoreValuesForInsert(userId, game, now) {
    const values = [userId];
    for (const field of SCORE_FIELDS) {
      values.push(game[field]);
    }
    for (const field of SCORE_FIELDS) {
      values.push(game[field]);
    }
    values.push(game.win);
    values.push(game.game_length);
    values.push(now, now);
    return values;
  }

  function ensureUserScoreRow(userId, game, now) {
    const columns = [
      'user_id',
      ...SCORE_FIELDS.map((field) => `${field}_total`),
      ...SCORE_FIELDS.map((field) => `${field}_max`),
      'wins_total',
      'total_game_time',
      'created_at',
      'updated_at',
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO user_scores (${columns.join(', ')}) VALUES (${placeholders})`;
    db.prepare(sql).run(...buildScoreValuesForInsert(userId, game, now));
  }

  function updateUserScoreRow(existing, game, now) {
    const assignments = [];
    const values = [];

    for (const field of SCORE_FIELDS) {
      const totalColumn = `${field}_total`;
      const maxColumn = `${field}_max`;
      const newTotal = clampInt(existing[totalColumn]) + game[field];
      const newMax = Math.max(clampInt(existing[maxColumn]), game[field]);
      assignments.push(`${totalColumn} = ?`, `${maxColumn} = ?`);
      values.push(newTotal, newMax);
    }

    const winsTotal = clampInt(existing.wins_total) + game.win;
    const totalGameTime = clampFloat(existing.total_game_time) + game.game_length;

    // Legacy behavior: longest_game actually stores the fastest winning run.
    let longestGame = clampFloat(existing.longest_game);
    if (game.win > 0) {
      if (longestGame > 0) {
        longestGame = Math.min(longestGame, game.game_length);
      } else {
        longestGame = game.game_length;
      }
    }

    assignments.push('wins_total = ?', 'longest_game = ?', 'total_game_time = ?', 'updated_at = ?');
    values.push(winsTotal, longestGame, totalGameTime, now, existing.user_id);

    const sql = `UPDATE user_scores SET ${assignments.join(', ')} WHERE user_id = ?`;
    db.prepare(sql).run(...values);
  }

  function saveGame(rawPayload, rawUserId) {
    const userId = clampInt(rawUserId);
    const game = normalizeGamePayload(rawPayload);
    const now = timestamp();

    db.exec('BEGIN');
    try {
      const historySql = `
        INSERT INTO game_history (
          user_id,
          killcount, bosscount, shamancount, knightcount, orccount,
          redpotcount, bluepotcount, scrollcount,
          magic_missile, fireball, chain_lightning, iron_shot,
          blizzard, blink, haste, timestop, shield,
          lifesteal, mirror_image, fear, invis, chain_root,
          telekinesis, pwkill,
          win, game_length, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?
        )
      `;

      db.prepare(historySql).run(
        userId,
        game.killcount,
        game.bosscount,
        game.shamancount,
        game.knightcount,
        game.orccount,
        game.redpotcount,
        game.bluepotcount,
        game.scrollcount,
        game.magic_missile,
        game.fireball,
        game.chain_lightning,
        game.iron_shot,
        game.blizzard,
        game.blink,
        game.haste,
        game.timestop,
        game.shield,
        game.lifesteal,
        game.mirror_image,
        game.fear,
        game.invis,
        game.chain_root,
        game.telekinesis,
        game.pwkill,
        game.win,
        game.game_length,
        now,
      );

      const existingScore = statements.getUserScore.get(userId);
      if (!existingScore) {
        ensureUserScoreRow(userId, game, now);
      } else {
        updateUserScoreRow(existingScore, game, now);
      }

      db.exec('COMMIT');
      return {
        userId,
        win: game.win,
        gameLength: game.game_length,
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function getLadder(limit = 20) {
    return statements.getLadder.all(clampInt(limit) || 20);
  }

  function getFastestWins(limit = 20) {
    return statements.getFastestWins.all(clampInt(limit) || 20);
  }

  function getUserStatsById(userId) {
    const score = statements.getUserScoresById.get(clampInt(userId));
    if (!score) {
      return null;
    }

    const history = statements.getUserHistoryById.all(clampInt(userId), 200);
    return {
      score,
      history,
    };
  }

  function getUserStatsByUsername(username) {
    const user = findUserByUsername(username);
    if (!user) {
      return null;
    }

    const stats = getUserStatsById(user.id);
    if (!stats) {
      return {
        user,
        score: null,
        history: [],
      };
    }

    return {
      user,
      score: stats.score,
      history: stats.history,
    };
  }

  return {
    db,
    createUser,
    findUserById,
    findUserByEmail,
    findUserByUsername,
    findUserByLogin,
    updateLoginInfo,
    saveGame,
    getLadder,
    getFastestWins,
    getUserStatsById,
    getUserStatsByUsername,
  };
}
