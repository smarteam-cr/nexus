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

/** El mensaje listo para pegar, o null si no hay nada publicado para el cliente. */
export function mensajeParaElCliente(opts: {
  proyecto: string;
  urlBase: string;
  publicadas: ReadonlySet<PublishSurfaceKey>;
}): string | null {
  const paraElCliente = PUBLISH_SURFACES.filter((s) => s.key !== "desarrollo" && opts.publicadas.has(s.key));
  if (!paraElCliente.length) return null;
  const link = linkDeLaParte(opts.urlBase, paraElCliente[0].key);
  const nombres = unirConY(paraElCliente.map((s) => s.nombre));
  return [
    "Hola:",
    "",
    `Te comparto el acceso a «${opts.proyecto}»:`,
    link,
    "",
    `Ya puedes ver: ${nombres}.`,
    "",
    "Para entrar te va a pedir una contraseña: te la mando por otro medio.",
  ].join("\n");
}
