"use client";

/**
 * components/cobranza/FacturacionOdoo.tsx
 *
 * «Facturación por cliente»: lo facturado, lo cobrado y lo por cobrar de cada cliente en un año, de la copia de Odoo,
 * al lado de las ventas cerradas en HubSpot (punto 8 de la revisión con Alex, 2026-09-30: Marco quería saber qué plata
 * entró de cada cliente, al menos en 2025, y compararla con lo que ventas cerró).
 *
 * La copia de Odoo ya traía todos los años; lo que faltaba era verla por cliente. La regla —qué es facturado, cobrado
 * y por cobrar, y qué ventas cuentan— vive en lib/cobranza/odoo/facturacion-por-cliente.ts, con sus pruebas.
 * ⛔ Solo mira: no cambia nada, ni en Nexus ni en Odoo.
 */
import { useCallback, useEffect, useState } from "react";
import { EmptyState, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { textoDeMontos, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import type { FacturacionDelAnio, VentasDelAnio } from "@/lib/cobranza/odoo/facturacion-por-cliente";
import { fmtFecha } from "./format";

/** Lo que devuelve GET /api/cobranza/odoo/facturacion (`FacturacionPorCliente`, servicio.ts). */
type Respuesta = FacturacionDelAnio & { conVentas: boolean; copiaAl: string | null };

/** Una cifra por moneda, una debajo de la otra: dólares y colones nunca se suman. */
function Montos({ ms, vacio = "—" }: { ms: readonly MontoEnMoneda[]; vacio?: string }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      {ms.length === 0 ? <span className="text-fg-muted">{vacio}</span> : ms.map((m) => <div key={m.moneda}>{textoDeMontos([m])}</div>)}
    </td>
  );
}

function Ventas({ v }: { v: VentasDelAnio | null }) {
  if (v === null) {
    return (
      <td className="px-3 py-2 text-right text-xs text-fg-muted" title="Sin cuenta en Nexus no hay empresa con qué cruzar los tratos de HubSpot.">
        sin cuenta
      </td>
    );
  }
  if (v.tratos === 0) return <Montos ms={[]} />;
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      {v.montos.map((m) => (
        <div key={m.moneda}>{textoDeMontos([m])}</div>
      ))}
      <div className="text-xs text-fg-muted">
        {v.tratos === 1 ? "1 trato" : `${v.tratos} tratos`}
        {v.sinMonto > 0 && ` · ${v.sinMonto} sin monto`}
      </div>
    </td>
  );
}

