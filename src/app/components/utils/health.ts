import type { OtcAgg, SipAgg } from './types';

export interface HealthResult {
  score: number;
  estado: string;
  cls: string;
  color: string;
  narr: string;
  dims: { label: string; value: number; weight: number }[];
}

export function calcHealth(
  pOTC: OtcAgg,
  pSIP: SipAgg,
  cump: number | null,
  alertasN: number,
  provsPct: number,
  meses12Util: number[],
  meses12Marg: number[],
  meses12Prod: number[],
  meses12Cump: number[],
  pSIPant: { prod: number }
): HealthResult {
  const s = { fin: 0, ope: 0, pro: 0, rie: 0, ten: 0 };

  const m = pOTC.margen;
  const ci = pOTC.ingresos ? pOTC.costos / pOTC.ingresos : 1;
  if (pOTC.utilidad > 0 && m !== null && m >= 0.2 && ci < 0.8) s.fin = 100;
  else if (m !== null && m >= 0.15 && ci < 0.85) s.fin = 80;
  else if (m !== null && m >= 0.1 && ci < 0.95) s.fin = 60;
  else if (pOTC.utilidad > 0) s.fin = 40;
  else s.fin = 20;

  const efec = pSIP.ordenes ? pSIP.tecnicos / pSIP.ordenes : null;
  if (cump !== null && cump >= 0.95 && efec !== null && efec >= 0.97) s.ope = 100;
  else if (cump !== null && cump >= 0.9 && efec !== null && efec >= 0.95) s.ope = 80;
  else if (cump !== null && cump >= 0.8) s.ope = 60;
  else if (cump !== null) s.ope = 40;
  else s.ope = 50;

  const dPr = pSIPant.prod ? (pSIP.prod - pSIPant.prod) / Math.abs(pSIPant.prod) : null;
  let base = cump !== null ? Math.min(100, cump * 100) : 60;
  if (dPr !== null) base += dPr >= 0 ? Math.min(10, dPr * 100) : Math.max(-15, dPr * 100);
  s.pro = Math.max(0, Math.min(100, base));

  s.rie = Math.max(0, 100 - alertasN * 15 - (provsPct > 0.3 ? 20 : 0));

  const tendencia = (arr: number[]) => {
    if (!arr || arr.length < 3) return 0;
    const [a, b, c] = arr.slice(-3);
    let sc = 0;
    if (c > b) sc++; else if (c < b) sc--;
    if (b > a) sc++; else if (b < a) sc--;
    return sc;
  };

  const tSum = tendencia(meses12Util) + tendencia(meses12Marg) + tendencia(meses12Prod) + tendencia(meses12Cump);
  s.ten = Math.max(0, Math.min(100, 50 + tSum * 8));

  const score = Math.round(s.fin * 0.4 + s.ope * 0.25 + s.pro * 0.15 + s.rie * 0.1 + s.ten * 0.1);

  let estado: string, cls: string, color: string, narr: string;
  if (score >= 95) {
    estado = '🔵 Excelente'; cls = 'excelente'; color = '#1976D2';
    narr = 'El proyecto mantiene una rentabilidad superior a la meta, presenta alta productividad y no registra riesgos significativos.';
  } else if (score >= 80) {
    estado = '🟢 Saludable'; cls = 'saludable'; color = '#2E7D32';
    narr = 'El proyecto presenta resultados positivos tanto financieros como operativos. Se recomienda continuar monitoreando la evolución de costos y cumplimiento.';
  } else if (score >= 60) {
    estado = '🟡 En observación'; cls = 'observacion'; color = '#F57C00';
    narr = 'Aunque el proyecto continúa siendo rentable, se evidencia una disminución del margen y/o un incremento en los costos operativos que requieren seguimiento.';
  } else {
    estado = '🔴 Riesgo Alto'; cls = 'riesgo'; color = '#C62828';
    narr = 'El proyecto presenta deterioro financiero y operativo. Los costos crecen más rápido que los ingresos y existen indicadores críticos que requieren intervención inmediata.';
  }

  return {
    score,
    estado,
    cls,
    color,
    narr,
    dims: [
      { label: 'Financiera', value: s.fin, weight: 40 },
      { label: 'Operativa', value: s.ope, weight: 25 },
      { label: 'Productividad', value: s.pro, weight: 15 },
      { label: 'Riesgo', value: s.rie, weight: 10 },
      { label: 'Tendencia', value: s.ten, weight: 10 },
    ],
  };
}
