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

/**
 * Cómo se dice lo aplicado de cada operación, en singular y en plural («4 preguntas en la guía»). Una operación nueva
 * que no esté acá se cuenta como «cambio».
 */
const LO_APLICADO: Readonly<Record<string, readonly [string, string]>> = {
  "guia.pregunta.agregar": ["pregunta en la guía", "preguntas en la guía"],
  "guia.pregunta.cambiar": ["pregunta cambiada", "preguntas cambiadas"],
  "guia.pregunta.quitar": ["pregunta quitada", "preguntas quitadas"],
  "guia.repregunta.cambiar": ["repregunta cambiada", "repreguntas cambiadas"],
  "tarea.crear": ["tarea creada", "tareas creadas"],
  "tarea.cambiar-estado": ["tarea actualizada", "tareas actualizadas"],
  "tarea.mover-semana": ["tarea actualizada", "tareas actualizadas"],
  "nota.crear": ["nota en la cuenta", "notas en la cuenta"],
  "siguiente-paso.fijar": ["siguiente paso fijado", "siguientes pasos fijados"],
  "documento.generar": ["documento generándose", "documentos generándose"],
};

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Lo aplicado en pocas palabras, agrupado por clase y en el orden en que aparece: «4 preguntas en la guía y 1 nota en la cuenta». */
export function resumenDeLoAplicado(nombres: readonly string[]): string {
  const cuentas = new Map<string, { n: number; formas: readonly [string, string] }>();
  for (const nombre of nombres) {
    const formas = LO_APLICADO[nombre] ?? (["cambio", "cambios"] as const);
    const c = cuentas.get(formas[1]) ?? { n: 0, formas };
    c.n++;
    cuentas.set(formas[1], c);
  }
  return enLista([...cuentas.values()].map((c) => `${c.n} ${c.n === 1 ? c.formas[0] : c.formas[1]}`));
}

/**
 * El desenlace que escribe el SERVIDOR al aplicar: UNA línea («Listo: 4 preguntas en la guía.»), sin repetir cada cambio
 * (validación 104: la lista ya los mostró). Lo que falló o no se intentó se dice aparte. El modelo relee lo que se
 * propuso por la ventana del hilo (turno-server.ts › `ventanaDelHilo`), así que no le hace falta el detalle acá.
 */
export function textoDelDesenlace(r: { /** Los nombres de las operaciones aplicadas, en orden. */ aplicadas: readonly string[]; fallo: { linea: string; motivo: string } | null; sinIntentar: number }): string {
  const lineas: string[] = [];
  if (r.aplicadas.length) lineas.push(`Listo: ${resumenDeLoAplicado(r.aplicadas)}.`);
  if (r.fallo) lineas.push(`⚠ No se aplicó «${r.fallo.linea}»: ${r.fallo.motivo}.`);
  if (r.sinIntentar) lineas.push(`${r.sinIntentar === 1 ? "Un cambio no se intentó" : `${r.sinIntentar} cambios no se intentaron`} después de ese: pídemelos de nuevo si siguen.`);
  return lineas.join("\n");
}

/** Lo que dice el turno cuando el modelo solo propuso y no escribió nada: la lista es la respuesta. */
export function lineaDeLaLista(cambios: number): string {
  return cambios === 1 ? "Te dejé el cambio en la lista." : `Te dejé ${cambios} cambios en la lista.`;
}

/** El botón de la lista: «Aplicar 3 cambios». */
export function textoDelBoton(marcados: number): string {
  return marcados === 1 ? "Aplicar el cambio" : `Aplicar ${marcados} cambios`;
}

/** El título de la caja de la lista: «4 cambios para aplicar». */
export function tituloDeLaLista(cambios: number): string {
  return cambios === 1 ? "1 cambio para aplicar" : `${cambios} cambios para aplicar`;
}

/** Los ejemplos del estado vacío cuando la persona abrió el chat desde la guía de una sesión. */
export const EJEMPLOS_DE_LA_GUIA = [
  "¿Qué otras preguntas agregarías?",
  "Mejora las repreguntas de la 2 para que bajen a números",
  "Haz más cortas las preguntas",
  "Agrega una pregunta sobre el presupuesto",
] as const;

/**
 * Para el cajón: de qué se habla y los ejemplos del estado vacío. Sin aviso fijo (validación 104): lo que hace la lista
 * lo dice una vez el estado vacío, y la caja de la lista dice «N cambios para aplicar».
 */
export function avisoDelChat(nombreDeLaCuenta: string, uso: string | null, desdeLaGuia = false) {
  return {
    variante: "sin-propuesta" as const,
    subtitulo: `Sobre ${nombreDeLaCuenta}${uso ? ` · ${uso}` : ""}`,
    aviso: "",
    placeholder: desdeLaGuia ? "Pídele un cambio a la guía…" : "Pregúntale algo o cuéntale lo que pasó…",
    tono: "neutro" as const,
    bienvenida: null,
    ejemplos: desdeLaGuia
      ? [...EJEMPLOS_DE_LA_GUIA]
      : [
          "¿Qué quedó pendiente de la última reunión?",
          "Por WhatsApp hoy me dijeron que mandan la base de contactos el lunes",
          "¿Qué se dijo del pipeline de ventas?",
          "Escríbeme un WhatsApp para recordarles lo que nos deben",
        ],
  };
}
