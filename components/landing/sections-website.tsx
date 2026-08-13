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
  InvestmentLine,
  SectionProps,
  WebDiagnosisData,
  SiteArchitectureData,
  WebScopeData,
  WebMethodologyData,
  WebInvestmentData,
  WebInvestLine,
  WhyUsData,
} from "./types";
import { formatRango, parseMonto } from "@/lib/landing/money";
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

// ── 7) INVERSIÓN — una sola sección para los dos templates ───────────────────
//
// Antes convivían dos secciones distintas bajo la MISMA key `inversion`: la de HubSpot (dos
// tarjetas fijas, sin total) y ésta (tabla + total autocalculado). Se unifican acá y las
// dos entradas del registry —`inversion` y `web_investment`— apuntan al mismo componente,
// así el snapshot de keys de `registry.test.ts` no cambia y los `sectionType` congelados de
// lo ya publicado siguen resolviendo.
//
// LO QUE SOSTIENE LO YA PUBLICADO (`configForSnapshot` resuelve por KEY contra la config
// VIVA, así que toda propuesta publicada estrena este renderer):
//   · `esInversionLegacy` → las dos tarjetas históricas de HubSpot, intactas.
//   · con UN solo grupo con montos se pinta UN total, con la píldora de siempre — que es
//     exactamente el caso de las propuestas de sitio web que el cliente ya vio.
// El gran total aparece recién con DOS grupos, o sea solo en lo que se llene de ahora en
// adelante. Las reglas viven en `lib/landing/inversion.ts` (puras y testeadas); acá solo
// está el markup.

/** Monedas frecuentes del negocio (el select ofrece además "Otra…" con código libre). */
const CURRENCIES = ["USD", "CRC", "MXN", "COP", "PEN", "CLP", "GTQ", "DOP", "EUR"];

/** Rama LEGACY de HubSpot: el cuerpo histórico, mudado tal cual desde `sections.tsx`.
 *  Editable, pero el código nunca vuelve a escribir estas keys. */
function InvestCard({
  label, line, editable, onChange, montoPh, detallePh,
}: { label: string; line: InvestmentLine; editable?: boolean; onChange: (l: InvestmentLine) => void; montoPh: string; detallePh: string }) {
  return (
    <div className="stl-field-card">
      <div className="stl-field-label">{label}</div>
      <Editable as="div" className="stl-invest-amount" editable={editable} value={line?.monto ?? ""} placeholder={montoPh} onCommit={(v) => onChange({ ...line, monto: v })} />
      <Editable as="div" className="stl-field-value" editable={editable} value={line?.detalle ?? ""} placeholder={detallePh} onCommit={(v) => onChange({ ...line, detalle: v })} />
    </div>
  );
}

const InversionLegacy: FC<SectionProps<WebInvestmentData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const lic = data.licenciasHubspot ?? { monto: "", detalle: "" };
  const impl = data.implementacion ?? { monto: "", detalle: "" };
  const set = (next: Partial<WebInvestmentData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        <InvestCard label={t(lang, "licenciasHubspot")} line={lic} editable={editable} montoPh="[Monto o rango]" detallePh="Hubs × usuarios × descuento si aplica" onChange={(v) => set({ licenciasHubspot: v })} />
        <InvestCard label={t(lang, "implementacionSmarteam")} line={impl} editable={editable} montoPh="[Monto o rango]" detallePh="Set up + onboarding + integraciones" onChange={(v) => set({ implementacion: v })} />
      </div>
      <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""}
        placeholder="Si no hay precio en el transcript → 'A definir en propuesta formal'…" onCommit={(v) => set({ nota: v })} />
      {/* La adopción del shape nuevo la decide UNA PERSONA sobre el canvas vivo. Nunca un
          script ni el render: convertir montos de texto libre ("A definir en propuesta
          formal") hace correr la máquina de totales sobre una propuesta ya publicada, y al
          cliente le aparece un número que jamás vio. */}
      {editable && (
        <button type="button" className="stl-inv-migrar" onClick={() => onChange?.(adoptarShapeNuevo(data))}>
          Pasar a la tabla nueva (servicios + licencias con total)
        </button>
      )}
    </>
  );
};

