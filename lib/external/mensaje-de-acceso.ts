/**
 * lib/external/mensaje-de-acceso.ts — el mensaje que el CSE le manda al cliente con su acceso
 * («Copiar mensaje para el cliente», pop-up de acceso, 2026-10-05).
 *
 * Lleva el link y lo que ya está publicado, y NUNCA la contraseña: la regla del acceso es mandarla
 * por otro canal (si el correo se reenvía, el link solo no abre nada). El requerimiento técnico no
 * se nombra: lo abre el desarrollador, que es otro destinatario.
 *
 * El link es el que abre la primera parte publicada: el de siempre si el kickoff está publicado (es
 * a donde lleva sin `?next=`), y si no, el de la primera que lo esté. Sin nada publicado para el
 * cliente no hay mensaje: mandar un link que muestra «no disponible» no sirve.
 *
 * Puro: lo usan la pantalla y su prueba.
 */
import { PUBLISH_SURFACES, type PublishSurfaceKey } from "@/lib/projects/publish-surfaces";

export function linkDeLaParte(urlBase: string, key: PublishSurfaceKey): string {
  const s = PUBLISH_SURFACES.find((x) => x.key === key);
  return s?.next ? `${urlBase}?next=${s.next}` : urlBase;
}

function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * El mensaje listo para pegar, o null si no hay nada publicado para el cliente.
 *
 * Con `foco` (el «Acceso» de un documento, 2026-11-25): el link lleva directo a esa parte y el mensaje dice a cuál; lo
 * demás publicado para el cliente va como «También puedes ver». Sin esa parte publicada no hay mensaje: el link
 * mostraría «no disponible».
 */
export function mensajeParaElCliente(opts: {
  proyecto: string;
  urlBase: string;
  publicadas: ReadonlySet<PublishSurfaceKey>;
  foco?: PublishSurfaceKey;
}): string | null {
  const paraElCliente = PUBLISH_SURFACES.filter((s) => s.key !== "desarrollo" && opts.publicadas.has(s.key));
  const cierre = ["", "Para entrar te va a pedir una contraseña: te la mando por otro medio."];
  if (opts.foco) {
    const enfocada = PUBLISH_SURFACES.find((s) => s.key === opts.foco);
    if (!enfocada || !opts.publicadas.has(enfocada.key)) return null;
    const otras = paraElCliente.filter((s) => s.key !== enfocada.key);
    return [
      "Hola:",
      "",
      `Te comparto el acceso a «${opts.proyecto}»:`,
      linkDeLaParte(opts.urlBase, enfocada.key),
      "",
      `Te lleva directo a: ${enfocada.nombre}.`,
      ...(otras.length ? [`También puedes ver: ${unirConY(otras.map((s) => s.nombre))}.`] : []),
      ...cierre,
    ].join("\n");
  }
  if (!paraElCliente.length) return null;
  const link = linkDeLaParte(opts.urlBase, paraElCliente[0].key);
  const nombres = unirConY(paraElCliente.map((s) => s.nombre));
  return ["Hola:", "", `Te comparto el acceso a «${opts.proyecto}»:`, link, "", `Ya puedes ver: ${nombres}.`, ...cierre].join("\n");
}
