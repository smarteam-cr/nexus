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
 *  R5. La semana ya viene acotada a la duración de la fase que vio el agente.
 *  R6. El tipo de actividad: solo si la fase no tiene uno (el elegido a mano manda).
 *  R7. Las fijas de la Semana 0: una viva que coincide con una fija (o con su gemela) no se va, y
 *      las fijas que faltan entran como nuevas. Así no van y vuelven en cada regeneración.
 *  R8. `tareasArmadasPara` de TODAS las fases del alcance: el cierre del plan las usa si la fase
 *      cambia después. Desde E2c P3 es la forma completa (`formaEnLaEstructura`): también las
 *      sesiones y si la fase es la primera, la de la Semana 0.
 *  R9. Orden: fase por fase; primero las que se van (por semana y orden del vivo), después las nuevas
 *      (en el orden del agente, con las fijas al final).
 *  R10. Si el modelo se cortó (`max_tokens`), la última fase no genera nada y se avisa.
 *  R11. Se avisa de una fase nueva sin tareas y de las fases que el agente nombró y no existen.
 *
 * ── EL ALCANCE (E2b) ─────────────────────────────────────────────────────────
 * «Regenerar» de una fase pasa `soloFases`: las demás fases se saltan enteras, antes de R8. Así R6
 * (el tipo), R7 (las fijas de la Semana 0, solo si la pedida ES la del arranque) y R8 miran solo la
 * fase pedida, aunque el modelo devuelva tareas para otras.
 *
 * ── EL RECÁLCULO (E2c) ───────────────────────────────────────────────────────
 * Las tareas de una fase DESFASADA se recalculan y REEMPLAZAN a las suyas en el borrador, en el mismo
 * lugar de la lista (`mezclarTareasDeFases`); el resto del borrador no se toca (`fusionarRecalculo`).
 */
