import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { VisitsTable } from './visits-table'

// Filters live in the URL, so a reload, the back button and a shared link keep them.
const route = getRouteApi('/visitas')

export function VisitsScreen() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // The key is [operationId, input]. The input object is the whole filter.
  const input = { search: search.q }
  const visits = useQuery({ queryKey: ['listVisits', input], queryFn: () => api.listVisits(input) })

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Visitas</h1>
      <Input
        placeholder="Buscar visita"
        defaultValue={search.q ?? ''}
        onChange={(event) => navigate({ search: { q: event.target.value || undefined }, replace: true })}
        className="max-w-sm"
      />
      {visits.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : visits.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as visitas</AlertTitle>
          <AlertDescription>{errorMessage(visits.error)}</AlertDescription>
        </Alert>
      ) : visits.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma visita encontrada</EmptyTitle>
            <EmptyDescription>Ajuste a busca ou crie a primeira visita.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <VisitsTable visits={visits.data} />
      )}
    </section>
  )
}
