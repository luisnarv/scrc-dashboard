'use client';

import { useTheme } from './ThemeProvider';

export default function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="dash-header">
      <div>
        <h1>📊 Dashboard Ejecutivo SCRC</h1>
        <div className="sub">Gerencia · Direcciones · Líderes operativos — Producción operativa (SIPREM) &amp; Realidad financiera (OTC)</div>
      </div>
      <button 
        onClick={toggleTheme}
        aria-label="Alternar tema claro/oscuro"
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
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
        {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
      </button>
    </header>
  );
}
