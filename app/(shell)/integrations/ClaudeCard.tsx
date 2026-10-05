/**
 * app/(shell)/integrations/ClaudeCard.tsx — CLAUDE, EN LA PANTALLA DONDE SE MIRAN LAS INTEGRACIONES.
 *
 * Server component: no tiene estado ni handlers, solo pinta lo que la página ya midió.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Nexus usa Claude en ~30 caminos —handoff, kickoff, cronograma, briefs, el asistente— pero en
 * `/integrations` solo se veían HubSpot y Google. La integración más usada del producto era la
 * única invisible, y su gasto vivía en `/integrations/gasto-ia`, una pantalla que había que saber que
 * existía. Desde el 2026-08-23 el detalle vive acá al lado, en `/integrations/gasto-ia`.
 *
 * ⛔ EL GASTO ES PLATA, Y SE TRATA COMO TAL. El detalle está gateado a los roles de
 * costos (`isCostosRole`), y `/integrations` la ve cualquier consultor interno. Así que el número
 * llega en `gasto: null` para quien no tiene ese rol — no oculto por CSS, AUSENTE del payload,
 * igual que hace la pantalla original. Ver la guarda en `lib/ai/gasto-en-integraciones.test.ts`.
 */
import Link from "next/link";
import { formatearUsd } from "@/lib/ai/precios";
import TarjetaDeConexion from "./TarjetaDeConexion";

export interface GastoDeClaude {
  costo30: number;
  llamadas30: number;
  costo7: number;
  llamadas7: number;
  /** Los modelos con más llamadas en los últimos 30 días. */
  modelos: { model: string; llamadas: number }[];
}

interface Props {
  /** `null` cuando quien mira NO tiene el rol de costos. Ver el docblock. */
  gasto: GastoDeClaude | null;
  /** `false` si la tabla del medidor todavía no existe en esta base. */
  medidorListo: boolean;
}

const miles = (n: number) => n.toLocaleString("es-CR");

export default function ClaudeCard({ gasto, medidorListo }: Props) {
  return (
    <TarjetaDeConexion
      nombre="Claude"
      queTrae="Lo que escriben los agentes"
      estado={
        medidorListo
          ? { tono: "ok", texto: "Responde" }
          : { tono: "atencion", texto: "Sin medidor" }
      }
      dato={gasto ? { numero: formatearUsd(gasto.costo30), unidad: "en 30 días" } : null}
      pie={
        gasto
          ? `${miles(gasto.llamadas30)} ${gasto.llamadas30 === 1 ? "llamada" : "llamadas"} · ${formatearUsd(gasto.costo7)} en los últimos 7 días`
          : "El detalle está reservado a los roles de costos"
      }
      accion={
        gasto ? (
          <Link
            href="/integrations/gasto-ia"
            className="text-[13px] font-semibold text-brand hover:text-brand-light"
          >
            Ver el gasto
          </Link>
        ) : undefined
      }
    >
      {/* El medidor es aditivo: puede no existir en una base recién desplegada. Decirlo es lo que
          evita leer un gasto de cero como «no se gastó nada». */}
      {!medidorListo && (
        <p className="text-xs leading-[17px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-3 py-2">
          El medidor de gasto todavía no está en esta base: falta aplicar su migración. Las
          llamadas corren igual, pero no se están registrando.
        </p>
      )}
      {/* ⚠ La misma salvedad que la pantalla de gasto: el medidor no es contabilidad. */}
      {gasto && (
        <p className="text-[11px] leading-4 text-fg-muted">
          Ventana móvil de 30 días. No es contabilidad: se cruza contra la consola de Anthropic,
          no la reemplaza.
        </p>
      )}
    </TarjetaDeConexion>
  );
}
