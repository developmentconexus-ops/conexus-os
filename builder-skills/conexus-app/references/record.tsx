import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { statusLabel, TICKET_STATUSES, TicketStatusBadge } from '@/components/ticket-status'
import { api, type Input as ApiInput, type Output, schemas } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'

type Ticket = NonNullable<Output<'getTicket'>['ticket']>

const route = getRouteApi('/chamados/$id')

export function TicketScreen() {
  const { id } = route.useParams()
  const input = { id: Number(id) }
  const ticket = useQuery({ queryKey: ['getTicket', input], queryFn: () => api.getTicket(input) })

  return (
    <section className="space-y-6">
      <Link to="/chamados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Chamados
      </Link>
      {ticket.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : ticket.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o chamado</AlertTitle>
          <AlertDescription>{errorMessage(ticket.error)}</AlertDescription>
        </Alert>
      ) : ticket.data.ticket === undefined ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chamado não encontrado</EmptyTitle>
            <EmptyDescription>Ele pode ter sido removido, ou o link está incompleto.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/chamados" />}>Ver todos os chamados</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <TicketRecord ticket={ticket.data.ticket} />
      )}
    </section>
  )
}

function TicketRecord({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Aberto por {ticket.requesterName} em {formatDate(ticket.openedAt)}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <p className="whitespace-pre-line">{ticket.description}</p>
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {/* The server returns the history newest first, so the latest change is on top. */}
              <ol className="space-y-4">
                {ticket.history.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3">
                    <p className="text-sm">
                      <span className="font-medium">{entry.byName}</span> mudou para {statusLabel(entry.status)}
                    </p>
                    {entry.note ? <p className="text-sm">{entry.note}</p> : null}
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
        <ChangeStatus ticket={ticket} />
      </div>
    </>
  )
}

const STATUS_ITEMS = TICKET_STATUSES.map(({ value, label }) => ({ value, label }))

function ChangeStatus({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient()
  const form = useForm<ApiInput<'changeTicketStatus'>>({
    resolver: zodResolver(schemas.changeTicketStatus.input),
    defaultValues: { id: ticket.id, status: ticket.status, note: '' },
  })

  const change = useMutation({
    mutationFn: api.changeTicketStatus,
    onSuccess: async () => {
      // The record, the list and its counts all show the status, whatever input they were loaded with.
      await Promise.all(['getTicket', 'listTickets', 'countTickets'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      toast.add({ title: 'Situação atualizada', type: 'success' })
      form.reset({ id: ticket.id, status: form.getValues('status'), note: '' })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mudar situação</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((values) => change.mutate(values))} noValidate>
          <FieldGroup>
            <Controller
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Situação</FieldLabel>
                  <Select items={STATUS_ITEMS} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field data-invalid={Boolean(form.formState.errors.note)}>
              <FieldLabel htmlFor="note">O que aconteceu</FieldLabel>
              <Textarea id="note" rows={3} aria-invalid={Boolean(form.formState.errors.note)} {...form.register('note')} />
              <FieldError errors={[form.formState.errors.note]} />
            </Field>
            {change.isError ? <FieldError>{errorMessage(change.error)}</FieldError> : null}
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Salvando situação' : 'Salvar situação'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
