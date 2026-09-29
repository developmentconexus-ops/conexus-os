import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { Home } from '@/routes/home'

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  ),
})

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home })

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
