/**
 * lib/servicios/traductor.ts — el TRADUCTOR DE PROPUESTAS de un servicio recurrente. PURO (sin base).
 *
 * (docs/smartloop-plan.md, etapa 5; ficha E.) Un servicio vendido con contrato estructurado (FACO: un plan de 60 días
 * con tramos, áreas, iniciativas y calendario) se traduce a lo que Nexus lleva: CICLOS (uno por tramo), CASOS DE USO (una
 * por iniciativa) y el CRONOGRAMA del ciclo (cada caso de uso, una fase con sus semanas y sus dependencias del cliente),
 * con el AVANCE REAL ubicado.
 *
 * La propuesta entra como un JSON con la forma de `propuestaSchema` (scripts/data/propuesta-smartloop.ejemplo.json).
 * Nexus no lee el documento de la propuesta: alguien lo pasa a esta forma (a mano o con una sesión de Claude Code que
 * tenga el documento), y el traductor hace el resto. Así lo que se carga se puede revisar antes, línea por línea.
 *
 * Reglas:
 *  · El tramo en curso (el que contiene `hoy`; si ya pasaron todos, el último; si no empezó ninguno, el primero) es el
 *    CICLO ABIERTO. Los tramos anteriores quedan como ciclos CERRADOS, con un cierre «importado»: lo hecho, cumplido; lo
 *    que no se hizo, «pasa» y entra al ciclo abierto. Los tramos siguientes van al PLAN de la empresa (casos de uso
 *    sin ciclo, con origen «propuesta»): no se abren ciclos por adelantado.
 *  · El avance es el que DECLARA la propuesta cargada (estado de cada iniciativa y de cada dependencia). Nexus no
 *    marca nada hecho por la fecha: lo que no dice su estado queda pendiente.
 *  · Las semanas de cada iniciativa son las del tramo (1 = la primera semana del tramo). Sin semanas, todo el tramo.
 *  · Una iniciativa sin criterio de aceptación entra igual, y el traductor lo avisa: la guía del CSE lo va a pedir.
 */
import { z } from "zod";
import type { MovimientoEnLaEscala } from "./ciclo";
import { semanaDelCiclo, semanasDelCiclo } from "@/lib/timeline/ciclo";
import type { DecisionAlCerrar } from "./cierre";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");
const texto = z.string().trim().max(4000);

const rangoDeSemanas = z.union([
  z.string().regex(/^\s*\d+\s*(?:[-–]\s*\d+\s*)?$/, "Las semanas van como «2» o «2-4»."),
  z.object({ desde: z.number().int().min(1), hasta: z.number().int().min(1) }),
]);

export const ESTADOS_DE_INICIATIVA = ["pendiente", "en_curso", "hecha"] as const;

const iniciativaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    area: z.string().trim().max(60).optional(),
    resultado: texto.optional(),
    porque: texto.optional(),
    criterio: texto.optional(),
    metrica: z.string().trim().max(200).optional(),
    dimensiones: z.array(z.object({ dimension: z.string().trim().min(1).max(120), nivel: z.string().trim().max(40).optional() })).max(24).optional(),
    semanas: rangoDeSemanas.optional(),
    estado: z.enum(ESTADOS_DE_INICIATIVA).optional(),
    dependencias: z
      .array(z.object({ titulo: z.string().trim().min(1).max(300), semana: z.number().int().min(1).optional(), hecha: z.boolean().optional() }))
      .max(30)
      .optional(),
  })
  .strict();

const tramoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(200),
    desde: dia,
    hasta: dia,
    meta: texto.optional(),
    iniciativas: z.array(iniciativaSchema).min(1).max(40),
  })
  .strict()
  .refine((t) => t.desde <= t.hasta, { message: "Un tramo no puede terminar antes de empezar." });

export const propuestaSchema = z
  .object({
    formato: z.literal(1),
    /** Cómo se llama la propuesta vendida («Plan de 60 días · FACO»): queda en cada caso de uso como su porqué. */
    propuesta: z.string().trim().min(1).max(200),
    /** El día con el que se ubica el avance (por defecto, hoy). */
    hoy: dia.optional(),
    tramos: z.array(tramoSchema).min(1).max(12),
  })
  .strict()
  .refine((p) => p.tramos.every((t, i) => i === 0 || p.tramos[i - 1].hasta < t.desde), {
    message: "Los tramos van en orden y sin pisarse.",
  });

