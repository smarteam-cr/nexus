/**
 * lib/timeline/operaciones.ts — EL CRONOGRAMA SE EDITA CON OPERACIONES, NO REESCRIBIÉNDOLO.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── POR QUÉ EXISTE, MEDIDO ───────────────────────────────────────────────────────────────────
 * Hasta hoy, cambiar el cronograma con IA significaba pedirle al modelo que devolviera el
 * cronograma ENTERO. Medido contra Wherex el 2026-08-20, para acortar UNA fase:
 *
 *   · devolver el documento completo   → **217 s** · 12.800 tokens de salida · $0,23
 *   · devolver solo las fases tocadas  →   19,5 s ·  1.145 tokens
 *   · devolver OPERACIONES             →    **1,9 s** ·     81 tokens · $0,003
 *
 * **114× más rápido y 75× más barato.** Y no hay razonamiento que optimizar: `thinking: 0`. Son
 * 12.800 tokens de JSON transcritos a ~59 tok/s para cambiar un número.
 *
 * ── ⛔ PERO LA RAZÓN DE FONDO NO ES LA VELOCIDAD: ES QUE EL CONTRATO ROMPE COSAS ──────────────
 * El mismo día, Elías pidió BORRAR UNA FASE. La propuesta volvió con «6 fases modificadas · se
 * corrió la fecha de cierre 70 días»: al re-emitir todo, el modelo soltó el `startWeek` de seis
 * fases que corrían en PARALELO, y el proyecto pasó de 17 a 27 semanas. Nadie pidió eso.
 *
 * Es inherente al contrato: si el modelo tiene que re-emitir cada campo de cada fase en cada
 * edición, **cada campo de cada fase está en riesgo en cada edición**. Una operación toca lo que
 * nombra. Lo que no se nombra no se puede romper.
 *
 * ── ⭐ Y LO QUE HABILITA, QUE HOY ES IMPOSIBLE ───────────────────────────────────────────────
 * Con el contrato viejo, «el modelo se olvidó de incluir la tarea» y «el humano pidió borrarla»
 * llegan IGUAL: la tarea no está en el payload. Por eso `rescatarProgreso` tiene que asumir
 * accidente y reponerla — asumir intención le haría perder trabajo real a alguien.
 *
 * Con operaciones son dos cosas distintas por construcción: una OMISIÓN se rescata, y un
 * `tarea.borrar` con nombre y apellido se ejecuta. Eso es lo que deja que el chat pueda borrar lo
 * que escribió un humano, previa doble confirmación — que es lo que pidió Elías.
 *
 * ── ⛔ ESTO NO ESCRIBE ───────────────────────────────────────────────────────────────────────
 * Produce el MISMO payload que ya acepta el PUT del cronograma. Escribir sigue siendo del PUT,
 * con su rescate de progreso, su reparación de semanas, su validación y su auditoría. Abrir un
 * segundo camino de escritura sería repetir el error del que salieron las 34 tareas rotas que se
 * encontraron el 2026-08-20 (dos puertas, a las dos les faltaba el mismo guardia).
 */
import type { FaseActual, PayloadProyectado, Party, TipoDeTarea } from "./assist-items";
import { resolverHandle } from "./handle-de-tarea";
import { isKept } from "./regen-columnas";

/**
 * El vocabulario. ⛔ Es una lista CERRADA a propósito: lo que no está acá no se puede pedir, y el
 * chat tiene que DECIRLO en vez de elegir la operación más parecida. Una operación que no coincide
 * con la intención es rápida, silenciosa y equivocada — el peor modo de falla posible.
 */
