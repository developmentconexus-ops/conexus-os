import { createRootRoute, createRoute, createRouter, Link, Outlet, redirect, useMatchRoute } from '@tanstack/react-router'
import { ClipboardList, LayoutDashboard } from 'lucide-react'
import { z } from 'zod'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { NewTicketScreen } from '@/routes/new-ticket'
import { TicketScreen } from '@/routes/ticket'
import { TicketsScreen } from '@/routes/tickets'

const SECTIONS = [
  { to: '/chamados', label: 'Chamados', icon: ClipboardList },
  { to: '/painel', label: 'Painel', icon: LayoutDashboard },
] as const

function Shell() {
  const matchRoute = useMatchRoute()
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 text-sm font-semibold">Manutenção predial</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTIONS.map((section) => (
                  <SidebarMenuItem key={section.to}>
                    <SidebarMenuButton
                      render={<Link to={section.to} />}
                      isActive={Boolean(matchRoute({ to: section.to, fuzzy: true }))}
                    >
                      <section.icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="mx-auto w-full max-w-6xl p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

const rootRoute = createRootRoute({ component: Shell })

// The app opens on the screen that answers what the person came to do.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/chamados' })
  },
})

// Filters live in the URL, validated where the route is declared, so a reload and a shared link keep them.
const ticketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chamados',
  validateSearch: z.object({ status: z.enum(['open', 'in_progress', 'waiting', 'done']).optional(), q: z.string().optional() }),
  component: TicketsScreen,
})

const newTicketRoute = createRoute({ getParentRoute: () => rootRoute, path: '/chamados/novo', component: NewTicketScreen })

const ticketRoute = createRoute({ getParentRoute: () => rootRoute, path: '/chamados/$id', component: TicketScreen })

// A screen with charts loads its code on first visit, so the first screen never carries recharts.
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/painel' }).lazy(() =>
  import('@/routes/dashboard.lazy').then((module) => module.dashboardLazyRoute),
)

const routeTree = rootRoute.addChildren([indexRoute, ticketsRoute, newTicketRoute, ticketRoute, dashboardRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
