const session = require('express-session');
const { getDb } = require('./index');

class SQLiteSessionStore extends session.Store {
  async ensureTable() {
    const db = await getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      )
    `);
    return db;
  }

  get(sid, callback) {
    this.ensureTable()
      .then(async (db) => {
        const row = await db.get('SELECT sess, expires FROM sessions WHERE sid = ?', sid);
        if (!row || Number(row.expires) <= Date.now()) {
          if (row) {
            await db.run('DELETE FROM sessions WHERE sid = ?', sid);
          }
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.sess));
      })
      .catch(callback);
  }

  set(sid, sess, callback) {
    this.ensureTable()
      .then(async (db) => {
        const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
        await db.run(
          `
            INSERT INTO sessions (sid, sess, expires)
            VALUES (?, ?, ?)
            ON CONFLICT(sid) DO UPDATE SET
              sess = excluded.sess,
              expires = excluded.expires
          `,
          sid,
          JSON.stringify(sess),
          expires
        );
        await db.run('DELETE FROM sessions WHERE expires <= ?', Date.now());
        callback(null);
      })
      .catch(callback);
  }

  destroy(sid, callback) {
    this.ensureTable()
      .then(async (db) => {
        await db.run('DELETE FROM sessions WHERE sid = ?', sid);
        callback(null);
      })
      .catch(callback);
  }

  touch(sid, sess, callback) {
    this.set(sid, sess, callback);
  }
}

module.exports = SQLiteSessionStore;
