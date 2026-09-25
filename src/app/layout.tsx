import type { Metadata } from 'next';
import './globals.css';
import DashboardGate from './components/DashboardGate';
import { DashboardProvider } from './components/DashboardProvider';
import { ThemeProvider } from './components/ThemeProvider';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard Ejecutivo SCRC',
  description: 'Gerencia — Direcciones — Líderes operativos — Producción operativa & Realidad financiera',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/ises_symbol.avif" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ises_theme');
if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
document.body.classList.add('theme-'+t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="theme-light">
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
