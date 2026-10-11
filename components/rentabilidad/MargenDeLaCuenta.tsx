/**
 * components/rentabilidad/MargenDeLaCuenta.tsx — Rentabilidad › una cuenta (2026-10-07, tablero «Cuenta» de
 * «Rentabilidad · diseño»). SOLO DIRECCIÓN: la página corta antes de cargar (`veRentabilidad`).
 *
 * El último trimestre cerrado mes a mes (en vivo: la foto de cada mes llega con E6), quién la atendió con su costo por
 * hora, por qué su factor es el que es y lo que respondió el equipo en «¿cuánto te tomó?» (sin nombres: el rol).
 */
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { Cifra, coma } from "@/components/carga/piezas";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { RUTA_DE_LA_RENTABILIDAD } from "@/lib/carga/rutas";
import { formatoMinutos } from "@/lib/tiempos/reglas";
import type { MargenDeLaCuenta as Datos } from "@/lib/rentabilidad/queries";

const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (x: number) => `${x < 0 ? "−" : ""}US$ ${miles(x)}`;
const usd1 = (x: number) => `US$ ${coma(x, 1)}`;
const pct = (x: number | null) => (x === null ? "—" : `${x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} %`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export default function MargenDeLaCuenta({ datos, contenedor }: { datos: Datos; contenedor: string }) {
  const t = datos.total;
  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title={datos.nombre}
        crumbs={[{ label: "Rentabilidad", href: RUTA_DE_LA_RENTABILIDAD }, { label: datos.nombre }]}
        badges={
          <>
            <ChipDeCabecera>{datos.etiqueta}</ChipDeCabecera>
            <ChipDeCabecera>Solo Super Admin</ChipDeCabecera>
          </>
        }
        description="El margen de la cuenta en el último trimestre cerrado, mes a mes, con el costo de la hora de cada persona que la atendió."
        action={
          <Link href={`/customer-success/${datos.clienteId}`} className="text-xs font-semibold text-brand hover:text-brand-light">
            Abrir la cuenta en Éxito del cliente
          </Link>
        }
      />

      {!t ? (
        <EmptyState title="Sin horas ni cobros en el trimestre" description="Esta cuenta no tuvo reuniones, tareas del cronograma ni cobros en los últimos tres meses cerrados." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Cifra rotulo="Cobrado" valor={t.ingreso > 0 ? usd(t.ingreso) : "—"} nota={t.fuenteDelIngreso === "Odoo" ? "Facturado en Odoo" : "Cobranza"} />
            <Cifra rotulo="Horas reales" valor={`${miles(t.horas)} h`} nota={`${miles(t.desglose.reuniones)} reun. · ${miles(t.desglose.preparacion)} prep. · ${miles(t.desglose.entrega)} entrega`} />
            <Cifra
              rotulo="Margen real · por persona"
              valor={t.ingreso > 0 ? usd(t.margen) : usd(-t.costo)}
              alerta={t.margen < 0}
              nota={t.ingreso > 0 ? `${pct(t.margenPct)} · costo ${usd(t.costo)}` : `${usd(t.costo)} de costo sin cobros`}
            />
            <Cifra
              rotulo="Margen real · cargado"
              valor={datos.totalCargado && datos.totalCargado.ingreso > 0 ? usd(datos.totalCargado.margen) : "—"}
              nota={datos.totalCargado ? `${usd1(datos.totalCargado.tarifa)} la hora con clientes` : undefined}
            />
          </div>

          <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
            <h2 className="px-4 text-sm font-semibold text-fg">Mes a mes</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2">Mes</th>
                    <th className="px-3 py-2 text-right">Cobrado</th>
                    <th className="px-3 py-2 text-right">Horas reales</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Margen real</th>
                    <th className="px-3 py-2 text-right">Horas planeadas</th>
                    <th className="px-4 py-2">De dónde sale</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.meses.map((m) => (
                    <tr key={m.mes} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-semibold text-fg">{m.etiqueta}</td>
                      {m.fila ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums">{m.fila.ingreso > 0 ? usd(m.fila.ingreso) : "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{miles(m.fila.horas)} h</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{usd(m.fila.costo)}</td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", m.fila.margen < 0 && "text-danger-ink")}>
                            {m.fila.ingreso > 0 ? `${usd(m.fila.margen)} · ${pct(m.fila.margenPct)}` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{m.fila.horasPlaneadas !== null ? `${miles(m.fila.horasPlaneadas)} h` : "—"}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3 py-2.5 text-xs text-fg-muted">
                          Sin horas ni cobros ese mes
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-xs text-fg-muted">En vivo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 text-xs text-fg-muted">
              «En vivo»: se calcula con los datos de hoy. Cuando exista la foto del mes, el mes cerrado queda con lo que se midió al cerrarlo.
            </p>
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
              <h2 className="px-4 text-sm font-semibold text-fg">Quién la atendió</h2>
              {datos.atendidaPor.length === 0 ? (
                <p className="px-4 text-[13px] text-fg-secondary">Nadie del equipo tiene horas en la cuenta en el trimestre.</p>
              ) : (
                <table className="w-full border-collapse text-[13px] leading-[19px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      <th className="px-4 py-2">Persona</th>
                      <th className="px-3 py-2 text-right">Horas</th>
                      <th className="px-3 py-2 text-right">Costo de la hora</th>
                      <th className="px-4 py-2 text-right">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.atendidaPor.map((a) => (
                      <tr key={a.nombre} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2.5">
                          <span className="block font-semibold text-fg">{a.nombre}</span>
                          <span className="block text-xs text-fg-muted">{a.equipo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{coma(a.horas, 1)} h</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{a.costoHora !== null ? usd1(a.costoHora) : <span className="text-warn-ink">Sin planilla</span>}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{usd(a.costo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold text-fg">Por qué su factor es {datos.factor ? coma(datos.factor.factor, 2) : "1,00"}</h2>
              {datos.factor ? (
                <ul className="divide-y divide-line text-[13px]">
                  {datos.factor.variables.map((v) => (
                    <li key={v.clave} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="text-fg">{v.nombre}:</span> <span className="text-fg-secondary">{v.valor}</span>
                        {v.estado !== "tenemos" && <span className="text-xs text-fg-muted"> ({v.estado === "falta" ? "falta el dato" : "dato parcial"})</span>}
                      </span>
                      <span className="tabular-nums text-fg-secondary">{v.suma > 0 ? `+${coma(v.suma, 2)}` : "0"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-fg-secondary">La cuenta no está en la cartera de Customer Success: cuenta como 1.</p>
              )}
            </section>
          </div>

          <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
            <div className="px-4">
              <h2 className="text-sm font-semibold text-fg">Lo que respondió el equipo</h2>
              <p className="text-xs text-fg-muted">«¿Cuánto te tomó?» en las tareas y documentos de esta cuenta. Sin nombres: el rol de quien respondió.</p>
            </div>
            {datos.respuestas.length === 0 ? (
              <p className="px-4 text-[13px] text-fg-secondary">Nadie respondió todavía por esta cuenta.</p>
            ) : (
              <table className="w-full border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2">Tarea o documento</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Tomó</th>
                    <th className="px-3 py-2 text-right">La carga suponía</th>
                    <th className="px-3 py-2">Quién</th>
                    <th className="px-4 py-2">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.respuestas.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 text-fg">{r.titulo}</td>
                      <td className="px-3 py-2.5 text-fg-secondary">{r.tipo}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatoMinutos(r.minutos)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{r.estimado ? formatoMinutos(r.estimado) : "—"}</td>
                      <td className="px-3 py-2.5 text-fg-secondary">{(r.rol && ROLE_LABEL[r.rol as keyof typeof ROLE_LABEL]) ?? r.rol ?? "—"}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{fecha(r.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
