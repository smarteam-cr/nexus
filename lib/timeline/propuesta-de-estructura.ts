/**
 * lib/timeline/propuesta-de-estructura.ts — EL ARMADOR DE LA PROPUESTA DE FASES Y TIEMPOS.
 * Puro y client-safe: sin Prisma. Lo usan la ruta `timeline/estructura` (paso 1 de «Regenerar
 * todo») y la pantalla (la máquina de pasos: qué hacer después de pedir la estructura y después
 * de aplicar o descartar la propuesta).
 *
 * ── POR QUÉ EXISTE (2026-09-23) ──────────────────────────────────────────────
 * «Regenerar todo» detallaba TAREAS sobre las fases de siempre: aunque una reunión elegida dijera
 * «se suma una fase de piloto» o «Pruebas pasa a 3 semanas», las fases y sus duraciones no se
 * movían (el detalle tiene prohibido tocarlas). Ahora, con reuniones o notas elegidas, un revisor
 * corto propone CAMBIOS de estructura (ajustar, agregar o mover) y este armador los convierte en
 * la MISMA propuesta de solo estructura que ya deja el handoff en `pendingProposal`: el CSE la
 * revisa en la barra de arriba del Gantt (E1 del borrador, `RevisionDeLaPropuesta`) —la lista
 * numerada con casillas, «Ver como estaba antes» ↔ «Ver la propuesta» y el cierre antes → después—
 * y la aplica entera o en parte, o la descarta. Después, la pantalla encadena el detalle de siempre
 * sobre la estructura decidida.
 * ⭐ Desde E2a (2026-09-25) la propuesta nace como `borrador-v1` y el paso 2 NO espera al CSE: arma
 * las tareas enseguida, sobre la estructura PROPUESTA, y las suma a ESA misma propuesta (fases y
 * tareas se revisan juntas en la barra). E2b borró la cadena vieja de dos pasos: una propuesta vieja
 * de las reuniones que siga abierta se aplica o se descarta como cualquier otra, y nada sigue solo.
 *
 * ── LO QUE EL MODELO NO PUEDE HACER, AUNQUE LO DIGA ─────────────────────────
 * El prompt (lib/agents/estructura-cronograma.ts) lo prohíbe y ESTE archivo lo hace cumplir: una
 * regla que solo vive en un prompt se incumple la vez que el modelo se equivoca. Se descarta, con
 * un motivo legible:
 *  · un id que no existe o se repite (nunca se vuelve una fase nueva);
 *  · un cambio sin motivo (el CSE decide leyendo el «por qué»);
 *  · tocar una fase terminada o suspendida, o la Semana 0 / Kick-off;
 *  · mover el inicio de una fase que ya empezó, a una semana que ya pasó o al mismo inicio que ya
 *    tiene (fijaría una fase contigua sin moverla);
 *  · una duración fuera de 1..52, no entera, igual a la actual (solo ese campo) o que corta por
 *    debajo del trabajo ya empezado;
 *  · un nombre vacío, largo, repetido, que entra o sale de «Desarrollo / Integración», o que
 *    cruza la frontera (fechas, plazos, montos, la cita de la fuente: lo lee el cliente);
 *  · renombrar una fase de «Desarrollo / Integración» con un motivo que no cita la reunión, la
 *    nota ni las instrucciones que lo piden (`motivoCitaUnaFuente`), o porque algo quedó excluido
 *    (`motivoEsUnaExclusion`);
 *  · ⛔ CORRER LO QUE YA EMPEZÓ, O CAER EN EL PASADO (revisión del paso A2): una fase nueva, movida
 *    o desfijada que arrancaría en una semana que ya pasó; cualquier cambio que le cambie el inicio
 *    a una fase que ya empezó —terminada, en curso o PENDING con una tarea en curso o hecha, que es
 *    como quedan en los datos reales— (una fase nueva delante de ella, un «mover», alargar la que va
 *    antes); y una pendiente que el cambio corre DE REBOTE desde hoy o más adelante hasta una
 *    semana que ya pasó (un «mover» hacia más adelante adelanta las del medio; acortar o desfijar,
 *    las que siguen). Una pendiente que ya estaba en el pasado por el atraso no se mira. Se simula
 *    el plan con ESE cambio solo —el CSE los acepta de a uno— con la misma fórmula del Gantt
 *    (`computePhaseRanges`);
 *  · más de MAX_CAMBIOS cambios o más de MAX_FASES_NUEVAS fases nuevas.
 * Una fase nueva, un «mover» o un «ajustar» que se descartan por su nombre, por el calendario, por
 * tocar una fase intocable (terminada, suspendida o la Semana 0) o por acortar trabajo empezado dejan
 * además una observación (`acordadoSinEntrar` las cuenta): lo ACORDADO no se pierde en silencio, lo
 * decide el CSE a mano. (Revisión adversarial, 2026-09-24: los tres últimos se descartaban sin
 * observación y la pantalla decía «tus reuniones no piden cambios».) Lo que NO deja observación es
 * lo que no llegó a ser un acuerdo: sin motivo, un id inventado, un valor fuera de rango o repetido.
 * La Semana 0 existe solo si el proyecto la tiene (`faseDeSemanaCero`): Desarrollo y Web, no.
 * Y NUNCA: quitar fases, mover el arranque del proyecto, escribir tareas o notas de fase. La
 * propuesta sale sin `tasks` (si no, deja de ser «solo estructura» y el Gantt se congela), sin
 * ancla, y con las notas y el tipo de cada fase tal cual estaban.
 * ⭐ Y dice QUÉ cambia, no una foto (revisión adversarial, 2026-09-24): `campos` por fase (solo esos
 * se comparan contra la fase viva y solo esos se escriben) y `movidas` (el reordenamiento se arma
 * sobre el orden vivo). Lo que el CSE edite mientras la propuesta espera no vuelve como sugerencia
 * de revertirlo. Ver lib/timeline/proposal-deltas.ts.
 *
 * El `motivo` (interno, cita la reunión o la nota) viaja en la fase propuesta y en el delta, nunca
 * como un cambio: lo ve el CSE en el Gantt («Por qué (solo lo ves tú)») y el endpoint que aplica
 * nunca lo escribe (ver lib/timeline/proposal-deltas.ts).
 *
 * El PLAZO TOTAL tampoco lo compara el modelo (medido en vivo 2026-09-24: invertía la dirección 6 de
 * 6): devuelve `plazoTotal` y la observación la escribe `fraseDelPlazo`, con la cuenta hecha.
 */
