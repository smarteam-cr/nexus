/**
 * lib/timeline/tareas-del-detalle.ts — EL PASO 2 DE «REGENERAR TODO», CONVERTIDO EN CAMBIOS DEL BORRADOR.
 *
 * Puro (sin Prisma): lo que el agente de detalle devolvió, sobre la estructura que VIO (la hipotética
 * del borrador, `estructuraHipotetica`), se vuelve `tarea-nueva` / `tarea-se-va` del mismo borrador.
 * Nada se escribe en el cronograma hasta que el CSE aplica (POST /timeline/borrador/aplicar).
 *
 * ── LAS REGLAS (E2a, §2.5) ───────────────────────────────────────────────────
 *  R1. Una fase sin tareas DEL AGENTE no cambia (las fijas no cuentan): «el agente no propuso nada»
 *      no es «borra todo».
 *  R2. Con al menos una, se va cada tarea que el agente VIO y sigue en su fase, sin avance ni escrita
 *      a mano (`isKept`, mirado AHORA). Su `desde` es la versión que VIO el agente (E2b, D10; plan
 *      §1.1): una edición hecha mientras la IA armaba choca y queda fuera, en vez de borrarse con
 *      «Aplicar todo». Una creada o mudada mientras tanto no se toca.
 *  R3. Una `tarea-nueva` por cada tarea del agente, en la fase que vio (id real o `n:…`).
 *  R4. No se empareja por título para conservar ids. R4b: una que se iría y una propuesta IDÉNTICAS
 *      (huella del título, semana, notas, dueño, tipo y «por validar») no emiten nada: no se borra
 *      y se recrea lo mismo.
 *  R4c (L5). Una que se iría y una propuesta con el MISMO título completo (`huellaCompleta`, sin el
 *      corte a 60) son la misma tarea que vuelve: primero en su misma semana; en otra, solo si en la
 *      fase queda UNA de cada lado con ese título (una sesión semanal no se cruza). Si vuelve igual en
 *      semana, dueño y tipo, no emite nada; si no, un `tarea-cambia` DE LA IA (sin `porChat`) con solo
 *      lo que difiere. La nota de hoy se conserva (`tarea-cambia` no lleva nota) y se dice cuántas
 *      volvieron con otra (D12). Nunca toca una con avance: solo empareja las que se irían.
 *  R5. La semana ya viene acotada a la duración de la fase que vio el agente.
 *  R6. El tipo de actividad: solo si la fase no tiene uno (el elegido a mano manda).
 *  R7. Las fijas de la Semana 0: una viva que coincide con una fija (o con su gemela) no se va, y
 *      las fijas que faltan entran como nuevas. Así no van y vuelven en cada regeneración.
 *  R8. `tareasArmadasPara` de TODAS las fases del alcance: el cierre del plan las usa si la fase
 *      cambia después. Desde E2c P3 es la forma completa (`formaEnLaEstructura`): también las
 *      sesiones y si la fase es la primera, la de la Semana 0.
 *  R9. Orden: fase por fase; primero las que se van (por semana y orden del vivo), después las que
 *      cambian (R4c, igual) y al final las nuevas (en el orden del agente, con las fijas al final).
 *  R10. Si el modelo se cortó (`max_tokens`), la última fase no genera nada y se avisa.
 *  R11. Se avisa de una fase nueva sin tareas y de las fases que el agente nombró y no existen.
 *  R12 (L5). En «Regenerar todo» (`respetarTerminadas`), una fase TERMINADA hoy no recibe ni pierde
 *      tareas, y se dice. No en «Regenerar» de una fase ni en el recálculo (D11): ahí «lo que ya se hizo
 *      va como tarea» (EXCEPCION_DE_LA_FASE_A_REGENERAR) manda.
 *
 * ── LOS HITOS Y LO QUE YA ESTÁ (M2, 2026-09-27) ───────────────────────────────
 * Solo con `hitos` (lo pasan las fusiones desde M2 P2c; sin él, R14 y R15 no corren y todo queda como antes).
 * Pedido de Elías (27-09): Wherex terminó con tres kickoffs y la IA repetía con otras palabras lo que ya estaba.
 *  R14. La IA no repite lo que SE QUEDA en su fase (con avance, escrito a mano, que el agente no vio, un
 *      guardián): no entra la nueva con su título completo en la misma semana; en otra semana, solo contra
 *      UNA pendiente que se queda y sin ambigüedad (una de cada lado). Nunca contra una hecha en otra semana:
 *      «Revisión con el sponsor» hecha en la S1 y una nueva en la S4 entra. Lo que tocó el chat no cuenta acá:
 *      lo filtra `sinLasQueRepitenLoDelChat` en la fusión (contarlo dos veces sacaba una legítima).
 *  R15. Los hitos (lib/timeline/hitos.ts): el guardián de cada uno se queda (fuera de R2); una nueva que repite
 *      un hito con guardián en su alcance (el proyecto; la entrega de un recurrente, su ciclo) no entra, y si no
 *      tiene, entra y pasa a serlo. El kickoff que sobra (pendiente de la IA) se quita con `delSistema`, aunque
 *      la IA no haya propuesto nada en su fase; si no hay kickoff, lo agrega el sistema en la Semana 0 mientras
 *      no haya empezado. Lo hecho de más y lo escrito a mano se nombran, nunca se borran.
 *
 * ── LO QUE YA PASÓ NO SE REESCRIBE (M3, 2026-09-27) ──────────────────────────
 * Solo con `pasado` (lo pasa la fusión de «Regenerar todo» cuando el borrador trae `hoy`; «Regenerar» de una fase, el
 * recálculo, «primera» y el handoff no: ahí «lo que ya se hizo va como tarea» manda). Decisión (a) de Elías: lo pendiente
 * del pasado se avisa, no se reescribe. Ayer la propuesta de Wherex quitaba 50 tareas y sumaba 59 en semanas vencidas.
 *  R13. En una fase con alguna tarea viva, una semana que ya venció (`semanaVencida`, el predicado de «ya pasó» y
 *      «Atrasada», sobre la estructura que VIO el agente) no recibe tareas nuevas (del agente ni fijas), y lo pendiente
 *      que cae ahí se queda como si tuviera avance (fuera de R2; R14 lo cuenta como algo que se queda). Va ANTES de R1:
 *      una fase a la que la IA solo le propuso cosas del pasado no pierde sus pendientes futuras. El kickoff que sobra
 *      se quita igual (R15), y el que falta se agrega solo si la semana 0 de la Semana 0 no venció.
 *
 * ── EL ALCANCE (E2b) ─────────────────────────────────────────────────────────
 * «Regenerar» de una fase pasa `soloFases`: las demás fases se saltan enteras, antes de R8. Así R6
 * (el tipo), R7 (las fijas de la Semana 0, solo si la pedida ES la del arranque) y R8 miran solo la
 * fase pedida, aunque el modelo devuelva tareas para otras.
 *
 * ── EL RECÁLCULO (E2c) ───────────────────────────────────────────────────────
 * Las tareas de una fase DESFASADA se recalculan y REEMPLAZAN a las suyas en el borrador, en el mismo
 * lugar de la lista (`mezclarTareasDeFases`); el resto del borrador no se toca (`fusionarRecalculo`).
 *
 * ── LO QUE DICTÓ EL CHAT (E3) ────────────────────────────────────────────────
 * Las fusiones reemplazan solo las tareas de la IA: lo que dictó el chat (`porChat`) y las tareas nuevas
 * de la IA que el chat retocó (`retocada`, revisión de E3) se conservan, detrás de la estructura. Una
 * tarea viva que el chat quita o cambia no la vuelve a proponer la IA (R2): si no,
 * habría dos cambios de la misma tarea. Y una fase que se vuelve a armar pierde la forma que le había
 * dado el chat (`ajustadasPorElChat`, D9): sus tareas ya son de la forma nueva.
 * Revisión de los arreglos: la IA no ve lo que se conserva y vuelve a proponer la misma tarea; la nueva suya que
 * repite una conservada (misma fase y huella del título) no entra (`sinLasQueRepitenLoDelChat`): se creaban las dos.
 * Revisión antes del push: en otra semana solo sin ambigüedad (una sesión semanal no pierde la S1), con el título
 * completo, y una viva que el chat renombró, mudó o quitó se reconoce también como la vio el agente.
 */