export type Operacion =
  | { op: "fase.duracion"; phaseId: string; semanas: number }
  | { op: "fase.renombrar"; phaseId: string; nombre: string }
  | { op: "fase.borrar"; phaseId: string }
  | { op: "fase.redistribuir"; phaseId: string }
  | { op: "fase.mover"; phaseId: string; posicion: number }
  | { op: "fase.arranque-relativo"; phaseId: string; semana: number | null }
  | { op: "fase.crear"; nombre: string; semanas: number; posicion?: number }
  | { op: "fase.quitar-semana"; phaseId: string; semana: number }
  | { op: "fase.insertar-semana"; phaseId: string; semana: number }
  | { op: "fase.tipo"; phaseId: string; tipo: TipoDeActividad }
  | { op: "tarea.mover-semana"; taskId: string; semana: number }
  | { op: "tarea.mover-fase"; taskId: string; phaseId: string; semana?: number }
  | { op: "tarea.borrar"; taskId: string }
  | { op: "tarea.crear"; phaseId: string; titulo: string; semana: number; duenio?: Party; tipo?: TipoDeTarea }
  | { op: "tarea.renombrar"; taskId: string; titulo: string }
  | { op: "tarea.duenio"; taskId: string; duenio: Party }
  | { op: "tarea.tipo"; taskId: string; tipo: TipoDeTarea }
  | { op: "arranque"; fecha: string };

/** Los cinco tipos de actividad de una fase. Espejo de `ACTIVITY_TYPES` en `validate.ts`. */
export type TipoDeActividad =
  | "EXPLORACION"
  | "PLANIFICACION"
  | "CONFIGURACION"
  | "ADOPCION"
  | "SEGUIMIENTO";

export const OPERACIONES_VALIDAS = [
  "fase.duracion",
  "fase.renombrar",
  "fase.borrar",
  "fase.redistribuir",
  "fase.mover",
  "fase.arranque-relativo",
  "fase.crear",
  "fase.quitar-semana",
  "fase.insertar-semana",
  "fase.tipo",
  "tarea.mover-semana",
  "tarea.mover-fase",
  "tarea.borrar",
  "tarea.crear",
  "tarea.renombrar",
  "tarea.duenio",
  "tarea.tipo",
  "arranque",
] as const;

/** Los valores cerrados que puede tomar el dueño de una tarea. Espejo de `PARTY_VALUES`. */
export const DUENIOS_VALIDOS = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;
export const TIPOS_DE_TAREA_VALIDOS = ["SESSION", "TASK"] as const;
export const TIPOS_DE_ACTIVIDAD_VALIDOS = [
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
] as const;

export interface OperacionRechazada {
  operacion: Operacion;
  motivo: string;
}

export interface ResultadoDeOperaciones {
  /** El cuerpo que acepta el PUT del cronograma, tal cual. */
  payload: PayloadProyectado;
  /** Lo que el sistema hizo además de lo pedido (semanas acomodadas, tareas recreadas). */
  avisos: string[];
  /** ⛔ Lo que NO se pudo hacer, y por qué. Nunca se ignora en silencio. */
  rechazadas: OperacionRechazada[];
}

/** Copia de trabajo: mutable, con la marca de si su fase fue TOCADA. */
interface FaseEnCurso {
  id?: string;
  /** Solo para las fases creadas en este lote: nunca sale al payload. Ver `fase.crear`. */
  idInterno?: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  tasks: {
    id?: string;
    title: string;
    weekIndex: number;
    order: number;
    notes: string | null;
    party?: Party | null;
    type?: TipoDeTarea | null;
    /* ⚠ `status` y `source` NO viajan al payload (el PUT no acepta status: route.ts:27). Se
       conservan acá porque son lo que decide si una tarea se puede borrar — ver `tarea.borrar`.
       Tirarlos, que es lo que hacía la primera versión, volvía el borrado mudo. */
    status?: string;
    source?: string;
  }[];
  /**
   * ⭐ LA MARCA QUE SOSTIENE TODO. Una fase intocada sale del payload SIN `tasks`, que en el
   * contrato del PUT significa «no tocar». Emitir el array siempre convertiría cada operación en
   * un diff completo de esa fase — y el PUT borra por omisión. Es la misma regla que ya sostiene
   * `assist-items.ts`, y por el mismo motivo.
   */
  tocada: boolean;
}

/** Los estados tal como los nombra la pantalla, para que el rechazo se lea igual que el Gantt. */
function estadoLegible(status: string | undefined): string {
  if (status === "DONE") return "hecha";
  if (status === "IN_PROGRESS") return "en curso";
  if (status === "SUSPENDED") return "suspendida";
  return "marcada";
}

