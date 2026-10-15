/**
 * components/siguiente-paso/LineaDelPaso.tsx — el siguiente paso en una línea: «Siguiente paso: Enviar la propuesta ·
 * 20 oct · Andrés». Ámbar si la fecha pasó. Sin paso, la sugerencia de HubSpot (`hs_next_step`) en gris, si la hay.
 */
import { cn } from "@/lib/cn";
import { fechaCorta } from "@/lib/ventas/negocios";
import { estaVencido, NOMBRE_DEL_EQUIPO, type SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";

export function LineaDelPaso({
  paso,
  hoyISO,
  sugerencia,
  conEquipo = false,
  className,
}: {
  paso: SiguientePasoVisto | null;
  hoyISO: string;
  /** `hs_next_step` del negocio: se muestra solo si no hay paso. */
  sugerencia?: string | null;
  /** Antepone el equipo («Ventas: …»), para cuando se ven varios juntos. */
  conEquipo?: boolean;
  className?: string;
}) {
  if (!paso) {
    if (!sugerencia?.trim()) return null;
    return (
      <div className={cn("line-clamp-1 text-xs text-fg-muted", className)} title={sugerencia}>
        En HubSpot dice: {sugerencia.trim()}
      </div>
    );
  }
  const vencido = estaVencido(paso, hoyISO);
  const quien = paso.responsableNombre?.split(" ")[0] ?? paso.responsableEmail?.split("@")[0] ?? null;
  return (
    <div className={cn("line-clamp-1 text-xs text-fg-secondary", className)} title={paso.que}>
      <span className="text-fg-muted">{conEquipo ? `${NOMBRE_DEL_EQUIPO[paso.equipo]}: ` : "Siguiente paso: "}</span>
      {paso.que}
      {paso.fecha && <span className={vencido ? "text-warn-ink" : "text-fg-muted"}>{vencido ? ` · venció el ${fechaCorta(paso.fecha)}` : ` · ${fechaCorta(paso.fecha)}`}</span>}
      {quien && <span className="text-fg-muted"> · {quien}</span>}
      {paso.hubspotEstado === "error" && <span className="text-warn-ink"> · sin escribir en HubSpot</span>}
    </div>
  );
}
