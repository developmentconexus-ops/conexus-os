---
name: conexus-app-code
description: Use before building or changing the code of an app's screens. Covers the folder structure, routes in router.tsx, data through api.<operation> with TanStack Query, loading and error states, forms, TanStack Table v9, pt-BR formatting and lazy routes.
---

# Building app screens in code

Look at `conexus-app-ui` for how screens should look. This skill is how the code is put together. Every file in `references/` is a small, type-checked example. Read the one you need and copy its shape.

## Structure

```
app/src/
  main.tsx            providers, and lib/zod.ts loaded first. Leave both.
  router.tsx          every route of the app
  routes/             one file per screen
  components/ui/      the kit. Do not edit.
  components/         your components shared by two or more screens
  lib/                utils.ts, zod.ts (zod without eval, leave it), format.ts, errors.ts
                      (the formatters and error messages; use and extend them)
  conexus/api.gen.ts  generated on every check. Never edit or write it.
  styles.css          the design tokens
```

## Routes

- All routes are code routes in `router.tsx` (`references/router.tsx`). To add a screen, write its component in `routes/`, add a `createRoute` with a `path`, and add it to `addChildren`. Paths use the person's word in Portuguese, such as `/visitas`.
- Link with `Link` from `@tanstack/react-router`, never a plain `<a href>`. A path that does not exist fails the type check. A route with a parameter has a path like `/visitas/$id` and reads it with `getRouteApi('/visitas/$id').useParams()`.
- Filters, search text, sort and the selected tab belong in search params, so a reload and a shared link keep them. Validate them where the route is declared with `validateSearch: z.object({ ... })`, and read them with `getRouteApi('/visitas').useSearch()` (`references/visits-screen.tsx`).
- Screens with charts load lazily: `createRoute({ ... }).lazy(() => import('./routes/tickets.lazy').then((m) => m.ticketsLazyRoute))`, with the component in a file that exports `createLazyRoute('/chamados')({ component })`. `conexus-app-ui/references/tickets-chart.tsx` shows the file. The home route and the shell never import `recharts`.
- Opening any path directly, such as `/visitas`, serves the app. There is no server routing to configure.

## Data

- Call the server only through `api` from `@/conexus/api.gen`. It is generated from `conexus/manifest.json`, so a wrong field name or a missing field fails the type check. It exports `api.<operation>(input)`, `schemas.<operation>.input` and `.output`, the types `Input<'op'>` and `Output<'op'>`, and `ConexusError`.
- Read with `useQuery`. The key is `[operationId, input]` and the input object is the whole cache identity:

  ```ts
  const input = { search: search.q }
  const visits = useQuery({ queryKey: ['listVisits', input], queryFn: () => api.listVisits(input) })
  ```

- Write with `useMutation({ mutationFn: api.createTicket })`. On success, invalidate every read the write changes by its operation id: `queryClient.invalidateQueries({ queryKey: ['ticketsByWeek'] })`. That covers every filter already cached. Do not copy server data into `useState`.
- Every screen that reads data shows four cases (`references/visits-screen.tsx`): loading (`Skeleton`), error (`Alert` with `errorMessage(error)`), empty (`Empty` that invites an action) and data. Tell "no rows exist" from "no row matches the filter" in the empty text.
- `errorMessage(error)` from `lib/errors.ts` turns a thrown `ConexusError` into a plain Portuguese sentence. `connectionMessage(data.failure)` does the same for a failed Conexão read that the handler returned (`conexus-server`, Failures), shown in the same `Alert`. Never show a code, the `detail` or a stack to the person.

## Forms

`references/ticket-form.tsx` is the whole pattern.

- `useForm` with `resolver: zodResolver(schemas.<op>.input)`, so the browser checks the same limits the runner enforces. Type it with `Input<'op'>`.
- Each input is a shadcn `Field` with `FieldLabel`, the input registered with `form.register('name')`, and `FieldError` fed by `form.formState.errors.name`. A number input registers with `{ valueAsNumber: true }`. A `Select` or a checkbox goes through `Controller`.
- Submit with `form.handleSubmit((values) => mutation.mutate(values))`. Disable the button while `mutation.isPending`. Show `errorMessage(mutation.error)` when it fails. The label names the action, "Salvar chamado".
- After success, invalidate the reads, confirm with `toast.add({ title: 'Chamado salvo', type: 'success' })` and close or reset the form.
- Never add an author or a person's name to an input. The server reads the person from `caller`.

## Tables

Models know TanStack Table v8. The installed version is v9, and the v8 constructor fails the type check. `references/visits-table.tsx` is a complete v9 table with sorting and a text filter. What differs from v8:

- `useTable`, not `useReactTable`, and no `getCoreRowModel`.
- `tableFeatures({ ... })` declares what the table uses. Sorting, filtering and pagination do nothing until their feature is registered there: `rowSortingFeature`, `columnFilteringFeature`, `rowPaginationFeature`. Each row model is a slot of the same object, for example `sortedRowModel: createSortedRowModel()`, with `sortFns` and `filterFns` beside it.
- `createColumnHelper<typeof features, Row>()`, then `helper.columns([helper.accessor('field', { header, cell }), ...])`. Use `helper.display({ id })` for a column that is not a field, such as an actions menu.
- Render headers and cells with `<table.FlexRender header={header} />` and `<table.FlexRender cell={cell} />`. There is no `flexRender` import.
- Keep `features`, `columns` and any empty fallback at module scope. A fresh `[]` or column array on every render rebuilds the table on each render.
- Sort and filter state works uncontrolled. To control it, pass `state` and `onSortingChange` or `onColumnFiltersChange`. Pagination adds `rowPaginationFeature`, `paginatedRowModel: createPaginatedRowModel()`, and `table.nextPage()` and `table.previousPage()`.
- For the HTML elements use the `Table` components from `@/components/ui/table`, as the example does.

## pt-BR formatting

- `lib/format.ts` prints money (`R$ 1.234,56`), numbers, percentages and ISO dates (`dd/MM/yyyy`) for pt-BR, from a number or from decimal text. Use it instead of `toLocaleString` or a new `Intl` call.
- `calendar.tsx` takes `locale={ptBR}` from `date-fns/locale`. A native `type="date"` input gives `yyyy-mm-dd`, which is what the operation should receive as a string.

## References

- `references/router.tsx`: root route with navigation, a route with validated search params, a lazy route.
- `references/visits-screen.tsx`: a list screen with search params, a query and its four states.
- `references/visits-table.tsx`: the TanStack Table v9 worked example.
- `references/ticket-form.tsx`: a form with `zodResolver`, `Field`, a mutation and invalidation.
