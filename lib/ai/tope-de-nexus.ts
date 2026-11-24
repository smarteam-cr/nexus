/**
 * lib/ai/tope-de-nexus.ts — EL TOPE DEL MES DE NEXUS CONVERSANDO (Elías, 22 nov: «US$ 100 al mes, con aviso al 80 % y los
 * topes por persona de hoy»). PURO y client-safe: el tope, el aviso, de qué se cuenta y cómo se dice. La suma del mes
 * vive en ./tope-de-nexus-server.ts.
 *
 * Cuenta todo lo que hace Nexus cuando alguien le habla: contar y preguntar en «Hablar con Nexus» (origen `chat:…`) y el
 * agente de impacto que corre al guardar (`impacto:…`) y «✨ Pedirle a Nexus» sobre un documento (`pedirle:…`, etapa 3 del
 * plan maestro, 23 nov). Lo que vuelve a la memoria entra acá cuando se construya (etapa 4), con su origen en la lista.
 * Está DENTRO de los US$ 300 de toda la IA (lib/ai/presupuesto.ts), no aparte. Los topes por persona (60 vueltas y 20
 * preguntas al día) siguen en lib/chat-de-nexus.
 */
import { crDateParts } from "@/lib/jobs/time";
import { OFFSET_CR_HORAS } from "./presupuesto";

export const TOPE_DE_NEXUS_USD_MES = 100;
/** Desde qué parte del tope se avisa. */
export const AVISO_DE_NEXUS = 0.8;
/** El `omitido` del agente de impacto cuando no corrió por el tope del mes. */
export const OMITIDO_POR_EL_TOPE = "tope-del-mes";
/** Los orígenes del medidor (`LlmCall.origen`) que son Nexus conversando: el comienzo de cada uno. */
export const ORIGENES_DE_NEXUS = ["chat:", "impacto:", "pedirle:"] as const;

export function esDeNexusConversando(origen: string | null | undefined): boolean {
  return !!origen && ORIGENES_DE_NEXUS.some((o) => origen.startsWith(o));
}

/** El primer instante del mes en Costa Rica (UTC-6 todo el año). */
export function inicioDelMesCr(ahora: Date): Date {
  const { dateKey } = crDateParts(ahora);
  return new Date(`${dateKey.slice(0, 7)}-01T0${OFFSET_CR_HORAS}:00:00.000Z`);
}

export type EstadoDelTope = { estado: "bien" | "aviso" | "agotado"; gastadoUsd: number; topeUsd: number };

/** `null` = no se pudo leer el gasto: no frena (como el presupuesto de la IA, lo que no se sabe no frena). */
export function estadoDelTope(gastadoUsd: number | null, topeUsd = TOPE_DE_NEXUS_USD_MES): EstadoDelTope {
  const g = gastadoUsd ?? 0;
  const estado = g >= topeUsd ? "agotado" : g >= topeUsd * AVISO_DE_NEXUS ? "aviso" : "bien";
  return { estado, gastadoUsd: g, topeUsd };
}

const usd = (n: number) => `US$ ${Math.round(n)}`;

/** Lo que dice Nexus cuando el mes llegó al tope. */
export function mensajeDelTope(t: EstadoDelTope): string {
  return `Nexus llegó al tope de ${usd(t.topeUsd)} de este mes para conversar. Lo que ya guardaste sigue igual; el mes que viene puedes seguir.`;
}

/** El aviso desde el 80 %: null si todavía no toca. */
export function avisoDelTope(t: EstadoDelTope): string | null {
  if (t.estado !== "aviso") return null;
  return `Este mes Nexus lleva ${usd(t.gastadoUsd)} de los ${usd(t.topeUsd)} que tiene para conversar.`;
}
