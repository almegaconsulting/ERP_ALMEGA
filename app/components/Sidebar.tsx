'use client'

// =====================================================
// COMPONENTE: Sidebar
//
// Qué hace:
// - muestra el menú lateral del ERP
// - detecta la ruta actual
// - resalta el módulo activo
// - añade acceso directo a Home
// =====================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Devuelve las clases CSS del enlace según si está activo o no.
 */
function getLinkClass(isActive: boolean) {
  return isActive
    ? 'rounded bg-white/20 px-3 py-2 text-white font-semibold'
    : 'rounded px-3 py-2 text-white hover:bg-white/10'
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="h-full w-full text-white p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6">ERP Almega</h2>

      <nav className="flex flex-col gap-2">
        <Link
          href="/"
          className={getLinkClass(pathname === '/')}
        >
          Home
        </Link>

        <Link
          href="/accounts"
          className={getLinkClass(pathname.startsWith('/accounts'))}
        >
          Accounts
        </Link>

        <Link
          href="/contacts"
          className={getLinkClass(pathname.startsWith('/contacts'))}
        >
          Contacts
        </Link>

        <Link
          href="/opportunities"
          className={getLinkClass(pathname.startsWith('/opportunities'))}
        >
          Opportunities
        </Link>

        <Link
          href="/projects"
          className={getLinkClass(pathname.startsWith('/projects'))}
        >
          Projects
        </Link>
      </nav>
    </aside>
  )
}