import { ACTIVITY_TYPES } from "./validate";
import { computePhaseRanges } from "./weeks";
import { isDevIntegrationPhaseName } from "./phase-names";
import { sanitizeTaskTitle } from "./compute-detail-tasks";
import { elegirFaseDeSemanaCero } from "./semana-cero-tareas";
import type { EstadoDeLasTareas } from "./borrador";
import {
  computeProposalDeltas,
  type CurrentPhaseLike,
  type MovidaDeFase,
  type PhaseField,
  type ProposalDelta,
  type ProposalLike,
  type ProposalPhaseLike,
} from "./proposal-deltas";
import { fugaEn, normalizarParaFrontera, type HuellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import { diaEnCostaRica } from "@/lib/contexto/material-cronograma";
import { extraerJson } from "@/lib/cs/brief-citas";

/** Cuántos cambios se leen de una respuesta. Más que esto no es un ajuste: es otro cronograma. */
export const MAX_CAMBIOS = 12;
/** Cuántas fases nuevas puede sumar una sola revisión. */
export const MAX_FASES_NUEVAS = 3;
/** Cuántas observaciones del modelo se muestran, y su largo máximo. */
export const MAX_OBSERVACIONES = 5;
export const MAX_LARGO_OBSERVACION = 300;
/** El nombre de una fase lo lee el cliente: corto. */
export const MAX_LARGO_NOMBRE_DE_FASE = 60;
/** El motivo es interno, pero una fila del Gantt no es un informe. */
const MAX_LARGO_MOTIVO = 500;

const DIA_MS = 86_400_000;

/** Una fase tal como la ven el revisor y el armador (la MISMA foto: ver la ruta). */
export interface FaseParaEstructura {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  /** PENDING | IN_PROGRESS | DONE | SUSPENDED */
  status: string | null;
  tasks: ReadonlyArray<{ status: string; weekIndex: number }>;
}

export interface ResultadoDeEstructura {
  /** null = no hay ningún cambio real (nada que guardar ni que decidir). */
  propuesta: ProposalLike | null;
  deltas: ProposalDelta[];
  /** Lo que el modelo pidió y el armador no aceptó, con el motivo. Interno (va a la corrida). */
  descartados: string[];
  /** Lo que la IA notó y no se aplica solo. Interno: lo ve el CSE, nunca el cliente. */
  observaciones: string[];
  /**
   * Cuántos cambios ACORDADOS no entraron (por el nombre o por el calendario) y quedaron como
   * observación para que el CSE los decida a mano. Con propuesta null y esto en más de 0, la
   * pantalla NO puede decir «tus reuniones no piden cambios»: los pidieron y no se pudieron proponer.
   */
  acordadoSinEntrar: number;
}

interface Ajuste {
  durationWeeks?: number;
  startWeek?: number | null;
  name?: string;
  sessionCount?: number;
  motivo: string;
}

interface FaseNueva {
  despuesDe: string;
  fase: ProposalPhaseLike;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const esEnteroEntre = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
/** «1 semana», «3 semanas»: lo lee el CSE en las observaciones. */
const enSemanas = (n: number) => `${n} ${n === 1 ? "semana" : "semanas"}`;
const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Los cambios, las observaciones y el plazo total del JSON crudo: acepta `{estructura:{…}}` o el
 *  objeto suelto. `plazoTotal` va CRUDO: lo valida `fraseDelPlazo`. */
function leerCrudo(crudo: unknown): { cambios: unknown[]; observaciones: unknown[]; plazoTotal: unknown } {
  const raiz = esObjeto(crudo) && esObjeto(crudo.estructura) ? crudo.estructura : crudo;
  if (!esObjeto(raiz)) return { cambios: [], observaciones: [], plazoTotal: null };
  return {
    cambios: Array.isArray(raiz.cambios) ? raiz.cambios : [],
    observaciones: Array.isArray(raiz.observaciones) ? raiz.observaciones : [],
    plazoTotal: raiz.plazoTotal ?? null,
  };
}

/**
 * Convierte la respuesta cruda del revisor en la propuesta de solo estructura, o en `null` si no
 * cambia nada. Ver el docblock del archivo para lo que se descarta y por qué.
 *
 * @param fases       las fases vigentes, EN ORDEN — las mismas que vio el modelo.
 * @param anchorISO   el ancla guardada (solo para medir los deltas; la propuesta nunca la trae).
 * @param huellas     las del material que entró al prompt: un nombre de fase que cruza la
 *                    frontera se descarta. Sin huellas (o sin material) no se revisa.
 * @param ahora       para no mover una fase a una semana que ya pasó. Sin él no se mira.
 * @param conSemanaCero  si el proyecto TIENE Semana 0 / Kick-off (default true). ⛔ Desarrollo y
 *                    Web no tienen: su primera fase es trabajo real (ver `faseDeSemanaCero`).
 * @param cierreActual   la semana del proyecto en que el plan cierra HOY: la MISMA que leyó el
 *                    modelo en el calendario (`cierreActualDelPlan(foto, ahora).semana`, en
 *                    lib/contexto/estructura-cronograma.ts, con la misma foto y el mismo `ahora`).
 *                    Con él, el `plazoTotal` que devolvió el modelo vuelve como la observación
 *                    del sistema (`fraseDelPlazo`). Sin él no se compara nada.
 */
export function construirPropuestaDeEstructura(input: {
  fases: readonly FaseParaEstructura[];
  crudo: unknown;
  anchorISO: string | null;
  huellas?: HuellasDeFrontera | null;
  ahora?: number | null;
  conSemanaCero?: boolean;
  cierreActual?: number | null;
}): ResultadoDeEstructura {
  const fases = [...input.fases].sort((a, b) => a.order - b.order);
  const porId = new Map(fases.map((f) => [f.id, f]));
  const semanaCero = faseDeSemanaCero(fases, input.conSemanaCero ?? true)?.id ?? null;
  const rangos = computePhaseRanges(fases);
  const inicioActual = new Map(fases.map((f, i) => [f.id, rangos[i].start]));
  const semanaDeHoy = semanaDelProyecto(input.anchorISO, input.ahora ?? null);

  const { cambios: todos, observaciones: obsCrudas, plazoTotal } = leerCrudo(input.crudo);
  const descartados: string[] = [];
  const observacionesDelModelo = obsCrudas
    .map(texto)
    .filter(Boolean)
    .slice(0, MAX_OBSERVACIONES)
    .map((o) => recortar(o, MAX_LARGO_OBSERVACION));
  /* Las que suma el armador: una fase acordada que no entra (por su nombre o por el calendario).
     Se juntan con las del modelo AL FINAL, con el tope de MAX_OBSERVACIONES para las dos. */
  const observacionesDelArmador: string[] = [];

  if (todos.length > MAX_CAMBIOS) {
    descartados.push(`Llegaron ${todos.length} cambios: solo se leen los primeros ${MAX_CAMBIOS}.`);
  }
  const cambios = todos.slice(0, MAX_CAMBIOS);

  const nombreDe = (id: string) => `«${porId.get(id)?.name ?? id}»`;
  const nombresTomados = new Set(fases.map((f) => normalizarParaFrontera(f.name)));
  /** Por qué un nombre propuesto no sirve, o null si sirve. */
  const problemaDelNombre = (nombre: string, propio: string | null): string | null => {
    if (!nombre) return "el nombre está vacío";
    if (nombre.length > MAX_LARGO_NOMBRE_DE_FASE) return `el nombre pasa de ${MAX_LARGO_NOMBRE_DE_FASE} caracteres`;
    const n = normalizarParaFrontera(nombre);
    if (nombresTomados.has(n) && n !== (propio === null ? null : normalizarParaFrontera(propio))) {
      return "ya hay otra fase con ese nombre";
    }
    const fuga = input.huellas ? fugaEn(nombre, input.huellas, "titulo") : null;
    if (fuga) return `el nombre ${fuga} (lo lee el cliente)`;
    return null;
  };
  /** Por qué una fase existente no se puede tocar, o null. */
  const intocable = (f: FaseParaEstructura): string | null => {
    if (f.id === semanaCero) return "es la Semana 0 / Kick-off";
    if (f.status === "DONE") return "la fase está terminada";
    if (f.status === "SUSPENDED") return "la fase está suspendida";
    return null;
  };
  /**
   * Cómo va una fase que YA EMPEZÓ, o null si no empezó. ⚠ No alcanza con el estado (revisión del
   * paso A2, segunda vuelta): en los datos reales una fase con trabajo hecho suele seguir en
   * PENDING —las tareas solo derivan DONE a la fase, y IN_PROGRESS lo pone únicamente el agente de
   * avance—. La Semana 0 de CAV está PENDING con 2 tareas hechas. Por eso también cuenta una tarea
   * en curso o hecha. Una tarea SUSPENDIDA no: se aparcó sin ejecutarse.
   */
  const comoVa = (f: FaseParaEstructura): string | null => {
    if (f.status === "DONE") return "está terminada";
    if (f.status === "IN_PROGRESS") return "está en curso";
    return f.tasks.some((t) => t.status === "IN_PROGRESS" || t.status === "DONE") ? "empezó" : null;
  };

  /* ── EL PLAN SIMULADO: qué pasaría con UN cambio (revisión del paso A2) ──────────────────
     El filtro de «una semana que ya pasó» miraba solo `inicioSemana`, e `intocable` solo la fase
     que cambia. Una fase nueva detrás de la Semana 0 caía en la semana 2 y corría a las fases
     terminadas y en curso que venían después; un «mover» igual; desfijar una fase la dejaba
     arrancar en el pasado. Cada cambio se prueba SOLO contra el plan de hoy, porque el CSE los
     acepta de a uno. `id: null` = la fase nueva que se está probando. */
  type Simulada = { id: string | null; durationWeeks: number; startWeek: number | null };
  const planDeHoy: Simulada[] = fases.map((f) => ({ id: f.id, durationWeeks: f.durationWeeks, startWeek: f.startWeek ?? null }));
  const conCambio = (id: string, c: { durationWeeks?: number; startWeek?: number | null }): Simulada[] =>
    planDeHoy.map((s) =>
      s.id === id
        ? {
            ...s,
            durationWeeks: c.durationWeeks ?? s.durationWeeks,
            startWeek: c.startWeek !== undefined ? c.startWeek : s.startWeek,
          }
        : s,
    );
  /** El inicio (semana del proyecto desde 0) de la fase `cual` en un plan simulado. */
  const inicioEn = (sim: Simulada[], cual: string | null): number => {
    const i = sim.findIndex((s) => s.id === cual);
    return i < 0 ? -1 : computePhaseRanges(sim)[i].start;
  };
  /** La fase que ya empezó (terminada, en curso o con trabajo hecho) que el plan simulado CORRE
   *  (le cambia el inicio), o null. */
  const loQueCorre = (sim: Simulada[]): string | null => {
    const rangos = computePhaseRanges(sim);
    for (const [i, s] of sim.entries()) {
      const f = s.id ? porId.get(s.id) : undefined;
      const va = f ? comoVa(f) : null;
      if (!f || !va) continue;
      if (rangos[i].start !== inicioActual.get(f.id)) return `correría ${nombreDe(f.id)}, que ya ${va}`;
    }
    return null;
  };
  /** «caería en la semana N, que ya pasó», o null (sin ancla o sin `ahora` no se mira). */
  const caeEnElPasado = (inicio: number): string | null =>
    semanaDeHoy !== null && inicio >= 0 && inicio < semanaDeHoy ? `caería en la semana ${inicio + 1}, que ya pasó` : null;
  /** Lo mismo para una fase que YA existe, solo si el cambio le mueve el inicio: la que se queda
   *  donde estaba no «va» a ninguna semana (en un proyecto atrasado, su semana ya pasó igual). */
  const laLlevaAlPasado = (sim: Simulada[], id: string): string | null => {
    const inicio = inicioEn(sim, id);
    return inicio === inicioActual.get(id) ? null : caeEnElPasado(inicio);
  };
  /**
   * Una fase que el cambio corre DE REBOTE (no la que cambia) desde hoy o más adelante hasta una
   * semana que ya pasó (revisión del paso A2, segunda vuelta): un «mover» hacia más adelante
   * adelanta las fases del medio, y acortar o desfijar una fase adelanta las que siguen. La que ya
   * estaba en una semana pasada por el atraso no se mira: su semana ya pasó igual, y en un proyecto
   * atrasado cualquier cambio la mueve.
   */
  const loQueCaeDeRebote = (sim: Simulada[], propia: string | null): string | null => {
    if (semanaDeHoy === null) return null;
    const rangos = computePhaseRanges(sim);
    for (const [i, s] of sim.entries()) {
      if (s.id === null || s.id === propia) continue;
      const antes = inicioActual.get(s.id) ?? -1;
      const despues = rangos[i].start;
      if (antes >= semanaDeHoy && despues < semanaDeHoy) {
        return `correría ${nombreDe(s.id)} a la semana ${despues + 1}, que ya pasó`;
      }
    }
    return null;
  };
  /** TODO lo del calendario para un plan simulado: la fase que cambia (`propia`; null = la nueva)
   *  no arranca en el pasado, nada que ya empezó se corre y nada cae de rebote en el pasado. */
  const choqueDelCalendario = (sim: Simulada[], propia: string | null): string | null =>
    (propia === null ? caeEnElPasado(inicioEn(sim, null)) : laLlevaAlPasado(sim, propia)) ??
    loQueCorre(sim) ??
    loQueCaeDeRebote(sim, propia);
  /**
   * Lo ACORDADO que no entra por el calendario no se pierde en silencio (revisión del paso A2,
   * segunda vuelta): igual que una fase nueva o un «mover», un «ajustar» descartado por el
   * calendario deja una observación. Sin ella la ruta respondía «sin cambios» y la pantalla decía
   * que las reuniones no pedían cambios, cuando una reunión sí los acordó.
   */
  const acordadoQueNoEntra = (sugerencia: string, porque: string, decide: string): void => {
    observacionesDelArmador.push(
      recortar(`Se sugirió ${sugerencia}, pero ${porque}: decide tú ${decide}.`, MAX_LARGO_OBSERVACION),
    );
  };
  const perdidoPorElCalendario = acordadoQueNoEntra;
  /**
   * Qué pedía un «ajustar», en palabras, para la observación de lo que no entró (revisión adversarial,
   * 2026-09-24): «llevar «Pruebas» a 3 semanas y renombrar «Pruebas» a «Pruebas con usuarios»».
   */
  const loQuePideElAjuste = (f: FaseParaEstructura, c: Record<string, unknown>): string => {
    const partes: string[] = [];
    if (esEnteroEntre(c.durationWeeks, 1, 52)) partes.push(`llevar ${nombreDe(f.id)} a ${enSemanas(c.durationWeeks)}`);
    if (c.inicioSemana !== undefined) {
      partes.push(
        `que ${nombreDe(f.id)} arranque ${esEnteroEntre(c.inicioSemana, 1, 104) ? `en la semana ${c.inicioSemana}` : "cuando termine la anterior"}`,
      );
    }
    const nombre = typeof c.name === "string" ? sanitizeTaskTitle(c.name) : "";
    if (nombre && normalizarParaFrontera(nombre) !== normalizarParaFrontera(f.name)) {
      partes.push(`renombrar ${nombreDe(f.id)} a «${nombre}»`);
    }
    if (esEnteroEntre(c.sessionCount, 1, 50) && c.sessionCount !== f.sessionCount) {
      partes.push(`llevar ${nombreDe(f.id)} a ${c.sessionCount} sesiones`);
    }
    return partes.length > 0 ? partes.join(" y ") : `ajustar ${nombreDe(f.id)}`;
  };

  const ajustes = new Map<string, Ajuste>();
  const movidas = new Map<string, { despuesDe: string; motivo: string }>();
  const nuevas: FaseNueva[] = [];

  for (const c of cambios) {
    if (!esObjeto(c)) {
      descartados.push("Un cambio no era un objeto.");
      continue;
    }
    const tipo = texto(c.tipo);
    const motivo = recortar(texto(c.motivo), MAX_LARGO_MOTIVO);

    if (tipo === "ajustar") {
      const id = texto(c.faseId);
      const f = porId.get(id);
      if (!f) {
        descartados.push(`ajustar: la fase «${id || "(sin id)"}» no existe.`);
        continue;
      }
      const donde = `ajustar ${nombreDe(id)}`;
      if (ajustes.has(id)) {
        descartados.push(`${donde}: ya había otro cambio para esa fase.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      const bloqueo = intocable(f);
      if (bloqueo) {
        descartados.push(`${donde}: ${bloqueo}.`);
        /* ⭐ Lo ACORDADO sobre una fase intocable no se pierde en silencio (revisión adversarial,
           2026-09-24): con propuesta null y sin observación, la pantalla decía «tus reuniones no
           piden cambios». Queda dicho y lo decide el CSE a mano. */
        acordadoQueNoEntra(loQuePideElAjuste(f, c), bloqueo, "si corresponde");
        continue;
      }
      const ajuste: Ajuste = { motivo };

      if (c.durationWeeks !== undefined) {
        const trabajoEmpezado = Math.max(-1, ...f.tasks.filter((t) => t.status !== "PENDING").map((t) => t.weekIndex));
        if (!esEnteroEntre(c.durationWeeks, 1, 52)) {
          descartados.push(`${donde}: la duración tiene que ser un entero de 1 a 52 semanas.`);
        } else if (c.durationWeeks === f.durationWeeks) {
          descartados.push(`${donde}: la duración ya es ${f.durationWeeks}.`);
        } else if (c.durationWeeks <= trabajoEmpezado) {
          descartados.push(
            `${donde}: acortarla a ${c.durationWeeks} semanas dejaría afuera trabajo ya empezado (semana ${trabajoEmpezado + 1}).`,
          );
          acordadoQueNoEntra(
            `llevar ${nombreDe(id)} a ${enSemanas(c.durationWeeks)}`,
            `dejaría afuera trabajo ya empezado en su semana ${trabajoEmpezado + 1}`,
            "si se ajusta",
          );
        } else {
          ajuste.durationWeeks = c.durationWeeks;
        }
      }

      /* Cómo se lee el inicio pedido en una observación: «cuando termine la anterior» o la semana. */
      const arranque = (inicio: unknown) =>
        `que ${nombreDe(id)} arranque ${esEnteroEntre(inicio, 1, 104) ? `en la semana ${inicio}` : "cuando termine la anterior"}`;
      if (c.inicioSemana !== undefined) {
        const empezo = comoVa(f);
        if (empezo) {
          descartados.push(`${donde}: la fase ya ${empezo}, su inicio no se mueve.`);
          perdidoPorElCalendario(arranque(c.inicioSemana), `la fase ya ${empezo}`, "si se mueve");
        } else if (c.inicioSemana === null) {
          if (f.startWeek !== null) ajuste.startWeek = null;
        } else if (!esEnteroEntre(c.inicioSemana, 1, 104)) {
          descartados.push(`${donde}: la semana de inicio tiene que ser un entero de 1 a 104.`);
        } else if (c.inicioSemana - 1 === inicioActual.get(id)) {
          descartados.push(`${donde}: ya arranca en la semana ${c.inicioSemana}.`);
        } else if (semanaDeHoy !== null && c.inicioSemana - 1 < semanaDeHoy) {
          descartados.push(`${donde}: la semana ${c.inicioSemana} ya pasó.`);
          perdidoPorElCalendario(arranque(c.inicioSemana), "esa semana ya pasó", "cuándo arranca");
        } else {
          // La semana DEL PROYECTO desde 1 (la que ve el CSE) → startWeek desde 0.
          ajuste.startWeek = c.inicioSemana - 1;
        }
      }

      if (c.name !== undefined) {
        const nombre = typeof c.name === "string" ? sanitizeTaskTitle(c.name) : "";
        if (normalizarParaFrontera(nombre) !== normalizarParaFrontera(f.name) || !nombre) {
          /* ⛔ Una fase de «Desarrollo / Integración» se renombra solo si el motivo CITA de dónde sale
             el pedido (prueba A3: el control la renombró 3 de 3 veces con otro nombre de Desarrollo /
             Integración, que la regla de «entra o sale» no frena), y nunca porque algo quedó
             EXCLUIDO: esas 3 salidas citaban «Instrucciones del CSE: excluir integraciones…» y la
             cita sola las dejaba pasar (revisión del paso A3, segunda vuelta). */
          const esDeDesarrollo = isDevIntegrationPhaseName(f.name);
          const problema =
            problemaDelNombre(nombre, f.name) ??
            (isDevIntegrationPhaseName(nombre) !== esDeDesarrollo
              ? "el nombre entra o sale de «Desarrollo / Integración» (cambia qué tareas lleva la fase)"
              : esDeDesarrollo && motivoEsUnaExclusion(motivo)
                ? "renombrar una fase de «Desarrollo / Integración» porque algo quedó excluido no es motivo (si la fase ya no va, lo decide el CSE)"
                : esDeDesarrollo && !motivoCitaUnaFuente(motivo)
                  ? "renombrar una fase de «Desarrollo / Integración» pide un motivo que cite la reunión, la nota o las instrucciones que lo piden"
                  : null);
          if (problema) {
            descartados.push(`${donde}: ${problema}.`);
            // Un renombre pedido que no entra también queda dicho (sin nombre no hay nada que decidir).
            if (nombre) acordadoQueNoEntra(`renombrar ${nombreDe(id)} a «${nombre}»`, problema, "si se renombra");
          } else {
            ajuste.name = nombre;
            nombresTomados.add(normalizarParaFrontera(nombre));
          }
        }
      }

      if (c.sessionCount !== undefined) {
        if (!esEnteroEntre(c.sessionCount, 1, 50)) {
          descartados.push(`${donde}: las sesiones tienen que ser un entero de 1 a 50.`);
        } else if (c.sessionCount !== f.sessionCount) {
          ajuste.sessionCount = c.sessionCount;
        }
      }

      /* El calendario: el inicio nuevo no cae en el pasado (desfijar deja la fase detrás de la
         anterior, que puede ser una semana que ya pasó), ningún cambio de tiempo corre lo que ya
         empezó y nada cae de rebote en el pasado. Se prueba primero el inicio y después la
         duración, así uno que no sirve no se lleva al otro. Lo que se descarta acá deja su
         observación. */
      if (ajuste.startWeek !== undefined) {
        const choque = choqueDelCalendario(conCambio(id, { startWeek: ajuste.startWeek }), id);
        if (choque) {
          descartados.push(`${donde}: con ese inicio ${choque}.`);
          perdidoPorElCalendario(arranque(c.inicioSemana), choque, "cuándo arranca");
          delete ajuste.startWeek;
        }
      }
      if (ajuste.durationWeeks !== undefined) {
        const choque = choqueDelCalendario(
          conCambio(id, { durationWeeks: ajuste.durationWeeks, startWeek: ajuste.startWeek }),
          id,
        );
        if (choque) {
          descartados.push(`${donde}: con ${ajuste.durationWeeks} semanas ${choque}.`);
          perdidoPorElCalendario(`llevar ${nombreDe(id)} a ${enSemanas(ajuste.durationWeeks)}`, choque, "si se ajusta");
          delete ajuste.durationWeeks;
        }
      }

      const cambiaAlgo =
        ajuste.durationWeeks !== undefined ||
        ajuste.startWeek !== undefined ||
        ajuste.name !== undefined ||
        ajuste.sessionCount !== undefined;
      if (cambiaAlgo) ajustes.set(id, ajuste);
      continue;
    }

    if (tipo === "agregar") {
      const despuesDe = texto(c.despuesDeFaseId);
      const nombre = typeof c.name === "string" ? sanitizeTaskTitle(c.name) : "";
      const donde = `agregar «${nombre || "(sin nombre)"}»`;
      if (nuevas.length >= MAX_FASES_NUEVAS) {
        descartados.push(`${donde}: ya hay ${MAX_FASES_NUEVAS} fases nuevas.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      if (!porId.has(despuesDe)) {
        // Sin ancla iría al principio: antes de la Semana 0. Un id inventado, a ningún lado.
        descartados.push(`${donde}: no dice después de qué fase va (o la fase no existe).`);
        continue;
      }
      if (!esEnteroEntre(c.durationWeeks, 1, 52)) {
        descartados.push(`${donde}: la duración tiene que ser un entero de 1 a 52 semanas.`);
        continue;
      }
      const problema = problemaDelNombre(nombre, null);
      if (problema) {
        descartados.push(`${donde}: ${problema}.`);
        /* Una fase ACORDADA no se pierde en silencio por su nombre: el CSE la ve y decide. */
        if (nombre) {
          observacionesDelArmador.push(
            recortar(
              `Se sugirió sumar la fase «${nombre}» después de ${nombreDe(despuesDe)}, pero ${problema}: si ` +
                `corresponde, agrégala a mano con otro nombre.`,
              MAX_LARGO_OBSERVACION,
            ),
          );
        }
        continue;
      }
      // El calendario: la fase nueva no arranca en el pasado ni corre lo que ya empezó.
      const iAncla = planDeHoy.findIndex((s) => s.id === despuesDe);
      const conLaNueva: Simulada[] = [
        ...planDeHoy.slice(0, iAncla + 1),
        { id: null, durationWeeks: c.durationWeeks, startWeek: null },
        ...planDeHoy.slice(iAncla + 1),
      ];
      const choque = choqueDelCalendario(conLaNueva, null);
      if (choque) {
        descartados.push(`${donde}: ${choque}.`);
        perdidoPorElCalendario(`sumar la fase «${nombre}» después de ${nombreDe(despuesDe)}`, choque, "dónde va");
        continue;
      }
      nombresTomados.add(normalizarParaFrontera(nombre));
      const tipoDeFase = texto(c.activityType);
      nuevas.push({
        despuesDe,
        fase: {
          name: nombre,
          durationWeeks: c.durationWeeks,
          startWeek: null,
          sessionCount: esEnteroEntre(c.sessionCount, 1, 50) ? c.sessionCount : null,
          notes: null,
          activityType: (ACTIVITY_TYPES as readonly string[]).includes(tipoDeFase) ? tipoDeFase : null,
          motivo,
        },
      });
      continue;
    }

    if (tipo === "mover") {
      const id = texto(c.faseId);
      const despuesDe = texto(c.despuesDeFaseId);
      const f = porId.get(id);
      if (!f) {
        descartados.push(`mover: la fase «${id || "(sin id)"}» no existe.`);
        continue;
      }
      const donde = `mover ${nombreDe(id)}`;
      if (movidas.has(id)) {
        descartados.push(`${donde}: ya había otro movimiento para esa fase.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      const bloqueo = intocable(f);
      if (bloqueo) {
        descartados.push(`${donde}: ${bloqueo}.`);
        acordadoQueNoEntra(
          porId.has(despuesDe) && despuesDe !== id ? `mover ${nombreDe(id)} después de ${nombreDe(despuesDe)}` : `mover ${nombreDe(id)}`,
          bloqueo,
          "si se mueve",
        );
        continue;
      }
      if (!porId.has(despuesDe) || despuesDe === id) {
        descartados.push(`${donde}: no dice después de qué otra fase va (o la fase no existe).`);
        continue;
      }
      movidas.set(id, { despuesDe, motivo });
      continue;
    }

    descartados.push(`Un cambio de tipo «${tipo || "(sin tipo)"}» no existe: solo ajustar, agregar o mover.`);
  }

  // ── EL ARMADO: copia EXACTA de lo vigente + solo lo aceptado ──────────────────
  const motivos = new Map<string, string>();
  const anotarMotivo = (id: string, m: string) => {
    const previo = motivos.get(id);
    motivos.set(id, previo && previo !== m ? `${previo} · ${m}` : m);
  };

  const copia = new Map<string, ProposalPhaseLike>(
    fases.map((f) => {
      const a = ajustes.get(f.id);
      if (a) anotarMotivo(f.id, a.motivo);
      /* ⭐ LOS CAMPOS QUE SE PROPONEN, y solo esos (revisión adversarial, 2026-09-24): los deltas se
         recalculan contra las fases VIVAS, y con la foto entera cualquier cosa que el CSE editara
         después (una nota, un nombre, otra duración) volvía como sugerencia de revertirla. */
      const campos: PhaseField[] = a
        ? (["durationWeeks", "startWeek", "name", "sessionCount"] as const).filter((k) => a[k] !== undefined)
        : [];
      return [
        f.id,
        {
          id: f.id,
          name: a?.name ?? f.name,
          durationWeeks: a?.durationWeeks ?? f.durationWeeks,
          startWeek: a && a.startWeek !== undefined ? a.startWeek : (f.startWeek ?? null),
          sessionCount: a?.sessionCount ?? f.sessionCount ?? null,
          // ⛔ Las notas y el tipo de una fase existente NUNCA salen del modelo.
          notes: f.notes ?? null,
          activityType: f.activityType ?? null,
          campos,
        },
      ];
    }),
  );

  /* El ORDEN no se guarda como foto: cada «mover» aceptado queda en `movidas` y el reordenamiento se
     arma sobre el orden vivo (`secuenciaPropuesta`, lib/timeline/proposal-deltas.ts). El array de
     fases va en el orden de hoy, con las nuevas detrás de su ancla. `ordenSimulado` es solo para el
     calendario: los «mover» se prueban JUNTOS, en el orden en que llegaron. */
  const ordenSimulado = fases.map((f) => f.id);
  const movidasAceptadas: MovidaDeFase[] = [];
  for (const [id, m] of movidas) {
    const sin = ordenSimulado.filter((x) => x !== id);
    const at = sin.indexOf(m.despuesDe);
    if (at < 0) continue;
    sin.splice(at + 1, 0, id);
    if (sin.join("\u0000") === ordenSimulado.join("\u0000")) {
      descartados.push(`mover ${nombreDe(id)}: ya está después de ${nombreDe(m.despuesDe)}.`);
      continue;
    }
    /* El calendario, con los «mover» ya aceptados: van JUNTOS en un solo reordenamiento. La fase
       movida no arranca en el pasado, nada que ya empezó se corre y las del medio no caen de
       rebote en el pasado. */
    const porIdSim = new Map(planDeHoy.map((s) => [s.id, s]));
    const reordenado = sin.map((x) => porIdSim.get(x)!);
    const choque = choqueDelCalendario(reordenado, id);
    if (choque) {
      descartados.push(`mover ${nombreDe(id)}: ${choque}.`);
      perdidoPorElCalendario(`mover ${nombreDe(id)} después de ${nombreDe(m.despuesDe)}`, choque, "si se mueve");
      continue;
    }
    ordenSimulado.splice(0, ordenSimulado.length, ...sin);
    movidasAceptadas.push({ id, despuesDe: m.despuesDe });
    anotarMotivo(id, m.motivo);
  }

  const phases: ProposalPhaseLike[] = [];
  for (const id of fases.map((f) => f.id)) {
    const p = copia.get(id)!;
    const m = motivos.get(id);
    phases.push(m ? { ...p, motivo: m } : p);
    for (const n of nuevas.filter((x) => x.despuesDe === id)) phases.push(n.fase);
  }

  /* ⭐ EL PLAZO TOTAL LO COMPARA EL SISTEMA (medido en vivo 2026-09-24: el modelo invertía la
     dirección 6 de 6). El modelo solo devuelve la semana en que vence y de dónde sale; la frase, con
     la cuenta hecha contra el cierre actual, la escribe `fraseDelPlazo`. Un `plazoTotal` inválido
     (no entero, fuera de 1..104) se ignora: no hay frase. */
  const fraseDelSistema =
    input.cierreActual != null && esObjeto(plazoTotal)
      ? fraseDelPlazo({ semanaAcordada: plazoTotal.semana, cierreActual: input.cierreActual, fuente: plazoTotal.fuente })
      : null;
  const delSistema = fraseDelSistema ? [recortar(fraseDelSistema, MAX_LARGO_OBSERVACION)] : [];

  /* UN solo tope de observaciones, al final (revisión del paso A2): antes se recortaban las del
     modelo y cada fase descartada sumaba otra encima (5 + 2 = 7). La del plazo va siempre (es la
     única cuenta que el CSE no ve en otro lado), las del armador también —son lo acordado que no
     entró y el CSE lo tiene que decidir a mano— y las del modelo llenan el resto, en su orden. */
  const delArmador = observacionesDelArmador.slice(0, MAX_OBSERVACIONES - delSistema.length);
  const observaciones = [
    ...observacionesDelModelo.slice(0, Math.max(0, MAX_OBSERVACIONES - delSistema.length - delArmador.length)),
    ...delArmador,
    ...delSistema,
  ];

  const propuesta: ProposalLike = {
    anchorStartDate: null,
    phases,
    origen: "contexto",
    observaciones,
    movidas: movidasAceptadas,
  };
  const actuales: CurrentPhaseLike[] = fases.map((f) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek ?? null,
    sessionCount: f.sessionCount ?? null,
    notes: f.notes ?? null,
    activityType: f.activityType ?? null,
  }));
  const deltas = computeProposalDeltas(actuales, propuesta, input.anchorISO);
  return {
    propuesta: deltas.length > 0 ? propuesta : null,
    deltas,
    descartados,
    observaciones,
    acordadoSinEntrar: observacionesDelArmador.length,
  };
}

/**
 * La semana DEL PROYECTO (desde 0) en que cae `ahora`, o null sin ancla o sin `ahora`. El día se
 * toma en Costa Rica con la MISMA función que el calendario que leyó el modelo: si no, la «semana
 * de hoy» del armador y la del prompt podrían diferir de noche.
 */
function semanaDelProyecto(anchorISO: string | null, ahora: number | null): number | null {
  if (!anchorISO || ahora === null) return null;
  const a = new Date(anchorISO);
  if (Number.isNaN(a.getTime())) return null;
  const ancla = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.floor((diaEnCostaRica(ahora) - ancla) / (7 * DIA_MS));
}

/**
 * LA SEMANA 0 / KICK-OFF DEL PROYECTO, o null si no tiene — una sola regla para el armador (que no
 * la deja tocar) y para el calendario que lee el modelo (que la nombra). `fases` EN ORDEN.
 *
 * ⛔ Los pipelines con agente de handoff propio (Desarrollo, Web) NO tienen Semana 0: su handoff la
 * prohíbe y nunca se les antepone (lib/timeline/semana-cero.ts). Su primera fase es trabajo real
 * («Relevamiento técnico»). El armador la tomaba igual como Semana 0 —la de `order` 0, se llamara
 * como se llamara— y descartaba en silencio lo acordado sobre ella: la pantalla decía «tus reuniones
 * no piden cambios» (revisión adversarial, 2026-09-24). Quien llama decide `conSemanaCero` con la
 * clave del pipeline (`claveConVozDeHandoffPropia`).
 */
export function faseDeSemanaCero<T extends { id: string; name: string }>(
  fasesEnOrden: readonly T[],
  conSemanaCero: boolean,
): T | null {
  if (!conSemanaCero) return null;
  const elegida = elegirFaseDeSemanaCero(fasesEnOrden.map((f, i) => ({ ...f, order: i })));
  return elegida ? (fasesEnOrden.find((f) => f.id === elegida.id) ?? null) : null;
}

/**
 * ¿El motivo CITA de dónde sale el pedido? Una reunión (por la palabra, un kick-off o una fecha
 * como «23 sep»: el prompt pide citar el título y la fecha), una nota o las instrucciones del CSE.
 * Es un piso, no un juez: «el nombre describe mejor el trabajo» no cita nada y no alcanza para
 * renombrar una fase de «Desarrollo / Integración». Que las instrucciones EXCLUYAN un tema no es
 * motivo para renombrar: eso lo frena `motivoEsUnaExclusion`, porque la cita sola lo dejaba pasar.
 */
export function motivoCitaUnaFuente(motivo: string): boolean {
  const n = normalizarParaFrontera(motivo);
  return (
    /\b(notas?|reunion(es)?|instrucciones|kick ?off|kickoff)\b/.test(n) ||
    /\b\d{1,2} (de )?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\b/.test(n) ||
    /\b\d{4} \d{1,2} \d{1,2}\b/.test(n)
  );
}

/**
 * ¿El motivo es que algo quedó EXCLUIDO? (revisión del paso A3, segunda vuelta). Las 3 salidas de
 * la ronda r2-E2 renombraron «Desarrollo SDK / Integración» a «Desarrollo e integración» con
 * motivos como «Instrucciones del CSE: excluir integraciones… nombre que el cliente no debe ver…
 * fuera del alcance de marketing». Citaban las instrucciones, así que `motivoCitaUnaFuente` las
 * dejaba pasar las 3. El prompt lo prohíbe («su tema choca con una EXCLUSIÓN de las
 * instrucciones»); este es el piso barato del armador para las fases de Desarrollo / Integración:
 * si la fase ya no va, lo decide el CSE, no un nombre más neutro.
 */
export function motivoEsUnaExclusion(motivo: string): boolean {
  const n = normalizarParaFrontera(motivo);
  return (
    /\bexclu(ir|ye|yen|ya|yan|ido|ida|idos|idas|sion|siones|imos)\b/.test(n) ||
    /\bfuera del alcance\b/.test(n) ||
    /\bno (debe|deberia|tiene que|puede) ver(lo|la|los|las)?\b/.test(n) ||
    /\bnada (de|que no)\b/.test(n)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LEER LA RESPUESTA DEL MODELO ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La respuesta del revisor, leída sin romperse por lo que la rodea (revisión del paso A3). El
 * prompt pide «sin markdown», y aun así las 6 respuestas CON cambios de la prueba en vivo vinieron
 * envueltas en ```json … ```. La ruta leía con `/\{[\s\S]*\}/` —de la primera `{` a la ÚLTIMA `}`—:
 * una prosa después del JSON con una llave, o una llave de más al cerrar, daba ESTRUCTURA_FALLO.
 *
 * Se buscan objetos BALANCEADOS (respetando comillas y escapes: `extraerJson`, de
 * lib/cs/brief-citas.ts) que parsean y TIENEN FORMA de respuesta (`cambios`, `observaciones` o el
 * envoltorio `estructura`). Un objeto de adentro —un cambio suelto de un JSON roto— no pasa por la
 * respuesta, porque «sin cambios» y «no se pudo leer» son dos avisos distintos para el CSE.
 *
 * ⭐ CUÁL, SI HAY VARIOS (revisión del paso A3, segunda vuelta): la respuesta es la ÚLTIMA, no la
 * primera. Un modelo que repite el formato antes de contestar («Formato de ejemplo: {"cambios": [],
 * …}» y después el ```json con el cambio real) daba el ejemplo vacío: un «sin cambios» en silencio
 * donde antes había un ESTRUCTURA_FALLO visible. Primero manda lo que viene dentro de un cerco
 * ``` (el último que traiga una respuesta); sin cercos que la traigan, el último objeto del texto.
 * null = ilegible.
 */
export function leerRespuestaDeEstructura(texto: string): Record<string, unknown> | null {
  const cercos = [...texto.matchAll(/```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)```/g)].map((m) => m[1]);
  for (const cerco of cercos.reverse()) {
    const r = ultimaRespuestaEn(cerco);
    if (r) return r;
  }
  return ultimaRespuestaEn(texto.replace(/```[a-zA-Z]*/g, " "));
}

/** Las respuestas de `texto`, en orden: la última, o null. */
function ultimaRespuestaEn(texto: string): Record<string, unknown> | null {
  let ultima: Record<string, unknown> | null = null;
  let i = texto.indexOf("{");
  while (i >= 0) {
    const candidato = extraerJson(texto.slice(i));
    let valor: unknown = undefined;
    if (candidato) {
      try {
        valor = JSON.parse(candidato);
      } catch {
        valor = undefined;
      }
    }
    if (candidato && esObjeto(valor) && ("cambios" in valor || "observaciones" in valor || "estructura" in valor)) {
      ultima = valor;
      // Una respuesta se salta entera: lo de adentro (sus cambios) no es otra respuesta.
      i = texto.indexOf("{", i + candidato.length);
    } else {
      // No parsea, o no es la respuesta: puede empezar más adentro («Formato {x: 1}. Respuesta: {…}»).
      i = texto.indexOf("{", i + 1);
    }
  }
  return ultima;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PLAZO TOTAL CONTRA EL PLAN: SIEMPRE EN LA DIRECCIÓN CORRECTA ─────────────
// ─────────────────────────────────────────────────────────────────────────────
/*
 * Decisión de Elías: un plazo total sin detalle por fase («son 12 semanas») no se reparte; solo se
 * compara el cierre actual contra el acordado, en una observación. La prueba en vivo (A3) mostró que
 * esa observación podía decir lo contrario de la verdad: con el plan en 15 semanas y 12 acordadas,
 * las 3 corridas de E3 dijeron «3 semanas de holgura», y otras dos «dentro del plazo». El CSE
 * recibía una nota interna que TAPABA 3 semanas de exceso. Se probó obligar al modelo a UNA de tres
 * frases, con el CIERRE ACTUAL en números y la resta explicada en el calendario: igual escribió
 * «quedan 3 semanas de margen» con el plan 3 semanas pasado.
 *
 * ⭐ LA CUENTA PASA AL CÓDIGO (medido en vivo 2026-09-24: el modelo invertía la dirección 6 de 6; con
 * esto, 12 de 12 en la dirección correcta). El modelo devuelve `"plazoTotal": {"semana": M, "fuente"}`
 * —M, la semana del proyecto en que vence— y `fraseDelPlazo` escribe la comparación contra el cierre
 * actual (`cierreActualDelPlan`, lib/contexto/estructura-cronograma.ts: el fijado a mano, u hoy si el
 * planificado ya pasó con fases sin terminar): el MISMO que leyó el modelo en su calendario, con la
 * misma foto y el mismo `ahora` (ver la ruta). `revisarDireccionDelPlazo` sigue midiendo, en la prueba
 * en vivo, que ninguna observación diga lo contrario.
 */
export const FRASE_PLAZO_JUSTO = "El plan cierra justo en el plazo acordado";
/** Hasta qué semana del proyecto se acepta un plazo total (dos años: lo mismo que `inicioSemana`). */
export const MAX_SEMANA_DEL_PLAZO = 104;
/** De dónde sale el plazo (la reunión y su fecha, la nota o las instrucciones): corto, es interno. */
const MAX_LARGO_FUENTE_DEL_PLAZO = 160;

/**
 * LA OBSERVACIÓN DEL PLAZO TOTAL, con la cuenta hecha: el cierre actual contra la semana en que vence
 * lo acordado. Pura. null si `semanaAcordada` o `cierreActual` no son enteros de 1 a
 * MAX_SEMANA_DEL_PLAZO (lo que devolvió el modelo no se compara a ciegas).
 *  · cierre DESPUÉS del plazo → «El plan se pasa N semanas del plazo acordado (semana M): …»
 *  · cierre ANTES             → «Quedan N semanas de margen hasta el plazo acordado (semana M): …»
 *  · en la misma semana       → «El plan cierra justo en el plazo acordado (semana M).»
 * Con `fuente`, cierra con «Fuente: …».
 */
export function fraseDelPlazo(p: { semanaAcordada: unknown; cierreActual: unknown; fuente?: unknown }): string | null {
  const { semanaAcordada: M, cierreActual: C } = p;
  if (!esEnteroEntre(M, 1, MAX_SEMANA_DEL_PLAZO) || !esEnteroEntre(C, 1, MAX_SEMANA_DEL_PLAZO)) return null;
  const d = Math.abs(C - M);
  const frase =
    C > M
      ? `El plan se pasa ${enSemanas(d)} del plazo acordado (semana ${M}): el cierre actual es la semana ${C}.`
      : C < M
        ? `${d === 1 ? "Queda" : "Quedan"} ${enSemanas(d)} de margen hasta el plazo acordado (semana ${M}): el cierre actual es la semana ${C}.`
        : `${FRASE_PLAZO_JUSTO} (semana ${M}).`;
  const fuente = recortar(texto(p.fuente).replace(/[\s.;:,]+$/, ""), MAX_LARGO_FUENTE_DEL_PLAZO);
  return fuente ? `${frase} Fuente: ${fuente}.` : frase;
}

/** Lo que dice lo contrario de la verdad, según hacia dónde va el plan (sobre el texto normalizado). */
const DICE_QUE_SOBRA = [/\bholgura\b/, /\bmargen\b/, /\bdentro del plazo\b/, /\ba tiempo\b/];
const DICE_QUE_SE_PASA = [/\bse pasa\b/, /\bexcede\b/, /\bsupera\b/, /\bfuera del plazo\b/, /\bse sale del plazo\b/];
/** Justo en el plazo: ni sobra ni se pasa (que «llega a tiempo» es cierto). */
const DICE_QUE_NO_ES_JUSTO = [/\bholgura\b/, /\bmargen\b/, ...DICE_QUE_SE_PASA];
/** Una negación en la misma cláusula, ANTES de la palabra: «sin margen», «no hay holgura». */
const NEGACION = /\b(sin|no|ningun|ninguna|ni|nunca|tampoco)\b/;

/**
 * La frase esperada como patrón, tolerando el número (revisión del paso A3, segunda vuelta): cuando
 * el modelo escribía la comparación, con 1 semana de diferencia ponía «se pasa 1 semanas» o «quedan 1
 * semanas de margen», que dicen lo correcto. Reconoce también la de `fraseDelPlazo` (empieza igual).
 */
function patronDelPlazo(semanasDelPlan: number, semanasAcordadas: number): RegExp {
  const d = Math.abs(semanasDelPlan - semanasAcordadas);
  if (semanasDelPlan > semanasAcordadas) return new RegExp(`\\bel plan se pasa ${d} semanas? del plazo acordado\\b`);
  if (semanasDelPlan < semanasAcordadas) return new RegExp(`\\bquedan? ${d} semanas? de margen\\b`);
  return new RegExp(`\\b${normalizarParaFrontera(FRASE_PLAZO_JUSTO)}\\b`);
}

/**
 * ¿La observación AFIRMA alguno de los patrones? Por cláusula, y sin contar los que tienen una
 * negación antes en la misma cláusula: «…se pasa 3 semanas del plazo acordado, sin margen para
 * imprevistos» es correcta, no contraria. Es una medición, no un juez: «no incluye el piloto y deja
 * holgura» se corta en el «y», pero una negación lejana en la misma cláusula la tapa.
 */
function afirma(observacion: string, patrones: readonly RegExp[]): boolean {
  const clausulas = observacion
    .split(/[,;:.!?()[\]–—]+|\s(?:y|pero|aunque|mientras que)\s/i)
    .map(normalizarParaFrontera);
  return clausulas.some((c) =>
    patrones.some((p) =>
      [...c.matchAll(new RegExp(p.source, "g"))].some((m) => !NEGACION.test(c.slice(0, m.index))),
    ),
  );
}

/**
 * ¿Las observaciones comparan el plan contra un plazo total EN LA DIRECCIÓN CORRECTA? Pura, para la
 * prueba en vivo del revisor, sobre las observaciones FINALES del armador (con la del sistema). Pide
 * que alguna observación sobre el cierre traiga la frase de `fraseDelPlazo` (en singular o plural) y
 * que ninguna de las que hablan del cierre afirme lo contrario («holgura», «margen» o «dentro del
 * plazo» si el plan se pasa; «se pasa», «excede» o «supera» si sobra): el modelo ya no escribe la
 * comparación, pero si la escribe igual y al revés, esto la marca. Habla del cierre la que trae la
 * frase, «M semanas», «plazo acordado» o «plazo total», o «plazo» junto al cierre: otra observación
 * con «a tiempo» (una entrega que llegó a tiempo) no se mide.
 */
export function revisarDireccionDelPlazo(
  observaciones: readonly string[],
  semanasDelPlan: number,
  semanasAcordadas: number,
): { ok: boolean; motivo: string } {
  const esperada = fraseDelPlazo({ semanaAcordada: semanasAcordadas, cierreActual: semanasDelPlan }) ?? "";
  const patron = patronDelPlazo(semanasDelPlan, semanasAcordadas);
  const delCierre = observaciones.filter((o) => {
    const n = normalizarParaFrontera(o);
    return (
      patron.test(n) ||
      new RegExp(`\\b${semanasAcordadas} semanas\\b`).test(n) ||
      /\bplazo (acordado|total)\b/.test(n) ||
      (/\bplazo\b/.test(n) && /\b(cierre|cierra|cerrar|termina|dura)\b/.test(n))
    );
  });
  if (delCierre.length === 0) return { ok: false, motivo: "ninguna observación compara el plan con el plazo acordado" };
  if (!delCierre.some((o) => patron.test(normalizarParaFrontera(o)))) {
    return { ok: false, motivo: `ninguna observación dice «${esperada}»` };
  }
  const contrarias =
    semanasDelPlan > semanasAcordadas
      ? DICE_QUE_SOBRA
      : semanasDelPlan < semanasAcordadas
        ? DICE_QUE_SE_PASA
        : DICE_QUE_NO_ES_JUSTO;
  const alReves = delCierre.find((o) => afirma(o, contrarias));
  if (alReves) return { ok: false, motivo: `una observación dice lo contrario: «${alReves}»` };
  return { ok: true, motivo: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA MÁQUINA DE PASOS DE LA PANTALLA ───────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que devolvió POST /timeline/estructura, visto por la pantalla. `red` = ni llegó.
 *  `runId` es el token de la propuesta que se escribió; `error`, el código de un 409. */
export type RespuestaDeEstructura =
  | { red: true }
  | {
      red?: false;
      status: number;
      estado?: unknown;
      message?: unknown;
      acordadoSinEntrar?: unknown;
      runId?: unknown;
      error?: unknown;
    };

/**
 * E2a: «tareas» sigue SIEMPRE al paso 2, ya sin esperar al CSE. `token` = la propuesta que el paso 1
 * acaba de escribir (el paso 2 le suma sus tareas); null = no escribió ninguna (sin material, sin
 * cambios o falló) y el paso 2 crea la suya. Se retira «esperar»: era el corte que dejaba las tareas
 * para después de decidir las fases.
 */
export type PasoTrasEstructura =
  | { paso: "tareas"; token: string | null; aviso?: string }
  | { paso: "detener"; mensaje: string }
  | { paso: "decidir" };

/** 409 del paso 1 cuando ya hay uno corriendo para este proyecto (otra pestaña u otra persona): lo
 *  dice la ruta y, si el mensaje no llegara, la pantalla. */
export const MENSAJE_ESTRUCTURA_EN_CURSO =
  "Ya se están revisando las fases de este proyecto (en otra pestaña o por otra persona): espera un minuto y vuelve a mirar.";

/**
 * ¿La revisión de fases va a leer algo? Lo decide lo que la pantalla YA SABE del «Contexto del
 * cronograma», no un reloj (revisión del paso A2, segunda vuelta): el cartel «Paso 1 de 2 ·
 * Revisando fases y tiempos con tus reuniones y notas» salía después de 1,2 s de espera, y sin
 * material la ruta igual lee el cronograma, los permisos y lo elegido antes de responder: en un prod
 * lento (congelamientos de 15 a 25 s) salía aunque nadie eligiera nada. Con notas, sí. Con
 * reuniones, si el informe del cargador dice que alguna le llega a la IA (una agendada o una sin
 * resumen no cuentan); sin informe todavía, alcanza con que haya una elegida.
 * ⭐ Con «Instrucciones adicionales» guardadas, también (revisión adversarial, 2026-09-24): son la
 * fuente de más peso, y un «Capacitación dura 3 semanas» escrito ahí no movía ninguna fase porque
 * sin reuniones ni notas el paso 1 no corría. La ruta lee lo mismo (`hayQueRevisarLasFases`).
 */
export function hayMaterialParaElPaso1(input: {
  reuniones: number;
  notas: number;
  informe: { reuniones: ReadonlyArray<{ entran: number }> } | null;
  /** Hay «Instrucciones adicionales» guardadas en el cronograma. */
  instrucciones?: boolean;
}): boolean {
  if (input.instrucciones) return true;
  if (input.notas > 0) return true;
  if (input.reuniones === 0) return false;
  return input.informe ? input.informe.reuniones.some((r) => r.entran > 0) : true;
}

export const AVISO_SIN_CAMBIOS = "Tus reuniones, notas e instrucciones no piden cambios de fases ni de tiempos.";
/** Sin propuesta, pero con cambios ACORDADOS que el armador no pudo proponer (por el nombre o por el
 *  calendario): quedaron en las observaciones, que se ven en «La IA también notó» (la franja sin
 *  barra, ObservacionesDelPaso1, o la barra de la propuesta). Decir «no piden cambios» sería falso y
 *  contradiría a esa misma observación. */
export const AVISO_ACORDADO_SIN_ENTRAR =
  "Tus reuniones, notas o instrucciones piden cambios de fases que no se pueden proponer solos: los ves en «La IA también notó» y decides tú.";
/** 409 con una propuesta pendiente (del handoff, o de «Regenerar todo» con fases y tareas): no se
 *  arman tareas sobre una propuesta sin decidir. Lo dice también la ruta del paso 1 (estructura). */
export const AVISO_PROPUESTA_PENDIENTE =
  "Hay una propuesta del cronograma sin decidir: resuélvela y vuelve a regenerar.";
/* E2b (2026-09-25): se fue `AVISO_DECIDE_PRIMERO` («…decídelos y después sigo con las tareas»). Era de
   la cadena vieja de dos pasos, que ya no existe: con cualquier propuesta abierta se dice
   `AVISO_PROPUESTA_PENDIENTE`, y nada sigue solo con las tareas al decidirla. */
export const AVISO_FALLO_DE_ESTRUCTURA = "Esta vez no se pudieron revisar las fases; sigo con las tareas.";
/**
 * Por qué NINGÚN otro cambio con IA se aplica ENCIMA de una propuesta sin decidir: un cambio que se
 * guarda con un PUT con motivo borraba `pendingProposal` en silencio; desde E1 ese PUT responde 409
 * PROPUESTA_ABIERTA (timeline/route.ts). La misma idea le llega al modelo del chat en su contexto.
 * Desde E2a la propuesta puede traer también tareas: el texto dice «la propuesta del cronograma»;
 * el nombre de la constante se queda (lo citan las guardas de estructura-cronograma.test.ts).
 * E3 P5: con una propuesta abierta, el chat pasa lo acordado a la propuesta: la frase lo ofrece.
 * E4 (2026-09): la decía la pantalla al frenar «Pedir cambio con IA», que se retiró; el chat frena con
 * sus propios motivos (`motivoDelChat` del cronograma).
 */
export const CAMBIOS_DE_FASES_SIN_DECIDIR =
  "Primero decide la propuesta del cronograma (arriba del Gantt), o pídele el cambio al chat: lo pasa a la propuesta.";

/**
 * E3 P5: un acuerdo del chat hecho para el cronograma de HOY, con una propuesta abierta que llegó
 * después. Aplicarlo escribiría el cronograma por debajo de la propuesta (el PUT con motivo la borraba;
 * desde E1 responde 409): se pide de nuevo, y esa vez va a la propuesta.
 */
export const ACUERDO_PARA_EL_VIGENTE =
  "Hay una propuesta abierta y esto se acordó antes de que llegara: pídemelo de nuevo y lo paso a la propuesta.";

/**
 * Qué hace la pantalla después de pedir la estructura (paso 1). Desde E2a el paso 2 sigue SIN
 * esperar al CSE: las tareas se arman sobre la estructura propuesta y entran a la misma propuesta.
 *  · 'tareas' con token — hay una propuesta (un `borrador-v1` recién escrito, su token es `runId`):
 *                 la pantalla la muestra y pide sus tareas enseguida (el paso 2 le suma las suyas);
 *  · 'tareas' sin token — no hay nada que decidir (sin material, sin cambios, o solo lo acordado que
 *                 no se pudo proponer: el aviso lo dice) o el paso 1 falló (falla, red): sigue con
 *                 las tareas, que crean su propia propuesta. ⛔ Una falla del paso 1 NUNCA traba al
 *                 CSE: el detalle corre igual;
 *  · 'decidir'  — 409: YA hay una propuesta sin decidir (del handoff, o de una revisión que se pidió
 *                 en otra pestaña o la pidió otra persona), o una «propuesta» sin token (no se sabe
 *                 cuál quedó guardada). ⛔ NO sigue con las tareas (revisión adversarial,
 *                 2026-09-24): antes corría igual el detalle —la corrida más cara del cronograma—
 *                 sobre fases que nadie había decidido, y el aviso mismo pedía volver a regenerar: se
 *                 pagaba dos veces. La pantalla trae esa propuesta y la muestra;
 *  · 'detener'  — 403: sin permiso para cambiar el cronograma con IA, el paso 2 tampoco lo tendría;
 *                 o 409 ESTRUCTURA_EN_CURSO: el paso 1 ya corre para este proyecto (otra pestaña u
 *                 otra persona) y su propuesta aparece al volver a cargar.
 */
export function pasoTrasEstructura(r: RespuestaDeEstructura): PasoTrasEstructura {
  if (r.red) return { paso: "tareas", token: null, aviso: AVISO_FALLO_DE_ESTRUCTURA };
  if (r.status === 403) {
    return {
      paso: "detener",
      mensaje: typeof r.message === "string" && r.message ? r.message : "No tienes permiso para cambiar el cronograma con IA.",
    };
  }
  if (r.status === 409 && r.error === "ESTRUCTURA_EN_CURSO") {
    return {
      paso: "detener",
      mensaje: typeof r.message === "string" && r.message ? r.message : MENSAJE_ESTRUCTURA_EN_CURSO,
    };
  }
  if (r.status === 409) return { paso: "decidir" };
  if (r.status < 200 || r.status >= 300) return { paso: "tareas", token: null, aviso: AVISO_FALLO_DE_ESTRUCTURA };
  if (r.estado === "propuesta") {
    // Sin token no se sabe cuál es la guardada: se trae y se decide, nunca se arma sobre otra.
    return typeof r.runId === "string" && r.runId ? { paso: "tareas", token: r.runId } : { paso: "decidir" };
  }
  if (r.estado === "sin-cambios") {
    const acordado = typeof r.acordadoSinEntrar === "number" && r.acordadoSinEntrar > 0;
    return { paso: "tareas", token: null, aviso: acordado ? AVISO_ACORDADO_SIN_ENTRAR : AVISO_SIN_CAMBIOS };
  }
  if (r.estado === "sin-material") return { paso: "tareas", token: null };
  return { paso: "tareas", token: null, aviso: AVISO_FALLO_DE_ESTRUCTURA };
}

/**
 * El fallo de la revisión de fases COMO LO LEE EL CSE, para la corrida (revisión adversarial,
 * 2026-09-24). La corrida guardaba el mensaje crudo del SDK («529 {"type":"error",…
 * overloaded_error…}», «Request timed out.») y el centro de corridas lo mostraba en un toast rojo,
 * en inglés, encima del aviso de la pantalla que decía «sigo con las tareas»: dos avisos que se
 * contradecían. Ahora dice lo MISMO que la pantalla, con la causa en tuteo. El crudo va aparte, en
 * `detalle` (lo lee quien investiga, no `parseRunError`).
 */
export function errorDeLaRevisionDeFases(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  const crudo = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  const causa =
    status === 529 || crudo.includes("overloaded")
      ? "la IA está sobrecargada"
      : status === 429 || crudo.includes("rate limit")
        ? "se pasó el límite de uso de la IA"
        : /timeout|timed out|etimedout|econnreset|network/.test(crudo)
          ? "la IA tardó demasiado o se cortó la conexión"
          : crudo.includes("ilegible")
            ? "la IA devolvió una respuesta que no se pudo leer"
            : status === 401 || crudo.includes("credit balance") || crudo.includes("api key")
              ? "hay un problema con la cuenta de la IA: avísale a Elías"
              : "la IA no respondió bien";
  return `No se pudieron revisar las fases esta vez (${causa}); se siguió con las tareas.`;
}

/**
 * Qué hace la pantalla después de aplicar o descartar la propuesta: «ofrecer» armar las tareas (una
 * línea arriba del Gantt, con su botón) o «nada». Los datos se leen ANTES de limpiar la propuesta.
 *  · `tareas` — el estado de sus tareas (null = no esperaba tareas: el handoff o el formato viejo);
 *  · `conCambiosDeFases` — traía cambios de fases (`traeCambiosDeFases`);
 *  · `soloFase` — era «Regenerar» de UNA fase.
 * Se ofrece SOLO si las tareas no llegaron («faltan» o «fallo») y: se APLICÓ (quedaron las fases sin
 * sus tareas), o se DESCARTÓ el borrador vacío cuya corrida falló (sin cambios de fases: no se
 * decidió nada). Nunca después de descartar una propuesta con fases (el CSE las rechazó: armar
 * tareas sobre lo vivo no es lo que pidió), ni con `soloFase` (su «Volver a intentar» lanzaría una
 * corrida de TODAS las fases).
 * E2b (2026-09-25): se fue «auto» —la cadena vieja de dos pasos, que seguía sola con las tareas al
 * resolver la propuesta de las reuniones—. La corrida pagada nunca sale sola.
 */
export function pasoTrasResolver(input: {
  como: "aplicar" | "descartar";
  tareas: EstadoDeLasTareas | null;
  conCambiosDeFases: boolean;
  soloFase: boolean;
}): "nada" | "ofrecer" {
  if (input.soloFase) return "nada";
  if (input.tareas !== "faltan" && input.tareas !== "fallo") return "nada";
  return input.como === "aplicar" || !input.conCambiosDeFases ? "ofrecer" : "nada";
}

/**
 * Cómo terminó el DELETE de la propuesta y qué hace la pantalla con ella (revisión de E3, #14). Puro.
 *  · `respuesta` — el status del DELETE, o null si no hubo respuesta (sin conexión);
 *  · `automatico` — el descarte automático («todo ya está así»), que manda `reason`.
 * «descartada» (2xx) y «otra» (409: la guardada ya era otra y no se borró nada): el servidor ya no tiene
 * ESTA propuesta, así que se suelta de la pantalla y se olvida lo desmarcado.
 * Todo lo demás (sin conexión, un 5xx, la sesión vencida, el 423 del automático) es «fallo»: la propuesta
 * sigue guardada. A mano (la barra o el chat) NO se suelta: antes se vaciaba igual, el chat decía «vuelve a
 * intentar» y ya no había botón ni barra con que hacerlo (quedaba trabado hasta recargar). El automático sí
 * la suelta en memoria: el 423 de la ruta existe para que no la vuelva a pedir.
 */
export function trasElDescarte(
  respuesta: { ok: boolean; status: number } | null,
  automatico: boolean,
): { resultado: "descartada" | "otra" | "fallo"; soltar: boolean; olvidar: boolean } {
  if (respuesta?.ok) return { resultado: "descartada", soltar: true, olvidar: true };
  if (respuesta?.status === 409) return { resultado: "otra", soltar: true, olvidar: true };
  return { resultado: "fallo", soltar: automatico, olvidar: false };
}
