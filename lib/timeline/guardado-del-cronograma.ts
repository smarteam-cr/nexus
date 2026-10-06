/**
 * lib/timeline/guardado-del-cronograma.ts — QUE EL AUTOGUARDADO Y EL DESHACER DEL CRONOGRAMA NO PIERDAN
 * DATOS (auditoría del deshacer, 2026-10-05).
 *
 * Puro y sin Prisma: lo usan la ruta del PUT (/timeline) y la pantalla (CronogramaCanvas). Cada pieza
 * cierra un hueco que la auditoría encontró en el Ctrl+Z / «Deshacer» que está en producción:
 *
 *  T1 · Deshacer un borrado (o mover una tarea de fase) DESPUÉS de que el autoguardado lo escribió manda
 *       el id de una fila que ya no existe. El PUT respondía 400 («no pertenece a la fase») y cada
 *       edición siguiente reintentaba el mismo guardado: todo lo editado después se perdía al recargar.
 *       Ahora la fila con un id que ya no existe se RECREA (`queHacerConLaTarea`, `datosParaRecrearTarea`)
 *       y la respuesta dice qué id nuevo tomó (`adoptarIdsRecreados`). Un error de guardado ya no deja
 *       la pantalla trabada: `trasUnGuardadoFallido` dice qué mostrar y si tiene sentido reintentar.
 *  T2 · Una foto VIEJA (una pestaña de antes, un deshacer después de que el servidor escribió) borraba en
 *       cascada lo que el servidor había creado. El autoguardado manda la versión en la que se basó su
 *       foto (`versionDelCronograma`, calculada SIEMPRE por el servidor) y, si el cronograma cambió, el
 *       PUT responde 409 en vez de pisar.
 *  T5 · Una tarea escrita a mano no se podía borrar: la protección de `isKept` la reponía. El borrado
 *       EXPLÍCITO de la persona viaja aparte (`borradasAMano`, `leerBorradas`), y solo lo honra el
 *       autoguardado: ni el chat ni una regeneración pueden usarlo.
 *
 * ⚠ LA VERSIÓN NO ES `updatedAt`. `ProjectTimeline.updatedAt` sube con CUALQUIER escritura de la fila:
 * cada casilla de la propuesta (`pendingProposal`), cada corrida de avance (`pendingProgress`), publicar,
 * confirmar el detalle. Con ella, editar el Gantt con una propuesta abierta —que está permitido— chocaría
 * con un 409 en cada casilla. La versión es una HUELLA de lo único que el PUT escribe: fases, tareas, el
 * arranque y el cierre fijado. El estado de las tareas no entra: el PUT no lo escribe (va por PATCH), así
 * que marcar una tarea hecha no vuelve vieja la foto de nadie.
 */
import { fingerprintFromTitle } from "./particularidad-identity";

// ── T2 · LA VERSIÓN DEL CRONOGRAMA ───────────────────────────────────────────────────────────────

type Fecha = Date | string | null | undefined;

/** Una fecha en el mismo ISO que produce la base (`Date.toISOString()`), o null. */
function iso(v: Fecha): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

export interface TareaVersionada {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  notes?: string | null;
  party?: string | null;
  type?: string | null;
  startDateOverride?: Fecha;
  dueDateOverride?: Fecha;
}

export interface FaseVersionada {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  tasks: readonly TareaVersionada[];
}

export interface CronogramaVersionado {
  anchorStartDate?: Fecha;
  closeDateOverride?: Fecha;
  phases: readonly FaseVersionada[];
}