export function aplicarOperaciones(
  actuales: readonly FaseActual[],
  anclaActual: string | null,
  operaciones: readonly Operacion[],
): ResultadoDeOperaciones {
  const avisos: string[] = [];
  const rechazadas: OperacionRechazada[] = [];

  const fases: FaseEnCurso[] = actuales.map((f) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek ?? null,
    sessionCount: f.sessionCount ?? null,
    notes: f.notes ?? null,
    activityType: f.activityType ?? null,
    tasks: f.tasks.map((t, i) => ({
      id: t.id,
      title: t.title,
      weekIndex: t.weekIndex,
      order: t.order ?? i,
      notes: t.notes ?? null,
      party: t.party ?? null,
      type: t.type ?? null,
      status: t.status,
      source: t.source,
    })),
    tocada: false,
  }));

  let ancla = anclaActual;

  /* ⛔ Nunca matchea contra `undefined`: una fase recién creada no tiene id, y sin este filtro
     `buscarFase(undefined)` la engancharía y una operación destinada a otra fase caería ahí. */
  const buscarFase = (phaseId: string) =>
    phaseId ? fases.find((f) => f.id === phaseId || f.idInterno === phaseId) : undefined;
  /**
   * ⭐ El chat nombra una tarea por su HANDLE (los últimos caracteres del id), porque el id
   * entero son 25 caracteres y el prefijo del chat tiene techo. Acepta también el id completo.
   *
   * ⛔ Ante dos candidatas NO elige: devuelve `ambigua` y quien llama rechaza. Elegir la primera
   * sería exactamente el modo de falla que este módulo existe para impedir (docblock de arriba):
   * rápido, silencioso y equivocado.
   */
  const buscarTarea = (
    referencia: string,
  ):
    | { fase: FaseEnCurso; tarea: FaseEnCurso["tasks"][number] }
    | { ambigua: number }
    | null => {
    const conId = fases.flatMap((f) => f.tasks.filter((t) => t.id).map((t) => ({ f, t })));
    const r = resolverHandle(referencia, conId.map((x) => x.t.id!));
    if (r.tipo === "ambigua") return { ambigua: r.cuantas };
    if (r.tipo === "ninguna") return null;
    const hit = conId.find((x) => x.t.id === r.id)!;
    return { fase: hit.f, tarea: hit.t };
  };

  /** Traduce el resultado de `buscarTarea` en el motivo del rechazo, con su número. */
  const motivoDeBusqueda = (hit: { ambigua: number } | null) =>
    hit
      ? `hay ${hit.ambigua} tareas que coinciden con ese identificador: hace falta el nombre exacto`
      : "esa tarea no existe en el cronograma";
  const noEncontrada = (
    hit: ReturnType<typeof buscarTarea>,
  ): hit is { ambigua: number } | null => hit === null || "ambigua" in hit;
  const rechazar = (operacion: Operacion, motivo: string) => rechazadas.push({ operacion, motivo });

  /** Acomoda las tareas que quedaron fuera de rango y reasigna `order` dentro de cada semana. */
  const normalizar = (f: FaseEnCurso) => {
    const ultima = Math.max(f.durationWeeks - 1, 0);
    let corridas = 0;
    for (const t of f.tasks) {
      const acotado = Math.min(Math.max(Math.floor(t.weekIndex), 0), ultima);
      if (acotado !== t.weekIndex) {
        t.weekIndex = acotado;
        corridas++;
      }
    }
    if (corridas > 0) {
      avisos.push(
        `En «${f.name}» ${corridas === 1 ? "1 tarea quedaba" : `${corridas} tareas quedaban`} ` +
          `fuera de las ${f.durationWeeks} ${f.durationWeeks === 1 ? "semana" : "semanas"}: ` +
          `${corridas === 1 ? "se movió" : "se movieron"} a la última.`,
      );
    }
    /* `order` secuencial POR SEMANA — es lo que exige el validador del PUT. */
    const porSemana = new Map<number, number>();
    for (const t of f.tasks.slice().sort((a, b) => a.weekIndex - b.weekIndex || a.order - b.order)) {
      const n = porSemana.get(t.weekIndex) ?? 0;
      t.order = n;
      porSemana.set(t.weekIndex, n + 1);
    }
  };

  for (const operacion of operaciones) {
    switch (operacion.op) {
      case "fase.duracion": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        if (!Number.isInteger(operacion.semanas) || operacion.semanas < 1) {
          rechazar(operacion, "una fase tiene que durar al menos 1 semana");
          break;
        }
        f.durationWeeks = operacion.semanas;
        f.tocada = true;
        normalizar(f);
        break;
      }

      case "fase.renombrar": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        if (!operacion.nombre.trim()) {
          rechazar(operacion, "el nombre no puede quedar vacío");
          break;
        }
        f.name = operacion.nombre.trim();
        break;
      }

      case "fase.borrar": {
        const i = fases.findIndex((f) => f.id === operacion.phaseId);
        if (i === -1) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        /* ⭐ Se borra de verdad. Es la diferencia entre una OMISIÓN del modelo (que el rescate del
           PUT repone, y está bien) y una intención que una persona pidió, leyó y confirmó. */
        const [fuera] = fases.splice(i, 1);
        if (fuera.tasks.length > 0) {
          avisos.push(
            `Se borró «${fuera.name}» con sus ${fuera.tasks.length} ` +
              `${fuera.tasks.length === 1 ? "tarea" : "tareas"}.`,
          );
        }
        break;
      }

      case "fase.redistribuir": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        /* Reparto parejo conservando el orden actual: el bloque i-ésimo va a la semana i·n/total.
           No reordena nada — mover trabajo de semana ya es bastante. */
        const total = f.tasks.length;
        const semanas = Math.max(f.durationWeeks, 1);
        const enOrden = f.tasks
          .slice()
          .sort((a, b) => a.weekIndex - b.weekIndex || a.order - b.order);
        enOrden.forEach((t, i) => {
          t.weekIndex = total === 0 ? 0 : Math.min(Math.floor((i * semanas) / total), semanas - 1);
        });
        f.tocada = true;
        normalizar(f);
        break;
      }

      case "fase.mover": {
        const i = fases.findIndex((f) => f.id === operacion.phaseId);
        if (i === -1) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        const destino = Math.min(Math.max(Math.floor(operacion.posicion), 0), fases.length - 1);
        const [f] = fases.splice(i, 1);
        fases.splice(destino, 0, f);
        break;
      }

      case "fase.arranque-relativo": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        /* ⚠ `null` = «auto» (arranca cuando termina la anterior). Es EXACTAMENTE el campo que el
           contrato viejo perdía solo y corría el cierre 70 días. Acá solo cambia si se lo nombra. */
        f.startWeek =
          operacion.semana === null ? null : Math.max(Math.floor(operacion.semana), 0);
        break;
      }

      case "tarea.mover-semana": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        hit.tarea.weekIndex = Math.max(Math.floor(operacion.semana), 0);
        hit.fase.tocada = true;
        normalizar(hit.fase);
        break;
      }

      case "tarea.mover-fase": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        const destino = buscarFase(operacion.phaseId);
        if (!destino) {
          rechazar(operacion, "la fase de destino no existe");
          break;
        }
        if (destino === hit.fase) break; // ya está ahí
        hit.fase.tasks = hit.fase.tasks.filter((t) => t !== hit.tarea);
        hit.fase.tocada = true;
        /* ⚠ SIN id en el destino: el cronograma no sabe mudar una tarea — la borra de un lado y la
           crea del otro, y con eso pierde su estado. Es la regla dura de siempre, y se avisa. */
        /* ⚠ La semana de destino es OPCIONAL, y por defecto la primera. Sin este parámetro una
           tarea mudada aterrizaba siempre en la semana 1 y no había forma de corregirla después:
           al recrearse pierde el id, así que un `tarea.mover-semana` posterior en el mismo lote
           se rechaza y tumba el acuerdo entero. */
        destino.tasks.push({
          ...hit.tarea,
          id: undefined,
          weekIndex: Math.max(Math.floor(operacion.semana ?? 0), 0),
        });
        destino.tocada = true;
        normalizar(hit.fase);
        normalizar(destino);
        avisos.push(
          `«${hit.tarea.title}» se recrea en «${destino.name}»: pierde su estado y sus fechas propias.`,
        );
        break;
      }

      case "tarea.borrar": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        /**
         * ⛔ EL BORRADO QUE SE PROMETÍA Y NO OCURRÍA (encontrado el 2026-08-21).
         *
         * Sacar la tarea del array NO la borra: el PUT decide qué borrar con
         * `idsBorrablesPorOmision` (`rescate-progreso.ts:149-153`), que **protege** todo lo que
         * `isKept` marca — hecha, en curso, suspendida, o cargada a mano. La fila sobrevivía, la
         * respuesta solo trae avisos de reubicación (`timeline/route.ts:1013`), y la cajita azul
         * ya había dicho «Se elimina «X»». El CSE leía un borrado que nunca pasó.
         *
         * Y no se arregla forzando: darle al PUT un canal para borrar lo protegido es abrir la
         * segunda puerta de escritura que este módulo existe para no abrir. Se arregla diciéndolo
         * ANTES, que además es lo que pidió Elías: que el chat avise que eso lo escribió un
         * humano en vez de borrarlo sin más.
         */
        if (isKept({ status: hit.tarea.status ?? "PENDING", source: hit.tarea.source })) {
          rechazar(
            operacion,
            `«${hit.tarea.title}» tiene trabajo humano encima ` +
              `(${hit.tarea.source === "HUMAN" ? "la cargó una persona" : "está " + estadoLegible(hit.tarea.status)})` +
              `: el cronograma no la borra. Hay que hacerlo desde el Gantt, a mano.`,
          );
          break;
        }
        hit.fase.tasks = hit.fase.tasks.filter((t) => t !== hit.tarea);
        hit.fase.tocada = true;
        normalizar(hit.fase);
        break;
      }

      case "fase.crear": {
        const nombre = operacion.nombre.trim();
        if (!nombre) {
          rechazar(operacion, "una fase sin nombre no se puede crear");
          break;
        }
        if (!Number.isInteger(operacion.semanas) || operacion.semanas < 1) {
          rechazar(operacion, "una fase dura al menos 1 semana");
          break;
        }
        /* ⚠ SIN id: el PUT crea la fila (`timeline/route.ts:678`, rama else del diff). Se le pone
           un id interno que NUNCA sale al payload, para que `buscarFase` no pueda engancharla por
           accidente — una fase sin identidad es un imán para operaciones que apuntaban a otra. */
        const nueva: FaseEnCurso = {
          id: undefined,
          idInterno: `nueva:${fases.length}`,
          name: nombre,
          durationWeeks: operacion.semanas,
          startWeek: null,
          sessionCount: null,
          notes: null,
          activityType: null,
          tasks: [],
          tocada: true,
        };
        const donde =
          typeof operacion.posicion === "number"
            ? Math.min(Math.max(Math.floor(operacion.posicion), 0), fases.length)
            : fases.length;
        fases.splice(donde, 0, nueva);
        break;
      }

      case "fase.quitar-semana": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        const w = Math.floor(operacion.semana);
        if (w < 0 || w >= f.durationWeeks) {
          rechazar(operacion, `«${f.name}» no tiene una semana ${w + 1}`);
          break;
        }
        if (f.durationWeeks <= 1) {
          rechazar(operacion, `«${f.name}» ya dura una sola semana: quitarla la dejaría en cero`);
          break;
        }
        /* Las que vivían en la semana que se va caen a la anterior (o a la que quedó primera, si
           se quitó la de arriba); las de más abajo suben una. La línea lo dice, con el número. */
        for (const t of f.tasks) {
          if (t.weekIndex === w) t.weekIndex = Math.max(w - 1, 0);
          else if (t.weekIndex > w) t.weekIndex -= 1;
        }
        f.durationWeeks -= 1;
        f.tocada = true;
        normalizar(f);
        break;
      }

      case "fase.insertar-semana": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        const w = Math.floor(operacion.semana);
        if (w < 0 || w > f.durationWeeks) {
          rechazar(operacion, `«${f.name}» no puede abrir una semana ${w + 1}`);
          break;
        }
        for (const t of f.tasks) if (t.weekIndex >= w) t.weekIndex += 1;
        f.durationWeeks += 1;
        f.tocada = true;
        normalizar(f);
        break;
      }

      case "fase.tipo": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        if (!(TIPOS_DE_ACTIVIDAD_VALIDOS as readonly string[]).includes(operacion.tipo)) {
          rechazar(operacion, `«${operacion.tipo}» no es un tipo de actividad`);
          break;
        }
        f.activityType = operacion.tipo;
        break;
      }

      case "tarea.crear": {
        const f = buscarFase(operacion.phaseId);
        if (!f) {
          rechazar(operacion, "esa fase no existe en el cronograma");
          break;
        }
        const titulo = operacion.titulo.trim();
        if (!titulo) {
          rechazar(operacion, "una tarea sin título no se puede crear");
          break;
        }
        if (operacion.duenio && !(DUENIOS_VALIDOS as readonly string[]).includes(operacion.duenio)) {
          rechazar(operacion, `«${operacion.duenio}» no es un dueño válido`);
          break;
        }
        if (
          operacion.tipo &&
          !(TIPOS_DE_TAREA_VALIDOS as readonly string[]).includes(operacion.tipo)
        ) {
          rechazar(operacion, `«${operacion.tipo}» no es un tipo de tarea`);
          break;
        }
        /* ⚠ SIN id, igual que el destino de `tarea.mover-fase`: la crea el PUT
           (`timeline/route.ts:841-856`), y nace `source: HUMAN`. Es correcto: la pidió una
           persona en una conversación, no la infirió un agente — y por eso queda protegida
           contra un borrado posterior del propio chat. */
        f.tasks.push({
          id: undefined,
          title: titulo,
          weekIndex: Math.max(Math.floor(operacion.semana), 0),
          order: f.tasks.length,
          notes: null,
          party: operacion.duenio ?? null,
          type: operacion.tipo ?? null,
        });
        f.tocada = true;
        normalizar(f);
        break;
      }

      case "tarea.renombrar": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        const titulo = operacion.titulo.trim();
        if (!titulo) {
          rechazar(operacion, "una tarea no puede quedarse sin título");
          break;
        }
        hit.tarea.title = titulo;
        hit.fase.tocada = true;
        break;
      }

      case "tarea.duenio": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        if (!(DUENIOS_VALIDOS as readonly string[]).includes(operacion.duenio)) {
          rechazar(operacion, `«${operacion.duenio}» no es un dueño válido`);
          break;
        }
        hit.tarea.party = operacion.duenio;
        hit.fase.tocada = true;
        break;
      }

      case "tarea.tipo": {
        const hit = buscarTarea(operacion.taskId);
        if (noEncontrada(hit)) {
          rechazar(operacion, motivoDeBusqueda(hit));
          break;
        }
        if (!(TIPOS_DE_TAREA_VALIDOS as readonly string[]).includes(operacion.tipo)) {
          rechazar(operacion, `«${operacion.tipo}» no es un tipo de tarea`);
          break;
        }
        hit.tarea.type = operacion.tipo;
        hit.fase.tocada = true;
        break;
      }

      case "arranque": {
        if (!/^\d{4}-\d{2}-\d{2}/.test(operacion.fecha)) {
          rechazar(operacion, "la fecha de arranque tiene que ser AAAA-MM-DD");
          break;
        }
        ancla = operacion.fecha.slice(0, 10);
        break;
      }

      default: {
        /* Un `op` que no está en el vocabulario. Se rechaza con nombre — nunca se aproxima. */
        rechazar(operacion, `«${(operacion as { op: string }).op}» no es una operación válida`);
      }
    }
  }

  return {
    payload: {
      anchorStartDate: ancla,
      phases: fases.map((f, i) => ({
        ...(f.id ? { id: f.id } : {}),
        name: f.name,
        order: i,
        durationWeeks: f.durationWeeks,
        startWeek: f.startWeek,
        sessionCount: f.sessionCount,
        notes: f.notes,
        activityType: f.activityType,
        /* ⛔ Ver `tocada`: sin tareas = «no tocar». Emitirlas siempre convertiría cada operación
           en un diff completo, y el PUT borra por omisión. */
        ...(f.tocada
          ? {
              tasks: f.tasks.map((t) => ({
                ...(t.id ? { id: t.id } : {}),
                title: t.title,
                weekIndex: t.weekIndex,
                order: t.order,
                notes: t.notes,
                party: t.party ?? null,
                type: t.type ?? null,
              })),
            }
          : {}),
      })),
    },
    avisos,
    rechazadas,
  };
}

