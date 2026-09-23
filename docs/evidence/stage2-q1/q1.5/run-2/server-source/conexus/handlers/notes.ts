type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listNotes(input: { orderNumber: string }, { db }: { db: Db }) {
  const trimmed = input.orderNumber.trim()
  if (trimmed) {
    const { rows } = await db.query(
      'SELECT id, order_number AS "orderNumber", content, created_at AS "createdAt" FROM purchase_order_note WHERE order_number = $1 ORDER BY id DESC',
      [trimmed]
    )
    return rows
  }
  const { rows } = await db.query(
    'SELECT id, order_number AS "orderNumber", content, created_at AS "createdAt" FROM purchase_order_note ORDER BY id DESC'
  )
  return rows
}

export async function addNote(input: { orderNumber: string; content: string }, { db }: { db: Db }) {
  const orderNumber = input.orderNumber.trim()
  const content = input.content.trim()
  const { rows } = await db.query(
    'INSERT INTO purchase_order_note (order_number, content) VALUES ($1, $2) RETURNING id, order_number AS "orderNumber", content, created_at AS "createdAt"',
    [orderNumber, content]
  )
  return rows[0]
}
