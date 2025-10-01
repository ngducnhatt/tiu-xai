import Database from 'better-sqlite3';
import { CFG } from './config.js';

export const db = new Database(CFG.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 3000');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  discord_id TEXT PRIMARY KEY,
  username   TEXT,
  balance_u  INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  username   TEXT,
  choice     TEXT NOT NULL,      -- chan | le | 0
  amount_u   INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  last_digit INTEGER NOT NULL,   -- result = (d2+d1)%10
  result     TEXT NOT NULL,      -- WIN | LOSE
  payout_u   INTEGER NOT NULL,
  net_change_u INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  username   TEXT,
  type       TEXT NOT NULL,      -- deposit | withdraw
  method     TEXT NOT NULL,      -- USDT | VND_QR | BANK | ADMIN
  amount_u   INTEGER NOT NULL DEFAULT 0,
  amount_vnd INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL,      -- PENDING | HOLD| APPROVED | REJECTED
  destination TEXT,
  reference   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_id ON players(discord_id);
CREATE INDEX IF NOT EXISTS idx_bets_user_time ON bets(discord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(discord_id, created_at DESC);
`);

export const q = {
  getPlayer: db.prepare(`SELECT discord_id, username, balance_u FROM players WHERE discord_id=?`),
  upsertPlayer: db.prepare(`
    INSERT INTO players (discord_id, username, balance_u)
    VALUES (@discord_id,@username,@balance_u)
    ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, updated_at=CURRENT_TIMESTAMP
  `),
  updateBalU: db.prepare(`UPDATE players SET balance_u = balance_u + @delta_u, updated_at=CURRENT_TIMESTAMP WHERE discord_id=@discord_id`),
  insertBet: db.prepare(`INSERT INTO bets (discord_id,username,choice,amount_u,message_id,last_digit,result,payout_u,net_change_u)
                         VALUES (@discord_id,@username,@choice,@amount_u,@message_id,@last_digit,@result,@payout_u,@net_change_u)`),
  insertTx: db.prepare(`INSERT INTO transactions (discord_id,username,type,method,amount_u,amount_vnd,status,destination,reference)
                        VALUES (@discord_id,@username,@type,@method,@amount_u,@amount_vnd,@status,@destination,@reference)`),
  recentTx: db.prepare(`SELECT id,type,method,amount_u,amount_vnd,status,created_at FROM transactions WHERE discord_id=? ORDER BY id DESC LIMIT 5`)
};

export const settings = {
  get: db.prepare(`SELECT value FROM settings WHERE key=?`),
  upsert: db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
};
export const getBool = (key, def = true) => {
  const r = settings.get.get(key)?.value;
  if (r === undefined || r === null) return def;
  return r === '1' || r === 'true';
};
export const setBool = (key, v) => settings.upsert.run(key, v ? '1' : '0');
export const qtx = {
  getByRef: db.prepare(`SELECT * FROM transactions WHERE reference=?`),
  setStatusByRef: db.prepare(`
    UPDATE transactions
    SET status=@status, destination=COALESCE(@destination, destination)
    WHERE reference=@reference
  `),
};

