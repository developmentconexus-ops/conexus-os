import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

interface Note {
  id: number
  orderNumber: string
  note: string
  author: string
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

function App() {
  const [notes, setNotes] = React.useState<Note[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [filterOrder, setFilterOrder] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Form fields
  const [orderNumber, setOrderNumber] = React.useState('')
  const [author, setAuthor] = React.useState('')
  const [noteText, setNoteText] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const fetchNotes = React.useCallback(async (targetOrder: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/__conexus/api/listNotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber: targetOrder.trim() }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao carregar notas (${response.status})`)
      }
      const data: Note[] = await response.json()
      setNotes(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao buscar notas.')
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchNotes('')
  }, [fetchNotes])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchNotes(filterOrder)
  }

  const handleClearFilter = () => {
    setFilterOrder('')
    fetchNotes('')
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber.trim() || !noteText.trim()) {
      setError('Por favor, preencha o número do pedido e a nota.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/__conexus/api/addNote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          note: noteText.trim(),
          author: author.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || `Erro ao salvar nota (${response.status})`)
      }

      setNoteText('')
      setSuccess('Nota adicionada com sucesso!')
      setTimeout(() => setSuccess(null), 3000)

      // Atualiza a listagem
      fetchNotes(filterOrder)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Falha ao salvar nota.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="card header">
        <h1>Acompanhamento de Pedidos de Compra</h1>
        <p>Registre e consulte notas de acompanhamento compartilhadas para toda a equipe.</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <div className="card">
        <h2>Nova Nota</h2>
        <form onSubmit={handleAddNote}>
          <div className="form-row">
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
              <label htmlFor="author">Seu Nome / Responsável (opcional)</label>
              <input
                id="author"
                type="text"
                className="form-control"
                placeholder="Ex: Mariana Silva"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="note">Nota de Acompanhamento *</label>
            <textarea
              id="note"
              className="form-control"
              placeholder="Digite os detalhes, status do fornecedor, prazos, etc..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              required
              rows={3}
              maxLength={5000}
            />
          </div>

          <button type="submit" className="btn" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar Nota'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Histórico de Notas</h2>
        <form onSubmit={handleSearch} className="filter-bar">
          <input
            type="text"
            className="form-control"
            placeholder="Filtrar por número do pedido..."
            value={filterOrder}
            onChange={(e) => setFilterOrder(e.target.value)}
            maxLength={100}
          />
          <button type="submit" className="btn" disabled={isLoading}>
            Buscar
          </button>
          {filterOrder && (
            <button
              type="button"
              className="btn btn-secondary"
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
            {filterOrder
              ? `Nenhuma nota encontrada para o pedido "${filterOrder}".`
              : 'Nenhuma nota registrada até o momento.'}
          </div>
        ) : (
          <div className="notes-list">
            {notes.map((item) => (
              <div key={item.id} className="note-item">
                <div className="note-header">
                  <span className="order-badge">Pedido #{item.orderNumber}</span>
                  <span className="note-meta">
                    {item.author ? `${item.author} • ` : ''}
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                <p className="note-content">{item.note}</p>
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
