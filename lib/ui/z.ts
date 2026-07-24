/**
 * lib/ui/z.ts
 *
 * ESCALA ÚNICA de capas superpuestas. Antes cada overlay inventaba su número
 * (z-50, z-[51], z-[55], z-[60], z-[65], z-[70], z-[100], z-[101]) y "cuál gana"
 * era adivinanza; peor, un número alto NO garantiza nada si el elemento vive
 * dentro de un contexto de apilamiento ajeno (ver la nota de abajo).
 *
 * REGLA DURA — toda capa flotante va en un PORTAL a document.body.
 * `position: fixed` + z-index alto NO alcanza: `position: sticky`, `transform`,
 * `filter`, `opacity < 1` y `will-change` crean un contexto de apilamiento, y
 * adentro de uno el z-index se resuelve contra ESE contexto, no contra la página.
 * Caso real (2026-07): el panel de "Corridas de agentes" era `fixed z-50` pero
 * colgaba del `<aside class="sticky">` del sidebar, así que lo tapaba cualquier
 * capa de la columna principal. La primitiva `Modal`, `Drawer` y `NavFlyout` ya
 * portalean; usar esas antes que montar una capa nueva a mano.
 *
 * Orden de arriba hacia abajo: lo que INTERRUMPE va encima de lo que informa.
 *
 * ADOPCIÓN: la escala se aplica al crear o arreglar una capa, no de un saque. Las
 * que ya están en el valor correcto (Toast 100, UndoProvider y el prompt de
 * notificaciones 101, Modal 70, Drawer 51) se dejan como están — reescribirlas es
 * churn con riesgo y cero beneficio. Lo que NO se acepta es inventar un número
 * nuevo: si tu capa no encaja en ninguna de estas, agregá la entrada acá.
 */

export const Z = {
  /** Contenido pegajoso dentro del flujo (encabezados de tabla, barras de sección). */
  STICKY: 20,
  /** Cajón lateral estándar (`components/ui/Drawer.tsx`). */
  DRAWER: 51,
  /** Velo + panel de un drawer de detalle que se abre SOBRE otro (CuentaDrawer, TaskDetailDrawer). */
  OVERLAY: 60,
  /** Diálogos modales, incluidos los que se abren encima de un drawer (`Modal`, `ConfirmDialog`). */
  MODAL: 70,
  /** Popovers y flyouts anclados a un trigger (menús del sidebar, centro de corridas). */
  POPOVER: 80,
  /** Avisos efímeros: toasts. Casi lo más alto — informan por encima de todo lo demás. */
  TOAST: 100,
  /** Barra de deshacer y el prompt de notificaciones: por encima del toast a propósito
   *  (son accionables y no deben quedar tapados por un aviso que solo informa). */
  TOAST_ACTION: 101,
} as const;

export type ZLayer = keyof typeof Z;

/**
 * Clase Tailwind de una capa (`zClass("POPOVER")` → `"z-[80]"`). Se usa como
 * literal arbitrario a propósito: la escala vive acá, no repartida por el árbol.
 */
export function zClass(layer: ZLayer): string {
  return `z-[${Z[layer]}]`;
}