import {
  huellasDeFrontera,
  marcarFugas,
  type FugaDeTarea,
  type HuellasDeFrontera,
} from "@/lib/contexto/frontera-del-cronograma";
import {
  claveDeCampo,
  claveDeTareaNueva,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  esCambioDeTarea,
  faseDeLaTarea,
  formaEnLaEstructura,
  fotoDeTarea,
  huellaDeTitulo,
  type Borrador,
  type Cambio,
  type CambioDeTarea,
  type CambioFaseCambia,
  type CambioTareaCambia,
  type ContenidoDeTareaNueva,
  type EstructuraHipotetica,
  type FaseViva,
  type FormaDeFase,
  type RecalculoDelBorrador,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { computeDetailTasksForPhase, type ComputedDetailTask } from "./compute-detail-tasks";
import {
  claveDelHito,
  HITOS,
  hitosDeLaTarea,
  hitosDelProyecto,
  MOTIVO_DEL_KICKOFF_QUE_FALTA,
  motivoDelSobrante,
  OBSERVACION_SIN_KICKOFF,
  observacionDeHechosDeMas,
  observacionDeHitoQueNoEntra,
  observacionDeKickoffAMano,
  observacionDeLasQueNoEntran,
  TAREA_DE_KICKOFF,
  type GuardianDeHito,
  type Hito,
} from "./hitos";
import { faseDeSemanaCero } from "./propuesta-de-estructura";
import { isKept } from "./regen-columnas";
import { elegirFaseDeSemanaCero, tareasFijasDeSemanaCero } from "./semana-cero-tareas";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges, plural } from "./weeks";

/** M3 (R13): lo que ya pasó, para la fusión de «Regenerar todo»: el ancla del cronograma y el instante de `Borrador.hoy`. */
export interface PasadoDeLaPropuesta {
  ancla: string;
  hoy: Date;
}

/** El vocabulario cerrado del tipo de actividad que propone el agente de detalle. */
export const DETAIL_ACTIVITY_TYPES = [
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
] as const;

/** El tipo de actividad que propone el agente, validado contra el vocabulario cerrado. */
export function activityTypePropuesto(raw: Record<string, unknown> | undefined): string | null {
  return typeof raw?.activityType === "string" &&
    (DETAIL_ACTIVITY_TYPES as readonly string[]).includes(raw.activityType as string)
    ? (raw.activityType as string)
    : null;
}

/** Lo que el agente propuso para UNA fase de la estructura que vio. */
export interface PropuestaDelDetalle {
  /** El id de la fase en la estructura hipotética (real o `n:…`). */
  fase: string;
  /** Sus tareas, ya calculadas (semana acotada, dueño y tipo validados) y marcadas con `fuga`. */
  delAgente: ComputedDetailTask[];
  tipoPropuesto: string | null;
  /** La última fase de una salida cortada por `max_tokens`: no se usa. */
  cortada: boolean;
}

type EntradaCruda = Record<string, unknown>;

/**
 * Las tareas del agente por fase, con el nombre, la duración y el tipo HIPOTÉTICOS (los que vio).
 * Las fugas se marcan antes de las fijas, como en el preview de hoy. Una entrada con un id que no
 * está en la estructura se ignora y se cuenta (si traía tareas).
 */
export function tareasPropuestasDelDetalle(i: {
  estructura: EstructuraHipotetica;
  analysisJson: unknown;
  huellas: HuellasDeFrontera | null;
  cortado: boolean;
}): { propuestas: PropuestaDelDetalle[]; idsDesconocidos: number } {
  const crudo = (i.analysisJson as { timelineDetail?: { phases?: unknown } } | null)?.timelineDetail?.phases;
  const lista: unknown[] = Array.isArray(crudo) ? crudo : [];
  const esEntrada = (r: unknown): r is EntradaCruda => !!r && typeof r === "object" && !Array.isArray(r);
  const conocidas = new Set(i.estructura.fases.map((f) => f.id));
  const porId = new Map<string, EntradaCruda>();
  let idsDesconocidos = 0;
  for (const r of lista) {
    if (!esEntrada(r)) continue;
    const id = typeof r.id === "string" ? r.id : null;
    if (id !== null && conocidas.has(id)) porId.set(id, r); // la última gana, como el preview de todas las fases
    else if (Array.isArray(r.tasks) && r.tasks.length > 0) idsDesconocidos++;
  }
  const ultima = i.cortado && lista.length > 0 ? lista[lista.length - 1] : null;
  const idCortada = esEntrada(ultima) && typeof ultima.id === "string" ? ultima.id : null;
  const huellas = i.huellas ?? huellasDeFrontera([]);

  const propuestas = i.estructura.fases.map((f): PropuestaDelDetalle => {
    const raw = porId.get(f.id);
    const tipoPropuesto = activityTypePropuesto(raw);
    const tasksRaw = Array.isArray(raw?.tasks) ? (raw.tasks as unknown[]) : [];
    const delAgente: ComputedDetailTask[] = marcarFugas(
      computeDetailTasksForPhase(f.name, f.durationWeeks, f.activityType ?? tipoPropuesto, tasksRaw),
      huellas,
    );
    return { fase: f.id, delAgente, tipoPropuesto, cortada: f.id === idCortada };
  });
  return { propuestas, idsDesconocidos };
}

export interface CambiosDelDetalle {
  tareas: CambioDeTarea[];
  /** El tipo de actividad propuesto para fases existentes que no tenían (R6). */
  tipos: CambioFaseCambia[];
  /** El tipo propuesto para las fases nuevas del borrador que no tenían, por clave. */
  tiposDeNuevas: Record<string, string>;
  tareasArmadasPara: Record<string, FormaDeFase>;
  observaciones: string[];
}

