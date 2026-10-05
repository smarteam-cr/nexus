"use client";

/**
 * components/finanzas/equilibrio/Firmeza.tsx — la pregunta del CFO: ¿qué tan firmes son estos números? (rediseño del
 * punto de equilibrio, 2026-10-05). La cobranza en cada moneda (y cuánto difiere del Excel de Alex), de qué está hecho
 * el piso, y lo que todavía no entra en los números.
 */
import Link from "next/link";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { etiquetaRubro, RUBROS, type FilaMes, type ReporteEquilibrio } from "@/lib/finanzas/equilibrio";
import type { CobranzaDeMoneda } from "@/lib/cobranza/antiguedad";
import type { ComparacionConExcel } from "@/lib/finanzas/cobranza-contra-excel";
import type { Inconsistencia } from "@/lib/finanzas/inconsistencias";
import { esFaltanteDePlanilla } from "@/lib/finanzas/cierre";
import { faltanteLegible, nombreDelMes, rangoDeMeses } from "@/lib/finanzas/lectura-equilibrio";
import { fmtFecha } from "@/components/cobranza/format";

const NOMBRE_DE_MONEDA: Record<string, string> = { USD: "Dólares", CRC: "Colones" };
const OPACIDAD_DEL_PISO = [1, 0.7, 0.5, 0.35, 0.2];