export default function FacturacionOdoo({ recarga = 0 }: { recarga?: number }) {
  const toast = useToast();
  /* null = el año que elige el servidor: el anterior al de hoy, el último completo. */
  const [anio, setAnio] = useState<number | null>(null);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [verSinFacturas, setVerSinFacturas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await fetchJson<Respuesta>(`/api/cobranza/odoo/facturacion${anio === null ? "" : `?anio=${anio}`}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la facturación por cliente.");
    } finally {
      setCargando(false);
    }
  }, [anio, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  if (cargando && !datos) {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-fg-muted">
        <Spinner /> Cargando…
      </div>
    );
  }
  if (!datos) return <EmptyState title="No se pudo cargar" description="Prueba de nuevo en un momento." />;

  const { filas, totales, conVentas } = datos;
  const anios = datos.anios.includes(datos.anio) ? datos.anios : [datos.anio, ...datos.anios].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3">
        <label className="w-32 text-xs text-fg-muted">
          Año
          <Select
            className="mt-1"
            value={String(datos.anio)}
            onChange={(e) => setAnio(Number(e.target.value))}
            title="Elige el año: la lista muestra las facturas de Odoo de ese año, cliente por cliente."
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </label>
        <div className="min-w-0 flex-1 text-sm text-fg-secondary">
          <p>
            <strong className="text-fg">{filas.length}</strong> {filas.length === 1 ? "cliente" : "clientes"} con{" "}
            <strong className="text-fg">{totales.facturas}</strong> {totales.facturas === 1 ? "factura" : "facturas"} en {datos.anio}.
            Facturado {textoDeMontos(totales.facturado) || "—"} · cobrado {textoDeMontos(totales.cobrado) || "—"}
            {totales.porCobrar.length > 0 && ` · por cobrar ${textoDeMontos(totales.porCobrar)}`}.
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Todo sin IVA y cada moneda por separado, de la copia de Odoo{datos.copiaAl ? ` del ${fmtFecha(datos.copiaAl)}` : ""}. La
            factura más reciente va arriba. Esta pestaña solo mira: no cambia nada en Nexus ni en Odoo.
          </p>
        </div>
        {cargando && <Spinner />}
      </div>

      {filas.length === 0 ? (
        <EmptyState title={`Ninguna factura de Odoo en ${datos.anio}`} description="Elige otro año." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Última factura</th>
                <th className="px-3 py-2 text-right font-medium">Facturas</th>
                <th className="px-3 py-2 text-right font-medium" title="Las facturas del año, sin IVA, menos sus notas de crédito.">
                  Facturado
                </th>
                <th className="px-3 py-2 text-right font-medium" title="Lo que Odoo ya no da por cobrar: la plata que entró.">
                  Cobrado
                </th>
                <th className="px-3 py-2 text-right font-medium" title="Lo que Odoo todavía da por cobrar, con la misma regla que «Lo que no cuadra».">
                  Por cobrar
                </th>
                {conVentas && (
                  <th
                    className="px-3 py-2 text-right font-medium"
                    title="Tratos ganados en HubSpot con cierre en el año. Una venta de diciembre se factura en enero: compararlas es una guía, no un cuadre."
                  >
                    Ventas cerradas
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-b border-line align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-fg">{f.nombre}</div>
                    {f.clientesDeOdoo.length > 0 && (
                      <div className="text-xs text-fg-muted">Facturado a {f.clientesDeOdoo.join(" · ")}</div>
                    )}
                    {!f.cuentaId && (
                      <div className="text-xs text-warn-ink" title="Ninguna cuenta de Nexus tiene a este cliente de Odoo: se vincula en «Emparejar».">
                        Sin cuenta en Nexus
                      </div>
                    )}
                    {f.notasSinAplicar.length > 0 && (
                      <div className="text-xs text-fg-muted">
                        Incluye notas de crédito sin aplicar por {textoDeMontos(f.notasSinAplicar)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-fg-secondary">{fmtFecha(f.ultimaFactura)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.facturas}</td>
                  <Montos ms={f.facturado} />
                  <Montos ms={f.cobrado} />
                  <Montos ms={f.porCobrar} />
                  {conVentas && <Ventas v={f.ventas} />}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line font-medium text-fg">
              <tr className="align-top">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{totales.facturas}</td>
                <Montos ms={totales.facturado} />
                <Montos ms={totales.cobrado} />
                <Montos ms={totales.porCobrar} />
                {conVentas && <Ventas v={totales.ventas} />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-muted">
        Facturado = cobrado + por cobrar − las notas de crédito que todavía no se aplicaron. Una factura revertida no
        cuenta, ni la nota que la revirtió.{" "}
        {conVentas
          ? "Las ventas son de la empresa de cada cuenta: un cliente de Odoo sin cuenta en Nexus no tiene con qué cruzarse."
          : "Las ventas cerradas se ven con acceso a Ventas."}
      </p>

      {conVentas && datos.ventasSinFacturas.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <button
            type="button"
            onClick={() => setVerSinFacturas((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-fg hover:bg-surface-hover"
          >
            <span className="text-fg-muted">{verSinFacturas ? "▾" : "▸"}</span>
            Con ventas cerradas en {datos.anio} y sin facturas de Odoo ese año ({datos.ventasSinFacturas.length})
          </button>
          {verSinFacturas && (
            <div className="border-t border-line px-4 py-2">
              <p className="pb-2 text-xs text-fg-muted">
                Facturan por Mercury, se les facturó otro año, o todavía no se les factura.
              </p>
              {datos.ventasSinFacturas.map((v) => (
                <div key={v.clientId} className="flex flex-wrap items-baseline gap-x-3 border-b border-line py-1.5 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={v.nombre}>
                    {v.nombre}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {v.viaCobro === "MERCURY"
                      ? "factura por Mercury"
                      : v.viaCobro === "OTRA"
                        ? "factura por QuickBooks"
                        : v.viaCobro === null
                          ? "sin cuenta de cobro"
                          : "factura por Odoo"}
                  </span>
                  <span className="text-sm tabular-nums text-fg-secondary">
                    {textoDeMontos(v.ventas.montos) || "sin monto"} · {v.ventas.tratos === 1 ? "1 trato" : `${v.ventas.tratos} tratos`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
