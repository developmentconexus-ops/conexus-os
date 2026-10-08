import { useQuery } from '@tanstack/react-query'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { createLazyRoute, Link } from '@tanstack/react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, type Output } from '@/conexus/api.gen'
import { failureText } from '@/conexus/failures.gen'
import { formatDate, formatNumber } from '@/lib/format'

function Dashboard() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Painel</h1>
        <p className="text-sm text-muted-foreground">Quanto entra, quanto sai e o que está parado.</p>
      </div>
      <Summary />
      <WeeklyChart />
      <Waiting />
    </section>
  )
}

function Summary() {
  const summary = useQuery({ queryKey: ['ticketSummary', {}], queryFn: () => api.ticketSummary({}) })

  if (summary.isPending) return <Skeleton className="h-24 w-full" />
  if (summary.isError) return <LoadError title="Não foi possível carregar os números" error={summary.error} />

  const kpis = [
    { label: 'Abertos agora', value: summary.data.open },
    { label: 'Aguardando peça', value: summary.data.waiting },
    { label: 'Resolvidos nos últimos 7 dias', value: summary.data.resolvedLastWeek },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardHeader>
            <CardDescription>{kpi.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatNumber(kpi.value)}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

// Colors come from the --chart-* tokens in styles.css, never from a literal.
const config = { total: { label: 'Chamados abertos', color: 'var(--chart-1)' } } satisfies ChartConfig

function WeeklyChart() {
  const input = { weeks: 12 }
  const weeks = useQuery({ queryKey: ['ticketsByWeek', input], queryFn: () => api.ticketsByWeek(input) })

  if (weeks.isPending) return <Skeleton className="h-72 w-full" />
  if (weeks.isError) return <LoadError title="Não foi possível carregar os chamados por semana" error={weeks.error} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chamados abertos por semana</CardTitle>
      </CardHeader>
      <CardContent>
        {weeks.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum chamado aberto nas últimas 12 semanas.</p>
        ) : (
          <ChartContainer config={config}>
            <BarChart data={weeks.data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickFormatter={formatDate} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={formatNumber} width={72} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">Chamados abertos</span>
                        <span className="font-medium tabular-nums">{formatNumber(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="total" fill="var(--color-total)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

type Ticket = Output<'listTickets'>[number]

const features = tableFeatures({})
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
  column.accessor('requesterName', { header: 'Aberto por' }),
  column.accessor('openedAt', { header: 'Aberto em', cell: (info) => formatDate(info.getValue()) }),
])
const NO_TICKETS: Ticket[] = []
// listTickets answers newest first. At module scope, so the query keeps the same rows between renders.
const oldestFive = (tickets: Ticket[]) => tickets.slice(-5).reverse()

// The table that explains the numbers: the tickets stuck the longest, oldest first.
function Waiting() {
  const input = { status: 'waiting' as const }
  const waiting = useQuery({ queryKey: ['listTickets', input], queryFn: () => api.listTickets(input), select: oldestFive })
  const table = useTable({ features, columns, data: waiting.data ?? NO_TICKETS })

  if (waiting.isPending) return <Skeleton className="h-40 w-full" />
  if (waiting.isError) return <LoadError title="Não foi possível carregar os chamados parados" error={waiting.error} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aguardando há mais tempo</CardTitle>
      </CardHeader>
      <CardContent>
        {waiting.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum chamado aguardando peça.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        <table.FlexRender header={header} />
                      </TableHead>
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
        )}
      </CardContent>
    </Card>
  )
}

function LoadError({ title, error }: { title: string; error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{failureText(error)}</AlertDescription>
    </Alert>
  )
}

export const dashboardLazyRoute = createLazyRoute('/painel')({ component: Dashboard })
