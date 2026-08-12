"use client";

/**
 * components/landing/sections-hubs.tsx — la sección "Qué se implementa" de la propuesta
 * de HubSpot: una píldora por Hub vendido y, debajo, la columna con lo que se implementa
 * en cada uno.
 *
 * Las píldoras las usan los DOS lados, y significan cosas distintas:
 *
 * | superficie        | la píldora…                       | estado inicial              |
 * |-------------------|-----------------------------------|-----------------------------|
 * | editor            | elige qué Hubs van (`activos`)    | los guardados               |
 * | cliente (externo) | explora: abre y cierra la columna | todas las activas, abiertas |
 * | PDF               | NO se pinta                       | todas las activas, abiertas |
 *
 * La regla del PDF es la que evita el peor bug posible: una píldora que esconde
 * contenido en un PDF es contenido PERDIDO, y nadie se entera. Mismo criterio que
 * `DiagramSection` con su variante estática.
 *
 * La rama LEGACY (los 4 campos de texto de la v1) no es cortesía: `configForSnapshot`
 * resuelve por KEY contra la config viva, así que las propuestas YA PUBLICADAS estrenan
 * este componente. Sin esa rama, se les vaciaría la sección. Ver lib/landing/hubs-solucion.ts.
 */
import { useState, type CSSProperties, type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { landingLang, t } from "./i18n";
import {
  columnaKey,
  columnasActivas,
  esSolucionLegacy,
  hubColumnas,
  hubVisual,
  parseCanales,
} from "@/lib/landing/hubs-solucion";
import type { HubCard, HubColumna, HubsClienteData, SectionProps } from "./types";

// ── La versión v1: cuatro campos de texto ────────────────────────────────────
// Es el cuerpo que tenía `SolutionSection`, mudado tal cual. Solo LECTURA/edición de lo
// que ya existe: nada vuelve a escribir estas keys (`generate/route.ts` las excluye del
// carry-forward, así que una regeneración las deja atrás para siempre).
const SolucionLegacy: FC<SectionProps<HubsClienteData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const set = (next: Partial<HubsClienteData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-grid stl-grid-2">
      <TextCard label={t(lang, "hubsIncluidos")} value={data.hubs ?? ""} editable={editable} placeholder="Sales / Marketing / Service / Data Hub…" onCommit={(v) => set({ hubs: v })} />
      <TextCard label={t(lang, "integracionesClave")} value={data.integraciones ?? ""} editable={editable} placeholder="ERP / WhatsApp / sistema mencionado…" onCommit={(v) => set({ integraciones: v })} />
      <TextCard label={t(lang, "casosDeUsoPrincipales")} value={data.casosDeUso ?? ""} editable={editable} placeholder="Pipeline / seguimiento / automatización / reportería…" onCommit={(v) => set({ casosDeUso: v })} />
      <TextCard label={t(lang, "usuariosAfectados")} value={data.usuarios ?? ""} editable={editable} placeholder="Roles: vendedores, gerencia, CS…" onCommit={(v) => set({ usuarios: v })} />
    </div>
  );
};

function TextCard({
  label, value, editable, onCommit, placeholder,
}: { label: string; value: string; editable?: boolean; onCommit: (v: string) => void; placeholder: string }) {
  return (
    <div className="stl-field-card">
      <div className="stl-field-label">{label}</div>
      <Editable as="div" className="stl-field-value" editable={editable} value={value ?? ""} placeholder={placeholder} onCommit={onCommit} />
    </div>
  );
}