/**
 * ⭐ LAS OPERACIONES, EN CASTELLANO — Y ES LO QUE VUELVE HERMÉTICA A LA CAJITA AZUL.
 *
 * Idea de Elías (2026-08-20): *«el usuario habla y consensúa cuáles son los cambios
 * específicamente; eso es lo que se pone en la cajita azul, y una vez que lo pudo leer ahí,
 * debería aplicarse muy rápido»*.
 *
 * ⛔ El vocabulario es una lista CERRADA, así que existe el riesgo de que un pedido que no entra
 * caiga en la operación más parecida. Lo que disuelve ese riesgo es que la persona LEA lo que se
 * va a ejecutar — pero solo si lo que lee sale de las OPERACIONES y no de la prosa del modelo.
 *
 * Hasta hoy la cajita mostraba un `resumen` que el modelo escribía APARTE de la instrucción: dos
 * textos que pueden divergir. Con esta traducción, **lo que se lee ES lo que se ejecuta**, porque
 * sale del mismo objeto. Y es determinista: no es otra oportunidad de que el modelo se equivoque.
 *
 * Ejemplo del caso que destapó el riesgo («sacá la semana vacía del MEDIO», que no tiene
 * operación propia y sale como un acortamiento):
 *
 *   1. «Marketing Hub» pasa de 4 a 3 semanas
 *
 * Y ahí el CSE ve que no es lo que pidió, antes de que pase nada.
 */
