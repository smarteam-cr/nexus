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
 * está en otra cosa (escribiendo, con otra capa, una pantalla angosta o en medio de un gesto en el Gantt), no se
 * abre DESPUÉS en un momento cualquiera: queda un punto en el 💬. No se abre con «Regenerar» de una sola fase
 * ni sobre una propuesta que el chat no puede editar. Qué hace el cronograma con cada decisión lo dice
 * `accionesDeLaApertura` (pura, con su tabla).
 *
 * Revisión de los arreglos: el puntero QUIETO encima ya no pospone. Contaba el `:hover` de `#cronograma-gantt`,
 * que envuelve la barra, la línea de las tareas y el Gantt (casi toda la pantalla), y el chat casi nunca se
 * abría solo. Pospone lo que es actividad real: un campo con foco, otra capa, una pantalla angosta, o un gesto
 * en curso en el Gantt (el botón apretado, o un clic o una tecla ahí en los últimos `VENTANA_DEL_GESTO_MS`). Y
 * lo pasajero (un gesto, un campo, una capa) se vuelve a decidir UNA vez cuando termina (`seVuelveADecidir`), en
 * vez de quedar en «nada» para siempre; con la pantalla angosta queda solo el punto.
 *
 * Revisión antes del push: el campo que pierde el foco no reintenta en el acto (el `focusout` llega a mitad del
 * clic): se espera a que termine el gesto en todo el documento (`faltaParaReintentarPorElCampo`). Y «💬 Asistente»
 * no cierra un cajón que se abrió solo en ese mismo clic (`abiertoTrasTocarElChat`).
 */

/**
 * Qué hacer:
 *  · «abrir» el cajón (sin tomar el foco) y recordarlo;
 *  · «solo-marcar» que ya se abrió (lo tenía abierto, o este navegador ya lo había abierto);
 *  · «posponer»: era el momento, pero la persona estaba en otra cosa (`motivoParaPosponer`). No se abre DESPUÉS
 *    en un momento cualquiera: queda un punto en el 💬 (revisión de E3, #17), y si lo que la frenó es pasajero,
 *    se vuelve a decidir una vez cuando termina (revisión de los arreglos);
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
  /**
   * Hay un gesto en curso en el Gantt (`gestoEnCurso`): el botón del puntero apretado (un arrastre), o un clic o
   * una tecla ahí en los últimos `VENTANA_DEL_GESTO_MS`. Abrir en medio correría 400 px lo que se está tocando.
   */
  gestoEnCurso: boolean;
  /**
   * El puntero está QUIETO encima de la barra, la línea de las tareas o el Gantt (`#cronograma-gantt:hover`).
   * ⛔ NO pospone (revisión de los arreglos): ese contenedor es casi toda la pantalla del cronograma, y quien mira
   * la barra mientras espera la propuesta es justo a quien se le abre. Se pasa para que la tabla lo pruebe.
   */
  punteroEnElGantt: boolean;
  /** En esta pantalla ya se pospuso para esta propuesta: no se abre sola después (salvo `reintento`). */
  pospuesta: boolean;
  /**
   * Se pospuso por algo pasajero (un gesto, un campo con foco, otra capa) y eso YA terminó: se vuelve a decidir
   * UNA vez, como si la propuesta acabara de quedar lista (revisión de los arreglos).
   */
  reintento: boolean;
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
     cursor). Si la persona lo abre a mano, se marca. Revisión de los arreglos: salvo el reintento, cuando termina
     lo pasajero que la frenó. */
  if (e.pospuesta && !e.reintento) return e.chatAbierto ? "solo-marcar" : "nada";
  // Todavía no está lista: se espera (el efecto vuelve a mirar cuando termina).
  if (e.tareasArmando || e.recalculando || e.ocupado) return "nada";
  if (e.chatAbierto) return "solo-marcar";
  if (motivoParaPosponer(e) !== null) return "posponer";
  return "abrir";
}

/** Por qué se pospone: otra capa encima, una pantalla angosta, un campo con foco o un gesto en curso en el Gantt. */
export type MotivoDePosposicion = "capa" | "angosta" | "escribiendo" | "gesto";

/**
 * Qué hay en el medio, o null si nada. ⛔ El puntero quieto encima (`punteroEnElGantt`) NO cuenta (revisión de
 * los arreglos): solo lo que la persona está haciendo.
 */
export function motivoParaPosponer(
  e: Pick<EntradaDeLaApertura, "conOtraCapa" | "anchoSuficiente" | "escribiendo" | "gestoEnCurso" | "punteroEnElGantt">,
): MotivoDePosposicion | null {
  if (e.conOtraCapa) return "capa";
  if (!e.anchoSuficiente) return "angosta";
  if (e.escribiendo) return "escribiendo";
  if (e.gestoEnCurso) return "gesto";
  return null;
}