function contenidoDelAgente(t: ComputedDetailTask): ContenidoDeTareaNueva {
  const fuga = (t.fuga ?? null) as FugaDeTarea | null;
  return {
    title: t.title,
    weekIndex: t.weekIndex,
    notes: t.notes,
    party: t.party,
    type: t.type,
    needsValidation: t.needsValidation,
    motivoPorValidar: null,
    fuga: fuga
      ? { campo: fuga.campo, motivo: fuga.motivo, ...(fuga.motivoDeLaNota ? { motivoDeLaNota: fuga.motivoDeLaNota } : {}) }
      : null,
  };
}

/** R4b: una que se iría y una propuesta son la MISMA tarea. */
const identicas = (viva: TareaDelVivo, nueva: ContenidoDeTareaNueva) =>
  huellaDeTitulo(viva.title) === huellaDeTitulo(nueva.title) &&
  viva.weekIndex === nueva.weekIndex &&
  (viva.notes ?? null) === nueva.notes &&
  (viva.party ?? null) === nueva.party &&
  (viva.type ?? null) === nueva.type &&
  (viva.needsValidation ?? false) === nueva.needsValidation;

/**
 * Los cambios de tareas del paso 2, sobre la estructura que vio el agente (con las tareas que LEYÓ)
 * y el vivo de AHORA (al fusionar, con tareas): el vivo dice qué sigue en la fase y qué tiene avance;
 * el `desde` es lo que leyó el agente (R2). Ver las reglas R1-R12 arriba. `soloFases`: el alcance
 * de «Regenerar» de una fase (null o ausente = todas). `respetarTerminadas` (R12): solo «Regenerar
 * todo»; «Regenerar» de una fase y el recálculo pasan false (D11). `nuevaClave` genera los ids
 * aleatorios de las claves (los tests inyectan uno determinista). `hitos` (M2): R14 y R15; ver arriba. `pasado` (M3):
 * R13; ver arriba. Ausente o null: todo como antes, byte a byte.
 */
