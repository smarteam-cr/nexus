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
 *
 * L1 (2026-09-26): además, QUÉ DICE el cajón con lo que hay en pantalla (`estadoParaElChat`, `avisoDelChat`) y
 * dónde empieza la propuesta en la conversación (`dondeEmpiezaLaPropuesta`, `divisoriaDelChat`).
 */
import { diaCorto } from "./autoria-de-la-propuesta";
import { LINEA_DEL_CLIENTE } from "./borrador";

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

/* ── L1 · EL CHAT DICE QUÉ EDITA (2026-09-26) ─────────────────────────────────────────────────────────────
   Antes el cajón decía «Sobre la propuesta desde …» solo con una propuesta editable y SIN historial se veían
   los ejemplos; con conversación vieja nada decía que lo nuevo editaba la propuesta y no el cronograma vigente.
   Sin permiso no decía nada, y con una propuesta que no se resuelve en el chat (versión nueva, vacía que falló)
   tampoco. Ahora hay UN estado por pantalla (`estadoParaElChat`) y sus textos (`avisoDelChat`):
     · el subtítulo dice de dónde viene la propuesta;
     · el aviso fijo, arriba del campo y AUNQUE HAYA HISTORIAL, dice qué pasa con lo que se pide. La idea «cambia
       la propuesta» va una sola vez, ahí;
     · la bienvenida (solo editable) trae ejemplos armados con la propuesta de verdad, nunca un nombre fijo.
   ⛔ La divisoria y la bienvenida las pinta el cajón y NUNCA se guardan como turno: entrarían al contexto del
   modelo (y romperían su caché). */

/** Con qué se arman los ejemplos de una propuesta editable (`ejemplosDelResumen`). */
export interface EjemplosDeLaPropuesta {
  /** El primer número de la barra que no es un grupo de tareas; null = no hay (se dice «el 1»). */
  numero: number | null;
  /** La fase del grupo con más tareas nuevas; null = ninguna (ese ejemplo no va). */
  faseConNuevas: string | null;
}

/** Lo que el cronograma tiene en pantalla, leído en el render. */
export interface EntradaDelChat {
  /** Quien mira puede editar el cronograma (`editTimeline`). */
  puedeEditar: boolean;
  /** Hay una propuesta que esta versión sabe leer (`borrador-v1`). */
  hayBorrador: boolean;
  /** Hay algo guardado que NO es un v1: solo se descarta, en su línea. */
  ilegible: boolean;
  /** La propuesta trae cambios que esta versión de Nexus no sabe leer. */
  conDesconocidos: boolean;
  /** Es el borrador vacío y su corrida ya no va a traer nada (`estadoDelVacio` «fallo»). */
  vacioFallido: boolean;
  /** La IA está armando las tareas de la propuesta. */
  tareasArmando: boolean;
  /** La IA está recalculando unas tareas (E2c). */
  recalculando: boolean;
  /** «desde el handoff», «desde «Regenerar todo»»… (`desdeDeLaPropuesta`). */
  desde: string;
  ejemplos: EjemplosDeLaPropuesta | null;
}

export type EstadoParaElChat =
  | { que: "sin-propuesta" }
  | { que: "solo-lectura"; desde: string | null }
  | { que: "editable"; desde: string; ejemplos: EjemplosDeLaPropuesta | null }
  | { que: "armando" | "recalculando"; desde: string }
  | { que: "version-nueva" | "ilegible" | "vacia-fallida" };

/**
 * Qué puede hacer el chat con lo que hay en pantalla. El orden importa: sin permiso gana a todo (no se ofrece
 * ningún cambio); lo ilegible, a no tener propuesta (sigue guardado y hay que descartarlo); los cambios de una
 * versión nueva, a todo lo demás (solo se resuelven recargando o descartando).
 */
export function estadoParaElChat(e: EntradaDelChat): EstadoParaElChat {
  if (!e.puedeEditar) return { que: "solo-lectura", desde: e.hayBorrador ? e.desde : null };
  if (e.ilegible) return { que: "ilegible" };
  if (!e.hayBorrador) return { que: "sin-propuesta" };
  if (e.conDesconocidos) return { que: "version-nueva" };
  if (e.vacioFallido) return { que: "vacia-fallida" };
  if (e.tareasArmando) return { que: "armando", desde: e.desde };
  if (e.recalculando) return { que: "recalculando", desde: e.desde };
  return { que: "editable", desde: e.desde, ejemplos: e.ejemplos };
}

