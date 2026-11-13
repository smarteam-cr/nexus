"use client";

/**
 * components/finanzas/equilibrio/ContraElGasto.tsx — lo facturado y lo cobrado de cada mes, lado a lado con lo que
 * costó operar ese mes (2026-11-13, pedido de Finanzas 2).
 *
 * Los tres números ya estaban en «Mes a mes» y en «De la venta a la caja», pero en piezas distintas: para saber si un
 * mes alcanzó había que cruzarlos a ojo. Acá van en una fila por mes, con su barra, y la diferencia de cada uno contra
 * el gasto. El gasto es el de `gastoDelMes`: real si el mes está cerrado (con quién lo confirmó), registrado si pasó sin
 * cerrar, y proyectado desde el día 1 si está en curso o por venir.
 *
 * Y explica las dos tandas de la facturación: a inicio de mes sale lo internacional y lo de Mercury; después kölbi y
 * la segunda quincena. Sin eso, el 5 del mes lo facturado parece poco y no lo es.
 */
import { cn } from "@/lib/cn";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import type { FilaMes } from "@/lib/finanzas/equilibrio";
import { EXPLICACIONES_EQUILIBRIO as E } from "@/lib/finanzas/explicaciones";
import { nombreDelMes } from "@/lib/finanzas/lectura-equilibrio";
import { lecturaDeLasTandas, textoDeFirmeza, type GastoDelMes } from "@/lib/finanzas/panorama";
import { fmtFecha } from "@/components/cobranza/format";
import QueMide from "../QueMide";

