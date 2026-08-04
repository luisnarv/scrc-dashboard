'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useDashboard } from './DashboardProvider';
import LoadingScreen from './LoadingScreen';
import Header from './Header';
import Filters from './Filters';

export default function DashboardGate({ children }: { children: ReactNode }) {
  const { loading, syncing, error, raw } = useDashboard();
  const pathname = usePathname();

  // El panel de administración no depende de los datos del dashboard
  if (pathname.startsWith('/admin')) return <main>{children}</main>;

  // Se mantiene la MISMA pantalla de carga (LoadingScreen) no solo durante la carga
  // inicial, sino también mientras se sincronizan los meses previos (syncing). Así, al
  // quitarla, los evolutivos ya tienen TODOS los meses y no hay saltos por datos que
  // llegan luego. `syncing` solo ocurre una vez, en el arranque.
  if (loading || syncing) return <LoadingScreen />;

  const hayDatos = !!raw && raw.raw.length > 0;

  // Offline-first: un error solo tapa la pantalla si NO hay datos en cache.
  // Con datos cacheados seguimos mostrando el dashboard; el aviso de "sin
  // conexion" lo da el indicador del Header (SyncStatus).
  if (error && !hayDatos) {
    return (
      <div className="load-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ises_symbol.avif" alt="" className="load-logo load-logo-static" />
        <div className="load-msg">No se pudo cargar la información</div>
        <div className="load-hint">{error}</div>
      </div>
    );
  }

  if (!hayDatos) {
    return (
      <div className="load-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ises_symbol.avif" alt="" className="load-logo load-logo-static" />
        <div className="load-msg">Sin datos para mostrar</div>
        <div className="load-hint">La consulta no devolvió registros.</div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <Filters />
      <main>{children}</main>
    </>
  );
}