import {
  huellasDeFrontera,
  marcarFugas,
  type FugaDeTarea,
  type HuellasDeFrontera,
} from "@/lib/contexto/frontera-del-cronograma";
import { huella as huellaDeTitulo } from "./assist-items";
import {
  claveDeCampo,
  claveDeTareaNueva,
  claveDeTareaQueSeVa,
  esCambioDeTarea,
  faseDeLaTarea,
  formaEnLaEstructura,
  fotoDeTarea,
  type Borrador,
  type Cambio,
  type CambioDeTarea,
  type CambioFaseCambia,
  type ContenidoDeTareaNueva,
  type EstructuraHipotetica,
  type FormaDeFase,
  type RecalculoDelBorrador,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { computeDetailTasksForPhase, type ComputedDetailTask } from "./compute-detail-tasks";
import { isKept } from "./regen-columnas";
import { elegirFaseDeSemanaCero, tareasFijasDeSemanaCero } from "./semana-cero-tareas";
import { plural } from "./weeks";

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
 * el `desde` es lo que leyó el agente (R2). Ver las reglas R1-R11 arriba. `soloFases`: el alcance
 * de «Regenerar» de una fase (null o ausente = todas). `nuevaClave` genera los ids aleatorios de las
 * claves (los tests inyectan uno determinista).
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
}): CambiosDelDetalle {
  const propuestaDe = new Map(i.propuestas.map((p) => [p.fase, p]));
  const vivas = new Map(i.vivo.fases.map((f) => [f.id, f]));
  const semanaCero = elegirFaseDeSemanaCero(i.estructura.fases.map((f, k) => ({ ...f, order: k })));
  const conTipoEnElBorrador = new Set(
    i.borrador.cambios.flatMap((c) => (c.tipo === "fase-cambia" && c.campo === "activityType" ? [c.faseId] : [])),
  );

  const tareas: CambioDeTarea[] = [];
  const tipos: CambioFaseCambia[] = [];
  const tiposDeNuevas: Record<string, string> = {};
  const tareasArmadasPara: Record<string, FormaDeFase> = {};
  const observaciones: string[] = [];

  for (const f of i.estructura.fases) {
    // El alcance (E2b): una fase fuera de él no emite nada. `semanaCero` ya se eligió sobre todas.
    if (i.soloFases && !i.soloFases.has(f.id)) continue;
    // R8. La forma COMPLETA (E2c P3): nombre, semanas, sesiones y si es la primera (la de la Semana 0).
    tareasArmadasPara[f.id] = formaEnLaEstructura(i.estructura, f.id)!;
    const p = propuestaDe.get(f.id);
    if (p?.cortada) {
      // R10
      observaciones.push(
        `La IA se cortó antes de terminar: las tareas de «${f.name}» y de las fases que no alcanzó a armar quedan como están.`,
      );
      continue;
    }
    const delAgente = p?.delAgente ?? [];
    const viva = f.existente ? vivas.get(f.id) : undefined;

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
    let reemplazables = sinPropuesta ? [] : actuales.filter((t) => !isKept(t)).map((t) => vistas.get(t.id)!);

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
    const seVan: TareaDelVivo[] = [];
    for (const r of reemplazables) {
      const j = nuevas.findIndex((n) => n !== null && identicas(r, n));
      if (j >= 0) nuevas[j] = null;
      else seVan.push(r);
    }

    // R9: primero las que se van (por semana, en el orden del vivo), después las nuevas.
    const orden = new Map(actuales.map((t, k) => [t.id, k]));
    seVan.sort((a, b) => a.weekIndex - b.weekIndex || (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    for (const r of seVan) {
      tareas.push({ tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(r.id), tareaId: r.id, faseId: f.id, desde: fotoDeTarea(r) });
    }
    for (const n of nuevas) {
      if (n) tareas.push({ tipo: "tarea-nueva", clave: claveDeTareaNueva(i.nuevaClave), fase: f.id, tarea: n });
    }
  }

  if (i.idsDesconocidos > 0) {
    observaciones.push(
      `La IA devolvió tareas para ${plural(i.idsDesconocidos, "fase", "fases")} que no reconoció: se ignoraron.`,
    );
  }
  return { tareas, tipos, tiposDeNuevas, tareasArmadasPara, observaciones };
}

/**
 * El borrador con las tareas del paso 2: su estructura (sin tareas viejas), el tipo propuesto de las
 * fases que no tenían y las tareas. Las tareas quedan `listas` con la corrida que las armó, y la
 * versión sube (toda escritura del JSON la sube). `soloFase` se conserva. No mezcla tareas de otras
 * fases: en E2b el borrador de una fase nace vacío. La mezcla por fase es `mezclarTareasDeFases`
 * (E2c, el recálculo), y «Regenerar» de una fase dentro de una propuesta abierta la reusa en E3.
 */
export function fusionarDetalle(b: Borrador, r: CambiosDelDetalle, corrida: string): Borrador {
  const estructura: Cambio[] = b.cambios
    .filter((c) => !esCambioDeTarea(c))
    .map((c) =>
      c.tipo === "fase-nueva" && c.fase.activityType === null && r.tiposDeNuevas[c.clave]
        ? { ...c, fase: { ...c.fase, activityType: r.tiposDeNuevas[c.clave] } }
        : c,
    );
  return {
    formato: b.formato,
    version: b.version + 1,
    origen: b.origen,
    observaciones: [...b.observaciones, ...r.observaciones.filter((o) => !b.observaciones.includes(o))],
    cambios: [...estructura, ...r.tipos, ...r.tareas],
    pedido: b.pedido,
    tareas: { corrida, listas: true },
    tareasArmadasPara: r.tareasArmadasPara,
    ...(b.soloFase ? { soloFase: b.soloFase } : {}),
  };
}

/**
 * Las tareas de `fases` se reemplazan por `nuevas`, EN EL LUGAR de la primera original de cada fase
 * (el grupo conserva su número); sin originales, al final. Lo demás, intacto (E2c, D2). Una tarea de
 * `nuevas` cuya fase no está en `fases` no entra: el alcance lo dice `fases`, no lo que devolvió el
 * modelo.
 */
export function mezclarTareasDeFases(
  cambios: readonly Cambio[],
  nuevas: readonly CambioDeTarea[],
  fases: ReadonlySet<string>,
): Cambio[] {
  const nuevasPorFase = new Map<string, CambioDeTarea[]>();
  for (const n of nuevas) {
    const fase = faseDeLaTarea(n);
    if (!fases.has(fase)) continue;
    nuevasPorFase.set(fase, [...(nuevasPorFase.get(fase) ?? []), n]);
  }
  const puestas = new Set<string>();
  const out: Cambio[] = [];
  for (const c of cambios) {
    if (!esCambioDeTarea(c) || !fases.has(faseDeLaTarea(c))) {
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
  };
}
