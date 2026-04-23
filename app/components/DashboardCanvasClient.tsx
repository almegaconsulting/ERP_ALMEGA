'use client'

import { useEffect, useState } from 'react'
import DashboardCanvas from './DashboardCanvas'

type DashboardWidget =
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

// =====================================================
// COMPONENTE: DashboardCanvasClient
//
// Qué hace:
// - evita problemas de hydration con dnd-kit
// - solo renderiza DashboardCanvas cuando ya está montado en cliente
// =====================================================

export default function DashboardCanvasClient({
  widgets,
}: {
  widgets: DashboardWidget[]
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  return <DashboardCanvas widgets={widgets} />
}