// ── La sección ───────────────────────────────────────────────────────────────
export const HubsClienteSection: FC<SectionProps<HubsClienteData>> = (props) => {
  const { data, ctx, editable, onChange } = props;

  // Qué columnas tiene ABIERTAS el lector. `null` = todavía no tocó nada → mandan las
  // vendidas. Solo aplica en lectura: en el editor se muestran todas para poder
  // editarlas, y en el PDF no hay clics.
  const [abiertasOverride, setAbiertasOverride] = useState<string[] | null>(null);

  if (esSolucionLegacy(data)) return <SolucionLegacy {...props} />;

  const columnas = hubColumnas(data);
  const activas = columnasActivas(columnas, data.activos);
  const set = (next: Partial<HubsClienteData>) => onChange?.({ ...data, columnas, ...next });

  const activasKeys = new Set(activas.map(columnaKey));
  // Lo que el lector tiene abierto: mientras no toque nada, exactamente lo vendido.
  const abiertas = abiertasOverride ?? activas.map(columnaKey);
  // En edición se pintan TODAS —las apagadas, atenuadas—: el CSE tiene que ver lo que
  // apagó para poder devolverlo, y así `visibles === columnas`, que es lo que vuelve
  // seguro el reordenar (un reorder sobre un SUBCONJUNTO borraría las que no están).
  // En el PDF, SOLO lo vendido: el documento formal no lista Hubs que nadie compró.
  const visibles = editable
    ? columnas
    : ctx.pdfMode
      ? activas
      : columnas.filter((c) => abiertas.includes(columnaKey(c)));

  const toggle = (c: HubColumna) => {
    const key = columnaKey(c);
    if (editable) {
      // El editor escribe la CURADURÍA: qué se le vendió al cliente. `activos` arranca
      // ausente (= todas), así que la primera vez hay que materializar la lista completa
      // antes de sacarle una — si no, apagar la primera dejaría encendida solo a ella.
      const base = Array.isArray(data.activos) ? data.activos : columnas.map(columnaKey);
      set({ activos: base.includes(key) ? base.filter((k) => k !== key) : [...base, key] });
      return;
    }
    // En lectura la píldora no cambia lo vendido: abre y cierra. Un Hub que NO se vendió
    // también se puede abrir —para eso está— y su columna lo declara con un chip.
    setAbiertasOverride((prev) => {
      const base = prev ?? activas.map(columnaKey);
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  };

  const setColumna = (i: number, next: HubColumna) => set({ columnas: replaceAt(columnas, i, next) });

  return (
    <>
      <Editable
        as="p"
        className="stl-intro"
        editable={editable}
        value={data.intro ?? ""}
        placeholder="Una frase que conecte estos Hubs con lo que duele hoy…"
        onCommit={(v) => set({ intro: v })}
      />

      {!ctx.pdfMode && columnas.length > 0 && (
        <div className="stl-hubs-pills">
          {/* SIEMPRE todas: en el editor para poder prender cualquier Hub sin volver a
              la tira de tags, y en la propuesta para que el cliente explore lo que no
              compró. Lo vendido es lo que arranca encendido, no lo único que existe. */}
          {columnas.map((c) => {
            const key = columnaKey(c);
            const { colorVar, label } = hubVisual(c.hub);
            const on = editable ? activasKeys.has(key) : abiertas.includes(key);
            return (
              <button
                key={key || c.titulo}
                type="button"
                className={`stl-hub-pill${on ? " is-on" : ""}`}
                style={{ "--hub": `var(${colorVar})` } as CSSProperties}
                aria-pressed={on}
                onClick={() => toggle(c)}
              >
                <span className="stl-hub-pill-dot" />
                {label ?? (c.hub || c.titulo || "Sin nombre")}
              </button>
            );
          })}
        </div>
      )}

      <SortableItems
        items={visibles}
        disabled={!editable}
        onReorder={(next) => set({ columnas: next })}
        container={(nodes) => <div className="stl-hub-cols">{nodes}</div>}
      >
        {(c, i, handle) => {
          const { colorVar, label } = hubVisual(c.hub);
          // En lectura `visibles` es un subconjunto de `columnas`, así que el índice del
          // sortable no sirve para escribir. En edición coinciden, pero se busca igual.
          const real = columnas.indexOf(c);
          const items = c.items ?? [];
          const setItems = (next: HubCard[]) => setColumna(real, { ...c, items: next });
          const apagada = editable && !activasKeys.has(columnaKey(c));
          return (
            <div
              className={`stl-hub-col${apagada ? " is-off" : ""}`}
              style={{ "--hub": `var(${colorVar})` } as CSSProperties}
            >
              <div className="stl-hub-col-head">
                {handle}
                {editable && <RemoveBtn onClick={() => set({ columnas: removeAt(columnas, real) })} />}
                {/* El cliente puede abrir un Hub que no compró: la columna tiene que
                    DECIRLO. Sin esto, explorar se leería como que ya está incluido. */}
                {apagada && !editable && <div className="stl-hub-col-chip">No incluido</div>}
                <div className="stl-hub-col-eyebrow">{label ?? "A la medida"}</div>
                <Editable
                  as="div"
                  className="stl-hub-col-title"
                  editable={editable}
                  value={c.titulo}
                  placeholder="Qué resuelve este Hub acá…"
                  onCommit={(v) => setColumna(real, { ...c, titulo: v })}
                />
              </div>
              {items.map((it, j) => (
                <div className="stl-hub-card" key={j}>
                  {editable && <RemoveBtn onClick={() => setItems(removeAt(items, j))} />}
                  <Editable
                    as="div"
                    className="stl-hub-card-title"
                    editable={editable}
                    value={it.titulo ?? ""}
                    placeholder="Qué se pone a funcionar…"
                    onCommit={(v) => setItems(replaceAt(items, j, { ...it, titulo: v }))}
                  />
                  <Editable
                    as="div"
                    className="stl-hub-card-detail"
                    editable={editable}
                    value={it.detalle ?? ""}
                    placeholder="Qué cambia para el cliente cuando funciona…"
                    onCommit={(v) => setItems(replaceAt(items, j, { ...it, detalle: v }))}
                  />
                  {editable ? (
                    <Editable
                      as="div"
                      className="stl-hub-card-detail"
                      editable
                      value={it.canales ?? ""}
                      placeholder="Canales, separados por coma (opcional)…"
                      onCommit={(v) => setItems(replaceAt(items, j, { ...it, canales: v }))}
                    />
                  ) : (
                    parseCanales(it.canales).length > 0 && (
                      <div className="stl-hub-canales">
                        {parseCanales(it.canales).map((canal) => (
                          <span className="stl-hub-canal" key={canal}>{canal}</span>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ))}
              {editable && (
                <div className="stl-hub-card">
                  <AddBtn label="Agregar" onClick={() => setItems(appendItem(items, { titulo: "", detalle: "", canales: "" }))} />
                </div>
              )}
            </div>
          );
        }}
      </SortableItems>

      {editable && (
        <AddBtn
          label="Agregar Hub"
          onClick={() => set({ columnas: appendItem(columnas, { hub: "", titulo: "", items: [] }) })}
        />
      )}
    </>
  );
};
