/**
 * components/documentacion/layout.ts — el inset del contenido de una página.
 *
 * BlockNote reserva 54 px a la IZQUIERDA del texto para la manija de arrastre y el «+» (su
 * `padding-inline`, que `editor.css` conserva). Todo lo que acompaña al contenido —las migas, el
 * ícono, el título, las subpáginas, «Enlazan acá»— tiene que arrancar en la MISMA línea, o la
 * página se ve corrida: el título a la izquierda y el texto más adentro.
 *
 * Vive acá, y no repetido en cada componente, porque es un número que tiene que cambiar en un
 * solo lugar el día que el editor cambie su margen.
 */
export const INSET_CONTENIDO = "pl-[54px]";
