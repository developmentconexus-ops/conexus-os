import { z } from 'zod'
import { AdapterFailure } from '../errors.js'
import { operationId } from '../model.js'
import type { Operation } from '../operation.js'
import type { LoadRecordsQuery, SankhyaRecord, SankhyaSession } from './gateway.js'

// UNVERIFIED until the first real read (task Q4.6): NUMNOTA with TIPMOV = 'O' as the key of a
// purchase order's document number, the STATUSNOTA values, the date and decimal formats and the
// metadata names of the referenced fields. This file holds the whole field mapping, so correcting
// it after Q4.6 touches nothing else.

const HEADER = Object.freeze({
  rootEntity: 'CabecalhoNota',
  fields: Object.freeze(['NUNOTA', 'NUMNOTA', 'DTNEG', 'STATUSNOTA', 'VLRNOTA']),
  references: Object.freeze([Object.freeze({ path: 'Parceiro', fields: Object.freeze(['NOMEPARC']) })]),
  expression: "this.NUMNOTA = ? AND this.TIPMOV = 'O'",
} as const)

const ITEMS = Object.freeze({
  rootEntity: 'ItemNota',
  fields: Object.freeze(['NUNOTA', 'SEQUENCIA', 'CODPROD', 'QTDNEG', 'CODVOL', 'VLRUNIT', 'VLRTOT']),
  references: Object.freeze([Object.freeze({ path: 'Produto', fields: Object.freeze(['DESCRPROD']) })]),
} as const)

export const MAX_ORDERS = 10
export const MAX_ITEMS = 200

const decimal = z.string().regex(/^-?\d{1,15}(\.\d{1,10})?$/)
const STATUS = ['pending', 'in-progress', 'confirmed', 'other'] as const

const purchaseOrderItem = z.object({
  sequence: z.number().int(),
  productCode: z.string().min(1),
  description: z.string().nullable(),
  quantity: decimal,
  unit: z.string().nullable(),
  unitPrice: decimal,
  total: decimal,
})

const purchaseOrder = z.object({
  number: z.number().int(),
  internalId: z.string().regex(/^\d{1,18}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  supplier: z.string().nullable(),
  status: z.enum(STATUS),
  total: decimal,
  items: z.array(purchaseOrderItem).max(MAX_ITEMS),
})

export const purchaseOrderReadInput = z.strictObject({ documentNumber: z.number().int().positive().max(2_147_483_647) })
export const purchaseOrderReadOutput = z.object({ orders: z.array(purchaseOrder).max(MAX_ORDERS) })

export type PurchaseOrderReadInput = z.infer<typeof purchaseOrderReadInput>
export type PurchaseOrderReadOutput = z.infer<typeof purchaseOrderReadOutput>

const statusOf = (value: string | null): typeof STATUS[number] => {
  switch (value) {
    case 'P': return 'pending'
    case 'A': return 'in-progress'
    case 'L': return 'confirmed'
    default: return 'other'
  }
}

// A decimal comma becomes a point; anything else is left for the output contract to refuse.
const decimalOf = (value: string | null): string => (value ?? '').trim().replace(',', '.')

// 'dd/mm/yyyy' or 'ddmmyyyy', either with an optional time; anything else is null.
const dateOf = (value: string | null): string | null => {
  const match = /^(\d{2})\/?(\d{2})\/?(\d{4})(?:\s.*)?$/.exec(value ?? '')
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

const integerOf = (value: string | null): number => (value !== null && /^\d{1,9}$/.test(value) ? Number(value) : Number.NaN)

const itemOf = (row: SankhyaRecord) => ({
  sequence: integerOf(row.SEQUENCIA ?? null),
  productCode: row.CODPROD ?? '',
  description: row.Produto_DESCRPROD ?? null,
  quantity: decimalOf(row.QTDNEG ?? null),
  unit: row.CODVOL ?? null,
  unitPrice: decimalOf(row.VLRUNIT ?? null),
  total: decimalOf(row.VLRTOT ?? null),
})

const itemsQuery = (internalIds: readonly string[]): LoadRecordsQuery => ({
  ...ITEMS,
  // The expression's shape depends only on how many headers came back, never on consumer text.
  expression: `this.NUNOTA IN (${internalIds.map(() => '?').join(', ')})`,
  parameters: internalIds.map((value) => ({ type: 'I', value })),
})

export const purchaseOrderRead: Operation<PurchaseOrderReadInput, PurchaseOrderReadOutput, SankhyaSession> = Object.freeze({
  id: operationId('sankhya.purchase-order.read'),
  effect: 'read',
  summary: 'Reads the purchase orders with one document number: number, date, supplier, status, total and items.',
  input: purchaseOrderReadInput,
  output: purchaseOrderReadOutput,
  async run(input: PurchaseOrderReadInput, session: SankhyaSession): Promise<PurchaseOrderReadOutput> {
    const headers = await session.loadRecords({ ...HEADER, parameters: [{ type: 'I', value: String(input.documentNumber) }] })
    if (headers.length === 0) return { orders: [] }
    if (headers.length > MAX_ORDERS) throw new AdapterFailure('RESPONSE_REFUSED')
    const internalIds = headers.map((row) => row.NUNOTA ?? '')
    if (internalIds.some((value) => !/^\d{1,18}$/.test(value))) throw new AdapterFailure('RESPONSE_REFUSED')
    const items = await session.loadRecords(itemsQuery(internalIds))
    return {
      orders: headers.map((row, index) => ({
        number: integerOf(row.NUMNOTA ?? null),
        internalId: internalIds[index] ?? '',
        date: dateOf(row.DTNEG ?? null),
        supplier: row.Parceiro_NOMEPARC ?? null,
        status: statusOf(row.STATUSNOTA ?? null),
        total: decimalOf(row.VLRNOTA ?? null),
        items: items.filter((item) => item.NUNOTA === internalIds[index]).map(itemOf),
      })),
    }
  },
})
