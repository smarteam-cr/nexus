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
 *
 * Revisión de E3 (#12, #17, #26): se decide UNA vez por propuesta, cuando llega y queda lista. Si la persona
 * está en otra cosa (escribiendo, con el puntero sobre el Gantt, con otra capa o una pantalla angosta), no se
 * abre DESPUÉS en un momento cualquiera: queda un punto en el 💬. No se abre con «Regenerar» de una sola fase
 * ni sobre una propuesta que el chat no puede editar. Qué hace el cronograma con cada decisión lo dice
 * `accionesDeLaApertura` (pura, con su tabla).
 */

/**
 * Qué hacer:
 *  · «abrir» el cajón (sin tomar el foco) y recordarlo;
 *  · «solo-marcar» que ya se abrió (lo tenía abierto, o este navegador ya lo había abierto);
 *  · «posponer»: era el momento, pero la persona estaba en otra cosa (una capa encima, una pantalla angosta,
 *    escribiendo, o con el puntero sobre el Gantt). No se abre DESPUÉS en un momento cualquiera: queda un
 *    punto en el 💬 (revisión de E3, #17);
 *  · «nada»: todavía no (sin permiso, la propuesta no está lista, o no corresponde). Se vuelve a mirar
 *    cuando cambia lo que lo frena.
 */
export type DecisionDeApertura = "abrir" | "solo-marcar" | "posponer" | "nada";

export interface EntradaDeLaApertura {
  /** Quien mira puede editar el cronograma (la vara del botón del chat). */
  puedeEditar: boolean;
  /** Y conversar con el asistente (`asistente.read`, la celda de su ruta). */
  puedeConversar: boolean;
  /** Hay una propuesta guardada (un borrador) en pantalla. */
  hayBorrador: boolean;
  /** El token de la propuesta en pantalla. */
  token: string | null;
  /**
   * El chat la puede editar: no trae cambios que esta versión no sabe leer (revisión de E3, #12). Sin esto se
   * abría solo y ofrecía «Aplica la propuesta» sobre una propuesta que solo se resuelve en su barra.
   */
  editable: boolean;
  /** Es «Regenerar» de UNA fase: no se abre solo (revisión de E3, #17: se abría con cada fase regenerada). */
  soloFase: boolean;
  /** La barra tiene algo que mostrar (el resumen existe). */
  conCambios: boolean;
  /** Todo ya está así: la propuesta se descarta sola. */
  nadaQueDecidir: boolean;
  /** La IA está armando o recalculando las tareas: todavía no está lista. */
  tareasArmando: boolean;
  recalculando: boolean;
  /** El cronograma está ocupado (aplicando algo) o esta pantalla pide una propuesta. */
  ocupado: boolean;
  /** Hay otra capa encima (el detalle de una tarea, un diálogo). */
  conOtraCapa: boolean;
  chatAbierto: boolean;
  /** La pantalla mide al menos 1280 px. */
  anchoSuficiente: boolean;
  /** El foco está en un campo donde se escribe (`esCampoDeEscritura`). */
  escribiendo: boolean;
  /** El puntero está sobre el Gantt: abrir lo correría 400 px debajo de él. */
  punteroEnElGantt: boolean;
  /** En esta pantalla ya se pospuso para esta propuesta: no se abre sola después. */
  pospuesta: boolean;
  /** El servidor ya lo abrió para esta persona con esta propuesta. */
  abiertoEnElServidor: boolean;
  /** Este navegador ya lo abrió con esta propuesta. */
  recordadoLocal: boolean;
}

export function debeAbrirseElChat(e: EntradaDeLaApertura): DecisionDeApertura {
  if (!e.puedeEditar || !e.puedeConversar) return "nada";
  if (!e.hayBorrador || !e.token || !e.editable || !e.conCambios || e.nadaQueDecidir) return "nada";
  // «Regenerar» de una sola fase: quien la pidió está trabajando en esa fase; no se le corre el Gantt.
  if (e.soloFase) return "nada";
  // Ya se abrió para esta persona (en cualquier computadora): no se abre de nuevo.
  if (e.abiertoEnElServidor) return "nada";
  // Este navegador ya lo abrió, pero el servidor no lo tiene: se vuelve a marcar, sin abrir.
  if (e.recordadoLocal) return "solo-marcar";
  /* Revisión de E3 (#17): se decide UNA vez, cuando la propuesta llega y queda lista. Si en ese momento no se
     pudo, no se abre después (se abría con el primer clic en una casilla, corriendo el Gantt bajo el
     cursor). Si la persona lo abre a mano, se marca. */
  if (e.pospuesta) return e.chatAbierto ? "solo-marcar" : "nada";
  // Todavía no está lista: se espera (el efecto vuelve a mirar cuando termina).
  if (e.tareasArmando || e.recalculando || e.ocupado) return "nada";
  if (e.chatAbierto) return "solo-marcar";
  if (e.conOtraCapa || !e.anchoSuficiente || e.escribiendo || e.punteroEnElGantt) return "posponer";
  return "abrir";
}

/** Lo que el cronograma hace con una decisión (revisión de E3, #26: el cableado, corrido por su tabla). */
export interface AccionesDeLaApertura {
  /** Abrir el cajón. */
  abrir: boolean;
  /** Abierto SOLO: el cajón no toma el foco (la persona estaba en otra cosa). */
  automatica: boolean;
  /** Recordarlo en este navegador y en el servidor (una vez por persona y por propuesta). */
  recordar: boolean;
  /** Ya se decidió para esta propuesta: el efecto no vuelve a mirar. */
  decidida: boolean;
  /** Se pospuso: el punto del 💬, y no se abre sola después. */
  posponer: boolean;
}

export function accionesDeLaApertura(d: DecisionDeApertura): AccionesDeLaApertura {
  if (d === "abrir") return { abrir: true, automatica: true, recordar: true, decidida: true, posponer: false };
  if (d === "solo-marcar") return { abrir: false, automatica: false, recordar: true, decidida: true, posponer: false };
  if (d === "posponer") return { abrir: false, automatica: false, recordar: false, decidida: false, posponer: true };
  return { abrir: false, automatica: false, recordar: false, decidida: false, posponer: false };
}

/** Lo mínimo de un elemento que se mira para saber si ahí se escribe (el `document.activeElement`). */
export interface ElementoEnfocado {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/* Los `input` donde NO se escribe: un clic en ellos no es «estar escribiendo». */
const INPUTS_SIN_TEXTO = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"]);

/** ¿Ahí se está escribiendo? Un campo de texto, un área, un selector o algo editable. */
export function esCampoDeEscritura(el: ElementoEnfocado | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !INPUTS_SIN_TEXTO.has((el.type ?? "text").toLowerCase());
}

/**
 * De qué habla el cajón («Sobre la propuesta desde …») y, con eso, los ejemplos que ofrece («Aplica la
 * propuesta»). Solo con una propuesta que el chat puede editar (revisión de E3, #12): sobre una que se
 * resuelve en su barra, todo lo que se le pida termina en «no registré cambios».
 */
export function referenciaDelChat(e: {
  puedeEditar: boolean;
  hayBorrador: boolean;
  editable: boolean;
  conCambios: boolean;
  /** «desde el handoff», «desde «Regenerar todo»»… */
  desde: string;
}): { titulo: string } | null {
  if (!e.puedeEditar || !e.hayBorrador || !e.editable || !e.conCambios) return null;
  return { titulo: `Sobre la propuesta ${e.desde}` };
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
