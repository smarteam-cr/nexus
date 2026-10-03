/**
 * lib/cuestionario/escala-armado.ts — la parte PURA del cuestionario de escala: armar las secciones
 * desde la escala publicada y calcular el resultado de lo que eligió una persona. Sin base ni
 * `server-only`, para probarla con la mini-escala de los tests. El porqué de cada regla, en escala.ts.
 */
import { randomBytes } from "node:crypto";
import { areaParaChequeo, calcularChequeo, type Estimado, type ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { CIERRES, DESPUES, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { OPCION_NO_SE, leerPreguntas, leerRespuestas, type Opcion, type Pregunta, type Respuestas } from "./tipos";

/** La sección del perfil de negocio (cuando la exploración de venta no lo trae). */
export const KEY_DEL_PERFIL = "tu-negocio";
const REF_CIERRE = "perfil:cierre";
const REF_DESPUES = "perfil:despues";

const opaco = (prefijo: string) => `${prefijo}-${randomBytes(5).toString("hex")}`;

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Las opciones de una pregunta del perfil, con el valor canónico como id (no es de la escala: es el perfil). */
function opcionesDelPerfil(
  pregunta: { opciones: { nombre: string; definicion: string }[] },
  canonicos: readonly string[],
): Opcion[] {
  return pregunta.opciones.flatMap((o) => {
    // «Relación única» → «única»: el nombre de la escala puede traer palabras de más alrededor del valor.
    const valor = canonicos.find((c) => new RegExp(`(^|\\s)${normal(c)}(\\s|$)`).test(normal(o.nombre)));
    return valor ? [{ id: valor, texto: o.definicion ? `${o.nombre}: ${o.definicion}` : o.nombre }] : [];
  });
}

interface PestanaArmada {
  key: string;
  titulo: string;
  descripcion: string | null;
  tipo: "normal" | "escala";
  preguntas: Pregunta[];
  respuestas: Respuestas;
}

/** Arma las secciones del cuestionario. Pura sobre la escala: se testea sin base. */
export function armarSecciones(
  escala: Escala,
  areas: readonly string[],
  perfil: Perfil | null,
  previo: Readonly<Record<string, { nivel: Letra }>>,
  ahora: string,
): PestanaArmada[] {
  const out: PestanaArmada[] = [];

  const faltaCierre = !perfil?.cierre && escala.perfilDeNegocio.cierre;
  const faltaDespues = !perfil?.despues && escala.perfilDeNegocio.despues;
  if (faltaCierre || faltaDespues) {
    const preguntas: Pregunta[] = [];
    if (faltaCierre && escala.perfilDeNegocio.cierre && opcionesDelPerfil(escala.perfilDeNegocio.cierre, CIERRES).length) {
      preguntas.push({
        id: opaco("q"),
        categoria: "Tu negocio",
        texto: escala.perfilDeNegocio.cierre.pregunta,
        momento: "previo",
        opciones: opcionesDelPerfil(escala.perfilDeNegocio.cierre, CIERRES),
        ref: REF_CIERRE,
      });
    }
    if (faltaDespues && escala.perfilDeNegocio.despues && opcionesDelPerfil(escala.perfilDeNegocio.despues, DESPUES).length) {
      preguntas.push({
        id: opaco("q"),
        categoria: "Tu negocio",
        texto: escala.perfilDeNegocio.despues.pregunta,
        momento: "previo",
        opciones: opcionesDelPerfil(escala.perfilDeNegocio.despues, DESPUES),
        ref: REF_DESPUES,
      });
    }
    if (preguntas.length) {
      out.push({
        key: KEY_DEL_PERFIL,
        titulo: "Tu negocio",
        descripcion: "Dos preguntas para saber qué aplica a tu forma de vender.",
        tipo: "normal",
        preguntas,
        respuestas: {},
      });
    }
  }

  for (const areaId of areas) {
    const area = escala.areas.find((a) => a.id === areaId);
    if (!area) continue;
    const preguntas: Pregunta[] = [];
    const respuestas: Respuestas = {};
    for (const dim of area.dimensiones) {
      // Con el perfil conocido, las dimensiones que no aplican no se preguntan (paso 1 del cálculo).
      if (perfil && !dimensionAplica(dim, perfil)) continue;
      const opciones: Opcion[] = dim.niveles.map((n) => ({ id: opaco("o"), texto: n.descripcion, nivel: n.letra }));
      const q: Pregunta = {
        id: opaco("q"),
        categoria: dim.nombre,
        texto: dim.pregunta,
        momento: "previo",
        opciones,
        ref: dim.id,
      };
      preguntas.push(q);
      preguntas.push({
        id: opaco("q"),
        categoria: dim.nombre,
        texto: "Si quieres, cuéntanos un ejemplo de cómo lo hacen hoy.",
        momento: "previo",
        ref: dim.id,
        opcional: true,
      });
      const p = previo[dim.id];
      const elegida = p ? opciones.find((o) => o.nivel === p.nivel) : undefined;
      if (elegida) respuestas[q.id] = { valor: elegida.id, origen: "prellenado", actualizadoAt: ahora };
    }
    if (preguntas.length) {
      out.push({
        key: `area-${area.id}`,
        titulo: area.nombre,
        descripcion:
          "En cada pregunta, elige la opción que mejor describe cómo funciona HOY (no cómo debería). " +
          "Si no lo sabes, marca «No lo sé»: también es una respuesta útil.",
        tipo: "escala",
        preguntas,
        respuestas,
      });
    }
  }
  return out;
}

// ── El resultado ──────────────────────────────────────────────────────────────

export interface SeccionParaResultado {
  key: string;
  preguntas: unknown;
  respuestas: unknown;
}

/** Lo que contestó UNA persona, en letras por dimensión (y el perfil, si lo contestó). Pura. */
export function estimadosDeLasRespuestas(
  secciones: readonly SeccionParaResultado[],
  perfilGuardado: Perfil | null,
): { estimados: Record<string, Estimado>; perfil: Perfil; areas: string[]; contestadas: number; total: number } {
  const estimados: Record<string, Estimado> = {};
  const perfil: Perfil = { cierre: perfilGuardado?.cierre ?? null, despues: perfilGuardado?.despues ?? null };
  const areas: string[] = [];
  let contestadas = 0;
  let total = 0;
  for (const s of secciones) {
    if (s.key.startsWith("area-")) areas.push(s.key.slice(5));
    const respuestas = leerRespuestas(s.respuestas);
    for (const q of leerPreguntas(s.preguntas)) {
      if (!q.opciones || !q.ref) continue;
      const r = respuestas[q.id];
      if (q.ref === REF_CIERRE || q.ref === REF_DESPUES) {
        if (r?.valor) {
          if (q.ref === REF_CIERRE) perfil.cierre = CIERRES.find((c) => c === r.valor) ?? perfil.cierre;
          else perfil.despues = DESPUES.find((d) => d === r.valor) ?? perfil.despues;
        }
        continue;
      }
      total++;
      if (!r?.valor) continue;
      contestadas++;
      // «No lo sé» = el nivel más bajo (especificación del cálculo, paso 2).
      const nivel = r.valor === OPCION_NO_SE ? "D" : (q.opciones.find((o) => o.id === r.valor)?.nivel as Letra | undefined);
      if (nivel) estimados[q.ref] = { nivel };
    }
  }
  return { estimados, perfil, areas, contestadas, total };
}

/** El chequeo de lo que contestó una persona, contra la escala vigente. */
export function resultadoDeLaEscala(
  escala: Escala,
  edicion: string | null,
  secciones: readonly SeccionParaResultado[],
  perfilGuardado: Perfil | null,
): { resultado: ResultadoDelChequeo; contestadas: number; total: number } {
  const e = aplicarEdicion(escala, edicion);
  const { estimados, perfil, areas, contestadas, total } = estimadosDeLasRespuestas(secciones, perfilGuardado);
  const paraChequeo = areas.map((id) => areaParaChequeo(e, id, perfil)).filter((a): a is NonNullable<typeof a> => a !== null);
  return { resultado: calcularChequeo(paraChequeo, estimados), contestadas, total };
}

export function leerPerfil(raw: unknown): Perfil | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { cierre?: unknown; despues?: unknown };
  const cierre = CIERRES.find((c) => c === r.cierre) ?? null;
  const despues = DESPUES.find((d) => d === r.despues) ?? null;
  return cierre || despues ? { cierre, despues } : null;
}
