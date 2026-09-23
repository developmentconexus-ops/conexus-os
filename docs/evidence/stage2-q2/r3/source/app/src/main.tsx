import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

export type NoteStatus = 'Em aberto' | 'Aguardando o fornecedor' | 'Resolvida'

export interface PurchaseOrder {
  id: string // Identificador único ou número normalizado
  orderNumber: string
  assignee: string // Pessoa responsável
  expectedDeliveryDate: string // Data prevista de entrega (AAAA-MM-DD)
  createdAt: string
}

export interface NoteItem {
  id: number
  orderNumber: string
  note: string
  status: NoteStatus
  createdAt: string
}

const ORDERS_STORAGE_KEY = 'purchase_orders_data'
const NOTES_STORAGE_KEY = 'purchase_order_notes'
const STATUS_OPTIONS: NoteStatus[] = ['Em aberto', 'Aguardando o fornecedor', 'Resolvida']

function normalizeNote(item: any): NoteItem | null {
  if (!item || typeof item !== 'object') return null
  const validStatus: NoteStatus =
    item.status === 'Aguardando o fornecedor' || item.status === 'Resolvida' || item.status === 'Em aberto'
      ? item.status
      : 'Em aberto'

  return {
    id: typeof item.id === 'number' ? item.id : Date.now(),
    orderNumber: typeof item.orderNumber === 'string' ? item.orderNumber : '',
    note: typeof item.note === 'string' ? item.note : '',
    status: validStatus,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  }
}

function normalizeOrder(item: any): PurchaseOrder | null {
  if (!item || typeof item !== 'object') return null
  const orderNumber = typeof item.orderNumber === 'string' ? item.orderNumber.trim() : ''
  if (!orderNumber) return null

  return {
    id: typeof item.id === 'string' && item.id ? item.id : orderNumber,
    orderNumber,
    assignee: typeof item.assignee === 'string' ? item.assignee : '',
    expectedDeliveryDate: typeof item.expectedDeliveryDate === 'string' ? item.expectedDeliveryDate : '',
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  }
}

function getSavedNotes(): NoteItem[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeNote).filter((item): item is NoteItem => item !== null)
  } catch {
    return []
  }
}

function saveNotesToStorage(notes: NoteItem[]): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch (err) {
    console.error('Falha ao salvar notas no localStorage', err)
  }
}

function getSavedOrders(initialNotes: NoteItem[]): PurchaseOrder[] {
  let orders: PurchaseOrder[] = []
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        orders = parsed.map(normalizeOrder).filter((item): item is PurchaseOrder => item !== null)
      }
    }
  } catch {
    orders = []
  }

  // Preservar pedidos que já estavam em notas cadastradas anteriormente
  const orderMap = new Map<string, PurchaseOrder>()
  for (const o of orders) {
    orderMap.set(o.orderNumber.toLowerCase(), o)
  }

  let modified = false
  for (const n of initialNotes) {
    const key = n.orderNumber.trim().toLowerCase()
    if (key && !orderMap.has(key)) {
      const generated: PurchaseOrder = {
        id: n.orderNumber.trim(),
        orderNumber: n.orderNumber.trim(),
        assignee: 'Não informado',
        expectedDeliveryDate: '',
        createdAt: n.createdAt || new Date().toISOString(),
      }
      orderMap.set(key, generated)
      orders.push(generated)
      modified = true
    }
  }

  if (modified) {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders))
    } catch (e) {
      console.error('Falha ao sincronizar pedidos existentes', e)
    }
  }

  return orders
}

function saveOrdersToStorage(orders: PurchaseOrder[]): void {
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders))
  } catch (err) {
    console.error('Falha ao salvar pedidos no localStorage', err)
  }
}

function formatDate(isoOrDateString: string) {
  if (!isoOrDateString) return 'Não informada'
  // Se for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateString)) {
    const [year, month, day] = isoOrDateString.split('-')
    return `${day}/${month}/${year}`
  }
  try {
    const date = new Date(isoOrDateString)
    if (isNaN(date.getTime())) return isoOrDateString
    return date.toLocaleDateString('pt-BR')
  } catch {
    return isoOrDateString
  }
}

function formatDateTime(isoString: string) {
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return isoString
    return date.toLocaleString('pt-BR')
  } catch {
    return isoString
  }
}

