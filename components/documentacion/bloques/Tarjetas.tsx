"use client";

/**
 * components/documentacion/bloques/Tarjetas.tsx — la rejilla de tarjetas y cada tarjeta.
 *
 * Son DOS bloques que trabajan de a pares, como una lista y sus ítems:
 *   · «tarjetas» — la rejilla. No tiene texto propio: acomoda a sus hijas en una, dos o tres
 *     columnas. Es un contenedor, igual que un desplegable.
 *   · «tarjeta»  — el título va en la línea del bloque y el cuerpo son sus hijos.
 *
 * ⚠ La CAJA de la tarjeta (borde, fondo, aire) NO se pinta acá: se pinta en `editor.css` sobre el
 * contenedor que arma BlockNote. El motivo es estructural — los hijos de un bloque se dibujan
 * FUERA del elemento que devuelve este render, así que un borde puesto acá dejaría el cuerpo de la
 * tarjeta afuera del recuadro. Lo mismo vale para la rejilla.
 *
 * Los specs se crean a nivel de MÓDULO (regla `react-hooks/static-components`).
 */
import { createReactBlockSpec } from "@blocknote/react";
import { COLUMNAS_DE_TARJETAS, type ColumnasDeTarjetas } from "@/lib/documentacion/tipos";

/** Cómo se nombra cada ancho en el menú «/». */
export const ETIQUETAS_DE_COLUMNAS: Record<ColumnasDeTarjetas, string> = {
  "1": "Tarjetas · una columna",
  "2": "Tarjetas · dos columnas",
  "3": "Tarjetas · tres columnas",
};

export const bloqueTarjetas = createReactBlockSpec(
  {
    type: "tarjetas",
    propSchema: {
      columnas: { default: "2", values: [...COLUMNAS_DE_TARJETAS] },
    },
    content: "none",
  },
  {
    /* Sin rótulo, ni en edición: la rejilla se reconoce por sus tarjetas. El rótulo que tuvo
       («Tarjetas · dos columnas») era ruido en una rejilla llena y lo ÚNICO visible en una vacía
       —una rejilla que quedó sin tarjetas al borrarlas—, que es justo la que no debería existir.
       Esa la quita el editor apenas se vacía, y el servidor al cargar la página. El atributo es
       lo que lee el CSS para saber cuántas columnas van. */
    render: ({ block }) => {
      const columnas = (block.props.columnas as ColumnasDeTarjetas) ?? "2";
      return <div data-columnas={columnas} />;
    },
  },
);

export const bloqueTarjeta = createReactBlockSpec(
  {
    type: "tarjeta",
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ contentRef }) => (
      <p className="text-sm font-semibold leading-6 text-fg" ref={contentRef} />
    ),
  },
);
