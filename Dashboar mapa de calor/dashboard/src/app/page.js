"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

import isesSymbol from "../../public/ises-symbol.png";

import Topbar from "@/components/Topbar";
import KPIStrip from "@/components/KPIStrip";
import RiskSpine from "@/components/RiskSpine";
import DetailsPanel from "@/components/DetailsPanel";
import Dock from "@/components/Dock";
import { useTheme } from "@/lib/theme";

// Dynamic import for Leaflet map to avoid window undefined pre-render issues
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        background: "var(--map-bg)",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--dim)"
      }}
    >
      Cargando visor cartográfico...
    </div>
  )
});

export default function Home() {
  // Paleta corporativa para los swatches de capas y la leyenda de riesgo
  const { palette: P } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Controla si el panel de capas está desplegado u oculto
  const [layersCollapsed, setLayersCollapsed] = useState(false);

  // App global state
  const [st, setSt] = useState({
    zona: "",
    muni: "",
    brig: "",
    tipo: "",
    d0: 0,
    d1: 60,
    minOrders: 10,
    hotspot: 60,
    adjusted: true,
    selBarrio: null,
    selTec: null,
    selNic: null,
    tab: "barrio",
    dock: "tendencias",
    dockCollapsed: false,
    spineSort: "risk",
    est: [true, true, true],
    layers: {
      heat: false,
      markers: true,
      gps: false,
      approx: false,
      bpoly: false,
      mpoly: false,
      zpoly: false
    },
    // Hierarchy selections
    jerBarrio: null,
    jerBrig: null
  });

  // Load consolidated data on mount
  useEffect(() => {
    fetch("/data.json")
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        // Initialize date slider boundaries based on data days
        const pts = resData.pts;
        const M = Int32Array.from(pts.m);
        const N = pts.e.length;
        const DAY = new Int16Array(N);
        let maxD = 0;
        for (let i = 0; i < N; i++) {
          DAY[i] = Math.floor(M[i] / 1440);
          if (DAY[i] > maxD) maxD = DAY[i];
        }
        setSt((prev) => ({
          ...prev,
          d0: 0,
          d1: maxD
        }));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load operational data", err);
      });
  }, []);

  // Raw arrays memoized for lightning-fast lookups
  const rawArrays = useMemo(() => {
    if (!data) return null;
    const P = data.pts;
    return {
      E: Uint8Array.from(P.e),
      B: Int16Array.from(P.b),
      T: Int16Array.from(P.t),
      G: Uint8Array.from(P.g),
      O: Uint8Array.from(P.o),
      C: Uint8Array.from(P.c),
      S: Uint8Array.from(P.s),
      U: Uint8Array.from(P.u),
      F: Uint8Array.from(P.f),
      M: Int32Array.from(P.m),
      ORD: P.n,
      NIC: P.nic,
      LA: Int32Array.from(P.la),
      LO: Int32Array.from(P.lo),
      APPROX: (() => {
        const N = P.e.length;
        const approx = new Uint8Array(N);
        const cnt = new Map();
        for (let i = 0; i < N; i++) {
          const k = P.la[i] * 100000 + P.lo[i];
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        for (let i = 0; i < N; i++) {
          if (cnt.get(P.la[i] * 100000 + P.lo[i]) >= 5) approx[i] = 1;
        }
        return approx;
      })(),
      DAY: (() => {
        const N = P.e.length;
        const arr = new Int16Array(N);
        for (let i = 0; i < N; i++) arr[i] = Math.floor(P.m[i] / 1440);
        return arr;
      })()
    };
  }, [data]);

  // Slices coordinates back to normal float values
  const lat = (i) => {
    if (!rawArrays || !data) return 0;
    return rawArrays.LA[i] / 1e5 + data.meta.lat0;
  };

  const lon = (i) => {
    if (!rawArrays || !data) return 0;
    return rawArrays.LO[i] / 1e5 + data.meta.lon0;
  };

  // 1. FILTERING ENGINE
  const IDX = useMemo(() => {
    if (!data || !rawArrays) return [];
    const { DAY, B, G, O } = rawArrays;
    const N = DAY.length;
    const zi = st.zona === "" ? -1 : +st.zona;
    const mi = st.muni === "" ? -1 : +st.muni;
    const gi = st.brig === "" ? -1 : +st.brig;
    const oi = st.tipo === "" ? -1 : +st.tipo;

    const out = new Int32Array(N);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const d = DAY[i];
      if (d < st.d0 || d > st.d1) continue;
      const b = B[i];
      if (zi >= 0 && data.dim.b_zona[b] !== zi) continue;
      if (mi >= 0 && data.dim.b_muni[b] !== mi) continue;
      if (gi >= 0 && G[i] !== gi) continue;
      if (oi >= 0 && O[i] !== oi) continue;
      out[k++] = i;
    }
    return out.subarray(0, k);
  }, [data, rawArrays, st.zona, st.muni, st.brig, st.tipo, st.d0, st.d1]);

  // Recalculates available filters in cascade
  const avail = useMemo(() => {
    const res = {
      zona: new Set(),
      muni: new Set(),
      brig: new Set(),
      tipo: new Set()
    };
    if (!data || !rawArrays) return res;
    const { B, G, O, DAY } = rawArrays;
    const N = DAY.length;

    // Filter values (independent of the selector itself to avoid lockups)
    const zi = st.zona === "" ? -1 : +st.zona;
    const mi = st.muni === "" ? -1 : +st.muni;
    const gi = st.brig === "" ? -1 : +st.brig;
    const oi = st.tipo === "" ? -1 : +st.tipo;

    for (let i = 0; i < N; i++) {
      const d = DAY[i];
      if (d < st.d0 || d > st.d1) continue;
      const b = B[i];
      const zVal = data.dim.b_zona[b];
      const mVal = data.dim.b_muni[b];
      const gVal = G[i];
      const oVal = O[i];

      // Zona depends on Muni, Brig, Tipo
      if ((mi < 0 || mVal === mi) && (gi < 0 || gVal === gi) && (oi < 0 || oVal === oi)) {
        res.zona.add(zVal);
      }
      // Muni depends on Zona, Brig, Tipo
      if ((zi < 0 || zVal === zi) && (gi < 0 || gVal === gi) && (oi < 0 || oVal === oi)) {
        res.muni.add(mVal);
      }
      // Brig depends on Zona, Muni, Tipo
      if ((zi < 0 || zVal === zi) && (mi < 0 || mVal === mi) && (oi < 0 || oVal === oi)) {
        res.brig.add(gVal);
      }
      // Tipo depends on Zona, Muni, Brig
      if ((zi < 0 || zVal === zi) && (mi < 0 || mVal === mi) && (gi < 0 || gVal === gi)) {
        res.tipo.add(oVal);
      }
    }
    return res;
  }, [data, rawArrays, st.zona, st.muni, st.brig, st.tipo, st.d0, st.d1]);

  // 2. AGGREGATION ENGINE
  const A = useMemo(() => {
    const defaultAgg = {
      tot: 0,
      ef: 0,
      fa: 0,
      pe: 0,
      faCtrl: 0,
      noCtrl: 0,
      efPct: 0,
      efAdj: 0,
      pePct: 0,
      faPct: 0,
      tecs: new Set(),
      brigs: new Set(),
      barrio: new Map(),
      tec: new Map(),
      brig: new Map(),
      causa: new Map(),
      sub: new Map(),
      susp: new Map(),
      tipo: new Map(),
      byDay: new Map()
    };
    if (!data || !rawArrays || !IDX.length) return defaultAgg;

    const { E, C, B, T, G, O, S, U, M, DAY } = rawArrays;
    const CTRL = data.dim.causa_ctrl;

    const A = {
      tot: IDX.length,
      ef: 0,
      fa: 0,
      pe: 0,
      faCtrl: 0,
      noCtrl: 0,
      tecs: new Set(),
      brigs: new Set(),
      barrio: new Map(),
      tec: new Map(),
      brig: new Map(),
      causa: new Map(),
      sub: new Map(),
      susp: new Map(),
      tipo: new Map(),
      byDay: new Map()
    };

    const blank = () => ({
      tot: 0,
      ef: 0,
      fa: 0,
      pe: 0,
      faCtrl: 0,
      noCtrl: 0,
      causa: new Map(),
      tec: new Map(),
      brig: new Map(),
      tipo: new Map(),
      efTipo: new Map(),
      susp: new Map(),
      sub: new Map(),
      subEf: new Map(),
      day: new Map(),
      barrios: new Set(),
      last: -1,
      tecEf: new Map()
    });

    const bump = (map, key) => {
      let o = map.get(key);
      if (!o) {
        o = blank();
        map.set(key, o);
      }
      return o;
    };

    const cnt = (map, key) => map.set(key, (map.get(key) || 0) + 1);

    for (let j = 0; j < IDX.length; j++) {
      const i = IDX[j];
      const e = E[i];
      const c = C[i];
      const b = B[i];
      const t = T[i];
      const g = G[i];
      const d = DAY[i];

      const ctrl = e === 0 ? 1 : CTRL[c];
      const isNoCtrl = e !== 0 && ctrl === 0;
      const isFaCtrl = e === 1 && ctrl === 1;

      if (e === 0) A.ef++;
      else if (e === 1) A.fa++;
      else A.pe++;

      if (isNoCtrl) A.noCtrl++;
      if (isFaCtrl) A.faCtrl++;

      A.tecs.add(t);
      A.brigs.add(g);
      cnt(A.causa, c);
      cnt(A.sub, S[i]);
      cnt(A.susp, U[i]);
      cnt(A.tipo, O[i]);

      let dd = A.byDay.get(d);
      if (!dd) {
        dd = [0, 0, 0];
        A.byDay.set(d, dd);
      }
      dd[e]++;

      for (const [map, key] of [
        [A.barrio, b],
        [A.tec, t],
        [A.brig, g]
      ]) {
        const o = bump(map, key);
        o.tot++;
        if (e === 0) o.ef++;
        else if (e === 1) o.fa++;
        else o.pe++;

        if (isNoCtrl) o.noCtrl++;
        if (isFaCtrl) o.faCtrl++;

        cnt(o.causa, c);
        cnt(o.tipo, O[i]);
        cnt(o.susp, U[i]);
        if (e === 0) cnt(o.efTipo, O[i]);
        if (e !== 0) cnt(o.sub, S[i]);
        else cnt(o.subEf, S[i]);

        let od = o.day.get(d);
        if (!od) {
          od = [0, 0, 0];
          o.day.set(d, od);
        }
        od[e]++;
        if (M[i] > o.last) o.last = M[i];
      }

      const bo = A.barrio.get(b);
      cnt(bo.tec, t);
      cnt(bo.brig, g);

      let te = bo.tecEf.get(t);
      if (!te) {
        te = { ef: 0, tot: 0, noCtrl: 0 };
        bo.tecEf.set(t, te);
      }
      te.tot++;
      if (e === 0) te.ef++;
      if (isNoCtrl) te.noCtrl++;

      const to = A.tec.get(t);
      to.barrios.add(b);
      cnt(to.brig, g);

      const go = A.brig.get(g);
      go.barrios.add(b);
      cnt(go.tec, t);
    }

    const pct = (x, y) => (y ? (x / y) * 100 : 0);

    for (const m of [A.barrio, A.tec, A.brig]) {
      for (const o of m.values()) {
        o.efPct = pct(o.ef, o.tot);
        o.den = o.tot - o.noCtrl;
        o.efAdj = o.den > 0 ? pct(o.ef, o.den) : 0;
        o.pePct = pct(o.pe, o.tot);
        o.faPct = pct(o.fa, o.tot);
        o.faCtrlPct = pct(o.faCtrl, o.tot);
      }
    }
    A.den = A.tot - A.noCtrl;
    A.efPct = pct(A.ef, A.tot);
    A.efAdj = A.den > 0 ? pct(A.ef, A.den) : 0;
    A.pePct = pct(A.pe, A.tot);
    A.faPct = pct(A.fa, A.tot);

    A.IDX = IDX;
    return A;
  }, [IDX, rawArrays, data]);

  // 3. RISK ENGINE (0-100)
  const ELIG = useMemo(() => {
    if (!data || !rawArrays || !A.barrio.size) return [];
    const elig = [];
    for (const [b, o] of A.barrio) {
      if (o.tot >= st.minOrders) elig.push([b, o]);
    }

    const half = Math.floor((st.d0 + st.d1) / 2);
    const pct = (a, b) => (b ? (a / b) * 100 : 0);

    for (const [, o] of elig) {
      let a1 = 0,
        n1 = 0,
        a2 = 0,
        n2 = 0;
      for (const [d, v] of o.day) {
        const bad = v[1] + v[2];
        const tot = v[0] + v[1] + v[2];
        if (d <= half) {
          a1 += bad;
          n1 += tot;
        } else {
          a2 += bad;
          n2 += tot;
        }
      }
      o.trend = n2 >= 3 && n1 >= 3 ? pct(a2, n2) - pct(a1, n1) : 0;
      let num_ = 0,
        den_ = 0;
      for (const [t, c] of o.tec) {
        const to = A.tec.get(t);
        if (to && to.den > 0) {
          num_ += to.efAdj * c;
          den_ += c;
        }
      }
      o.histTec = den_ ? num_ / den_ : 0;
    }

    const quantile = (sorted, q) => {
      if (!sorted.length) return 0;
      const p = (sorted.length - 1) * q,
        lo = Math.floor(p),
        hi = Math.ceil(p);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
    };

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    const srt = (f) => elig.map(([, o]) => f(o)).sort((a, b) => a - b);
    const faOf = (o) => (st.adjusted ? o.faCtrlPct : o.faPct);
    const refPe = Math.max(quantile(srt((o) => o.pePct), 0.9), 2);
    const refFa = Math.max(quantile(srt(faOf), 0.9), 2);
    const refVo = Math.max(quantile(srt((o) => o.tot), 0.9), 1);
    const refTr = Math.max(
      quantile(
        srt((o) => o.trend).filter((v) => v > 0),
        0.9
      ) || 10,
      5
    );
    const hi = srt((o) => o.histTec);
    const hGood = quantile(hi, 0.9),
      hBad = quantile(hi, 0.1);

    for (const [, o] of A.barrio) {
      o.risk = null;
      o.prio = null;
    }
    for (const [, o] of elig) {
      const rPe = clamp01(o.pePct / refPe);
      const rFa = clamp01(faOf(o) / refFa);
      const rVo = clamp01(o.tot / refVo);
      const rTr = clamp01(o.trend / refTr);
      const rHi =
        hGood > hBad ? 1 - clamp01((o.histTec - hBad) / (hGood - hBad)) : 0;
      o.risk = Math.round(
        100 * (0.4 * rPe + 0.25 * rFa + 0.15 * rVo + 0.1 * rTr + 0.1 * rHi)
      );
      o.parts = {
        pe: 40 * rPe,
        fa: 25 * rFa,
        vol: 15 * rVo,
        tr: 10 * rTr,
        hist: 10 * rHi
      };
      o.prio = o.risk >= 61 ? "Alta" : o.risk >= 31 ? "Media" : "Baja";
    }

    return elig;
  }, [A, IDX, rawArrays, data, st.minOrders, st.hotspot, st.adjusted, st.d0, st.d1]);

  // Zone Average calculations helper
  const zoneAvg = (zonaIdx) => {
    let tot = 0,
      ef = 0,
      pe = 0,
      fa = 0,
      noCtrl = 0;
    if (!data) return { tot, efPct: 0, efAdj: 0, pePct: 0, faPct: 0 };
    for (const [b, o] of A.barrio) {
      if (zonaIdx != null && data.dim.b_zona[b] !== zonaIdx) continue;
      tot += o.tot;
      ef += o.ef;
      pe += o.pe;
      fa += o.fa;
      noCtrl += o.noCtrl;
    }
    const den = tot - noCtrl;
    const pct = (x, y) => (y ? (x / y) * 100 : 0);
    return {
      tot,
      efPct: pct(ef, tot),
      efAdj: den ? pct(ef, den) : 0,
      pePct: pct(pe, tot),
      faPct: pct(fa, tot)
    };
  };

  // Recommended actions generator engine
  const actionsFor = (bIdx, o, z) => {
    const acts = [];
    if (!data || !rawArrays) return acts;
    const { C } = rawArrays;
    const bad = o.tot - o.ef;
    const fam = new Map();

    for (const [c, n] of o.causa) {
      if (data.dim.causas[c] === "Efectiva") continue;
      const f = data.dim.causa_fam[c];
      fam.set(f, (fam.get(f) || 0) + n);
    }
    const f = (k) => fam.get(k) || 0;
    const share = (k) => (bad ? (f(k) / bad) * 100 : 0);
    const n0 = (v) => Math.round(v).toLocaleString("es-CO");
    const n1 = (v) => v.toFixed(1).replace(".", ",");

    if (f("seguridad") > 0 && share("seguridad") >= 30) {
      acts.push({
        lvl: "crit",
        t: "Solicitar acompañamiento policial o gestor social",
        d: `<b>${n0(
          f("seguridad")
        )}</b> órdenes se perdieron por resistencia o agresión del cliente (${n1(
          share("seguridad")
        )}% de las no efectivas).
            Reasignar el técnico <b>no resuelve esto</b>: la causa es de seguridad, no de competencia. Programa estas visitas con acompañamiento.`
      });
    }
    if (share("comercial") >= 35) {
      acts.push({
        lvl: "warn",
        t: "Sincronizar cartera antes del despacho",
        d: `<b>${n0(
          f("comercial")
        )}</b> órdenes fallaron porque el cliente ya había pagado. Son visitas evitables:
            depurar la cartera el mismo día del despacho liberaría cerca de <b>${n0(
              f("comercial")
            )}</b> desplazamientos en este barrio.`
      });
    }
    if (share("acceso") >= 12) {
      acts.push({
        lvl: "warn",
        t: "Programar reintentos en franja alterna",
        d: `<b>${n0(
          f("acceso")
        )}</b> órdenes con acceso impedido o difícil. Reprograma en horario distinto y coordina ingreso
            con portería o administración en multifamiliares.`
      });
    }
    if (share("datos") >= 8) {
      acts.push({
        lvl: "warn",
        t: "Revisar direcciones en catastro",
        d: `<b>${n0(
          f("datos")
        )}</b> órdenes no se ubicaron (suministro no encontrado, servicio inexistente o predio demolido).
            Enviar a validación de datos antes de volver a despachar.`
      });
    }
    if (share("infra") >= 15) {
      acts.push({
        lvl: "warn",
        t: "Reforzar con brigada especializada",
        d: `<b>${n0(
          f("infra")
        )}</b> órdenes con imposibilidad técnica o sin medidor. Asigna brigada pesada o cuadrilla con canasta
            en lugar de brigada liviana.`
      });
    }
    if (o.efAdj < z.efAdj - 8 && o.tot >= st.minOrders) {
      acts.push({
        lvl: "crit",
        t: "Redistribuir carga entre técnicos",
        d: `La efectividad ajustada del barrio (<b>${n1(
          o.efAdj
        )}%</b>) está <b>${n1(
          z.efAdj - o.efAdj
        )} pp</b> por debajo de su zona.
            Aquí sí hay margen operativo: revisa el ranking y reasigna a los técnicos con mejor desempeño ajustado.`
      });
    }
    if (o.trend > 5) {
      acts.push({
        lvl: "crit",
        t: "Priorizar intervención: deterioro sostenido",
        d: `Las órdenes no efectivas subieron <b>${n1(
          o.trend
        )} pp</b> en la segunda mitad del período. Interviene antes de que el barrio
            se consolide como crítico.`
      });
    }
    if (o.tec.size <= 2 && o.tot >= 40) {
      acts.push({
        lvl: "info",
        t: "Ampliar cobertura de técnicos",
        d: `Solo <b>${
          o.tec.size
        }</b> técnico(s) atienden <b>${n0(
          o.tot
        )}</b> órdenes. Un único punto de falla: amplía el pool asignado.`
      });
    }
    if (!acts.length) {
      acts.push({
        lvl: "ok",
        t: "Sin alertas operativas",
        d: "El barrio se comporta dentro de los parámetros de su zona. Mantener el esquema actual de asignación."
      });
    }
    return acts;
  };

  // 4. RECOMMEND ENGINE
  const recommend = (bIdx, tipoIdx, kind) => {
    if (!data || !rawArrays) return [];
    const muni = data.dim.b_muni[bIdx];
    const zona = data.dim.b_zona[bIdx];
    const { B, O, T, G, E, C, M } = rawArrays;
    const CTRL = data.dim.causa_ctrl;

    const levels = [
      {
        name: "este barrio y este tipo de orden",
        test: (i) => B[i] === bIdx && (tipoIdx < 0 || O[i] === tipoIdx)
      },
      { name: "este barrio (todos los tipos)", test: (i) => B[i] === bIdx },
      {
        name: "este municipio y este tipo de orden",
        test: (i) => data.dim.b_muni[B[i]] === muni && (tipoIdx < 0 || O[i] === tipoIdx)
      },
      {
        name: "esta zona y este tipo de orden",
        test: (i) => data.dim.b_zona[B[i]] === zona && (tipoIdx < 0 || O[i] === tipoIdx)
      }
    ];

    const wilson = (s, n) => {
      if (!n) return 0;
      const z = 1.96,
        p = s / n;
      const d = 1 + (z * z) / n;
      const c = p + (z * z) / (2 * n);
      const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
      return Math.max(0, (c - m) / d);
    };

    const pct = (x, y) => (y ? (x / y) * 100 : 0);

    for (const lv of levels) {
      const agg = new Map();
      for (let j = 0; j < IDX.length; j++) {
        const i = IDX[j];
        if (!lv.test(i)) continue;
        const key = kind === "tec" ? T[i] : G[i];
        let o = agg.get(key);
        if (!o) {
          o = { n: 0, ef: 0, noCtrl: 0, last: -1, pe: 0 };
          agg.set(key, o);
        }
        const ctrl = E[i] === 0 ? 1 : CTRL[C[i]];
        if (E[i] !== 0 && ctrl === 0) o.noCtrl++;
        o.n++;
        if (E[i] === 0) o.ef++;
        if (E[i] === 2) o.pe++;
        if (M[i] > o.last) o.last = M[i];
      }

      const rows = [];
      for (const [key, o] of agg) {
        const den = o.n - o.noCtrl;
        if (den < 3) continue;
        const w = wilson(o.ef, den);
        rows.push({
          key,
          name: kind === "tec" ? data.dim.tecs[key] : data.dim.brigs[key],
          n: o.n,
          den,
          ef: o.ef,
          pe: o.pe,
          efAdj: pct(o.ef, den),
          score: w * 100,
          last: o.last,
          conf:
            den >= 30 && w >= 0.75
              ? "Alta"
              : den >= 10 && w >= 0.55
              ? "Media"
              : "Baja",
          scope: lv.name
        });
      }
      if (rows.length >= 2) {
        rows.sort((a, b) => b.score - a.score);
        return rows;
      }
    }
    return [];
  };

  // 5. TECH COV / ROUTES ENGINE
  const techRoute = (tIdx) => {
    const res = { pts: [], legs: [], km: 0, medMin: 0, days: 0 };
    if (!data || !rawArrays) return res;
    const { T, M, DAY } = rawArrays;
    const pts = [];

    for (let j = 0; j < IDX.length; j++) {
      const i = IDX[j];
      if (T[i] === tIdx) pts.push(i);
    }
    pts.sort((a, b) => M[a] - M[b]);

    const days = new Map();
    for (const i of pts) {
      const d = DAY[i];
      if (!days.has(d)) days.set(d, []);
      days.get(d).push(i);
    }

    const haversine = (a1, o1, a2, o2) => {
      const R = 6371,
        tr = Math.PI / 180;
      const dLa = (a2 - a1) * tr,
        dLo = (o2 - o1) * tr;
      const h =
        Math.sin(dLa / 2) ** 2 +
        Math.cos(a1 * tr) * Math.cos(a2 * tr) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    let km = 0;
    const gaps = [];
    const legs = [];

    for (const [, arr] of days) {
      for (let k = 1; k < arr.length; k++) {
        const a = arr[k - 1],
          b = arr[k];
        const dist = haversine(lat(a), lon(a), lat(b), lon(b));
        const dt = M[b] - M[a];
        if (dist < 60) km += dist; // descarta saltos absurdos de GPS
        if (dt >= 2 && dt <= 240) gaps.push(dt);
      }
      if (arr.length > 1) legs.push(arr);
    }

    gaps.sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    return { pts, legs, km, medMin: med, days: days.size };
  };

  // Helper date formatter
  const dayLabel = (d) => {
    const D0 = new Date("2026-05-01T00:00:00");
    const x = new Date(D0.getTime() + d * 86400000);
    return x.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  };

  // State update handler
  const handleFilterChange = (key, value) => {
    setSt((prev) => {
      const next = { ...prev, [key]: value };

      // Cascade resets
      if (key === "zona") {
        next.muni = "";
        next.brig = "";
        next.selBarrio = null;
      }
      if (key === "muni") {
        next.brig = "";
        next.selBarrio = null;
      }
      if (key === "minOrders" || key === "adjusted") {
        next.selBarrio = null;
      }
      return next;
    });
  };

  const handleSelectBarrio = (b) => {
    setSt((prev) => {
      // Segundo clic sobre el mismo barrio → quitar la selección y volver a
      // mostrar todos los barrios y sus límites.
      if (prev.selBarrio === b) {
        return { ...prev, selBarrio: null, jerBarrio: null };
      }
      return {
        ...prev,
        selBarrio: b,
        tab: "barrio",
        // Sync hierarchy tab
        jerBarrio: b,
        jerBrig: null
      };
    });
  };

  // Limpia solo el barrio remarcado (sin tocar el resto de filtros)
  const handleClearBarrio = () => {
    setSt((prev) => ({ ...prev, selBarrio: null, jerBarrio: null }));
  };

  const handleReset = () => {
    setSt((prev) => ({
      ...prev,
      zona: "",
      muni: "",
      brig: "",
      tipo: "",
      minOrders: 10,
      hotspot: 60,
      adjusted: true,
      selBarrio: null,
      selTec: null
    }));
  };

  if (loading) {
    return (
      <div
        style={{
          background: "var(--bg)",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "18px",
          padding: "0 24px",
          textAlign: "center",
          color: "var(--cu2)"
        }}
      >
        <Image
          src={isesSymbol}
          alt="ISES"
          priority
          className="ises-spin"
          style={{ width: "clamp(56px,14vw,78px)", height: "auto" }}
        />
        <div
          style={{
            fontFamily: "var(--ff)",
            fontWeight: 700,
            fontSize: "clamp(15px,4vw,22px)",
            letterSpacing: ".18em"
          }}
        >
          CARGANDO VISOR OPERATIVO
        </div>
      </div>
    );
  }

  // Inject computed parameters to pass into state
  const computedSt = {
    ...st,
    totalLoaded: data.meta.total,
    fechaMin: data.meta.fecha_min,
    fechaMax: data.meta.fecha_max,
    lat,
    lon,
    // Add raw properties needed by Dock hierarchy
    B_raw: rawArrays.B,
    G_raw: rawArrays.G,
    T_raw: rawArrays.T,
    E_raw: rawArrays.E,
    ORD_raw: rawArrays.ORD,
    C_raw: rawArrays.C,
    S_raw: rawArrays.S,
    DAY_raw: rawArrays.DAY,
    M_raw: rawArrays.M,
    APPROX_raw: rawArrays.APPROX,
    O_raw: rawArrays.O,
    U_raw: rawArrays.U,
    F_raw: rawArrays.F,
    NIC_raw: rawArrays.NIC
  };

  const handleSelectNic = (nic) => {
    setSt((prev) => ({
      ...prev,
      selNic: nic,
      tab: "nic"
    }));
  };

  const MAXDAY = Math.max(...rawArrays.DAY);

  return (
    <div id="app">
      <Topbar
        st={computedSt}
        dim={data.dim}
        avail={avail}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        MAXDAY={MAXDAY}
        dayLabel={dayLabel}
      />

      <KPIStrip A={A} />

      <main id="main">
        <RiskSpine
          ELIG={ELIG}
          st={computedSt}
          dim={data.dim}
          onFilterChange={handleFilterChange}
          onSelectBarrio={handleSelectBarrio}
        />

        <section id="center">
          <LeafletMap
            A={A}
            st={computedSt}
            dim={data.dim}
            geo={data.geo}
            onSelectBarrio={handleSelectBarrio}
            onSelectNic={handleSelectNic}
            onFilterChange={handleFilterChange}
            dayLabel={dayLabel}
          />

          {st.selBarrio != null && (
            <button
              type="button"
              onClick={handleClearBarrio}
              title="Mostrar todos los barrios y sus límites"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                zIndex: 800,
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "7px 11px",
                background: "var(--overlay)",
                border: "1px solid var(--line2)",
                borderRadius: "var(--r)",
                color: "var(--cu2)",
                cursor: "pointer",
                font: "600 12px var(--ff)",
                letterSpacing: ".04em",
                backdropFilter: "blur(6px)",
                boxShadow: "var(--shadow)"
              }}
            >
              <span style={{ fontSize: "14px", lineHeight: 1 }}>✕</span>
              Ver todos los barrios
            </button>
          )}

          <div id="layers" style={layersCollapsed ? { width: "auto", minWidth: 0 } : undefined}>
            <button
              type="button"
              onClick={() => setLayersCollapsed((v) => !v)}
              title={layersCollapsed ? "Mostrar capas" : "Ocultar capas"}
              aria-expanded={!layersCollapsed}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                margin: layersCollapsed ? 0 : "0 0 8px",
                color: "var(--cu2)",
                cursor: "pointer",
                font: "inherit",
                fontFamily: "var(--ff)",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: ".14em",
                textTransform: "uppercase"
              }}
            >
              <span>Capas</span>
              <span
                style={{
                  fontSize: "11px",
                  lineHeight: 1,
                  transform: layersCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                  transition: "transform .15s ease"
                }}
              >
                ▸
              </span>
            </button>

            {!layersCollapsed && (
            <>
            <h4>Órdenes a mostrar</h4>
            <label className="lay">
              <input
                type="checkbox"
                checked={st.est[2]}
                onChange={(e) => {
                  const est = [...st.est];
                  est[2] = e.target.checked;
                  handleFilterChange("est", est);
                }}
              />
              <span className="sw" style={{ background: P.st[2] }}></span>
              Perdidas
            </label>
            <label className="lay">
              <input
                type="checkbox"
                checked={st.est[1]}
                onChange={(e) => {
                  const est = [...st.est];
                  est[1] = e.target.checked;
                  handleFilterChange("est", est);
                }}
              />
              <span className="sw" style={{ background: P.st[1] }}></span>
              Fallidas
            </label>
            <label className="lay">
              <input
                type="checkbox"
                checked={st.est[0]}
                onChange={(e) => {
                  const est = [...st.est];
                  est[0] = e.target.checked;
                  handleFilterChange("est", est);
                }}
              />
              <span className="sw" style={{ background: P.st[0] }}></span>
              Efectivas
            </label>

            <div className="lgrp">
              <h4>Cómo dibujarlas</h4>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.markers}
                  onChange={(e) => {
                    const layers = { ...st.layers, markers: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Marcadores por barrio
              </label>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.heat}
                  onChange={(e) => {
                    const layers = { ...st.layers, heat: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Mapa de calor
              </label>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.gps}
                  onChange={(e) => {
                    const layers = { ...st.layers, gps: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                GPS reales
              </label>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.approx}
                  onChange={(e) => {
                    const layers = { ...st.layers, approx: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Ubicaciones aproximadas
              </label>
              <p className="lay-nota">
                Los <b>marcadores</b> resumen cada barrio (clic → análisis). Los{" "}
                <b>puntos GPS</b> son órdenes sueltas (clic → detalle de la orden).
              </p>
            </div>

            <div className="lgrp">
              <h4>Límites oficiales</h4>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.zpoly}
                  onChange={(e) => {
                    const layers = { ...st.layers, zpoly: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Zonas
              </label>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.bpoly}
                  onChange={(e) => {
                    const layers = { ...st.layers, bpoly: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Barrios
              </label>
              <label className="lay">
                <input
                  type="checkbox"
                  checked={st.layers.mpoly}
                  onChange={(e) => {
                    const layers = { ...st.layers, mpoly: e.target.checked };
                    handleFilterChange("layers", layers);
                  }}
                />
                Municipios
              </label>
            </div>

            <div className="lgrp" id="legend">
              <h4>Índice de riesgo</h4>
              <div>
                <i style={{ background: P.st[0] }}></i> 0–30 &middot; Bajo
              </div>
              <div>
                <i style={{ background: P.st[1] }}></i> 31–60 &middot; Medio
              </div>
              <div>
                <i style={{ background: P.st[2] }}></i> 61–100 &middot; Alto
              </div>
            </div>
            </>
            )}
          </div>

          <Dock
            A={A}
            st={computedSt}
            dim={data.dim}
            dayLabel={dayLabel}
            onFilterChange={handleFilterChange}
            onSelectBarrio={handleSelectBarrio}
          />
        </section>

        <DetailsPanel
          st={computedSt}
          A={A}
          ELIG={ELIG}
          dim={data.dim}
          geo={data.geo}
          dayLabel={dayLabel}
          recommend={recommend}
          techRoute={techRoute}
          zoneAvg={zoneAvg}
          actionsFor={actionsFor}
          onFilterChange={handleFilterChange}
          onSelectBarrio={handleSelectBarrio}
          onSelectNic={handleSelectNic}
        />
      </main>
    </div>
  );
}