/** cyrb53: un hash de 53 bits, determinista e isomorfo (la pantalla también importa este archivo). */
function cyrb53(s: string, semilla = 0): number {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * ⭐ LA VERSIÓN de lo que el PUT escribe: las fases (con sus campos), las tareas de CADA fase (con los
 * suyos), el arranque y el cierre fijado. Ordenada por id: no depende del orden en que la base las
 * devuelva. La calcula SIEMPRE el servidor (el GET y la respuesta del PUT la traen; la pantalla solo la
 * devuelve): así las dos puntas nunca discrepan por cómo cada una normaliza.
 *
 * Mover una tarea de fase la cambia (la tarea cuelga de otra fase); marcarla hecha, no.
 */
export function versionDelCronograma(c: CronogramaVersionado): string {
  const fases = [...c.phases].sort(porId).map((p) => [
    p.id,
    p.name,
    p.order,
    p.durationWeeks,
    p.startWeek ?? null,
    p.sessionCount ?? null,
    p.notes ?? null,
    p.activityType ?? null,
    [...p.tasks].sort(porId).map((t) => [
      t.id,
      t.title,
      t.weekIndex,
      t.order,
      t.notes ?? null,
      t.party ?? null,
      t.type ?? null,
      iso(t.startDateOverride),
      iso(t.dueDateOverride),
    ]),
  ]);
  const canon = JSON.stringify([iso(c.anchorStartDate), iso(c.closeDateOverride), fases]);
  return `${cyrb53(canon).toString(36)}-${cyrb53(canon, 7).toString(36)}`;
}

/** El código del 409 de una foto vieja (lo distingue del de la propuesta abierta). */
export const CODIGO_CRONOGRAMA_CAMBIO = "CRONOGRAMA_CAMBIO";

export const MENSAJE_CRONOGRAMA_CAMBIO =
  "El cronograma cambió desde que lo abriste (en otra pestaña, otra persona o una acción del sistema): " +
  "recarga para ver la versión actual. Lo último que cambiaste no se guardó.";

/** La versión en la que se basó la foto, del body del PUT. null = no vino (los demás llamadores). */
export function leerVersionBase(body: unknown): string | null {
  const v = (body as { version?: unknown } | null)?.version;
  return typeof v === "string" && v.length > 0 && v.length <= 100 ? v : null;
}

/** ¿La foto se basó en OTRA versión que la de la base? Sin versión (otro llamador), no se compara. */
export function fotoVieja(base: string | null, actual: string): boolean {
  return base !== null && base !== actual;
}

// ── T1 · UNA FILA CON UN ID QUE YA NO EXISTE SE RECREA ──────────────────────────────────────────

/**
 * Qué hace el PUT con una tarea del body:
 *  · «crear» — viene sin id (nueva, o movida de fase: la pantalla le suelta el id);
 *  · «actualizar» — su id es de ESTA fase;
 *  · «recrear» — su id ya no existe en el cronograma (se borró y la persona lo deshizo): vuelve como
 *    fila nueva con lo que la pantalla sabe de ella. Antes era un 400 que trababa el guardado;
 *  · «de-otra-fase» — su id existe, pero en OTRA fase: el body es incoherente (el PUT no mueve por id).
 *    Sigue siendo un 400, ahora con un texto que se entiende.
 */
export type DestinoDeLaTarea = "crear" | "actualizar" | "recrear" | "de-otra-fase";

export function queHacerConLaTarea(
  id: string | undefined,
  idsDeEstaFase: { has(id: string): boolean },
  idsDelCronograma: { has(id: string): boolean },
): DestinoDeLaTarea {
  if (!id) return "crear";
  if (idsDeEstaFase.has(id)) return "actualizar";
  if (idsDelCronograma.has(id)) return "de-otra-fase";
  return "recrear";
}

export const ESTADOS_DE_TAREA = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;
export const ORIGENES = ["AGENT", "MODIFIED", "HUMAN"] as const;
export const ORIGENES_DEL_ESTADO = ["HUMAN", "AI_CONFIRMED"] as const;
export type EstadoDeTarea = (typeof ESTADOS_DE_TAREA)[number];
export type Origen = (typeof ORIGENES)[number];
export type OrigenDelEstado = (typeof ORIGENES_DEL_ESTADO)[number];

/**
 * Lo que la pantalla sabe de una fila con id y el PUT NO escribe (el estado y su procedencia, el origen):
 * viaja en `respaldo` y el servidor lo lee SOLO si tiene que recrear la fila. Para una fila que existe se
 * ignora: el estado va por PATCH (PUT = estructura).
 */
export interface RespaldoDeTarea {
  status?: EstadoDeTarea;
  source?: Origen;
  statusSource?: OrigenDelEstado;
  statusChangedAt?: string;
  statusChangedByEmail?: string;
  needsValidation?: boolean;
}

export interface RespaldoDeFase {
  status?: EstadoDeTarea;
  source?: Origen;
}

const de = <T extends string>(lista: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : undefined;

/**
 * Lee el respaldo con tolerancia: lo que no se entiende se IGNORA, no es un error. Un respaldo raro no
 * puede trabar el guardado de todo lo demás (es justo lo que este archivo vino a cerrar).
 */
export function leerRespaldoDeTarea(raw: unknown): RespaldoDeTarea | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const fecha = typeof r.statusChangedAt === "string" && !Number.isNaN(Date.parse(r.statusChangedAt)) ? r.statusChangedAt : undefined;
  const email =
    typeof r.statusChangedByEmail === "string" && r.statusChangedByEmail.length > 0 && r.statusChangedByEmail.length <= 320
      ? r.statusChangedByEmail
      : undefined;
  return {
    status: de(ESTADOS_DE_TAREA, r.status),
    source: de(ORIGENES, r.source),
    statusSource: de(ORIGENES_DEL_ESTADO, r.statusSource),
    statusChangedAt: fecha,
    statusChangedByEmail: email,
    needsValidation: typeof r.needsValidation === "boolean" ? r.needsValidation : undefined,
  };
}

export function leerRespaldoDeFase(raw: unknown): RespaldoDeFase | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return { status: de(ESTADOS_DE_TAREA, r.status), source: de(ORIGENES, r.source) };
}

