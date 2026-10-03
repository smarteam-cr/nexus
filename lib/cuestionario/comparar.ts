/**
 * lib/cuestionario/comparar.ts — la vista comparada del lado nuestro (pedido de Elías, 2026-10-02):
 * quién respondió qué, dónde se contradicen dos personas y qué está ENVIADO frente a lo que solo está
 * en BORRADOR.
 *
 *   · Escala: la contradicción es automática — dos personas ubican la misma dimensión en niveles
 *     distintos. A dos o más niveles de distancia «se contradicen»; a uno, «difieren».
 *   · Táctico: las respuestas son texto libre y «distinto» no quiere decir «contradictorio». Se ponen
 *     lado a lado (cada pregunta que contestó más de una persona) y la contradicción la señala el
 *     agente de la guía de exploración, citando las dos, para que el CSE la confirme.
 *
 * Módulo PURO (sin Prisma): recibe la vista del servicio y, para la escala, los resultados ya calculados.
 */
import type { CuestionariosDelProyecto } from "./servicio";
import { OPCION_NO_SE, estaContestada, type Origen } from "./tipos";

const ORDEN = ["D", "I", "F", "E", "O"];

export interface EstadoDePersona {
  personaId: string | null;
  persona: string;
  cuestionarioId: string;
  titulo: string;
  publicado: boolean;
  cerrado: boolean;
  seccionesEnviadas: number;
  secciones: number;
  contestadas: number;
  preguntas: number;
  /** Algo escrito por la persona que todavía no envió (lo ve el CSE, pero puede cambiar). */
  enBorrador: boolean;
}

export interface RespuestaComparada {
  persona: string;
  texto: string;
  nivel: string | null;
  origen: Origen;
  confirmada: boolean;
  enviada: boolean;
}

export interface DimensionComparada {
  ref: string;
  nombre: string;
  area: string;
  respuestas: RespuestaComparada[];
  /** null = coinciden (o contestó una sola persona). */
  desacuerdo: "difieren" | "se-contradicen" | null;
}

export interface PreguntaComparada {
  pregunta: string;
  seccion: string;
  respuestas: RespuestaComparada[];
}

export interface ResultadoDeEscalaPorPersona {
  persona: string;
  areas: Array<{ nombre: string; nivel: string | null }>;
  completo: boolean;
}

export interface Comparacion {
  estado: EstadoDePersona[];
  escala: { dimensiones: DimensionComparada[]; porPersona: ResultadoDeEscalaPorPersona[] } | null;
  tactico: PreguntaComparada[];
}

/** El resultado calculado de UN cuestionario de escala (lo arma el servidor con `resultadoDeLaEscala`). */
export interface ResultadoDeEscalaDeCuestionario {
  cuestionarioId: string;
  areas: Array<{ nombre: string; nivel: string | null }>;
  completo: boolean;
}

export function compararCuestionarios(
  v: CuestionariosDelProyecto,
  resultados: readonly ResultadoDeEscalaDeCuestionario[] = [],
): Comparacion {
  const nombre = new Map(v.personas.map((p) => [p.id, p.nombre]));
  const quien = (id: string | null) => (id ? (nombre.get(id) ?? "Persona") : "Sin persona");

  const estado: EstadoDePersona[] = v.cuestionarios.map((c) => {
    const preguntas = c.pestanas.reduce((n, p) => n + p.avance.total, 0);
    const contestadas = c.pestanas.reduce((n, p) => n + p.avance.contestadas, 0);
    return {
      personaId: c.personaId,
      persona: quien(c.personaId),
      cuestionarioId: c.id,
      titulo: c.titulo,
      publicado: !!c.publicadoAt,
      cerrado: !!c.cerradoAt,
      seccionesEnviadas: c.pestanas.filter((p) => p.enviadaAt).length,
      secciones: c.pestanas.length,
      contestadas,
      preguntas,
      enBorrador: c.pestanas.some(
        (p) => !p.enviadaAt && Object.values(p.respuestas).some((r) => r.origen !== "prellenado" && estaContestada(r)),
      ),
    };
  });

  // ── Escala: por dimensión, qué nivel le dio cada persona ──
  const porDimension = new Map<string, DimensionComparada>();
  for (const c of v.cuestionarios.filter((x) => x.tipo === "escala" && x.publicadoAt)) {
    for (const p of c.pestanas) {
      for (const q of p.preguntas) {
        if (!q.opciones || !q.ref || q.ref.startsWith("perfil:")) continue;
        const r = p.respuestas[q.id];
        if (!r?.valor) continue;
        const o = q.opciones.find((x) => x.id === r.valor);
        const nivel = r.valor === OPCION_NO_SE ? "D" : (o?.nivel ?? null);
        const d = porDimension.get(q.ref) ?? { ref: q.ref, nombre: q.categoria, area: p.titulo, respuestas: [], desacuerdo: null };
        d.respuestas.push({
          persona: quien(c.personaId),
          texto: r.valor === OPCION_NO_SE ? "No lo sabe" : (o?.texto ?? r.valor),
          nivel,
          origen: r.origen,
          confirmada: r.confirmada === true,
          enviada: !!p.enviadaAt,
        });
        porDimension.set(q.ref, d);
      }
    }
  }
  for (const d of porDimension.values()) {
    // Lo prellenado sin confirmar no es la voz de nadie: no cuenta para el desacuerdo.
    const niveles = d.respuestas
      .filter((r) => r.nivel && (r.origen !== "prellenado" || r.confirmada))
      .map((r) => ORDEN.indexOf(r.nivel!));
    if (niveles.length >= 2) {
      const dist = Math.max(...niveles) - Math.min(...niveles);
      d.desacuerdo = dist >= 2 ? "se-contradicen" : dist === 1 ? "difieren" : null;
    }
  }
  const hayEscala = v.cuestionarios.some((x) => x.tipo === "escala");
  const escala = hayEscala
    ? {
        dimensiones: [...porDimension.values()].sort((a, b) => a.ref.localeCompare(b.ref, "es", { numeric: true })),
        porPersona: resultados.map((r) => ({
          persona: quien(v.cuestionarios.find((c) => c.id === r.cuestionarioId)?.personaId ?? null),
          areas: r.areas,
          completo: r.completo,
        })),
      }
    : null;

  // ── Táctico: cada pregunta que contestó más de una persona, lado a lado ──
  const porPregunta = new Map<string, PreguntaComparada>();
  for (const c of v.cuestionarios.filter((x) => x.tipo === "tactico" && x.publicadoAt)) {
    for (const p of c.pestanas) {
      for (const q of p.preguntas) {
        const r = p.respuestas[q.id];
        if (!r || !r.valor.trim()) continue;
        const clave = `${p.key}:${q.id}`;
        const x = porPregunta.get(clave) ?? { pregunta: q.texto, seccion: p.titulo, respuestas: [] };
        x.respuestas.push({
          persona: quien(c.personaId),
          texto: r.valor.trim(),
          nivel: null,
          origen: r.origen,
          confirmada: r.confirmada === true,
          enviada: !!p.enviadaAt,
        });
        porPregunta.set(clave, x);
      }
    }
  }
  const tactico = [...porPregunta.values()].filter((x) => new Set(x.respuestas.map((r) => r.persona)).size >= 2);

  return { estado, escala, tactico };
}
