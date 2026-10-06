/**
 * lib/ui/deshacer.ts — LA LÓGICA PURA DEL DESHACER GLOBAL (Ctrl+Z y el aviso «Deshacer»).
 *
 * La usa `components/ui/UndoProvider.tsx` (la pila global) y `components/flowchart/FlowchartViewer.tsx`
 * (que tiene su propia pila). Vive acá, sin React ni DOM real, para que sus reglas se puedan probar.
 *
 * ── LOS HUECOS QUE CIERRA (auditoría del deshacer, 2026-10-05) ───────────────────────────────
 * · Ctrl+Z deshacía algo que NO estaba en pantalla: la pila es global y tomaba la última entrada de
 *   cualquier pantalla montada, aunque estuviera oculta. Ahora cada pantalla puede declarar su ANCLA
 *   (el elemento que la representa) y Ctrl+Z solo actúa sobre la entrada más reciente cuya ancla se
 *   ve. Si no hay nada visible que deshacer, no hace nada (y no le roba la tecla al navegador).
 * · Un Ctrl+Z deshacía DOS cosas a la vez: el diagrama (con su pila propia) y el global atendían la
 *   misma tecla. Ahora el que la atiende la cancela (`preventDefault`) y el otro respeta eso.
 * · El diagrama cancelaba Ctrl+Z también dentro de un campo editable de al lado y mataba el deshacer
 *   nativo del texto.
 */

/* ── Anclas: dónde está la pantalla de una entrada ─────────────────────────────────────────── */

/**
 * Cómo una pantalla dice DÓNDE está: el elemento mismo, un ref de React o una función que lo
 * devuelve. Se resuelve en el momento de deshacer, nunca al registrar: el elemento puede no existir
 * todavía (la pantalla está cargando) o haber cambiado.
 */
export type Ancla<T extends object> =
  | T
  | null
  | undefined
  | { readonly current: T | null }
  | (() => T | null | undefined);

export function resolverAncla<T extends object>(a: Ancla<T>): T | null {
  if (!a) return null;
  if (typeof a === "function") return (a as () => T | null | undefined)() ?? null;
  if ("current" in a) return (a as { readonly current: T | null }).current ?? null;
  return a as T;
}

/**
 * ¿Se ve la pantalla de una entrada?
 *
 * ⚠ SIN ANCLAS ES «SÍ», a propósito: es la compatibilidad con las pantallas que todavía no declaran
 * dónde están (el cronograma, los workspaces de documentos). Esas se desmontan al ocultarse y su
 * historial se purga con `useUndoScope`, que era la única protección que había.
 * ⛔ CON ANCLAS, una que no resuelve (la pantalla está cargando, o se desmontó) cuenta como NO visible:
 * deshacer sobre algo que no está en pantalla es justo el hueco que esto cierra.
 */
export function superficieVisible<T>(anclas: readonly (T | null)[], seVe: (el: T) => boolean): boolean {
  if (anclas.length === 0) return true;
  return anclas.some((el) => el != null && seVe(el));
}

/**
 * La entrada que Ctrl+Z tiene que deshacer: la MÁS RECIENTE cuya pantalla se ve. -1 si no hay ninguna.
 *
 * Las de pantallas ocultas NO se tocan ni se descartan: quedan en la pila para cuando la pantalla
 * vuelva a verse (son independientes de las otras pantallas, así que saltearlas no desordena nada).
 */
export function elegirEntradaParaDeshacer<E>(pila: readonly E[], esVisible: (e: E) => boolean): number {
  for (let i = pila.length - 1; i >= 0; i--) {
    if (esVisible(pila[i])) return i;
  }
  return -1;
}

/** Lo mínimo de un elemento del DOM que hace falta para saber si se ve. */
export interface ElementoQueSeVe {
  readonly isConnected: boolean;
  checkVisibility?: () => boolean;
  getClientRects: () => { readonly length: number };
}

/**
 * Si un elemento se está pintando: conectado al documento y sin un `display: none` (propio o de un
 * ancestro — el `hidden` del panel del proyecto al pasar a «Info» de la cuenta). `checkVisibility`
 * cuando el navegador lo tiene; si no, el viejo truco de las cajas (un elemento sin pintar no tiene).
 * Que esté fuera del área visible por scroll NO lo oculta: sigue en la pantalla.
 */
