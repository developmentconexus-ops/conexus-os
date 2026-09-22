// Legitimate Project A handler. Only ctx.db.query is available.
export default async function notes(input, ctx) {
  if (input.op === 'insert') {
    const r = await ctx.db.query(
      'insert into follow_up_note(purchase_order_id, note) values ($1,$2) returning id, created_at',
      [String(input.purchaseOrderId), String(input.note)],
    );
    return { id: r.rows[0].id, createdAt: r.rows[0].created_at };
  }
  const r = await ctx.db.query('select id, purchase_order_id, note, created_at from follow_up_note order by id');
  return { notes: r.rows };
}
