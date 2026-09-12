"use client";

/**
 * components/documentacion/bloques/Mencion.tsx — el enlace a otra página, escrito con «@».
 *
 * Es la pieza que convierte páginas sueltas en una BASE: se escribe «@» y el nombre, y queda un
 * enlace vivo a la otra página. Al pie de cada página se listan las que la nombran, así el
 * recorrido funciona en los dos sentidos.
 *
 * ── LO QUE GUARDA, Y POR QUÉ ─────────────────────────────────────────────────
 * Guarda el ID de la página. El título y el ícono que se ven se resuelven al pintar, contra el
 * índice que baja del servidor (`ContextoDePaginas`). Guardar el título habría sido más simple y
 * está mal: renombrar una página dejaría el nombre viejo escrito en todas las que la nombran, sin
 * error y sin forma de enterarse. El título guardado queda igual, pero solo como respaldo para
 * cuando la página enlazada ya no está.
 *
 * ⚠ El pintado va en un COMPONENTE de verdad y no en el cuerpo de `render`: usa hooks, y React
 * solo los reconoce dentro de una función que sea un componente (lo exige `rules-of-hooks`).
 */
import { useRouter } from "next/navigation";
import { createReactInlineContentSpec } from "@blocknote/react";
import { usePaginasEnlazables } from "../ContextoDePaginas";

function PaginaEnlazada({
  paginaId,
  slug,
  titulo,
  icono,
}: {
  paginaId: string;
  slug: string;
  titulo: string;
  icono: string;
}) {
  const router = useRouter();
  const { porId } = usePaginasEnlazables();
  const viva = porId.get(paginaId);

  const tituloVisible = viva?.titulo ?? titulo;
  const iconoVisible = viva?.icono ?? (icono || null);
  const destino = viva?.slug ?? slug;

  if (!destino) {
    return (
      <span
        className="rounded px-1 text-fg-muted line-through"
        title="Esta página ya no está en la base."
      >
        {tituloVisible || "página"}
      </span>
    );
  }

  return (
    <a
      href={`/documentacion/${destino}`}
      title={`Ir a «${tituloVisible}»`}
      /* El `-mx-0.5` compensa el padding: sin eso queda un hueco antes del punto que sigue. */
      className="-mx-1 inline-flex items-baseline gap-1 rounded px-1 text-fg underline decoration-line decoration-dotted underline-offset-2 transition-colors hover:bg-surface-hover hover:decoration-fg-muted"
      /* Dentro del editor, el clic por defecto coloca el cursor en vez de navegar. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        router.push(`/documentacion/${destino}`);
      }}
    >
      <span aria-hidden="true">{iconoVisible ?? "📄"}</span>
      {tituloVisible}
    </a>
  );
}

export const mencionDePagina = createReactInlineContentSpec(
  {
    type: "mencion",
    propSchema: {
      paginaId: { default: "" },
      /** Respaldo para cuando la página enlazada ya no está en el índice. */
      slug: { default: "" },
      titulo: { default: "" },
      icono: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const { paginaId, slug, titulo, icono } = inlineContent.props;
      return <PaginaEnlazada paginaId={paginaId} slug={slug} titulo={titulo} icono={icono} />;
    },
  },
);
