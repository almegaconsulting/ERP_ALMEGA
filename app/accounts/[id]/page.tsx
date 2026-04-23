// =====================================================
// PÁGINA: /accounts/[id]
//
// Qué hace esta página:
// - muestra el detalle de una cuenta concreta
// - muestra contactos relacionados
// - muestra oportunidades relacionadas
//
// Esto es el primer drilldown real dentro de la app:
// lista -> cuenta -> detalle relacionado
// =====================================================

import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

/**
 * Página de detalle de cuenta.
 *
 * Qué muestra:
 * - datos básicos de la cuenta
 * - contactos asociados
 * - oportunidades asociadas
 *
 * Objetivo actual:
 * - empezar el drilldown real en la aplicación
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // -----------------------------------------------------
  // 1) Leer la cuenta
  // -----------------------------------------------------
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single()

  // -----------------------------------------------------
  // 2) Leer contactos de esa cuenta
  // -----------------------------------------------------
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, job_title, email, status')
    .eq('account_id', id)
    .order('created_at', { ascending: false })

  // -----------------------------------------------------
  // 3) Leer oportunidades de esa cuenta
  // -----------------------------------------------------
  const { data: opportunities, error: opportunitiesError } = await supabase
    .from('opportunities')
    .select('id, name, stage, amount, currency_code, probability, status')
    .eq('account_id', id)
    .order('created_at', { ascending: false })

  if (accountError || !account) {
    return (
      <main>
        <h1 className="text-3xl font-bold mb-4">Account detail</h1>
        <p className="text-red-600">
          Error loading account detail.
        </p>
      </main>
    )
  }

  return (
    <main>
      <div className="mb-6">
        <Link href="/accounts" className="text-blue-600 hover:underline">
          ← Back to Accounts
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">{account.name}</h1>

      {/* DATOS BÁSICOS */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Account information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <strong>Type:</strong> {account.account_type}
          </div>
          <div>
            <strong>Industry:</strong> {account.industry ?? '-'}
          </div>
          <div>
            <strong>Country:</strong> {account.country_code ?? '-'}
          </div>
          <div>
            <strong>City:</strong> {account.city ?? '-'}
          </div>
          <div>
            <strong>Email:</strong> {account.email ?? '-'}
          </div>
          <div>
            <strong>Phone:</strong> {account.phone ?? '-'}
          </div>
          <div>
            <strong>Status:</strong> {account.status}
          </div>
          <div>
            <strong>Website:</strong> {account.website ?? '-'}
          </div>
        </div>
      </section>

      {/* CONTACTOS */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Contacts</h2>

        {contactsError ? (
          <p className="text-red-600">Error loading contacts.</p>
        ) : !contacts || contacts.length === 0 ? (
          <p className="text-gray-600">No contacts found for this account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">First name</th>
                  <th className="text-left p-3 text-sm font-semibold">Last name</th>
                  <th className="text-left p-3 text-sm font-semibold">Job title</th>
                  <th className="text-left p-3 text-sm font-semibold">Email</th>
                  <th className="text-left p-3 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-t border-gray-200">
                    <td className="p-3">{contact.first_name}</td>
                    <td className="p-3">{contact.last_name}</td>
                    <td className="p-3">{contact.job_title ?? '-'}</td>
                    <td className="p-3">{contact.email ?? '-'}</td>
                    <td className="p-3">{contact.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* OPORTUNIDADES */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Opportunities</h2>

        {opportunitiesError ? (
          <p className="text-red-600">Error loading opportunities.</p>
        ) : !opportunities || opportunities.length === 0 ? (
          <p className="text-gray-600">No opportunities found for this account.</p>
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
                    <td className="p-3">
                      {opportunity.probability ?? '-'}%
                    </td>
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