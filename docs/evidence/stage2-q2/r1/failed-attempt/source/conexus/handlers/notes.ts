type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listNotes(input: { orderNumber?: string }, { db }: { db: Db }) {
  if (input.orderNumber && input.orderNumber.trim()) {
    const { rows } = await db.query(
      `SELECT id, order_number AS "orderNumber", note, created_at AS "createdAt"
       FROM purchase_order_notes
       WHERE order_number = $1
       ORDER BY created_at DESC, id DESC`,
      [input.orderNumber.trim()],
    )
    return rows
  }

  const { rows } = await db.query(
    `SELECT id, order_number AS "orderNumber", note, created_at AS "createdAt"
     FROM purchase_order_notes
     ORDER BY created_at DESC, id DESC
     LIMIT 500`,
  )
  return rows
}

export async function addNote(input: { orderNumber: string; note: string }, { db }: { db: Db }) {
  const { rows } = await db.query(
    `INSERT INTO purchase_order_notes (order_number, note)
     VALUES ($1, $2)
     RETURNING id, order_number AS "orderNumber", note, created_at AS "createdAt"`,
    [input.orderNumber.trim(), input.note.trim()],
  )
  return rows[0]
}
