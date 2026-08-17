import { esReimplementacion, tipoDeImplementacion, HUBSPOT_HUB_SLUGS, IMPLEMENTACION_TAG, REIMPLEMENTACION_TAG } from "@/lib/tags/catalog";

/**
 * lib/timeline/semana-cero-tareas.ts — LAS TAREAS QUE SIEMPRE ARRANCAN UN PROYECTO.
 *
 * Cinco entregables y accesos que no dependen de lo que el agente haya leído: van en la Semana 0
 * de todo cronograma nuevo. Las escribía el camino de persistencia del detalle, enterradas en una
 * ruta de 3.500 líneas y **sin un solo test** — a pesar de que una de ellas RAMIFICA por el tipo
 * de implementación y le cambia el texto y el responsable a una fila que el cliente lee.
 *
 * ── POR QUÉ SALE DE AHÍ ─────────────────────────────────────────────────────
 * La primera generación del detalle escribe las tareas DIRECTO, sin la curación que sí tiene todo
 * el resto del cronograma. Para mandarla por la curación —que es lo que falta— estas cinco tienen
 * que poder calcularse SIN escribir: si se quedan en el camino que persiste, pasar por revisión
 * las haría desaparecer. Extraerlas es el prerrequisito, y de paso les da la cobertura que nunca
 * tuvieron.
 *
 * ── ⛔ Y NO APLICAN SIEMPRE (decisión de negocio, 2026-08-17) ───────────────
 * Las cinco son de una implementación de HubSpot: pedir el portal, los usuarios del CRM, la lista
 * de HubSpot Academy. Se sembraban en TODO cronograma nuevo, así que un proyecto que no toca
 * HubSpot arrancaba pidiéndole al cliente accesos a un producto que no compró — y eso lo lee el
 * cliente. Medido el 2026-08-17 sobre producción: de 132 proyectos activos, **85 no tienen
 * ninguna señal de HubSpot** en sus tags.
 *
 * La señal es el catálogo de tags, que es donde el negocio ya declara de qué se trata el proyecto:
 * algún hub de HubSpot, o el punto de partida (implementación / re-implementación).
 * ⚠ «Licencia de HubSpot» NO existe como dato del proyecto. Lo más cercano —los seats de
 * `PartnerUsageSnapshot`— es de CUENTA, no de proyecto, y está declarado confidencial por términos
 * de partner: usarlo acá metería ese dato en un documento que el cliente abre.
 *
 * ── ⛔ LA RAMA QUE IMPORTA: TRES ESTADOS, NO DOS ────────────────────────────
 * La tarea de base de datos tiene dos caras — «entregá la base a importar» (desde cero) y «revisá
 * y limpiá la existente» (re-implementación)—. Y el tipo puede estar SIN DEFINIR, que no es lo
 * mismo que «desde cero»: ahí se siembra el camino de siempre PERO marcada `porValidar`, para que
 * el CSE vea un pendiente en vez de recibir una afirmación que nadie hizo.
 *
 * ── Y LA GEMELA, QUE ES POR QUÉ EL DEDUP MIRA DOS TÍTULOS ───────────────────
 * Un proyecto sembrado como «implementación» y después reclasificado a «re-implementación» recibía
 * la segunda conservando la primera, y la Semana 0 terminaba pidiendo cargar la base Y limpiar la
 * existente a la vez. Por eso cada cara declara el título de su gemela y el dedup mira las dos.
 */

/** Una tarea fija lista para crear (o para mostrar en la curación). */
export interface TareaFija {
  title: string;
  party: "CLIENTE" | "SMARTEAM" | "AMBOS";
  weekIndex: 0;
  order: number;
  notes: null;
  /** `true` solo en la de base de datos cuando el tipo de implementación no está definido. */
  needsValidation: boolean;
  /** Entregables y accesos, no reuniones. */
  type: "TASK";
}

/**
 * ¿Este proyecto involucra HubSpot? Es el gate de las cinco tareas fijas.
 *
 * Se contesta con el catálogo de tags —la declaración de negocio de qué es el proyecto— y no con
 * el pipeline: un desarrollo puede ser una integración CON HubSpot (SAP ↔ HubSpot) y ahí pedir el
 * acceso al portal es exactamente lo correcto. El pipeline dice quién lo ejecuta; los tags dicen
 * qué producto toca, que es la pregunta de esta decisión.
 *
 * ⚠ Sin tags NO aplica. Es deliberado y es el lado seguro: sembrar de más le pide al cliente cosas
 * que no compró (y las lee), sembrar de menos deja una Semana 0 corta que el CSE completa en un
 * minuto. El costo de los dos errores no es simétrico.
 */
