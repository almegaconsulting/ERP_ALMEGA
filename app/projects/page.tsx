// =====================================================
// PÁGINA: /projects
//
// Qué hace esta página:
// - consulta la tabla projects en Supabase
// - trae también la cuenta asociada
// - muestra los proyectos en una tabla
//
// Qué no hace todavía:
// - no filtra
// - no pagina
// - no tiene detalle
// =====================================================

import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

/**
 * Página de listado de proyectos.
 *
 * Qué muestra:
 * - nombre del proyecto
 * - cuenta asociada
 * - estado
 * - fecha de inicio
 * - fecha de fin
 *
 * Objetivo actual:
 * - completar el módulo Projects del menú lateral
 */
export default async function ProjectsPage() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      start_date,
      end_date,
      accounts (
        name
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1 className="text-3xl font-bold mb-6">Projects</h1>

      {error && (
        <p className="text-red-600 mb-4">
          Error loading projects: {error.message}
        </p>
      )}

      {!projects || projects.length === 0 ? (
        <p className="text-gray-600">No projects found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">Project</th>
                <th className="text-left p-3 text-sm font-semibold">Account</th>
                <th className="text-left p-3 text-sm font-semibold">Status</th>
                <th className="text-left p-3 text-sm font-semibold">Start date</th>
                <th className="text-left p-3 text-sm font-semibold">End date</th>
              </tr>
            </thead>

            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-t border-gray-200">
                  <td className="p-3">
  <Link
    href={`/projects/${project.id}`}
    className="text-blue-600 hover:underline font-medium"
  >
    {project.name}
  </Link>
</td>
                  <td className="p-3">
                    {Array.isArray(project.accounts)
                      ? project.accounts[0]?.name ?? '-'
                      : (project.accounts as { name?: string } | null)?.name ?? '-'}
                  </td>
                  <td className="p-3">{project.status}</td>
                  <td className="p-3">{project.start_date ?? '-'}</td>
                  <td className="p-3">{project.end_date ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}