export default function Firmeza({
  moneda,
  hoyISO,
  cobranza,
  excel,
  piso,
  meses,
  inconsistencias,
  sinTasaDelBccr,
  onVerExcel,
  onAbrirLinea,
}: {
  moneda: string;
  hoyISO: string;
  cobranza: Readonly<Record<string, CobranzaDeMoneda>>;
  excel: ComparacionConExcel;
  piso: ReporteEquilibrio["pisoVigente"];
  meses: FilaMes[];
  inconsistencias: readonly Inconsistencia[];
  /** Los meses que ya pasaron y todavía usan la tasa cargada a mano (no la del BCCR), y esa tasa si es una sola. */
  sinTasaDelBccr: { meses: string[]; tasa: number | null };
  onVerExcel: () => void;
  onAbrirLinea: (codigo: string) => void;
}) {
  const usd = (n: number, m: string = moneda) => fmtMontoLibro(Math.round(n), m);
  const monedas = Object.entries(cobranza).filter(([, c]) => c.facturado > 0 || c.porCobrar > 0).sort(([a], [b]) => (a === moneda ? -1 : b === moneda ? 1 : a.localeCompare(b)));
  const difExcel = excel.estado === "OK" ? excel.porMoneda[moneda] : undefined;
  const causaMayor = difExcel?.causas.slice().sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0];
  const QUE_ES: Record<string, string> = {
    SIN_CUENTA: "son de clientes sin cuenta acá",
    SIN_FACTURA: "son facturas que Nexus no tiene",
    FALTA_CARGAR: "falta cargarlos en Nexus",
    IVA: "es el IVA, que el Excel incluye",
    NO_CUADRA: "no cuadran entre los dos",
  };

  const rubros = piso ? RUBROS.filter((r) => piso.porRubro[r] > 0).sort((a, b) => piso.porRubro[b] - piso.porRubro[a]) : [];

  const odoo = inconsistencias.find((l) => l.codigo === "ODOO_FACTURADO_SIN_CUENTA");
  const mercury = inconsistencias.find((l) => l.codigo === "MERCURY_POR_COBRAR_SIN_EMPAREJAR");
  const conPlanillaFaltante = meses.filter((m) => m.periodo < hoyISO.slice(0, 7) && m.faltantes.some(esFaltanteDePlanilla));
  const primeraSinPlanilla = conPlanillaFaltante[0];

  return (
    <section id="firmeza" aria-label="Qué tan firmes son los números" className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Firmeza</span>
        <h2 className="text-lg font-semibold text-fg">¿Qué tan firmes son estos números?</h2>
      </div>
      <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <article data-recorrido="fin.equilibrio.cobranza" className="flex flex-col gap-3 overflow-x-auto rounded-xl border border-line bg-surface p-5">
          <span className="text-[15px] font-semibold text-fg">La cobranza, en cada moneda</span>
          <table className="w-full min-w-[320px] border-collapse text-[13px] leading-[19px] tabular-nums">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="pb-1.5 text-left font-semibold" />
                <th className="pb-1.5 text-right font-semibold">Facturado</th>
                <th className="pb-1.5 text-right font-semibold">Cobrado</th>
                <th className="pb-1.5 text-right font-semibold">Vencido</th>
              </tr>
            </thead>
            <tbody>
              {monedas.map(([m, c]) => (
                <tr key={m}>
                  <td className="border-t border-line py-2 font-semibold text-fg">{NOMBRE_DE_MONEDA[m] ?? m}</td>
                  <td className="border-t border-line py-2 text-right text-fg-secondary">{usd(c.facturado, m)}</td>
                  <td className="border-t border-line py-2 text-right text-fg-secondary">
                    {c.sobreFacturado === null ? "—" : `${Math.round(c.sobreFacturado * 100)} %`}
                  </td>
                  <td className="border-t border-line py-2 text-right text-danger-ink">{usd(c.vencido, m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="text-xs leading-[17px] text-fg-secondary">
            {excel.estado === "OK" && difExcel && Math.abs(difExcel.diferencia) >= 1 ? (
              <>
                El Excel de Alex ({fmtFecha(excel.subidoEl)}) tiene {usd(Math.abs(difExcel.diferencia))} {difExcel.diferencia > 0 ? "más" : "menos"} por
                cobrar en {moneda === "USD" ? "dólares" : "colones"} que Nexus
                {causaMayor && QUE_ES[causaMayor.causa] ? `: ${usd(Math.abs(causaMayor.monto))} ${QUE_ES[causaMayor.causa]}` : ""}.{" "}
              </>
            ) : excel.estado === "OK" ? (
              <>Lo por cobrar coincide con el Excel de Alex ({fmtFecha(excel.subidoEl)}). </>
            ) : (
              <>Todavía no hay un Excel de Alex con qué comparar. </>
            )}
            <button type="button" onClick={onVerExcel} className="font-semibold text-brand hover:text-brand-light">
              Ver la cobranza contra el Excel
            </button>
          </span>
        </article>

        {piso && rubros.length > 0 && (
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-fg">De qué está hecho el piso</span>
              <span className="text-xs text-fg-muted">por mes, con los {piso.cuantos} costos de hoy</span>
            </div>
            <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {rubros.map((r, i) => (
                <span
                  key={r}
                  className="block min-w-[3px]"
                  style={{ flex: `0 0 calc(${((piso.porRubro[r] / piso.base) * 100).toFixed(2)}% - 2px)`, background: "var(--fg-secondary)", opacity: OPACIDAD_DEL_PISO[i] ?? 0.2 }}
                />
              ))}
            </div>
            {rubros.map((r, i) => (
              <div key={r} className="flex items-center gap-2 text-[13px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "var(--fg-secondary)", opacity: OPACIDAD_DEL_PISO[i] ?? 0.2 }} />
                <span className="flex-1 text-fg first-letter:uppercase">{etiquetaRubro(r)}</span>
                <span className="tabular-nums text-fg-secondary">{usd(piso.porRubro[r])}</span>
                <span className="w-11 text-right tabular-nums text-fg-muted">
                  {((piso.porRubro[r] / piso.base) * 100).toLocaleString("es-CR", { maximumFractionDigits: piso.porRubro[r] / piso.base < 0.01 ? 1 : 0 })} %
                </span>
              </div>
            ))}
          </article>
        )}

        <article className="flex flex-col gap-2.5 rounded-xl border border-dashed border-line bg-surface-muted p-5">
          <span className="text-[15px] font-semibold text-fg">Lo que todavía no está en estos números</span>
          {odoo && odoo.montoEnJuego !== null && (
            <Pendiente
              titulo={`${usd(odoo.montoEnJuego)} facturados en Odoo a ${odoo.items.length === 1 ? "1 cliente" : `${odoo.items.length} clientes`} sin cuenta en Nexus.`}
              detalle={`${odoo.items.length > 1 ? `Casi todo ${odoo.items[0]!.texto} y ${odoo.items[1]!.texto}.` : ""}${odoo.yaContadoEn ? " Buena parte es la misma plata que las ventas sin respaldo." : ""}`}
              accion={<BotonDeTexto onClick={() => onAbrirLinea(odoo.codigo)}>Ver los clientes</BotonDeTexto>}
            />
          )}
          {mercury && mercury.items.length > 0 && (
            <Pendiente
              titulo={`${usd(mercury.items.reduce((s, it) => s + (it.monto ?? 0), 0))} por cobrar en Mercury de ${mercury.items.length === 1 ? "1 cliente" : `${mercury.items.length} clientes`} sin emparejar.`}
              detalle="Puede que ya estén en «por cobrar»: se sabe al emparejarlos."
              accion={
                <Link href="/finanzas/conciliacion" className="font-semibold text-brand hover:text-brand-light">
                  Emparejar
                </Link>
              }
            />
          )}
          {primeraSinPlanilla && (
            <Pendiente
              titulo={`La planilla desde ${primeraSinPlanilla.faltantes.includes("planilla") ? nombreDelMes(primeraSinPlanilla.periodo) : `${faltanteLegible(primeraSinPlanilla.faltantes.find(esFaltanteDePlanilla)!).replace(/ de planilla$/, "")} de ${nombreDelMes(primeraSinPlanilla.periodo)}`}.`}
              detalle={`Por eso ${rangoDeMeses(conPlanillaFaltante.map((m) => m.periodo))} no ${conPlanillaFaltante.length === 1 ? "entra" : "entran"} al margen.`}
              accion={
                <Link href="/finanzas/costos/planillas" className="font-semibold text-brand hover:text-brand-light">
                  Planilla
                </Link>
              }
            />
          )}
          {sinTasaDelBccr.meses.length > 0 && (
            <Pendiente
              titulo={`${rangoDeMeses(sinTasaDelBccr.meses).replace(/^./, (c) => c.toUpperCase())} con ${sinTasaDelBccr.tasa !== null ? `₡${sinTasaDelBccr.tasa.toLocaleString("es-CR")} por dólar cargado a mano` : "un tipo de cambio cargado a mano"}, no el del Banco Central.`}
              detalle="Lo que está en colones en esos meses se corrige solo cuando se traiga el histórico del BCCR."
              accion={
                <Link href="/finanzas/tipo-de-cambio" className="font-semibold text-brand hover:text-brand-light">
                  Tipo de cambio
                </Link>
              }
            />
          )}
          {!odoo && !(mercury && mercury.items.length > 0) && !primeraSinPlanilla && sinTasaDelBccr.meses.length === 0 && (
            <span className="text-[13px] text-fg-muted">Nada afuera: todo lo que se sabe del año está en estos números.</span>
          )}
        </article>
      </div>
    </section>
  );
}

function Pendiente({ titulo, detalle, accion }: { titulo: string; detalle: string; accion: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-2.5">
      <span className="text-sm leading-5 text-fg">
        <span className="text-fg-muted">○</span> <strong className="font-semibold">{titulo}</strong>
      </span>
      <span className="text-[13px] leading-[19px] text-fg-secondary">
        {detalle} {accion}
      </span>
    </div>
  );
}

function BotonDeTexto({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-brand hover:text-brand-light">
      {children}
    </button>
  );
}