/**
 * Con qué datos vuelve una tarea recreada, además de lo que el body ya trae (título, fase, semana,
 * orden, nota, dueño, tipo y fechas fijadas). Sin respaldo, como una tarea nueva de ese mismo camino
 * (`origenPorDefecto`: HUMAN a mano, MODIFIED si la dictó el chat) y PENDING.
 *
 * ⚠ Lo que NO vuelve: las fechas reales de ejecución (`actualStart`/`actualEnd`), el vínculo con el hecho
 * que la originó y la fecha comprometida. La pantalla no las tiene, y inventarlas sería peor.
 */
export function datosParaRecrearTarea(
  r: RespaldoDeTarea | undefined,
  origenPorDefecto: Origen,
): {
  status: EstadoDeTarea;
  source: Origen;
  statusSource: OrigenDelEstado;
  statusChangedAt: Date | null;
  statusChangedByEmail: string | null;
  needsValidation: boolean;
} {
  const status = r?.status ?? "PENDING";
  return {
    status,
    source: r?.source ?? origenPorDefecto,
    statusSource: r?.statusSource ?? "HUMAN",
    // Quién y cuándo, solo si la tarea vuelve con un estado que alguien marcó.
    statusChangedAt: status !== "PENDING" && r?.statusChangedAt ? new Date(r.statusChangedAt) : null,
    statusChangedByEmail: status !== "PENDING" ? (r?.statusChangedByEmail ?? null) : null,
    needsValidation: r?.needsValidation ?? false,
  };
}

/** Con qué datos vuelve una fase recreada (una fase borrada cuyo borrado se deshizo). */
export function datosParaRecrearFase(
  r: RespaldoDeFase | undefined,
): { status: EstadoDeTarea; source: Origen } {
  return { status: r?.status ?? "PENDING", source: r?.source ?? "HUMAN" };
}

/**
 * Las huellas de título de las tareas que se van a RECREAR (id que ya no existe en el cronograma).
 *
 * Deshacer «Tarea movida» después del autoguardado manda la tarea de vuelta a su fase con su id viejo
 * (borrado al moverla), mientras la copia que se creó en la fase destino —sin id en la foto vieja— ya
 * no viaja. Esa copia nació HUMAN, así que `isKept` la protegería y quedaría DUPLICADA. Volver a su
 * fase es un movimiento: su huella entra en «lo que se está moviendo» (`huellasEnMovimiento`) y la
 * copia omitida se puede borrar. Misma regla, mismo precio documentado en rescate-progreso.ts.
 */
