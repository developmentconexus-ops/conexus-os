// Try to reach the Hub stand-in database and read its secret table.
export default async function (input, ctx) {
  // 1. same connection cannot switch database; try dblink if the extension exists
  const via = [];
  try { await ctx.db.query("select * from dblink('dbname=hub','select v from hub_secret') as t(v text)"); via.push({ m: 'dblink', ok: true }); }
  catch (e) { via.push({ m: 'dblink', ok: false, err: e.code || e.message.slice(0, 50) }); }
  // 2. open a fresh connection to hub as this project role
  let freshConn = null;
  try {
    const pg = (await import('pg')).default;
    const c = new pg.Client({ host: process.env.PGHOST, port: process.env.PGPORT, user: process.env.PGUSER, password: process.env.PGPASSWORD, database: 'hub' });
    await c.connect();
    const r = await c.query('select count(*) from hub_secret');
    await c.end();
    freshConn = { ok: true, rows: r.rowCount };
  } catch (e) { freshConn = { ok: false, err: e.code || e.message.slice(0, 60) }; }
  const breach = via.some((v) => v.ok) || (freshConn && freshConn.ok);
  return { BREACH: !!breach, via, freshConn };
}
