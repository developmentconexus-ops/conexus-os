import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

export type NoteStatus = 'Em aberto' | 'Aguardando o fornecedor' | 'Resolvida'

export const STATUS_OPTIONS: NoteStatus[] = [
  'Em aberto',
  'Aguardando o fornecedor',
  'Resolvida',
]

interface PurchaseOrder {
  id: number
  orderNumber: string
  assignee: string
  expectedDeliveryDate: string
  createdAt: string
}

interface Note {
  id: number
  orderNumber: string
  note: string
  author: string
  status: NoteStatus
  createdAt: string
}

function formatDate(isoString: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return isNaN(d.getTime()) ? isoString : d.toLocaleString('pt-BR')
  } catch {
    return isoString
  }
}

function formatDeliveryDate(dateStr: string): string {
  if (!dateStr) return 'Não definida'
  // Date format is YYYY-MM-DD
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

function getStatusBadgeClass(status: NoteStatus): string {
  switch (status) {
    case 'Em aberto':
      return 'status-badge status-open'
    case 'Aguardando o fornecedor':
      return 'status-badge status-waiting'
    case 'Resolvida':
      return 'status-badge status-resolved'
    default:
      return 'status-badge'
  }
}

function App() {
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([])
  const [selectedOrderNumber, setSelectedOrderNumber] = React.useState<string>('')
  const [notes, setNotes] = React.useState<Note[]>([])
  const [filterQuery, setFilterQuery] = React.useState('')
  const [isLoadingOrders, setIsLoadingOrders] = React.useState(false)
  const [isLoadingNotes, setIsLoadingNotes] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Order form state
  const [orderNumber, setOrderNumber] = React.useState('')
  const [assignee, setAssignee] = React.useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState('')
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false)

  // Note form state
  const [author, setAuthor] = React.useState('')
  const [noteStatus, setNoteStatus] = React.useState<NoteStatus>('Em aberto')
  const [noteText, setNoteText] = React.useState('')
  const [isSubmittingNote, setIsSubmittingNote] = React.useState(false)
  const [updatingNoteId, setUpdatingNoteId] = React.useState<number | null>(null)

  const fetchOrders = React.useCallback(async (query: string = '') => {
    setIsLoadingOrders(true)
    try {
      const response = await fetch('/__conexus/api/listPurchaseOrders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao carregar pedidos (${response.status})`)
      }
      const data: PurchaseOrder[] = await response.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao buscar pedidos de compra.')
      setOrders([])
    } finally {
      setIsLoadingOrders(false)
    }
  }, [])

  const fetchNotes = React.useCallback(async (targetOrder: string) => {
    if (!targetOrder) {
      setNotes([])
      return
    }
    setIsLoadingNotes(true)
    try {
      const response = await fetch('/__conexus/api/listNotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber: targetOrder }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao carregar notas (${response.status})`)
      }
      const data: Note[] = await response.json()
      setNotes(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao buscar notas do pedido.')
      setNotes([])
    } finally {
      setIsLoadingNotes(false)
    }
  }, [])

  React.useEffect(() => {
    fetchOrders('')
  }, [fetchOrders])

  React.useEffect(() => {
    if (selectedOrderNumber) {
      fetchNotes(selectedOrderNumber)
    } else {
      setNotes([])
    }
  }, [selectedOrderNumber, fetchNotes])

  // Quando pedidos são carregados e há apenas um ou nenhum selecionado, podemos sincronizar
  React.useEffect(() => {
    if (orders.length > 0 && !selectedOrderNumber) {
      setSelectedOrderNumber(orders[0].orderNumber)
    }
  }, [orders, selectedOrderNumber])

  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault()
    fetchOrders(filterQuery)
  }

  const handleClearSearch = () => {
    setFilterQuery('')
    fetchOrders('')
  }

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber.trim() || !assignee.trim() || !expectedDeliveryDate.trim()) {
      setError('Por favor, preencha o número do pedido, o responsável e a data prevista de entrega.')
      return
    }

    setIsSubmittingOrder(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/__conexus/api/upsertPurchaseOrder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          assignee: assignee.trim(),
          expectedDeliveryDate: expectedDeliveryDate.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao salvar pedido (${response.status})`)
      }

      const savedOrder: PurchaseOrder = await response.json()
      setSuccess(`Pedido #${savedOrder.orderNumber} salvo com sucesso!`)
      setTimeout(() => setSuccess(null), 3000)

      setSelectedOrderNumber(savedOrder.orderNumber)
      setOrderNumber('')
      setAssignee('')
      setExpectedDeliveryDate('')

      await fetchOrders(filterQuery)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao salvar pedido.')
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  const handleSelectOrderToEdit = (po: PurchaseOrder) => {
    setSelectedOrderNumber(po.orderNumber)
    setOrderNumber(po.orderNumber)
    setAssignee(po.assignee)
    setExpectedDeliveryDate(po.expectedDeliveryDate)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderNumber) {
      setError('Selecione um pedido de compra para adicionar a nota.')
      return
    }
    if (!noteText.trim()) {
      setError('Por favor, digite o conteúdo da nota.')
      return
    }

    setIsSubmittingNote(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/__conexus/api/addNote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNumber: selectedOrderNumber,
          note: noteText.trim(),
          author: author.trim(),
          status: noteStatus,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao salvar nota (${response.status})`)
      }

      setNoteText('')
      setNoteStatus('Em aberto')
      setSuccess('Nota de acompanhamento vinculada ao pedido com sucesso!')
      setTimeout(() => setSuccess(null), 3000)

      fetchNotes(selectedOrderNumber)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao salvar nota.')
    } finally {
      setIsSubmittingNote(false)
    }
  }

  const handleUpdateStatus = async (noteId: number, nextStatus: NoteStatus) => {
    setUpdatingNoteId(noteId)
    setError(null)
    try {
      const response = await fetch('/__conexus/api/updateNoteStatus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: noteId,
          status: nextStatus,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao atualizar status (${response.status})`)
      }

      const updatedNote: Note = await response.json()
      setNotes((prev) =>
        prev.map((item) => (item.id === updatedNote.id ? { ...item, status: updatedNote.status } : item)),
      )
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao atualizar status da nota.')
    } finally {
      setUpdatingNoteId(null)
    }
  }

  const currentOrder = orders.find((o) => o.orderNumber === selectedOrderNumber)

  return (
    <div className="container">
      <header className="card header">
        <h1>Gestão de Pedidos de Compra</h1>
        <p>Acompanhamento de pedidos com responsável designado, data prevista e notas de histórico vinculadas.</p>
      </header>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <div className="main-layout">
        {/* Coluna da esquerda: Cadastro e Lista de Pedidos */}
        <section className="orders-section">
          <div className="card">
            <h2>{orderNumber ? 'Editar / Novo Pedido' : 'Novo Pedido de Compra'}</h2>
            <form onSubmit={handleSaveOrder}>
              <div className="form-group">
                <label htmlFor="orderNumber">Número do Pedido *</label>
                <input
                  id="orderNumber"
                  type="text"
                  className="form-control"
                  placeholder="Ex: PC-10492 ou 45001"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="assignee">Pessoa Responsável *</label>
                <input
                  id="assignee"
                  type="text"
                  className="form-control"
                  placeholder="Ex: Mariana Silva"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expectedDeliveryDate">Data Prevista de Entrega *</label>
                <input
                  id="expectedDeliveryDate"
                  type="date"
                  className="form-control"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn" disabled={isSubmittingOrder}>
                  {isSubmittingOrder ? 'Salvando...' : 'Salvar Pedido'}
                </button>
                {orderNumber && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setOrderNumber('')
                      setAssignee('')
                      setExpectedDeliveryDate('')
                    }}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h2>Pedidos de Compra</h2>
            <form onSubmit={handleSearchOrder} className="filter-bar">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar pedido ou responsável..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                maxLength={100}
              />
              <button type="submit" className="btn" disabled={isLoadingOrders}>
                Buscar
              </button>
              {filterQuery && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClearSearch}
                  disabled={isLoadingOrders}
                >
                  Limpar
                </button>
              )}
            </form>

            {isLoadingOrders ? (
              <div className="empty-state">Carregando pedidos...</div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                {filterQuery
                  ? `Nenhum pedido encontrado para "${filterQuery}".`
                  : 'Nenhum pedido cadastrado ainda.'}
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((po) => {
                  const isSelected = po.orderNumber === selectedOrderNumber
                  return (
                    <div
                      key={po.id}
                      className={`order-item ${isSelected ? 'order-item-selected' : ''}`}
                      onClick={() => setSelectedOrderNumber(po.orderNumber)}
                    >
                      <div className="order-item-header">
                        <span className="order-badge">Pedido #{po.orderNumber}</span>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectOrderToEdit(po)
                          }}
                        >
                          Editar
                        </button>
                      </div>
                      <div className="order-item-details">
                        <div>
                          <strong>Responsável:</strong> {po.assignee || <span className="text-muted">Não informado</span>}
                        </div>
                        <div>
                          <strong>Entrega prevista:</strong> {formatDeliveryDate(po.expectedDeliveryDate)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Coluna da direita: Notas vinculadas ao Pedido Selecionado */}
        <section className="notes-section">
          {selectedOrderNumber ? (
            <>
              <div className="card">
                <div className="selected-order-banner">
                  <h2>Notas do Pedido #{selectedOrderNumber}</h2>
                  {currentOrder && (
                    <div className="selected-order-meta">
                      <span>
                        <strong>Responsável:</strong> {currentOrder.assignee || 'Não informado'}
                      </span>
                      <span>
                        <strong>Entrega prevista:</strong> {formatDeliveryDate(currentOrder.expectedDeliveryDate)}
                      </span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddNote} className="add-note-form">
                  <h3>Nova Nota de Acompanhamento</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="noteAuthor">Autor da Nota (opcional)</label>
                      <input
                        id="noteAuthor"
                        type="text"
                        className="form-control"
                        placeholder="Ex: Carlos Oliveira"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="noteStatus">Status</label>
                      <select
                        id="noteStatus"
                        className="form-control"
                        value={noteStatus}
                        onChange={(e) => setNoteStatus(e.target.value as NoteStatus)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="noteText">Conteúdo da Nota *</label>
                    <textarea
                      id="noteText"
                      className="form-control"
                      placeholder="Descreva o andamento, contato com fornecedor, transportadora, etc..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      required
                      rows={3}
                      maxLength={5000}
                    />
                  </div>

                  <button type="submit" className="btn" disabled={isSubmittingNote}>
                    {isSubmittingNote ? 'Adicionando...' : 'Adicionar Nota ao Pedido'}
                  </button>
                </form>
              </div>

              <div className="card">
                <h2>Histórico de Acompanhamento</h2>
                {isLoadingNotes ? (
                  <div className="empty-state">Carregando notas...</div>
                ) : notes.length === 0 ? (
                  <div className="empty-state">
                    Nenhuma nota registrada para o pedido #{selectedOrderNumber}.
                  </div>
                ) : (
                  <div className="notes-list">
                    {notes.map((item) => (
                      <div key={item.id} className="note-item">
                        <div className="note-header">
                          <span className={getStatusBadgeClass(item.status)}>{item.status}</span>
                          <span className="note-meta">
                            {item.author ? `${item.author} • ` : ''}
                            {formatDate(item.createdAt)}
                          </span>
                        </div>

                        <p className="note-content">{item.note}</p>

                        <div className="note-actions">
                          <label htmlFor={`status-select-${item.id}`} className="note-status-label">
                            Alterar status:
                          </label>
                          <select
                            id={`status-select-${item.id}`}
                            className="status-select"
                            value={item.status}
                            disabled={updatingNoteId === item.id}
                            onChange={(e) => handleUpdateStatus(item.id, e.target.value as NoteStatus)}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          {updatingNoteId === item.id && (
                            <span className="updating-text">Atualizando...</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card empty-state">
              <h3>Nenhum pedido selecionado</h3>
              <p>Cadastre ou selecione um pedido de compra ao lado para visualizar e registrar notas de acompanhamento vinculadas.</p>
            </div>
          )}
        </section>
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
