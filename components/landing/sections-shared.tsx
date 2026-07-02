"use client";

/**
 * components/landing/sections-shared.tsx
 *
 * Secciones COMPARTIDAS entre templates de Business Case (registradas por
 * `sectionType`, no por key): arquitectura tecnológica/de conexión y mapeo de
 * procesos. Data-driven (cards + flechas CSS), sin imágenes. Mismo contrato que
 * sections.tsx: vista pulida en lectura + edición inline en modo `editable`.
 */
import { type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import type { SectionProps, TechArchitectureData, ProcessMappingData, UseCasesData } from "./types";

// ── Arquitectura tecnológica / de conexión ──────────────────────────────────
export const TechArchitectureSection: FC<SectionProps<TechArchitectureData>> = ({ data, editable, onChange }) => {
  const nodos = data.nodos ?? [];
  const flujos = data.flujos ?? [];
  const fuera = data.fueraDeAlcance ?? [];
  const opcionales = data.opcionales ?? [];
  const set = (next: Partial<TechArchitectureData>) => onChange?.({ ...data, ...next });

  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="Cómo se conectan los sistemas involucrados…" onCommit={(v) => set({ intro: v })} />

      {/* Sistemas involucrados */}
      <div className="stl-grid stl-grid-3">
        {nodos.map((n, i) => (
          <div key={i} className="stl-item stl-card">
            {editable && <RemoveBtn onClick={() => set({ nodos: removeAt(nodos, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={n.nombre}
              placeholder="Sistema (Sitio / CRM / ERP)…" onCommit={(v) => set({ nodos: replaceAt(nodos, i, { ...n, nombre: v }) })} />
            <Editable as="div" className="stl-field-label" editable={editable} value={n.rol}
              placeholder="Rol en la arquitectura…" onCommit={(v) => set({ nodos: replaceAt(nodos, i, { ...n, rol: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={n.detalle}
              placeholder="Qué hace / qué datos maneja…" onCommit={(v) => set({ nodos: replaceAt(nodos, i, { ...n, detalle: v }) })} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar sistema" onClick={() => set({ nodos: appendItem(nodos, { nombre: "", rol: "", detalle: "" }) })} />}

      {/* Flujo de información */}
      {(flujos.length > 0 || editable) && (
        <div style={{ marginTop: 28 }}>
          <div className="stl-field-label">Flujo de información</div>
          {flujos.map((f, i) => (
            <div key={i} className="stl-item stl-flow-row">
              {editable && <RemoveBtn onClick={() => set({ flujos: removeAt(flujos, i) })} />}
              <Editable as="span" className="stl-flow-node" editable={editable} value={f.desde}
                placeholder="Origen…" onCommit={(v) => set({ flujos: replaceAt(flujos, i, { ...f, desde: v }) })} />
              <span className="stl-flow-arrow">→</span>
              <Editable as="span" className="stl-flow-node" editable={editable} value={f.hacia}
                placeholder="Destino…" onCommit={(v) => set({ flujos: replaceAt(flujos, i, { ...f, hacia: v }) })} />
              <Editable as="span" className="stl-flow-desc" editable={editable} value={f.descripcion}
                placeholder="Qué viaja y cuándo…" onCommit={(v) => set({ flujos: replaceAt(flujos, i, { ...f, descripcion: v }) })} />
            </div>
          ))}
          {editable && <AddBtn label="Agregar flujo" onClick={() => set({ flujos: appendItem(flujos, { desde: "", hacia: "", descripcion: "" }) })} />}
        </div>
      )}

      {/* Fuera de alcance + opcionales */}
      {(fuera.length > 0 || opcionales.length > 0 || editable) && (
        <div className="stl-grid stl-grid-2" style={{ marginTop: 28 }}>
          <div className="stl-field-card">
            <div className="stl-field-label">Fuera de alcance</div>
            <ul className="stl-ba-list">
              {fuera.map((t, i) => (
                <li key={i} className="stl-item stl-plain-li">
                  {editable && <RemoveBtn onClick={() => set({ fueraDeAlcance: removeAt(fuera, i) })} />}
                  <Editable as="span" editable={editable} value={t} placeholder="Qué NO incluye esta fase…"
                    onCommit={(v) => set({ fueraDeAlcance: replaceAt(fuera, i, v) })} />
                </li>
              ))}
            </ul>
            {editable && <AddBtn label="Agregar" onClick={() => set({ fueraDeAlcance: appendItem(fuera, "") })} />}
          </div>
          <div className="stl-field-card">
            <div className="stl-field-label">Opcionales / a futuro</div>
            <ul className="stl-ba-list">
              {opcionales.map((o, i) => (
                <li key={i} className="stl-item stl-plain-li">
                  {editable && <RemoveBtn onClick={() => set({ opcionales: removeAt(opcionales, i) })} />}
                  <Editable as="span" editable={editable} value={o.nombre} placeholder="Integración / módulo…"
                    onCommit={(v) => set({ opcionales: replaceAt(opcionales, i, { ...o, nombre: v }) })} />
                  {(o.detalle || editable) && (
                    <>
                      {" — "}
                      <Editable as="span" editable={editable} value={o.detalle} placeholder="detalle…"
                        onCommit={(v) => set({ opcionales: replaceAt(opcionales, i, { ...o, detalle: v }) })} />
                    </>
                  )}
                </li>
              ))}
            </ul>
            {editable && <AddBtn label="Agregar" onClick={() => set({ opcionales: appendItem(opcionales, { nombre: "", detalle: "" }) })} />}
          </div>
        </div>
      )}
    </>
  );
};

// ── Casos de uso del catálogo (sección determinística) ──────────────────────
// La escribe el generate con los seleccionados del checklist; acá solo se
// renderiza/edita (retocar texto/precio o borrar un caso antes de publicar).
export const UseCasesSection: FC<SectionProps<UseCasesData>> = ({ data, editable, onChange }) => {
  const items = data.items ?? [];
  const set = (next: Partial<UseCasesData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        {items.map((it, i) => (
          <div key={i} className="stl-item stl-field-card">
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
                placeholder="Caso de uso…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
              {(it.price || editable) && (
                <Editable as="span" className="stl-invest-amount" editable={editable} value={it.price ?? ""}
                  placeholder="Precio…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, price: v }) })} />
              )}
            </div>
            <Editable as="p" className="stl-card-detail" editable={editable} value={it.detail ?? ""}
              placeholder="Qué incluye / qué resuelve…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })} />
          </div>
        ))}
      </div>
      {editable && (
        <AddBtn label="Agregar caso de uso" onClick={() => set({ items: appendItem(items, { title: "", detail: "", price: "" }) })} />
      )}
    </>
  );
};

// ── Mapeo de procesos (opcional) ─────────────────────────────────────────────
export const ProcessMappingSection: FC<SectionProps<ProcessMappingData>> = ({ data, editable, onChange }) => {
  const procesos = data.procesos ?? [];
  const set = (next: Partial<ProcessMappingData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="Qué procesos del cliente cambian con la implementación…" onCommit={(v) => set({ intro: v })} />
      {procesos.map((p, i) => (
        <div key={i} className="stl-item stl-cmp-row" style={{ marginTop: i === 0 ? 24 : 26 }}>
          {editable && <RemoveBtn onClick={() => set({ procesos: removeAt(procesos, i) })} />}
          <Editable as="h3" className="stl-cmp-aspect" editable={editable} value={p.nombre}
            placeholder="Proceso (ventas, cobranza, onboarding…)…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, nombre: v }) })} />
          <div className="stl-cmp">
            <div className="stl-cmp-now">
              <div className="stl-cmp-label">Hoy</div>
              <Editable as="p" className="stl-cmp-text" editable={editable} value={p.comoEsHoy}
                placeholder="Cómo funciona hoy…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, comoEsHoy: v }) })} />
            </div>
            <div className="stl-cmp-future">
              <div className="stl-cmp-label">Con la implementación</div>
              <Editable as="p" className="stl-cmp-text" editable={editable} value={p.comoSera}
                placeholder="Cómo quedará…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, comoSera: v }) })} />
            </div>
          </div>
          {(p.sistemas || editable) && (
            <div className="stl-invest-detail" style={{ marginTop: 8 }}>
              <Editable as="span" editable={editable} value={p.sistemas}
                placeholder="Sistemas involucrados…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, sistemas: v }) })} />
            </div>
          )}
        </div>
      ))}
      {editable && <AddBtn label="Agregar proceso" onClick={() => set({ procesos: appendItem(procesos, { nombre: "", comoEsHoy: "", comoSera: "", sistemas: "" }) })} />}
    </>
  );
};
