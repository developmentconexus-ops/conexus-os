import { useQuery } from '@tanstack/react-query'
import { createLazyRoute } from '@tanstack/react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatNumber } from '@/lib/format'

// Colors come from the --chart-* tokens in styles.css, never from a literal.
const config = { total: { label: 'Chamados', color: 'var(--chart-1)' } } satisfies ChartConfig

function Tickets() {
  const input = { weeks: 12 }
  const tickets = useQuery({ queryKey: ['ticketsByWeek', input], queryFn: () => api.ticketsByWeek(input) })

  if (tickets.isPending) return <Skeleton className="h-72 w-full" />
  if (tickets.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os chamados</AlertTitle>
        <AlertDescription>{errorMessage(tickets.error)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chamados abertos por semana</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config}>
          <BarChart data={tickets.data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week" tickFormatter={formatDate} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatNumber} width={72} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">Chamados</span>
                      <span className="font-medium tabular-nums">{formatNumber(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="total" fill="var(--color-total)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// routes/tickets.lazy.tsx: the file router.tsx imports on first visit to /chamados.
export const ticketsLazyRoute = createLazyRoute('/chamados')({ component: Tickets })
