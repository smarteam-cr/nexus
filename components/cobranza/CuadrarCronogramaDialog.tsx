"use client";

/**
 * components/cobranza/CuadrarCronogramaDialog.tsx
 *
 * Qué va a pasar con los cobros si se regenera desde el acuerdo nuevo, y qué hacer con las
 * facturas que ese acuerdo ya no justifica.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Cambiar el acuerdo de pago y que los cobros lo sigan eran DOS gestos separados, y ninguno
 * decía que hacía falta el otro. Alexander cortó el contrato de Wherex, guardó, vio un toast
 * verde, y el cronograma siguió mostrando los cobros viejos. **Guardó seis veces** creyendo
 * que no tomaba.
 *
 * Y aun apretando «Generar cobros» no alcanzaba: tres de los cuatro cobros estaban facturados
 * y el motor no los toca. El botón dejaba el cronograma en $6.375 contra un acuerdo de $5.100.
 *
 * ⚠ Por eso el cierre de este diálogo son TRES NÚMEROS y no una promesa. La diferencia entre
 * «si confirmás sin soltar nada» y «con lo que elegiste» es lo único que explica para qué
 * sirve soltar una factura.
 *
 * ⛔ NO usa `ConfirmDialog`: renderiza su `description` dentro de un `<p>`, así que una lista
 * adentro es HTML inválido, y su modal está fijo en `sm`. El molde correcto para contenido
 * estructurado es `Modal` con footer propio — igual que `RegistrarPagoDialog`.
 *
 * Presentacional: recibe el preview del servidor y devuelve las decisiones. El `fetch` lo hace
 * quien lo abre.
 */
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import {
  BLOQUEO_LABEL,
  sumaConDecisiones,
  type CobroBloqueado,
  type PlanDeCambios,
} from "@/lib/cobranza/plan-vs-cobros";
import { fmtFecha, fmtMonto } from "./format";

export type DecisionFactura = "CANCELAR" | "REVERTIR";
export type Plataforma = "MERCURY" | "ODOO" | "OTRA";

export interface DecisionElegida {
  cobroId: string;
  /**
   * Ausente = el cobro está bloqueado pero **no tiene factura emitida**: no hay documento que
   * anular, así que no hay nada que decidir ni línea de trabajo que abrir hacia ningún ERP.
   */
  decision?: DecisionFactura;
  plataforma?: Plataforma;
  motivo?: string;
}

/** Lo que cada opción significa del lado del ERP. Va a la vista, no en un tooltip. */
const QUE_HACE: Record<DecisionFactura, string> = {
  CANCELAR: "El documento se anula o se elimina en el ERP.",
  REVERTIR: "Se emite una nota de crédito que lo reversa; los dos documentos quedan.",
};

/**
 * Estrecha el `viaCobro: string` que viaja en el DTO. `switch` y no un cast: si mañana el enum
 * suma un miembro, el default lo manda a OTRA en vez de mentir un valor que no existe.
 */
export function aPlataforma(v: string): Plataforma {
  switch (v) {
    case "MERCURY":
      return "MERCURY";
    case "ODOO":
      return "ODOO";
    default:
      return "OTRA";
  }
}

const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  MERCURY: "Mercury",
  ODOO: "Odoo",
  OTRA: "Otra",
};

