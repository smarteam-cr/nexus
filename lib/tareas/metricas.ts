/**
 * lib/tareas/metricas.ts — las métricas de una semana de un sprint (docs/tareas-plan.md §9.2). PURO y client-safe.
 *
 * Sobre lo que quien mira VE (lo arma la consulta con `tareasVisiblesWhere`): ninguna cifra se calcula con lo privado
 * de otra persona, para que «por cliente» no delate para quién era una tarea que no se ve.
 *
 *   · La revisión: qué pasó con lo de esa semana (hechas, siguen, más adelante, ya no se harán) y cuántas quedan sin
 *     marcar. «Cumplimiento» = hechas sobre lo respondido; sin respuestas no hay porcentaje (null), no un cero.
 *   · Cómo entran: el origen de lo que se sumó a la semana (a mano, pedida, de una reunión, de notas, del chat…).
 *   · Lo que propuso Nexus desde una reunión: usadas tal cual, con cambios, descartadas, era otra, vencidas, sin decidir.
 *   · Por cliente: lo hecho en la semana por para quién era (la foto de la semana: el pasado no cambia).
 */

export interface ResultadoParaMetricas {
  resultado: string;
  fotoAmbitoNombre: string | null;
}

export interface TareaParaMetricas {
  origen: string;
  estado: string;
  decision: string | null;
  /** La tarea está en la semana medida (no solo se creó en ella). */
  enLaSemana: boolean;
  /** Se creó durante la semana medida. */
  creadaEnLaSemana: boolean;
}

export interface MetricasDeLaSemana {
  revision: { hechas: number; siguen: number; masAdelante: number; noSeHaran: number; sinMarcar: number; cumplimiento: number | null };
  comoEntran: { origen: string; nombre: string; cuantas: number }[];
  propuestasDeReuniones: { total: number; talCual: number; conCambios: number; descartadas: number; eraOtra: number; vencidas: number; sinDecidir: number };
  porCliente: { nombre: string; hechas: number }[];
}

export const NOMBRE_DEL_ORIGEN_EN_METRICAS: Readonly<Record<string, string>> = {
  mano: "A mano",
  pedido: "Pedida por otra persona",
  reunion: "De una reunión",
  notas: "De notas",
  chat: "Del asistente",
  plantilla: "De una plantilla",
};

const ABIERTAS = new Set(["pendiente", "en_curso"]);

export function metricasDeLaSemana(resultados: readonly ResultadoParaMetricas[], tareas: readonly TareaParaMetricas[]): MetricasDeLaSemana {
  const cuenta = (r: string) => resultados.filter((x) => x.resultado === r).length;
  const hechas = cuenta("hecha");
  const siguen = cuenta("pasa");
  const masAdelante = cuenta("mas_adelante");
  const noSeHaran = cuenta("no_se_hara");
  const respondidas = hechas + siguen + masAdelante + noSeHaran;
  const sinMarcar = tareas.filter((t) => t.enLaSemana && ABIERTAS.has(t.estado)).length;

  const porOrigen = new Map<string, number>();
  for (const t of tareas) if (t.creadaEnLaSemana && t.estado !== "propuesta" && t.estado !== "vencida") porOrigen.set(t.origen, (porOrigen.get(t.origen) ?? 0) + 1);
  const comoEntran = [...porOrigen.entries()]
    .map(([origen, cuantas]) => ({ origen, nombre: NOMBRE_DEL_ORIGEN_EN_METRICAS[origen] ?? origen, cuantas }))
    .sort((a, b) => b.cuantas - a.cuantas);

  const deReuniones = tareas.filter((t) => t.creadaEnLaSemana && (t.origen === "reunion" || t.origen === "notas"));
  const conDecision = (d: string) => deReuniones.filter((t) => t.decision === d).length;
  const propuestasDeReuniones = {
    total: deReuniones.length,
    talCual: conDecision("tal_cual"),
    conCambios: conDecision("con_cambios"),
    descartadas: conDecision("rechazada"),
    eraOtra: conDecision("misma"),
    vencidas: deReuniones.filter((t) => t.estado === "vencida").length,
    sinDecidir: deReuniones.filter((t) => t.estado === "propuesta").length,
  };

  const porNombre = new Map<string, number>();
  for (const r of resultados) {
    if (r.resultado !== "hecha") continue;
    const nombre = r.fotoAmbitoNombre || "Sin clasificar";
    porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + 1);
  }
  const porCliente = [...porNombre.entries()].map(([nombre, h]) => ({ nombre, hechas: h })).sort((a, b) => b.hechas - a.hechas || a.nombre.localeCompare(b.nombre, "es"));

  return {
    revision: { hechas, siguen, masAdelante, noSeHaran, sinMarcar, cumplimiento: respondidas ? Math.round((hechas / respondidas) * 100) : null },
    comoEntran,
    propuestasDeReuniones,
    porCliente,
  };
}
