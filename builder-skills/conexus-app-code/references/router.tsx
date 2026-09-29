import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { z } from 'zod'
import { VisitsScreen } from './routes/visits-screen'

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex min-h-svh">
      <nav className="flex w-56 flex-col gap-1 border-r p-3">
        <Link to="/visitas" className="rounded-md px-3 py-2 text-sm [&.active]:bg-accent">
          Visitas
        </Link>
        <Link to="/chamados" className="rounded-md px-3 py-2 text-sm [&.active]:bg-accent">
          Chamados
        </Link>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ),
})

const visitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/visitas',
  // A search param is validated where the route is declared, so screens read a typed value.
  validateSearch: z.object({ q: z.string().optional() }),
  component: VisitsScreen,
})

// The chart route loads its code on first visit. Its component lives in routes/tickets.lazy.tsx.
const ticketsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/chamados' }).lazy(() =>
  import('./routes/tickets.lazy').then((module) => module.ticketsLazyRoute),
)

const routeTree = rootRoute.addChildren([visitsRoute, ticketsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
