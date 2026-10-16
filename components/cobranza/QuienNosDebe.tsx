"use client";

/**
 * components/cobranza/QuienNosDebe.tsx — «Quién nos debe» (2026-10-16): una fila por cliente con lo vencido, lo que
 * está en plazo y lo que falta facturar, desde cuándo debe, la promesa y el último contacto. Tocar un cliente abre sus
 * cuotas; «Abrir la cuenta» lleva a la ficha de cobro.
 *
 * Las reglas viven en lib/cobranza/quien-debe.ts y son las de la cola: esta pestaña no inventa otro «vencido». Los
 * montos van por moneda y nunca se suman entre sí.
 */
import { Fragment, useMemo, useState } from "react";
import type { ColaCobroRow } from "@/lib/cobranza";
import { quienNosDebe, type ContactoDeCuenta, type MontosDeMoneda, type Situacion } from "@/lib/cobranza/quien-debe";
import { cn } from "@/lib/cn";
import { fmtFecha, fmtMonto } from "./format";

const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";
const TD = "px-3 py-2.5 align-top";

const SITUACION: Record<Situacion, { texto: string; cls: string }> = {
  vencido: { texto: "Vencida", cls: "border-danger-line bg-danger-surface text-danger-ink" },
  porVencer: { texto: "En plazo", cls: "border-line bg-surface-muted text-fg-secondary" },
  faltaFacturar: { texto: "Falta facturar", cls: "border-warn-line bg-warn-surface text-warn-ink" },
  programado: { texto: "Por venir", cls: "border-line text-fg-muted" },
};

const CONTACTO: Record<string, string> = { LLAMADA: "llamada", CORREO: "correo" };

/** Los montos de un campo, una línea por moneda; «—» si no hay. */
function Montos({ montos, campo, cls }: { montos: Record<string, MontosDeMoneda>; campo: keyof MontosDeMoneda; cls?: string }) {
  const lineas = Object.entries(montos).filter(([, m]) => m[campo] > 0);
  if (!lineas.length) return <span className="text-fg-muted">—</span>;
  return (
    <span className="grid gap-0.5">
      {lineas.map(([moneda, m]) => (
        <span key={moneda} className={cn("tabular-nums whitespace-nowrap", cls)}>
          {fmtMonto(m[campo], moneda)}
        </span>
      ))}
    </span>
  );
}

