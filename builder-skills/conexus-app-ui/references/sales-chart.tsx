import { useQuery } from '@tanstack/react-query'
import { createLazyRoute } from '@tanstack/react-router'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatMonth, formatNumber } from '@/lib/format'

// Colors come from the --chart-* tokens in styles.css, never from a literal.
const config = { total: { label: 'Vendas', color: 'var(--chart-1)' } } satisfies ChartConfig

function Sales() {
  const input = { year: 2026 }
  const sales = useQuery({ queryKey: ['salesByMonth', input], queryFn: () => api.salesByMonth(input) })

  if (sales.isPending) return <Skeleton className="h-72 w-full" />
  if (sales.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar as vendas</AlertTitle>
        <AlertDescription>{errorMessage(sales.error)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por mês</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config}>
          <BarChart data={sales.data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatNumber} width={72} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">Vendas</span>
                      <span className="font-medium tabular-nums">{formatMoney(Number(value))}</span>
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

// routes/sales.lazy.tsx: the file router.tsx imports on first visit to /vendas.
export const salesLazyRoute = createLazyRoute('/vendas')({ component: Sales })
