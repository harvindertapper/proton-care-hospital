
let activeDb = null;
export function setActiveDb(db) {
  activeDb = db;
}

export async function query(sql, ...binds) {
  if (binds.length === 1 && Array.isArray(binds[0])) binds = binds[0];
  const results = activeDb.prepare(sql).all(...binds);
  return { results };
}

export async function run(sql, ...binds) {
  if (binds.length === 1 && Array.isArray(binds[0])) binds = binds[0];
  const stmt = activeDb.prepare(sql);
  const info = stmt.run(...binds);
  return {
    success: true,
    meta: {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    }
  };
}
