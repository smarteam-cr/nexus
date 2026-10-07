/**
 * components/finanzas/GastosContraMercury.tsx — la pestaña «Gastos y Mercury» de Conciliación (2026-10-06).
 *
 * Los cargos de las tarjetas de Mercury contra los recurrentes y los gastos de Nexus (lib/finanzas/gastos-mercury.ts):
 * qué cobra todos los meses la tarjeta de herramientas y a qué precio, qué tiene Nexus que la tarjeta ya no cobra, y
 * qué cargos sueltos faltan anotar. Solo muestra: lo que se arregla, se arregla en Recurrentes o en Gastos del mes.
 */
import Link from "next/link";
import type { ComercioRecurrente, GastosContraMercury as Datos } from "@/lib/finanzas/gastos-mercury";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (p: string) => MES[Number(p.slice(5, 7)) - 1] ?? p;
const usd = (n: number) => fmtMonto(n, "USD");

const MEDIO: Record<ComercioRecurrente["medio"], string> = {
  CREDITO: "Tarjeta de herramientas",
  DEBITO: "Tarjeta de débito",
  MERCURY: "Suscripción de Mercury",
};

/** Cuántas cosas para mirar: lo que abre el número de la pestaña. */
export function pendientesDeGastos(d: Datos): number {
  return (
    d.recurrentes.filter((r) => r.estado !== "AL_DIA").length + d.nexusSinCargo.length + d.sueltosSinRegistrar.length + d.gastosSinCargo.length
  );
}

function Seccion({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <header className="px-4 py-2.5 border-b border-line">
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        <p className="text-[11px] text-fg-muted mt-0.5">{detalle}</p>
      </header>
      {children}
    </section>
  );
}

const Vacio = ({ texto }: { texto: string }) => <p className="px-4 py-3 text-xs text-fg-muted">{texto}</p>;

