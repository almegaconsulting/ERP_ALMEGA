import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import DashboardCanvasClient from './components/DashboardCanvasClient'

type KpiConfig = {
  entity?: string
  link?: string
}

type FilterRule = {
  field?: string
  operator?: string
  value?: string | number | boolean
}

type ListConfig = {
  entity?: string
  limit?: number
  link?: string
  filters?: FilterRule[]
}

type DashboardWidgetRecord = {
  id: string
  title: string
  widget_type: string
  config_json: any
  position_x: number | null
  position_y: number | null
  width: number | null
  height: number | null
  sort_order: number | null
}

type RenderedWidget =
  | {
      id: string
      title: string
      widgetType: 'kpi'
      href: string
      value: number
    }
  | {
      id: string
      title: string
      widgetType: 'list'
      href: string
      items: {
        id: string
        name: string
        stage: string | null
        amount: number | null
        currency_code: string | null
        status: string | null
      }[]
    }

/* =========================
   UI
========================= */

function ModuleCard({
  title,
  description,
  href,
}: {
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition"
    >
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-gray-600">{description}</p>
    </Link>
  )
}

/* =========================
   HELPERS
========================= */

async function getKpiValue(entity?: string): Promise<number> {
  if (!entity) return 0

  const { count } = await supabase
    .from(entity)
    .select('*', { count: 'exact', head: true })

  return count ?? 0
}

function applyFilters(query: any, filters?: FilterRule[]) {
  let q = query

  for (const f of filters ?? []) {
    if (!f.field || !f.operator) continue

    const allowedFields = ['status', 'stage']
    if (!allowedFields.includes(f.field)) continue

    if (f.operator === 'eq') {
      q = q.eq(f.field, f.value)
    }
  }

  return q
}

async function getList(entity: string, config: ListConfig) {
  let query = supabase
    .from(entity)
    .select('id, name, stage, amount, currency_code, status')
    .order('created_at', { ascending: false })

  query = applyFilters(query, config.filters)

  const { data } = await query.limit(config.limit ?? 5)
  return data ?? []
}

async function resolveDashboard() {
  const { data } = await supabase
    .from('dashboard_definitions')
    .select('*')
    .eq('code', 'sales_manager_dashboard')
    .maybeSingle()

  if (data) return data

  const { data: fallback } = await supabase
    .from('dashboard_definitions')
    .select('*')
    .eq('code', 'main_dashboard')
    .maybeSingle()

  return fallback ?? null
}

/* =========================
   PAGE
========================= */

export default async function HomePage() {
  const dashboard = await resolveDashboard()

  const { data: widgets } = dashboard
    ? await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('dashboard_definition_id', dashboard.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
    : { data: [] }

  const renderedWidgets: RenderedWidget[] = await Promise.all(
    (widgets ?? []).map(async (w: DashboardWidgetRecord) => {
      const config = w.config_json || {}

      if (w.widget_type === 'kpi') {
        const kpiConfig = config as KpiConfig

        return {
          id: w.id,
          title: w.title,
          widgetType: 'kpi' as const,
          href: kpiConfig.link || '/',
          value: await getKpiValue(kpiConfig.entity),
        }
      }

      if (w.widget_type === 'list') {
        const listConfig = config as ListConfig

        return {
          id: w.id,
          title: w.title,
          widgetType: 'list' as const,
          href: listConfig.link || '/',
          items: await getList(listConfig.entity || 'opportunities', listConfig),
        }
      }

      return null
    })
  ).then((res) => res.filter(Boolean) as RenderedWidget[])

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-3">ERP Almega</h1>
        <p className="text-gray-700 text-lg">
          Frontend connected to Supabase and ready to grow module by module.
        </p>

        {dashboard && (
          <p className="text-sm text-gray-500 mt-2">
            Active dashboard: {dashboard.name}
          </p>
        )}
      </div>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Overview</h2>

        {renderedWidgets.length === 0 ? (
          <p className="text-gray-600">No widgets configured.</p>
        ) : (
          <DashboardCanvasClient widgets={renderedWidgets} />
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Modules</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ModuleCard
            title="Accounts"
            description="Manage accounts"
            href="/accounts"
          />
          <ModuleCard
            title="Contacts"
            description="Manage contacts"
            href="/contacts"
          />
          <ModuleCard
            title="Opportunities"
            description="Pipeline"
            href="/opportunities"
          />
          <ModuleCard
            title="Projects"
            description="Projects"
            href="/projects"
          />
        </div>
      </section>
    </main>
  )
}