export function huellasDeLasRecreadas(
  fases: readonly { tasks?: readonly { id?: string; title: string }[] }[],
  idsDelCronograma: { has(id: string): boolean },
): Set<string> {
  const huellas = new Set<string>();
  for (const p of fases) {
    for (const t of p.tasks ?? []) {
      if (!t.id || idsDelCronograma.has(t.id)) continue;
      const h = fingerprintFromTitle(t.title);
      if (h) huellas.add(h);
    }
  }
  return huellas;
}

/** Los ids viejos → nuevos de lo que el PUT recreó (viajan en la respuesta). */
export interface IdsRecreados {
  fases?: Record<string, string>;
  tareas?: Record<string, string>;
}

/** ¿La respuesta trae ids recreados? Tolerante: lo que no es un mapa de strings se ignora. */
export function leerIdsRecreados(raw: unknown): IdsRecreados | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mapa = (v: unknown): Record<string, string> | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const salida: Record<string, string> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string" && x) salida[k] = x;
    return Object.keys(salida).length > 0 ? salida : undefined;
  };
  const fases = mapa(r.fases);
  const tareas = mapa(r.tareas);
  return fases || tareas ? { fases, tareas } : null;
}

/**
 * ⭐ La pantalla ADOPTA los ids de lo recreado, por id (nunca por posición). Sin esto, el guardado
 * siguiente volvería a mandar el id viejo y el servidor recrearía la fila otra vez: una fila nueva por
 * cada guardado. La `_key` (la de React y la del cajón abierto) no cambia.
 * Devuelve el MISMO arreglo si no hubo nada que cambiar.
 */
export function adoptarIdsRecreados<F extends { id?: string; tasks: { id?: string }[] }>(
  fases: F[],
  recreados: IdsRecreados | null,
): F[] {
  if (!recreados) return fases;
  const deFase = recreados.fases ?? {};
  const deTarea = recreados.tareas ?? {};
  let cambio = false;
  const salida = fases.map((p): F => {
    const nuevoId = p.id ? deFase[p.id] : undefined;
    let tareasCambiaron = false;
    const tasks = p.tasks.map((t) => {
      const id = t.id ? deTarea[t.id] : undefined;
      if (!id) return t;
      tareasCambiaron = true;
      return { ...t, id };
    });
    if (!nuevoId && !tareasCambiaron) return p;
    cambio = true;
    return { ...p, ...(nuevoId ? { id: nuevoId } : {}), tasks } as unknown as F;
  });
  return cambio ? salida : fases;
}

/** Sigue la cadena viejo → nuevo (una fila se puede recrear más de una vez en la misma sesión). */
export function idVigente(id: string, recreados: ReadonlyMap<string, string>): string {
  let actual = id;
  for (let vueltas = 0; vueltas < 20; vueltas++) {
    const siguiente = recreados.get(actual);
    if (!siguiente || siguiente === actual) return actual;
    actual = siguiente;
  }
  return actual;
}

/**
 * Lo recreado en la sesión, con cada cadena resuelta a su último id. Con esto la pantalla TRADUCE una foto
 * vieja del deshacer antes de ponerla: la fila recreada se edita en su lugar en vez de recrearse otra vez
 * (y perder de nuevo lo que la pantalla no sabe de ella). Los ids son únicos entre fases y tareas, así que
 * un solo mapa sirve para las dos.
 */
export function idsVigentes(recreados: ReadonlyMap<string, string>): IdsRecreados | null {
  if (recreados.size === 0) return null;
  const mapa: Record<string, string> = {};
  for (const viejo of recreados.keys()) mapa[viejo] = idVigente(viejo, recreados);
  return { fases: mapa, tareas: mapa };
}

// ── T5 · EL BORRADO EXPLÍCITO DE LA PERSONA ─────────────────────────────────────────────────────

