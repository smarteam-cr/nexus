/**
 * lib/analizador-venta/tendencia.ts — LA TENDENCIA DE CADA VENDEDOR (S7, 2026-10-27; decidida el 24 oct y confirmada en el
 * rediseño del 26): cuánto explora, cuánto habla, cuántas sesiones dejan un siguiente paso con fecha y cuántas tienen
 * transcripción, mes a mes. PURO y client-safe. Solo la ven los super admin (`veLaTendenciaDelEquipo`).
 *
 * ── A QUIÉN SE LE CUENTA UNA REUNIÓN ───────────────────────────────────────────
 * Por el calendario y por quién habló, NUNCA por la asistencia ni los minutos de la API de Meet (Google pide no usarlos
 * para medir desempeño, y esto es lo más cercano a medir que tiene Nexus):
 *   · con transcripción y alguien del equipo reconocido hablando: a los del equipo que hablaron;
 *   · si no: a los del equipo de la invitación (organizó o fue invitado) que no la rechazaron en el calendario (T7 guarda
 *     la respuesta a la invitación, que es del calendario y no de la asistencia).
 * De esos, el «vendedor» es el de Ventas; si no hubo nadie de Ventas (un prospecto que trabajó Customer Success), todos
 * (la misma regla de `vendedoresDeLaReunion`).
 *
 * ── QUÉ SE SUMA ─────────────────────────────────────────────────────────────────
 * Lo que se cuenta sin IA (cuántas reuniones, cuántas con transcripción, quién habló) entra siempre. Lo que juzga el
 * análisis (cuánto exploró, si quedó un siguiente paso con fecha) entra SOLO si una persona lo confirmó: nada cuenta como
 * evaluación sin esa confirmación (las decisiones del plan). No hay puntaje ni ranking: cada vendedor se compara con sus
 * propios meses.
 */
import type { ResultadoDelAnalisis } from "./analisis";
import type { QuienHablo } from "./quien-hablo";
import { vendedoresDeLaReunion } from "./reglas";
import { siguientePasoConFecha } from "./revision";

/** A quiénes del equipo se les cuenta la reunión (ver arriba). Correos en minúscula, sin repetir. */
export function atribuirLaReunion(o: { calendario: readonly string[]; rechazaron: ReadonlySet<string>; hablaron: readonly string[] | null }): string[] {
  const norm = (xs: readonly string[]) => [...new Set(xs.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  const hablaron = norm(o.hablaron ?? []);
  if (hablaron.length) return hablaron;
  return norm(o.calendario).filter((e) => !o.rechazaron.has(e));
}

/** Los vendedores de la reunión, con la atribución de arriba. */
export function vendedoresAtribuidos(o: Parameters<typeof atribuirLaReunion>[0], ventas: ReadonlySet<string>): string[] {
  return vendedoresDeLaReunion(atribuirLaReunion(o), ventas);
}

/** Los correos del equipo que hablaron en la reunión; null = no hay con qué saberlo. */
export function delEquipoQueHablo(q: QuienHablo | null): string[] | null {
  if (!q || q.fuente === "nada") return null;
  return q.personas.filter((p) => p.lado === "smarteam" && p.correo).map((p) => p.correo!);
}

export interface ReunionParaLaTendencia {
  fecha: string;
  vendedores: readonly string[];
  conTranscripcion: boolean;
  quienHablo: QuienHablo | null;
  /** El análisis vigente; solo cuenta si está confirmado. */
  analisis: { resultado: ResultadoDelAnalisis | null; confirmado: boolean } | null;
}

export interface CifrasDeLaTendencia {
  reuniones: number;
  conTranscripcion: number;
  /** Cuánto habló el vendedor (su parte de las palabras), en promedio, donde se sabe. */
  hablo: number | null;
  /** Cuánto habló el cliente, en promedio, donde se sabe. */
  clienteHablo: number | null;
  /** De las confirmadas: el porcentaje de las dimensiones juzgadas que se exploraron a fondo. */
  exploro: number | null;
  /** De las confirmadas: cuántas dejaron un siguiente paso con fecha. */
  conFecha: { con: number; de: number };
  confirmadas: number;
}

export interface TendenciaDelVendedor extends CifrasDeLaTendencia {
  correo: string;
  /** Mes a mes (`AAAA-MM`, hora de Costa Rica), del más viejo al más nuevo. */
  porMes: (CifrasDeLaTendencia & { mes: string })[];
}

const promedio = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** El mes de una fecha en Costa Rica (UTC−6, sin horario de verano). */
export function mesEnCostaRica(iso: string): string {
  return new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(0, 7);
}

/**
 * ¿Sirve quién habló para medir? Solo si Nexus reconoció a alguien del equipo hablando: si no (dos «Andrés», un nombre que
 * no está en el equipo), todo cuenta como del cliente y el vendedor saldría hablando 0 % por un error de reconocimiento.
 */
export function quienHabloSirve(q: QuienHablo | null): q is QuienHablo {
  return !!delEquipoQueHablo(q)?.length;
}

export function cifras(reuniones: readonly ReunionParaLaTendencia[], correo: string): CifrasDeLaTendencia {
  const conHabla = reuniones.filter((r) => quienHabloSirve(r.quienHablo));

  const confirmadas = reuniones.filter((r) => r.analisis?.confirmado && r.analisis.resultado).map((r) => r.analisis!.resultado!);
  const dimensiones = confirmadas.flatMap((x) => x.juicios.filter((j) => j.punto === "exploracion" && j.dimension));
  return {
    reuniones: reuniones.length,
    conTranscripcion: reuniones.filter((r) => r.conTranscripcion).length,
    hablo: promedio(conHabla.map((r) => r.quienHablo!.personas.filter((p) => p.correo === correo).reduce((t, p) => t + p.porcentaje, 0))),
    clienteHablo: promedio(conHabla.map((r) => r.quienHablo!.cliente.porcentaje)),
    exploro: dimensiones.length ? Math.round((100 * dimensiones.filter((j) => j.valor === "explorado").length) / dimensiones.length) : null,
    conFecha: { con: confirmadas.filter((x) => siguientePasoConFecha(x.juicios.find((j) => j.punto === "siguiente_paso") ?? null)).length, de: confirmadas.length },
    confirmadas: confirmadas.length,
  };
}

/** La tendencia de cada vendedor: el que tuvo más reuniones primero (no es un ranking: es por dónde empezar a leer). */
export function tendenciaPorVendedor(reuniones: readonly ReunionParaLaTendencia[]): TendenciaDelVendedor[] {
  const porVendedor = new Map<string, ReunionParaLaTendencia[]>();
  for (const r of reuniones) for (const v of r.vendedores) porVendedor.set(v, [...(porVendedor.get(v) ?? []), r]);
  return [...porVendedor.entries()]
    .map(([correo, suyas]) => {
      const meses = [...new Set(suyas.map((r) => mesEnCostaRica(r.fecha)))].sort();
      return {
        correo,
        ...cifras(suyas, correo),
        porMes: meses.map((mes) => ({ mes, ...cifras(suyas.filter((r) => mesEnCostaRica(r.fecha) === mes), correo) })),
      };
    })
    .sort((a, b) => b.reuniones - a.reuniones || a.correo.localeCompare(b.correo));
}
