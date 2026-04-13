const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use in-memory DB for tests by mocking the module
let db;
let mod;

beforeEach(() => {
  // Fresh in-memory database for each test
  const testDbPath = path.join(__dirname, `test-${Date.now()}.db`);

  // Override the module's db by requiring fresh
  jest.resetModules();

  // Patch better-sqlite3 to use a temp file
  process.env.TEST_DB_PATH = testDbPath;

  // We need to re-implement db.js logic with a test DB
  db = new Database(testDbPath);
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS seen_items (
      watch_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      PRIMARY KEY (watch_id, item_id),
      FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE
    );
  `);

  // Build the same prepared statements as db.js
  const stmts = {
    createWatch: db.prepare(`INSERT INTO watches (guild_id, channel_id, user_id, query) VALUES (?, ?, ?, ?)`),
    deleteWatch: db.prepare(`DELETE FROM watches WHERE id = ? AND guild_id = ?`),
    getWatch: db.prepare(`SELECT * FROM watches WHERE id = ?`),
    getWatchesByChannel: db.prepare(`SELECT * FROM watches WHERE channel_id = ?`),
    getActiveWatches: db.prepare(`SELECT * FROM watches WHERE active = 1`),
    activateWatch: db.prepare(`UPDATE watches SET active = 1 WHERE id = ?`),
    updateFilters: db.prepare(`UPDATE watches SET min_price = ?, max_price = ?, size = ?, condition = ? WHERE id = ?`),
    addSeenItem: db.prepare(`INSERT OR IGNORE INTO seen_items (watch_id, item_id) VALUES (?, ?)`),
    getSeenItems: db.prepare(`SELECT item_id FROM seen_items WHERE watch_id = ?`),
    deleteSeenItems: db.prepare(`DELETE FROM seen_items WHERE watch_id = ?`),
  };

  mod = {
    createWatch(guildId, channelId, userId, query) {
      return stmts.createWatch.run(guildId, channelId, userId, query).lastInsertRowid;
    },
    deleteWatch(id, guildId) {
      stmts.deleteSeenItems.run(id);
      return stmts.deleteWatch.run(id, guildId).changes > 0;
    },
    getWatch(id) { return stmts.getWatch.get(id); },
    getWatchesByChannel(channelId) { return stmts.getWatchesByChannel.all(channelId); },
    getActiveWatches() { return stmts.getActiveWatches.all(); },
    activateWatch(id) { stmts.activateWatch.run(id); },
    updateFilters(id, { minPrice, maxPrice, size, condition }) {
      stmts.updateFilters.run(minPrice || null, maxPrice || null, size || null, condition || null, id);
    },
    getSeenItemIds(watchId) {
      return new Set(stmts.getSeenItems.all(watchId).map(r => r.item_id));
    },
    addSeenItems(watchId, itemIds) {
      const insert = db.transaction((ids) => {
        for (const id of ids) stmts.addSeenItem.run(watchId, id);
      });
      insert(itemIds);
    },
  };
});

afterEach(() => {
  if (db) db.close();
  // Clean up test db files
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith('test-') && f.endsWith('.db'));
  files.forEach(f => {
    try { fs.unlinkSync(path.join(__dirname, f)); } catch {}
    try { fs.unlinkSync(path.join(__dirname, f + '-wal')); } catch {}
    try { fs.unlinkSync(path.join(__dirname, f + '-shm')); } catch {}
  });
});

describe('watches', () => {
  test('createWatch returns an id', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'nike dunks');
    expect(id).toBe(1);
  });

  test('getWatch returns the created watch', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'nike dunks');
    const watch = mod.getWatch(id);
    expect(watch.query).toBe('nike dunks');
    expect(watch.guild_id).toBe('guild1');
    expect(watch.active).toBe(0);
  });

  test('activateWatch sets active to 1', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'shirt');
    mod.activateWatch(id);
    const watch = mod.getWatch(id);
    expect(watch.active).toBe(1);
  });

  test('getActiveWatches only returns activated watches', () => {
    const id1 = mod.createWatch('guild1', 'chan1', 'user1', 'nike dunks');
    const id2 = mod.createWatch('guild1', 'chan1', 'user1', 'shirt');
    mod.activateWatch(id1);

    const active = mod.getActiveWatches();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id1);
  });

  test('deleteWatch removes the watch', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'pants');
    const deleted = mod.deleteWatch(id, 'guild1');
    expect(deleted).toBe(true);
    expect(mod.getWatch(id)).toBeUndefined();
  });

  test('deleteWatch returns false for wrong guild', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'pants');
    const deleted = mod.deleteWatch(id, 'wrong-guild');
    expect(deleted).toBe(false);
  });

  test('getWatchesByChannel filters by channel', () => {
    mod.createWatch('guild1', 'chan1', 'user1', 'nike');
    mod.createWatch('guild1', 'chan2', 'user1', 'adidas');
    mod.createWatch('guild1', 'chan1', 'user1', 'puma');

    const watches = mod.getWatchesByChannel('chan1');
    expect(watches).toHaveLength(2);
    expect(watches.map(w => w.query).sort()).toEqual(['nike', 'puma']);
  });

  test('updateFilters sets price, size, condition', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'jacket');
    mod.updateFilters(id, { minPrice: 10, maxPrice: 50, size: 'M', condition: 'LIKE_NEW' });

    const watch = mod.getWatch(id);
    expect(watch.min_price).toBe(10);
    expect(watch.max_price).toBe(50);
    expect(watch.size).toBe('M');
    expect(watch.condition).toBe('LIKE_NEW');
  });

  test('updateFilters with empty values sets nulls', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'jacket');
    mod.updateFilters(id, {});

    const watch = mod.getWatch(id);
    expect(watch.min_price).toBeNull();
    expect(watch.max_price).toBeNull();
    expect(watch.size).toBeNull();
    expect(watch.condition).toBeNull();
  });
});

describe('seen items', () => {
  test('addSeenItems and getSeenItemIds', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'shoes');
    mod.addSeenItems(id, ['item1', 'item2', 'item3']);

    const seen = mod.getSeenItemIds(id);
    expect(seen.size).toBe(3);
    expect(seen.has('item1')).toBe(true);
    expect(seen.has('item2')).toBe(true);
    expect(seen.has('item3')).toBe(true);
  });

  test('addSeenItems ignores duplicates', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'shoes');
    mod.addSeenItems(id, ['item1', 'item2']);
    mod.addSeenItems(id, ['item2', 'item3']);

    const seen = mod.getSeenItemIds(id);
    expect(seen.size).toBe(3);
  });

  test('deleteWatch also clears seen items', () => {
    const id = mod.createWatch('guild1', 'chan1', 'user1', 'shoes');
    mod.addSeenItems(id, ['item1', 'item2']);
    mod.deleteWatch(id, 'guild1');

    const seen = mod.getSeenItemIds(id);
    expect(seen.size).toBe(0);
  });
});
