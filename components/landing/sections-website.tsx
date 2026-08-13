"use client";

/**
 * components/landing/sections-website.tsx
 *
 * Secciones del template SITIO WEB (estructura de la propuesta RIGORA, 8 secciones).
 * La Portada reusa HeroSection (key "hero" → hereda portada con imagen y carry-forward)
 * y la "Arquitectura de conexión" reusa TechArchitectureSection (sections-shared.tsx).
 * Acá viven las 6 restantes. Mismo contrato inline-editable que sections.tsx.
 */
import { type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { CtaButton, CtaEditor } from "./sections";
import { landingLang, t, type LandingLang, type LandingStringKey } from "./i18n";
import type {
  InvestLabels,
  SectionProps,
  WebDiagnosisData,
  SiteArchitectureData,
  WebScopeData,
  WebMethodologyData,
  WebInvestmentData,
  WebInvestLine,
  WhyUsData,
} from "./types";
import { formatRango, montoParaLectura } from "@/lib/landing/money";
import {
  adoptarShapeNuevo,
  esInversionLegacy,
  gruposDeInversion,
  type GrupoInversion,
} from "@/lib/landing/inversion";

/* ── 2) Dos columnas: una lista a la izquierda + un panel oscuro de consecuencias ──────
   Nació para la propuesta de sitio web —izquierda "Retos actuales", derecha "Por qué
   {plataforma}"— y hoy lo comparten CUATRO documentos. En los otros tres las columnas ya
   no son retos ni un "por qué" de una plataforma, así que los rótulos entran por
   `sectionChips` desde la definición de cada documento.
   Sin `sectionChips` se usan los literales de siempre, que en la propuesta de sitio web
   —la única de la familia que se publica al cliente— son los correctos. */
export const WebDiagnosisSection: FC<SectionProps<WebDiagnosisData>> = ({ data, ctx, editable, onChange, sectionChips }) => {
  const lang = landingLang(ctx.lang);
  const retos = data.retos ?? [];
  // Fallback LEGACY: `porQuePlataforma` (párrafo) → un bullet único sin título.
  const bullets =
    data.porQueBullets?.length
      ? data.porQueBullets
      : data.porQuePlataforma?.trim()
        ? [{ title: "", detail: data.porQuePlataforma }]
        : [];
  const set = (next: Partial<WebDiagnosisData>) => onChange?.({ ...data, ...next });
  // Escribir bullets LIMPIA el legacy: si no, al borrar el último bullet el render
  // re-deriva de `porQuePlataforma` y el bullet "resucita" (imposible vaciar la lista).
  const setBullets = (list: { title: string; detail: string }[]) => set({ porQueBullets: list, porQuePlataforma: "" });
  return (
    <>
      {(data.intro || editable) && (
        <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
          placeholder="Contexto esencial (máx 2 frases)…" onCommit={(v) => set({ intro: v })} />
      )}
      <div className="stl-diag">
        {/* Izquierda: retos actuales (cards de una línea) */}
        <div>
          <span className="stl-diag-chip">{sectionChips?.retos ?? t(lang, "retosActuales")}</span>
          <SortableItems items={retos} disabled={!editable} onReorder={(next) => set({ retos: next })}
            container={(nodes) => <div className="stl-diag-retos">{nodes}</div>}>
            {(r, i, handle) => (
              <div className="stl-item stl-diag-reto">
                {handle}
                {editable && <RemoveBtn onClick={() => set({ retos: removeAt(retos, i) })} />}
                <Editable as="strong" editable={editable} value={r.title}
                  placeholder="Reto (3-6 palabras)…" onCommit={(v) => set({ retos: replaceAt(retos, i, { ...r, title: v }) })} />{" "}
                <Editable as="span" editable={editable} value={r.detail}
                  placeholder="Una frase corta…" onCommit={(v) => set({ retos: replaceAt(retos, i, { ...r, detail: v }) })} />
              </div>
            )}
          </SortableItems>
          {editable && <AddBtn label="Agregar reto" onClick={() => set({ retos: appendItem(retos, { title: "", detail: "" }) })} />}
        </div>

        {/* Derecha: panel oscuro "Por qué [plataforma]" con bullets + objetivo */}
        <div className="stl-diag-panel">
          <span className="stl-diag-panel-chip">
            {/* Con `panel` declarado el rótulo es UNO SOLO y fijo. Sin él, el histórico:
                "Por qué" + un campo que el agente llena con el nombre de la plataforma.
                Ese prefijo fijo es lo que producía "Por qué qué se rompe si el supuesto es
                falso" en Exploración: el brief le pedía al agente meter una frase entera en
                una ranura que ya venía prefijada. */}
            {sectionChips?.panel ?? (
              <>
                {`${t(lang, "porQue")} `}
                <Editable as="span" editable={editable} value={data.plataforma ?? ""}
                  placeholder="HubSpot Content Hub…" onCommit={(v) => set({ plataforma: v })} />
              </>
            )}
          </span>
          <SortableItems items={bullets} disabled={!editable} onReorder={setBullets}
            container={(nodes) => <div className="stl-diag-bullets">{nodes}</div>}>
            {(b, i, handle) => (
              <div className="stl-item stl-diag-bullet">
                {handle}
                {editable && <RemoveBtn onClick={() => setBullets(removeAt(bullets, i))} />}
                <span className="stl-diag-dot" aria-hidden />
                <span>
                  {(b.title || editable) && (
                    <>
                      <Editable as="strong" editable={editable} value={b.title}
                        placeholder="Razón (2-4 palabras)…" onCommit={(v) => setBullets(replaceAt(bullets, i, { ...b, title: v }))} />
                      {(b.title || editable) && b.detail !== undefined && ": "}
                    </>
                  )}
                  <Editable as="span" editable={editable} value={b.detail ?? ""}
                    placeholder="Detalle (1 línea)…" onCommit={(v) => setBullets(replaceAt(bullets, i, { ...b, detail: v }))} />
                </span>
              </div>
            )}
          </SortableItems>
          {editable && <AddBtn label="Agregar razón" onClick={() => setBullets(appendItem(bullets, { title: "", detail: "" }))} />}
          {(data.objetivo || editable) && (
            <div className="stl-diag-footer">
              <span style={{ opacity: 0.75 }}>{t(lang, "objetivo")}: </span>
              <Editable as="span" editable={editable} value={data.objetivo ?? ""}
                placeholder="Una frase compacta…" onCommit={(v) => set({ objetivo: v })} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── 3) Arquitectura del sitio — diagrama: Home + fases con cards top-level ───
export const SiteArchitectureSection: FC<SectionProps<SiteArchitectureData>> = ({ data, editable, onChange }) => {
  const fases = data.fases ?? [];
  const set = (next: Partial<SiteArchitectureData>) => onChange?.({ ...data, ...next });
  // Normalización LEGACY: páginas string → { nombre, detalle: "" }.
  const pageOf = (p: { nombre: string; detalle: string } | string) =>
    typeof p === "string" ? { nombre: p, detalle: "" } : p;
  const setPagina = (fi: number, pi: number, next: { nombre: string; detalle: string }) => {
    const f = fases[fi];
    set({ fases: replaceAt(fases, fi, { ...f, paginas: replaceAt(f.paginas ?? [], pi, next) }) });
  };
  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.recorrido ?? ""}
        placeholder="Recorrido del usuario en una frase…" onCommit={(v) => set({ recorrido: v })} />

      {/* Nodo raíz: Home */}
      {(data.home || editable) && (
        <div className="stl-map-root">
          <span className="stl-map-home">
            <Editable as="span" editable={editable} value={data.home ?? ""}
              placeholder="Home · resumen del ecosistema…" onCommit={(v) => set({ home: v })} />
          </span>
          <span className="stl-map-stem" aria-hidden />
        </div>
      )}

      {fases.map((f, i) => {
        const soon = (f.badge ?? "").trim() !== "";
        return (
          <div key={i} className="stl-item stl-map-phase">
            {editable && <RemoveBtn onClick={() => set({ fases: removeAt(fases, i) })} />}
            <div className="stl-map-phase-head">
              <span className={`stl-map-phase-chip${soon ? " stl-map-phase-chip--soon" : ""}`}>
                <Editable as="span" editable={editable} value={f.nombre}
                  placeholder="Fase 1 · MVP…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...f, nombre: v }) })} />
              </span>
              {editable && (
                <span className="stl-sitemap-badge">
                  <Editable as="span" editable value={f.badge ?? ""} placeholder="Badge (vacío = fase actual)…"
                    onCommit={(v) => set({ fases: replaceAt(fases, i, { ...f, badge: v }) })} />
                </span>
              )}
              <span className="stl-map-phase-line" aria-hidden />
            </div>
            <SortableItems items={f.paginas ?? []} disabled={!editable}
              onReorder={(next) => set({ fases: replaceAt(fases, i, { ...f, paginas: next }) })}
              container={(nodes) => <div className="stl-map-cards">{nodes}</div>}>
              {(raw, j, handle) => {
                const p = pageOf(raw);
                return (
                  <div className={`stl-item stl-map-card${soon ? " stl-map-card--soon" : ""}`}>
                    {handle}
                    {editable && <RemoveBtn onClick={() => set({ fases: replaceAt(fases, i, { ...f, paginas: removeAt(f.paginas ?? [], j) }) })} />}
                    <Editable as="div" className="stl-map-card-title" editable={editable} value={p.nombre}
                      placeholder="Sección…" onCommit={(v) => setPagina(i, j, { ...p, nombre: v })} />
                    {(p.detalle || editable) && (
                      <Editable as="div" className="stl-map-card-detail" editable={editable} value={p.detalle}
                        placeholder="2-4 palabras…" onCommit={(v) => setPagina(i, j, { ...p, detalle: v })} />
                    )}
                  </div>
                );
              }}
            </SortableItems>
            {editable && (
              <AddBtn label="Sección" onClick={() => set({ fases: replaceAt(fases, i, { ...f, paginas: appendItem((f.paginas ?? []) as { nombre: string; detalle: string }[], { nombre: "", detalle: "" }) }) })} />
            )}
          </div>
        );
      })}
      {editable && <AddBtn label="Agregar fase" onClick={() => set({ fases: appendItem(fases, { nombre: "", badge: "", paginas: [] }) })} />}
    </>
  );
};

// ── 5) Alcance — checklist PLANA de entregables (≠ etapas: eso es el Cronograma) ──
export const WebScopeSection: FC<SectionProps<WebScopeData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  // Fallback LEGACY: data generada con el shape viejo por áreas (`bloques`) se
  // aplana a entregables para que canvases/snapshots previos no queden en blanco.
  const entregables =
    data.entregables?.length
      ? data.entregables
      : (data.bloques ?? []).flatMap((b) => (b.items ?? []).map((it) => ({ title: it, detail: "" })));
  const set = (next: Partial<WebScopeData>) => onChange?.({ ...data, ...next });
  // Escribir entregables LIMPIA el legacy (`bloques`): si no, vaciar la lista los resucita.
  const setEntregables = (list: { title: string; detail: string }[]) => set({ entregables: list, bloques: [] });
  return (
    <>
      <SortableItems items={entregables} disabled={!editable} onReorder={setEntregables}
        container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
        {(e, i, handle) => (
          <div className="stl-item stl-deliverable">
            {handle}
            {editable && <RemoveBtn onClick={() => setEntregables(removeAt(entregables, i))} />}
            <span className="stl-deliverable-check" aria-hidden>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Editable as="div" className="stl-deliverable-title" editable={editable} value={e.title}
                placeholder="Entregable (ej. Sitio en Content Hub)…"
                onCommit={(v) => setEntregables(replaceAt(entregables, i, { ...e, title: v }))} />
              {(e.detail || editable) && (
                <Editable as="p" className="stl-card-detail" editable={editable} value={e.detail ?? ""}
                  placeholder="Qué incluye (1 línea)…"
                  onCommit={(v) => setEntregables(replaceAt(entregables, i, { ...e, detail: v }))} />
              )}
            </div>
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar entregable" onClick={() => setEntregables(appendItem(entregables, { title: "", detail: "" }))} />}
      {(data.resultado || editable) && (
        <div className="stl-callout" style={{ marginTop: 28 }}>
          <div className="stl-field-label">{t(lang, "resultado")}</div>
          <Editable as="p" className="stl-field-value" editable={editable} value={data.resultado ?? ""}
            placeholder="Qué recibe el cliente al final…" onCommit={(v) => set({ resultado: v })} />
        </div>
      )}
    </>
  );
};

// ── 6) Metodología y cronograma ──────────────────────────────────────────────
export const WebMethodologySection: FC<SectionProps<WebMethodologyData>> = ({ data, editable, onChange }) => {
  const fases = data.fases ?? [];
  const set = (next: Partial<WebMethodologyData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <SortableItems items={fases} disabled={!editable} onReorder={(next) => set({ fases: next })}
        container={(nodes) => <div>{nodes}</div>}>
        {(p, i, handle) => (
          <div className="stl-item stl-phase">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ fases: removeAt(fases, i) })} />}
            <div className="stl-phase-num">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <Editable as="div" className="stl-phase-name" editable={editable} value={p.name}
                placeholder="Nombre de la fase…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, name: v }) })} />
              <Editable as="div" className="stl-phase-duration" editable={editable} value={p.duration}
                placeholder="Semanas 1-2…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, duration: v }) })} />
              <Editable as="p" className="stl-body" editable={editable} value={p.detail}
                placeholder="Qué pasa en esta fase…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, detail: v }) })} />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar fase" onClick={() => set({ fases: appendItem(fases, { name: "", detail: "", duration: "" }) })} />}
      {(data.cotizaAparte || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.cotizaAparte ?? ""}
          placeholder="Qué se cotiza aparte (contenido, fotografía, integraciones extra)…" onCommit={(v) => set({ cotizaAparte: v })} />
      )}
    </>
  );
};