export function describirOperaciones(
  actuales: readonly FaseActual[],
  operaciones: readonly Operacion[],
): string[] {
  const fase = (id: string) => actuales.find((f) => f.id === id);
  const nombre = (id: string) => fase(id)?.name ?? "(una fase que ya no está)";
  /**
   * ⚠ Resuelve igual que el ejecutor — por HANDLE o por id entero — y por el mismo motivo: si acá
   * se buscara solo por id exacto, la cajita azul imprimiría «ywlga» donde tiene que decir el
   * título, y la promesa de este módulo («lo que se LEE es lo que se EJECUTA») se rompería justo
   * en las operaciones de tarea, que son las que el CSE no puede verificar de memoria.
   */
  const tarea = (referencia: string) => {
    const conId = actuales.flatMap((f) => f.tasks.filter((t) => t.id).map((t) => ({ f, t })));
    const r = resolverHandle(
      referencia,
      conId.map((x) => x.t.id),
    );
    if (r.tipo !== "una") return null;
    const hit = conId.find((x) => x.t.id === r.id)!;
    return { titulo: hit.t.title, fase: hit.f.name };
  };
  const sem = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;

  return operaciones.map((o) => {
    switch (o.op) {
      case "fase.duracion": {
        const antes = fase(o.phaseId)?.durationWeeks;
        return antes === undefined
          ? `«${nombre(o.phaseId)}» pasa a ${sem(o.semanas)}`
          : `«${nombre(o.phaseId)}» pasa de ${antes} a ${sem(o.semanas)}`;
      }
      case "fase.renombrar":
        return `«${nombre(o.phaseId)}» pasa a llamarse «${o.nombre}»`;
      case "fase.borrar": {
        const f = fase(o.phaseId);
        const n = f?.tasks.length ?? 0;
        return n > 0
          ? `Se elimina «${nombre(o.phaseId)}», con sus ${n} ${n === 1 ? "tarea" : "tareas"}`
          : `Se elimina «${nombre(o.phaseId)}»`;
      }
      case "fase.redistribuir":
        return `Las tareas de «${nombre(o.phaseId)}» se reparten parejo entre sus semanas`;
      case "fase.mover":
        return `«${nombre(o.phaseId)}» se mueve al lugar ${o.posicion + 1}`;
      case "fase.arranque-relativo":
        return o.semana === null
          ? `«${nombre(o.phaseId)}» arranca cuando termina la anterior`
          : `«${nombre(o.phaseId)}» arranca en la semana ${o.semana + 1} del proyecto`;
      case "tarea.mover-semana": {
        const t = tarea(o.taskId);
        return `«${t?.titulo ?? o.taskId}» se mueve a la semana ${o.semana + 1} de su fase`;
      }
      case "tarea.mover-fase": {
        const t = tarea(o.taskId);
        /* ⚠ Se dice la consecuencia, no solo el acto: mudar una tarea la RECREA. */
        return (
          `«${t?.titulo ?? o.taskId}» se mueve de «${t?.fase ?? "?"}» a «${nombre(o.phaseId)}»` +
          (typeof o.semana === "number" ? `, semana ${o.semana + 1}` : "") +
          ` — se recrea ahí, así que pierde su estado`
        );
      }
      case "tarea.borrar": {
        const t = tarea(o.taskId);
        return `Se elimina «${t?.titulo ?? o.taskId}» de «${t?.fase ?? "?"}»`;
      }
      case "fase.crear":
        return (
          `Se crea la fase «${o.nombre}» de ${sem(o.semanas)}` +
          (typeof o.posicion === "number" ? `, en la posición ${o.posicion + 1}` : ", al final") +
          " — nace vacía"
        );
      case "fase.quitar-semana": {
        const f = fase(o.phaseId);
        /* ⭐ El conteo NO es adorno: es la diferencia entre «sacá la semana vacía» y «sacá la
           semana 3, que tiene 4 tareas que se van a mover». Sin él, la persona aprueba un número
           que no vio. Es el mismo estándar que ya cumple `fase.borrar`. */
        const dentro = f?.tasks.filter((t) => t.weekIndex === o.semana).length ?? 0;
        const queda = (f?.durationWeeks ?? 1) - 1;
        return (
          `Se quita la semana ${o.semana + 1} de «${nombre(o.phaseId)}» (queda en ${sem(queda)})` +
          (dentro === 0
            ? " — estaba vacía"
            : ` — sus ${dentro} ${dentro === 1 ? "tarea pasa" : "tareas pasan"} a la semana ` +
              `${Math.max(o.semana, 1)}`)
        );
      }
      case "fase.insertar-semana": {
        const f = fase(o.phaseId);
        const corren = f?.tasks.filter((t) => t.weekIndex >= o.semana).length ?? 0;
        return (
          `Se abre una semana vacía en la posición ${o.semana + 1} de «${nombre(o.phaseId)}» ` +
          `(pasa a ${sem((f?.durationWeeks ?? 0) + 1)})` +
          (corren > 0 ? ` — ${corren} ${corren === 1 ? "tarea corre" : "tareas corren"} una semana` : "")
        );
      }
      case "fase.tipo":
        return `«${nombre(o.phaseId)}» pasa a ser de tipo ${o.tipo.toLowerCase()}`;
      case "tarea.crear":
        return (
          `Se agrega «${o.titulo}» a «${nombre(o.phaseId)}», en la semana ${o.semana + 1}` +
          (o.duenio ? ` — la hace ${o.duenio.toLowerCase()}` : "")
        );
      case "tarea.renombrar": {
        const t = tarea(o.taskId);
        /* Con el nombre ANTERIOR: renombrar sin decir qué se renombra es irrevisable. */
        return `«${t?.titulo ?? o.taskId}» pasa a llamarse «${o.titulo}»`;
      }
      case "tarea.duenio": {
        const t = tarea(o.taskId);
        return `«${t?.titulo ?? o.taskId}» pasa a hacerla ${o.duenio.toLowerCase()}`;
      }
      case "tarea.tipo": {
        const t = tarea(o.taskId);
        return `«${t?.titulo ?? o.taskId}» pasa a ser ${o.tipo === "SESSION" ? "una sesión" : "una tarea"}`;
      }
      case "arranque":
        return `El proyecto pasa a arrancar el ${o.fecha}`;
      default:
        return `Operación desconocida: ${(o as { op: string }).op}`;
    }
  });
}
