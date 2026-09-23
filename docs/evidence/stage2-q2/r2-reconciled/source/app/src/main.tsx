import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

export type NoteStatus = 'Em aberto' | 'Aguardando o fornecedor' | 'Resolvida'

interface NoteItem {
  id: number
  orderNumber: string
  note: string
  status: NoteStatus
  createdAt: string
}

const STORAGE_KEY = 'purchase_order_notes'
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

function getSavedNotes(): NoteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch (err) {
    console.error('Falha ao salvar no localStorage', err)
  }
}

function App() {
  const [orderNumber, setOrderNumber] = React.useState('')
  const [noteText, setNoteText] = React.useState('')
  const [filterOrder, setFilterOrder] = React.useState('')
  const [notes, setNotes] = React.useState<NoteItem[]>(() => getSavedNotes())
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedOrder = orderNumber.trim()
    const trimmedNote = noteText.trim()

    if (!trimmedOrder) {
      setErrorMessage('Por favor, informe o número do pedido.')
      setSuccessMessage(null)
      return
    }

    if (!trimmedNote) {
      setErrorMessage('Por favor, escreva a nota.')
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

    const updated = [newNote, ...notes]
    setNotes(updated)
    saveNotesToStorage(updated)

    setNoteText('')
    setErrorMessage(null)
    setSuccessMessage('Nota salva com sucesso!')
  }

  const handleClearFilter = () => {
    setFilterOrder('')
  }

  const handleUpdateStatus = (id: number, newStatus: NoteStatus) => {
    const updated = notes.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item
    )
    setNotes(updated)
    saveNotesToStorage(updated)
  }

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleString('pt-BR')
    } catch {
      return isoString
    }
  }

  const filteredNotes = React.useMemo(() => {
    const filter = filterOrder.trim().toLowerCase()
    if (!filter) return notes
    return notes.filter((n) => n.orderNumber.toLowerCase().includes(filter))
  }, [notes, filterOrder])

  return (
    <div className="container">
      <div className="card">
        <h1>Notas de Pedidos de Compra</h1>
        <p className="subtitle">
          Acompanhamento e registro de notas vinculadas aos pedidos de compra.
        </p>

        {errorMessage && (
          <div className="status-message error">{errorMessage}</div>
        )}
        {successMessage && (
          <div className="status-message success">{successMessage}</div>
        )}

        <form onSubmit={handleSaveNote}>
          <div className="form-group">
            <label htmlFor="order-number-input">Número do Pedido</label>
            <input
              id="order-number-input"
              type="text"
              placeholder="Ex: PO-10452"
              value={orderNumber}
              onChange={(e) => {
                setOrderNumber(e.target.value)
                setErrorMessage(null)
                setSuccessMessage(null)
              }}
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="note-text-input">Nota de Acompanhamento</label>
            <textarea
              id="note-text-input"
              placeholder="Descreva o andamento, contato com fornecedor ou observações..."
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value)
                setErrorMessage(null)
                setSuccessMessage(null)
              }}
              rows={3}
              maxLength={4000}
            />
          </div>

          <button type="submit">
            Salvar Nota
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Histórico de Notas</h2>

        <div className="filter-bar">
          <input
            type="text"
            placeholder="Filtrar por número do pedido"
            value={filterOrder}
            onChange={(e) => setFilterOrder(e.target.value)}
          />
          {filterOrder && (
            <button
              type="button"
              className="button-secondary"
              onClick={handleClearFilter}
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
            {filteredNotes.map((item) => (
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
                  <span className="note-date">{formatDate(item.createdAt)}</span>
                </div>
                <div className="note-body">{item.note}</div>
              </div>
            ))}
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
