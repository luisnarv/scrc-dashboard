'use client';
import { useState, useCallback } from 'react';
import type { OrdenDetalle } from './utils/types';
import { fmtCOP, fmtN } from './utils/formatters';

interface ModalAccionesProps {
  open: boolean;
  data: OrdenDetalle[];
  titulo?: string;
  sub?: string;
  preselectedAccion?: string;
  onClose: () => void;
}

export default function ModalAcciones({ open, data, titulo, sub, preselectedAccion, onClose }: ModalAccionesProps) {
  const [search, setSearch] = useState('');
  const [accionFilt, setAccionFilt] = useState(preselectedAccion || 'ALL');
  const [estadoFilt, setEstadoFilt] = useState('ALL');

  const acciones = [...new Set(data.map(d => d.Accion || '—'))].filter(Boolean).sort();

  const filtered = data.filter(d => {
    if (accionFilt !== 'ALL' && (d.Accion || '—') !== accionFilt) return false;
    if (estadoFilt !== 'ALL' && d.Estado !== estadoFilt) return false;
    if (!search) return true;
    return [d.Fecha, d.Orden, d.Nombre, d.Zona, d.Municipio, d.Accion, d.Subaccion, d.Estado, d.Motivo_No_Reconocimiento]
      .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()));
  });

  const MAX = 1000;
  const mostrar = filtered.slice(0, MAX);
  const total = filtered.reduce((s, d) => s + (Number(d.Valor) || 0), 0);

  const descargar = useCallback(() => {
    const cols = ['Fecha', 'Orden', 'Tecnico', 'Zona', 'Municipio', 'Accion', 'Subaccion', 'Estado', 'Valor', 'Motivo_No_Reconocimiento'];
    const rows = [cols.join(',')].concat(filtered.map(d =>
      [d.Fecha, d.Orden, d.Nombre, d.Zona, d.Municipio, d.Accion, d.Subaccion, d.Estado, d.Valor || 0, d.Motivo_No_Reconocimiento]
        .map(v => { const s = String(v ?? '').replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s; })
        .join(',')
    ));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ordenes_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [filtered]);

  if (!open) return null;

  return (
    <div className={`modal-back${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-head">
          <div>
            <h3>{titulo || 'Detalle de Órdenes'}</h3>
            <div className="sub">{sub || '—'}</div>
          </div>
          <button className="modal-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>
        <div className="modal-tools">
          <input
            placeholder="Buscar en cualquier columna…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={accionFilt} onChange={e => setAccionFilt(e.target.value)}>
            <option value="ALL">Todas las acciones</option>
            {acciones.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={estadoFilt} onChange={e => setEstadoFilt(e.target.value)}>
            <option value="ALL">Todos los estados</option>
            <option value="Efectiva">Efectivas</option>
            <option value="Fallida">Fallidas</option>
            <option value="Perdida">Perdidas</option>
          </select>
          <span className="stats">{fmtN(filtered.length)} órdenes{filtered.length > MAX ? ` (mostrando ${MAX})` : ''} · Total: {fmtCOP(total)}</span>
          <button className="btn-detalle" onClick={descargar}>Descargar CSV</button>
        </div>
        <div className="modal-body">
          <table className="det">
            <thead>
              <tr>
                <th>Fecha</th><th>Orden</th><th>Técnico</th><th>Zona</th><th>Municipio</th>
                <th>Acción</th><th>Subacción</th><th>Estado</th><th>Valor</th><th>Motivo No Reconocimiento</th>
              </tr>
            </thead>
            <tbody>
              {mostrar.map((d, i) => (
                <tr key={i}>
                  <td>{d.Fecha || ''}</td>
                  <td>{d.Orden || ''}</td>
                  <td>{d.Nombre || ''}</td>
                  <td>{d.Zona || ''}</td>
                  <td>{d.Municipio || ''}</td>
                  <td>{d.Accion || ''}</td>
                  <td>{d.Subaccion || ''}</td>
                  <td>{d.Estado || ''}</td>
                  <td style={{ textAlign: 'right' }}>{fmtCOP(Number(d.Valor) || 0)}</td>
                  <td>{d.Motivo_No_Reconocimiento || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
