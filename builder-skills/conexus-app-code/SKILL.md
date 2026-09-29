---
name: conexus-app-code
description: Use before building or changing the code of an app's screens. Covers the folder structure, routes in router.tsx, data through api.<operation> with TanStack Query, loading and error states, forms, TanStack Table v9, pt-BR formatting, lazy routes and the final check.
---

# Building app screens in code

The packages are fixed and the platform generates the client for the server operations. Look at `conexus-app-ui` for how screens should look. This skill is how the code is put together. Every file in `references/` is a small, type-checked example. Read the one you need and copy its shape.

## Structure

```
app/src/
  main.tsx            providers, and lib/zod.ts loaded first. Leave both.
  router.tsx          every route of the app
  routes/             one file per screen
  components/ui/      the kit. Do not edit.
  components/         your components shared by two or more screens
  lib/                utils.ts, zod.ts (zod without eval, leave it), format.ts, errors.ts
  conexus/api.gen.ts  generated on every check. Never edit or write it.
  styles.css          the design tokens
```

Start `lib/format.ts` and `lib/errors.ts` from `references/format.ts` and `references/errors.ts` when the first date, amount or error message appears.

## Routes

- All routes are code routes in `router.tsx` (`references/router.tsx`). To add a screen, write its component in `routes/`, add a `createRoute` with a `path`, and add it to `addChildren`. Paths use the person's word in Portuguese, such as `/pedidos`.
- Link with `Link` from `@tanstack/react-router`, never a plain `<a href>`. A path that does not exist fails the type check. A route with a parameter has a path like `/pedidos/$id` and reads it with `getRouteApi('/pedidos/$id').useParams()`.
- Filters, search text, sort and the selected tab belong in search params, so a reload and a shared link keep them. Validate them where the route is declared with `validateSearch: z.object({ ... })`, and read them with `getRouteApi('/pedidos').useSearch()` (`references/orders-screen.tsx`).
- Screens with charts load lazily: `createRoute({ ... }).lazy(() => import('./routes/sales.lazy').then((m) => m.salesLazyRoute))`, with the component in a file that exports `createLazyRoute('/vendas')({ component })`. `conexus-app-ui/references/sales-chart.tsx` shows the file. The home route and the shell never import `recharts`.
- Opening any path directly, such as `/pedidos`, serves the app. There is no server routing to configure.

## Data

- Call the server only through `api` from `@/conexus/api.gen`. It is generated from `conexus/manifest.json`, so a wrong field name or a missing field fails the type check. It exports `api.<operation>(input)`, `schemas.<operation>.input` and `.output`, the types `Input<'op'>` and `Output<'op'>`, and `ConexusError`. Never call an operation with `fetch`.
- Read with `useQuery`. The key is `[operationId, input]` and the input object is the whole cache identity:

  ```ts
  const input = { search: search.q }
  const orders = useQuery({ queryKey: ['listOrders', input], queryFn: () => api.listOrders(input) })
  ```

- Write with `useMutation({ mutationFn: api.createOrder })`. On success, invalidate every read the write changes by its operation id: `queryClient.invalidateQueries({ queryKey: ['listOrders'] })`. That covers every filter already cached. Do not copy server data into `useState`.
- Every screen that reads data shows four cases (`references/orders-screen.tsx`): loading (`Skeleton`), error (`Alert` with `errorMessage(error)`), empty (`Empty` that invites an action) and data. Tell "no rows exist" from "no row matches the filter" in the empty text.
- `errorMessage` turns a `ConexusError.code` into a plain Portuguese sentence. Never show the code, the `detail` or a stack to the person.
- The check opens the app once with every operation answering empty. A screen must render when a list is empty and when a call fails.
- Postgres `bigint` and `numeric` arrive as strings, so alias them in the handler's SQL (`total::float8 AS total`) to match an output schema that says `number`.

## Forms

`references/order-form.tsx` is the whole pattern.

- `useForm` with `resolver: zodResolver(schemas.<op>.input)`, so the browser checks the same limits the runner enforces. Type it with `Input<'op'>`.
- Each input is a shadcn `Field` with `FieldLabel`, the input registered with `form.register('name')`, and `FieldError` fed by `form.formState.errors.name`. A number input registers with `{ valueAsNumber: true }`. A `Select` or a checkbox goes through `Controller`.
- Submit with `form.handleSubmit((values) => mutation.mutate(values))`. Disable the button while `mutation.isPending`. Show `errorMessage(mutation.error)` when it fails. The label names the action, "Salvar pedido".
- After success, invalidate the reads, confirm with `toast.add({ title: 'Pedido salvo', type: 'success' })` and close or reset the form.
- Never add an author or a person's name to an input. The server reads the person from `caller`.

## Tables

Models know TanStack Table v8. The installed version is v9, and the v8 constructor fails the type check. `references/orders-table.tsx` is a complete v9 table with sorting and a text filter. What differs from v8:

- `useTable`, not `useReactTable`, and no `getCoreRowModel`.
- `tableFeatures({ ... })` declares what the table uses. Sorting, filtering and pagination do nothing until their feature is registered there: `rowSortingFeature`, `columnFilteringFeature`, `rowPaginationFeature`. Each row model is a slot of the same object, for example `sortedRowModel: createSortedRowModel()`, with `sortFns` and `filterFns` beside it.
- `createColumnHelper<typeof features, Row>()`, then `helper.columns([helper.accessor('field', { header, cell }), ...])`. Use `helper.display({ id })` for a column that is not a field, such as an actions menu.
- Render headers and cells with `<table.FlexRender header={header} />` and `<table.FlexRender cell={cell} />`. There is no `flexRender` import.
- Keep `features`, `columns` and any empty fallback at module scope. A fresh `[]` or column array on every render rebuilds the table on each render.
- Sort and filter state works uncontrolled. To control it, pass `state` and `onSortingChange` or `onColumnFiltersChange`. Pagination adds `rowPaginationFeature`, `paginatedRowModel: createPaginatedRowModel()`, and `table.nextPage()` and `table.previousPage()`.
- For markup use the `Table` components from `@/components/ui/table`, as the example does.

## pt-BR formatting

`references/format.ts` holds the formatters. Use them instead of ad hoc calls.

- Money is `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, which prints `R$ 1.234,56`. Numbers and percentages use the same locale.
- A date from a handler is an ISO string. Format it with `date-fns` and the `ptBR` locale from `date-fns/locale`, as `dd/MM/yyyy`. Never call `toLocaleDateString()` without a locale.
- `calendar.tsx` takes `locale={ptBR}`. A native `type="date"` input gives `yyyy-mm-dd`, which is what the operation should receive as a string.

## Finish with the check

After your last edit, call `conexus_check`, fix every problem it names, and call it again until it passes. Then report what it did as facts and counts, for example "o app compilou e abriu; 3 operações e 1 migração". The check does not run your handlers or click through the app, so never say the app or its operations were "validados" or "testados".

## References

- `references/router.tsx`: root route with navigation, a route with validated search params, a lazy route.
- `references/orders-screen.tsx`: a list screen with search params, a query and its four states.
- `references/orders-table.tsx`: the TanStack Table v9 worked example.
- `references/order-form.tsx`: a form with `zodResolver`, `Field`, a mutation and invalidation.
- `references/errors.ts`, `references/format.ts`: the message and formatting helpers for `lib/`.
