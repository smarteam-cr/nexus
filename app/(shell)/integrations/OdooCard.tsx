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

export interface EstadoDeOdoo {
  /** Sin `ODOO_PASSWORD` el sync ni siquiera lo intenta: un intento en vano cuenta para el bloqueo por IP. */
  hayPassword: boolean;
  syncEncendido: boolean;
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
  return (
    <section className="rounded-xl bg-surface border border-line p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg mb-1">Odoo</h2>
          <p className="text-xs text-fg-muted">
            El ERP de donde salen las facturas que Nexus muestra al lado de cada cobro. Nexus solo
            lee: nunca escribe en Odoo.
          </p>
        </div>
        {estado && (
          <span
            className={
              estado.syncEncendido
                ? "shrink-0 text-xs font-medium text-success-ink"
                : "shrink-0 text-xs font-medium text-fg-muted"
            }
          >
            {estado.syncEncendido ? "Sincronizando" : "Apagado"}
          </span>
        )}
      </div>

      {estado ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-fg-muted">Facturas espejadas</dt>
              <dd className="text-fg font-semibold">{miles(estado.facturas)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Última corrida</dt>
              <dd className="text-fg font-semibold">{estado.ultimaCorrida ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Con problema (últimas 20)</dt>
              <dd className={estado.corridasConProblema ? "text-danger-ink font-semibold" : "text-fg font-semibold"}>
                {estado.corridasConProblema}
              </dd>
            </div>
          </dl>

          {!estado.hayPassword && (
            <p className="mt-3 text-xs text-danger-ink">
              Falta <code>ODOO_PASSWORD</code> en el servidor: el sync no corre.
            </p>
          )}

          <Link
            href="/integrations/odoo"
            className="mt-4 inline-block text-xs font-medium text-brand hover:underline"
          >
            Ver el estado de la conexión y las últimas corridas →
          </Link>
        </>
      ) : (
        <p className="mt-4 text-xs text-fg-muted">
          El estado de la conexión y el detalle de las corridas los ve un Super Admin.
        </p>
      )}
    </section>
  );
}