export type Propuesta = z.infer<typeof propuestaSchema>;
type Iniciativa = z.infer<typeof iniciativaSchema>;

// ── Lo que sale ──────────────────────────────────────────────────────────────

export type EstadoDeFaseTraducido = "PENDING" | "IN_PROGRESS" | "DONE";

export interface CasoTraducido {
  titulo: string;
  resultado: string | null;
  mueve: MovimientoEnLaEscala[];
  porque: string;
  criterio: string | null;
  metrica: string | null;
  /** Semana absoluta del cronograma y duración: la fase del caso de uso. */
  startWeek: number;
  durationWeeks: number;
  estadoDeLaFase: EstadoDeFaseTraducido;
  dependencias: Array<{ titulo: string; weekIndex: number; hecha: boolean }>;
}

export interface CicloTraducido {
  tramo: number;
  nombre: string;
  desde: string;
  hasta: string;
  meta: string | null;
  estado: "cerrado" | "abierto";
  /** Solo el abierto: la etapa en la que deja el ciclo lo que dice la propuesta (se confirma con Customer Success). */
  etapa: "planificacion" | "implementacion" | "adopcion" | null;
  casos: CasoTraducido[];
  /** Solo los cerrados: la decisión de cada caso (en el orden de `casos`). Lo que no se hizo pasa al abierto. */
  decisiones: DecisionAlCerrar[];
}

export interface PlanTraducido {
  propuesta: string;
  /** El día que queda como ancla del cronograma: el inicio del primer tramo. */
  ancla: string;
  ciclos: CicloTraducido[];
  /** Los casos de los tramos que todavía no empiezan: al plan de la empresa, sin ciclo ni fase. */
  plan: Array<Omit<CasoTraducido, "startWeek" | "durationWeeks" | "estadoDeLaFase" | "dependencias"> & { tramo: string }>;
  avisos: string[];
}

function leerSemanas(s: Iniciativa["semanas"], largo: number): { desde: number; hasta: number } {
  if (!s) return { desde: 1, hasta: largo };
  if (typeof s === "string") {
    const [a, b] = s.split(/[-–]/).map((x) => Number(x.trim()));
    return { desde: a, hasta: Number.isFinite(b) ? b : a };
  }
  return s;
}

const ESTADO_DE_FASE: Record<(typeof ESTADOS_DE_INICIATIVA)[number], EstadoDeFaseTraducido> = {
  pendiente: "PENDING",
  en_curso: "IN_PROGRESS",
  hecha: "DONE",
};

/**
 * El índice del tramo en curso: el que contiene `hoy`. Si ya pasaron todos, el último; si no empezó ninguno, el
 * primero. Entre dos tramos, el que terminó: todavía le falta su sesión de aprendizaje.
 */
export function tramoEnCurso(tramos: ReadonlyArray<{ desde: string; hasta: string }>, hoy: string): number {
  const i = tramos.findIndex((t) => t.desde <= hoy && hoy <= t.hasta);
  if (i >= 0) return i;
  const siguiente = tramos.findIndex((t) => t.desde > hoy);
  if (siguiente === -1) return tramos.length - 1;
  return Math.max(0, siguiente - 1);
}

