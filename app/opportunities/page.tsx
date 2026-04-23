// =====================================================
// PÁGINA: /opportunities
//
// Qué hace esta página:
// - consulta la tabla opportunities en Supabase
// - trae también la cuenta asociada
// - resuelve manualmente el contacto principal
// - muestra las oportunidades en una tabla
//
// Por qué lo hacemos así:
// - la tabla opportunities tiene más de una relación posible
//   con contacts
// - por eso evitamos la ambigüedad y controlamos nosotros
//   qué contacto queremos mostrar
// =====================================================

import { supabase } from '@/lib/supabaseClient'

/**
 * Página de listado de oportunidades.
 *
 * Qué muestra:
 * - nombre de oportunidad
 * - cuenta asociada
 * - contacto principal
 * - fase
 * - importe
 * - probabilidad
 * - estado
 *
 * Objetivo actual:
 * - mostrar el pipeline en formato tabla
 * - evitar ambigüedad entre relaciones con contacts
 */
export default async function OpportunitiesPage() {
  // -----------------------------------------------------
  // 1) Leer oportunidades con cuenta asociada
  // -----------------------------------------------------
  const { data: opportunities, error } = await supabase
    .from('opportunities')
    .select(`
      id,
      name,
      stage,
      amount,
      currency_code,
      probability,
      status,
      primary_contact_id,
      accounts (
        name
      )
    `)
    .order('created_at', { ascending: false })

  // Si hay error, lo mostramos
  if (error) {
    return (
      <main>
        <h1 className="text-3xl font-bold mb-6">Opportunities</h1>
        <p className="text-red-600">Error loading opportunities: {error.message}</p>
      </main>
    )
  }

  // -----------------------------------------------------
  // 2) Obtener los IDs de contactos principales
  // -----------------------------------------------------
  const primaryContactIds =
    opportunities
      ?.map((opportunity) => opportunity.primary_contact_id)
      .filter((id): id is string => Boolean(id)) ?? []

  // -----------------------------------------------------
  // 3) Leer esos contactos en una sola consulta
  // -----------------------------------------------------
  const { data: contacts } =
    primaryContactIds.length > 0
      ? await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', primaryContactIds)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] }

  // -----------------------------------------------------
  // 4) Crear un mapa para encontrar rápido el contacto
  // -----------------------------------------------------
  const contactsMap = new Map(
    (contacts ?? []).map((contact) => [contact.id, contact])
  )

  return (
    <main>
      <h1 className="text-3xl font-bold mb-6">Opportunities</h1>

      {!opportunities || opportunities.length === 0 ? (
        <p className="text-gray-600">No opportunities found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">Opportunity</th>
                <th className="text-left p-3 text-sm font-semibold">Account</th>
                <th className="text-left p-3 text-sm font-semibold">Primary contact</th>
                <th className="text-left p-3 text-sm font-semibold">Stage</th>
                <th className="text-left p-3 text-sm font-semibold">Amount</th>
                <th className="text-left p-3 text-sm font-semibold">Probability</th>
                <th className="text-left p-3 text-sm font-semibold">Status</th>
              </tr>
            </thead>

            <tbody>
              {opportunities.map((opportunity) => {
                const primaryContact = opportunity.primary_contact_id
                  ? contactsMap.get(opportunity.primary_contact_id)
                  : null

                const accountName = Array.isArray(opportunity.accounts)
                  ? opportunity.accounts[0]?.name ?? '-'
                  : (opportunity.accounts as { name?: string } | null)?.name ?? '-'

                const primaryContactName = primaryContact
                  ? `${primaryContact.first_name ?? ''} ${primaryContact.last_name ?? ''}`.trim()
                  : '-'

                return (
                  <tr key={opportunity.id} className="border-t border-gray-200">
                    <td className="p-3">{opportunity.name}</td>
                    <td className="p-3">{accountName}</td>
                    <td className="p-3">{primaryContactName || '-'}</td>
                    <td className="p-3">{opportunity.stage}</td>
                    <td className="p-3">
                      {opportunity.amount ?? '-'} {opportunity.currency_code ?? ''}
                    </td>
                    <td className="p-3">
                      {opportunity.probability ?? '-'}%
                    </td>
                    <td className="p-3">{opportunity.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}