// ── 7) INVERSIÓN — line items de factura, una sola sección para los dos templates ──
//
// Antes convivían dos secciones distintas bajo la MISMA key `inversion`: la de HubSpot (dos
// tarjetas fijas, sin total) y ésta (tabla con total). Se unificaron, y el 2026-08-12 la rama
// de tarjetas se retiró del todo: TODA propuesta se lee como un documento de cobro. Las dos
// entradas del registry —`inversion` y `web_investment`— apuntan a este componente, así el
// snapshot de keys de `registry.test.ts` no cambia y los `sectionType` congelados de lo ya
// publicado siguen resolviendo.
//
// EL SHAPE VIEJO SE ADOPTA AL RENDERIZAR (patrón `DiagramSection`): `adoptarShapeNuevo` es
// pura y ya testeada, no persiste nada por su cuenta, y el primer guardado humano la fija.
// Es seguro para lo publicado porque esos montos son texto libre ("A definir en propuesta
// formal") ⇒ con el parser estricto ninguno suma ⇒ no aparece ningún total que el cliente no
// haya visto. Lo que cambia es la tipografía, no la aritmética. Es una garantía dependiente
// de los DATOS: se re-verifica con `scripts/verificar-inversion-publicada.ts` antes de subir.
//
// Con UN grupo con montos se pinta UN total (la píldora); el gran total aparece recién con
// DOS. Las reglas viven en `lib/landing/inversion.ts` y la aritmética en `lib/landing/money.ts`
// (puras y testeadas); acá solo está el markup.

