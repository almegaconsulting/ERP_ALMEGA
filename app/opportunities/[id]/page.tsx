// =====================================================
// PÁGINA: /opportunities/[id]
//
// Qué hace esta página:
// - muestra el detalle de una oportunidad concreta
// - muestra la cuenta asociada
// - muestra el contacto principal
// - muestra actividades relacionadas
// - muestra tareas relacionadas
//
// Esto amplía el drilldown:
// Accounts -> Account detail -> Opportunity detail
// =====================================================

import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

/**
 * Página de detalle de oportunidad.
 *
 * Qué muestra:
 * - datos básicos de la oportunidad
 * - cuenta asociada
 * - contacto principal
 * - actividades relacionadas
 * - tareas relacionadas
 *
 * Objetivo actual:
 * - profundizar el drilldown real en la aplicación
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // -----------------------------------------------------
  // 1) Leer la oportunidad
  // -----------------------------------------------------
  const { data: opportunity, error: opportunityError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .single()

  if (opportunityError || !opportunity) {
    return (
      <main>
        <h1 className="text-3xl font-bold mb-4">Opportunity detail</h1>
        <p className="text-red-600">Error loading opportunity detail.</p>
      </main>
    )
  }

  // -----------------------------------------------------
  // 2) Leer cuenta asociada
  // -----------------------------------------------------
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', opportunity.account_id)
    .single()

  // -----------------------------------------------------
  // 3) Leer contacto principal si existe
  // -----------------------------------------------------
  const { data: primaryContact } = opportunity.primary_contact_id
    ? await supabase
        .from('contacts')
        .select('id, first_name, last_name, job_title, email')
        .eq('id', opportunity.primary_contact_id)
        .single()
    : { data: null }

  // -----------------------------------------------------
  // 4) Leer actividades relacionadas
  // -----------------------------------------------------
  const { data: activities, error: activitiesError } = await supabase
    .from('activities')
    .select('id, activity_type, subject, description, activity_date')
    .eq('opportunity_id', id)
    .order('activity_date', { ascending: false })

  // -----------------------------------------------------
  // 5) Leer tareas relacionadas
  // -----------------------------------------------------
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, subject, description, due_date, priority, status')
    .eq('opportunity_id', id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <div className="mb-6">
        <Link href="/opportunities" className="text-blue-600 hover:underline">
          ← Back to Opportunities
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">{opportunity.name}</h1>

      {/* DATOS BÁSICOS */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Opportunity information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <strong>Stage:</strong> {opportunity.stage}
          </div>
          <div>
            <strong>Status:</strong> {opportunity.status}
          </div>
          <div>
            <strong>Amount:</strong> {opportunity.amount ?? '-'} {opportunity.currency_code ?? ''}
          </div>
          <div>
            <strong>Probability:</strong> {opportunity.probability ?? '-'}%
          </div>
          <div>
            <strong>Expected close date:</strong> {opportunity.expected_close_date ?? '-'}
          </div>
          <div>
            <strong>Source:</strong> {opportunity.source ?? '-'}
          </div>
          <div className="md:col-span-2">
            <strong>Description:</strong> {opportunity.description ?? '-'}
          </div>
        </div>
      </section>

      {/* CUENTA Y CONTACTO */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Related entities</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">Account</h3>
            {account ? (
              <Link
                href={`/accounts/${account.id}`}
                className="text-blue-600 hover:underline"
              >
                {account.name}
              </Link>
            ) : (
              <p className="text-gray-600">No account found.</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Primary contact</h3>
            {primaryContact ? (
  <div>
    <p>
      <Link
        href={`/contacts/${primaryContact.id}`}
        className="text-blue-600 hover:underline"
      >
        {primaryContact.first_name} {primaryContact.last_name}
      </Link>
    </p>
                <p className="text-sm text-gray-600">
                  {primaryContact.job_title ?? '-'}
                </p>
                <p className="text-sm text-gray-600">
                  {primaryContact.email ?? '-'}
                </p>
              </div>
            ) : (
              <p className="text-gray-600">No primary contact found.</p>
            )}
          </div>
        </div>
      </section>

      {/* ACTIVIDADES */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Activities</h2>

        {activitiesError ? (
          <p className="text-red-600">Error loading activities.</p>
        ) : !activities || activities.length === 0 ? (
          <p className="text-gray-600">No activities found for this opportunity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Type</th>
                  <th className="text-left p-3 text-sm font-semibold">Subject</th>
                  <th className="text-left p-3 text-sm font-semibold">Description</th>
                  <th className="text-left p-3 text-sm font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id} className="border-t border-gray-200">
                    <td className="p-3">{activity.activity_type}</td>
                    <td className="p-3">{activity.subject}</td>
                    <td className="p-3">{activity.description ?? '-'}</td>
                    <td className="p-3">{activity.activity_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* TAREAS */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Tasks</h2>

        {tasksError ? (
          <p className="text-red-600">Error loading tasks.</p>
        ) : !tasks || tasks.length === 0 ? (
          <p className="text-gray-600">No tasks found for this opportunity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Subject</th>
                  <th className="text-left p-3 text-sm font-semibold">Description</th>
                  <th className="text-left p-3 text-sm font-semibold">Due date</th>
                  <th className="text-left p-3 text-sm font-semibold">Priority</th>
                  <th className="text-left p-3 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t border-gray-200">
                    <td className="p-3">{task.subject}</td>
                    <td className="p-3">{task.description ?? '-'}</td>
                    <td className="p-3">{task.due_date ?? '-'}</td>
                    <td className="p-3">{task.priority}</td>
                    <td className="p-3">{task.status}</td>
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