export default function CuadrarCronogramaDialog({
  preview,
  moneda,
  viaCobroDeLaCuenta,
  cuentaEsInternacional,
  guardando,
  onCancel,
  onConfirm,
}: {
  preview: PlanDeCambios;
  moneda: string;
  viaCobroDeLaCuenta: Plataforma;
  cuentaEsInternacional: boolean;
  guardando: boolean;
  onCancel: () => void;
  onConfirm: (decisiones: DecisionElegida[], corregirViaCobro: boolean) => void;
}) {
  const pendientes = useMemo(() => preview.bloqueados.filter((b) => !b.coincide), [preview]);
  const [elegido, setElegido] = useState<Record<string, DecisionElegida | undefined>>({});
  const [corregirVia, setCorregirVia] = useState(false);

  const m = (n: number) => fmtMonto(n, moneda);
  const decisiones = Object.values(elegido).filter((d): d is DecisionElegida => !!d);

  /**
   * El total con lo que la persona lleva elegido, recalculado en vivo. Sin este número,
   * confirmar es un acto de fe.
   *
   * La regla y su porqué viven en `sumaConDecisiones`, junto a las otras tres sumas y con sus
   * tests: acá se dibuja, no se decide.
   */
  const sumaElegida = useMemo(
    () => sumaConDecisiones(preview, new Set(decisiones.map((d) => d.cobroId))),
    [decisiones, preview],
  );

  /**
   * ⚠ Si todo lo elegido apunta a una plataforma distinta a la de la cuenta, se OFRECE
   * corregirla — no se deduce. La pregunta de cada fila es «¿dónde se emitió ESTA factura?», en
   * pasado y por documento: contestar «Mercury» sobre una factura vieja no dice que la cuenta
   * facture por Mercury hoy. Antes se escribía solo, sin que el diálogo ni el toast lo
   * mencionaran, y la liberación siguiente nacía apuntando a la plataforma equivocada.
   */
  const plataformasElegidas = new Set(
    decisiones.map((d) => d.plataforma).filter((p): p is Plataforma => !!p),
  );
  const viaSugerida =
    plataformasElegidas.size === 1 && !plataformasElegidas.has(viaCobroDeLaCuenta)
      ? [...plataformasElegidas][0]
      : null;

  const cuadra = Math.abs(sumaElegida - preview.sumaDelPlan) < 0.01;
  /**
   * ⚠ Hay casos donde soltar no puede cerrar la diferencia porque no hay nada soltable —
   * Teamnet: dos cobros COBRADOS de 2.000 contra un acuerdo que pide 1.875. Sin decirlo, el
   * cierre muestra un número rojo y tres opciones que no lo mueven, y quien lo lee prueba
   * combinaciones hasta rendirse. Es el callejón sin salida que este diálogo existe para
   * cerrar, así que se nombra.
   */
  const sinSalida = !cuadra && pendientes.length > 0 && pendientes.every((b) => !b.liberable);

  return (
    <Modal
      open
      onClose={onCancel}
      size="xl"
      z="z-[70]"
      title="Cuadrar el cronograma con el acuerdo nuevo"
      description="Esto cambia cobros y suelta facturas ya emitidas. Revisá cada línea antes de confirmar."
      footer={
        <>
          <button type="button" onClick={onCancel} className="text-xs text-fg-muted hover:text-fg px-2 py-1.5">
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => onConfirm(decisiones, !!viaSugerida && corregirVia)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
          >
            {guardando ? "Aplicando…" : decisiones.length > 0 ? `Soltar ${decisiones.length} y regenerar` : "Solo regenerar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── 1. Lo que el motor hace solo ──────────────────────────────────── */}
        {(preview.crear.length > 0 || preview.ajustar.length > 0 || preview.borrar.length > 0) && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
              Esto pasa solo, sin tocar ninguna factura
            </h3>
            <ul className="mt-1.5 space-y-0.5">
              {preview.crear.map((c) => (
                <li key={`c${c.numCuota}`} className="text-xs text-fg-secondary tabular-nums">
                  <span className="text-fg-muted">#{c.numCuota}</span> se crea por {m(c.monto)} ·{" "}
                  {fmtFecha(c.fechaProgramadaISO)}
                </li>
              ))}
              {preview.ajustar.map((a) => (
                <li key={`a${a.numCuota}`} className="text-xs text-fg-secondary tabular-nums">
                  <span className="text-fg-muted">#{a.numCuota}</span> se ajusta de {m(a.deMonto)} a {m(a.aMonto)}
                </li>
              ))}
              {preview.borrar.map((b) => (
                <li key={`b${b.numCuota}`} className="text-xs text-fg-secondary tabular-nums">
                  <span className="text-fg-muted">#{b.numCuota}</span> se elimina ({m(b.monto)}) — el acuerdo ya no lo
                  pide y no tiene factura
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 2. Una fila por cobro bloqueado, con su decisión ──────────────── */}
        {pendientes.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
              Estos no se pueden tocar sin decidir qué pasa con su factura
            </h3>
            <div className="mt-1.5 space-y-2">
              {pendientes.map((b) => (
                <FilaBloqueada
                  key={b.cobroId}
                  b={b}
                  moneda={moneda}
                  viaCobroDeLaCuenta={viaCobroDeLaCuenta}
                  cuentaEsInternacional={cuentaEsInternacional}
                  elegido={elegido[b.cobroId]}
                  onElegir={(d) => setElegido((prev) => ({ ...prev, [b.cobroId]: d }))}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 3. El cierre: tres números, no una promesa ────────────────────── */}
        <section className="rounded-lg border border-line bg-surface-muted p-3">
          <p className="text-xs text-fg-secondary tabular-nums">
            El acuerdo pide <strong className="text-fg">{m(preview.sumaDelPlan)}</strong>.
          </p>
          <p className="mt-1 text-xs text-fg-secondary tabular-nums">
            Si confirmás sin soltar nada: <strong className="text-fg">{m(preview.sumaSiNoSeLibera)}</strong>
            {Math.abs(preview.sumaSiNoSeLibera - preview.sumaDelPlan) >= 0.01 && (
              <span className="text-amber-600"> — sigue sin cuadrar</span>
            )}
          </p>
          <p className="mt-1 text-xs text-fg-secondary tabular-nums">
            Con lo que elegiste: <strong className="text-fg">{m(sumaElegida)}</strong>
            {cuadra && <span className="text-emerald-600"> ✓</span>}
          </p>
          {sinSalida && (
            <p className="mt-2 text-[11px] text-amber-600">
              ⚠ Esa diferencia de <strong>{m(Math.abs(sumaElegida - preview.sumaDelPlan))}</strong> no
              se cierra desde acá: ninguno de estos cobros se puede soltar. Lo que sí se puede
              regenerar se regenera igual — el resto es una conversación con finanzas sobre plata
              que ya entró.
            </p>
          )}
          {viaSugerida && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-fg-secondary">
              <input
                type="checkbox"
                checked={corregirVia}
                onChange={(e) => setCorregirVia(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Y corregir la vía de cobro de la cuenta: hoy dice{" "}
                <strong className="text-fg">{PLATAFORMA_LABEL[viaCobroDeLaCuenta]}</strong> y elegiste{" "}
                <strong className="text-fg">{PLATAFORMA_LABEL[viaSugerida]}</strong>.
                {cuentaEsInternacional && viaCobroDeLaCuenta === "ODOO" && (
                  <span className="text-amber-600">
                    {" "}Es internacional con Odoo por defecto — probablemente nadie lo eligió.
                  </span>
                )}{" "}
                <span className="text-fg-muted">
                  Cambia dónde se va a buscar la próxima factura de este cliente, no solo estas.
                </span>
              </span>
            </label>
          )}
          {decisiones.length > 0 && (
            <p className="mt-2 text-[11px] text-fg-muted">
              {/* ⛔ Se dice explícitamente. Nexus no escribe en el ERP, y creer que sí es la
                  forma en que una factura se queda emitida para siempre. */}
              ⚠ Esto <strong className="text-fg">no toca el ERP</strong>: quedan{" "}
              {decisiones.length} línea(s) de trabajo para que alguien anule esos documentos allá.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ── Una fila ────────────────────────────────────────────────────────────────────── */

function FilaBloqueada({
  b,
  moneda,
  viaCobroDeLaCuenta,
  cuentaEsInternacional,
  elegido,
  onElegir,
}: {
  b: CobroBloqueado;
  moneda: string;
  viaCobroDeLaCuenta: Plataforma;
  cuentaEsInternacional: boolean;
  elegido?: DecisionElegida;
  onElegir: (d: DecisionElegida | undefined) => void;
}) {
  const m = (n: number) => fmtMonto(n, moneda);
  const [plataforma, setPlataforma] = useState<Plataforma>(viaCobroDeLaCuenta);
  const [motivo, setMotivo] = useState("");

  /* ⚠ `viaCobro` trae ODOO por defecto y 16 cuentas internacionales lo arrastran sin que nadie
     lo haya elegido — Wherex entre ellas, que factura por Mercury. Cuando los dos datos se
     contradicen se muestra el conflicto en vez de elegir en silencio. */
  const plataformaDudosa = cuentaEsInternacional && viaCobroDeLaCuenta === "ODOO";

  /** Sin fecha de emisión no hay documento en ningún lado: la decisión de ERP no aplica. */
  const sinFactura = b.fechaEmision === null;

  const elegir = (decision: DecisionFactura | "SIN_FACTURA" | null) => {
    if (decision === null) return onElegir(undefined);
    if (decision === "SIN_FACTURA") return onElegir({ cobroId: b.cobroId });
    onElegir({ cobroId: b.cobroId, decision, plataforma, motivo: motivo.trim() || undefined });
  };

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium text-fg tabular-nums">#{b.numCuota}</span>
        <span className="text-fg-secondary tabular-nums">
          {b.montoSegunPlan === null
            ? `${m(b.monto)} — el acuerdo ya no pide esta cuota`
            : `${m(b.monto)} → el acuerdo pide ${m(b.montoSegunPlan)}`}
        </span>
        <span className="text-fg-muted">· {BLOQUEO_LABEL[b.motivo]}</span>
        {b.fechaEmision && <span className="text-fg-muted">· facturado {fmtFecha(b.fechaEmision)}</span>}
        {b.tienePromesa && (
          /* Se avisa porque al soltar se cae: una promesa sobre un monto que ya no existe
             estaría callando alertas por una cifra que nadie va a cobrar. */
          <span className="text-amber-600">· tiene promesa de pago (se va a caer)</span>
        )}
      </div>

      {!b.liberable ? (
        <p className="mt-1.5 text-[11px] text-fg-muted">
          {b.motivo === "cobrado"
            ? "La plata entró. Revertir un cobro es otra decisión y se hace desde el cronograma."
            : "Se creó a mano: regenerar no lo iba a tocar igual."}
        </p>
      ) : sinFactura ? (
        /* ⚠⚠ Un cobro puede estar bloqueado SIN factura: salió de PROGRAMADO y nadie marcó
           ninguna. Acá se ofrecían igual «Cancelar la factura» y «Revertir la factura» —
           mandando a anular en el ERP un documento que la fila de arriba acaba de decir que no
           existe, y escribiendo una línea de trabajo imposible de cerrar. Es exactamente el
           defecto que la Fase 4 cerró en el aviso, reintroducido con una escritura detrás.
           Sin factura hay UNA sola cosa que hacer: soltarlo. */
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Opcion activa={!elegido} onClick={() => elegir(null)} label="Dejarlo como está" />
            <Opcion activa={!!elegido} onClick={() => elegir("SIN_FACTURA")} label="Soltarlo" />
          </div>
          <p className="mt-1.5 text-[11px] text-fg-muted">
            No hay factura emitida: soltarlo deja que el motor lo ajuste y{" "}
            <strong className="text-fg">no le pide nada a nadie en el ERP</strong>.
          </p>
        </>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Opcion activa={!elegido} onClick={() => elegir(null)} label="Dejarlo como está" />
            <Opcion
              activa={elegido?.decision === "CANCELAR"}
              onClick={() => elegir("CANCELAR")}
              label="Cancelar la factura"
            />
            <Opcion
              activa={elegido?.decision === "REVERTIR"}
              onClick={() => elegir("REVERTIR")}
              label="Revertir la factura"
            />
          </div>

          {elegido?.decision && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-fg-muted">{QUE_HACE[elegido.decision]}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-fg-muted">
                  ¿Dónde se emitió?{" "}
                  <select
                    value={plataforma}
                    onChange={(e) => {
                      const v = e.target.value as Plataforma;
                      setPlataforma(v);
                      onElegir({ ...elegido, plataforma: v });
                    }}
                    className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] text-fg"
                  >
                    {(Object.keys(PLATAFORMA_LABEL) as Plataforma[]).map((p) => (
                      <option key={p} value={p}>
                        {PLATAFORMA_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    onElegir({ ...elegido, motivo: e.target.value.trim() || undefined });
                  }}
                  placeholder="Motivo (opcional)"
                  className="min-w-48 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-fg"
                />
              </div>
              {plataformaDudosa && (
                <p className="text-[11px] text-amber-600">
                  ⚠ Esta cuenta es internacional pero su vía de cobro dice Odoo — confirmá dónde se emitió de verdad.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Opcion({ activa, onClick, label }: { activa: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
        activa ? "border-brand/40 bg-brand/10 text-brand" : "border-line text-fg-muted hover:bg-surface-hover"
      }`}
    >
      {label}
    </button>
  );
}