export function cambiosDeTareasDelDetalle(i: {
  estructura: EstructuraHipotetica;
  vivo: Vivo;
  propuestas: readonly PropuestaDelDetalle[];
  borrador: Borrador;
  tags: readonly string[];
  nuevaClave: () => string;
  idsDesconocidos: number;
  soloFases?: ReadonlySet<string> | null;
  respetarTerminadas: boolean;
  /**
   * M2: `recurrente` = el tag del proyecto (la entrega va una por ciclo); `conSemanaCero` = el pipeline tiene Semana 0
   * (Desarrollo y Web, no: ahí el sistema no agrega el kickoff). Ausente o null: R14 y R15 no corren.
   */
  hitos?: { recurrente: boolean; conSemanaCero: boolean } | null;
  /**
   * M3 (R13): lo que ya pasó. Solo la fusión de «Regenerar todo» con `Borrador.hoy` y fecha de arranque (el recálculo y
   * «Regenerar» de una fase pasan null, D3). Ausente o null: R13 no corre.
   */
  pasado?: PasadoDeLaPropuesta | null;
}): CambiosDelDetalle {
  const propuestaDe = new Map(i.propuestas.map((p) => [p.fase, p]));
  const vivas = new Map(i.vivo.fases.map((f) => [f.id, f]));
  const semanaCero = elegirFaseDeSemanaCero(i.estructura.fases.map((f, k) => ({ ...f, order: k })));
  const conTipoEnElBorrador = new Set(
    i.borrador.cambios.flatMap((c) => (c.tipo === "fase-cambia" && c.campo === "activityType" ? [c.faseId] : [])),
  );
  /** E3: las tareas vivas que el chat quita o cambia: la IA no las reemplaza (R2). */
  const tocadasPorElChat = new Set(
    i.borrador.cambios.flatMap((c) => ((c.tipo === "tarea-se-va" || c.tipo === "tarea-cambia") && c.porChat ? [c.tareaId] : [])),
  );

  const tareas: CambioDeTarea[] = [];
  const tipos: CambioFaseCambia[] = [];
  const tiposDeNuevas: Record<string, string> = {};
  const tareasArmadasPara: Record<string, FormaDeFase> = {};
  const observaciones: string[] = [];
  /** R12: las fases terminadas que no se tocaron (una sola observación, al final). */
  const terminadas: string[] = [];
  /** R4c (D12): las que vuelven con otra nota, en todas las fases (una sola observación, al final). */
  let conOtraNota = 0;

  /* ── M2 (R14, R15): los hitos del proyecto, sobre TODAS las fases (también las que quedan fuera del alcance) y
     con lo vivo de AHORA (un kickoff marcado hecho mientras la IA armaba ya cuenta). */
  const conHitos = i.hitos ?? null;
  const ultimaFase = i.estructura.fases[i.estructura.fases.length - 1]?.id ?? null;
  const delProyecto = conHitos
    ? hitosDelProyecto({
        fases: i.estructura.fases.map((f) => ({ id: f.id, name: f.name, tareas: f.existente ? (vivas.get(f.id)?.tareas ?? []) : [] })),
        recurrente: conHitos.recurrente,
      })
    : null;
  /** Los guardianes; R15 suma los que entran en esta propuesta. */
  const guardianes = new Map(delProyecto?.guardianes ?? []);
  const sobrantes = new Map((delProyecto?.sobrantes ?? []).map((s) => [s.tareaId, s]));
  /** Ni los guardianes ni los sobrantes los reemplaza R2: unos se quedan y los otros salen con su motivo. */
  const protegidas = new Set([
    ...[...guardianes.values()].flatMap((g) => (g.tareaId !== null ? [g.tareaId] : [])),
    ...sobrantes.keys(),
  ]);
  /** D8: las fases donde YA hay una entrega aceptada (su guardián): cierran su ciclo, aunque queden fuera del alcance. */
  const conEntregaQueYaEstaba = new Set([...guardianes.values()].filter((g) => g.hito === "entrega").map((g) => g.faseId));
  let cicloActual = 1;
  /** Observación 1: el primer guardián con que chocó cada hito. */
  const noEntraronPorHito = new Map<Hito, GuardianDeHito>();
  /** Observación 5: las de la IA que repiten algo que se queda (R14). */
  let repiten = 0;
  /** Las fases que pasaron el alcance, R12 y R10: solo en ellas se quita un sobrante o se agrega el kickoff. */
  const procesadas = new Set<string>();
  const semanaCeroDelProyecto = conHitos ? faseDeSemanaCero(i.estructura.fases, conHitos.conSemanaCero) : null;
  /** Dónde termina el bloque de la Semana 0 en `tareas` (R9): ahí va el kickoff que agrega el sistema. */
  let finDeLaSemanaCero = -1;

  /* ── M3 (R13): lo que ya pasó, sobre la estructura que VIO el agente (sus inicios de fase, con los cambios del
     borrador), con el ancla de hoy y el instante de `Borrador.hoy`. */
  const pasado = i.pasado ?? null;
  const rangos = pasado ? computePhaseRanges(i.estructura.fases) : [];
  const inicioDe = new Map(i.estructura.fases.map((f, k) => [f.id, rangos[k]?.start ?? 0]));
  /** Observación 5: las de la IA que caen en semanas que ya pasaron (R13). */
  let enElPasado = 0;
  /** R14 corre con los hitos (M2) o con lo que ya pasó (M3: lo vencido se queda, y la IA no lo repite). */
  const conR14 = !!conHitos || pasado !== null;

  for (const f of i.estructura.fases) {
    /* D8: el ciclo de la entrega se deduce en el recorrido. La fase empieza en `cicloActual`; si en ella queda aceptada
       una entrega (la que ya estaba o una nueva que entra, abajo), la siguiente empieza otro. */
    const ciclo = cicloActual;
    if (conHitos?.recurrente && conEntregaQueYaEstaba.has(f.id)) cicloActual++;
    // El alcance (E2b): una fase fuera de él no emite nada. `semanaCero` ya se eligió sobre todas.
    if (i.soloFases && !i.soloFases.has(f.id)) continue;
    // R8. La forma COMPLETA (E2c P3): nombre, semanas, sesiones y si es la primera (la de la Semana 0).
    tareasArmadasPara[f.id] = formaEnLaEstructura(i.estructura, f.id)!;
    /* R12 (L5): en «Regenerar todo», una fase terminada hoy no recibe ni pierde tareas (sin R6 ni R7).
       Se mira lo vivo de AHORA: si la cerraron mientras la IA armaba, tampoco se toca. */
    if (i.respetarTerminadas && f.existente && vivas.get(f.id)?.status === "DONE") {
      terminadas.push(f.name);
      continue;
    }
    const p = propuestaDe.get(f.id);
    if (p?.cortada) {
      // R10
      observaciones.push(
        `La IA se cortó antes de terminar: las tareas de «${f.name}» y de las fases que no alcanzó a armar quedan como están.`,
      );
      continue;
    }
    procesadas.add(f.id);
    const viva = f.existente ? vivas.get(f.id) : undefined;
    /* R13 (M3): en una fase con alguna tarea viva, una semana que ya venció no recibe nada nuevo y lo pendiente que cae
       ahí se queda. ANTES de R1: `sinPropuesta` se cuenta con las que ENTRAN (si la IA solo le propuso cosas del pasado,
       la fase no pierde sus pendientes futuras). */
    const conPasado = pasado !== null && (viva?.tareas?.length ?? 0) > 0;
    const inicio = inicioDe.get(f.id) ?? 0;
    const vencida = (semana: number) => conPasado && semanaVencida(pasado!.ancla, inicio, semana, pasado!.hoy);
    const delAgente = (p?.delAgente ?? []).filter((t) => !vencida(t.weekIndex));
    enElPasado += (p?.delAgente.length ?? 0) - delAgente.length;

    // R6: el tipo, solo si la fase no tiene uno.
    if (p?.tipoPropuesto) {
      if (f.existente) {
        if (viva && viva.activityType === null && !conTipoEnElBorrador.has(f.id)) {
          tipos.push({
            tipo: "fase-cambia",
            clave: claveDeCampo(f.id, "activityType"),
            faseId: f.id,
            fase: viva.name,
            campo: "activityType",
            desde: null,
            a: p.tipoPropuesto,
          });
        }
      } else if (f.activityType === null) {
        tiposDeNuevas[f.id] = p.tipoPropuesto;
      }
    }
    if (!f.existente && delAgente.length === 0) observaciones.push(`La IA no armó tareas para la fase nueva «${f.name}».`); // R11

    /* R2 (E2b, D10): el `desde` es lo que LEYÓ el agente, no lo vivo al fusionar. Una tarea editada
       mientras la IA armaba choca y queda fuera; iniciada o hecha, no se va (`isKept` de ahora);
       creada o mudada a otra fase mientras tanto, no se toca. */
    const vistas = new Map(f.tareas.map((t) => [t.id, t])); // lo que leyó el agente
    const enLaFase = viva?.tareas ?? [];
    const actuales = enLaFase.filter((t) => vistas.has(t.id)); // siguen en la fase y el agente las vio
    const sinPropuesta = delAgente.length === 0; // R1
    // E3: una tarea que el chat quita o cambia no se reemplaza (tendría dos cambios con la misma clave).
    // M2 (R15): tampoco un guardián de hito (se queda aunque la IA no lo repita) ni un kickoff que sobra (sale aparte).
    // M3 (R13): ni lo pendiente de una semana que ya venció: se queda como si tuviera avance.
    let reemplazables = sinPropuesta
      ? []
      : actuales
          .filter((t) => !isKept(t) && !tocadasPorElChat.has(t.id) && !protegidas.has(t.id) && !vencida(t.weekIndex))
          .map((t) => vistas.get(t.id)!);

    // R7: las fijas de la Semana 0.
    const fijas: ContenidoDeTareaNueva[] = [];
    if (semanaCero && semanaCero.id === f.id) {
      /* Cuenta todo lo que se queda en la fase: lo que tiene avance y, también, lo que el agente no vio
         (creada mientras la IA armaba). Si no, una fija creada en ese rato se volvería a proponer. */
      const base = [
        ...enLaFase.filter((t) => isKept(t) || !vistas.has(t.id)).map((t) => t.title),
        ...(sinPropuesta ? actuales.map((t) => t.title) : []),
        ...delAgente.map((t) => t.title),
      ];
      const quedan: TareaDelVivo[] = [];
      for (const r of reemplazables) {
        // Coincide con una fija (o con su gemela) si agregarla deja una fija menos por sembrar.
        if (tareasFijasDeSemanaCero(i.tags, [...base, r.title]).length < tareasFijasDeSemanaCero(i.tags, base).length) {
          base.push(r.title);
        } else {
          quedan.push(r);
        }
      }
      reemplazables = quedan;
      for (const t of tareasFijasDeSemanaCero(i.tags, base)) {
        // R13 (M3): una fija va en la semana 0; si ya venció, no entra (no es «de la IA»: no se cuenta).
        if (vencida(0)) continue;
        fijas.push({
          title: t.title,
          weekIndex: 0,
          notes: null,
          party: t.party,
          type: t.type,
          needsValidation: t.needsValidation,
          motivoPorValidar: t.motivoPorValidar,
          fuga: null,
        });
      }
    }

    // R3 (+ las fijas al final) y R4b: los pares idénticos no emiten nada, de a uno y en orden.
    const nuevas: Array<ContenidoDeTareaNueva | null> = [...delAgente.map(contenidoDelAgente), ...fijas];
    /* R14 (M2): no entra la que repite lo que SE QUEDA en la fase. Se queda lo que R2 no reemplaza (con avance, a mano,
       que el agente no vio, que R7 conservó, un guardián), salvo el kickoff que sobra (se va) y lo que tocó el chat
       (lo filtra `sinLasQueRepitenLoDelChat` en la fusión). Antes de R4b: lo que se va sí puede volver (R4b, R4c).
       M3: corre también con `pasado`: lo pendiente de una semana vencida se queda (R13) y la IA no lo repite en otra. */
    if (conR14) {
      const seVanPorR2 = new Set(reemplazables.map((t) => t.id));
      const quedan = enLaFase.filter((t) => !seVanPorR2.has(t.id) && !sobrantes.has(t.id) && !tocadasPorElChat.has(t.id));
      for (const j of repitenLoQueSeQueda(nuevas, quedan, enLaFase)) {
        if (j < delAgente.length) repiten++; // una fija que ya está no es «de la IA»: no se cuenta
        nuevas[j] = null;
      }
    }
    const seVan: TareaDelVivo[] = [];
    for (const r of reemplazables) {
      const j = nuevas.findIndex((n) => n !== null && identicas(r, n));
      if (j >= 0) nuevas[j] = null;
      else seVan.push(r);
    }

    /* R4c (L5): la misma tarea que vuelve (el mismo título completo) no sale como «se va + nueva». Solo
       empareja las que se irían (nunca una con avance: esas no están en `seVan`) con las nuevas de ESTA
       fase. Lo que difiere en semana, dueño o tipo va como un cambio de la IA; la nota, no (D12). */
    const cambian: CambioTareaCambia[] = [];
    const emparejadas = new Set<string>();
    for (const [r, j] of parejasQueVuelven(seVan, nuevas)) {
      const n = nuevas[j]!;
      nuevas[j] = null;
      emparejadas.add(r.id);
      if ((r.notes ?? null) !== n.notes) conOtraNota++;
      const a: CambioTareaCambia["a"] = {};
      if (n.weekIndex !== r.weekIndex) a.weekIndex = n.weekIndex;
      if (n.party !== (r.party ?? null)) a.party = n.party;
      if (n.type !== (r.type ?? null)) a.type = n.type;
      if (Object.keys(a).length === 0) continue;
      cambian.push({ tipo: "tarea-cambia", clave: claveDeTareaQueCambia(r.id), tareaId: r.id, faseId: f.id, desde: fotoDeTarea(r), a });
    }

    /* R15 (M2): los hitos, sobre las nuevas que quedan y en el orden del agente. Si ALGUNO de sus hitos ya tiene guardián
       en su alcance (el proyecto; la entrega de un recurrente, el ciclo de esta fase), no entra: «Sesión de cierre y
       entrega» no entra si ya hay entrega, aunque falte el cierre. Si no, entra marcada y pasa a ser el guardián. */
    let entraUnaEntrega = false;
    if (conHitos) {
      const cicloDeLaEntrega = conHitos.recurrente ? ciclo : null;
      const faseDelHito = { name: f.name, esUltima: f.id === ultimaFase };
      nuevas.forEach((n, j) => {
        if (n === null) return;
        const hs = hitosDeLaTarea({ title: n.title, type: n.type }, faseDelHito);
        if (hs.length === 0) return;
        const conGuardian = hs.filter((h) => guardianes.has(claveDelHito(h, cicloDeLaEntrega)));
        if (conGuardian.length > 0) {
          for (const h of conGuardian) {
            if (!noEntraronPorHito.has(h)) noEntraronPorHito.set(h, guardianes.get(claveDelHito(h, cicloDeLaEntrega))!);
          }
          nuevas[j] = null;
          return;
        }
        nuevas[j] = { ...n, hito: hs };
        for (const h of hs) {
          const deLaEntrega = h === "entrega" ? cicloDeLaEntrega : null;
          guardianes.set(claveDelHito(h, deLaEntrega), { hito: h, ciclo: deLaEntrega, tareaId: null, faseId: f.id, titulo: n.title, estado: "pendiente" });
        }
        if (hs.includes("entrega")) entraUnaEntrega = true;
      });
    }
    if (entraUnaEntrega && conHitos?.recurrente && !conEntregaQueYaEstaba.has(f.id)) cicloActual++;
    /* R15: el kickoff que sobra se va con su motivo y la marca del sistema, aunque la IA no le haya propuesto nada a su
       fase (R1). Lo que tocó el chat no se toca. Su `desde` es el de AHORA: lo decide el sistema al fusionar. */
    const sobranDeLaFase = enLaFase.filter((t) => sobrantes.has(t.id) && !tocadasPorElChat.has(t.id));

    // R9: primero las que se van (por semana, en el orden del vivo), después las que cambian (igual) y las nuevas.
    const orden = new Map(actuales.map((t, k) => [t.id, k]));
    const porLugar = (a: TareaDelVivo, b: TareaDelVivo) => a.weekIndex - b.weekIndex || (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0);
    for (const r of [...seVan.filter((x) => !emparejadas.has(x.id)), ...sobranDeLaFase].sort(porLugar)) {
      const sobrante = sobrantes.get(r.id);
      tareas.push({
        tipo: "tarea-se-va",
        clave: claveDeTareaQueSeVa(r.id),
        tareaId: r.id,
        faseId: f.id,
        desde: fotoDeTarea(r),
        ...(sobrante ? { motivo: motivoDelSobrante(sobrante.guardian), delSistema: "hito" as const } : {}),
      });
    }
    const vistaDe = new Map(seVan.map((r) => [r.id, r]));
    tareas.push(...cambian.sort((x, y) => porLugar(vistaDe.get(x.tareaId)!, vistaDe.get(y.tareaId)!)));
    for (const n of nuevas) {
      if (n) tareas.push({ tipo: "tarea-nueva", clave: claveDeTareaNueva(i.nuevaClave), fase: f.id, tarea: n });
    }
    if (f.id === semanaCeroDelProyecto?.id) finDeLaSemanaCero = tareas.length;
  }

  /* R15: el kickoff que falta. Lo agrega el sistema, UNO, en la Semana 0 del proyecto (solo si el pipeline la tiene),
     si nadie lo guarda (ni uno que ya estaba ni uno que entró), su fase se procesó (alcance, R12, R10) y no empezó.
     Si falta y la Semana 0 ya empezó, se dice (observación 4): agregarlo ahí sería inventar una fecha.
     M3: con `pasado`, «no empezó» es «su semana 0 no venció» (`semanaCeroSinPasar`): si no, caería en el pasado. */
  let faltaElKickoff = false;
  if (conHitos && semanaCeroDelProyecto && !guardianes.has("kickoff") && procesadas.has(semanaCeroDelProyecto.id)) {
    const inicioDeLaSemanaCero = inicioDe.get(semanaCeroDelProyecto.id) ?? 0;
    if (semanaCeroSinPasar(vivas.get(semanaCeroDelProyecto.id), inicioDeLaSemanaCero, pasado)) {
      tareas.splice(finDeLaSemanaCero, 0, {
        tipo: "tarea-nueva",
        clave: claveDeTareaNueva(i.nuevaClave),
        fase: semanaCeroDelProyecto.id,
        tarea: { ...TAREA_DE_KICKOFF, hito: ["kickoff"] },
        motivo: MOTIVO_DEL_KICKOFF_QUE_FALTA,
        delSistema: "hito",
      });
    } else {
      faltaElKickoff = true;
    }
  }

  if (i.idsDesconocidos > 0) {
    observaciones.push(
      `La IA devolvió tareas para ${plural(i.idsDesconocidos, "fase", "fases")} que no reconoció: se ignoraron.`,
    );
  }
  if (terminadas.length > 0) observaciones.push(observacionDeTerminadas(terminadas));
  if (conOtraNota > 0) {
    observaciones.push(`${plural(conOtraNota, "tarea vuelve", "tareas vuelven")} con otra nota: se conserva la nota de hoy.`);
  }
  if (delProyecto) {
    // M2: en este orden, y lo que se nombra solo si alguna de sus fases está en el alcance.
    const enElAlcance = (faseId: string) => !i.soloFases || i.soloFases.has(faseId);
    for (const h of HITOS) {
      const g = noEntraronPorHito.get(h);
      if (g) observaciones.push(observacionDeHitoQueNoEntra(h, g));
    }
    for (const x of delProyecto.hechosDeMas) {
      if (x.fases.some((f) => enElAlcance(f.id))) observaciones.push(observacionDeHechosDeMas(x));
    }
    for (const x of delProyecto.aManoDeMas) {
      if (enElAlcance(x.faseId)) observaciones.push(observacionDeKickoffAMano(x.titulo));
    }
    if (faltaElKickoff) observaciones.push(OBSERVACION_SIN_KICKOFF);
  }
  // Observación 5 (R14 y, desde M3, R13): una sola línea, al final.
  if (conR14) {
    const noEntran = observacionDeLasQueNoEntran({ repiten, enElPasado });
    if (noEntran) observaciones.push(noEntran);
  }
  return { tareas, tipos, tiposDeNuevas, tareasArmadasPara, observaciones };
}

