import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Almega · MiniERP', description: 'Clientes, proyectos y facturación en un único espacio de trabajo.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="es"><body>{children}</body></html>; }