export function proyectoInvolucraHubSpot(tags: readonly string[]): boolean {
  return tags.some(
    (t) =>
      (HUBSPOT_HUB_SLUGS as readonly string[]).includes(t) ||
      t === IMPLEMENTACION_TAG ||
      t === REIMPLEMENTACION_TAG,
  );
}

/** Las dos caras del MISMO renglón del plan. */
const TAREA_BD_DESDE_CERO = { title: "Proporcionar bases de datos a importar", party: "CLIENTE" as const };
const TAREA_BD_EXISTENTE = { title: "Revisar y limpiar la base de datos existente", party: "AMBOS" as const };

const normalizar = (s: string) => s.trim().toLowerCase();

/**
 * Qué tareas fijas hay que sembrar en la Semana 0.
 *
 * @param tags              tags YA saneados del proyecto. Deciden DOS cosas: si las tareas
 *                          aplican (¿toca HubSpot?) y, si aplican, la rama de base de datos.
 * @param titulosExistentes títulos que ya están en esa fase — se deduplica contra ellos, y contra
 *                          la gemela de la de base de datos.
 * @param ordenDesde        desde qué `order` numerar (normalmente, cuántas tareas hay ya en la
 *                          semana 0), para no pisar el orden de lo que el agente propuso.
 */
export function tareasFijasDeSemanaCero(
  tags: readonly string[],
  titulosExistentes: readonly string[],
  ordenDesde = 0,
): TareaFija[] {
  /* ⛔ El gate va PRIMERO y adentro de la función, no en el llamador: son dos caminos los que la
     invocan (el preview de una fase y el de todas) y un gate por fuera se olvida en uno de los dos
     — que es exactamente cómo estas tareas terminaron en proyectos que no tocan HubSpot. */
  if (!proyectoInvolucraHubSpot(tags)) return [];

  const tipo = tipoDeImplementacion([...tags]);
  const esReimpl = esReimplementacion([...tags]);

  const candidatas: Array<{
    title: string;
    party: "CLIENTE" | "SMARTEAM" | "AMBOS";
    porValidar?: boolean;
    gemela?: string;
  }> = [
    { title: "Entregar documentación de procesos involucrados", party: "CLIENTE" },
    {
      ...(esReimpl ? TAREA_BD_EXISTENTE : TAREA_BD_DESDE_CERO),
      // Sin tipo definido se asume el camino de siempre, pero marcada: el CSE ve el pendiente en
      // vez de recibir una afirmación que nadie hizo.
      porValidar: tipo === null,
      gemela: (esReimpl ? TAREA_BD_DESDE_CERO : TAREA_BD_EXISTENTE).title,
    },
    { title: "Entregar listado de usuarios a ingresar al CRM", party: "CLIENTE" },
    { title: "Asignar la lista de reproducción de HubSpot Academy al cliente", party: "SMARTEAM" },
    { title: "Proporcionar acceso al portal de HubSpot a Smarteam", party: "CLIENTE" },
  ];

  const yaEstan = new Set(titulosExistentes.map(normalizar));
  return candidatas
    .filter((t) => !yaEstan.has(normalizar(t.title)) && !(t.gemela && yaEstan.has(normalizar(t.gemela))))
    .map((t, i) => ({
      title: t.title,
      party: t.party,
      weekIndex: 0 as const,
      order: ordenDesde + i,
      notes: null,
      needsValidation: t.porValidar === true,
      type: "TASK" as const,
    }));
}

/**
 * Cuál de las fases hace de «Semana 0»: la primera por orden, con fallback por nombre para los
 * cronogramas viejos («Kick-off», «Semana 0 – Arranque»). `null` si no hay fases.
 *
 * ⚠ Vive acá y no suelta adentro de una ruta porque ahora la preguntan DOS caminos —el preview de
 * todas las fases y el de una sola— y si divergen, las cinco tareas se siembran en la fase
 * equivocada (o en ninguna) sin que nada falle.
 */
export function elegirFaseDeSemanaCero<T extends { order: number; name: string }>(
  phases: readonly T[],
): T | null {
  return (
    phases.find((p) => p.order === 0) ??
    phases.find((p) => {
      const n = p.name.trim().toLowerCase();
      return n.includes("semana 0") || n.includes("kick");
    }) ??
    null
  );
}