/**
 * R14 (M2): los índices de las nuevas que repiten, por el título completo (`huellaCompleta`), una tarea que SE QUEDA:
 *   1. en su misma semana, contra cualquiera de las que se quedan;
 *   2. en otra semana, solo si no hay dudas: la fase tiene UNA sola tarea con ese título (`enLaFase`, también las que
 *      se van), es PENDIENTE y se queda, y la IA propone UNA. Nunca contra una hecha o en curso: «Revisión con el
 *      sponsor» hecha en la S1 y una nueva en la S4 entra. Una sesión semanal (varias con el título) no se adivina.
 */
function repitenLoQueSeQueda(
  nuevas: ReadonlyArray<ContenidoDeTareaNueva | null>,
  quedan: readonly TareaDelVivo[],
  enLaFase: readonly TareaDelVivo[],
): number[] {
  const huellaDe = nuevas.map((n) => (n === null ? "" : huellaCompleta(n.title)));
  const seQueda = new Set(quedan.map((t) => t.id));
  const fuera = new Set<number>();
  nuevas.forEach((n, j) => {
    const h = huellaDe[j];
    if (n === null || h === "") return;
    if (quedan.some((t) => t.weekIndex === n.weekIndex && huellaCompleta(t.title) === h)) {
      fuera.add(j);
      return;
    }
    const conElTitulo = enLaFase.filter((t) => huellaCompleta(t.title) === h);
    if (conElTitulo.length !== 1 || huellaDe.filter((x) => x === h).length !== 1) return;
    const q = conElTitulo[0];
    if (seQueda.has(q.id) && q.status === "PENDING") fuera.add(j);
  });
  return [...fuera];
}

