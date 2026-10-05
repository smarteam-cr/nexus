/**
 * app/(shell)/integrations/OdooCard.tsx — ODOO, EN LA PANTALLA DE INTEGRACIONES.
 *
 * Server component: no tiene estado ni handlers, solo pinta lo que la página ya midió.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Al mudar `/settings/odoo` a `/integrations/odoo`, esa pantalla se quedó SIN entrada desde
 * Integraciones: sus dos únicos enlaces vienen de la mesa de Cobranza. Una pantalla a la que solo
 * se llega desde otra pantalla es una pantalla que la mitad del equipo no sabe que existe — que es
 * exactamente lo que le pasaba al gasto de IA antes de que Claude tuviera su tarjeta acá.
 *
 * ⛔ EL ENLACE AL DETALLE ES PLATA, Y SE TRATA COMO TAL. `/integrations/odoo` corta por
 * `isCostosRole` (SOLO SUPER_ADMIN) con un redirect ANTES de la query, así que el detalle llega en
 * `estado: null` para quien no tiene ese rol — AUSENTE del payload, no oculto por CSS. Es el mismo
 * patrón que `ClaudeCard`, y por el mismo motivo: pintar un enlace que va a rebotar enseña a
 * desconfiar de los enlaces.
 */
import Link from "next/link";
import TarjetaDeConexion, { type EstadoDeConexion } from "./TarjetaDeConexion";

export interface EstadoDeOdoo {
  /**
   * Por qué el sync diario no corre en este servidor, o null si está encendido. Sale de
   * `motivoApagado` (`lib/jobs/requisitos.ts`), la misma regla que usa el job: distingue la
   * contraseña que falta de `ODOO_SYNC_ENABLED=0`, que antes se veían igual.
   */
  motivoApagado: string | null;
  /** Facturas espejadas y vigentes. Es el número que la gente reconoce. */
  facturas: number;
  /** Cuándo terminó la última corrida, ya formateada por la página. */
  ultimaCorrida: string | null;
  /** De las últimas 20 corridas, cuántas fallaron o quedaron colgadas. */
  corridasConProblema: number;
}

interface Props {
  /** `null` cuando quien mira NO tiene el rol de costos. Ver el docblock. */
  estado: EstadoDeOdoo | null;
}

const miles = (n: number) => n.toLocaleString("es-CR");

export default function OdooCard({ estado }: Props) {
  /* Sin rol de costos: la tarjeta existe —saber que Odoo está conectado no es plata— pero sin un
     solo número. Es la misma línea que trazan Claude y Mercury. */
  if (!estado) {
    return (
      <TarjetaDeConexion
        nombre="Odoo"
        queTrae="Las facturas que se cobran"
        estado={{ tono: "ok", texto: "Conectado" }}
        pie="El detalle lo ve un Super Admin"
      />
    );
  }

  const situacion: EstadoDeConexion = estado.motivoApagado
    ? { tono: "apagado", texto: "Apagado" }
    : estado.corridasConProblema > 0
      ? { tono: "atencion", texto: "Con fallos" }
      : { tono: "ok", texto: "Responde" };

  return (
    <TarjetaDeConexion
      nombre="Odoo"
      queTrae="Las facturas que se cobran"
      estado={situacion}
      dato={{
        numero: miles(estado.facturas),
        unidad: estado.facturas === 1 ? "factura vigente" : "facturas vigentes",
      }}
      pie={
        estado.motivoApagado ??
        `Copia diaria · solo lectura${estado.ultimaCorrida ? ` · ${estado.ultimaCorrida}` : ""}`
      }
      accion={
        <Link
          href="/integrations/odoo"
          className="text-[13px] font-semibold text-brand hover:text-brand-light"
        >
          Ver la copia
        </Link>
      }
    >
      {/* Las corridas con problema NO son un número más de una lista: son la única señal de que
          lo que se está mirando en Cobranza puede estar viejo. Por eso suben a aviso. */}
      {estado.corridasConProblema > 0 && (
        <p className="text-xs leading-[17px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-3 py-2">
          {estado.corridasConProblema} de las últimas 20 corridas falló o quedó colgada: puede
          haber facturas que todavía no llegaron.
        </p>
      )}
    </TarjetaDeConexion>
  );
}
