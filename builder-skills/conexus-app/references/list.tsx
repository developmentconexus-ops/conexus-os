import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowUpDown, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TICKET_STATUSES, TicketStatusBadge, type TicketStatus } from '@/components/ticket-status'
import { api, type Output } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatNumber } from '@/lib/format'

type Ticket = Output<'listTickets'>[number]

// v9: a table declares the features it uses, and each row model is a slot of the same object.
// Keep features, columns and the empty fallback at module scope, or the table rebuilds on each render.
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { text: sortFn_text, alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
})

const column = createColumnHelper<typeof features, Ticket>()

const columns = column.columns([
  column.accessor('subject', {
    header: 'Chamado',
    cell: (info) => (
      <Link to="/chamados/$id" params={{ id: String(info.row.original.id) }} className="font-medium hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor('status', { header: 'Situação', cell: (info) => <TicketStatusBadge status={info.getValue()} /> }),
  column.accessor('requesterName', { header: 'Aberto por' }),
  column.accessor('openedAt', {
    header: ({ column: c }) => (
      <Button variant="ghost" onClick={() => c.toggleSorting(c.getIsSorted() === 'asc')}>
        Aberto em
        <ArrowUpDown />
      </Button>
    ),
    cell: (info) => formatDate(info.getValue()),
  }),
])

const NO_TICKETS: Ticket[] = []

const route = getRouteApi('/chamados')

export function TicketsScreen() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // The key is [operationId, input]; the input object is the whole cache identity.
  const listInput = { status: search.status, search: search.q }
  const tickets = useQuery({ queryKey: ['listTickets', listInput], queryFn: () => api.listTickets(listInput) })
  // Counts follow the search but not the status, so every tab says how many it would show.
  const countInput = { search: search.q }
  const counts = useQuery({ queryKey: ['countTickets', countInput], queryFn: () => api.countTickets(countInput) })

  const countOf = (status: TicketStatus | 'all') =>
    (counts.data ?? []).filter((row) => status === 'all' || row.status === status).reduce((sum, row) => sum + row.total, 0)

  const table = useTable({ features, columns, data: tickets.data ?? NO_TICKETS, initialState: { pagination: { pageIndex: 0, pageSize: 25 } } })
  const filtered = Boolean(search.status || search.q)

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Chamados</h1>
          <p className="text-sm text-muted-foreground">Pedidos de reparo dos prédios, do aberto ao resolvido.</p>
        </div>
        <Button render={<Link to="/chamados/novo" />}>
          <Plus />
          Abrir chamado
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={search.status ?? 'all'}
          onValueChange={(value: TicketStatus | 'all') =>
            navigate({ search: (previous) => ({ ...previous, status: value === 'all' ? undefined : value }), replace: true })
          }
        >
          <TabsList>
            <TabsTrigger value="all">Todos {counts.isSuccess ? formatNumber(countOf('all')) : null}</TabsTrigger>
            {TICKET_STATUSES.map((status) => (
              <TabsTrigger key={status.value} value={status.value}>
                {status.label} {counts.isSuccess ? formatNumber(countOf(status.value)) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          aria-label="Buscar chamado"
          placeholder="Buscar por assunto ou pessoa"
          defaultValue={search.q ?? ''}
          onChange={(event) => navigate({ search: (previous) => ({ ...previous, q: event.target.value || undefined }), replace: true })}
          className="max-w-xs"
        />
      </div>

      {tickets.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : tickets.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os chamados</AlertTitle>
          <AlertDescription>{errorMessage(tickets.error)}</AlertDescription>
        </Alert>
      ) : tickets.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{filtered ? 'Nenhum chamado com esse filtro' : 'Nenhum chamado ainda'}</EmptyTitle>
            <EmptyDescription>
              {filtered ? 'Mude a situação ou a busca para ver outros chamados.' : 'Abra o primeiro chamado quando algo precisar de reparo.'}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? null : (
            <EmptyContent>
              <Button render={<Link to="/chamados/novo" />}>Abrir chamado</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {table.getPageCount() > 1 ? (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              Página {table.state.pagination.pageIndex + 1} de {table.getPageCount()}
              <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Próxima
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
