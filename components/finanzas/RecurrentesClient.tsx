"use client";

/**
 * components/finanzas/RecurrentesClient.tsx
 *
 * Finanzas › Recurrentes (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): los costos que se pagan todos los meses
 * —herramientas y fijos de operación—, para quien registra. Son los que se cargan solos en Gastos del mes.
 *
 * ⛔ Sin salarios: la lista viene de /api/finanzas/recurrentes, que filtra la categoría en la consulta, y el formulario no
 * ofrece Salario. Los salarios siguen en Planilla, solo para Super Admin.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO } from "@/lib/cobranza";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { CATEGORIAS_SIN_SALARIO, ETIQUETA_CATEGORIA, esCategoriaSinSalario, montoMensual } from "@/lib/finanzas/gastos";
import CostoForm from "@/components/cobranza/CostoForm";

const BOTON_BLANCO =
  "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-surface-hover disabled:opacity-50";

export default function RecurrentesClient({
  inicial,
  todayISO,
  puedeEditar,
  esSuperAdmin,
}: {
  inicial: CostoRecurrenteDTO[];
  todayISO: string;
  /** `gastos.write`. */
  puedeEditar: boolean;
  /** Para el enlace al resumen con salarios. */
  esSuperAdmin: boolean;
}) {
  const toast = useToast();
  const [costos, setCostos] = useState(inicial);
  const [form, setForm] = useState<{ costo: CostoRecurrenteDTO | null } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verBajas, setVerBajas] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const d = await fetchJson<{ costos: CostoRecurrenteDTO[] }>("/api/finanzas/recurrentes");
      setCostos(d.costos.filter((c) => esCategoriaSinSalario(c.categoria)));
    } catch {
      toast.error("No se pudo actualizar la lista. Recarga la página.");
    }
  }, [toast]);

  const cambiar = async (c: CostoRecurrenteDTO, data: Record<string, unknown>, listo: string) => {
    setOcupado(c.id);
    try {
      await fetchJson(`/api/finanzas/recurrentes/${c.id}`, { method: "PATCH", body: JSON.stringify(data) });
      toast.success(listo);
      await recargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  };

  const vigentes = useMemo(() => costos.filter((c) => c.finalizadoEl === null), [costos]);
  const bajas = useMemo(() => costos.filter((c) => c.finalizadoEl !== null), [costos]);

  return (
    <div className="space-y-5">
      <PageHeader recorrido="finanzas-recurrentes"
        title="Recurrentes"
        description="Lo que se paga todos los meses: herramientas y fijos de operación. Se cargan solos en Gastos del mes; acá se dan de alta, se cambian y se dan de baja."
        action={
          puedeEditar ? (
            <Button data-recorrido="fin.recurrentes.agregar" variant="primary" onClick={() => setForm({ costo: null })}>
              Agregar costo
            </Button>
          ) : undefined
        }
      />

      {CATEGORIAS_SIN_SALARIO.map((categoria) => {
        const de = vigentes.filter((c) => c.categoria === categoria);
        const mensual = textoDeMontos(
          Object.values(
            de
              .filter((c) => c.activo)
              .reduce<Record<string, { moneda: string; monto: number }>>((acc, c) => {
                const m = (acc[c.moneda] ??= { moneda: c.moneda, monto: 0 });
                m.monto = Math.round((m.monto + montoMensual(c.monto, c.frecuencia)) * 100) / 100;
                return acc;
              }, {}),
          ),
        );
        return (
          <section data-recorrido="fin.recurrentes.categoria" key={categoria} aria-label={ETIQUETA_CATEGORIA[categoria]} className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-baseline gap-2.5 border-b border-line px-4 py-3.5">
              <h2 className="text-[15px] font-semibold text-fg">{ETIQUETA_CATEGORIA[categoria]}</h2>
              <span className="text-xs text-fg-muted">{de.length === 1 ? "1 costo" : `${de.length} costos`}</span>
              <span className="ml-auto text-[13px] tabular-nums text-fg-secondary">{mensual ? `${mensual} al mes` : ""}</span>
            </div>
            {de.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-fg-muted">Ninguno todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <tbody>
                    {de.map((c) => (
                      <tr data-recorrido="fin.recurrentes.fila" key={c.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5">
                          <span className={`font-semibold ${c.activo ? "text-fg" : "text-fg-muted"}`}>{c.nombre}</span>
                          {!c.activo && <span className="ml-2 text-xs text-warn-ink">● En pausa</span>}
                          {c.notas && <span className="block text-xs text-fg-muted">{c.notas}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-fg">
                          {textoDeMontos([{ moneda: c.moneda, monto: c.monto }])}
                          <span className="ml-1 text-xs text-fg-muted">{c.frecuencia === "ANUAL" ? "al año" : "al mes"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          {puedeEditar && (
                            <>
                              <button type="button" className={BOTON_BLANCO} onClick={() => setForm({ costo: c })}>
                                Editar
                              </button>{" "}
                              <button
                                type="button"
                                className={BOTON_BLANCO}
                                disabled={ocupado !== null}
                                onClick={() =>
                                  void cambiar(c, { activo: !c.activo }, c.activo ? "En pausa: deja de cargarse." : "Vuelve a cargarse cada mes.")
                                }
                              >
                                {c.activo ? "Pausar" : "Reanudar"}
                              </button>{" "}
                              <button
                                type="button"
                                className="rounded-md px-2 py-1.5 text-xs font-semibold text-fg-muted hover:text-danger-ink"
                                disabled={ocupado !== null}
                                title="Se dejó de pagar: deja de cargarse desde hoy. La historia queda."
                                onClick={() => void cambiar(c, { finalizadoEl: todayISO }, "Dado de baja desde hoy.")}
                              >
                                Dar de baja
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
        );
      })}

      {vigentes.length === 0 && bajas.length === 0 && (
        <EmptyState title="No hay costos recurrentes" description="Agrega las herramientas y los fijos de operación que se pagan todos los meses." />
      )}

      {bajas.length > 0 && (
        <section data-recorrido="fin.recurrentes.bajas" aria-label="Dados de baja" className="rounded-xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => setVerBajas((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-fg hover:bg-surface-hover"
          >
            <span className="text-fg-muted">{verBajas ? "▾" : "▸"}</span>
            Dados de baja ({bajas.length})
          </button>
          {verBajas &&
            bajas.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[13px]">
                <span className="flex-1 text-fg-secondary">{c.nombre}</span>
                <span className="text-xs text-fg-muted">desde el {c.finalizadoEl}</span>
                {puedeEditar && (
                  <button type="button" className={BOTON_BLANCO} disabled={ocupado !== null} onClick={() => void cambiar(c, { finalizadoEl: null }, "Vuelve a cargarse.")}>
                    Reactivar
                  </button>
                )}
              </div>
            ))}
        </section>
      )}

      {esSuperAdmin && (
        <p className="text-xs text-fg-muted">
          Los salarios están en{" "}
          <Link href="/finanzas/costos/planillas" className="font-semibold text-brand hover:text-brand-light">
            Planilla
          </Link>
          ; el resumen con todo junto, en{" "}
          <Link href="/finanzas/costos" className="font-semibold text-brand hover:text-brand-light">
            Costos y gastos
          </Link>
          .
        </p>
      )}

      {form && (
        <CostoForm
          costo={form.costo}
          categoriaInicial="HERRAMIENTA"
          todayISO={todayISO}
          apiBase="/api/finanzas/recurrentes"
          sinSalarios
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void recargar();
          }}
        />
      )}
    </div>
  );
}
