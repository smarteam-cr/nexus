"use client";

/**
 * components/finanzas/HistorialComisiones.tsx — el historial de comisiones de cada vendedor, como su Excel: una fila por
 * venta y un mes por columna (2026-10-06, pedido de Elías). Lo carga scripts/import-comisiones-vendedor.ts.
 *
 * Lo dudoso del Excel (las celdas amarillas, y los meses que nadie marcó como pagados) llega POR CONFIRMAR: Dinia o Alex
 * hacen clic en la cuota y responden «¿Se pagó?». La respuesta queda a su nombre y se puede deshacer. Un mes que todavía
 * no llega se ve como programado y no se confirma.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CuotaComisionDTO, HistorialComisionesDTO, VendedorConHistorialDTO } from "@/lib/finanzas/comisiones-historial";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { fmtMonto } from "@/components/cobranza/format";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Clase = "pagada" | "noPagada" | "porConfirmar" | "programada";

/** Lleno = pagado; amarillo = hay que responder; punteado = todavía no toca; tachado = no se pagó. */
const CLASE: Record<Clase, { label: string; cls: string }> = {
  pagada: { label: "Pagada", cls: "border-line bg-surface-hover text-fg" },
  porConfirmar: { label: "Por confirmar", cls: "border-warn-line bg-warn-surface text-warn-ink" },
  programada: { label: "Programada", cls: "border-line border-dashed bg-transparent text-fg-secondary" },
  noPagada: { label: "No se pagó", cls: "border-line bg-transparent text-fg-muted line-through" },
};

const claseDe = (c: CuotaComisionDTO, mesActual: string): Clase =>
  c.estado === "PAGADA" ? "pagada" : c.estado === "NO_PAGADA" ? "noPagada" : c.periodo > mesActual ? "programada" : "porConfirmar";

const suma = (xs: CuotaComisionDTO[]) => xs.reduce((n, c) => n + Math.round(c.monto * 100), 0) / 100;

export default function HistorialComisiones({
  data,
  todayISO,
  puedeEditar,
}: {
  data: HistorialComisionesDTO;
  todayISO: string;
  /** «Editar comisiones»: responder «¿Se pagó?». Sin él, la tabla se ve igual y sin botones. */
  puedeEditar: boolean;
}) {
  if (data.faltaSql) {
    return (
      <section className="rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
        <p className="text-xs text-warn-ink">
          El historial de comisiones todavía no está listo en esta base: falta correr el SQL de las cuotas de comisión.
        </p>
      </section>
    );
  }
  if (data.vendedores.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Historial por venta · {data.anio}</h2>
        <p className="mt-1 text-xs text-fg-muted">Todavía no se cargó el Excel de comisiones de ningún vendedor para este año.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      {data.vendedores.map((v) => (
        <TablaDelVendedor key={v.teamMemberId} v={v} anio={data.anio} mesActual={todayISO.slice(0, 7)} puedeEditar={puedeEditar} />
      ))}
    </div>
  );
}