/** Una tabla de líneas con su subtotal. La usan los DOS grupos — servicios y licencias. */
function GrupoTabla({
  grupo, lang, moneda, editable, chip, rotuloTotal, destacado, onSet,
}: {
  grupo: GrupoInversion;
  lang: LandingLang;
  moneda: string;
  editable?: boolean;
  chip: string;
  rotuloTotal: string;
  /** true = este subtotal ES el total de la sección (un solo grupo) → píldora de siempre. */
  destacado: boolean;
  onSet: (next: Partial<WebInvestmentData>) => void;
}) {
  const lineas = grupo.lineas as WebInvestLine[];
  const set = (next: WebInvestLine[]) => onSet({ [grupo.clave]: next } as Partial<WebInvestmentData>);
  const nueva = () => set(appendItem(lineas, { concepto: "", monto: "", detalle: "" }));
  // Un grupo vacío no se pinta en lectura: el de licencias no existe en las propuestas
  // viejas y no puede aparecer como un bloque en blanco.
  if (!editable && !lineas.length) return null;

  return (
    <>
      <span className="stl-inv-chip">{chip}</span>
      <div className="stl-inv-table">
        <SortableItems items={lineas} disabled={!editable} onReorder={(next) => set(next)}
          container={(nodes) => <>{nodes}</>}>
          {(l, i, handle) => {
            const parsed = parseMonto(l.monto, moneda);
            return (
              <div className="stl-item stl-inv-row">
                {handle}
                {editable && <RemoveBtn onClick={() => set(removeAt(lineas, i))} />}
                <div className="stl-inv-row-main">
                  <Editable as="span" className="stl-inv-concept" editable={editable} value={l.concepto}
                    placeholder="Concepto…" onCommit={(v) => set(replaceAt(lineas, i, { ...l, concepto: v }))} />{" "}
                  <Editable as="span" className="stl-inv-detail" editable={editable} value={l.detalle}
                    placeholder="qué incluye…" onCommit={(v) => set(replaceAt(lineas, i, { ...l, detalle: v }))} />
                </div>
                {/* El aviso de "no suma" es SOLO del editor: el cliente ve el monto tal cual
                    lo escribió Ventas, no nuestra opinión sobre él. */}
                {editable && parsed === "sucio" && (
                  <span className="stl-inv-warn" title="Este monto no entra en el total: dejá solo el número o el rango.">⚠</span>
                )}
                <Editable as="span" className="stl-inv-amount" editable={editable} value={l.monto}
                  placeholder="$0–0" onCommit={(v) => set(replaceAt(lineas, i, { ...l, monto: v }))} />
              </div>
            );
          }}
        </SortableItems>
        {grupo.total && (
          <div className={destacado ? "stl-inv-total" : "stl-inv-subtotal"}>
            <span className="stl-inv-total-label">{rotuloTotal}</span>
            <span className={destacado ? "stl-inv-total-pill" : "stl-inv-subtotal-amount"}>
              {formatRango(grupo.total, moneda)}
            </span>
            {grupo.pendientes > 0 && (
              <span className="stl-inv-pending">
                {`· +${grupo.pendientes} ${t(lang, "montoPorDefinir")}`}
              </span>
            )}
          </div>
        )}
      </div>
      {editable && <AddBtn label="Agregar línea" onClick={nueva} />}
    </>
  );
}

export const InvestmentSection: FC<SectionProps<WebInvestmentData>> = (props) => {
  const { data, ctx, editable, onChange, sectionInvest } = props;
  const lang = landingLang(ctx.lang);

  if (esInversionLegacy(data)) return <InversionLegacy {...props} />;

  const set = (next: Partial<WebInvestmentData>) => onChange?.({ ...data, ...next });
  const moneda = data.moneda ?? "";
  const g = gruposDeInversion(data);
  const extras = data.extras ?? [];
  const recurrentes = data.recurrentes ?? [];
  // Con un solo grupo, ese subtotal ES el total y se pinta con la píldora de siempre.
  const unSoloGrupo = g.gruposConMonto <= 1;
  const rot = (k: keyof InvestLabels, fallback: LandingStringKey) => t(lang, sectionInvest?.[k] ?? fallback);
  // El bloque de licencias solo aparece si tiene contenido o si estamos editando: en lo ya
  // publicado `licencias` cae a [] y la sección se ve exactamente como se publicó.
  const hayLicencias = (data.licencias ?? []).length > 0;

  return (
    <>
      {/* Moneda + nota de exclusiones */}
      {(data.moneda || data.nota || editable) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          {editable ? (
            <label className="stl-inv-currency stl-inv-currency--edit">
              {t(lang, "montosEn")}
              <select
                value={data.moneda || "USD"}
                onChange={(e) => set({ moneda: e.target.value })}
              >
                {[...new Set([...(data.moneda ? [data.moneda] : []), ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          ) : (
            data.moneda && (
              <span className="stl-inv-currency">{`${t(lang, "montosEn")} ${data.moneda}`}</span>
            )
          )}
          {(data.nota || editable) && (
            <span className="stl-inv-note-badge">
              <span className="stl-inv-note-dot" aria-hidden />
              {t(lang, "nota").toUpperCase() + ": "}
              <Editable as="span" editable={editable} value={data.nota ?? ""}
                placeholder="impuestos no contemplados…" onCommit={(v) => set({ nota: v })} />
            </span>
          )}
        </div>
      )}

      <GrupoTabla
        grupo={g.servicios} lang={lang} moneda={moneda} editable={editable}
        chip={rot("servicios", "inversionServicios")}
        rotuloTotal={rot("totalServicios", "totalServicios")}
        destacado={unSoloGrupo} onSet={set}
      />

      {(hayLicencias || editable) && (
        <div className="stl-inv-grupo">
          <GrupoTabla
            grupo={g.licencias} lang={lang} moneda={moneda} editable={editable}
            chip={rot("licencias", "inversionLicencias")}
            rotuloTotal={rot("totalLicencias", "totalLicencias")}
            destacado={false} onSet={set}
          />
        </div>
      )}

      {/* Gran total: SOLO con los dos grupos sumables (ver el header). ⚠ El rótulo tiene que
          declarar qué cubre — mezcla un CapEx de implementación con licencias que suelen ser
          anuales, así que el número solo es honesto con su etiqueta y con la `nota`. */}
      {g.granTotal && (
        <div className="stl-inv-total stl-inv-total--gran">
          <span className="stl-inv-total-label">{rot("granTotal", "inversionTotal")}</span>
          <span className="stl-inv-total-pill">{formatRango(g.granTotal, moneda)}</span>
          {g.pendientesTotales > 0 && (
            <span className="stl-inv-pending">{`· +${g.pendientesTotales} ${t(lang, "montoPorDefinir")}`}</span>
          )}
        </div>
      )}

      {/* Extras opcionales (cards claras) + recurrente mensual (card oscura). NINGUNO suma:
          un opcional no está comprado y un mensual no es una inversión única. */}
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
            <div className={`stl-inv-monthly${data.anchoRecurrente === "ancho" ? " stl-inv-monthly--wide" : ""}`}>
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
    </>
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