/** Los textos del cajón para un estado. */
export interface AvisoDelChat {
  variante: EstadoParaElChat["que"];
  /** Debajo del título del cajón: de qué se habla. */
  subtitulo: string;
  /** El aviso fijo, arriba del campo: qué pasa con lo que se pide. */
  aviso: string;
  /** La ayuda del campo de escribir. */
  placeholder: string;
  tono: "info" | "warn" | "neutro";
  /** Solo editable: lo que va antes de los ejemplos, debajo de la divisoria. */
  bienvenida: string | null;
  /** Editable: los de la propuesta; sin propuesta: los de siempre (sin «Aplica la propuesta»); resto: ninguno. */
  ejemplos: string[];
}

export const EJEMPLO_APLICAR_LA_PROPUESTA = "Aplica la propuesta";
/** Los ejemplos de siempre, sin propuesta abierta. */
export const EJEMPLOS_SIN_PROPUESTA: readonly string[] = [
  "¿Qué pasa si alargo una fase dos semanas?",
  "Hay fases duplicadas, ¿se pueden unir?",
  "Quiero mover una tarea de fase — ¿pierdo algo?",
];
/** Un nombre de fase largo se corta: el ejemplo tiene que entrar en una línea del cajón. */
const TOPE_DEL_NOMBRE = 40;
const cortar = (s: string): string => (s.length > TOPE_DEL_NOMBRE ? `${s.slice(0, TOPE_DEL_NOMBRE - 1).trimEnd()}…` : s);

/** Los ejemplos de una propuesta editable: con sus números y sus fases, nunca un nombre fijo. */
export function ejemplosDeLaPropuesta(e: EjemplosDeLaPropuesta | null): string[] {
  const fase = e?.faseConNuevas?.trim() ? cortar(e.faseConNuevas.trim()) : null;
  return [
    `Deja el ${e?.numero ?? 1} como estaba`,
    ...(fase ? [`Quita las tareas nuevas de «${fase}»`] : []),
    EJEMPLO_APLICAR_LA_PROPUESTA,
  ];
}

/** Con qué armar los ejemplos, del resumen de la barra: el primer número de estructura que no está ya así y
 *  la fase del grupo con más nuevas (el primero, si empatan). null sin resumen. */
export function ejemplosDelResumen(
  r: {
    items: ReadonlyArray<{ numero: number; estado: string }>;
    grupos: ReadonlyArray<{ nombre: string; nuevas: number }>;
  } | null,
): EjemplosDeLaPropuesta | null {
  if (!r) return null;
  let faseConNuevas: string | null = null;
  let mas = 0;
  for (const g of r.grupos) {
    if (g.nuevas > mas) {
      mas = g.nuevas;
      faseConNuevas = g.nombre;
    }
  }
  return { numero: r.items.find((it) => it.estado !== "ya-esta")?.numero ?? null, faseConNuevas };
}

const SIN_RESOLVER = "Hay una propuesta sin resolver";
const VIGENTE = "Sobre el cronograma vigente";
const PREGUNTA_LA_PROPUESTA = "Pregunta sobre la propuesta…";
const ESCRIBE_TU_PREGUNTA = "Escribe tu pregunta…";

