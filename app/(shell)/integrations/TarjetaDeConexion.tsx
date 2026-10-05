/**
 * app/(shell)/integrations/TarjetaDeConexion.tsx — EL ESQUELETO ÚNICO DE UNA CONEXIÓN.
 *
 * ── POR QUÉ EXISTE (rediseño 2026-10-05) ─────────────────────────────────────
 * Las cinco conexiones de Nexus —HubSpot, Google Meet, Claude, Odoo, Mercury— se dibujaban
 * cada una a su manera: una ponía el estado arriba a la derecha y otra adentro del texto, una
 * mostraba su número grande y otra lo escondía en una frase, y los fondos iban de un gris crudo
 * de Tailwind al token de superficie según quién la hubiera escrito. Mirarlas de corrido no
 * permitía comparar nada, que es lo único que se hace en esta pantalla.
 *
 * Acá viven la cabecera (nombre · qué trae · estado), el número grande y el pie. Cada tarjeta
 * aporta lo suyo —sus datos, su gate de permiso, su enlace— y hereda la forma.
 *
 * ── EL ESTADO NO ES UN BOOLEANO, Y MERCURY ES LA PRUEBA ──────────────────────
 * «Conecta / no conecta» no alcanza: Mercury responde perfecto, copia sus 30 clientes y sus 76
 * facturas, y aun así **no alimenta nada** porque ninguno está emparejado con una cuenta de
 * Nexus. Una tarjeta que solo supiera decir «conectado» la pintaría igual que HubSpot. Por eso
 * el tono tiene cuatro valores y `atencion` existe: «anda, pero le falta un paso».
 */
import type { ReactNode } from "react";

export type TonoDeConexion =
  /** Responde y sirve. */
  | "ok"
  /** Responde, pero algo le falta para servir (Mercury sin emparejar). */
  | "atencion"
  /** No responde. */
  | "error"
  /** Apagada a propósito en este servidor, o sin configurar. */
  | "apagado";

export interface EstadoDeConexion {
  tono: TonoDeConexion;
  /** Una o dos palabras: «Responde», «Sin emparejar», «No responde», «Apagado». */
  texto: string;
}

const TONO: Record<TonoDeConexion, { chip: string; punto: string; borde: string }> = {
  ok: {
    chip: "text-success-ink bg-success-surface border-success-line",
    punto: "bg-success",
    borde: "border-line",
  },
  atencion: {
    chip: "text-warn-ink bg-warn-surface border-warn-line",
    punto: "bg-warning",
    borde: "border-warn-line",
  },
  error: {
    chip: "text-danger-ink bg-danger-surface border-danger-line",
    punto: "bg-destructive",
    borde: "border-danger-line",
  },
  apagado: {
    chip: "text-fg-muted bg-surface-muted border-line",
    punto: "bg-fg-muted",
    borde: "border-line",
  },
};

export interface TarjetaDeConexionProps {
  nombre: string;
  /** QUÉ trae esta conexión, en media línea. Es lo que la distingue de las otras cuatro. */
  queTrae: string;
  estado: EstadoDeConexion;
  /**
   * El número que la gente reconoce, grande. `null` cuando quien mira no tiene el rol que lo
   * deja ver — ausente del payload, no escondido con CSS (ver `ClaudeCard` y `OdooCard`).
   */
  dato?: { numero: string; unidad: string } | null;
  /** Barra de avance opcional, para lo que se mide contra un total (emparejados, tope de gasto). */
  avance?: { pct: number; tono?: "brand" | "warning" } | null;
  /** La línea chica del pie: de dónde sale, cuándo fue. */
  pie?: ReactNode;
  /** El enlace o botón de la derecha del pie. */
  accion?: ReactNode;
  /** Lo que la tarjeta quiera agregar entre el número y el pie (avisos, detalle). */
  children?: ReactNode;
}

export default function TarjetaDeConexion({
  nombre,
  queTrae,
  estado,
  dato,
  avance,
  pie,
  accion,
  children,
}: TarjetaDeConexionProps) {
  const t = TONO[estado.tono];
  return (
    <section className={`rounded-xl bg-surface border ${t.borde} p-4 flex flex-col gap-3`}>
      {/* Cabecera: siempre lo mismo y en el mismo orden, en las cinco. */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] leading-5 font-semibold text-fg">{nombre}</h2>
          <p className="text-xs leading-4 text-fg-muted">{queTrae}</p>
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2.5 py-0.5 ${t.chip}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} aria-hidden />
          {estado.texto}
        </span>
      </div>

      {/* El número grande. `null` = quien mira no puede verlo; entonces no se reserva el hueco. */}
      {dato && (
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-bold text-fg tabular-nums">{dato.numero}</span>
          <span className="text-[13px] text-fg-secondary">{dato.unidad}</span>
        </div>
      )}

      {avance && (
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
          <div
            className={`h-full ${avance.tono === "warning" ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${Math.max(2, Math.min(100, avance.pct))}%` }}
          />
        </div>
      )}

      {children}

      {(pie || accion) && (
        <>
          <div className="h-px bg-line" aria-hidden />
          <div className="flex items-center gap-3 flex-wrap">
            {pie && <span className="text-xs text-fg-muted">{pie}</span>}
            {accion && <span className="ml-auto">{accion}</span>}
          </div>
        </>
      )}
    </section>
  );
}
