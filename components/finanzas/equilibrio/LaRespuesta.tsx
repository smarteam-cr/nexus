"use client";

/**
 * components/finanzas/equilibrio/LaRespuesta.tsx — arriba del punto de equilibrio, la pregunta del CEO: ¿alcanza lo que
 * se factura para cubrir lo que cuesta operar? (rediseño para RevOps, CFO y CEO, 2026-10-05).
 *
 * Tres piezas: la barra que compara lo facturado por mes con el piso de hoy (con y sin aliados), el margen a la fecha
 * desarmado en su cuenta —con el porqué de «preliminar» al pasar el mouse—, y lo que viene hasta fin de año.
 * Todos los números salen de lib/finanzas/lectura-equilibrio.ts: acá no se calcula plata.
 */
import { cn } from "@/lib/cn";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { fmtFecha } from "@/components/cobranza/format";
import { usePanelFlotante } from "@/components/ui";
import {
  nombreDelMes,
  rangoDeMeses,
  type DesgloseDelMargen,
  type LoQueViene,
  type PorQueEsPreliminar,
  type RespuestaDelAnio,
} from "@/lib/finanzas/lectura-equilibrio";

export interface CriterioDeAliados {
  /** Si cuentan, tal como rigió en este reporte. */
  cuentan: boolean;
  /** Quién lo decidió y cuándo; null = sin decidir (rige el valor por defecto). */
  decidido: { por: string; en: string } | null;
}

