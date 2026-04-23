// =====================================================
// PÁGINA: /contacts
//
// Qué hace esta página:
// - consulta la tabla contacts en Supabase
// - trae también el nombre de la cuenta asociada
// - muestra los datos en una tabla
//
// Qué no hace todavía:
// - no filtra
// - no pagina
// - no edita
// =====================================================

import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

/**
 * Página de listado de contactos.
 *
 * Qué muestra:
 * - nombre
 * - apellidos
 * - cargo
 * - email
 * - cuenta asociada
 * - estado
 *
 * Objetivo actual:
 * - mostrar relaciones reales entre contactos y cuentas
 */
export default async function ContactsPage() {
  // Consulta con relación a accounts.
  // Pedimos account_id y además el nombre de la cuenta relacionada.
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select(`
      id,
      first_name,
      last_name,
      job_title,
      email,
      status,
      account_id,
      accounts (
        name
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1 className="text-3xl font-bold mb-6">Contacts</h1>

      {error && (
        <p className="text-red-600 mb-4">
          Error loading contacts: {error.message}
        </p>
      )}

      {!contacts || contacts.length === 0 ? (
        <p className="text-gray-600">No contacts found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">First name</th>
                <th className="text-left p-3 text-sm font-semibold">Last name</th>
                <th className="text-left p-3 text-sm font-semibold">Job title</th>
                <th className="text-left p-3 text-sm font-semibold">Email</th>
                <th className="text-left p-3 text-sm font-semibold">Account</th>
                <th className="text-left p-3 text-sm font-semibold">Status</th>
              </tr>
            </thead>

            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-gray-200">
                  <td className="p-3">
  <Link
    href={`/contacts/${contact.id}`}
    className="text-blue-600 hover:underline font-medium"
  >
    {contact.first_name}
  </Link>
</td>
<td className="p-3">{contact.last_name}</td>
                  <td className="p-3">{contact.job_title ?? '-'}</td>
                  <td className="p-3">{contact.email ?? '-'}</td>
                  <td className="p-3">
                    {Array.isArray(contact.accounts)
                      ? contact.accounts[0]?.name ?? '-'
                      : (contact.accounts as { name?: string } | null)?.name ?? '-'}
                  </td>
                  <td className="p-3">{contact.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}