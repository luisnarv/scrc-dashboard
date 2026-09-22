'use client';

import React, { ButtonHTMLAttributes, ReactNode } from 'react';

const CTRL_H = 32;

export const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: CTRL_H, padding: '0 14px', fontSize: 12, fontWeight: 700,
  borderRadius: 8, border: '1px solid transparent', cursor: 'pointer',
  background: 'var(--brand-primary)', color: 'var(--brand-grad-text)',
  boxShadow: '0 1px 2px rgba(0,0,0,.18)', transition: 'filter .15s',
};

export const btnGhostStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: CTRL_H, padding: '0 12px', fontSize: 12, fontWeight: 600,
  borderRadius: 8, cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--text-muted)',
  transition: 'background .15s, color .15s',
};

export const segWrapStyle: React.CSSProperties = {
  display: 'flex', gap: 2, padding: 2, height: CTRL_H, borderRadius: 8,
  background: 'var(--panel)', border: '1px solid var(--border)',
};

export const segStyle = (on: boolean): React.CSSProperties => ({
  padding: '0 12px', fontSize: 11.5, fontWeight: on ? 700 : 600,
  border: 'none', borderRadius: 6, cursor: 'pointer',
  background: on ? 'var(--card)' : 'transparent',
  color: on ? 'var(--text-title)' : 'var(--text-muted)',
  boxShadow: on ? '0 1px 2px rgba(0,0,0,.14)' : 'none',
  transition: 'background .15s, color .15s',
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ButtonPrimary({ children, style, ...props }: ButtonProps) {
  return (
    <button
      style={{ ...btnPrimaryStyle, ...style }}
      onMouseEnter={e => {
        if (!props.disabled) e.currentTarget.style.filter = 'brightness(.92)';
        if (props.onMouseEnter) props.onMouseEnter(e);
      }}
      onMouseLeave={e => {
        if (!props.disabled) e.currentTarget.style.filter = 'none';
        if (props.onMouseLeave) props.onMouseLeave(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonGhost({ children, style, ...props }: ButtonProps) {
  return (
    <button
      style={{ ...btnGhostStyle, ...style }}
      onMouseEnter={e => {
        if (!props.disabled) {
          e.currentTarget.style.background = 'var(--hover-bg)';
          e.currentTarget.style.color = 'var(--text-title)';
        }
        if (props.onMouseEnter) props.onMouseEnter(e);
      }}
      onMouseLeave={e => {
        if (!props.disabled) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }
        if (props.onMouseLeave) props.onMouseLeave(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export interface SegmentOption {
  value: string;
  label: ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  return (
    <div style={{ ...segWrapStyle, ...style }}>
      {options.map(opt => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            style={segStyle(on)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExportButton({ format, onClick, style }: { format: 'excel' | 'csv'; onClick: () => void; style?: React.CSSProperties }) {
  const label = format === 'excel' ? 'Exportar Excel' : 'Exportar CSV';
  return (
    <button
      onClick={onClick}
      style={{ ...btnGhostStyle, ...(style || {}) }}
    >
      {label}
    </button>
  );
}

/**
 * ButtonMenuOperativo:
 * La navegación principal unificada con todas las rutas ejecutivas y operativas
 * se renderiza de forma centralizada en Header.tsx directamente bajo el encabezado,
 * garantizando coherencia visual y disponibilidad permanente en todas las pantallas.
 */
export function ButtonMenuOperativo() {
  return null;
}
