const { getDb } = require('./index');

// All writes go through here. The app shares one SQLite connection, so this
// queue also makes sure two requests never have a transaction open at once.
let writeQueue = Promise.resolve();

function inTransaction(work) {
  const run = writeQueue.then(async () => {
    const db = await getDb();
    await db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(db);
      await db.exec('COMMIT');
      return result;
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  });
  writeQueue = run.catch(() => {});
  return run;
}

module.exports = { inTransaction };
