/**
 * components/casos-de-uso/piezas.tsx — las piezas chicas del catálogo de casos de uso: el punto de un nivel, el chip
 * de una herramienta y el salto de nivel de un área. Solo presentación.
 *
 * El color del nivel es el de la escala (`--color-nivel-*`) y va siempre con su nombre. Las herramientas llevan
 * el color de su marca en un punto, nunca de fondo: HubSpot su naranja, Insider fucsia y Smarteam celeste.
 */
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Herramienta } from "@/lib/casos-de-uso/catalogo";
import { NOMBRE_DE_LA_HERRAMIENTA } from "@/lib/casos-de-uso/vista";
import type { Letra } from "@/lib/escala/documento/tipos";

export const PUNTO_DE_HERRAMIENTA: Record<Herramienta, string> = {
  hubspot: "bg-isotipo-hubspot",
  insider: "bg-herramienta-fucsia",
  smarteam: "bg-herramienta-celeste",
};

export function PuntoDeNivel({ letra, className }: { letra: Letra; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 flex-none rounded-full", PUNTO_DE_NIVEL[letra], className)} />;
}

export function ChipDeHerramienta({ herramienta, grande, nombre }: { herramienta: Herramienta; grande?: boolean; nombre?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full border border-line bg-surface font-medium text-fg-secondary",
        grande ? "px-[9px] py-px text-xs" : "px-2 py-px text-[11px]",
      )}
    >
      <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", PUNTO_DE_HERRAMIENTA[herramienta])} />
      {nombre ?? NOMBRE_DE_LA_HERRAMIENTA[herramienta]}
    </span>
  );
}

/** «● Funcional → ● Óptimo». La llegada va más fuerte: es lo que el cliente consigue. */
export function Salto({
  desde,
  hasta,
  nombre,
  className,
}: {
  desde: Letra;
  hasta: Letra;
  nombre: (l: Letra) => string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="inline-flex items-center gap-[5px] text-fg-secondary">
        <PuntoDeNivel letra={desde} />
        {nombre(desde)}
      </span>
      <span aria-hidden="true" className="text-fg-muted">
        →
      </span>
      <span className="inline-flex items-center gap-[5px] font-medium text-fg">
        <PuntoDeNivel letra={hasta} />
        {nombre(hasta)}
      </span>
    </span>
  );
}
