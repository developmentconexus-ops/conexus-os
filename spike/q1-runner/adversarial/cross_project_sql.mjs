// A handler running as Project A tries to reach Project B's data via SQL.
export default async function (input, ctx) {
  const attempts = [];
  for (const sql of [
    'select count(*) from p_b_preview.follow_up_note',
    'set search_path to p_b_preview',
    'set role p_b_runtime',
    'set role p_b_migrator',
  ]) {
    try { await ctx.db.query(sql); attempts.push({ sql, ok: true }); }
    catch (e) { attempts.push({ sql, ok: false, err: e.code || e.message.slice(0, 60) }); }
  }
  // if search_path was actually changed we could now read B's table unqualified
  let readB = false;
  try { const r = await ctx.db.query('select count(*) from follow_up_note'); readB = false; void r; } catch { /* own table gone means search_path moved */ }
  const breach = attempts.some((a) => a.ok && a.sql.startsWith('select')) || attempts.some((a) => a.ok && a.sql.startsWith('set role'));
  return { BREACH: breach, attempts, readB };
}
