/**
 * components/procesos/MiniMapa.tsx — EL MAPA EN MINIATURA DE LA TARJETA DE UN PROCESO.
 *
 * Una franja por carril (gris si es un sistema) y un punto por paso en su columna: se ve de un
 * vistazo cuántos responsables hay, dónde están los dolores (punto ámbar) y qué completó el agente o
 * propuso Smarteam (punto ámbar hueco). Sale del mismo acomodo que el mapa grande.
 */
import { cn } from "@/lib/cn";
import { acomodarPorCarriles } from "@/lib/procesos/layout";
import type { VersionDelMapa } from "@/lib/procesos/mapa";

const ANCHO = 260;
const FILA = 11;

export default function MiniMapa({ version, conDolor, etiqueta }: { version: VersionDelMapa; conDolor: boolean; etiqueta: string }) {
  const acomodo = acomodarPorCarriles(version, { conDolor: false });
  const columnas = acomodo.ultimaColumna;
  const paso = columnas > 0 ? (ANCHO - 12) / columnas : 0;
  const filaDe = new Map(acomodo.bandas.map((b, i) => [b.carril.id, i]));
  return (
    <div
      role="img"
      aria-label={etiqueta}
      className="relative max-w-full border-t border-line"
      style={{ width: ANCHO, height: Math.max(1, acomodo.bandas.length) * FILA }}
    >
      {acomodo.bandas.map((b, i) => (
        <div
          key={b.carril.id}
          className={cn("absolute inset-x-0 border-b border-line", b.carril.tipo === "sistema" && "bg-surface-hover")}
          style={{ top: i * FILA, height: FILA }}
        />
      ))}
      {version.pasos.map((p) => {
        const dudoso = p.origen === "supuesto" || p.origen === "propuesto";
        const dolor = conDolor && !!p.dolor;
        return (
          <span
            key={p.id}
            className={cn(
              "absolute h-[7px] w-[7px] rounded-full",
              dudoso ? "border-[1.5px] border-warning bg-surface" : dolor ? "bg-warning" : "bg-fg-muted",
            )}
            style={{ left: Math.round(2 + (acomodo.columna[p.id] ?? 0) * paso), top: (filaDe.get(p.carril) ?? 0) * FILA + 2 }}
          />
        );
      })}
    </div>
  );
}
