"use client";

/**
 * components/finanzas/ReglasDeGasto.tsx — las piezas de Gastos del mes que nacen el 2026-11-13: las marcas de las reglas
 * de gasto, «Ya tengo la factura», «Este gasto se repite» (volverlo fijo) y la lista de facturas que faltan. Las reglas
 * viven en lib/finanzas/reglas-de-gasto.ts.
 *
 * ⛔ Sin salarios: el fijo que nace de un gasto es herramienta o fijo de operación.
 */
import { useState } from "react";
import { Button, Field, Input, Modal, Segmentado } from "@/components/ui";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { GastoPuntualDTO } from "@/lib/cobranza";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { ETIQUETA_CATEGORIA, etiquetaMes, type CategoriaSinSalario } from "@/lib/finanzas/gastos";
import { ETIQUETA_RUBRO, ETIQUETA_TIPO, avisosDelGasto, fijoDesde, rubroDe, tipoDe, type AvisoDeRegla } from "@/lib/finanzas/reglas-de-gasto";
import { fmtFecha } from "@/components/cobranza/format";

const BOTON_CHICO =
  "rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-fg-secondary hover:bg-surface-hover disabled:opacity-50";

/** Las marcas de un gasto contra sus reglas, sin la de la factura (esa tiene su columna). */
export function avisosSinFactura(g: GastoPuntualDTO, hoyISO: string): AvisoDeRegla[] {
  return avisosDelGasto({ ...g, pasoAFijo: g.pasoAFijo !== null }, hoyISO).filter((a) => a.clave !== "SIN_FACTURA");
}

/** Qué clase de gasto es y en qué fue, en una línea chica. */
export function ClaseDelGasto({ g }: { g: GastoPuntualDTO }) {
  const tipo = tipoDe(g.tipo);
  const rubro = rubroDe(g.rubro);
  if (tipo === "OTRO" && !rubro) return null;
  return (
    <span className="block text-xs text-fg-muted">
      {ETIQUETA_TIPO[tipo]}
      {rubro ? ` · ${ETIQUETA_RUBRO[rubro]}` : ""}
      {tipo === "REPRESENTACION" && g.avisoPrevio ? " · avisado antes" : ""}
    </span>
  );
}