function TablaDelVendedor({
  v,
  anio,
  mesActual,
  puedeEditar,
}: {
  v: VendedorConHistorialDTO;
  anio: number;
  mesActual: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [soloPorConfirmar, setSoloPorConfirmar] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const todas = useMemo(() => v.ventas.flatMap((x) => x.cuotas), [v.ventas]);
  const porConfirmar = todas.filter((c) => claseDe(c, mesActual) === "porConfirmar");
  const visibles = soloPorConfirmar ? v.ventas.filter((x) => x.cuotas.some((c) => claseDe(c, mesActual) === "porConfirmar")) : v.ventas;
  const periodos = MES_CORTO.map((_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
  const sel = elegida ? v.ventas.flatMap((x) => x.cuotas.map((c) => ({ venta: x, c }))).find((x) => x.c.id === elegida) : undefined;

  async function responder(estado: "PAGADA" | "NO_PAGADA" | "POR_CONFIRMAR") {
    if (!sel || guardando) return;
    setGuardando(true);
    try {
      await fetchJson(`/api/cobranza/costos/comisiones-vendedor/cuotas/${sel.c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      toast.success(
        estado === "PAGADA" ? "Anotada como pagada, a tu nombre." : estado === "NO_PAGADA" ? "Anotada como no pagada." : "Vuelve a «por confirmar».",
      );
      // Pasar a la siguiente por confirmar, en el orden de la tabla: responder un Excel entero es una tanda.
      const orden = visibles.flatMap((x) => x.cuotas.filter((c) => claseDe(c, mesActual) === "porConfirmar"));
      const siguiente = orden.slice(orden.findIndex((c) => c.id === sel.c.id) + 1).find((c) => c.id !== sel.c.id);
      setElegida(estado === "POR_CONFIRMAR" ? sel.c.id : (siguiente?.id ?? null));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar. Recarga la página e inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <header className="px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line">
        <h2 className="text-sm font-semibold text-fg">
          Historial por venta · {v.nombre} · {anio}
        </h2>
        <span className="text-[11px] text-fg-muted tabular-nums">
          {fmtMonto(suma(todas.filter((c) => c.estado === "PAGADA")), v.moneda)} pagado
          {porConfirmar.length > 0 && ` · ${fmtMonto(suma(porConfirmar), v.moneda)} por confirmar`}
          {` · ${fmtMonto(suma(todas.filter((c) => claseDe(c, mesActual) === "programada")), v.moneda)} programado`}
        </span>
        {porConfirmar.length > 0 && (
          <button
            type="button"
            onClick={() => setSoloPorConfirmar((x) => !x)}
            className="ml-auto text-[11px] px-2 py-1 rounded-md border border-warn-line text-warn-ink bg-warn-surface hover:opacity-90"
          >
            {soloPorConfirmar ? "Ver todas las ventas" : `Ver solo las ${porConfirmar.length} por confirmar`}
          </button>
        )}
      </header>

      <div className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line">
        {(Object.keys(CLASE) as Clase[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[10px] text-fg-muted">
            <span aria-hidden className={`inline-block h-3 w-5 rounded-[3px] border ${CLASE[k].cls}`} />
            {CLASE[k].label}
          </span>
        ))}
        {puedeEditar && porConfirmar.length > 0 && (
          <span className="text-[10px] text-fg-muted/80">· clic en una cuota por confirmar para responder si se pagó</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-muted">
              <th className="text-left font-medium px-3 py-1.5">Venta</th>
              <th className="text-right font-medium px-2 py-1.5">Comisión</th>
              {MES_CORTO.map((m) => (
                <th key={m} className="text-center font-medium px-1 py-1.5">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((venta) => (
              <tr key={venta.ventaClave} className="border-t border-line">
                <td className="px-3 py-1 align-middle">
                  <span className="text-fg">{venta.cliente}</span>
                  <span className="block text-[10px] text-fg-muted">
                    {venta.tipoVenta === "LICENCIA" ? "Licencia" : "Servicio"} · {venta.porcentaje}%
                    {venta.montoContrato !== null && ` de ${fmtMonto(venta.montoContrato, v.moneda)}`}
                  </span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-fg-secondary align-middle">
                  {venta.montoComision !== null ? fmtMonto(venta.montoComision, v.moneda) : "—"}
                </td>
                {periodos.map((p) => {
                  const c = venta.cuotas.find((x) => x.periodo === p);
                  if (!c) return <td key={p} />;
                  const clase = claseDe(c, mesActual);
                  const accionable = puedeEditar && clase !== "programada";
                  const titulo = `${MES_LARGO[Number(p.slice(5, 7)) - 1]} · ${CLASE[clase].label}${c.confirmadoPor ? ` · lo dijo ${c.confirmadoPor}` : ""}`;
                  const contenido = <span className="tabular-nums">{fmtMonto(c.monto, v.moneda)}</span>;
                  const cls = `w-full rounded-[5px] border px-1 py-0.5 text-center ${CLASE[clase].cls} ${
                    elegida === c.id ? "ring-2 ring-brand" : ""
                  }`;
                  return (
                    <td key={p} className="px-0.5 py-1 align-middle">
                      {accionable ? (
                        <button type="button" title={titulo} onClick={() => setElegida(c.id)} className={`${cls} hover:border-brand`}>
                          {contenido}
                        </button>
                      ) : (
                        <div title={titulo} className={cls}>
                          {contenido}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-line text-fg-secondary">
              <td className="px-3 py-1.5 font-medium" colSpan={2}>
                Pagado por mes
              </td>
              {periodos.map((p) => (
                <td key={p} className="px-1 py-1.5 text-center tabular-nums">
                  {(() => {
                    const n = suma(todas.filter((c) => c.periodo === p && c.estado === "PAGADA"));
                    return n > 0 ? fmtMonto(n, v.moneda) : "";
                  })()}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {sel && puedeEditar && (
        <div className="m-3 rounded-lg border border-brand/40 bg-surface-muted px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-[220px] flex-1">
            <p className="text-xs font-medium text-fg">
              {sel.venta.cliente} · {MES_LARGO[Number(sel.c.periodo.slice(5, 7)) - 1]} · {fmtMonto(sel.c.monto, v.moneda)}
            </p>
            <p className="text-[11px] text-fg-muted">
              {sel.c.estado === "POR_CONFIRMAR"
                ? "¿Se le pagó esta cuota? Queda a tu nombre."
                : `Está como «${CLASE[claseDe(sel.c, mesActual)].label.toLowerCase()}»${sel.c.confirmadoPor ? ` (lo dijo ${sel.c.confirmadoPor})` : ""}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sel.c.estado !== "PAGADA" && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => responder("PAGADA")}
                className="text-[11px] px-2.5 py-1 rounded-md bg-brand text-primary-fg font-medium hover:bg-brand-dark disabled:opacity-50"
              >
                Sí, se pagó
              </button>
            )}
            {sel.c.estado !== "NO_PAGADA" && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => responder("NO_PAGADA")}
                className="text-[11px] px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                No se pagó
              </button>
            )}
            {sel.c.estado !== "POR_CONFIRMAR" && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => responder("POR_CONFIRMAR")}
                className="text-[11px] px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                Volver a «por confirmar»
              </button>
            )}
            <button type="button" onClick={() => setElegida(null)} className="text-[11px] px-2 py-1 rounded-md text-fg-muted hover:text-fg-secondary">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