export function traducirPropuesta(p: Propuesta, opts: { hoy: string; anclaDelCronograma: string | null }): PlanTraducido {
  const hoy = p.hoy ?? opts.hoy;
  const ancla = opts.anclaDelCronograma ?? p.tramos[0].desde;
  const avisos: string[] = [];
  if (opts.anclaDelCronograma && opts.anclaDelCronograma > p.tramos[0].desde) {
    avisos.push(`El cronograma del proyecto arranca el ${opts.anclaDelCronograma}, después del primer tramo: las fases de antes quedan en la semana 0.`);
  }
  const enCurso = tramoEnCurso(p.tramos, hoy);

  const traducirCaso = (ini: Iniciativa, tramo: (typeof p.tramos)[number], nombreTramo: string, deDondeViene?: string): CasoTraducido => {
    const largo = semanasDelCiclo(tramo.desde, tramo.hasta) ?? 1;
    const base = semanaDelCiclo(ancla, tramo.desde);
    let { desde, hasta } = leerSemanas(ini.semanas, largo);
    if (desde > largo || hasta < desde) {
      avisos.push(`«${ini.titulo}»: sus semanas (${desde}-${hasta}) no caben en el tramo «${nombreTramo}» (${largo} semanas): va el tramo entero.`);
      desde = 1;
      hasta = largo;
    }
    hasta = Math.min(hasta, largo);
    const durationWeeks = hasta - desde + 1;
    if (!ini.criterio?.trim()) avisos.push(`«${ini.titulo}» no trae criterio de aceptación: la guía del CSE lo va a pedir.`);
    return {
      titulo: ini.titulo,
      resultado: ini.resultado?.trim() || null,
      mueve: (ini.dimensiones ?? []).map((d) => ({ area: ini.area ?? "", dimension: d.dimension, nivel: d.nivel ?? "" })),
      porque: [ini.porque?.trim(), `De la propuesta vendida «${p.propuesta}», tramo «${nombreTramo}».`, deDondeViene].filter(Boolean).join(" "),
      criterio: ini.criterio?.trim() || null,
      metrica: ini.metrica?.trim() || null,
      startWeek: base + desde - 1,
      durationWeeks,
      estadoDeLaFase: ESTADO_DE_FASE[ini.estado ?? "pendiente"],
      dependencias: (ini.dependencias ?? []).map((d) => ({
        titulo: d.titulo,
        weekIndex: Math.min(Math.max(0, (d.semana ?? desde) - desde), durationWeeks - 1),
        hecha: !!d.hecha,
      })),
    };
  };

  const ciclos: CicloTraducido[] = [];
  const pasan: CasoTraducido[] = [];
  p.tramos.forEach((t, i) => {
    if (i > enCurso) return;
    const casos = t.iniciativas.map((ini) => traducirCaso(ini, t, t.nombre));
    if (i < enCurso) {
      const decisiones = t.iniciativas.map((ini): DecisionAlCerrar => (ini.estado === "hecha" ? "cumplido" : "pasa"));
      t.iniciativas.forEach((ini, k) => {
        if (decisiones[k] !== "pasa") return;
        // Lo que no se hizo en un tramo anterior entra al ciclo abierto, en su primera semana y con el tramo entero.
        // Sus dependencias conservan su lugar dentro del caso (la primera semana del caso sigue siendo la 1).
        const abierto = p.tramos[enCurso];
        const { desde: desdeAntes } = leerSemanas(ini.semanas, semanasDelCiclo(t.desde, t.hasta) ?? 1);
        const dependencias = ini.dependencias?.map((d) => ({ ...d, semana: Math.max(1, (d.semana ?? desdeAntes) - desdeAntes + 1) }));
        pasan.push(
          traducirCaso({ ...ini, semanas: undefined, dependencias }, abierto, abierto.nombre, `Venía del tramo «${t.nombre}», donde no se terminó.`),
        );
      });
      ciclos.push({ tramo: i, nombre: t.nombre, desde: t.desde, hasta: t.hasta, meta: t.meta?.trim() || null, estado: "cerrado", etapa: null, casos, decisiones });
      return;
    }
    const todos = [...casos, ...pasan];
    const empezados = todos.filter((c) => c.estadoDeLaFase !== "PENDING");
    const etapa = todos.length > 0 && todos.every((c) => c.estadoDeLaFase === "DONE") ? "adopcion" : empezados.length > 0 ? "implementacion" : "planificacion";
    ciclos.push({ tramo: i, nombre: t.nombre, desde: t.desde, hasta: t.hasta, meta: t.meta?.trim() || null, estado: "abierto", etapa, casos: todos, decisiones: [] });
  });

  const plan = p.tramos.slice(enCurso + 1).flatMap((t) =>
    t.iniciativas.map((ini) => {
      const c = traducirCaso(ini, t, t.nombre);
      return { titulo: c.titulo, resultado: c.resultado, mueve: c.mueve, porque: c.porque, criterio: c.criterio, metrica: c.metrica, tramo: t.nombre };
    }),
  );
  return { propuesta: p.propuesta, ancla, ciclos, plan, avisos: [...new Set(avisos)] };
}
