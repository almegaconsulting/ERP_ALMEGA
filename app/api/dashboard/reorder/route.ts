import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// =====================================================
// API: /api/dashboard/reorder
//
// Qué hace:
// - recibe una lista ordenada de IDs de widgets
// - actualiza sort_order en la base de datos
//
// Qué NO hace todavía:
// - no valida permisos de usuario
// - no recalcula position_x / position_y
// =====================================================

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orderedIds } = body

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: 'Invalid payload: orderedIds must be an array.' },
        { status: 400 }
      )
    }

    // Actualizar el sort_order según la nueva posición.
    for (let index = 0; index < orderedIds.length; index++) {
      const widgetId = orderedIds[index]

      const { error } = await supabase
        .from('dashboard_widgets')
        .update({ sort_order: index + 1 })
        .eq('id', widgetId)

      if (error) {
        return NextResponse.json(
          { error: `Failed updating widget ${widgetId}: ${error.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Unexpected server error.' },
      { status: 500 }
    )
  }
}