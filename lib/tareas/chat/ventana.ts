/**
 * lib/tareas/chat/ventana.ts — qué parte del hilo viaja al modelo en el chat de tareas (docs/tareas-plan.md §6.2). PURO.
 *
 * El hilo de tareas es uno por persona y para siempre: sin ventana, cada turno costaría más que el anterior hasta
 * llenar el contexto. Al modelo le llegan los turnos desde el último acuerdo APLICADO (un desenlace ok), como mucho 12,
 * más el bloque de pendientes (que lee el hilo entero). La ventana salta de a 6, así el prefijo cacheado vale varios
 * turnos seguidos, y empieza en un turno de la persona.
 */
import { leerDesenlace, textoVisible } from "@/lib/asistente/acuerdo";
import { esTurnoDeDesenlace, type TurnoDelLibro } from "@/lib/asistente/acuerdo-vivo";

export const VENTANA_DE_TAREAS = 12;
const SALTO_DE_LA_VENTANA = 6;

export function ventanaDeTareas<T extends TurnoDelLibro>(turnos: readonly T[], tope = VENTANA_DE_TAREAS): T[] {
  let desde = 0;
  for (let i = turnos.length - 1; i >= 0; i--) {
    const t = turnos[i];
    if (esTurnoDeDesenlace(t) && leerDesenlace(t.contenido).desenlace?.ok !== false) {
      desde = i + 1;
      break;
    }
  }
  let ventana = turnos.slice(desde);
  if (ventana.length > tope) ventana = ventana.slice(Math.ceil((ventana.length - tope) / SALTO_DE_LA_VENTANA) * SALTO_DE_LA_VENTANA);
  while (ventana.length && ventana[0].rol !== "CSE") ventana = ventana.slice(1);
  return ventana;
}

/**
 * El texto del último desenlace aplicado (lo que se creó, con sus T-#). La ventana arranca DESPUÉS de él, así que sin
 * esto el modelo no sabe a qué se refiere «agéndalas» o «pásale la primera a Lidia» justo después de aplicar.
 */
export function ultimoDesenlaceAplicado(turnos: readonly TurnoDelLibro[]): string | null {
  for (let i = turnos.length - 1; i >= 0; i--) {
    const t = turnos[i];
    if (!esTurnoDeDesenlace(t)) continue;
    if (leerDesenlace(t.contenido).desenlace?.ok === false) continue;
    return textoVisible(t.contenido).trim() || null;
  }
  return null;
}
