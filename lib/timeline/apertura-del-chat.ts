/**
 * lib/timeline/apertura-del-chat.ts — EL CHAT SE ABRE SOLO CON UNA PROPUESTA NUEVA (E3 P5).
 *
 * PURO (salvo el `localStorage`, envuelto en try/catch). Lo usa el cronograma (CronogramaCanvas.tsx).
 *
 * Cuando aparece una propuesta del cronograma, el chat se abre solo, UNA vez por persona y por
 * propuesta (D14): sin tomar el foco, en pantallas anchas (el cajón corre el cronograma y no tapa
 * «Aplicar»), y nunca encima de otra capa (el detalle de una tarea, un diálogo). «Una vez» se recuerda en
 * dos lados: en el servidor (`chatAbiertoPara`: la huella del email, así Elías en su otra computadora
 * no lo ve abrirse de nuevo) y en este navegador. La marca del servidor gana aunque el navegador esté
 * vacío; lo recordado acá solo sin la del servidor vuelve a mandarla (pudo perderse: una fusión la borra).
 */

/** Qué hacer: abrir el cajón, solo dejar marcado que ya se abrió (lo tenía abierto), o nada. */
export type DecisionDeApertura = "abrir" | "solo-marcar" | "nada";

export interface EntradaDeLaApertura {
  /** Quien mira puede editar el cronograma (la vara del botón del chat). */
  puedeEditar: boolean;
  /** Y conversar con el asistente (`asistente.read`, la celda de su ruta). */
  puedeConversar: boolean;
  /** Hay una propuesta guardada (un borrador) en pantalla. */
  hayBorrador: boolean;
  /** La vista previa del modificador («Pedir cambio con IA»): no es una propuesta guardada. */
  deAssist: boolean;
  /** El token de la propuesta en pantalla. */
  token: string | null;
  /** La barra tiene algo que mostrar (el resumen existe). */
  conCambios: boolean;
  /** Todo ya está así: la propuesta se descarta sola. */
  nadaQueDecidir: boolean;
  /** La IA está armando o recalculando las tareas: se abre cuando termine. */
  tareasArmando: boolean;
  recalculando: boolean;
  /** El cronograma está ocupado (aplicando algo) o esta pantalla pide una propuesta. */
  ocupado: boolean;
  /** Hay otra capa encima (el detalle de una tarea, un diálogo). */
  conOtraCapa: boolean;
  chatAbierto: boolean;
  /** La pantalla mide al menos 1280 px. */
  anchoSuficiente: boolean;
  /** El servidor ya lo abrió para esta persona con esta propuesta. */
  abiertoEnElServidor: boolean;
  /** Este navegador ya lo abrió con esta propuesta. */
  recordadoLocal: boolean;
}

export function debeAbrirseElChat(e: EntradaDeLaApertura): DecisionDeApertura {
  if (!e.puedeEditar || !e.puedeConversar) return "nada";
  if (!e.hayBorrador || e.deAssist || !e.token || !e.conCambios || e.nadaQueDecidir) return "nada";
  // Ya se abrió para esta persona (en cualquier computadora): no se abre de nuevo.
  if (e.abiertoEnElServidor) return "nada";
  // Este navegador ya lo abrió, pero el servidor no lo tiene: se vuelve a marcar, sin abrir.
  if (e.recordadoLocal) return "solo-marcar";
  // Lo que está pasando ahora: se espera (el efecto vuelve a mirar cuando cambia).
  if (e.tareasArmando || e.recalculando || e.ocupado || e.conOtraCapa) return "nada";
  if (e.chatAbierto) return "solo-marcar";
  if (!e.anchoSuficiente) return "nada";
  return "abrir";
}

/** Dónde recuerda este navegador para qué propuesta ya se abrió el chat (una entrada por proyecto). */
export const claveDeLaApertura = (projectId: string): string => `nexus:cronograma:chat-abierto:${projectId}`;

/** Lo mínimo de `Storage` que se usa: `localStorage` en el navegador, un Map en los tests. */
export interface AlmacenDeLaApertura {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function almacenDelNavegador(): AlmacenDeLaApertura | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** ¿Este navegador ya abrió el chat para esta propuesta? Nunca tira: sin almacén, no. */
export function leerApertura(
  projectId: string,
  token: string,
  almacen: AlmacenDeLaApertura | null = almacenDelNavegador(),
): boolean {
  if (!almacen) return false;
  try {
    return almacen.getItem(claveDeLaApertura(projectId)) === token;
  } catch {
    return false;
  }
}

/** Recuerda que el chat ya se abrió para esta propuesta (pisa la de la propuesta anterior). */
export function recordarApertura(
  projectId: string,
  token: string,
  almacen: AlmacenDeLaApertura | null = almacenDelNavegador(),
): void {
  if (!almacen) return;
  try {
    almacen.setItem(claveDeLaApertura(projectId), token);
  } catch {
    /* sin lugar o sin permiso: queda la marca del servidor */
  }
}
