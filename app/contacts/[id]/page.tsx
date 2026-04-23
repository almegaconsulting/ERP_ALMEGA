// =====================================================
// PÁGINA: /contacts/[id]
//
// Qué hace:
// - muestra el detalle de un contacto
// - muestra su cuenta asociada
// - muestra oportunidades donde es contacto principal
//
// Esto amplía el drilldown:
// Contacts -> Contact detail
// Opportunity detail -> Contact detail
// =====================================================

import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // -----------------------------------------------------
  // 1) Leer contacto
  // -----------------------------------------------------
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (contactError || !contact) {
    return (
      <main>
        <h1 className="text-3xl font-bold mb-4">Contact detail</h1>
        <p className="text-red-600">Error loading contact detail.</p>
      </main>
    )
  }

  // -----------------------------------------------------
  // 2) Leer cuenta asociada
  // -----------------------------------------------------
  const { data: account } = contact.account_id
    ? await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', contact.account_id)
        .single()
    : { data: null }

  // -----------------------------------------------------
  // 3) Leer oportunidades donde es contacto principal
  // -----------------------------------------------------
  const { data: opportunities, error: opportunitiesError } = await supabase
    .from('opportunities')
    .select('id, name, stage, amount, currency_code, probability, status')
    .eq('primary_contact_id', id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <div className="mb-6">
        <Link href="/contacts" className="text-blue-600 hover:underline">
          ← Back to Contacts
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">
        {contact.first_name} {contact.last_name}
      </h1>

      {/* DATOS BÁSICOS */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Contact information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <strong>Job title:</strong> {contact.job_title ?? '-'}
          </div>
          <div>
            <strong>Status:</strong> {contact.status}
          </div>
          <div>
            <strong>Email:</strong> {contact.email ?? '-'}
          </div>
          <div>
            <strong>Phone:</strong> {contact.phone ?? '-'}
          </div>
          <div>
            <strong>Mobile:</strong> {contact.mobile ?? '-'}
          </div>
          <div>
            <strong>LinkedIn:</strong> {contact.linkedin_url ?? '-'}
          </div>
        </div>
      </section>

      {/* CUENTA */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Account</h2>

        {account ? (
          <Link
            href={`/accounts/${account.id}`}
            className="text-blue-600 hover:underline"
          >
            {account.name}
          </Link>
        ) : (
          <p className="text-gray-600">No account associated.</p>
        )}
      </section>

      {/* OPORTUNIDADES */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Primary contact in opportunities</h2>

        {opportunitiesError ? (
          <p className="text-red-600">Error loading opportunities.</p>
        ) : !opportunities || opportunities.length === 0 ? (
          <p className="text-gray-600">No opportunities found for this contact.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Opportunity</th>
                  <th className="text-left p-3 text-sm font-semibold">Stage</th>
                  <th className="text-left p-3 text-sm font-semibold">Amount</th>
                  <th className="text-left p-3 text-sm font-semibold">Probability</th>
                  <th className="text-left p-3 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opportunity) => (
                  <tr key={opportunity.id} className="border-t border-gray-200">
                    <td className="p-3">
                      <Link
                        href={`/opportunities/${opportunity.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {opportunity.name}
                      </Link>
                    </td>
                    <td className="p-3">{opportunity.stage}</td>
                    <td className="p-3">
                      {opportunity.amount ?? '-'} {opportunity.currency_code ?? ''}
                    </td>
                    <td className="p-3">{opportunity.probability ?? '-'}%</td>
                    <td className="p-3">{opportunity.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}