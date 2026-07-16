import type { Metadata } from 'next';
import './globals.css';
import Header from './components/Header';
import Filters from './components/Filters';
import { DashboardProvider } from './components/DashboardProvider';

export const metadata: Metadata = {
  title: 'Dashboard Ejecutivo SCRC',
  description: 'Gerencia · Direcciones · Líderes operativos — Producción operativa (SIPREM) & Realidad financiera (OTC)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <DashboardProvider>
          <div className="wrap">
            <Header />
            <Filters />
            <main>{children}</main>
          </div>
        </DashboardProvider>
      </body>
    </html>
  );
}
