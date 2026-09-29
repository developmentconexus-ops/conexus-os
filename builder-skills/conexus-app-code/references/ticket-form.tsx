import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { api, type Input as ApiInput, schemas } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'

export function TicketForm({ onSaved }: { onSaved: () => void }) {
  const queryClient = useQueryClient()
  // The browser checks the same bounds the runner enforces, so a rejected value never leaves the form.
  const form = useForm<ApiInput<'createTicket'>>({
    resolver: zodResolver(schemas.createTicket.input),
    defaultValues: { subject: '', affectedUsers: 1 },
  })

  const save = useMutation({
    mutationFn: api.createTicket,
    onSuccess: async () => {
      // Every cached count of tickets is stale now, whatever input it was loaded with.
      await queryClient.invalidateQueries({ queryKey: ['ticketsByWeek'] })
      toast.add({ title: 'Chamado salvo', type: 'success' })
      onSaved()
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.subject)}>
          <FieldLabel htmlFor="subject">Assunto</FieldLabel>
          <Input id="subject" aria-invalid={Boolean(form.formState.errors.subject)} {...form.register('subject')} />
          <FieldError errors={[form.formState.errors.subject]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.affectedUsers)}>
          <FieldLabel htmlFor="affectedUsers">Pessoas afetadas</FieldLabel>
          <Input
            id="affectedUsers"
            type="number"
            step="1"
            aria-invalid={Boolean(form.formState.errors.affectedUsers)}
            {...form.register('affectedUsers', { valueAsNumber: true })}
          />
          <FieldError errors={[form.formState.errors.affectedUsers]} />
        </Field>
        {save.isError ? <FieldError>{errorMessage(save.error)}</FieldError> : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando chamado' : 'Salvar chamado'}
        </Button>
      </FieldGroup>
    </form>
  )
}