const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ContraElGasto({
  meses,
  gastos,
  piso,
  pisoColchon,
  colchonPct,
  hoyISO,
  moneda,
  onAbrirMes,
}: {
  /** Los meses del filtro de fechas. */
  meses: FilaMes[];
  /** El gasto de cada mes con su firmeza, en el mismo orden. */
  gastos: GastoDelMes[];
  piso: number;
  pisoColchon: number;
  colchonPct: number;
  hoyISO: string;
  moneda: string;
  onAbrirMes: (periodo: string) => void;
}) {
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  const firmado = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
  const filas = meses.map((m, i) => ({ m, g: gastos[i]! }));
  const tope = Math.max(1, piso, ...filas.flatMap(({ m, g }) => [m.futuro ? 0 : m.facturado, m.futuro ? 0 : m.cobrado, g.monto]));
  const ancho = (v: number) => `${Math.max(0, (v / tope) * 100).toFixed(2)}%`;
  const mesEnCurso = meses.find((m) => m.periodo === hoyISO.slice(0, 7));
  const tandas = mesEnCurso ? lecturaDeLasTandas(mesEnCurso, hoyISO) : null;

  return (
    <section aria-label="Contra el gasto" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Contra el gasto</span>
        <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-fg">
          Lo facturado y lo cobrado de cada mes, al lado de lo que costó operar
          <QueMide explicacion={E.contraElGasto} titulo="Contra el gasto" />
        </h2>
      </div>

      <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-fg-secondary">
          <span className="inline-flex items-center gap-1.5">
            Gasto operativo de hoy (mínimo exacto): <strong className="tabular-nums text-fg">{usd(piso)}</strong>
            <QueMide explicacion={E.piso} titulo="Mínimo exacto (piso)" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            Con colchón del {colchonPct} %: <strong className="tabular-nums text-fg">{usd(pisoColchon)}</strong>
            <QueMide explicacion={E.pisoColchon} titulo="Mínimo con colchón" />
          </span>
        </div>

        <div className="rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-fg">
          <span className="font-semibold">La facturación sale en dos tandas.</span> Primero, a inicio de mes, la internacional y la
          de Mercury; después, kölbi y la segunda quincena. Por eso a inicio de mes lo facturado se ve bajo: no es que se
          facturó poco, falta la segunda tanda.
          {tandas && mesEnCurso && (
            <>
              {" "}
              En {nombreDelMes(mesEnCurso.periodo)} van facturados <strong className="tabular-nums">{usd(tandas.facturadoHastaHoy)}</strong>
              {tandas.segundaTandaPendiente ? (
                <>
                  {" "}
                  y quedan <strong className="tabular-nums">{usd(tandas.faltaFacturar)}</strong> programados sin factura: la segunda tanda y
                  lo que falte del mes.
                </>
              ) : (
                <>; no queda nada programado sin factura.</>
              )}
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px] leading-[19px] tabular-nums">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="px-2 py-1.5 text-left font-semibold">Mes</th>
                <th className="px-2 py-1.5 text-right font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Facturado <QueMide explicacion={E.facturado} titulo="Facturado" />
                  </span>
                </th>
                <th className="px-2 py-1.5 text-right font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Cobrado <QueMide explicacion={E.cobrado} titulo="Cobrado" />
                  </span>
                </th>
                <th className="px-2 py-1.5 text-right font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Gasto <QueMide explicacion={E.gasto} titulo="Gasto del mes" />
                  </span>
                </th>
                <th className="w-[34%] px-2 py-1.5 text-left font-semibold">Lado a lado</th>
                <th className="px-2 py-1.5 text-right font-semibold">Facturado − gasto</th>
                <th className="px-2 py-1.5 text-right font-semibold">Cobrado − gasto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ m, g }) => {
                const pasoOEnCurso = !m.futuro;
                const difFacturado = m.facturado - g.monto;
                const difCobrado = m.cobrado - g.monto;
                const enCurso = m.periodo === hoyISO.slice(0, 7);
                return (
                  <tr key={m.periodo}>
                    <td className="border-t border-line px-2 py-2">
                      <button type="button" onClick={() => onAbrirMes(m.periodo)} className="font-semibold text-fg hover:text-brand">
                        {MES_LARGO[m.mes - 1]}
                      </button>
                      {enCurso && <span className="ml-1.5 text-[11px] text-info-ink">en curso</span>}
                    </td>
                    <td className="border-t border-line px-2 py-2 text-right text-fg-secondary">{pasoOEnCurso ? usd(m.facturado) : "—"}</td>
                    <td className="border-t border-line px-2 py-2 text-right text-fg-secondary">{pasoOEnCurso ? usd(m.cobrado) : "—"}</td>
                    <td className="border-t border-line px-2 py-2 text-right text-fg-secondary" title={textoDeFirmeza(g, usd, fmtFecha)}>
                      {usd(g.monto)}
                      <span
                        className={cn(
                          "ml-1 text-[11px]",
                          g.firmeza === "REAL" ? "text-success-ink" : g.firmeza === "PROYECTADO" ? "text-fg-muted" : "text-warn-ink",
                        )}
                      >
                        {g.firmeza === "REAL" ? "real" : g.firmeza === "PROYECTADO" ? "proyectado" : "sin cerrar"}
                      </span>
                    </td>
                    <td className="border-t border-line px-2 py-2">
                      <div aria-hidden className="relative flex flex-col gap-[3px]">
                        <span className="block h-1.5 rounded-full" style={{ width: pasoOEnCurso ? ancho(m.facturado) : 0, background: "var(--serie-1)" }} />
                        <span className="block h-1.5 rounded-full" style={{ width: pasoOEnCurso ? ancho(m.cobrado) : 0, background: "var(--serie-3)" }} />
                        <span
                          className="block h-1.5 rounded-full"
                          style={
                            g.firmeza === "PROYECTADO"
                              ? { width: ancho(g.monto), border: "1.5px dashed var(--fg-muted)" }
                              : { width: ancho(g.monto), background: "var(--fg-muted)" }
                          }
                        />
                        <span className="absolute inset-y-[-2px] border-l-2 border-fg" style={{ left: ancho(piso) }} />
                      </div>
                    </td>
                    <td
                      className={cn(
                        "border-t border-line px-2 py-2 text-right",
                        !pasoOEnCurso ? "text-fg-muted" : difFacturado >= 0 ? "text-success-ink" : enCurso ? "text-fg-secondary" : "text-danger-ink",
                      )}
                    >
                      {pasoOEnCurso ? firmado(difFacturado) : "—"}
                    </td>
                    <td
                      className={cn(
                        "border-t border-line px-2 py-2 text-right",
                        !pasoOEnCurso ? "text-fg-muted" : difCobrado >= 0 ? "text-success-ink" : enCurso ? "text-fg-secondary" : "text-danger-ink",
                      )}
                    >
                      {pasoOEnCurso ? firmado(difCobrado) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: "var(--serie-1)" }} /> Facturado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: "var(--serie-3)" }} /> Cobrado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: "var(--fg-muted)" }} /> Gasto real o sin cerrar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full border border-dashed border-fg-muted" /> Gasto proyectado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 border-l-2 border-fg" /> Mínimo exacto
          </span>
          <span>En el mes en curso la diferencia todavía no dice nada: falta la segunda tanda. Todo sin IVA.</span>
        </div>
      </article>
    </section>
  );
}
