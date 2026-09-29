import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { OrdersTable } from './orders-table'

// Filters live in the URL, so a reload, the back button and a shared link keep them.
const route = getRouteApi('/pedidos')

export function OrdersScreen() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // The key is [operationId, input]. The input object is the whole filter.
  const input = { search: search.q }
  const orders = useQuery({ queryKey: ['listOrders', input], queryFn: () => api.listOrders(input) })

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Pedidos</h1>
      <Input
        placeholder="Buscar pedido"
        defaultValue={search.q ?? ''}
        onChange={(event) => navigate({ search: { q: event.target.value || undefined }, replace: true })}
        className="max-w-sm"
      />
      {orders.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : orders.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os pedidos</AlertTitle>
          <AlertDescription>{errorMessage(orders.error)}</AlertDescription>
        </Alert>
      ) : orders.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
            <EmptyDescription>Ajuste a busca ou crie o primeiro pedido.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <OrdersTable orders={orders.data} />
      )}
    </section>
  )
}
