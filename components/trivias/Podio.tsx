/**
 * components/trivias/Podio.tsx — los tres primeros de una partida, en columnas de distinta altura (2.º · 1.º · 3.º).
 *
 * Sin hooks ni "use client": lo pintan la consola del anfitrión (cliente) y el resultado de la partida (servidor).
 * Los colores (oro, plata, bronce) son DE LA TRIVIA y van con `style`, como las fichas de las opciones: no flipean con
 * el tema. Cada columna dice además su lugar con número, así el color nunca es la única pista.
 *
 * En la lista el orden es el real (1.º, 2.º, 3.º) para quien lee con lector de pantalla; el orden visual lo pone CSS.
 * Dos con los mismos puntos comparten el lugar (lib/trivias/reglas.ts › calcularPosiciones): la altura y el color salen
 * del LUGAR, no de la posición en la lista, así un empate en el primero se ve como dos columnas de oro.
 */
import { cn } from "@/lib/cn";
import { COLORES_DEL_PODIO } from "@/lib/trivias/colores";
import { formatearPuntos } from "@/lib/trivias/formato";
import { podioDe } from "@/lib/trivias/reglas";
import type { Posicion } from "@/lib/trivias/tipos";

/** Dónde va cada lugar en la fila: el primero al centro, el segundo a la izquierda, el tercero a la derecha. */
const ORDEN_VISUAL = ["order-2", "order-1", "order-3"] as const;

const ALTO = {
  escenario: ["h-44 md:h-60", "h-32 md:h-44", "h-24 md:h-32"],
  normal: ["h-32", "h-24", "h-16"],
} as const;

export function Podio({
  posiciones,
  tamano = "normal",
  className,
}: {
  /** Las posiciones en orden; entran los tres primeros lugares (con sus empates). */
  posiciones: Posicion[];
  /** `escenario`: la pantalla que se proyecta; `normal`: el resultado de la partida. */
  tamano?: "escenario" | "normal";
  className?: string;
}) {
  // Los 3 primeros LUGARES que sumaron algo: con empate entran todos los empatados (lib/trivias/reglas.ts › podioDe).
  const tres = podioDe(posiciones);
  if (tres.length === 0) return null;
  const grande = tamano === "escenario";
  return (
    <ol aria-label="Podio" className={cn("flex items-end justify-center gap-3", grande ? "md:gap-6" : "sm:gap-4", className)}>
      {tres.map((p, i) => {
        // El lugar va de 1 a 3 entre los tres primeros (con empate puede repetirse, nunca pasarse).
        const puesto = Math.min(Math.max(p.lugar, 1), 3) - 1;
        const color = COLORES_DEL_PODIO[puesto];
        return (
          <li
            key={p.jugadorId}
            className={cn(
              "flex min-w-0 flex-col items-center",
              tres.length <= 3 && ORDEN_VISUAL[i],
              grande ? "w-32 sm:w-40 md:w-56" : "w-24 sm:w-36",
            )}
            aria-label={`${p.lugar}.º lugar: ${p.nombre}, ${formatearPuntos(p.puntos)} puntos`}
          >
            <span
              className={cn(
                "w-full truncate text-center font-semibold text-fg",
                grande ? "text-xl md:text-3xl" : "text-sm sm:text-base",
              )}
              title={p.nombre}
            >
              {p.nombre}
            </span>
            <span
              className={cn(
                "mb-2 tabular-nums text-fg-secondary",
                grande ? "text-lg md:text-2xl" : "text-xs sm:text-sm",
              )}
            >
              {formatearPuntos(p.puntos)} puntos
            </span>
            <div
              className={cn(
                "flex w-full items-start justify-center rounded-t-xl pt-3 shadow-sm",
                ALTO[tamano][puesto],
              )}
              style={{ background: color.fondo, color: color.texto }}
              aria-hidden="true"
            >
              <span className={cn("font-bold tabular-nums leading-none", grande ? "text-5xl md:text-7xl" : "text-3xl")}>
                {puesto + 1}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