export function avisoDelChat(e: EstadoParaElChat): AvisoDelChat {
  const sinEjemplos = { bienvenida: null, ejemplos: [] as string[] };
  switch (e.que) {
    case "editable":
      return {
        variante: e.que,
        subtitulo: `Propuesta ${e.desde}`,
        aviso: "Lo que pidas acá cambia la propuesta. El cronograma vigente sigue igual hasta que la apliques.",
        placeholder: "Pide un cambio a la propuesta…",
        tono: "info",
        bienvenida: "Por ejemplo:",
        ejemplos: ejemplosDeLaPropuesta(e.ejemplos),
      };
    case "armando":
      return {
        variante: e.que,
        subtitulo: `Propuesta ${e.desde} · armándose`,
        aviso: "La IA está armando la propuesta: aparece arriba del Gantt cuando termine. Puedes preguntar; los cambios, después.",
        placeholder: PREGUNTA_LA_PROPUESTA,
        tono: "info",
        ...sinEjemplos,
      };
    case "recalculando":
      return {
        variante: e.que,
        subtitulo: `Propuesta ${e.desde}`,
        aviso: "La IA está recalculando unas tareas de la propuesta. Puedes preguntar; los cambios, cuando termine.",
        placeholder: PREGUNTA_LA_PROPUESTA,
        tono: "info",
        ...sinEjemplos,
      };
    case "solo-lectura":
      return {
        variante: e.que,
        subtitulo: e.desde ? `Propuesta ${e.desde}` : VIGENTE,
        aviso: "Puedes preguntar. Cambiar el cronograma o la propuesta lo hace quien lo edita.",
        placeholder: ESCRIBE_TU_PREGUNTA,
        tono: "neutro",
        ...sinEjemplos,
      };
    case "version-nueva":
      return {
        variante: e.que,
        subtitulo: SIN_RESOLVER,
        aviso: "Esta propuesta viene de una versión más nueva de Nexus: recarga la página. Si sigue igual, descártala arriba del Gantt.",
        placeholder: PREGUNTA_LA_PROPUESTA,
        tono: "warn",
        ...sinEjemplos,
      };
    case "ilegible":
      return {
        variante: e.que,
        subtitulo: SIN_RESOLVER,
        aviso: "Hay una propuesta guardada que Nexus no sabe leer: descártala arriba del Gantt y después pídeme cambios.",
        placeholder: ESCRIBE_TU_PREGUNTA,
        tono: "warn",
        ...sinEjemplos,
      };
    case "vacia-fallida":
      return {
        variante: e.que,
        subtitulo: SIN_RESOLVER,
        aviso: "La IA no pudo armar la propuesta: descártala o vuelve a intentarlo arriba del Gantt.",
        placeholder: ESCRIBE_TU_PREGUNTA,
        tono: "warn",
        ...sinEjemplos,
      };
    case "sin-propuesta":
      return {
        variante: e.que,
        subtitulo: VIGENTE,
        aviso: `No hay propuesta abierta: lo que apliques acá cambia el cronograma vigente. ${LINEA_DEL_CLIENTE}`,
        placeholder: "Escribe qué quieres cambiar del cronograma…",
        tono: "neutro",
        bienvenida: null,
        ejemplos: [...EJEMPLOS_SIN_PROPUESTA],
      };
    default: {
      // Un estado nuevo sin sus textos no compila.
      const _: never = e;
      return _;
    }
  }
}

/** «Propuesta desde «Regenerar todo» · 26 sep»: la línea donde empieza la propuesta en la conversación. */
export const textoDeLaDivisoria = (desde: string, cuando: string): string => `Propuesta ${desde} · ${diaCorto(cuando)}`;

/**
 * La divisoria, si va: con una propuesta que se lee (editable, armándose, recalculando, o solo lectura con
 * propuesta) y sabiendo cuándo empezó (`cuando`, la corrida del token). Sin fecha no hay dónde ponerla.
 */
export function divisoriaDelChat(e: EstadoParaElChat, cuando: string | null): { texto: string; cuando: string } | null {
  if (!cuando || !diaCorto(cuando)) return null;
  const desde =
    e.que === "editable" || e.que === "armando" || e.que === "recalculando" || e.que === "solo-lectura" ? e.desde : null;
  return desde ? { texto: textoDeLaDivisoria(desde, cuando), cuando } : null;
}

/** Índice del primer turno con createdAt ≥ cuando (uno sin createdAt —optimista— cuenta como nuevo);
 *  turnos.length si todos son anteriores; null sin `cuando`. Se compara al SEGUNDO: un turno del mismo segundo
 *  en que empezó la propuesta ya es de ella. */
export function dondeEmpiezaLaPropuesta(
  turnos: ReadonlyArray<{ createdAt?: string | null }>,
  cuando: string | null,
): number | null {
  if (!cuando) return null;
  const desde = Date.parse(cuando);
  if (Number.isNaN(desde)) return null;
  const segundo = Math.floor(desde / 1000);
  const i = turnos.findIndex((t) => {
    const ms = t.createdAt ? Date.parse(t.createdAt) : Number.NaN;
    return Number.isNaN(ms) || Math.floor(ms / 1000) >= segundo;
  });
  return i === -1 ? turnos.length : i;
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
