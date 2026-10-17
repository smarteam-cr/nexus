/**
 * lib/nexus-chat/textos.ts — lo que dice el chat de Nexus además de lo que contesta el modelo. PURO.
 */
import { MARCA_DE_ACUERDO, MARCA_DE_DESENLACE } from "@/lib/asistente/acuerdo";
import { TOPES_DEL_CHAT, usd } from "./constantes";

/**
 * ⛔ Los marcadores del acuerdo y del desenlace no pueden venir de la persona ni quedar sueltos en lo que contestó el
 * modelo: un «<<<ACUERDO>>>{…}» pegado en el mensaje se leería como una lista de verdad.
 */
export function sinMarcadores(texto: string): string {
  return texto.split(MARCA_DE_ACUERDO).join("").split(MARCA_DE_DESENLACE).join("");
}

export type MotivoDelTope = "mensajes" | "dolares";

/** ¿Puede mandar otro mensaje hoy? Mensajes y dólares de hoy, en TODAS sus cuentas. */
export function decidirTope(hoy: { mensajes: number; usd: number }): MotivoDelTope | null {
  if (hoy.mensajes >= TOPES_DEL_CHAT.mensajesPorDia) return "mensajes";
  if (hoy.usd >= TOPES_DEL_CHAT.usdPorDia) return "dolares";
  return null;
}

export function textoDelTope(m: MotivoDelTope): string {
  return m === "mensajes"
    ? `Llegaste a los ${TOPES_DEL_CHAT.mensajesPorDia} mensajes de hoy con el chat de Nexus. Mañana sigues; mientras tanto, la ficha y Tareas funcionan igual.`
    : `El chat de Nexus ya gastó ${usd(TOPES_DEL_CHAT.usdPorDia)} hoy con tus mensajes. Mañana sigues; mientras tanto, la ficha y Tareas funcionan igual.`;
}

/** Lo que va debajo del título del cajón: cuánto lleva esta conversación y cuánto queda hoy. */
export function lineaDeUso(u: { hilo: number; hoyUsd: number; hoyMensajes: number }): string {
  const quedan = Math.max(0, TOPES_DEL_CHAT.mensajesPorDia - u.hoyMensajes);
  return `esta conversación: ${usd(u.hilo)} · te quedan ${quedan} mensajes hoy`;
}

/** Lo que no se pudo proponer, dicho al pie de la respuesta. */
export function avisoDeRechazos(rechazados: ReadonlyArray<{ motivo: string }>): string {
  const motivos = [...new Set(rechazados.map((r) => r.motivo))].slice(0, 3);
  return motivos.length ? `⚠ No quedó en la lista: ${motivos.join(" · ")}` : "";
}

/** El desenlace que escribe el SERVIDOR al aplicar. El modelo lo relee en el turno siguiente. */
export function textoDelDesenlace(r: { aplicadas: readonly string[]; fallo: { linea: string; motivo: string } | null; sinIntentar: number; desmarcadas: number }): string {
  const lineas: string[] = [];
  if (r.aplicadas.length) lineas.push(`✅ Se aplicó: ${r.aplicadas.join(" · ")}.`);
  if (r.fallo) lineas.push(`⚠ No se aplicó «${r.fallo.linea}»: ${r.fallo.motivo}.`);
  if (r.sinIntentar) lineas.push(`${r.sinIntentar === 1 ? "Un cambio no se intentó" : `${r.sinIntentar} cambios no se intentaron`} después de ese: pídemelos de nuevo si siguen.`);
  if (r.desmarcadas) lineas.push(`${r.desmarcadas === 1 ? "Uno quedó afuera" : `${r.desmarcadas} quedaron afuera`} porque los desmarcaste.`);
  return lineas.join("\n");
}

/** El botón de la lista: «Aplicar 3 cambios». */
export function textoDelBoton(marcados: number): string {
  return marcados === 1 ? "Aplicar el cambio" : `Aplicar ${marcados} cambios`;
}

/** Para el cajón: de qué se habla y los ejemplos del estado vacío. */
export function avisoDelChat(nombreDeLaCuenta: string, uso: string | null) {
  return {
    variante: "sin-propuesta" as const,
    subtitulo: `Sobre ${nombreDeLaCuenta}${uso ? ` · ${uso}` : ""}`,
    aviso: "Lee lo que Nexus sabe de esta cuenta. Lo que propone queda en una lista: nada se cambia hasta que lo apliques.",
    placeholder: "Pregúntale algo o cuéntale lo que pasó…",
    tono: "neutro" as const,
    bienvenida: null,
    ejemplos: [
      "¿Qué quedó pendiente de la última reunión?",
      "Por WhatsApp hoy me dijeron que mandan la base de contactos el lunes",
      "¿Qué se dijo del pipeline de ventas?",
      "Escríbeme un WhatsApp para recordarles lo que nos deben",
    ],
  };
}
