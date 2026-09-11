"use client";

/**
 * components/documentacion/MoverPaginaDialog.tsx — «Mover a…».
 *
 * Es la forma de ANIDAR una página dentro de otra. Arrastrar solo reordena entre hermanas: las
 * zonas de drop por profundidad son la parte cara (y la que más se equivoca) de un árbol
 * arrastrable, y esto resuelve lo mismo, con teclado y sin ambigüedad.
 *
 * La página que se mueve y toda su rama salen deshabilitadas: meter algo adentro de sí mismo es
 * justo lo que el servidor rechaza, así que acá ni se ofrece. Las bloqueadas tampoco reciben
 * hijas, por la misma razón que no se editan.
 */
import { Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ramaDe } from "@/lib/documentacion/arbol";
import type { NodoDelArbol } from "@/lib/documentacion/tipos";

interface Props {
  /** La página que se mueve. `null` = el diálogo está cerrado. */
  nodo: NodoDelArbol | null;
  arbol: NodoDelArbol[];
  onCerrar: () => void;
  onElegir: (parentId: string | null) => void;
}

function aplanar(
  nodos: NodoDelArbol[],
  profundidad = 0,
): { nodo: NodoDelArbol; profundidad: number }[] {
  return nodos.flatMap((n) => [{ nodo: n, profundidad }, ...aplanar(n.hijas, profundidad + 1)]);
}

export default function MoverPaginaDialog({ nodo, arbol, onCerrar, onElegir }: Props) {
  if (!nodo) return null;

  const plano = aplanar(arbol);
  const prohibidos = new Set(
    ramaDe(
      nodo.id,
      plano.map((p) => ({ id: p.nodo.id, parentId: p.nodo.parentId })),
    ),
  );

  const fila =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <Modal
      open
      onClose={onCerrar}
      title={`Mover «${nodo.titulo}»`}
      description="Elegí dónde va a quedar."
      size="md"
    >
      <ul className="max-h-80 overflow-y-auto">
        <li>
          <button type="button" className={cn(fila, "font-medium text-fg")} onClick={() => onElegir(null)}>
            <span aria-hidden="true">🗂️</span> Nivel más alto
          </button>
        </li>
        {plano.map(({ nodo: n, profundidad }) => (
          <li key={n.id}>
            <button
              type="button"
              className={fila}
              style={{ paddingLeft: 8 + profundidad * 14 }}
              disabled={prohibidos.has(n.id) || n.bloqueada}
              title={
                prohibidos.has(n.id)
                  ? "Es la página que estás moviendo, o una de sus subpáginas."
                  : n.bloqueada
                    ? "Está bloqueada: no recibe subpáginas."
                    : undefined
              }
              onClick={() => onElegir(n.id)}
            >
              <span aria-hidden="true">{n.icono ?? "📄"}</span>
              <span className="truncate">{n.titulo}</span>
              {n.bloqueada && <span className="text-2xs text-fg-muted">🔒</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