/**
 * Los ids que la persona borró A MANO (el «Eliminar tarea» del cajón) y que la foto que se manda ya no
 * tiene. Si la tarea volvió (la persona lo deshizo), no se manda: está en la foto.
 */
export function borradasAMano(
  registradas: ReadonlySet<string>,
  fases: readonly { tasks: readonly { id?: string }[] }[],
): string[] {
  const presentes = new Set<string>();
  for (const p of fases) for (const t of p.tasks) if (t.id) presentes.add(t.id);
  return [...registradas].filter((id) => !presentes.has(id));
}

/** Las borradas a mano, del body del PUT: strings no vacíos, sin repetir, con tope. */
export function leerBorradas(body: unknown): string[] {
  const v = (body as { borradas?: unknown } | null)?.borradas;
  if (!Array.isArray(v)) return [];
  const ids = v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100);
  return [...new Set(ids)].slice(0, 500);
}

/**
 * ¿Este PUT puede borrar lo protegido que la persona borró a mano? Solo el autoguardado de la pantalla
 * (MANUAL) y solo con el permiso de borrar del cronograma. El chat (AI_ASSIST) nunca: sus operaciones
 * ya deciden qué se puede borrar (`isKept`), y una regeneración no pasa por este PUT.
 */
export function honrarBorradas(kind: "MANUAL" | "AI_ASSIST", puedeBorrar: boolean): boolean {
  return kind === "MANUAL" && puedeBorrar;
}

// ── T1 · UN GUARDADO QUE FALLA NO TRABA LA PANTALLA ─────────────────────────────────────────────

export interface DesenlaceDelGuardadoFallido {
  /** Lo que dice la franja de error (tuteo, sin códigos). */
  mensaje: string;
  /** No volver a intentar con la próxima edición: el servidor va a responder lo mismo hasta recargar. */
  bloquear: boolean;
  /** La franja ofrece «Recargar» (volver a lo último guardado). */
  ofrecerRecarga: boolean;
}

/**
 * Qué hace la pantalla cuando el autoguardado falla. `status` null = no hubo respuesta (sin conexión).
 *  · 409 de foto vieja: no se reintenta (cada intento sería otro 409); se ofrece recargar.
 *  · otro 4xx: el body no se pudo guardar; se puede seguir editando (una edición puede arreglarlo) y se
 *    ofrece recargar para salir si no.
 *  · 5xx o sin conexión: se reintenta con la próxima edición, como siempre.
 */
export function trasUnGuardadoFallido(status: number | null, cuerpo: unknown): DesenlaceDelGuardadoFallido {
  const c = (cuerpo ?? {}) as { code?: unknown; error?: unknown; details?: unknown };
  const detalle =
    Array.isArray(c.details) && typeof c.details[0] === "string"
      ? c.details[0]
      : typeof c.error === "string" && c.error.trim()
        ? c.error.trim()
        : null;
  if (status === 409 && c.code === CODIGO_CRONOGRAMA_CAMBIO) {
    return { mensaje: MENSAJE_CRONOGRAMA_CAMBIO, bloquear: true, ofrecerRecarga: true };
  }
  if (status === null) {
    return {
      mensaje: "Error de conexión al guardar: lo último que cambiaste todavía no está guardado. Se vuelve a intentar con tu próxima edición.",
      bloquear: false,
      ofrecerRecarga: false,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      mensaje:
        `No se pudo guardar el cronograma${detalle ? ` (${detalle.replace(/\.$/, "")})` : ""}. ` +
        "Puedes seguir editando; si vuelve a fallar, recarga para volver a lo último guardado.",
      bloquear: false,
      ofrecerRecarga: true,
    };
  }
  return {
    mensaje: `${detalle ?? "No se pudo guardar el cronograma."} Se vuelve a intentar con tu próxima edición.`,
    bloquear: false,
    ofrecerRecarga: true,
  };
}

/** Lo que dice la pantalla cuando una escritura del servidor vació lo que había para deshacer (T2). */
export const AVISO_DESHACER_VACIADO =
  "El cronograma se actualizó: lo que cambiaste antes ya no se puede deshacer.";