/**
 * ¿Se vuelve a decidir UNA vez cuando lo que la frenó termina? Lo pasajero sí: el gesto (se suelta el botón y
 * pasa la ventana sin actividad), el campo (pierde el foco y termina el clic que se lo sacó, `EsperaDeUnCampo`) y
 * la capa (se cierra). La pantalla angosta no: queda
 * el punto en el 💬 (abrir el cajón al agrandar la ventana correría todo en un momento cualquiera).
 */
export function seVuelveADecidir(m: MotivoDePosposicion): boolean {
  return m !== "angosta";
}

/** Cuánto dura un gesto en el Gantt después del último clic o tecla (ms). */
export const VENTANA_DEL_GESTO_MS = 2000;

/** Lo que el cronograma sabe del gesto en el Gantt: si el botón sigue apretado y cuándo fue lo último. */
export interface GestoEnElGantt {
  apretado: boolean;
  /** `Date.now()` del último pointerdown, pointerup o tecla dentro del Gantt; null si nunca hubo. */
  ultimaActividad: number | null;
}

/** ¿Hay un gesto en curso? El botón apretado, o actividad hace menos de `VENTANA_DEL_GESTO_MS`. */
export function gestoEnCurso(g: GestoEnElGantt, ahora: number): boolean {
  return g.apretado || (g.ultimaActividad !== null && ahora - g.ultimaActividad < VENTANA_DEL_GESTO_MS);
}

/**
 * Cuánto falta para que el gesto termine: null mientras el botón siga apretado (lo despierta el soltar), 0 si ya
 * terminó, y si no los ms que faltan para cumplir la ventana sin actividad.
 */
export function faltaParaQueTermineElGesto(g: GestoEnElGantt, ahora: number): number | null {
  if (g.apretado) return null;
  if (g.ultimaActividad === null) return 0;
  return Math.max(0, VENTANA_DEL_GESTO_MS - (ahora - g.ultimaActividad));
}

/**
 * Revisión antes del push: la espera de lo que pospuso por «escribiendo». El `focusout` llega en el POINTERDOWN del
 * clic que saca el foco, antes del click: reintentar ahí abría el cajón a mitad del clic (si el clic era en
 * «💬 Asistente», su click lo volvía a cerrar; si era en otro control, el cajón corría 400 px lo que se estaba
 * tocando). Ahora perder el foco no reintenta: se espera a que termine el gesto en TODO el documento (se suelta el
 * botón y pasan `VENTANA_DEL_GESTO_MS` sin otro pointerdown; si el foco salió con el teclado, esos 2 s). Otro
 * pointerdown en el medio vuelve a esperar a que se suelte.
 */
export interface EsperaDeUnCampo {
  /** El campo ya perdió el foco. */
  focoAfuera: boolean;
  /** El gesto en el DOCUMENTO (no solo en el Gantt): el botón apretado y lo último (apretar, soltar o el foco). */
  gesto: GestoEnElGantt;
}

/** Lo que se anota mientras se espera: el pointerdown y el pointerup del documento, y el `focusout` del campo. */
export type EventoDeLaEspera = "apretar" | "soltar" | "foco-afuera";

export const ESPERA_DE_UN_CAMPO: EsperaDeUnCampo = { focoAfuera: false, gesto: { apretado: false, ultimaActividad: null } };

export function anotarEnLaEspera(e: EsperaDeUnCampo, evento: EventoDeLaEspera, ahora: number): EsperaDeUnCampo {
  const apretado = evento === "apretar" ? true : evento === "soltar" ? false : e.gesto.apretado;
  return { focoAfuera: e.focoAfuera || evento === "foco-afuera", gesto: { apretado, ultimaActividad: ahora } };
}

/**
 * Cuánto falta para volver a decidir: null mientras el campo tenga el foco o el botón siga apretado (lo despierta
 * el soltar), 0 si ya terminó, y si no los ms que faltan (`faltaParaQueTermineElGesto` sobre el gesto del documento).
 */
export function faltaParaReintentarPorElCampo(e: EsperaDeUnCampo, ahora: number): number | null {
  if (!e.focoAfuera) return null;
  return faltaParaQueTermineElGesto(e.gesto, ahora);
}

/**
 * Revisión antes del push: cómo queda el cajón al tocar «💬 Asistente». Alterna, salvo que se haya abierto SOLO en
 * medio de ESTE clic (la apertura automática llegó después de su pointerdown): entonces queda abierto. Si no, el
 * clic que la persona hizo para abrirlo lo cerraba (abierto solo a mitad del clic, cerrado por el click).
 * `apretadoEn`: el pointerdown de este clic (null con el teclado); `abiertoSoloEn`: la última apertura automática.
 */
export function abiertoTrasTocarElChat(e: { abierto: boolean; apretadoEn: number | null; abiertoSoloEn: number | null }): boolean {
  if (!e.abierto) return true;
  return e.apretadoEn !== null && e.abiertoSoloEn !== null && e.abiertoSoloEn >= e.apretadoEn;
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
  /** Se pospuso: el punto del 💬, y no se abre sola después (salvo el reintento de `seVuelveADecidir`). */
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
