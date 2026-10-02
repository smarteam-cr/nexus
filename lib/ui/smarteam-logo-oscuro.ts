/**
 * lib/ui/smarteam-logo-oscuro.ts — el logo de Smarteam para FONDO OSCURO.
 *
 * ⚠ Por qué existe (2026-10-02, pedido de Elías): el hero de todo documento del motor de
 * landing (propuestas, kickoff, entrega, requerimiento técnico, sus PDF) va sobre navy, y los
 * logos de esa fila se aplastan a blanco con `filter: brightness(0) invert(1)`. Con el logo de
 * Smarteam eso lo DEFORMABA: el isotipo son dos píldoras con su círculo, y lo único que separa
 * el círculo de la píldora es el CAMBIO DE COLOR. Aplastado a blanco, el círculo desaparece y
 * quedan dos barras planas — un logo que no es el de la marca.
 *
 * La versión blanca oficial dibuja esa separación con un corte real, así que se ve igual de
 * bien sin filtro. Es un archivo fijo de la marca (no se sube por cliente ni cambia seguido):
 * por eso vive en `public/` y no en la config global — sin SQL y sin depender de que alguien
 * suba la versión correcta.
 *
 * Sin dependencias: lo importan componentes de cliente.
 */
export const SMARTEAM_LOGO_FONDO_OSCURO = "/logo-smarteam-blanco.png";
