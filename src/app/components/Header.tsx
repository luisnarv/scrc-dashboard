'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import SyncStatus from './SyncStatus';

export const ALL_NAV_ROUTES = [
  { path: '/operativo', label: 'Operativo' },
  { path: '/tecnicos', label: 'Cantidades Técnicos' },
  { path: '/tecnico/productivo', label: 'Producción Técnico' },
  { path: '/cierre_diario', label: 'Cierre Diario' },
  { path: '/informes', label: 'Informes' },
  { path: '/detalle_operativo', label: 'Detalle operativo' },
];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  // Los botones del menú solo se muestran en las vistas que lista ALL_NAV_ROUTES; en las demás (/, /gerencial, /estrategico…) se ocultan.
  const mostrarNav = ALL_NAV_ROUTES.some(r => pathname === r.path || pathname?.startsWith(r.path + '/'));

  return (
    <>
      <header id="header-main" className="dash-header">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id="header-logo" src="/ises_symbol.avif" alt="ISES" className="brand-logo" />
          <div>
            <h1 id="header-title">Dashboard Ejecutivo SCRC</h1>
            <div id="header-subtitle" className="sub">Gerencia · Direcciones · Líderes operativos — Producción operativa &amp; Realidad financiera</div>
          </div>
        </div>
        <div id="header-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SyncStatus />
          <button
            id="btn-toggle-theme"
            onClick={toggleTheme}
            aria-label="Alternar tema claro/oscuro"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'var(--brand-grad-text)',
              padding: '6px 12px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
          </button>
        </div>
      </header>

      {mostrarNav && (
        <nav id="main-dash-nav" className="dash-nav" aria-label="Navegación principal del Dashboard">
          {ALL_NAV_ROUTES.map(item => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