export default function LaRespuesta({
  anio,
  moneda,
  respuesta,
  margen,
  preliminar,
  viene,
  aliados,
  onSimular,
  onDecidirAliados,
}: {
  anio: number;
  moneda: string;
  respuesta: RespuestaDelAnio | null;
  margen: DesgloseDelMargen | null;
  preliminar: PorQueEsPreliminar;
  viene: LoQueViene | null;
  aliados: CriterioDeAliados;
  onSimular: () => void;
  onDecidirAliados: () => void;
}) {
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);

  return (
    <section data-recorrido="fin.equilibrio.indicadores" aria-label="La respuesta" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">La respuesta</span>
        <h2 className="text-lg font-semibold text-fg">¿Alcanza lo que se factura para cubrir lo que cuesta operar?</h2>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <article className="flex min-w-0 flex-[2_1_560px] flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          {respuesta ? <Barra respuesta={respuesta} anio={anio} usd={usd} /> : <p className="text-sm text-fg-muted">Todavía no terminó ningún mes de {anio}.</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-fg-secondary">
            <span>
              Los aliados <strong className="font-semibold text-fg">{aliados.cuentan ? "cuentan" : "no cuentan"}</strong> para cubrir el piso
              {aliados.decidido ? ` · lo decidió ${aliados.decidido.por} el ${fmtFecha(aliados.decidido.en)}` : " · sin decidir: es el valor de siempre"}
            </span>
            <button type="button" onClick={onDecidirAliados} className="font-semibold text-brand hover:text-brand-light">
              {aliados.decidido ? "Cambiar" : "Decidirlo"}
            </button>
          </div>
        </article>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          <Margen margen={margen} preliminar={preliminar} usd={usd} />
          {viene && (
            <article className="flex flex-1 flex-col gap-1 rounded-xl border border-line bg-surface p-4">
              <span className="text-xs text-fg-muted">Lo que viene · {rangoDeMeses(viene.meses)}</span>
              <span className="text-[22px] font-bold leading-7 text-fg">{usd(viene.facturadoYProgramado)}</span>
              <span className="text-xs leading-[17px] text-fg-secondary">
                Facturado y programado, contra un piso de {usd(viene.pisoDelPeriodo)}
                {viene.meses.length > 1 ? ` en ${viene.meses.length === 3 ? "el trimestre" : "esos meses"}` : ""}:{" "}
                <strong className={cn("font-semibold", viene.falta > 0 ? "text-warn-ink" : "text-success-ink")}>
                  {viene.falta > 0 ? `faltan ${usd(viene.falta)}` : `sobran ${usd(-viene.falta)}`}
                </strong>
                .
              </span>
              <button type="button" onClick={onSimular} className="mt-1 self-start text-[13px] font-semibold text-brand hover:text-brand-light">
                Simular {viene.meses.length === 3 ? "el trimestre" : "lo que queda"}
              </button>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

/** La barra: lo facturado por mes (y con los aliados) contra el piso de hoy y su meta del 10 %. */
function Barra({ respuesta: r, anio, usd }: { respuesta: RespuestaDelAnio; anio: number; usd: (n: number) => string }) {
  const tope = Math.ceil((Math.max(r.piso, r.meta ?? 0, r.promedioConAliados) * 1.15) / 5000) * 5000;
  const pct = (v: number) => `${((v / tope) * 100).toFixed(2)}%`;
  const hayAliados = r.promedioConAliados > r.promedioFacturado;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <span className="text-[15px] font-semibold text-fg">Facturado por mes en {anio} contra el piso de hoy</span>
        <span className="text-xs text-fg-muted">promedio de {rangoDeMeses(r.meses)} · sin IVA</span>
      </div>
      <div className="relative h-[92px]" aria-hidden>
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-fg" style={{ left: pct(r.piso) }}>
          Piso {usd(r.piso)}
        </span>
        <div className="absolute inset-x-0 top-[30px] h-[30px] rounded-md bg-surface-hover" />
        <div className="absolute left-0 top-[30px] h-[30px] rounded-l-md" style={{ width: pct(r.promedioFacturado), background: "var(--serie-1)" }} />
        {hayAliados && (
          <div
            className="absolute top-[30px] h-[30px] rounded-r-md"
            style={{ left: `calc(${pct(r.promedioFacturado)} + 2px)`, width: `calc(${pct(r.promedioConAliados - r.promedioFacturado)} - 2px)`, background: "var(--serie-5)" }}
          />
        )}
        <div className="absolute top-[22px] h-[46px] border-l-2 border-fg" style={{ left: pct(r.piso) }} />
        {r.meta !== null && (
          <>
            <div className="absolute top-[26px] h-[38px] border-l-2 border-dotted border-fg-muted" style={{ left: pct(r.meta) }} />
            <span className="absolute top-[70px] -translate-x-1/2 whitespace-nowrap text-xs text-fg-muted" style={{ left: pct(r.meta) }}>
              +10 % {usd(r.meta)}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-fg-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-1)" }} />
          Facturado: <strong className="text-fg">{usd(r.promedioFacturado)}</strong>
        </span>
        {hayAliados && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--serie-5)" }} />
            Con lo que pagaron los aliados: <strong className="text-fg">{usd(r.promedioConAliados)}</strong>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 border-l-2 border-fg" />
          Piso: lo que cuesta operar un mes con los costos de hoy
        </span>
      </div>
      <p className="max-w-[760px] text-sm leading-[21px] text-fg [text-wrap:pretty]">
        {r.faltaSinAliados > 0 ? (
          <>
            Sin los aliados, {anio} factura <strong>{usd(r.faltaSinAliados)} por mes menos</strong> de lo que cuesta operar hoy.
            {hayAliados &&
              (r.sobraConAliados >= 0
                ? ` Con lo que pagaron los aliados en ${r.mesesConAliados.map(nombreDelMes).join(" y ")}, sobran ${usd(r.sobraConAliados)}.`
                : ` Ni con lo que pagaron los aliados alcanza: faltan ${usd(-r.sobraConAliados)} por mes.`)}
          </>
        ) : (
          <>
            {anio} factura <strong>{usd(r.promedioFacturado - r.piso)} por mes más</strong> de lo que cuesta operar hoy, sin contar a los aliados.
          </>
        )}
      </p>
    </>
  );
}

/** El margen a la fecha con su cuenta, y por qué es preliminar al pasar el mouse por la marca. */
function Margen({ margen, preliminar, usd }: { margen: DesgloseDelMargen | null; preliminar: PorQueEsPreliminar; usd: (n: number) => string }) {
  const { abierto, setAbierto, cerrar, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({ side: "bottom", align: "end", selectorDeItems: "a" });
  const abrir = () => {
    if (!abierto) alternar();
  };
  return (
    <article className="flex flex-1 flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">Margen a la fecha{margen ? ` · ${rangoDeMeses(margen.meses)}` : ""}</span>
        {preliminar.razones.length > 0 && (
          <div ref={rootRef} onMouseEnter={abrir} onMouseLeave={cerrar}>
            <button
              ref={btnRef}
              type="button"
              onClick={() => (abierto ? setAbierto(false) : alternar())}
              onFocus={abrir}
              aria-expanded={abierto}
              aria-describedby={abierto ? "por-que-preliminar" : undefined}
              className={cn(
                "inline-flex cursor-help items-center gap-1 rounded-full border py-px pl-2 pr-1.5 text-[11px] font-semibold",
                preliminar.preliminar ? "border-warn-line bg-warn-surface text-warn-ink" : "border-success-line bg-success-surface text-success-ink",
              )}
            >
              {preliminar.preliminar ? "Preliminar" : "✓ Firme"}
              <svg aria-hidden viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </button>
            {abierto && pos && (
              <div
                ref={panelRef}
                id="por-que-preliminar"
                role="tooltip"
                className="fixed z-50 flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-[10px] border border-line bg-surface px-4 py-3.5 text-[13px] leading-[19px] text-fg-secondary shadow-xl"
                style={pos}
              >
                <span className="font-semibold text-fg">{preliminar.preliminar ? "¿Por qué es preliminar?" : "¿De dónde sale?"}</span>
                {preliminar.razones.map((t) => (
                  <span key={t}>· {t}</span>
                ))}
                {preliminar.cuando && <span className="border-t border-line pt-2 text-fg">{preliminar.cuando}</span>}
              </div>
            )}
          </div>
        )}
      </div>
      {margen ? (
        <>
          <span className="text-[22px] font-bold leading-7 text-fg">{usd(margen.margen)}</span>
          <dl className="flex flex-col gap-[3px] text-xs leading-[17px] text-fg-secondary">
            <div className="flex justify-between gap-3">
              <dt>Ingresos</dt>
              <dd className="tabular-nums">{usd(margen.ingresos)}</dd>
            </div>
            {margen.aliados > 0 && (
              <div className="text-fg-muted">
                facturado {usd(margen.facturado)} + aliados {usd(margen.aliados)}
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Gasto de {margen.meses.length === 1 ? "ese mes" : `esos ${margen.meses.length} meses`}</dt>
              <dd className="tabular-nums">− {usd(margen.gasto)}</dd>
            </div>
            {margen.aliados > 0 && (
              <div className="flex justify-between gap-3 border-t border-line pt-1">
                <dt>Sin los aliados</dt>
                <dd className={cn("font-semibold tabular-nums", margen.sinAliados < 0 ? "text-warn-ink" : "text-fg")}>
                  {margen.sinAliados < 0 ? `− ${usd(-margen.sinAliados)}` : usd(margen.sinAliados)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Lo que quedó en caja</dt>
              <dd className="tabular-nums">{usd(margen.caja)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <span className="text-sm text-fg-muted">Ningún mes tiene el gasto completo todavía: no hay margen que afirmar.</span>
      )}
    </article>
  );
}
