type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

const VALID_STATUSES = ['Em aberto', 'Aguardando o fornecedor', 'Resolvida'] as const
type NoteStatus = (typeof VALID_STATUSES)[number]

function normalizeStatus(status?: string): NoteStatus {
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    return status as NoteStatus
  }
  return 'Em aberto'
}

export async function listNotes(
  input: { orderNumber: string },
  { db }: { db: Db },
) {
  const orderNumber = (input.orderNumber || '').trim()
  if (!orderNumber) {
    const { rows } = await db.query(
      `SELECT id, order_number AS "orderNumber", note, author, COALESCE(status, 'Em aberto') AS "status", created_at AS "createdAt"
       FROM purchase_order_note
       ORDER BY id DESC
       LIMIT 500`,
    )
    return rows
  }

  const { rows } = await db.query(
    `SELECT id, order_number AS "orderNumber", note, author, COALESCE(status, 'Em aberto') AS "status", created_at AS "createdAt"
     FROM purchase_order_note
     WHERE order_number = $1
     ORDER BY id DESC
     LIMIT 500`,
    [orderNumber],
  )
  return rows
}

export async function addNote(
  input: { orderNumber: string; note: string; author: string; status?: string },
  { db }: { db: Db },
) {
  const orderNumber = input.orderNumber.trim()
  const note = input.note.trim()
  const author = (input.author || '').trim()
  const status = normalizeStatus(input.status)

  // Garante que o pedido exista para manter a consistência com purchase_order
  await db.query(
    `INSERT INTO purchase_order (order_number, assignee)
     VALUES ($1, '')
     ON CONFLICT (order_number) DO NOTHING`,
    [orderNumber],
  )

  const { rows } = await db.query(
    `INSERT INTO purchase_order_note (order_number, note, author, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, order_number AS "orderNumber", note, author, status, created_at AS "createdAt"`,
    [orderNumber, note, author, status],
  )
  return rows[0]
}

export async function updateNoteStatus(
  input: { id: number; status: string },
  { db }: { db: Db },
) {
  const status = normalizeStatus(input.status)
  const { rows } = await db.query(
    `UPDATE purchase_order_note
     SET status = $1
     WHERE id = $2
     RETURNING id, order_number AS "orderNumber", note, author, status, created_at AS "createdAt"`,
    [status, input.id],
  )

  if (rows.length === 0) {
    throw new Error('Nota não encontrada.')
  }

  return rows[0]
}
