type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }

export async function listPurchaseOrders(
  input: { query?: string; status?: string; assignee?: string },
  { db }: { db: Db },
) {
  const conditions: string[] = []
  const values: unknown[] = []

  const rawStatus = (input.status || '').trim()
  // Se não foi informado ou está vazio, por padrão filtra notas 'Em aberto'
  const status = rawStatus || 'Em aberto'

  if (status === 'all' || status === 'Todos' || status === 'Todos os pedidos') {
    // Não restringe por status de nota
  } else if (status === 'Todas em aberto' || status === 'todas_abertas') {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM purchase_order_note n
        WHERE n.order_number = po.order_number
          AND n.status IN ('Em aberto', 'Aguardando o fornecedor')
      )`,
    )
  } else {
    values.push(status)
    conditions.push(
      `EXISTS (
        SELECT 1 FROM purchase_order_note n
        WHERE n.order_number = po.order_number
          AND n.status = $${values.length}
      )`,
    )
  }

  const assignee = (input.assignee || '').trim()
  if (assignee) {
    values.push(`%${assignee}%`)
    conditions.push(`po.assignee ILIKE $${values.length}`)
  }

  const q = (input.query || '').trim()
  if (q) {
    values.push(`%${q}%`)
    conditions.push(`(po.order_number ILIKE $${values.length} OR po.assignee ILIKE $${values.length})`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await db.query(
    `SELECT
      po.id,
      po.order_number AS "orderNumber",
      po.assignee,
      TO_CHAR(po.expected_delivery_date, 'YYYY-MM-DD') AS "expectedDeliveryDate",
      po.created_at AS "createdAt"
     FROM purchase_order po
     ${whereClause}
     ORDER BY po.expected_delivery_date ASC NULLS LAST, po.id ASC
     LIMIT 500`,
    values,
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
     VALUES ($1, $2, NULLIF($3, '')::date)
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
