"use client";

import React from "react";

import { useTheme } from "@/lib/theme";

export default function Topbar({
  st,
  dim,
  avail,
  onFilterChange,
  onReset,
  MAXDAY,
  dayLabel,
}) {
  const { theme, toggle } = useTheme();

  const handleRangeChange = (key, value) => {
    let newD0 = st.d0;
    let newD1 = st.d1;
    if (key === "d0") newD0 = +value;
    if (key === "d1") newD1 = +value;
    
    onFilterChange("d0", Math.min(newD0, newD1));
    onFilterChange("d1", Math.max(newD0, newD1));
  };

  return (
    <header id="top">
      <div className="brand">
        <b>ISES <i>|</i> AIR<i>·</i>E <i>|</i> SCR</b>
        <span>Centro Operativo</span>
      </div>
      <div id="meta">
        {st.totalLoaded.toLocaleString("es-CO")} órdenes · {st.fechaMin} a {st.fechaMax} · {dim.barrios.length} barrios · {dim.tecs.length} técnicos
      </div>
      <div className="sp"></div>

      <div className="f">
        <label>Zona</label>
        <select
          value={st.zona}
          onChange={(e) => onFilterChange("zona", e.target.value)}
        >
          <option value="">Todas las zonas ({avail.zona.size})</option>
          {dim.zonas.map((name, i) =>
            avail.zona.has(i) ? (
              <option key={i} value={i}>
                {name}
              </option>
            ) : null
          )}
        </select>
      </div>

      <div className="f">
        <label>Municipio</label>
        <select
          value={st.muni}
          onChange={(e) => onFilterChange("muni", e.target.value)}
        >
          <option value="">Todos los municipios ({avail.muni.size})</option>
          {dim.munis.map((name, i) =>
            avail.muni.has(i) ? (
              <option key={i} value={i}>
                {name}
              </option>
            ) : null
          )}
        </select>
      </div>

      <div className="f">
        <label>Brigada</label>
        <select
          value={st.brig}
          onChange={(e) => onFilterChange("brig", e.target.value)}
        >
          <option value="">Todas las brigadas ({avail.brig.size})</option>
          {dim.brigs.map((name, i) =>
            avail.brig.has(i) ? (
              <option key={i} value={i}>
                {name}
              </option>
            ) : null
          )}
        </select>
      </div>

      <div className="f">
        <label>Tipo OS</label>
        <select
          value={st.tipo}
          onChange={(e) => onFilterChange("tipo", e.target.value)}
        >
          <option value="">Todos los tipos ({avail.tipo.size})</option>
          {dim.tipos.map((name, i) =>
            avail.tipo.has(i) ? (
              <option key={i} value={i}>
                {name}
              </option>
            ) : null
          )}
        </select>
      </div>

      <div className="f dates">
        <label>
          Rango de fechas · <span id="dateLabel">{dayLabel(st.d0)} – {dayLabel(st.d1)}</span>
        </label>
        <div className="rr">
          <input
            type="range"
            min="0"
            max={MAXDAY}
            value={st.d0}
            onChange={(e) => handleRangeChange("d0", e.target.value)}
          />
          <input
            type="range"
            min="0"
            max={MAXDAY}
            value={st.d1}
            onChange={(e) => handleRangeChange("d1", e.target.value)}
          />
        </div>
      </div>

      <button className="btn" onClick={onReset}>
        Reiniciar filtros
      </button>

      <button
        type="button"
        className="theme-btn"
        onClick={toggle}
        aria-pressed={theme === "light"}
        title={theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      >
        <span aria-hidden="true">{theme === "light" ? "◑" : "◐"}</span>
        {theme === "light" ? "Tema claro" : "Tema oscuro"}
      </button>
    </header>
  );
}
