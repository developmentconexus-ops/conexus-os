type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listPurchaseOrders(
  input: { query?: string },
  { db }: { db: Db },
) {
  const q = (input.query || '').trim()
  if (!q) {
    const { rows } = await db.query(
      `SELECT
        id,
        order_number AS "orderNumber",
        assignee,
        TO_CHAR(expected_delivery_date, 'YYYY-MM-DD') AS "expectedDeliveryDate",
        created_at AS "createdAt"
       FROM purchase_order
       ORDER BY id DESC
       LIMIT 500`,
    )
    return rows.map((r) => ({
      ...r,
      expectedDeliveryDate: r.expectedDeliveryDate || '',
    }))
  }

  const { rows } = await db.query(
    `SELECT
      id,
      order_number AS "orderNumber",
      assignee,
      TO_CHAR(expected_delivery_date, 'YYYY-MM-DD') AS "expectedDeliveryDate",
      created_at AS "createdAt"
     FROM purchase_order
     WHERE order_number ILIKE $1 OR assignee ILIKE $1
     ORDER BY id DESC
     LIMIT 500`,
    [`%${q}%`],
  )
  return rows.map((r) => ({
    ...r,
    expectedDeliveryDate: r.expectedDeliveryDate || '',
  }))
}

export async function upsertPurchaseOrder(
  input: { orderNumber: string; assignee: string; expectedDeliveryDate: string },
  { db }: { db: Db },
) {
  const orderNumber = input.orderNumber.trim()
  const assignee = input.assignee.trim()
  const expectedDeliveryDate = input.expectedDeliveryDate.trim() || null

  const { rows } = await db.query(
    `INSERT INTO purchase_order (order_number, assignee, expected_delivery_date)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (order_number)
     DO UPDATE SET
       assignee = EXCLUDED.assignee,
       expected_delivery_date = EXCLUDED.expected_delivery_date
     RETURNING
       id,
       order_number AS "orderNumber",
       assignee,
       TO_CHAR(expected_delivery_date, 'YYYY-MM-DD') AS "expectedDeliveryDate",
       created_at AS "createdAt"`,
    [orderNumber, assignee, expectedDeliveryDate],
  )

  const row = rows[0]
  return {
    ...row,
    expectedDeliveryDate: row.expectedDeliveryDate || '',
  }
}
