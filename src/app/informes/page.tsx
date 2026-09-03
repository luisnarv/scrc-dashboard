'use client';

import React from 'react';
import { ButtonMenuOperativo } from '../components/Buttons';
import { useTheme } from '../components/ThemeProvider';

export default function InformesPage() {
  const { colors } = useTheme();
  const INK = colors.ink;
  const MUT = colors.mut;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Menú de Navegación del Ecosistema Operativo */}
      <ButtonMenuOperativo />

      {/* Encabezado */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK }}>
          INFORMES
        </div>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 2 }}>
          Módulo de informes y reportes operativos
        </div>
      </div>

      {/* Vista de momento sin información */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '60px 20px',
          textAlign: 'center',
          color: MUT,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '350px',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 40 }}>📑</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>
          Vista de Informes
        </div>
        <div style={{ fontSize: 13, maxWidth: 420, color: MUT }}>
          Este módulo está reservado para la configuración y visualización de nuevos informes operativos.
        </div>
      </div>
    </div>
  );
}
