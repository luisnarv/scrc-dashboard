import type { Metadata } from 'next';
import './globals.css';
import DashboardGate from './components/DashboardGate';
import { DashboardProvider } from './components/DashboardProvider';
import { ThemeProvider } from './components/ThemeProvider';
export const metadata: Metadata = {
  title: 'Dashboard Ejecutivo SCRC',
  description: 'Gerencia — Direcciones — Líderes operativos — Producción operativa (SIPREM) & Realidad financiera (OTC)',
  icons: {
    icon: '/ises_symbol.avif',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <ThemeProvider>
          <DashboardProvider>
            <div className="wrap">
              <DashboardGate>{children}</DashboardGate>
            </div>
          </DashboardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