/**
 * R15: ¿la Semana 0 no empezó? Ni ella ni ninguna de sus tareas tiene avance (una fase nueva, sin vivo, tampoco).
 * M2 P2d: exportada para que lo que lee el modelo («Kickoff: no hay; propón uno solo») use la MISMA condición que el
 * kickoff que agrega el sistema (`loQueYaHayDe`, borrador-del-detalle.ts).
 */
export function semanaCeroSinEmpezar(viva: FaseViva | undefined): boolean {
  if (!viva) return true;
  if ((viva.status ?? "PENDING") !== "PENDING") return false;
  return (viva.tareas ?? []).every((t) => t.status !== "DONE" && t.status !== "IN_PROGRESS");
}

/**
 * R15 con M3: ¿la Semana 0 todavía no pasó, para agregarle el kickoff que falta? Sin `pasado` (sin `Borrador.hoy`), que
 * no haya empezado (`semanaCeroSinEmpezar`, lo de M2). Con `pasado`, que su semana 0 (la de la fase, que arranca en
 * `inicio`) no haya vencido: el mismo predicado de R13, así el sistema nunca agrega una tarea en una semana que ya pasó.
 * La usan la fusión y lo que lee el modelo («Kickoff: no hay; propón uno solo»), con la MISMA condición.
 */
export function semanaCeroSinPasar(viva: FaseViva | undefined, inicio: number, pasado: PasadoDeLaPropuesta | null): boolean {
  return pasado ? !semanaVencida(pasado.ancla, inicio, 0, pasado.hoy) : semanaCeroSinEmpezar(viva);
}

/** R12: «X» está terminada: la IA no le propone tareas. Con varias, UNA línea (Elías pidió menos texto). */
function observacionDeTerminadas(nombres: readonly string[]): string {
  const citados = nombres.map((n) => `«${n}»`);
  if (citados.length === 1) return `${citados[0]} está terminada: la IA no le propone tareas.`;
  return `${citados.slice(0, -1).join(", ")} y ${citados[citados.length - 1]} están terminadas: la IA no les propone tareas.`;
}

/**
 * R4c (L5): los pares [la que se iría, el índice de la nueva] que son la MISMA tarea, por el título completo
 * (`huellaCompleta`: con el corte a 60 de `fingerprintFromTitle`, «… para ventas» y «… para postventa» eran una).
 *   1. En su misma semana: para cada una que se iría, en orden, la primera nueva libre con su título y su semana.
 *   2. En otra semana, sin ambigüedad: entre las que quedan, solo si hay UNA nueva y UNA que se iría con ese
 *      título. Con dos o más de algún lado (una sesión de todas las semanas) no se adivina: se van y son nuevas.
 */
function parejasQueVuelven(
  seVan: readonly TareaDelVivo[],
  nuevas: ReadonlyArray<ContenidoDeTareaNueva | null>,
): Array<[TareaDelVivo, number]> {
  const huellaNueva = nuevas.map((n) => (n === null ? null : huellaCompleta(n.title)));
  const huellaVieja = seVan.map((r) => huellaCompleta(r.title));
  const usadas = new Set<number>();
  const pares: Array<[TareaDelVivo, number]> = [];
  const libres: number[] = [];
  seVan.forEach((r, k) => {
    const h = huellaVieja[k];
    const j = h === "" ? -1 : nuevas.findIndex((n, x) => n !== null && !usadas.has(x) && huellaNueva[x] === h && n.weekIndex === r.weekIndex);
    if (j >= 0) {
      usadas.add(j);
      pares.push([r, j]);
    } else {
      libres.push(k);
    }
  });
  for (const k of libres) {
    const h = huellaVieja[k];
    if (h === "") continue;
    const candidatas = nuevas.flatMap((n, x) => (n !== null && !usadas.has(x) && huellaNueva[x] === h ? [x] : []));
    const mismas = libres.filter((y) => huellaVieja[y] === h);
    if (candidatas.length !== 1 || mismas.length !== 1) continue;
    usadas.add(candidatas[0]);
    pares.push([seVan[k], candidatas[0]]);
  }
  return pares;
}

