import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

interface NoteItem {
  id: number
  orderNumber: string
  note: string
  createdAt: string
}

function App() {
  const [orderNumber, setOrderNumber] = React.useState('')
  const [noteText, setNoteText] = React.useState('')
  const [filterOrder, setFilterOrder] = React.useState('')
  const [appliedFilter, setAppliedFilter] = React.useState('')
  const [notes, setNotes] = React.useState<NoteItem[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  const loadNotes = React.useCallback(async (filter?: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const payload = filter && filter.trim() ? { orderNumber: filter.trim() } : {}
      const response = await fetch('/__conexus/api/listNotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setErrorMessage(data?.error?.detail || 'Erro ao carregar notas.')
      } else {
        const data = await response.json()
        setNotes(Array.isArray(data) ? data : [])
      }
    } catch {
      setErrorMessage('Falha na comunicação com o servidor.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadNotes(appliedFilter)
  }, [loadNotes, appliedFilter])

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedOrder = orderNumber.trim()
    const trimmedNote = noteText.trim()

    if (!trimmedOrder) {
      setErrorMessage('Por favor, informe o número do pedido.')
      return
    }
    if (!trimmedNote) {
      setErrorMessage('Por favor, escreva a nota.')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/__conexus/api/addNote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber: trimmedOrder, note: trimmedNote }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setErrorMessage(data?.error?.detail || 'Erro ao salvar a nota.')
      } else {
        setNoteText('')
        setSuccessMessage('Nota salva com sucesso!')
        // Se a nota salva pertence ao filtro ativo ou filtro está vazio, recarrega
        if (!appliedFilter || appliedFilter.trim().toLowerCase() === trimmedOrder.toLowerCase()) {
          loadNotes(appliedFilter)
        } else {
          // Atualiza para exibir as notas desse pedido recém-anotado
          setFilterOrder(trimmedOrder)
          setAppliedFilter(trimmedOrder)
        }
      }
    } catch {
      setErrorMessage('Falha ao enviar a nota ao servidor.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAppliedFilter(filterOrder.trim())
  }

  const handleClearFilter = () => {
    setFilterOrder('')
    setAppliedFilter('')
  }

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleString('pt-BR')
    } catch {
      return isoString
    }
  }

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
              onChange={(e) => setOrderNumber(e.target.value)}
              disabled={isSaving}
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="note-text-input">Nota de Acompanhamento</label>
            <textarea
              id="note-text-input"
              placeholder="Descreva o andamento, contato com fornecedor ou observações..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              disabled={isSaving}
              rows={3}
              maxLength={4000}
            />
          </div>

          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar Nota'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Histórico de Notas</h2>

        <form className="filter-bar" onSubmit={handleFilterSubmit}>
          <input
            type="text"
            placeholder="Filtrar por número do pedido (vazio para todos)"
            value={filterOrder}
            onChange={(e) => setFilterOrder(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Buscar
          </button>
          {appliedFilter && (
            <button
              type="button"
              className="button-secondary"
              onClick={handleClearFilter}
              disabled={isLoading}
            >
              Limpar
            </button>
          )}
        </form>

        {isLoading ? (
          <div className="empty-state">Carregando notas...</div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            {appliedFilter
              ? `Nenhuma nota encontrada para o pedido "${appliedFilter}".`
              : 'Nenhuma nota registrada ainda.'}
          </div>
        ) : (
          <div className="notes-list">
            {notes.map((item) => (
              <div key={item.id} className="note-item">
                <div className="note-header">
                  <span className="order-badge">Pedido: {item.orderNumber}</span>
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
