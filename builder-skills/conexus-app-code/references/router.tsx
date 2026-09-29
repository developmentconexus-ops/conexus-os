import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { z } from 'zod'
import { OrdersScreen } from './routes/orders-screen'

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex min-h-svh">
      <nav className="flex w-56 flex-col gap-1 border-r p-3">
        <Link to="/pedidos" className="rounded-md px-3 py-2 text-sm [&.active]:bg-accent">
          Pedidos
        </Link>
        <Link to="/vendas" className="rounded-md px-3 py-2 text-sm [&.active]:bg-accent">
          Vendas
        </Link>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ),
})

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos',
  // A search param is validated where the route is declared, so screens read a typed value.
  validateSearch: z.object({ q: z.string().optional() }),
  component: OrdersScreen,
})

// The chart route loads its code on first visit. Its component lives in routes/sales.lazy.tsx.
const salesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/vendas' }).lazy(() =>
  import('./routes/sales.lazy').then((module) => module.salesLazyRoute),
)

const routeTree = rootRoute.addChildren([ordersRoute, salesRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
