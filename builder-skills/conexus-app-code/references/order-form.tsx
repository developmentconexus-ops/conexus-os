import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { api, type Input as ApiInput, schemas } from '@/conexus/api.gen'
import { errorMessage } from '@/lib/errors'

export function OrderForm({ onSaved }: { onSaved: () => void }) {
  const queryClient = useQueryClient()
  // The browser checks the same bounds the runner enforces, so a rejected value never leaves the form.
  const form = useForm<ApiInput<'createOrder'>>({
    resolver: zodResolver(schemas.createOrder.input),
    defaultValues: { customer: '', total: 0 },
  })

  const save = useMutation({
    mutationFn: api.createOrder,
    onSuccess: async () => {
      // Every cached list of orders is stale now, whatever filter it was loaded with.
      await queryClient.invalidateQueries({ queryKey: ['listOrders'] })
      toast.add({ title: 'Pedido salvo', type: 'success' })
      onSaved()
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.customer)}>
          <FieldLabel htmlFor="customer">Cliente</FieldLabel>
          <Input id="customer" aria-invalid={Boolean(form.formState.errors.customer)} {...form.register('customer')} />
          <FieldError errors={[form.formState.errors.customer]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.total)}>
          <FieldLabel htmlFor="total">Total em reais</FieldLabel>
          <Input
            id="total"
            type="number"
            step="0.01"
            aria-invalid={Boolean(form.formState.errors.total)}
            {...form.register('total', { valueAsNumber: true })}
          />
          <FieldError errors={[form.formState.errors.total]} />
        </Field>
        {save.isError ? <FieldError>{errorMessage(save.error)}</FieldError> : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando pedido' : 'Salvar pedido'}
        </Button>
      </FieldGroup>
    </form>
  )
}
