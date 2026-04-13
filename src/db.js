const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'depopbot.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    min_price REAL,
    max_price REAL,
    size TEXT,
    condition TEXT,
    active INTEGER DEFAULT 0,
    seeded INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seen_items (
    watch_id INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (watch_id, item_id),
    FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
  );
`);

// Migrations
try { db.exec(`ALTER TABLE watches ADD COLUMN seeded INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE watches ADD COLUMN category TEXT`); } catch {}
try { db.exec(`ALTER TABLE watches ADD COLUMN message_id TEXT`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    notify_channel_id TEXT
  );
`);


const stmts = {
  createWatch: db.prepare(`
    INSERT INTO watches (guild_id, channel_id, user_id, query)
    VALUES (?, ?, ?, ?)
  `),
  deleteWatch: db.prepare(`DELETE FROM watches WHERE id = ? AND guild_id = ?`),
  getWatch: db.prepare(`SELECT * FROM watches WHERE id = ?`),
  getWatchesByChannel: db.prepare(`SELECT * FROM watches WHERE channel_id = ?`),
  getWatchesByGuild: db.prepare(`SELECT * FROM watches WHERE guild_id = ?`),
  getWatchesByUser: db.prepare(`SELECT * FROM watches WHERE guild_id = ? AND user_id = ?`),
  getActiveWatches: db.prepare(`SELECT * FROM watches WHERE active = 1`),
  activateWatch: db.prepare(`UPDATE watches SET active = 1 WHERE id = ?`),
  pauseWatch: db.prepare(`UPDATE watches SET active = 0 WHERE id = ?`),
  updateFilters: db.prepare(`
    UPDATE watches SET min_price = ?, max_price = ?, size = ?, condition = ?, category = ?
    WHERE id = ?
  `),
  addSeenItem: db.prepare(`
    INSERT OR IGNORE INTO seen_items (watch_id, item_id) VALUES (?, ?)
  `),
  getSeenItems: db.prepare(`SELECT item_id FROM seen_items WHERE watch_id = ?`),
  deleteSeenItems: db.prepare(`DELETE FROM seen_items WHERE watch_id = ?`),
  markSeeded: db.prepare(`UPDATE watches SET seeded = 1 WHERE id = ?`),
  setMessageId: db.prepare(`UPDATE watches SET message_id = ? WHERE id = ?`),
  setNotifyChannel: db.prepare(`INSERT OR REPLACE INTO settings (guild_id, notify_channel_id) VALUES (?, ?)`),
  getNotifyChannel: db.prepare(`SELECT notify_channel_id FROM settings WHERE guild_id = ?`),
};

module.exports = {
  db,
  createWatch(guildId, channelId, userId, query) {
    const result = stmts.createWatch.run(guildId, channelId, userId, query);
    return result.lastInsertRowid;
  },
  deleteWatch(id, guildId) {
    stmts.deleteSeenItems.run(id);
    return stmts.deleteWatch.run(id, guildId).changes > 0;
  },
  getWatch(id) {
    return stmts.getWatch.get(id);
  },
  getWatchesByChannel(channelId) {
    return stmts.getWatchesByChannel.all(channelId);
  },
  getWatchesByGuild(guildId) {
    return stmts.getWatchesByGuild.all(guildId);
  },
  getWatchesByUser(guildId, userId) {
    return stmts.getWatchesByUser.all(guildId, userId);
  },
  getActiveWatches() {
    return stmts.getActiveWatches.all();
  },
  activateWatch(id) {
    stmts.activateWatch.run(id);
  },
  pauseWatch(id) {
    stmts.pauseWatch.run(id);
  },
  updateFilters(id, { minPrice, maxPrice, size, condition, category }) {
    stmts.updateFilters.run(minPrice || null, maxPrice || null, size || null, condition || null, category || null, id);
  },
  getSeenItemIds(watchId) {
    return new Set(stmts.getSeenItems.all(watchId).map(r => r.item_id));
  },
  markSeeded(id) {
    stmts.markSeeded.run(id);
  },
  setMessageId(id, messageId) {
    stmts.setMessageId.run(messageId, id);
  },
  setNotifyChannel(guildId, channelId) {
    stmts.setNotifyChannel.run(guildId, channelId);
  },
  getNotifyChannel(guildId) {
    return stmts.getNotifyChannel.get(guildId)?.notify_channel_id || null;
  },
  addSeenItems(watchId, itemIds) {
    const insert = db.transaction((ids) => {
      for (const id of ids) {
        stmts.addSeenItem.run(watchId, id);
      }
    });
    insert(itemIds);
  },
};