/** Monedas frecuentes del negocio (el select ofrece además "Otra…" con código libre). */
const CURRENCIES = ["USD", "CRC", "MXN", "COP", "PEN", "CLP", "GTQ", "DOP", "EUR"];

/** Una tabla de líneas con su cierre. La usan los DOS grupos — servicios y licencias. */
function GrupoTabla({
  grupo, lang, moneda, editable, chip, rotuloTotal, destacado, pendientes, onSet,
}: {
  grupo: GrupoInversion;
  lang: LandingLang;
  moneda: string;
  editable?: boolean;
  chip: string;
  rotuloTotal: string;
  /** true = este subtotal ES el total de la sección (un solo grupo) → píldora. */
  destacado: boolean;
  /** Cuántas líneas quedaron FUERA del número que este bloque muestra. Con `destacado` son
   *  las de TODA la sección (este total ES el total); si no, las del grupo. Va como prop y no
   *  como `grupo.pendientes` porque el pendiente del OTRO grupo, cuando ese grupo no aporta
   *  total, no se pintaba en NINGÚN lado — y un total que excluye líneas sin decirlo es
   *  exactamente la mentira que `money.ts` existe para no cometer. */
  pendientes: number;
  onSet: (next: Partial<WebInvestmentData>) => void;
}) {
  const lineas = grupo.lineas as WebInvestLine[];
  const set = (next: WebInvestLine[]) => onSet({ [grupo.clave]: next } as Partial<WebInvestmentData>);
  const nueva = () => set(appendItem(lineas, { concepto: "", monto: "", detalle: "" }));
  // Un grupo vacío no se pinta en lectura: el de licencias no existe en las propuestas viejas
  // y no puede aparecer como un bloque en blanco.
  if (!editable && !lineas.length) return null;

  return (
    <div className="stl-inv-grupo">
      {/* El chip ES el rótulo de la columna izquierda y "MONTO" abre la derecha, los dos
          apoyados en la regla que abre la factura. */}
      <div className="stl-inv-head">
        <span className="stl-inv-chip">{chip}</span>
        <span className="stl-inv-col">{t(lang, "montoCol")}</span>
      </div>

      <div className="stl-inv-table">
        <SortableItems items={lineas} disabled={!editable} onReorder={(next) => set(next)}
          container={(nodes) => <>{nodes}</>}>
          {(l, i, handle) => {
            const m = montoParaLectura(l.monto, moneda);
            /* El eco de "cómo lo va a ver el cliente". ⚠ NUNCA se le pasa a `Editable`: ése
               comitea su propio textContent al blur Y al desmontarse (inline.tsx), así que un
               valor DERIVADO adentro se auto-persiste y le reescribe el monto a Ventas. Es
               literalmente el bug de la portada documentado en ese archivo. */
            const eco = !m.libre && m.texto && m.texto !== (l.monto ?? "").trim() ? m.texto : "";
            return (
              <div className="stl-item stl-inv-row">
                {handle}
                {editable && <RemoveBtn onClick={() => set(removeAt(lineas, i))} />}

                <div className="stl-inv-row-main">
                  <Editable as="span" className="stl-inv-concept" editable={editable} value={l.concepto}
                    placeholder="Concepto…" onCommit={(v) => set(replaceAt(lineas, i, { ...l, concepto: v }))} />
                  <Editable as="span" className="stl-inv-detail" editable={editable} value={l.detalle}
                    placeholder="qué incluye…" onCommit={(v) => set(replaceAt(lineas, i, { ...l, detalle: v }))} />
                </div>

                <div className="stl-inv-cell">
                  {editable ? (
                    <>
                      <Editable as="span" className="stl-inv-amount" editable value={l.monto}
                        placeholder="$0–0" onCommit={(v) => set(replaceAt(lineas, i, { ...l, monto: v }))} />
                      {eco && <span className="stl-inv-eco" title="Así lo va a ver el cliente.">{eco}</span>}
                      {/* El aviso de "no suma" es SOLO del editor: el cliente ve el monto tal
                          cual lo escribió Ventas, no nuestra opinión sobre él. */}
                      {m.libre && (
                        <span className="stl-inv-warn" title="Este monto no entra en el total: dejá solo el número o el rango.">
                          ⚠ no suma
                        </span>
                      )}
                    </>
                  ) : m.texto ? (
                    <span className={`stl-inv-amount${m.libre ? " stl-inv-amount--libre" : ""}`}>{m.texto}</span>
                  ) : (
                    /* Guion y no vacío: una celda que desaparece rompe la columna justo donde
                       tiene que estar más firme. */
                    <span className="stl-inv-amount stl-inv-amount--vacio">—</span>
                  )}
                </div>
              </div>
            );
          }}
        </SortableItems>

        {grupo.total && (
          <div className={`stl-inv-sum${destacado ? " stl-inv-sum--total" : ""}`}>
            <div className="stl-inv-sum-label">
              {rotuloTotal}
              {pendientes > 0 && (
                <span className="stl-inv-sum-note">
                  {`+${pendientes} ${t(lang, "montoPorDefinir")} · ${t(lang, "noSuman")}`}
                </span>
              )}
            </div>
            <div className="stl-inv-sum-amount">
              {destacado
                ? <span className="stl-inv-total-pill">{formatRango(grupo.total, moneda)}</span>
                : formatRango(grupo.total, moneda)}
            </div>
          </div>
        )}
      </div>
      {editable && <AddBtn label="Agregar línea" onClick={nueva} />}
    </div>
  );
}

