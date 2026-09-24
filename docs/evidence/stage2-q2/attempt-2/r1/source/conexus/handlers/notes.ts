type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listNotes(
  input: { orderNumber: string },
  { db }: { db: Db },
) {
  const orderNumber = (input.orderNumber || '').trim()
  if (!orderNumber) {
    const { rows } = await db.query(
      `SELECT id, order_number AS "orderNumber", note, author, created_at AS "createdAt"
       FROM purchase_order_note
       ORDER BY id DESC
       LIMIT 500`,
    )
    return rows
  }

  const { rows } = await db.query(
    `SELECT id, order_number AS "orderNumber", note, author, created_at AS "createdAt"
     FROM purchase_order_note
     WHERE order_number = $1
     ORDER BY id DESC
     LIMIT 500`,
    [orderNumber],
  )
  return rows
}

export async function addNote(
  input: { orderNumber: string; note: string; author: string },
  { db }: { db: Db },
) {
  const orderNumber = input.orderNumber.trim()
  const note = input.note.trim()
  const author = (input.author || '').trim()

  const { rows } = await db.query(
    `INSERT INTO purchase_order_note (order_number, note, author)
     VALUES ($1, $2, $3)
     RETURNING id, order_number AS "orderNumber", note, author, created_at AS "createdAt"`,
    [orderNumber, note, author],
  )
  return rows[0]
}