export function MarcasDeRegla({ avisos }: { avisos: AvisoDeRegla[] }) {
  if (avisos.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {avisos.map((a) => (
        <span
          key={a.clave}
          title={a.texto}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            a.grave ? "border-danger-line bg-danger-surface text-danger-ink" : "border-warn-line bg-warn-surface text-warn-ink"
          }`}
        >
          {a.rotulo}
        </span>
      ))}
    </span>
  );
}

/** La celda de la factura: anotada (con quién) o el botón para anotarla. */
export function CeldaDeFactura({
  g,
  hoyISO,
  puedeEditar,
  onAnotar,
}: {
  g: GastoPuntualDTO;
  hoyISO: string;
  puedeEditar: boolean;
  onAnotar: (g: GastoPuntualDTO) => void;
}) {
  if (g.comprobante) {
    const enlace = /^https?:\/\//i.test(g.comprobante);
    return (
      <span className="text-xs text-success-ink" title={`Anotada por ${g.comprobantePor ?? "—"}${g.comprobanteEn ? `, ${fmtFecha(g.comprobanteEn)}` : ""}`}>
        ✓{" "}
        {enlace ? (
          <a href={g.comprobante} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-brand-light">
            Factura
          </a>
        ) : (
          g.comprobante
        )}
        {puedeEditar && (
          <button type="button" className="ml-1.5 text-fg-muted hover:text-fg" onClick={() => onAnotar(g)}>
            Cambiar
          </button>
        )}
      </span>
    );
  }
  if (g.fecha > hoyISO) return <span className="text-xs text-fg-muted">Planificado</span>;
  return puedeEditar ? (
    <button type="button" className={BOTON_CHICO} onClick={() => onAnotar(g)}>
      Anotar factura
    </button>
  ) : (
    <span className="text-xs text-warn-ink">Falta</span>
  );
}

/** «Ya tengo la factura»: su número o el enlace al archivo. */
export function FacturaModal({ gasto, onClose, onGuardado }: { gasto: GastoPuntualDTO; onClose: () => void; onGuardado: () => void }) {
  const [valor, setValor] = useState(gasto.comprobante ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async (comprobante: string | null) => {
    setGuardando(true);
    setError(null);
    try {
      await fetchJson(`/api/finanzas/gastos/${gasto.id}/comprobante`, { method: "PUT", body: JSON.stringify({ comprobante }) });
      onGuardado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
      setGuardando(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="La factura de este gasto"
      description={`${gasto.nombre} · ${textoDeMontos([{ moneda: gasto.moneda, monto: gasto.monto }])} · ${fmtFecha(gasto.fecha)}`}
      footer={
        <>
          {gasto.comprobante && (
            <Button variant="destructive" disabled={guardando} onClick={() => void guardar(null)}>
              Quitar la factura
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando || !valor.trim()} onClick={() => void guardar(valor.trim())}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <Field label="Número de la factura o enlace al archivo" hint="Se puede anotar aunque el mes ya esté cerrado: no cambia ningún monto." error={error}>
        <Input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={500} placeholder="Ej. 00100001010000012345 o https://…" autoFocus />
      </Field>
    </Modal>
  );
}

/** «Este gasto se repite»: el gasto se vuelve un fijo que cuenta desde el mes que sigue. */
export function VolverFijoModal({
  gasto,
  hoyISO,
  onClose,
  onGuardado,
}: {
  gasto: GastoPuntualDTO;
  hoyISO: string;
  onClose: () => void;
  onGuardado: (desde: string) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaSinSalario>("HERRAMIENTA");
  const [frecuencia, setFrecuencia] = useState<"MENSUAL" | "ANUAL">("MENSUAL");
  const [presupuesto, setPresupuesto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desde = fijoDesde(gasto.fecha);
  const cuentaDesde = desde > hoyISO ? desde : hoyISO;
  const presupuestoNum = presupuesto.trim() ? Number(presupuesto) : null;
  const presupuestoMal = presupuestoNum !== null && !(Number.isFinite(presupuestoNum) && presupuestoNum > 0);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await fetchJson(`/api/finanzas/gastos/${gasto.id}/fijo`, {
        method: "POST",
        body: JSON.stringify({
          categoria,
          frecuencia,
          presupuesto: presupuestoNum === null ? null : Math.round(presupuestoNum * 100) / 100,
        }),
      });
      onGuardado(desde);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Este gasto se repite"
      description={`${gasto.nombre} · ${textoDeMontos([{ moneda: gasto.moneda, monto: gasto.monto }])}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando || presupuestoMal} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Volverlo fijo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-[1.45] text-fg-secondary">
          Pasa a Recurrentes como un gasto fijo, con este nombre y este monto, y Nexus lo proyecta solo cada mes desde{" "}
          <strong className="font-semibold text-fg">{etiquetaMes(cuentaDesde.slice(0, 7), true)}</strong>. Este gasto se queda en{" "}
          {etiquetaMes(gasto.fecha.slice(0, 7))}: así ese mes no lo cuenta dos veces.
        </p>
        <Field label="Qué es">
          <Segmentado
            etiqueta="Qué es"
            opciones={(["HERRAMIENTA", "FIJO_OPERACION"] as const).map((c) => ({ clave: c, etiqueta: ETIQUETA_CATEGORIA[c] }))}
            valor={categoria}
            onCambio={setCategoria}
            lleno
          />
        </Field>
        <Field label="Cada cuánto se paga">
          <Segmentado
            etiqueta="Cada cuánto se paga"
            opciones={[
              { clave: "MENSUAL" as const, etiqueta: "Cada mes" },
              { clave: "ANUAL" as const, etiqueta: "Cada año" },
            ]}
            valor={frecuencia}
            onCambio={setFrecuencia}
            lleno
          />
        </Field>
        <Field
          label={`Presupuesto ${frecuencia === "ANUAL" ? "al año" : "al mes"} (${gasto.moneda})`}
          hint={
            categoria === "HERRAMIENTA"
              ? "Cada suscripción lleva un presupuesto: Nexus marca cuando el cobro lo pasa. Lo puedes poner después en Recurrentes."
              : "Opcional. Nexus marca cuando el costo lo pasa."
          }
          error={presupuestoMal ? "Escribe un monto mayor que cero, o déjalo vacío." : error}
        >
          <Input type="number" min="0" step="0.01" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="0.00" />
        </Field>
      </div>
    </Modal>
  );
}

/** Lo que le falta recopilar a quien registra: los gastos que ya pasaron y no tienen factura, de todos los meses. */
export function FacturasQueFaltan({
  gastos,
  hoyISO,
  puedeEditar,
  onAnotar,
}: {
  gastos: GastoPuntualDTO[];
  hoyISO: string;
  puedeEditar: boolean;
  onAnotar: (g: GastoPuntualDTO) => void;
}) {
  if (gastos.length === 0) return null;
  return (
    <section aria-label="Facturas que faltan" className="rounded-xl border border-warn-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-2.5 border-b border-line px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-fg">Facturas que faltan</h2>
        <span className="text-xs text-fg-muted">
          {gastos.length === 1 ? "1 gasto" : `${gastos.length} gastos`} sin factura, de todos los meses desde octubre de 2026. Los más viejos primero.
        </span>
      </div>
      <ul>
        {gastos.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
            <span className="w-24 whitespace-nowrap text-fg-secondary">{fmtFecha(g.fecha)}</span>
            <span className="min-w-0 flex-1 font-semibold text-fg">{g.nombre}</span>
            <span className="whitespace-nowrap tabular-nums text-fg">{textoDeMontos([{ moneda: g.moneda, monto: g.monto }])}</span>
            <CeldaDeFactura g={g} hoyISO={hoyISO} puedeEditar={puedeEditar} onAnotar={onAnotar} />
          </li>
        ))}
      </ul>
    </section>
  );
}
