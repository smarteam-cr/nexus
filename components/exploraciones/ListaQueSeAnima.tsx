"use client";

/**
 * Una lista cuyas piezas entran creciendo y salen plegándose en su lugar (La escala, 8 nov, Elías: «la altura sube porque
 * hay más contenido o menos… que no haya ese salto vertical en el scroll»). Lo de debajo baja o sube acompañando, en vez
 * de saltar. La pieza que sale se sigue dibujando (sin cursor) hasta que termina de plegarse.
 *
 * El espacio entre piezas va ADENTRO de cada una (se pliega con ella) y la lista se come el `gap` de su contenedor con un
 * margen negativo: vacía no ocupa lugar y no hay un salto de `gap` al aparecer la primera. `espacio` es ese `gap`.
 * El aspecto vive en app/globals.css (`.nx-plegable`); con «reducir movimiento», aparecen y se van de una.
 */
import { useEffect, useState, type ReactNode } from "react";
import { piezasDeLaVista, vistaAlCambiar, vistaInicial, vistaQuieta, type VistaDeLista } from "@/lib/escala/areas-superpuestas";

/** Lo que dura la animación (app/globals.css › `.nx-plegable`), con un margen. */
const MS_DE_LA_ANIMACION = 400;

const ESPACIO = { 3: ["-mt-3", "pt-3"], 4: ["-mt-4", "pt-4"] } as const;

/** Las piezas a dibujar con su fase (lib/escala/areas-superpuestas.ts › `vistaAlCambiar`, con sus pruebas). */
export function useListaConSalida(ids: readonly string[]): { id: string; fase?: "entra" | "sale" }[] {
  const firma = ids.join("|");
  const [vista, setVista] = useState<{ firma: string; v: VistaDeLista }>(() => ({ firma, v: vistaInicial(ids) }));
  if (vista.firma !== firma) setVista({ firma, v: vistaAlCambiar(vista.v, ids) });
  const { cambio } = vista.v;
  useEffect(() => {
    if (!cambio.entran.length && !cambio.salen.length) return;
    const t = window.setTimeout(() => setVista((x) => ({ firma: x.firma, v: vistaQuieta(x.v) })), MS_DE_LA_ANIMACION);
    return () => window.clearTimeout(t);
  }, [cambio]);
  return piezasDeLaVista(vista.v);
}

export default function ListaQueSeAnima({
  ids,
  espacio,
  etiqueta,
  children: pieza,
}: {
  ids: readonly string[];
  /** El `gap` del contenedor (en la escala de Tailwind): la lista lo pone adentro de cada pieza. */
  espacio: keyof typeof ESPACIO;
  /** Con ella, la lista es una sección con nombre. */
  etiqueta?: string;
  children: (id: string) => ReactNode;
}) {
  const lista = useListaConSalida(ids);
  const [afuera, adentro] = ESPACIO[espacio];
  const piezas = lista.map(({ id, fase }) => (
    <div key={id} className="nx-plegable" data-fase={fase} inert={fase === "sale"}>
      <div className="nx-plegable-adentro">
        <div className={adentro}>{pieza(id)}</div>
      </div>
    </div>
  ));
  return etiqueta ? (
    <section aria-label={lista.length ? etiqueta : undefined} className={afuera}>
      {piezas}
    </section>
  ) : (
    <div className={afuera}>{piezas}</div>
  );
}
