import './globals.css'
import Sidebar from './components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        {/* COLUMNA IZQUIERDA FIJA */}
        <div className="fixed inset-y-0 left-0 w-64 bg-black">
          <Sidebar />
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <main className="ml-64 min-h-screen p-8">
          {children}
        </main>
      </body>
    </html>
  )
}