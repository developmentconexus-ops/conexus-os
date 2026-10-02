import { Badge } from '@/components/ui/badge'
import type { Output } from '@/conexus/api.gen'

export type TicketStatus = Output<'listTickets'>[number]['status']

// One owner for the statuses: their order, the words the person reads, and how each one looks.
// The values come from the manifest's enum, so a status the server does not know fails the type check.
export const TICKET_STATUSES = [
  { value: 'open', label: 'Aberto', variant: 'outline' },
  { value: 'in_progress', label: 'Em andamento', variant: 'secondary' },
  { value: 'waiting', label: 'Aguardando peça', variant: 'default' },
  { value: 'done', label: 'Resolvido', variant: 'ghost' },
] as const satisfies ReadonlyArray<{ value: TicketStatus; label: string; variant: 'default' | 'outline' | 'secondary' | 'ghost' }>

export const statusLabel = (status: TicketStatus) => TICKET_STATUSES.find((item) => item.value === status)?.label ?? status

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const item = TICKET_STATUSES.find((entry) => entry.value === status)
  return <Badge variant={item?.variant ?? 'outline'}>{item?.label ?? status}</Badge>
}
