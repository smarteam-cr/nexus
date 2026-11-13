/**
 * components/finanzas/caja/LaCajaDeHoy.tsx — la revisión diaria de la caja, en Pendientes (2026-11-13).
 *
 * Server Component. Lo pinta Pendientes SOLO para quien tiene «Caja y pagos» (la página decide; acá no se vuelve a
 * mirar el permiso). Dice si alguien revisó la caja hoy, qué se paga esta semana, qué saldos faltan o están viejos y
 * cuánto quedará libre al cierre, con el botón a «Dónde está la plata».
 */
import Link from "next/link";
import { fmtMonto } from "@/components/cobranza/format";
import type { ResumenDeCaja } from "@/lib/finanzas/caja/caja-server";

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("es-CR")}`;

function montos(t: { CRC: number; USD: number }): string {
  const partes = (["USD", "CRC"] as const).filter((m) => t[m] !== 0).map((m) => fmtMonto(t[m], m));
  return partes.length ? partes.join(" + ") : "nada";
}

export default function LaCajaDeHoy({ r }: { r: ResumenDeCaja }) {
  const avisos: string[] = [];
  if (r.cuentasSinSaldo > 0) avisos.push(r.cuentasSinSaldo === 1 ? "1 cuenta sin saldo" : `${r.cuentasSinSaldo} cuentas sin saldo`);
  if (r.saldosViejos > 0) avisos.push(r.saldosViejos === 1 ? "1 saldo de hace más de 3 días" : `${r.saldosViejos} saldos de hace más de 3 días`);
  if (r.primerFaltante) avisos.push(`la plata no alcanza en ${r.primerFaltante.etiqueta}`);
  const pendiente = !r.revisadaHoy;
  return (
    <section
      aria-label="La caja de hoy"
      className={pendiente ? "space-y-2 rounded-xl border border-warn-line bg-warn-surface p-4" : "space-y-2 rounded-xl border border-line bg-surface-muted p-4"}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">La caja de hoy</span>
      <p className="text-[13px] leading-[1.45] text-fg-secondary">
        {r.revisadaHoy ? `Ya la revisó ${r.revisadaHoy.por.split("@")[0]}. ` : "Todavía nadie la revisó hoy. "}
        Esta semana se pagan {r.pagosDeLaSemana.n === 1 ? "1 cosa" : `${r.pagosDeLaSemana.n} cosas`} ({montos(r.pagosDeLaSemana.totales)})
        {r.esperando > 0 ? ` y ${r.esperando} esperan algo para poder pagarse` : ""}.
        {r.libreAlCierreEnUsd !== null ? ` Libre al cierre del año: ${fmtUsd(r.libreAlCierreEnUsd)}.` : ` Libre al cierre: ${montos(r.alCierre)}.`}
      </p>
      {avisos.length > 0 && <p className="text-[13px] font-medium text-warn-ink">Mira: {avisos.join(" · ")}.</p>}
      <Link href="/finanzas/caja" className="text-[13px] font-semibold text-brand hover:text-brand-light">
        {pendiente ? "Revisar la caja" : "Ver dónde está la plata"}
      </Link>
    </section>
  );
}
