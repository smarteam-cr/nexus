/**
 * app/(shell)/integrations/MercuryCard.tsx — MERCURY, EN LA PANTALLA DE INTEGRACIONES.
 *
 * Server component: no tiene estado ni handlers, solo pinta lo que la página ya midió.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Mercury es el banco: lo que entró de verdad, contra lo que Odoo dice que se facturó. Copia a
 * diario y tiene su propio job (`mercury-espejo-daily`), pero en `/integrations` no aparecía —
 * la única conexión del producto sin tarjeta propia. Se llegaba a ella solo desde Cobranza.
 *
 * ── EL CASO QUE OBLIGÓ A CAMBIAR EL ESTADO DE TODAS ──────────────────────────
 * Medido en producción el 2026-10-05: **0 de 30 clientes emparejados**. Mercury responde, copió
 * sus 30 clientes y sus 76 facturas, la última corrida terminó bien… y no alimenta nada, porque
 * sin el emparejado ningún cobro sabe a qué cuenta de Nexus corresponde un depósito.
 *
 * Con un estado de dos valores («conectado / desconectado») esta tarjeta se vería igual que la de
 * HubSpot. Por eso `TarjetaDeConexion` tiene el tono `atencion`: anda, pero le falta un paso, y el
 * paso se nombra y se enlaza.
 *
 * ⛔ EL DETALLE ES PLATA. `estado: null` cuando quien mira no tiene el rol de costos — ausente
 * del payload, no escondido con CSS. Mismo patrón y mismo motivo que `OdooCard` y `ClaudeCard`.
 */
import Link from "next/link";
import TarjetaDeConexion, { type EstadoDeConexion } from "./TarjetaDeConexion";

export interface EstadoDeMercury {
  /** Por qué el sync diario no corre en este servidor, o null si está encendido. */
  motivoApagado: string | null;
  /** Clientes copiados de Mercury. */
  clientes: number;
  /** De ésos, cuántos tienen una cuenta de Nexus asociada. Lo que decide si sirve de algo. */
  emparejados: number;
  /** Facturas espejadas. */
  facturas: number;
  /** Cuándo terminó la última corrida, ya formateada por la página. */
  ultimaCorrida: string | null;
}

interface Props {
  /** `null` cuando quien mira NO tiene el rol de costos. Ver el docblock. */
  estado: EstadoDeMercury | null;
}

const miles = (n: number) => n.toLocaleString("es-CR");

export default function MercuryCard({ estado }: Props) {
  /* Sin rol de costos: la tarjeta existe —saber que Mercury está conectado no es plata— pero sin
     un solo número. Es la misma línea que ya trazan Odoo y Claude. */
  if (!estado) {
    return (
      <TarjetaDeConexion
        nombre="Mercury"
        queTrae="El banco: lo que entró de verdad"
        estado={{ tono: "ok", texto: "Conectado" }}
        pie="El detalle lo ve quien ve costos"
      />
    );
  }

  const faltanEmparejar = estado.clientes > 0 && estado.emparejados === 0;
  const parcial = estado.emparejados > 0 && estado.emparejados < estado.clientes;

  const situacion: EstadoDeConexion = estado.motivoApagado
    ? { tono: "apagado", texto: "Apagado" }
    : faltanEmparejar
      ? { tono: "atencion", texto: "Sin emparejar" }
      : { tono: "ok", texto: "Responde" };

  return (
    <TarjetaDeConexion
      nombre="Mercury"
      queTrae="El banco: lo que entró de verdad"
      estado={situacion}
      dato={{
        numero: miles(estado.emparejados),
        unidad: `de ${miles(estado.clientes)} ${estado.clientes === 1 ? "cliente emparejado" : "clientes emparejados"}`,
      }}
      avance={
        estado.clientes > 0
          ? {
              pct: (estado.emparejados / estado.clientes) * 100,
              tono: faltanEmparejar || parcial ? "warning" : "brand",
            }
          : null
      }
      pie={
        estado.motivoApagado ??
        `${miles(estado.facturas)} factura${estado.facturas === 1 ? "" : "s"} copiada${estado.facturas === 1 ? "" : "s"}${estado.ultimaCorrida ? ` · ${estado.ultimaCorrida}` : ""}`
      }
      accion={
        <Link
          href="/finanzas/integraciones"
          className="text-[13px] font-semibold text-brand hover:text-brand-light"
        >
          {faltanEmparejar ? "Emparejar clientes" : "Ver el cuadre"}
        </Link>
      }
    >
      {/* El aviso dice lo que NO funciona por esto, no «faltan N»: es la diferencia entre un dato
          y una consecuencia. Sin él, un cero se lee como «todavía no lo usamos». */}
      {faltanEmparejar && (
        <p className="text-xs leading-[17px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-3 py-2">
          Copia todo bien, pero ningún depósito se puede asociar a una cuenta: el cuadre contra
          Odoo no puede usarlo todavía.
        </p>
      )}
    </TarjetaDeConexion>
  );
}