/** E3 (D9): la forma que le dio el chat a cada fase, sin las que se vuelven a armar. undefined = ninguna. */
function sinLasRearmadas(
  ajustadas: Borrador["ajustadasPorElChat"],
  rearmadas: Iterable<string>,
): Borrador["ajustadasPorElChat"] {
  if (!ajustadas) return undefined;
  const fuera = new Set(rearmadas);
  const quedan = Object.entries(ajustadas).filter(([fase]) => !fuera.has(fase));
  return quedan.length > 0 ? Object.fromEntries(quedan) : undefined;
}

/**
 * E3: ¿la fusión conserva este cambio de tareas? Lo que dictó el chat (`porChat`) y una tarea nueva de la
 * IA que el chat retocó (`retocada`, también la que mudó de fase): lo que el chat confirmó con «quedó en la
 * propuesta» no se pierde en silencio porque su fase se recalcule (revisión de E3).
 */
const loTocoElChat = (c: Cambio): boolean => esCambioDeTarea(c) && (!!c.porChat || (c.tipo === "tarea-nueva" && !!c.retocada));

/**
 * L7: lo que una fusión CONSERVA de la propuesta de antes: lo que tocó el chat (`loTocoElChat`) y las mudanzas que
 * SUGIRIÓ la IA (una hecha que parece de otra fase: nace sin marcar y la decide el CSE). Sin esto, el recálculo de su
 * fase la borraba y su clave quedaba huérfana en `excluidos`. Las sugeridas no entran a `sinLasQueRepitenLoDelChat`:
 * el agente no vuelve a proponer una hecha.
 */
const seConserva = (c: Cambio): boolean => loTocoElChat(c) || (c.tipo === "tarea-cambia" && !!c.sugerida);

/**
 * La huella del título COMPLETO: sin mayúsculas, tildes ni signos, como `fingerprintFromTitle`, pero SIN su
 * corte a 60 caracteres (revisión antes del push). Con el corte, «Configurar las propiedades personalizadas del
 * objeto Negocios para ventas» y «… para postventa» eran la misma tarea. L5: la exporta para R4c (y sus guardas).
 */
