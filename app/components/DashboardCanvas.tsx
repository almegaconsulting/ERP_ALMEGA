'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'

// =====================================================
// COMPONENTE: DashboardCanvas
//
// Qué hace:
// - recibe widgets ya preparados para renderizar
// - permite reordenarlos con drag & drop
// - guarda el nuevo orden en backend
//
// Qué NO hace todavía:
// - no persiste width / height
// - no usa position_x / position_y reales
// - no redimensiona widgets
// =====================================================

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

function KpiCard({
  title,
  value,
  href,
}: {
  title: string
  value: number
  href: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition block h-full"
    >
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <p className="text-3xl font-bold">{value}</p>
    </Link>
  )
}

function ListCard({
  title,
  href,
  items,
}: {
  title: string
  href: string
  items: {
    id: string
    name: string
    stage: string | null
    amount: number | null
    currency_code: string | null
    status: string | null
  }[]
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-blue-600 hover:underline text-sm"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-600">No items found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">Opportunity</th>
                <th className="text-left p-3 text-sm font-semibold">Stage</th>
                <th className="text-left p-3 text-sm font-semibold">Amount</th>
                <th className="text-left p-3 text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-200">
                  <td className="p-3">
                    <Link
                      href={`/opportunities/${item.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="p-3">{item.stage}</td>
                  <td className="p-3">
                    {item.amount ?? '-'} {item.currency_code ?? ''}
                  </td>
                  <td className="p-3">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortableWidget({ widget }: { widget: DashboardWidget }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const widthClass =
    widget.widgetType === 'kpi'
      ? 'xl:col-span-1'
      : 'xl:col-span-4'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${widthClass} ${isDragging ? 'opacity-70' : ''}`}
    >
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm active:cursor-grabbing"
        >
          Drag
        </button>
      </div>

      {widget.widgetType === 'kpi' ? (
        <KpiCard
          title={widget.title}
          value={widget.value}
          href={widget.href}
        />
      ) : (
        <ListCard
          title={widget.title}
          href={widget.href}
          items={widget.items}
        />
      )}
    </div>
  )
}

/**
 * Guarda el nuevo orden en backend.
 */
async function saveOrder(items: DashboardWidget[]) {
  try {
    const orderedIds = items.map((item) => item.id)

    await fetch('/api/dashboard/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })
  } catch (error) {
    console.error('Error saving order', error)
  }
}

export default function DashboardCanvas({
  widgets,
}: {
  widgets: DashboardWidget[]
}) {
  const [items, setItems] = useState(widgets)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const itemIds = useMemo(() => items.map((item) => item.id), [items])

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    const newItems = arrayMove(items, oldIndex, newIndex)

    setItems(newItems)
    await saveOrder(newItems)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          }}
        >
          {items.map((widget) => (
            <SortableWidget key={widget.id} widget={widget} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}