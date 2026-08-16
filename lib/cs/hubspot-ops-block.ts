/**
 * lib/cs/hubspot-ops-block.ts — EL ESTADO DEL PROYECTO, EN PALABRAS QUE UN AGENTE ENTIENDE.
 *
 * ── EL CABLE QUE FALTABA ─────────────────────────────────────────────────────
 * HubSpot ya sabe si un proyecto está retrasado, bloqueado, en pausa o en riesgo; sabe su
 * prioridad, el motivo del bloqueo con su detalle escrito a mano, y el estado de adopción. Las
 * cinco señales están espejadas en `Project` desde hace meses (`sync-projects.ts`) y las leen los
 * dos vigilantes de Éxito del Cliente.
 *
 * Y **ningún redactor de documentos las veía**: ni el handoff, ni el detalle del cronograma, ni el
 * agente de avance, ni el kickoff, ni la entrega. Nexus escribía documentos sobre un proyecto
 * trabado sin saber que estaba trabado. Esto es cañería, no dato nuevo.
 *
 * ── POR QUÉ EN CASTELLANO Y NO EL CRUDO ──────────────────────────────────────
 * El valor que guarda HubSpot es `on_track` / `at_risk` / `on_hold`. Había DOS serializadores en
 * el repo: el del vigilante mandaba el crudo, el del resumen de cuenta traducía. Se unifica en el
 * que traduce. Un modelo al que se le dice `at_risk` puede escribirle «at_risk» al CSE en el
 * documento, y además pierde el matiz entre «en riesgo» (todavía no se corrió) y «retrasado» (ya
 * se corrió) — que en esta tabla son dos cosas distintas y el equipo las usa distinto.
 *
 * ⚠ El vocabulario vive en `chart-theme.ts` porque ahí nació y ahí lo consumen las dos pantallas
 * de CS. `account-brief.ts` ya lo importaba desde `lib/`; se sigue el mismo camino en vez de
 * abrir una segunda copia de la tabla, que es la forma conocida de que dos rótulos se separen.
 */
import { HS_STATUS_LABEL, PRIORITY_META } from "@/components/cs/dashboard/chart-theme";

/** Las cinco columnas CS360 de `Project`, tal como las deja el espejo de HubSpot. */
export interface OperativaDeProyecto {
  hubspotStatus: string | null;
  hubspotPriority: string | null;
  hubspotBlockReason: string | null;
  hubspotBlockDetail: string | null;
  hubspotAdoptionState: string | null;
}

/** El rótulo del bloque. Dice quién lo escribió para que el modelo sepa cuánto pesa. */
export const ROTULO_OPERATIVA =
  "=== ESTADO DEL PROYECTO EN HUBSPOT (lo carga el equipo a mano — es un hecho, no una inferencia) ===";

/** Cuánto detalle del bloqueo se manda. Es texto libre y alguno trae un parte de guerra entero. */
const MAX_DETALLE = 400;

/** ¿Hay algo que contar? Sin esto, un proyecto sin cargar produciría un bloque de puros "sin valor". */
export function hayOperativa(o: OperativaDeProyecto): boolean {
  return Boolean(
    o.hubspotStatus || o.hubspotPriority || o.hubspotBlockReason || o.hubspotAdoptionState,
  );
}

/**
 * El bloque listo para interpolar en un prompt. **Devuelve `""` cuando no hay nada** —
 * así el call site lo mete con `${bloque}` y no tiene que decidir nada.
 *
 * `incluirRotulo: false` para los prompts que arman sus propias cabeceras.
 */
export function bloqueDeOperativa(
  o: OperativaDeProyecto,
  opts?: { incluirRotulo?: boolean },
): string {
  if (!hayOperativa(o)) return "";

  const estado = o.hubspotStatus ? (HS_STATUS_LABEL[o.hubspotStatus] ?? o.hubspotStatus) : null;
  const prioridad = o.hubspotPriority
    ? (PRIORITY_META[o.hubspotPriority]?.label ?? o.hubspotPriority)
    : null;

  const lineas = [
    estado ? `- Estado: ${estado}` : null,
    prioridad ? `- Prioridad: ${prioridad}` : null,
    o.hubspotAdoptionState ? `- Adopción (según el CSE): ${o.hubspotAdoptionState}` : null,
    o.hubspotBlockReason
      ? `- Motivo registrado: ${o.hubspotBlockReason}` +
        (o.hubspotBlockDetail ? ` — detalle: ${o.hubspotBlockDetail.trim().slice(0, MAX_DETALLE)}` : "")
      : null,
  ].filter((l): l is string => l !== null);

  const cuerpo = lineas.join("\n");
  return opts?.incluirRotulo === false ? cuerpo : `${ROTULO_OPERATIVA}\n${cuerpo}`;
}
