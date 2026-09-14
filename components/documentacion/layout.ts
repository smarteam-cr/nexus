/**
 * components/documentacion/layout.ts — el ancho y el inset del contenido de una página.
 *
 * BlockNote reserva 54 px a la IZQUIERDA del texto para la manija de arrastre y el «+». Esos
 * controles no se ven hasta pasar el mouse, así que un margen de un solo lado corre la página a la
 * derecha: se ve descentrada. Por eso `editor.css` repite el mismo margen a la DERECHA, y todo lo
 * que acompaña al contenido —las migas, el ícono, el título, las subpáginas, «Enlazan acá»— lleva
 * el mismo inset de los dos lados: arranca y termina en la misma línea que el texto.
 *
 * Vive acá, y no repetido en cada componente, porque es un número que tiene que cambiar en un
 * solo lugar el día que el editor cambie su margen (junto con `editor.css`).
 */
export const INSET_CONTENIDO = "px-[54px]";

/**
 * La columna de la página, centrada. Son 48rem de texto como antes más los dos márgenes de 54 px:
 * sumar el de la derecha no le quita ancho a lo que se lee. La usan `page.tsx` y `loading.tsx`,
 * para que la página no salte al terminar de cargar.
 */
export const COLUMNA_DE_PAGINA = "mx-auto w-full max-w-[calc(48rem+54px)]";
