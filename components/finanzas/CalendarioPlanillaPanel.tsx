"use client";

/**
 * components/finanzas/CalendarioPlanillaPanel.tsx
 *
 * El año de planilla, PERSONA POR PERSONA: sus 24 quincenas, lo que se le pagó y lo que
 * falta pagarle.
 *
 * ⚠ ES OTRO EJE DEL MISMO DATO, no una segunda verdad. El libro (`/historial`) agrupa
 * por mes y quincena —la lectura de "qué sale esta quincena"— y esto lo transpone: una
 * persona, su año entero. Las dos leen las mismas filas de `PagoPlanilla`; ninguna
 * escribe. Es el mismo par que la cola de cobros y el panel de cartera.
 *
 * ── LAS CINCO CLASES, Y POR QUÉ NO SE FUNDEN ────────────────────────────────────
 * Cada casilla es una de cinco cosas y cada una pide algo distinto de quien la mira.
 * Fundirlas ahorraría colores y perdería la información:
 *
 *   pagada      ya salió la plata
 *   anotada     está en el libro y todavía no se paga
 *   proyectada  no ocurrió — estimación al salario vigente en ESA quincena
 *   falta       ocurrió, la persona estaba, y nadie la anotó   ← lo accionable
 *   sin dato    el catálogo no llega tan atrás. NO es "no estaba"
 *   no estaba   hay una baja o una pausa que lo apaga
 */
import { Fragment, useMemo, useState } from "react";
import type { CalendarioPersonaDTO } from "@/lib/cobranza";
import type { ClaseQuincena } from "@/lib/cobranza/calendario-planilla";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import { PageHeader, EmptyState } from "@/components/ui";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Cómo se lee cada clase. El texto es el que ve la persona, no el nombre técnico. */
const CLASE: Record<ClaseQuincena, { label: string; cls: string }> = {
  registrada: { label: "En el libro", cls: "border-line bg-surface text-fg" },
  proyectada: { label: "Proyectada", cls: "border-line border-dashed bg-surface text-fg-secondary" },
  faltante: { label: "Falta anotar", cls: "border-warn-line bg-warn-surface text-warn-ink" },
  fuera: { label: "No estaba", cls: "border-line bg-surface-muted text-fg-muted" },
  sinDato: { label: "Sin dato", cls: "border-line bg-surface-muted text-fg-muted" },
};