export function huellaCompleta(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Una tarea como la puede repetir el agente: su fase, la huella completa de su título y su semana. */
interface FirmaDeTarea {
  fase: string;
  huella: string;
  semana: number;
}

/**
 * Lo que el agente puede volver a proponer de un cambio que la fusión conserva (`loTocoElChat`), y si se lo
 * reconoce también en OTRA semana (revisión antes del push):
 *  · una tarea nueva de la IA que el chat retocó: la que DEJA (fase, título y semana). En otra semana, sí;
 *  · una tarea nueva que AGREGÓ el chat (`porChat`): la que deja, y solo en su MISMA semana. No es algo que el
 *    agente repita: la suya con el mismo título en otra semana es otra (la S1 de una sesión semanal);
 *  · una tarea VIVA que el chat cambió o quitó: el agente arma desde lo vivo (`estructuraHipotetica` descarta los
 *    cambios de tareas), así que la repite como la VIO: el título, la fase y la semana de antes (`desde`,
 *    `faseId`). La que cambió se reconoce además por lo que deja (título y fase de destino).
 */
function loQueRepetiriaElAgente(c: CambioDeTarea): { firmas: FirmaDeTarea[]; enOtraSemana: boolean } {
  if (c.tipo === "tarea-nueva") {
    return { firmas: [{ fase: c.fase, huella: huellaCompleta(c.tarea.title), semana: c.tarea.weekIndex }], enOtraSemana: !c.porChat };
  }
  const comoLaVio: FirmaDeTarea = { fase: c.faseId, huella: huellaCompleta(c.desde.title), semana: c.desde.weekIndex };
  if (c.tipo === "tarea-se-va") return { firmas: [comoLaVio], enOtraSemana: true };
  const comoQueda: FirmaDeTarea = {
    fase: faseDeLaTarea(c),
    huella: huellaCompleta(c.a.title ?? c.desde.title),
    semana: c.a.weekIndex ?? c.desde.weekIndex,
  };
  return { firmas: [comoLaVio, comoQueda], enOtraSemana: true };
}

/**
 * Revisión de los arreglos: las tareas nuevas del agente, sin las que REPITEN lo que la fusión conserva del chat
 * (`loTocoElChat`: una tarea nueva de la IA retocada, algo que dictó el chat). El agente arma la fase desde lo
 * vivo, no ve esas tareas y vuelve a proponer la misma: sin esto quedaban las dos en «aplica», sin «Ya está» ni
 * ⚠, y «Aplicar todo» creaba las dos. Se reconoce por la MISMA fase y la huella del título completo
 * (`huellaCompleta`), y cada conservada se lleva UNA sola del agente.
 * Revisión antes del push: se llevaba la PRIMERA con esa huella en cualquier semana, y con una sesión que se repite
 * cada semana sacaba una legítima (el chat agrega la S4: se perdía la S1). Ahora, primero la de la MISMA semana; en
 * otra semana, solo si no hay dudas (la fase tiene UNA sola del agente con esa huella) y nunca por lo que agregó el
 * chat. Si hay varias y ninguna es de su semana, no se saca ninguna: un duplicado a la vista se desmarca; una
 * tarea perdida no se ve. Y una viva que el chat renombró, mudó o quitó se reconoce también como la vio el agente
 * (`loQueRepetiriaElAgente`).
 */
function sinLasQueRepitenLoDelChat(nuevas: readonly CambioDeTarea[], conservadas: readonly Cambio[]): CambioDeTarea[] {
  const repetibles = conservadas.flatMap((c) => {
    if (!loTocoElChat(c)) return [];
    const r = loQueRepetiriaElAgente(c as CambioDeTarea);
    const firmas = r.firmas.filter((f) => f.huella !== "");
    return firmas.length > 0 ? [{ firmas, enOtraSemana: r.enOtraSemana }] : [];
  });
  if (repetibles.length === 0) return [...nuevas];
  const delAgente = nuevas.map((n) => (n.tipo === "tarea-nueva" ? { fase: n.fase, huella: huellaCompleta(n.tarea.title), semana: n.tarea.weekIndex } : null));
  /** Todas las del agente con la fase y la huella de la firma (también las que ya salieron: cuentan para la duda). */
  const conLaHuella = (f: FirmaDeTarea) =>
    delAgente.flatMap((n, j) => (n !== null && n.fase === f.fase && n.huella === f.huella ? [j] : []));
  const fuera = new Set<number>();
  const sinPareja: typeof repetibles = [];
  // 1. La de la MISMA semana.
  for (const r of repetibles) {
    let j: number | undefined;
    for (const f of r.firmas) {
      j = conLaHuella(f).find((k) => !fuera.has(k) && delAgente[k]!.semana === f.semana);
      if (j !== undefined) break;
    }
    if (j !== undefined) fuera.add(j);
    else if (r.enOtraSemana) sinPareja.push(r);
  }
  // 2. En otra semana, solo sin ambigüedad: UNA sola del agente con esa huella en la fase.
  for (const r of sinPareja) {
    for (const f of r.firmas) {
      const unica = conLaHuella(f);
      if (unica.length === 1 && !fuera.has(unica[0])) {
        fuera.add(unica[0]);
        break;
      }
    }
  }
  return nuevas.filter((_, j) => !fuera.has(j));
}

/** Lo que el borrador guarda de E3 y la fusión no toca (salvo las ajustadas de lo que se rearma). */
function loDelChat(b: Borrador, rearmadas: Iterable<string>): Pick<Borrador, "excluidos" | "ajustadasPorElChat"> {
  const ajustadas = sinLasRearmadas(b.ajustadasPorElChat, rearmadas);
  return { ...(b.excluidos ? { excluidos: b.excluidos } : {}), ...(ajustadas ? { ajustadasPorElChat: ajustadas } : {}) };
}

/**
 * El borrador con las tareas del paso 2: su estructura (sin las tareas de la IA de antes), el tipo
 * propuesto de las fases que no tenían y las tareas. Las tareas quedan `listas` con la corrida que las
 * armó, y la versión sube (toda escritura del JSON la sube). `soloFase` se conserva. No mezcla tareas de
 * otras fases: en E2b el borrador de una fase nace vacío. La mezcla por fase es `mezclarTareasDeFases`
 * (E2c, el recálculo). E3: lo que dictó o retocó el chat se conserva, detrás de la estructura; las fases
 * que se arman pierden su forma ajustada.
 */
export function fusionarDetalle(b: Borrador, r: CambiosDelDetalle, corrida: string): Borrador {
  const estructura: Cambio[] = b.cambios
    .filter((c) => !esCambioDeTarea(c))
    .map((c) =>
      c.tipo === "fase-nueva" && c.fase.activityType === null && r.tiposDeNuevas[c.clave]
        ? { ...c, fase: { ...c.fase, activityType: r.tiposDeNuevas[c.clave] } }
        : c,
    );
  const delChat = b.cambios.filter(seConserva);
  return {
    formato: b.formato,
    version: b.version + 1,
    origen: b.origen,
    observaciones: [...b.observaciones, ...r.observaciones.filter((o) => !b.observaciones.includes(o))],
    cambios: [...estructura, ...r.tipos, ...delChat, ...sinLasQueRepitenLoDelChat(r.tareas, delChat)],
    pedido: b.pedido,
    tareas: { corrida, listas: true },
    tareasArmadasPara: r.tareasArmadasPara,
    ...(b.soloFase ? { soloFase: b.soloFase } : {}),
    // M3: el reloj de la propuesta (en la base lo conserva `conLaFusion`, que parte del guardado).
    ...(b.hoy ? { hoy: b.hoy } : {}),
    ...loDelChat(b, Object.keys(r.tareasArmadasPara)),
  };
}

/**
 * Las tareas de `fases` se reemplazan por `nuevas`, EN EL LUGAR de la primera original de cada fase
 * (el grupo conserva su número); sin originales, al final. Lo demás, intacto (E2c, D2). Una tarea de
 * `nuevas` cuya fase no está en `fases` no entra: el alcance lo dice `fases`, no lo que devolvió el
 * modelo. E3: solo se reemplazan las tareas de la IA; lo que dictó o retocó el chat (`loTocoElChat`) se
 * queda, y la nueva que lo repite no entra (`sinLasQueRepitenLoDelChat`, revisión de los arreglos).
 */
export function mezclarTareasDeFases(
  cambios: readonly Cambio[],
  nuevas: readonly CambioDeTarea[],
  fases: ReadonlySet<string>,
): Cambio[] {
  const nuevasPorFase = new Map<string, CambioDeTarea[]>();
  for (const n of sinLasQueRepitenLoDelChat(nuevas, cambios)) {
    const fase = faseDeLaTarea(n);
    if (!fases.has(fase)) continue;
    nuevasPorFase.set(fase, [...(nuevasPorFase.get(fase) ?? []), n]);
  }
  const puestas = new Set<string>();
  const out: Cambio[] = [];
  for (const c of cambios) {
    if (!esCambioDeTarea(c) || seConserva(c) || !fases.has(faseDeLaTarea(c))) {
      out.push(c);
      continue;
    }
    const fase = faseDeLaTarea(c);
    if (puestas.has(fase)) continue; // una original más de una fase ya reemplazada
    puestas.add(fase);
    out.push(...(nuevasPorFase.get(fase) ?? []));
  }
  // Las fases sin originales van al final, en el orden en que llegaron sus tareas.
  for (const [fase, deLaFase] of nuevasPorFase) {
    if (!puestas.has(fase)) out.push(...deLaFase);
  }
  return out;
}

/**
 * El borrador con las tareas RECALCULADAS de las fases desfasadas (E2c). Solo las fases `escritas`
 * cambian sus tareas y su forma armada; las `fallidas` conservan las suyas y quedan en `recalculo`
 * con su motivo (sin fallidas, el recálculo termina y se va). La versión sube. No toca la estructura,
 * `tareas` (sigue en la corrida original y `listas`), `pedido`, `origen` ni `soloFase`.
 */
export function fusionarRecalculo(
  b: Borrador,
  r: {
    tareas: readonly CambioDeTarea[];
    armadas: Record<string, FormaDeFase>;
    escritas: readonly string[];
    fallidas: ReadonlyArray<{ id: string; nombre: string }>;
    motivo: string | null;
    observaciones: readonly string[];
  },
): Borrador {
  const escritas = new Set(r.escritas);
  const armadas = Object.fromEntries(Object.entries(r.armadas).filter(([fase]) => escritas.has(fase)));
  const recalculo: RecalculoDelBorrador | null =
    r.fallidas.length > 0 && b.recalculo
      ? { ...b.recalculo, fases: r.fallidas.map((f) => ({ id: f.id, nombre: f.nombre })), motivo: r.motivo }
      : null;
  return {
    formato: b.formato,
    version: b.version + 1,
    origen: b.origen,
    observaciones: [...new Set([...b.observaciones, ...r.observaciones])],
    cambios: mezclarTareasDeFases(b.cambios, r.tareas, escritas),
    pedido: b.pedido,
    tareas: b.tareas,
    tareasArmadasPara: { ...b.tareasArmadasPara, ...armadas },
    ...(b.soloFase ? { soloFase: b.soloFase } : {}),
    ...(recalculo ? { recalculo } : {}),
    ...(b.hoy ? { hoy: b.hoy } : {}),
    ...loDelChat(b, escritas),
  };
}