export function seVeEnPantalla(el: ElementoQueSeVe): boolean {
  if (!el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.getClientRects().length > 0;
}

/* ── La tecla ──────────────────────────────────────────────────────────────────────────────── */

/** Lo mínimo del elemento con el foco. */
export interface ElementoEnfocado {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
}

/**
 * Si el foco está en un campo con deshacer NATIVO (lo que la persona está escribiendo). Ahí Ctrl+Z es
 * del navegador: ni el global ni el diagrama lo tocan.
 * ⚠ El `contentEditable` cuenta: el diagrama lo olvidaba y cancelaba el deshacer del texto de al lado.
 */
export function esCampoDeTexto(el: ElementoEnfocado | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

/** Lo mínimo de un `KeyboardEvent`. */
export interface TeclaPulsada {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/** Ctrl+Z (o Cmd+Z), sin Shift ni Alt: Ctrl+Shift+Z es rehacer. */
export function esAtajoDeshacer(e: TeclaPulsada): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
  return (e.key ?? "").toLowerCase() === "z";
}

/**
 * Si el atajo GLOBAL tiene que mirar la pila por esta tecla.
 *
 * ⛔ `defaultPrevented`: si otro manejador ya la atendió (el diagrama, con su pila propia), el global
 * NO actúa. Sin esto, un solo Ctrl+Z deshacía dos cosas a la vez. Para que funcione, los manejadores
 * locales escuchan en `document` (o más abajo) y el global en `window`: en el burbujeo, `document`
 * pasa ANTES que `window`, así que el global siempre se entera de lo que el otro hizo.
 */
export function elGlobalAtiende(e: TeclaPulsada, enfocado: ElementoEnfocado | null | undefined): boolean {
  return esAtajoDeshacer(e) && !e.defaultPrevented && !esCampoDeTexto(enfocado);
}

/**
 * Si un diagrama con pila PROPIA (FlowchartViewer) atiende Ctrl+Z / Ctrl+Shift+Z.
 *
 * Solo cuando: nadie la atendió antes, el foco no está en un campo de texto, el diagrama se ve, la
 * persona está trabajando EN él (su último clic o el foco están adentro) y tiene algo que deshacer.
 * ⚠ Si no tiene historial NO cancela la tecla: el global tiene que poder deshacer lo del resto del
 * documento. Antes el diagrama la cancelaba siempre — con el global respetando la cancelación, eso
 * habría apagado el deshacer de toda pantalla que tuviera un diagrama montado.
 */
export function elDiagramaAtiende(p: {
  yaAtendida: boolean;
  enCampoDeTexto: boolean;
  seVe: boolean;
  activo: boolean;
  hayHistorial: boolean;
}): boolean {
  return !p.yaAtendida && !p.enCampoDeTexto && p.seVe && p.activo && p.hayHistorial;
}

/* ── Grupos: N cambios, UN paso ────────────────────────────────────────────────────────────── */

/**
 * Suma una entrada a un grupo abierto (lo aplicado por el chat de una sola vez).
 *
 * Si ya hay una con la MISMA clave de agrupado y el mismo scope, se conserva la primera: su foto es
 * la de ANTES del grupo, que es a donde tiene que volver el deshacer. La nueva se descarta.
 */
export function sumarAlGrupo<E extends { scope: string; coalesceKey?: string }>(hijos: readonly E[], nueva: E): E[] {
  if (nueva.coalesceKey && hijos.some((h) => h.coalesceKey === nueva.coalesceKey && h.scope === nueva.scope)) {
    return [...hijos];
  }
  return [...hijos, nueva];
}

/**
 * Deshace un grupo: de la última a la primera (el orden inverso al que pasaron), esperando cada una.
 * Sigue aunque una falle —deshacer lo más posible es mejor que dejar el documento a medias— y devuelve
 * `false` si alguna no se pudo, para que el aviso lo diga.
 */
export async function deshacerEnOrdenInverso(
  undos: ReadonlyArray<() => void | Promise<boolean | void>>,
  alFallar: (e: unknown) => void = () => {},
): Promise<boolean> {
  let todas = true;
  for (let i = undos.length - 1; i >= 0; i--) {
    try {
      const r = await undos[i]();
      if (r === false) todas = false;
    } catch (e) {
      alFallar(e);
      todas = false;
    }
  }
  return todas;
}