export default function CalendarioPlanillaPanel({
  personas,
  anio,
  todayISO,
}: {
  personas: CalendarioPersonaDTO[];
  anio: number;
  /** Hoy, por parámetro: el módulo puro no lee el reloj. */
  todayISO: string;
}) {
  const [abierta, setAbierta] = useState<string | null>(personas[0]?.teamMemberId ?? null);
  const [soloConPendientes, setSoloConPendientes] = useState(false);

  const visibles = useMemo(
    () => (soloConPendientes ? personas.filter((p) => p.faltantes > 0) : personas),
    [personas, soloConPendientes],
  );
  const pendientes = personas.reduce((n, p) => n + p.faltantes, 0);

  return (
    <div>
      <PageHeader
        title={`Calendario de planilla ${anio}`}
        description="El año de cada persona, quincena por quincena. Lo que se le pagó sale del libro y no se toca; lo que falta se proyecta al salario que rige en esa fecha."
      />

      {/* Un aumento no reescribe el pasado, y conviene decirlo antes de que alguien lo
          note por su cuenta mirando dos montos distintos en la misma columna. */}
      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 mb-3">
        <p className="text-[11px] text-fg-muted">
          Un aumento rige <strong className="text-fg-secondary">desde su fecha efectiva hacia adelante</strong>: las
          quincenas ya anotadas conservan el monto viejo, porque es lo que se pagó. Nada de esto se guarda —
          la proyección se recalcula sola cada vez que se abre.
        </p>
      </div>

      {pendientes > 0 && (
        <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-warn-ink">
            <strong className="font-medium">
              {pendientes} quincena{pendientes === 1 ? "" : "s"} sin anotar
            </strong>{" "}
            — ya ocurrieron, la persona estaba, y no están en el libro.
          </p>
          <button
            type="button"
            onClick={() => setSoloConPendientes((v) => !v)}
            className="ml-auto text-[11px] px-2 py-1 rounded-md border border-warn-line text-warn-ink hover:bg-warn-surface"
          >
            {soloConPendientes ? "Ver a todos" : "Ver solo esas personas"}
          </button>
        </div>
      )}

      {visibles.length === 0 ? (
        <EmptyState title="Nadie con quincenas sin anotar" description="El libro está al día para este año." />
      ) : (
        <div className="space-y-2">
          {visibles.map((p) => {
            const abierto = abierta === p.teamMemberId;
            return (
              <section key={p.teamMemberId} className="rounded-xl border border-line bg-surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAbierta(abierto ? null : p.teamMemberId)}
                  aria-expanded={abierto}
                  className="w-full text-left px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 hover:bg-surface-hover transition-colors"
                >
                  <span className="text-sm font-medium text-fg">{p.nombre}</span>
                  <span className="text-[11px] text-fg-muted">
                    {p.salarioActual !== null
                      ? `${fmtMonto(p.salarioActual, p.moneda as "CRC" | "USD")} al mes`
                      : "ya no está en planilla"}
                  </span>
                  {p.faltantes > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink">
                      {p.faltantes} sin anotar
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-fg-secondary whitespace-nowrap">
                    {fmtMonto(p.totalRegistrado, p.moneda as "CRC" | "USD")} en el libro
                    {p.totalProyectado > 0 && (
                      <span className="text-fg-muted">
                        {" · "}
                        {fmtMonto(p.totalProyectado, p.moneda as "CRC" | "USD")} por venir
                      </span>
                    )}
                  </span>
                </button>

                {abierto && (
                  <div className="border-t border-line px-4 py-3 space-y-3">
                    {/* Los cambios de salario del año: es la explicación de por qué el
                        monto de la grilla cambia a mitad de año. Sin esto, la persona
                        que la mira tiene que adivinarlo. */}
                    {p.cambios.length > 0 && (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {p.cambios.map((c, i) => (
                          <li key={i} className="text-[11px] text-fg-muted">
                            <span className="text-fg-secondary">{fmtFecha(c.fecha)}</span>{" "}
                            {c.tipo === "CAMBIO_MONTO" && c.de !== null && c.a !== null
                              ? `aumento de ${fmtMonto(c.de, p.moneda as "CRC" | "USD")} a ${fmtMonto(c.a, p.moneda as "CRC" | "USD")}`
                              : c.tipo === "ALTA"
                                ? `entra a planilla${c.a !== null ? ` con ${fmtMonto(c.a, p.moneda as "CRC" | "USD")}` : ""}`
                                : c.tipo === "BAJA"
                                  ? "sale de planilla"
                                  : c.tipo.toLowerCase()}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Doce meses × dos quincenas. La grilla es el calendario: se lee de
                        un vistazo dónde cambió el monto y dónde falta algo. */}
                    <div className="overflow-x-auto">
                      <div className="grid grid-cols-[auto_repeat(12,minmax(72px,1fr))] gap-1 min-w-[900px]">
                        <div />
                        {MES_CORTO.map((m) => (
                          <div key={m} className="text-[10px] uppercase tracking-wide text-fg-muted text-center pb-1">
                            {m}
                          </div>
                        ))}
                        {([1, 2] as const).map((q) => (
                          <Fragment key={q}>
                            <div className="text-[10px] uppercase tracking-wide text-fg-muted pr-2 flex items-center whitespace-nowrap">
                              {q === 1 ? "1–15" : "16–fin"}
                            </div>
                            {MES_CORTO.map((_, i) => {
                              const cel = p.quincenas.find(
                                (x) => x.periodo === `${anio}-${String(i + 1).padStart(2, "0")}` && x.quincena === q,
                              );
                              if (!cel) return <div key={`${q}-${i}`} />;
                              const c = CLASE[cel.clase];
                              const hoy = cel.fechaProgramada === todayISO;
                              return (
                                <div
                                  key={`${q}-${i}`}
                                  title={`${fmtFecha(cel.fechaProgramada)} · ${c.label}${
                                    cel.salarioMensual !== null
                                      ? ` · de ${fmtMonto(cel.salarioMensual, p.moneda as "CRC" | "USD")} al mes`
                                      : ""
                                  }${cel.fechaPago ? ` · pagada el ${fmtFecha(cel.fechaPago)}` : ""}`}
                                  className={`rounded border px-1.5 py-1 text-center ${c.cls} ${
                                    hoy ? "ring-1 ring-brand" : ""
                                  }`}
                                >
                                  <p className="text-[11px] tabular-nums leading-tight">
                                    {cel.monto !== null ? fmtMonto(cel.monto, p.moneda as "CRC" | "USD") : "—"}
                                  </p>
                                  <p className="text-[9px] leading-tight opacity-80">
                                    {cel.clase === "registrada" && cel.estado === "PAGADO"
                                      ? "pagada"
                                      : cel.clase === "registrada"
                                        ? "anotada"
                                        : c.label.toLowerCase()}
                                  </p>
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] text-fg-muted">
                      {p.registradas} en el libro · {p.proyectadas} proyectadas
                      {p.faltantes > 0 && ` · ${p.faltantes} sin anotar`}
                      {" · "}
                      <span className="text-fg-secondary">
                        el aguinaldo se calcula con lo que está EN EL LIBRO, no con la proyección
                      </span>
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
