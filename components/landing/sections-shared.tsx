"use client";

/**
 * components/landing/sections-shared.tsx
 *
 * Secciones COMPARTIDAS entre templates de Business Case (registradas por
 * `sectionType`, no por key): arquitectura tecnológica/de conexión y mapeo de
 * procesos. Data-driven (cards + flechas CSS), sin imágenes. Mismo contrato que
 * sections.tsx: vista pulida en lectura + edición inline en modo `editable`.
 */
import { Fragment, type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { landingLang, t } from "./i18n";
import type { SectionProps, TechArchitectureData, ProcessMappingData, UseCasesData } from "./types";

// ── Arquitectura tecnológica / de conexión — CADENA con flechas ─────────────
export const TechArchitectureSection: FC<SectionProps<TechArchitectureData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  // Fallback LEGACY: data v1 (nodos + flujos separados) se aplana a la cadena.
  const cadena =
    data.cadena?.length
      ? data.cadena
      : (data.nodos ?? []).map((n) => ({ actor: n.rol, titulo: n.nombre, detalle: n.detalle }));
  const fuera = data.fueraDeAlcance ?? [];
  const opcionales = data.opcionales ?? [];
  const set = (next: Partial<TechArchitectureData>) => onChange?.({ ...data, ...next });
  // Escribir la cadena LIMPIA el legacy (`nodos`): si no, vaciar la lista resucita
  // los nodos v1 aplanados (imposible borrar el último paso).
  const setCadena = (list: { actor: string; titulo: string; detalle: string }[]) => set({ cadena: list, nodos: [] });

  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="La idea central en 1-2 frases…" onCommit={(v) => set({ intro: v })} />

      {/* Cadena del flujo: cards con chip de actor + flechas. En modo drag, la
          flecha viaja DENTRO del wrapper (flex) para que el layout no cambie. */}
      <SortableItems items={cadena} disabled={!editable} onReorder={(next) => setCadena(next)}
        itemStyle={{ display: "flex", alignItems: "stretch", gap: 12, flex: "1 1 190px", minWidth: 190 }}
        container={(nodes) => <div className="stl-chain">{nodes}</div>}>
        {(c, i, handle) => (
          <Fragment>
            {i > 0 && <span className="stl-chain-arrow" aria-hidden>→</span>}
            <div className="stl-item stl-chain-card" style={editable ? { flex: 1 } : undefined}>
              {handle}
              {editable && <RemoveBtn onClick={() => setCadena(removeAt(cadena, i))} />}
              <Editable as="span" className="stl-chain-actor" editable={editable} value={c.actor}
                placeholder="Actor…" onCommit={(v) => setCadena(replaceAt(cadena, i, { ...c, actor: v }))} />
              <Editable as="h3" className="stl-chain-title" editable={editable} value={c.titulo}
                placeholder="Qué pasa (3-6 palabras)…" onCommit={(v) => setCadena(replaceAt(cadena, i, { ...c, titulo: v }))} />
              <Editable as="p" className="stl-chain-detail" editable={editable} value={c.detalle}
                placeholder="Detalle (1 línea)…" onCommit={(v) => setCadena(replaceAt(cadena, i, { ...c, detalle: v }))} />
            </div>
          </Fragment>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar paso" onClick={() => setCadena(appendItem(cadena, { actor: "", titulo: "", detalle: "" }))} />}

      {/* Fuera de alcance + opcionales */}
      {(fuera.length > 0 || opcionales.length > 0 || editable) && (
        <div className="stl-grid stl-grid-2" style={{ marginTop: 28 }}>
          <div className="stl-field-card">
            <div className="stl-field-label">{t(lang, "fueraDeAlcance")}</div>
            <SortableItems items={fuera} disabled={!editable} onReorder={(next) => set({ fueraDeAlcance: next })}
              container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
              {(txt, i, handle) => (
                <div className="stl-item stl-plain-li">
                  {handle}
                  {editable && <RemoveBtn onClick={() => set({ fueraDeAlcance: removeAt(fuera, i) })} />}
                  <Editable as="span" editable={editable} value={txt} placeholder="Qué NO incluye esta fase…"
                    onCommit={(v) => set({ fueraDeAlcance: replaceAt(fuera, i, v) })} />
                </div>
              )}
            </SortableItems>
            {editable && <AddBtn label="Agregar" onClick={() => set({ fueraDeAlcance: appendItem(fuera, "") })} />}
          </div>
          <div className="stl-field-card">
            <div className="stl-field-label">{t(lang, "opcionales")}</div>
            <SortableItems items={opcionales} disabled={!editable} onReorder={(next) => set({ opcionales: next })}
              container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
              {(o, i, handle) => (
                <div className="stl-item stl-plain-li">
                  {handle}
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
                </div>
              )}
            </SortableItems>
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
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
        {(it, i, handle) => (
          <div className="stl-item stl-field-card">
            {handle}
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
        )}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar caso de uso" onClick={() => set({ items: appendItem(items, { title: "", detail: "", price: "" }) })} />
      )}
    </>
  );
};

// ── Mapeo de procesos (opcional) ─────────────────────────────────────────────
export const ProcessMappingSection: FC<SectionProps<ProcessMappingData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const procesos = data.procesos ?? [];
  const set = (next: Partial<ProcessMappingData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="Qué procesos del cliente cambian con la implementación…" onCommit={(v) => set({ intro: v })} />
      <SortableItems items={procesos} disabled={!editable} onReorder={(next) => set({ procesos: next })}
        container={(nodes) => <>{nodes}</>}>
        {(p, i, handle) => (
        <div className="stl-item stl-cmp-row" style={{ marginTop: i === 0 ? 24 : 26 }}>
          {handle}
          {editable && <RemoveBtn onClick={() => set({ procesos: removeAt(procesos, i) })} />}
          <Editable as="h3" className="stl-cmp-aspect" editable={editable} value={p.nombre}
            placeholder="Proceso (ventas, cobranza, onboarding…)…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, nombre: v }) })} />
          <div className="stl-cmp">
            <div className="stl-cmp-now">
              <div className="stl-cmp-label">{t(lang, "hoy")}</div>
              <Editable as="p" className="stl-cmp-text" editable={editable} value={p.comoEsHoy}
                placeholder="Cómo funciona hoy…" onCommit={(v) => set({ procesos: replaceAt(procesos, i, { ...p, comoEsHoy: v }) })} />
            </div>
            <div className="stl-cmp-future">
              <div className="stl-cmp-label">{t(lang, "conImplementacion")}</div>
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
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar proceso" onClick={() => set({ procesos: appendItem(procesos, { nombre: "", comoEsHoy: "", comoSera: "", sistemas: "" }) })} />}
    </>
  );
};
