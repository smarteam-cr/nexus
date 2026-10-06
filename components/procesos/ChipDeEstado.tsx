/**
 * components/procesos/ChipDeEstado.tsx — EN QUÉ ESTADO ESTÁ UN MAPA.
 *
 * El borrador es del agente: va en azul, con la chispa. Revisado y validado ya son de una persona y
 * van en gris: confirmar no pinta de verde.
 */
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_ESTADO, type EstadoDelMapa } from "@/lib/procesos/mapa";

export function ChipDeEstado({ estado }: { estado: EstadoDelMapa }) {
  const delAgente = estado === "borrador";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        delAgente ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary",
      )}
    >
      {delAgente && <IconoDeSugerencia className="h-3 w-3" />}
      {ETIQUETA_DE_ESTADO[estado]}
    </span>
  );
}
