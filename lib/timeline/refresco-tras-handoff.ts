/**
 * lib/timeline/refresco-tras-handoff.ts — QUÉ HACE EL CRONOGRAMA CUANDO EL HANDOFF TERMINA.
 *
 * ── EL BUG QUE ESTE ARCHIVO EXISTE PARA CERRAR ───────────────────────────────
 * Al regenerar un handoff aparecía el cartel «El cronograma tiene una propuesta sin revisar» y el
 * cronograma no mostraba nada hasta recargar la página a mano.
 *
 * La señal SÍ llegaba: `ProjectHandoffSection` bumpea `timelineRefreshSignal` al terminar la
 * corrida, y el canvas tenía un efecto escuchándola. Pero ese efecto solo actuaba si el cronograma
 * estaba VACÍO — una guarda escrita para el caso «el handoff CREA las fases por primera vez», y
 * puesta ahí para no pisar un cronograma con ediciones a medio hacer.
 *
 * El problema es que los dos casos son casi complementarios: el servidor solo deja
 * `pendingProposal` cuando YA existe un `ProjectTimeline` (`analyze/route.ts`, rama `if (existing)`).
 * O sea que el caso que produce una propuesta es, casi siempre, el caso en que la guarda decidía
 * no hacer nada. La señal se consumía y no quedaba nada que la reintentara.
 *
 * ── POR QUÉ SON TRES SALIDAS Y NO UN BOOLEANO ────────────────────────────────
 * «Recargar todo» y «no hacer nada» no alcanzan, porque la respuesta correcta al caso que faltaba
 * no es ninguna de las dos: cuando ya hay fases, el handoff NO las tocó —solo escribió la
 * propuesta—, así que las fases en pantalla siguen siendo correctas y lo único que falta traer es
 * la propuesta.
 *
 * ⛔ Y traer solo la propuesta no es una optimización: es lo que hace seguro el arreglo. La recarga
 * completa del canvas pisa `phases`, apaga `dirty` —encima fuera del catch, así que un fetch
 * fallido igual mata el autosave pendiente—, resetea `particularidadesDirty` y limpia las
 * selecciones del banner de avance, que no están cubiertas por ningún flag de sucio. Sobre un
 * cronograma que el CSE está editando, eso es peor que el bug.
 *
 * Puro y en `lib/` a propósito: los tests de este repo corren en Node, sin DOM, así que un criterio
 * que viva adentro del componente no se puede probar. Mismo molde que `grupoDeParticularidad`.
 */

export type RefrescoTrasHandoff =
  /** El cronograma está vacío: el handoff pudo CREAR las fases. Vale recargar entero. */
  | "recargar-todo"
  /** Ya hay fases: el handoff solo pudo dejar propuesta. Traer ESA y nada más. */
  | "solo-propuesta"
  /** Vacío y con una carga en vuelo: esa carga ya va a traer todo. Reintentar al terminar. */
  | "esperar";

export interface EstadoDelCronograma {
  /** Si el canvas ya tiene fases en pantalla. */
  hayFases: boolean;
  /** Si hay un `load()` en vuelo ahora mismo. */
  cargando: boolean;
}

/**
 * Qué tiene que hacer el canvas cuando el handoff avisa que terminó.
 *
 * ⚠ INVARIANTE: con `hayFases` en true NUNCA se devuelve «esperar» ni nada que no actúe. Ése es
 * exactamente el caso que se moría mudo, y es el que el test congela. Si mañana alguien suma otra
 * condición «para no molestar» (un `!dirty`, por ejemplo), el aviso vuelve a quedar huérfano —
 * y esa condición no haría falta, porque el camino de «solo propuesta» no escribe nada editable.
 */
export function decidirRefrescoTrasHandoff(e: EstadoDelCronograma): RefrescoTrasHandoff {
  if (e.hayFases) return "solo-propuesta";
  return e.cargando ? "esperar" : "recargar-todo";
}

/**
 * ¿La propuesta que acaba de llegar reemplaza a la que ya está en pantalla?
 *
 * El canvas comparte un solo estado `proposal` entre dos orígenes distintos:
 *  · la del ASSIST — vive SOLO en memoria, es el resultado de una corrida de IA que el CSE pidió
 *    y que no está en el servidor: pisarla la destruye para siempre.
 *  · la del HANDOFF — está persistida en `pendingProposal`, así que siempre se puede recuperar.
 *
 * Por eso no alcanza con el `prev ?? nueva` que usa la carga completa: con esa regla, una segunda
 * regeneración dejaba en pantalla la propuesta VIEJA del handoff, que es peor que no mostrar nada
 * (el cartel dice que hay algo nuevo y el canvas muestra lo anterior, sin que nada lo delate).
 */
export function debeReemplazarPropuesta(actual: {
  /** Si hay una propuesta en pantalla ahora. */
  hayPropuesta: boolean;
  /** `true` cuando la de pantalla salió del assist (solo memoria). */
  esDeAssist: boolean;
  /** La corrida de la propuesta en pantalla, si vino del servidor. */
  runIdEnPantalla: string | null;
  /** La corrida de la propuesta que acaba de traer el servidor. */
  runIdNuevo: string | null;
}): boolean {
  if (!actual.hayPropuesta) return true;
  // ⛔ Nunca arrancarle al CSE una vista previa del assist que tiene abierta.
  if (actual.esDeAssist) return false;
  // Del servidor contra el servidor: gana la corrida nueva. Sin runId nuevo no hay nada que traer.
  if (!actual.runIdNuevo) return false;
  return actual.runIdNuevo !== actual.runIdEnPantalla;
}
