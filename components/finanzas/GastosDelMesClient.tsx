"use client";

/**
 * components/finanzas/GastosDelMesClient.tsx
 *
 * Finanzas › Gastos del mes (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): todo lo que sale en un mes, para quien
 * registra. Lo recurrente se carga solo; lo puntual se anota acá, con quién lo anotó. Reemplaza al Excel de egresos desde
 * `EGRESOS_DESDE_NEXUS`: cuando están todos, «Ya anoté todos los gastos» se lo avisa a quien cierra el mes.
 *
 * ⛔ Sin salarios: de la planilla se ve solo el total del mes. Todo sale de /api/finanzas/gastos (lib/finanzas/gastos-server.ts).
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { Button, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { GastoPuntualDTO } from "@/lib/cobranza";
import type { GastosDelMesDTO } from "@/lib/finanzas/gastos-server";
import { montosPorMoneda, textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { EGRESOS_DESDE_NEXUS, ETIQUETA_CATEGORIA, etiquetaMes, mesAnterior, mesSiguiente } from "@/lib/finanzas/gastos";
import GastoForm from "@/components/cobranza/GastoForm";
import { fmtFecha } from "@/components/cobranza/format";

const BOTON_BLANCO =
  "rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover disabled:opacity-50";

export default function GastosDelMesClient({
  inicial,
  todayISO,
  puedeEditar,
  esSuperAdmin,
}: {
  inicial: GastosDelMesDTO;
  todayISO: string;
  /** `gastos.write`: anotar, editar, borrar y avisar que están todos. */
  puedeEditar: boolean;
  /** Para el enlace a la planilla, que solo ve Super Admin. */
  esSuperAdmin: boolean;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState<{ gasto: GastoPuntualDTO | null } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const periodo = datos.periodo;
  const mesActual = todayISO.slice(0, 7);
  const delExcel = periodo < EGRESOS_DESDE_NEXUS;

  const cargar = useCallback(
    async (p: string) => {
      setCargando(true);
      try {
        setDatos(await fetchJson<GastosDelMesDTO>(`/api/finanzas/gastos?mes=${p}`));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los gastos.");
      } finally {
        setCargando(false);
      }
    },
    [toast],
  );

  const borrar = async (g: GastoPuntualDTO) => {
    setOcupado(g.id);
    try {
      await fetchJson(`/api/finanzas/gastos/${g.id}`, { method: "DELETE" });
      toast.success("Gasto borrado.");
      await cargar(periodo);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    } finally {
      setOcupado(null);
    }
  };

  const avisarListos = async (listos: boolean) => {
    setOcupado("listos");
    try {
      await fetchJson("/api/finanzas/gastos/listos", { method: "POST", body: JSON.stringify({ periodo, listos }) });
      toast.success(listos ? `Listo: quien cierra el mes ya sabe que los gastos de ${etiquetaMes(periodo)} están todos.` : "Aviso deshecho.");
      await cargar(periodo);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  };

  const totalPuntuales = montosPorMoneda(datos.gastos);
  const nRecurrentes = datos.recurrentes.reduce((s, r) => s + r.cantidad, 0);
  const montosRecurrentes = montosPorMoneda(datos.recurrentes.flatMap((r) => r.montos));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gastos del mes"
        description="Todo lo que sale en el mes. Lo recurrente se carga solo; lo puntual se anota acá, con su comprobante. Reemplaza al Excel de egresos."
        action={
          puedeEditar && !delExcel && !datos.cerrado ? (
            <Button variant="primary" onClick={() => setForm({ gasto: null })}>
              Registrar gasto
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BOTON_BLANCO} disabled={cargando} onClick={() => void cargar(mesAnterior(periodo))} aria-label="Mes anterior">
          ‹ {etiquetaMes(mesAnterior(periodo)).slice(0, 3)}
        </button>
        <span className="px-1.5 text-[15px] font-semibold text-fg">{etiquetaMes(periodo, true).replace(/^./, (c) => c.toUpperCase())}</span>
        <button
          type="button"
          className={BOTON_BLANCO}
          disabled={cargando || periodo >= mesActual}
          onClick={() => void cargar(mesSiguiente(periodo))}
          aria-label="Mes siguiente"
        >
          {etiquetaMes(mesSiguiente(periodo)).slice(0, 3)} ›
        </button>
        {datos.cerrado ? (
          <span className="rounded-full border border-success-line bg-success-surface px-2.5 py-0.5 text-xs text-success-ink">✓ Mes cerrado</span>
        ) : datos.gastosListos ? (
          <span className="rounded-full border border-success-line bg-success-surface px-2.5 py-0.5 text-xs text-success-ink">
            ✓ Todos anotados · {datos.gastosListos.por.split("@")[0]}, {fmtFecha(datos.gastosListos.en)}
          </span>
        ) : delExcel ? (
          <span className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs text-fg-muted">Del Excel de egresos</span>
        ) : (
          <span className="rounded-full border border-info-line bg-info-surface px-2.5 py-0.5 text-xs text-brand">● Mes abierto</span>
        )}
      </div>

      <section aria-label="Lo que sale en el mes" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
          <span className="text-xs text-fg-muted">Recurrentes</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{montosRecurrentes.length ? textoDeMontos(montosRecurrentes) : "—"}</span>
          <span className="text-xs text-success-ink">✓ Se cargan solos · {nRecurrentes === 1 ? "1 costo" : `${nRecurrentes} costos`}</span>
        </div>
        <div
          className={`flex flex-col gap-1 rounded-xl p-4 ${datos.gastos.length ? "border border-line bg-surface" : "border border-dashed border-line bg-surface-muted"}`}
        >
          <span className="text-xs text-fg-muted">Gastos puntuales</span>
          <span className={`text-[22px] font-bold leading-7 tabular-nums ${datos.gastos.length ? "text-fg" : "text-fg-muted"}`}>
            {datos.gastos.length ? textoDeMontos(totalPuntuales) : "Sin anotar"}
          </span>
          <span className="text-xs text-fg-muted">
            {datos.gastos.length
              ? `${datos.gastos.length === 1 ? "1 gasto" : `${datos.gastos.length} gastos`} del mes`
              : delExcel
                ? "Este mes salió del Excel de egresos"
                : "○ Falta: se anotan con su comprobante"}
          </span>
        </div>
        <div
          className={`flex flex-col gap-1 rounded-xl p-4 ${datos.planilla.montos.length ? "border border-line bg-surface" : "border border-dashed border-line bg-surface-muted"}`}
        >
          <span className="text-xs text-fg-muted">Planilla</span>
          <span className={`text-[22px] font-bold leading-7 tabular-nums ${datos.planilla.montos.length ? "text-fg" : "text-fg-muted"}`}>
            {datos.planilla.montos.length ? textoDeMontos(datos.planilla.montos) : "Sin anotar"}
          </span>
          <span className="text-xs text-fg-muted">
            {datos.planilla.quincenas === 2
              ? "Las dos quincenas anotadas"
              : datos.planilla.quincenas === 1
                ? "Falta la segunda quincena"
                : "○ Falta: la anota quien supervisa"}
            {esSuperAdmin && (
              <>
                {" · "}
                <Link href="/finanzas/costos/planillas" className="font-semibold text-brand hover:text-brand-light">
                  Planilla
                </Link>
              </>
            )}
          </span>
        </div>
      </section>

      <section aria-label="Gastos puntuales" className="rounded-xl border border-line bg-surface">
        <div className="flex items-baseline gap-2.5 border-b border-line px-4 py-3.5">
          <h2 className="text-[15px] font-semibold text-fg">Gastos puntuales de {etiquetaMes(periodo)}</h2>
          <span className="text-xs text-fg-muted">lo que no se repite todos los meses</span>
        </div>
        {datos.gastos.length === 0 ? (
          <div className="m-4 flex flex-col items-start gap-2 rounded-lg border border-dashed border-line bg-surface-muted p-5">
            <span className="text-sm font-semibold text-fg">Todavía no hay gastos de {etiquetaMes(periodo)}</span>
            <span className="max-w-2xl text-[13px] leading-[1.45] text-fg-secondary">
              {delExcel
                ? "Este mes se cargó desde el Excel de egresos. Desde octubre de 2026, cada gasto se anota acá."
                : "Cada gasto se anota acá: qué fue, cuánto, en qué moneda y su comprobante. Queda firmado por quien lo anota y se revisa al cerrar el mes."}
            </span>
            {puedeEditar && !delExcel && !datos.cerrado && (
              <button type="button" className={BOTON_BLANCO} onClick={() => setForm({ gasto: null })}>
                Anotar el primero
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-4 py-2 font-semibold">Día</th>
                  <th className="px-4 py-2 font-semibold">Gasto</th>
                  <th className="px-4 py-2 text-right font-semibold">Monto</th>
                  <th className="px-4 py-2 font-semibold">Lo anotó</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {datos.gastos.map((g) => (
                  <tr key={g.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2.5 text-fg-secondary">{fmtFecha(g.fecha)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-fg">{g.nombre}</span>
                      {g.notas && <span className="block text-xs text-fg-muted">{g.notas}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-fg">{textoDeMontos([{ moneda: g.moneda, monto: g.monto }])}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{g.registradoPor ? g.registradoPor.split("@")[0] : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {puedeEditar && !datos.cerrado && (
                        <>
                          <button type="button" className={BOTON_BLANCO} onClick={() => setForm({ gasto: g })}>
                            Editar
                          </button>{" "}
                          <button
                            type="button"
                            className="rounded-md px-2 py-1.5 text-xs font-semibold text-fg-muted hover:text-danger-ink"
                            disabled={ocupado !== null}
                            onClick={() => void borrar(g)}
                          >
                            {ocupado === g.id ? "Borrando…" : "Borrar"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Recurrentes del mes" className="min-w-0 flex-[1_1_380px] rounded-xl border border-line bg-surface">
          <div className="flex items-baseline gap-2.5 border-b border-line px-4 py-3.5">
            <h2 className="text-[15px] font-semibold text-fg">Recurrentes de este mes</h2>
            <Link href="/finanzas/recurrentes" className="ml-auto text-[13px] font-semibold text-brand hover:text-brand-light">
              Ver {nRecurrentes === 1 ? "el costo" : `los ${nRecurrentes}`}
            </Link>
          </div>
          {datos.recurrentes.map((r) => (
            <div key={r.categoria} className="flex items-center gap-3 border-b border-line px-4 py-3 text-[13px] last:border-0">
              <span className="flex-1 font-semibold text-fg">{ETIQUETA_CATEGORIA[r.categoria]}</span>
              <span className="text-fg-muted">{r.cantidad === 1 ? "1 costo" : `${r.cantidad} costos`}</span>
              <span className="w-32 text-right tabular-nums text-fg">{r.montos.length ? textoDeMontos(r.montos) : "—"}</span>
            </div>
          ))}
        </section>
        <section
          aria-label="Tarjetas"
          className={`flex min-w-0 flex-[1_1_380px] flex-col gap-2 rounded-xl p-4 ${datos.tarjetas ? "border border-line bg-surface" : "border border-dashed border-line bg-surface-muted"}`}
        >
          <span className="text-[15px] font-semibold text-fg">Tarjetas</span>
          <span className="text-[13px] leading-[1.45] text-fg-secondary">
            {datos.tarjetas
              ? `${datos.tarjetas === 1 ? "1 tarjeta activa" : `${datos.tarjetas} tarjetas activas`}. Con cada corte se anota el saldo y qué costos se pagaron con ella, para que no se cuenten dos veces.`
              : "No hay ninguna tarjeta registrada. Con cada corte se anota el saldo y qué costos se pagaron con ella, para que no se cuenten dos veces."}
          </span>
          <Link href="/finanzas/tarjetas" className="text-[13px] font-semibold text-brand hover:text-brand-light">
            Ir a Tarjetas
          </Link>
        </section>
      </div>

      {puedeEditar && !delExcel && !datos.cerrado && (
        <section aria-label="Avisar que están todos" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
          <span className="flex-[1_1_320px] text-[13px] leading-[1.45] text-fg-secondary">
            {datos.gastosListos
              ? "Avisaste que los gastos de este mes están todos. Si aparece uno más, anótalo igual: quien cierra el mes lo ve."
              : "Cuando hayas anotado todos los gastos del mes, avísalo: es lo que quien cierra el mes espera de ti."}
          </span>
          <button type="button" className={BOTON_BLANCO} disabled={ocupado !== null} onClick={() => void avisarListos(!datos.gastosListos)}>
            {ocupado === "listos"
              ? "Guardando…"
              : datos.gastosListos
                ? "Deshacer el aviso"
                : `Ya anoté todos los gastos de ${etiquetaMes(periodo)}`}
          </button>
        </section>
      )}

      {form && (
        <GastoForm
          gasto={form.gasto}
          todayISO={todayISO}
          allGastos={datos.gastos}
          apiBase="/api/finanzas/gastos"
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void cargar(periodo);
          }}
        />
      )}
    </div>
  );
}
