// =====================================================
// PÁGINA: /accounts
//
// Qué hace esta página:
// - consulta la tabla accounts en Supabase
// - muestra las cuentas en formato tabla
// - permite navegar al detalle de cada cuenta
//
// Qué no hace todavía:
// - no filtra
// - no pagina
// - no aplica permisos
// =====================================================

import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

/**
 * Página de listado de cuentas.
 *
 * Qué muestra:
 * - nombre
 * - tipo de cuenta
 * - sector
 * - país
 * - ciudad
 * - estado
 *
 * Objetivo actual:
 * - mostrar listado navegable de cuentas
 */
export default async function AccountsPage() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1 className="text-3xl font-bold mb-6">Accounts</h1>

      {error && (
        <p className="text-red-600 mb-4">
          Error loading accounts: {error.message}
        </p>
      )}

      {!accounts || accounts.length === 0 ? (
        <p className="text-gray-600">No accounts found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">Name</th>
                <th className="text-left p-3 text-sm font-semibold">Type</th>
                <th className="text-left p-3 text-sm font-semibold">Industry</th>
                <th className="text-left p-3 text-sm font-semibold">Country</th>
                <th className="text-left p-3 text-sm font-semibold">City</th>
                <th className="text-left p-3 text-sm font-semibold">Status</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-t border-gray-200">
                  <td className="p-3">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td className="p-3">{account.account_type}</td>
                  <td className="p-3">{account.industry ?? '-'}</td>
                  <td className="p-3">{account.country_code ?? '-'}</td>
                  <td className="p-3">{account.city ?? '-'}</td>
                  <td className="p-3">{account.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}