export const InvestmentSection: FC<SectionProps<WebInvestmentData>> = (props) => {
  const { data, ctx, editable, onChange, sectionInvest } = props;
  const lang = landingLang(ctx.lang);

  /* La proyección del shape viejo (ver el header). ⚠ TODOS los lectores y escritores de abajo
     parten de `d`, nunca de `data`: si `set` partiera de `data`, el guardado dejaría un
     HÍBRIDO (keys legacy + `lineas`) y borrar una fila sería imposible — `esInversionLegacy`
     volvería a dar true y la resucitaría en el render siguiente. */
  const d: WebInvestmentData = esInversionLegacy(data)
    ? adoptarShapeNuevo(data, {
        servicios: t(lang, "implementacionSmarteam"),
        licencias: t(lang, "licenciasHubspot"),
      })
    : data;

  const set = (next: Partial<WebInvestmentData>) => onChange?.({ ...d, ...next });
  const g = gruposDeInversion(d);
  const moneda = g.moneda; // la que se SUMÓ (ver gruposDeInversion)
  const extras = d.extras ?? [];
  const recurrentes = d.recurrentes ?? [];
  // Con un solo grupo, ese subtotal ES el total y lleva la píldora — valga para servicios o
  // para licencias. Los dos lo reciben; el que no tiene total no pinta nada.
  const unSoloGrupo = g.gruposConMonto <= 1;
  const rot = (k: keyof InvestLabels, fallback: LandingStringKey) => t(lang, sectionInvest?.[k] ?? fallback);
  const hayLicencias = (d.licencias ?? []).length > 0;

  return (
    <div className="stl-inv">
      {(d.moneda || editable) && (
        <div className="stl-inv-bar">
          {editable ? (
            <label className="stl-inv-currency stl-inv-currency--edit">
              {t(lang, "montosEn")}
              {/* La opción vacía existe porque "sin moneda" es un estado REAL con el que el
                  motor suma: el `|| "USD"` de antes le afirmaba al CSE una moneda que el
                  parser no estaba usando, y como el select solo escribe en `onChange`, nunca
                  se persistía. */}
              <select value={d.moneda ?? ""} onChange={(e) => set({ moneda: e.target.value })}>
                <option value="">— elegir —</option>
                {[...new Set([...(d.moneda ? [d.moneda] : []), ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="stl-inv-currency">{`${t(lang, "montosEn")} ${d.moneda}`}</span>
          )}
        </div>
      )}

      <GrupoTabla
        grupo={g.servicios} lang={lang} moneda={moneda} editable={editable}
        chip={rot("servicios", "inversionServicios")}
        rotuloTotal={rot("totalServicios", "totalServicios")}
        destacado={unSoloGrupo}
        pendientes={unSoloGrupo ? g.pendientesTotales : g.servicios.pendientes}
        onSet={set}
      />

      {(hayLicencias || editable) && (
        <GrupoTabla
          grupo={g.licencias} lang={lang} moneda={moneda} editable={editable}
          chip={rot("licencias", "inversionLicencias")}
          rotuloTotal={rot("totalLicencias", "totalLicencias")}
          destacado={unSoloGrupo}
          pendientes={unSoloGrupo ? g.pendientesTotales : g.licencias.pendientes}
          onSet={set}
        />
      )}

      {/* Gran total: SOLO con los dos grupos sumables. ⚠ El rótulo tiene que declarar qué
          cubre — mezcla un CapEx de implementación con licencias que suelen ser anuales, así
          que el número solo es honesto con su etiqueta y con la `nota`. */}
      {g.granTotal && (
        <div className="stl-inv-sum stl-inv-sum--total stl-inv-sum--gran">
          <div className="stl-inv-sum-label">
            {rot("granTotal", "inversionTotal")}
            {g.pendientesTotales > 0 && (
              <span className="stl-inv-sum-note">
                {`+${g.pendientesTotales} ${t(lang, "montoPorDefinir")} · ${t(lang, "noSuman")}`}
              </span>
            )}
          </div>
          <div className="stl-inv-sum-amount">
            <span className="stl-inv-total-pill">{formatRango(g.granTotal, moneda)}</span>
          </div>
        </div>
      )}

      {/* La NOTA baja al PIE: es la letra chica de la factura y va donde está el número.
          Arriba, como píldora de 12px, las notas reales (153-365 caracteres medidos en prod)
          se leían como 3 renglones dentro de una cápsula diseñada para 4 palabras. */}
      {(d.nota || editable) && (
        <p className="stl-inv-nota">
          <span className="stl-inv-nota-k">{t(lang, "nota").toUpperCase()}</span>
          <Editable as="span" editable={editable} value={d.nota ?? ""}
            placeholder="impuestos no contemplados…" onCommit={(v) => set({ nota: v })} />
        </p>
      )}

      {/* Extras opcionales (cards claras) + recurrente mensual (card oscura). NINGUNO suma: un
          opcional no está comprado y un mensual no es una inversión única. Tampoco se
          normalizan: la normalización existe para que una COLUMNA se lea pareja, y una card no
          tiene columna. */}
      {(extras.length > 0 || recurrentes.length > 0 || editable) && (
        <div className="stl-inv-below">
          <SortableItems items={extras} disabled={!editable} onReorder={(next) => set({ extras: next })}
            container={(nodes) => <>{nodes}</>}>
            {(l, i, handle) => (
              <div className="stl-item stl-inv-extra">
                {handle}
                {editable && <RemoveBtn onClick={() => set({ extras: removeAt(extras, i) })} />}
                <div className="stl-inv-extra-head">
                  <Editable as="strong" editable={editable} value={l.concepto}
                    placeholder="Extra…" onCommit={(v) => set({ extras: replaceAt(extras, i, { ...l, concepto: v }) })} />
                  <span className="stl-inv-extra-tag">{t(lang, "opcional")}</span>
                </div>
                <Editable as="p" className="stl-inv-extra-detail" editable={editable} value={l.detalle}
                  placeholder="Qué incluye…" onCommit={(v) => set({ extras: replaceAt(extras, i, { ...l, detalle: v }) })} />
                <Editable as="div" className="stl-inv-extra-amount" editable={editable} value={l.monto}
                  placeholder="+$0" onCommit={(v) => set({ extras: replaceAt(extras, i, { ...l, monto: v }) })} />
              </div>
            )}
          </SortableItems>
          {editable && (
            <button type="button" className="stl-inv-extra stl-inv-extra--add"
              onClick={() => set({ extras: appendItem(extras, { concepto: "", monto: "", detalle: "" }) })}>
              + {t(lang, "extrasOpcionales")}
            </button>
          )}

          {(recurrentes.length > 0 || editable) && (
            <div className={`stl-inv-monthly${d.anchoRecurrente === "ancho" ? " stl-inv-monthly--wide" : ""}`}>
              <div className="stl-inv-monthly-title">{t(lang, "recurrenteMensual")}</div>
              <SortableItems items={recurrentes} disabled={!editable} onReorder={(next) => set({ recurrentes: next })}
                container={(nodes) => <>{nodes}</>}>
                {(l, i, handle) => (
                  <div className="stl-item stl-inv-monthly-row">
                    {handle}
                    {editable && <RemoveBtn onClick={() => set({ recurrentes: removeAt(recurrentes, i) })} />}
                    <Editable as="span" editable={editable} value={l.concepto}
                      placeholder="Licencia / mantenimiento…" onCommit={(v) => set({ recurrentes: replaceAt(recurrentes, i, { ...l, concepto: v }) })} />{" "}
                    <Editable as="strong" editable={editable} value={l.monto}
                      placeholder="$0" onCommit={(v) => set({ recurrentes: replaceAt(recurrentes, i, { ...l, monto: v }) })} />{" "}
                    <Editable as="span" className="stl-inv-monthly-detail" editable={editable} value={l.detalle}
                      placeholder="detalle…" onCommit={(v) => set({ recurrentes: replaceAt(recurrentes, i, { ...l, detalle: v }) })} />
                  </div>
                )}
              </SortableItems>
              {editable && (
                <AddBtn label="Agregar recurrente" onClick={() => set({ recurrentes: appendItem(recurrentes, { concepto: "", monto: "", detalle: "" }) })} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 8) Por qué Smarteam + siguiente paso ─────────────────────────────────────
export const WhyUsSection: FC<SectionProps<WhyUsData>> = ({ data, editable, onChange }) => {
  const cards = data.cards ?? [];
  const set = (next: Partial<WhyUsData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <SortableItems items={cards} disabled={!editable} onReorder={(next) => set({ cards: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
        {(c, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ cards: removeAt(cards, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={c.title}
              placeholder="Partner Elite / equipo / método…" onCommit={(v) => set({ cards: replaceAt(cards, i, { ...c, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={c.detail}
              placeholder="Por qué importa para este proyecto…" onCommit={(v) => set({ cards: replaceAt(cards, i, { ...c, detail: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar card" onClick={() => set({ cards: appendItem(cards, { title: "", detail: "" }) })} />}
      <div className="stl-cta-wrap" style={{ marginTop: 36 }}>
        <Editable as="p" className="stl-lead" editable={editable} value={data.siguientePaso ?? ""}
          placeholder="Siguiente paso propuesto…" onCommit={(v) => set({ siguientePaso: v })} />
        {editable ? (
          <CtaEditor label={data.buttonLabel} url={data.buttonUrl} target={data.buttonTarget}
            labelPlaceholder="Agendar siguiente paso…"
            onLabel={(v) => set({ buttonLabel: v })}
            onUrl={(v) => set({ buttonUrl: v })} onTarget={(v) => set({ buttonTarget: v })} />
        ) : (
          <CtaButton label={data.buttonLabel} url={data.buttonUrl} target={data.buttonTarget} />
        )}
      </div>
    </>
  );
};