function App() {
  const [notes, setNotes] = React.useState<NoteItem[]>(() => getSavedNotes())
  const [orders, setOrders] = React.useState<PurchaseOrder[]>(() => getSavedOrders(getSavedNotes()))

  // Formulário de Pedido
  const [orderNumberInput, setOrderNumberInput] = React.useState('')
  const [assigneeInput, setAssigneeInput] = React.useState('')
  const [deliveryDateInput, setDeliveryDateInput] = React.useState('')

  // Formulário de Nota
  const [selectedOrderForNote, setSelectedOrderForNote] = React.useState('')
  const [noteTextInput, setNoteTextInput] = React.useState('')

  // Filtro
  const [filterOrder, setFilterOrder] = React.useState('')

  // Mensagens
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  // Salvar ou atualizar pedido de compra
  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedOrder = orderNumberInput.trim()
    const trimmedAssignee = assigneeInput.trim()
    const deliveryDate = deliveryDateInput.trim()

    if (!trimmedOrder) {
      setErrorMessage('Por favor, informe o número do pedido de compra.')
      setSuccessMessage(null)
      return
    }

    if (!trimmedAssignee) {
      setErrorMessage('Por favor, informe a pessoa responsável pelo pedido.')
      setSuccessMessage(null)
      return
    }

    if (!deliveryDate) {
      setErrorMessage('Por favor, informe a data prevista de entrega.')
      setSuccessMessage(null)
      return
    }

    const existingIndex = orders.findIndex(
      (o) => o.orderNumber.toLowerCase() === trimmedOrder.toLowerCase()
    )

    let updatedOrders: PurchaseOrder[]
    if (existingIndex >= 0) {
      // Atualiza pedido existente
      updatedOrders = [...orders]
      updatedOrders[existingIndex] = {
        ...updatedOrders[existingIndex],
        orderNumber: trimmedOrder,
        assignee: trimmedAssignee,
        expectedDeliveryDate: deliveryDate,
      }
      setSuccessMessage(`Pedido ${trimmedOrder} atualizado com sucesso!`)
    } else {
      // Cria novo pedido
      const newOrder: PurchaseOrder = {
        id: trimmedOrder,
        orderNumber: trimmedOrder,
        assignee: trimmedAssignee,
        expectedDeliveryDate: deliveryDate,
        createdAt: new Date().toISOString(),
      }
      updatedOrders = [newOrder, ...orders]
      setSuccessMessage(`Pedido ${trimmedOrder} cadastrado com sucesso!`)
    }

    setOrders(updatedOrders)
    saveOrdersToStorage(updatedOrders)

    // Se nenhuma seleção de nota estiver ativa, pré-seleciona este pedido
    if (!selectedOrderForNote) {
      setSelectedOrderForNote(trimmedOrder)
    }

    setOrderNumberInput('')
    setAssigneeInput('')
    setDeliveryDateInput('')
    setErrorMessage(null)
  }

  // Salvar nova nota vinculada ao pedido
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedOrder = selectedOrderForNote.trim()
    const trimmedNote = noteTextInput.trim()

    if (!trimmedOrder) {
      setErrorMessage('Por favor, selecione ou informe o pedido de compra correspondente.')
      setSuccessMessage(null)
      return
    }

    if (!trimmedNote) {
      setErrorMessage('Por favor, escreva a nota de acompanhamento.')
      setSuccessMessage(null)
      return
    }

    const newNote: NoteItem = {
      id: Date.now(),
      orderNumber: trimmedOrder,
      note: trimmedNote,
      status: 'Em aberto',
      createdAt: new Date().toISOString(),
    }

    const updatedNotes = [newNote, ...notes]
    setNotes(updatedNotes)
    saveNotesToStorage(updatedNotes)

    setNoteTextInput('')
    setErrorMessage(null)
    setSuccessMessage(`Nota vinculada ao pedido ${trimmedOrder} com sucesso!`)
  }

  const handleUpdateStatus = (id: number, newStatus: NoteStatus) => {
    const updated = notes.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item
    )
    setNotes(updated)
    saveNotesToStorage(updated)
  }

  const orderDetailsMap = React.useMemo(() => {
    const map = new Map<string, PurchaseOrder>()
    for (const ord of orders) {
      map.set(ord.orderNumber.toLowerCase(), ord)
    }
    return map
  }, [orders])

  const filteredNotes = React.useMemo(() => {
    const filter = filterOrder.trim().toLowerCase()
    if (!filter) return notes
    return notes.filter((n) => {
      const matchOrder = n.orderNumber.toLowerCase().includes(filter)
      const order = orderDetailsMap.get(n.orderNumber.toLowerCase())
      const matchAssignee = order?.assignee.toLowerCase().includes(filter)
      return matchOrder || matchAssignee
    })
  }, [notes, filterOrder, orderDetailsMap])

  return (
    <div className="container">
      <div className="card">
        <h1>Pedidos de Compra e Acompanhamento</h1>
        <p className="subtitle">
          Gerenciamento de pedidos de compra com responsável, previsão de entrega e notas de acompanhamento.
        </p>

        {errorMessage && (
          <div className="status-message error">{errorMessage}</div>
        )}
        {successMessage && (
          <div className="status-message success">{successMessage}</div>
        )}

        {/* Cadastro / Atualização de Pedido de Compra */}
        <section className="form-section">
          <h2>Cadastrar Pedido de Compra</h2>
          <form onSubmit={handleSaveOrder}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="order-number-input">Número do Pedido</label>
                <input
                  id="order-number-input"
                  type="text"
                  placeholder="Ex: PO-10452"
                  value={orderNumberInput}
                  onChange={(e) => {
                    setOrderNumberInput(e.target.value)
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="assignee-input">Pessoa Responsável</label>
                <input
                  id="assignee-input"
                  type="text"
                  placeholder="Ex: Ana Silva"
                  value={assigneeInput}
                  onChange={(e) => {
                    setAssigneeInput(e.target.value)
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="delivery-date-input">Data Prevista de Entrega</label>
                <input
                  id="delivery-date-input"
                  type="date"
                  value={deliveryDateInput}
                  onChange={(e) => {
                    setDeliveryDateInput(e.target.value)
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                />
              </div>
            </div>

            <button type="submit">Salvar Pedido</button>
          </form>
        </section>

        <hr className="divider" />

        {/* Nova Nota Vinculada */}
        <section className="form-section">
          <h2>Nova Nota de Acompanhamento</h2>
          <form onSubmit={handleSaveNote}>
            <div className="form-group">
              <label htmlFor="select-order">Pedido Correspondente</label>
              {orders.length > 0 ? (
                <select
                  id="select-order"
                  value={selectedOrderForNote}
                  onChange={(e) => {
                    setSelectedOrderForNote(e.target.value)
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                >
                  <option value="">-- Selecione o pedido --</option>
                  {orders.map((ord) => (
                    <option key={ord.orderNumber} value={ord.orderNumber}>
                      {ord.orderNumber} (Responsável: {ord.assignee || 'Não informado'} | Entrega:{' '}
                      {formatDate(ord.expectedDeliveryDate)})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="select-order"
                  type="text"
                  placeholder="Cadastre um pedido acima ou digite o número do pedido"
                  value={selectedOrderForNote}
                  onChange={(e) => setSelectedOrderForNote(e.target.value)}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="note-text-input">Nota de Acompanhamento</label>
              <textarea
                id="note-text-input"
                placeholder="Descreva o andamento, contato com fornecedor ou observações..."
                value={noteTextInput}
                onChange={(e) => {
                  setNoteTextInput(e.target.value)
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                rows={3}
                maxLength={4000}
              />
            </div>

            <button type="submit">Adicionar Nota ao Pedido</button>
          </form>
        </section>
      </div>

      {/* Lista de Pedidos Cadastrados */}
      {orders.length > 0 && (
        <div className="card">
          <h2>Pedidos Cadastrados ({orders.length})</h2>
          <div className="orders-grid">
            {orders.map((order) => {
              const notesCount = notes.filter(
                (n) => n.orderNumber.toLowerCase() === order.orderNumber.toLowerCase()
              ).length
              return (
                <div key={order.orderNumber} className="order-card">
                  <div className="order-card-header">
                    <span className="order-number-title">{order.orderNumber}</span>
                    <span className="notes-count-badge">
                      {notesCount} {notesCount === 1 ? 'nota' : 'notas'}
                    </span>
                  </div>
                  <div className="order-card-body">
                    <p>
                      <strong>Responsável:</strong> {order.assignee || 'Não informado'}
                    </p>
                    <p>
                      <strong>Previsão de Entrega:</strong> {formatDate(order.expectedDeliveryDate)}
                    </p>
                  </div>
                  <div className="order-card-actions">
                    <button
                      type="button"
                      className="button-link"
                      onClick={() => {
                        setSelectedOrderForNote(order.orderNumber)
                        setFilterOrder(order.orderNumber)
                      }}
                    >
                      Filtrar notas deste pedido
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Histórico de Notas Vinculadas */}
      <div className="card">
        <h2>Histórico de Notas ({filteredNotes.length})</h2>

        <div className="filter-bar">
          <input
            type="text"
            placeholder="Filtrar por pedido ou responsável..."
            value={filterOrder}
            onChange={(e) => setFilterOrder(e.target.value)}
          />
          {filterOrder && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setFilterOrder('')}
            >
              Limpar
            </button>
          )}
        </div>

        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            {filterOrder.trim()
              ? `Nenhuma nota encontrada para o filtro "${filterOrder.trim()}".`
              : 'Nenhuma nota registrada ainda.'}
          </div>
        ) : (
          <div className="notes-list">
            {filteredNotes.map((item) => {
              const orderInfo = orderDetailsMap.get(item.orderNumber.toLowerCase())
              return (
                <div key={item.id} className="note-item">
                  <div className="note-header">
                    <div className="note-header-left">
                      <span className="order-badge">Pedido: {item.orderNumber}</span>
                      <label className="status-selector-label">
                        <span className="sr-only">Status:</span>
                        <select
                          aria-label={`Status da nota do pedido ${item.orderNumber}`}
                          className={`status-select status-${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                          value={item.status}
                          onChange={(e) => handleUpdateStatus(item.id, e.target.value as NoteStatus)}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <span className="note-date">{formatDateTime(item.createdAt)}</span>
                  </div>

                  <div className="note-order-details">
                    <span>
                      <strong>Responsável:</strong> {orderInfo?.assignee || 'Não informado'}
                    </span>
                    <span className="separator">•</span>
                    <span>
                      <strong>Previsão de Entrega:</strong>{' '}
                      {formatDate(orderInfo?.expectedDeliveryDate || '')}
                    </span>
                  </div>

                  <div className="note-body">{item.note}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('CONEXUS_APP_ROOT_MISSING')

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
