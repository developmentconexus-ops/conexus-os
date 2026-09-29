import {
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  filterFn_includesString,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Output } from '@/conexus/api.gen'
import { formatDate, formatNumber } from '@/lib/format'

type Visit = Output<'listVisits'>[number]

// v9: a table declares the features it uses. Sorting and filtering do nothing until registered here,
// and each row model is a slot of the same object. Keep this at module scope.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { text: sortFn_text, alphanumeric: sortFn_alphanumeric },
  filterFns: { includesString: filterFn_includesString },
})

const column = createColumnHelper<typeof features, Visit>()

const columns = column.columns([
  column.accessor('customer', {
    header: ({ column: c }) => (
      <Button variant="ghost" onClick={() => c.toggleSorting(c.getIsSorted() === 'asc')}>
        Cliente
        <ArrowUpDown />
      </Button>
    ),
  }),
  column.accessor('status', { header: 'Situação' }),
  column.accessor('minutes', {
    header: () => <div className="text-right">Minutos</div>,
    cell: (info) => <div className="text-right tabular-nums">{formatNumber(info.getValue())}</div>,
  }),
  column.accessor('scheduledAt', { header: 'Agendada para', cell: (info) => formatDate(info.getValue()) }),
])

// A fresh [] on every render would rebuild the row models each time.
const NO_VISITS: Visit[] = []

export function VisitsTable({ visits }: { visits: Visit[] | undefined }) {
  const table = useTable({ features, columns, data: visits ?? NO_VISITS })

  return (
    <div className="space-y-3">
      <Input
        placeholder="Filtrar por cliente"
        value={(table.getColumn('customer')?.getFilterValue() as string | undefined) ?? ''}
        onChange={(event) => table.getColumn('customer')?.setFilterValue(event.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Nenhuma visita com esse filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
