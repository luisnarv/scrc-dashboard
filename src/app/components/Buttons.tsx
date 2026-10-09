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

// Controles compactos (28 px) para los encabezados de los modales de análisis.
export const MODAL_CTRL_H = 28;

export const segWrapStyleSm: React.CSSProperties = {
  ...segWrapStyle, height: MODAL_CTRL_H, borderRadius: 7,
};

export const segStyle = (on: boolean, sm = false): React.CSSProperties => ({
  padding: sm ? '0 10px' : '0 12px', fontSize: sm ? 11 : 11.5, fontWeight: on ? 700 : 600,
  border: 'none', borderRadius: sm ? 5 : 6, cursor: 'pointer',
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
  /** 'sm' = versión compacta de 28 px (encabezados de modales). Sin el prop se ve igual que siempre. */
  size?: 'sm';
  /** Ocupa todo el ancho disponible y reparte las opciones por igual (panel lateral de los modales). */
  fill?: boolean;
  /** Permite que las opciones pasen a una segunda línea (el alto del contenedor deja de ser fijo). */
  wrap?: boolean;
}

export function SegmentedControl({ options, value, onChange, style, size, fill, wrap }: SegmentedControlProps) {
  const sm = size === 'sm';
  const wrapStyle: React.CSSProperties = {
    ...(fill ? { width: '100%' } : {}),
    ...(wrap ? { height: 'auto', flexWrap: 'wrap', minHeight: sm ? MODAL_CTRL_H : CTRL_H } : {}),
  };
  return (
    <div style={{ ...(sm ? segWrapStyleSm : segWrapStyle), ...wrapStyle, ...style }}>
      {options.map(opt => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            style={{ ...segStyle(on, sm), ...(fill ? { flex: '1 1 0', minWidth: 0, whiteSpace: 'nowrap' } : {}), ...(wrap ? { minHeight: (sm ? MODAL_CTRL_H : CTRL_H) - 6 } : {}) }}
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

// ---- Botones del encabezado de los modales (28 px, solo variables de color de globals.css) ----
const modalBtnBase: React.CSSProperties = {
  height: MODAL_CTRL_H, padding: '0 10px', borderRadius: 7, fontSize: 11,
  display: 'flex', alignItems: 'center', cursor: 'pointer',
};

/** Exportar PNG/XLSX/CSV y similares. `primary` = acento de marca; por defecto, secundario. */
export const modalBtnStyle = (primary = false): React.CSSProperties => primary
  ? { ...modalBtnBase, background: 'var(--brand-primary)', border: '1px solid var(--brand-primary)', color: 'var(--brand-grad-text)', fontWeight: 700 }
  : { ...modalBtnBase, background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 };

export const modalCloseStyle: React.CSSProperties = {
  width: MODAL_CTRL_H, height: MODAL_CTRL_H, borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--panel)', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0,
};

/** Botón cerrar igual en todos los modales; el color pasa a --err al pasar el mouse. */
export function ModalCloseButton({ onClick, title, ariaLabel = 'Cerrar', className, id }: { onClick: () => void; title?: string; ariaLabel?: string; className?: string; id?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
      id={id}
      style={modalCloseStyle}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--err)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      ✕
    </button>
  );
}