export default function GastosContraMercury({ datos }: { datos: Datos }) {
  const desde = `${MES[Number(datos.desde.slice(5, 7)) - 1]} de ${datos.desde.slice(0, 4)}`;
  const meses = datos.recurrentes[0]?.meses.map((m) => m.periodo) ?? [];
  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted max-w-3xl">
        Los cargos de las tarjetas de Mercury contra los recurrentes y los gastos de Nexus. Las transferencias (planilla,
        proveedores) no entran. Lo que haya que corregir se corrige en{" "}
        <Link href="/finanzas/recurrentes" className="text-brand hover:underline">
          Recurrentes
        </Link>{" "}
        o en{" "}
        <Link href="/finanzas/gastos" className="text-brand hover:underline">
          Gastos del mes
        </Link>
        ; esta lista se recalcula sola.
      </p>

      <Seccion
        titulo="Lo que la tarjeta cobra todos los meses"
        detalle="Cada comercio que cobró en al menos dos de los últimos tres meses, con su recurrente de Nexus al lado. «Precio distinto» = el último mes completo se aleja más de US$2 y del 10% de lo que dice Nexus."
      >
        {datos.recurrentes.length === 0 ? (
          <Vacio texto="La tarjeta no tiene cobros que se repitan en los últimos tres meses." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-fg-muted">
                  <th className="text-left font-medium px-4 py-1.5">Comercio</th>
                  {meses.map((p) => (
                    <th key={p} className="text-right font-medium px-2 py-1.5">
                      {mesCorto(p)}
                    </th>
                  ))}
                  <th className="text-left font-medium px-3 py-1.5">En Nexus</th>
                  <th className="text-left font-medium px-3 py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.recurrentes.map((r) => (
                  <tr key={r.comercio} className="border-t border-line">
                    <td className="px-4 py-1.5">
                      <span className="text-fg">{r.comercio}</span>
                      <span className="block text-[10px] text-fg-muted">
                        {MEDIO[r.medio]} · último cargo {fmtFecha(r.ultimoCargo.fechaISO)} por {usd(r.ultimoCargo.monto)}
                      </span>
                    </td>
                    {r.meses.map((m) => (
                      <td key={m.periodo} className="px-2 py-1.5 text-right tabular-nums text-fg-secondary">
                        {m.monto > 0 ? usd(m.monto) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-fg-secondary">
                      {r.enNexus ? (
                        <>
                          {r.enNexus.nombre}
                          <span className="block text-[10px] text-fg-muted tabular-nums">
                            {usd(r.enNexus.monto)} {r.enNexus.frecuencia === "ANUAL" ? "al año" : "al mes"}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.estado === "AL_DIA" ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-success-line bg-success-surface text-success-ink">
                          Al día
                        </span>
                      ) : (
                        <Link
                          href="/finanzas/recurrentes"
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink hover:opacity-90 whitespace-nowrap"
                          title={r.estado === "SIN_REGISTRAR" ? "Registrarlo en Recurrentes" : "Actualizar el monto en Recurrentes"}
                        >
                          {r.estado === "SIN_REGISTRAR" ? "No está en Nexus" : `Cobró ${usd(r.precio)}`}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Recurrentes de Nexus que la tarjeta no cobró en 60 días"
        detalle="Herramientas mensuales en dólares sin ningún cargo parecido en Mercury: ¿se paga con otra tarjeta, pasó a anual o se canceló?"
      >
        {datos.nexusSinCargo.length === 0 ? (
          <Vacio texto="Todas las herramientas mensuales de Nexus tienen su cargo." />
        ) : (
          <ul className="divide-y divide-line">
            {datos.nexusSinCargo.map((r) => (
              <li key={r.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-fg">{r.nombre}</span>
                <span className="text-fg-muted tabular-nums">{usd(r.monto)} al mes</span>
                <Link href="/finanzas/recurrentes" className="ml-auto text-[11px] text-brand hover:underline">
                  Ver en Recurrentes
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        titulo={`Cargos de Mercury desde ${desde} sin su gasto en Nexus`}
        detalle="Cargos sueltos (no de una herramienta del mes) sin un gasto del mismo monto, cinco días antes o después."
      >
        {datos.sueltosSinRegistrar.length === 0 ? (
          <Vacio texto="Cada cargo suelto tiene su gasto anotado." />
        ) : (
          <ul className="divide-y divide-line">
            {datos.sueltosSinRegistrar.map((c) => (
              <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-fg-muted tabular-nums w-16">{fmtFecha(c.fechaISO)}</span>
                <span className="text-fg">{c.comercio}</span>
                <span className="text-[10px] text-fg-muted">{MEDIO[c.medio]}</span>
                <span className="ml-auto tabular-nums text-fg">{usd(c.monto)}</span>
                <Link href="/finanzas/gastos" className="text-[11px] text-brand hover:underline whitespace-nowrap">
                  Anotar el gasto
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        titulo={`Gastos de Nexus desde ${desde} sin cargo en Mercury`}
        detalle="Gastos en dólares sin un cargo del mismo monto en las tarjetas de Mercury. Si se pagaron con otra cuenta, está bien así."
      >
        {datos.gastosSinCargo.length === 0 ? (
          <Vacio texto="Cada gasto en dólares tiene su cargo en Mercury." />
        ) : (
          <ul className="divide-y divide-line">
            {datos.gastosSinCargo.map((g) => (
              <li key={g.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-fg-muted tabular-nums w-16">{fmtFecha(g.fechaISO)}</span>
                <span className="text-fg">{g.nombre}</span>
                <span className="ml-auto tabular-nums text-fg">{usd(g.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        {datos.gastosEnColones > 0 && (
          <p className="px-4 py-2 text-[11px] text-fg-muted border-t border-line">
            {datos.gastosEnColones === 1 ? "Un gasto en colones no se cruza" : `${datos.gastosEnColones} gastos en colones no se cruzan`}: Mercury es
            en dólares.
          </p>
        )}
      </Seccion>
    </div>
  );
}
