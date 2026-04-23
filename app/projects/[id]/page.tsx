// =====================================================
// PÁGINA: /projects/[id]
//
// Qué hace:
// - muestra el detalle de un proyecto
// - muestra cuenta y contrato asociados
// - muestra tareas del proyecto
//
// Esto amplía el drilldown:
// Projects -> Project detail
// =====================================================

import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // -----------------------------------------------------
  // 1) Leer proyecto
  // -----------------------------------------------------
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (projectError || !project) {
    return (
      <main>
        <h1 className="text-3xl font-bold mb-4">Project detail</h1>
        <p className="text-red-600">Error loading project detail.</p>
      </main>
    )
  }

  // -----------------------------------------------------
  // 2) Leer cuenta asociada
  // -----------------------------------------------------
  const { data: account } = project.account_id
    ? await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', project.account_id)
        .single()
    : { data: null }

  // -----------------------------------------------------
  // 3) Leer contrato asociado
  // -----------------------------------------------------
  const { data: contract } = project.contract_id
    ? await supabase
        .from('contracts')
        .select('id, name, contract_number, status')
        .eq('id', project.contract_id)
        .single()
    : { data: null }

  // -----------------------------------------------------
  // 4) Leer tareas del proyecto
  // -----------------------------------------------------
  const { data: projectTasks, error: projectTasksError } = await supabase
    .from('project_tasks')
    .select('id, subject, description, start_date, due_date, status')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <div className="mb-6">
        <Link href="/projects" className="text-blue-600 hover:underline">
          ← Back to Projects
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">{project.name}</h1>

      {/* DATOS BÁSICOS */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Project information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <strong>Status:</strong> {project.status}
          </div>
          <div>
            <strong>Project manager user id:</strong> {project.project_manager_user_id ?? '-'}
          </div>
          <div>
            <strong>Start date:</strong> {project.start_date ?? '-'}
          </div>
          <div>
            <strong>End date:</strong> {project.end_date ?? '-'}
          </div>
          <div className="md:col-span-2">
            <strong>Description:</strong> {project.description ?? '-'}
          </div>
        </div>
      </section>

      {/* ENTIDADES RELACIONADAS */}
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
              <p className="text-gray-600">No account associated.</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Contract</h3>
            {contract ? (
              <div>
                <p className="font-medium">{contract.name}</p>
                <p className="text-sm text-gray-600">
                  Contract number: {contract.contract_number ?? '-'}
                </p>
                <p className="text-sm text-gray-600">
                  Status: {contract.status}
                </p>
              </div>
            ) : (
              <p className="text-gray-600">No contract associated.</p>
            )}
          </div>
        </div>
      </section>

      {/* TAREAS DEL PROYECTO */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold mb-4">Project tasks</h2>

        {projectTasksError ? (
          <p className="text-red-600">Error loading project tasks.</p>
        ) : !projectTasks || projectTasks.length === 0 ? (
          <p className="text-gray-600">No tasks found for this project.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Subject</th>
                  <th className="text-left p-3 text-sm font-semibold">Description</th>
                  <th className="text-left p-3 text-sm font-semibold">Start date</th>
                  <th className="text-left p-3 text-sm font-semibold">Due date</th>
                  <th className="text-left p-3 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {projectTasks.map((task) => (
                  <tr key={task.id} className="border-t border-gray-200">
                    <td className="p-3">{task.subject}</td>
                    <td className="p-3">{task.description ?? '-'}</td>
                    <td className="p-3">{task.start_date ?? '-'}</td>
                    <td className="p-3">{task.due_date ?? '-'}</td>
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