export default function QuienNosDebe({
  cola,
  contactos,
  todayISO,
  onOpenCuenta,
}: {
  cola: ColaCobroRow[];
  contactos: Record<string, ContactoDeCuenta>;
  todayISO: string;
  onOpenCuenta: (cuentaId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [soloVencido, setSoloVencido] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const { filas, totales } = useMemo(() => quienNosDebe(cola, todayISO, new Map(Object.entries(contactos))), [cola, contactos, todayISO]);
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return filas.filter(
      (f) => (!texto || f.cliente.toLowerCase().includes(texto)) && (!soloVencido || Object.values(f.montos).some((m) => m.vencido > 0)),
    );
  }, [filas, q, soloVencido]);
  const monedas = Object.keys(totales).sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-secondary max-w-3xl">
        Cuánto debe cada cliente, desde cuándo y qué se acordó. Sale de la misma cola de cobros: <b className="text-fg">vencido</b> es una factura
        emitida con el plazo de crédito cumplido; <b className="text-fg">en plazo</b> es una factura que todavía no vence;{" "}
        <b className="text-fg">falta facturar</b> es una cuota atrasada sin factura, que es trabajo nuestro y no deuda del cliente.
      </p>

      {/* Los totales, por moneda: nunca se suman dólares con colones. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-danger-line bg-danger-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-danger-ink">Vencido</p>
          <div className="mt-1.5 grid gap-0.5">
            {monedas.filter((m) => totales[m]!.vencido > 0).map((m) => (
              <p key={m} className="text-lg font-semibold tabular-nums leading-tight text-fg">
                {fmtMonto(totales[m]!.vencido, m)}
                <span className="ml-2 text-[11px] font-normal text-fg-muted">
                  {totales[m]!.clientesConVencido} cliente{totales[m]!.clientesConVencido !== 1 ? "s" : ""}
                </span>
              </p>
            ))}
            {monedas.every((m) => totales[m]!.vencido === 0) && <p className="text-lg font-semibold text-success-ink">Nada vencido</p>}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">En plazo</p>
          <div className="mt-1.5 grid gap-0.5">
            {monedas.filter((m) => totales[m]!.porVencer > 0).map((m) => (
              <p key={m} className="text-lg font-semibold tabular-nums leading-tight text-fg">{fmtMonto(totales[m]!.porVencer, m)}</p>
            ))}
            {monedas.every((m) => totales[m]!.porVencer === 0) && <p className="text-lg font-semibold text-fg-muted">—</p>}
          </div>
          <p className="mt-0.5 text-[11px] text-fg-muted">facturado y todavía sin vencer</p>
        </div>
        <div className="rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warn-ink">Falta facturar</p>
          <div className="mt-1.5 grid gap-0.5">
            {monedas.filter((m) => totales[m]!.faltaFacturar > 0).map((m) => (
              <p key={m} className="text-lg font-semibold tabular-nums leading-tight text-fg">{fmtMonto(totales[m]!.faltaFacturar, m)}</p>
            ))}
            {monedas.every((m) => totales[m]!.faltaFacturar === 0) && <p className="text-lg font-semibold text-fg-muted">—</p>}
          </div>
          <p className="mt-0.5 text-[11px] text-fg-muted">cuotas atrasadas que no tienen factura</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id="quien-debe-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-48 rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setSoloVencido((v) => !v)}
          aria-pressed={soloVencido}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",
            soloVencido ? "border-danger-line bg-danger-surface font-semibold text-danger-ink" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
          )}
        >
          Solo con vencido
        </button>
        <span className="text-[11px] text-fg-muted">
          {visibles.length} cliente{visibles.length !== 1 ? "s" : ""}
        </span>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-fg-muted">
          {filas.length === 0 ? "Nadie nos debe nada hoy." : "Ningún cliente coincide con el filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className={TH}>Cliente</th>
                <th scope="col" className={cn(TH, "text-right")}>Vencido</th>
                <th scope="col" className={TH}>Debe desde</th>
                <th scope="col" className={cn(TH, "text-right")}>En plazo</th>
                <th scope="col" className={cn(TH, "text-right")}>Falta facturar</th>
                <th scope="col" className={TH}>Promesa</th>
                <th scope="col" className={TH}>Último contacto</th>
                <th scope="col" className={TH}>Próximo cobro</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const estaAbierta = abierta === f.cuentaId;
                return (
                  <Fragment key={f.cuentaId}>
                    <tr
                      onClick={() => setAbierta(estaAbierta ? null : f.cuentaId)}
                      className={cn("cursor-pointer border-t border-line transition-colors hover:bg-surface-hover", estaAbierta && "bg-surface-muted")}
                    >
                      <td className={TD}>
                        <button
                          type="button"
                          aria-expanded={estaAbierta}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAbierta(estaAbierta ? null : f.cuentaId);
                          }}
                          className="flex items-center gap-1.5 text-left font-medium text-fg"
                        >
                          <span aria-hidden className={cn("inline-block text-[10px] text-fg-muted transition-transform", estaAbierta && "rotate-90")}>▶</span>
                          {f.cliente}
                        </button>
                        <span className="ml-4 text-[11px] text-fg-muted">{f.tipoCuenta === "INTERNACIONAL" ? "Internacional" : "Nacional"}</span>
                      </td>
                      <td className={cn(TD, "text-right font-semibold")}>
                        <Montos montos={f.montos} campo="vencido" cls="text-danger-ink" />
                      </td>
                      <td className={TD}>
                        {f.debeDesde ? (
                          <span className="whitespace-nowrap">
                            {fmtFecha(f.debeDesde)}
                            <span className="block text-[11px] text-fg-muted">hace {f.diasMasViejo} días</span>
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <Montos montos={f.montos} campo="porVencer" />
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <Montos montos={f.montos} campo="faltaFacturar" cls="text-warn-ink" />
                      </td>
                      <td className={TD}>
                        {f.promesa ? (
                          <span className={cn("whitespace-nowrap", f.promesa.incumplida ? "text-danger-ink" : "text-info-ink")}>
                            {fmtFecha(f.promesa.fecha)}
                            <span className="block text-[11px]">{f.promesa.incumplida ? "incumplida" : "vigente"}</span>
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className={TD}>
                        {f.ultimoContacto ? (
                          <span className="whitespace-nowrap" title={f.ultimoContacto.quien || undefined}>
                            {fmtFecha(f.ultimoContacto.fecha)}
                            <span className="block text-[11px] text-fg-muted">{CONTACTO[f.ultimoContacto.tipo] ?? f.ultimoContacto.tipo.toLowerCase()}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-fg-muted">sin registro</span>
                        )}
                      </td>
                      <td className={TD}>
                        {f.proximo ? (
                          <span className="whitespace-nowrap">
                            {fmtFecha(f.proximo.fecha)}
                            <span className="block text-[11px] tabular-nums text-fg-muted">{fmtMonto(f.proximo.monto, f.proximo.moneda)}</span>
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                    </tr>
                    {estaAbierta && (
                      <tr className="border-t border-line bg-surface-muted">
                        <td colSpan={8} className="px-3 pb-4 pt-2">
                          <div className="grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                                Cuotas de {f.cliente}
                              </p>
                              <button
                                type="button"
                                onClick={() => onOpenCuenta(f.cuentaId)}
                                className="rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-surface-hover"
                              >
                                Abrir la cuenta
                              </button>
                            </div>
                            <ul className="grid gap-1">
                              {f.cuotas.map((c) => (
                                <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-surface px-3 py-2 text-[13px]">
                                  <span className={cn("rounded border px-1.5 py-px text-[10px] font-semibold", SITUACION[c.situacion].cls)}>
                                    {SITUACION[c.situacion].texto}
                                  </span>
                                  <span className="tabular-nums font-medium text-fg">{fmtMonto(c.monto, c.moneda)}</span>
                                  <span className="text-fg-secondary">{c.numeroFactura ?? "sin número de factura"}</span>
                                  <span className="text-fg-muted">
                                    {c.fechaEmision ? `facturada el ${fmtFecha(c.fechaEmision)}` : `programada para el ${fmtFecha(c.fechaProgramada)}`}
                                    {c.dias > 0 && ` · hace ${c.dias} días`}
                                  </span>
                                  {c.promesa && (
                                    <span className={c.promesa.incumplida ? "text-danger-ink" : "text-info-ink"}>
                                      promesa {fmtFecha(c.promesa.fecha)}
                                      {c.promesa.incumplida ? " (incumplida)" : ""}
                                    </span>
                                  )}
                                  {c.servicio && <span className="min-w-0 truncate text-[11px] text-fg-muted">{c.servicio}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
