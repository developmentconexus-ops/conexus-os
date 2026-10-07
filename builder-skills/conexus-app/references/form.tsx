import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { api, type Input as ApiInput, schemas } from '@/conexus/api.gen'
import { failureText } from '@/conexus/failures.gen'

const PRIORITIES = [
  { value: 'low', label: 'Pode esperar' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Impede o trabalho' },
] as const satisfies ReadonlyArray<{ value: ApiInput<'createTicket'>['priority']; label: string }>

export function NewTicketScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // The browser checks the same limits the runner enforces, so a refused value never leaves the form.
  const form = useForm<ApiInput<'createTicket'>>({
    resolver: zodResolver(schemas.createTicket.input),
    defaultValues: { subject: '', description: '', priority: 'normal' },
  })

  const save = useMutation({
    mutationFn: api.createTicket,
    onSuccess: async ({ id }) => {
      await Promise.all(['listTickets', 'countTickets'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      toast.add({ title: 'Chamado aberto', type: 'success' })
      await navigate({ to: '/chamados/$id', params: { id: String(id) } })
    },
  })

  return (
    <section className="max-w-xl space-y-6">
      <Link to="/chamados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Chamados
      </Link>
      <h1 className="text-xl font-semibold">Abrir chamado</h1>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.subject)}>
            <FieldLabel htmlFor="subject">O que precisa de reparo</FieldLabel>
            <Input id="subject" aria-invalid={Boolean(form.formState.errors.subject)} {...form.register('subject')} />
            <FieldError errors={[form.formState.errors.subject]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.description)}>
            <FieldLabel htmlFor="description">Detalhes</FieldLabel>
            <Textarea id="description" rows={4} aria-invalid={Boolean(form.formState.errors.description)} {...form.register('description')} />
            <FieldDescription>Onde fica e desde quando acontece.</FieldDescription>
            <FieldError errors={[form.formState.errors.description]} />
          </Field>
          <Controller
            control={form.control}
            name="priority"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Urgência</FieldLabel>
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {PRIORITIES.map((priority) => (
                    <div key={priority.value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem id={`priority-${priority.value}`} value={priority.value} />
                      <label htmlFor={`priority-${priority.value}`}>{priority.label}</label>
                    </div>
                  ))}
                </RadioGroup>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          {save.isError ? <FieldError>{failureText(save.error)}</FieldError> : null}
          <Button type="submit" disabled={save.isPending} className="w-fit">
            {save.isPending ? 'Abrindo chamado' : 'Abrir chamado'}
          </Button>
        </FieldGroup>
      </form>
    </section>
  )
}
