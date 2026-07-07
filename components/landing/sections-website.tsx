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
import { landingLang, t } from "./i18n";
import type {
  SectionProps,
  WebDiagnosisData,
  SiteArchitectureData,
  WebScopeData,
  WebMethodologyData,
  WebInvestmentData,
  WebInvestLine,
  WhyUsData,
} from "./types";

// ── 2) Diagnóstico y contexto — retos (izq) + panel oscuro "Por qué X" (der) ──
export const WebDiagnosisSection: FC<SectionProps<WebDiagnosisData>> = ({ data, ctx, editable, onChange }) => {
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
          <span className="stl-diag-chip">{t(lang, "retosActuales")}</span>
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
            {/*  : el espacio normal se colapsa entre items del inline-flex */}
            {`${t(lang, "porQue")} `}
            <Editable as="span" editable={editable} value={data.plataforma ?? ""}
              placeholder="HubSpot Content Hub…" onCommit={(v) => set({ plataforma: v })} />
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

// ── 7) Inversión (web) — tabla fase 1 + TOTAL autocalculado + extras + mensual ──

/** Monedas frecuentes del negocio (el select ofrece además "Otra…" con código libre). */
const CURRENCIES = ["USD", "CRC", "MXN", "COP", "PEN", "CLP", "GTQ", "DOP", "EUR"];

/** Extrae los números de un monto en texto ("$5,600–6,650" → {min:5600, max:6650}).
 *  Sin números parseables → null (la línea no entra al total). */
function parseAmount(monto: string): { min: number; max: number } | null {
  const nums = (monto.match(/\d[\d,.]*/g) ?? [])
    .map((s) => parseFloat(s.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Suma los montos parseables de las líneas → rango total, o null si ninguna parsea. */
function totalOf(lines: WebInvestLine[]): { min: number; max: number } | null {
  let min = 0;
  let max = 0;
  let any = false;
  for (const l of lines) {
    const a = parseAmount(l.monto ?? "");
    if (!a) continue;
    any = true;
    min += a.min;
    max += a.max;
  }
  return any ? { min, max } : null;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export const WebInvestmentSection: FC<SectionProps<WebInvestmentData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const set = (next: Partial<WebInvestmentData>) => onChange?.({ ...data, ...next });
  const lineas = data.lineas ?? [];
  const extras = data.extras ?? [];
  const recurrentes = data.recurrentes ?? [];
  const total = totalOf(lineas);

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

      {/* Fase 1: chip + tabla + total autocalculado */}
      <span className="stl-inv-chip">{t(lang, "inversionFase")}</span>
      <div className="stl-inv-table">
        <SortableItems items={lineas} disabled={!editable} onReorder={(next) => set({ lineas: next })}
          container={(nodes) => <>{nodes}</>}>
          {(l, i, handle) => (
            <div className="stl-item stl-inv-row">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ lineas: removeAt(lineas, i) })} />}
              <div className="stl-inv-row-main">
                <Editable as="span" className="stl-inv-concept" editable={editable} value={l.concepto}
                  placeholder="Concepto…" onCommit={(v) => set({ lineas: replaceAt(lineas, i, { ...l, concepto: v }) })} />{" "}
                <Editable as="span" className="stl-inv-detail" editable={editable} value={l.detalle}
                  placeholder="qué incluye…" onCommit={(v) => set({ lineas: replaceAt(lineas, i, { ...l, detalle: v }) })} />
              </div>
              <Editable as="span" className="stl-inv-amount" editable={editable} value={l.monto}
                placeholder="$0–0" onCommit={(v) => set({ lineas: replaceAt(lineas, i, { ...l, monto: v }) })} />
            </div>
          )}
        </SortableItems>
        {total && (
          <div className="stl-inv-total">
            <span className="stl-inv-total-label">{t(lang, "rangoFase")}</span>
            <span className="stl-inv-total-pill">
              {total.min === total.max
                ? fmtMoney(total.min)
                : `${fmtMoney(total.min)}–${total.max.toLocaleString("en-US")}`}
            </span>
          </div>
        )}
      </div>
      {editable && <AddBtn label="Agregar línea" onClick={() => set({ lineas: appendItem(lineas, { concepto: "", monto: "", detalle: "" }) })} />}

      {/* Extras opcionales (cards claras) + recurrente mensual (card oscura) */}
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
