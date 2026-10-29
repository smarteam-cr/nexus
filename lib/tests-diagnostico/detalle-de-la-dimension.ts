/**
 * lib/tests-diagnostico/detalle-de-la-dimension.ts — «VER DETALLES» de cada barra de la página de resultado del test
 * (29 oct). PURO y CLIENT-SAFE.
 *
 * La aplicación vieja abría, debajo de cada barra, el porqué de la dimensión: la evidencia que redactaba la IA, lo que
 * dice la escala de ese nivel y lo que falta para llegar a Funcional. Nexus no redacta nada: todo sale de la escala y de
 * lo que respondió la persona.
 *   · `queMide`: la descripción de la dimensión en la escala;
 *   · `respondiste`: el texto de la opción que eligió (o «No lo sé»); null en un resultado reabierto de la app vieja,
 *     que no trae las preguntas;
 *   · `esteNivel`: el nombre y la descripción de su nivel en la escala (null si es el mismo texto que eligió: las
 *     opciones del banco suelen salir de esas descripciones, y repetirlo no le dice nada);
 *   · `siguiente`: el nivel de arriba con sus criterios (null si ya está en el último);
 *   · `riesgos`: los mensajes de riesgo de los criterios que todavía no alcanza (los de los niveles de arriba, hasta 3).
 * La escala es la de HOY vista por la edición del resultado: una dimensión que ya no existe se queda sin detalle.
 */
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "./resultado";
import { textoDeLaRespuesta, type PreguntaDelBanco, type RespuestasDelTest } from "./tipos";

/** Cuántos riesgos lleva el detalle de una dimensión. */
export const MAX_RIESGOS_DEL_DETALLE = 3;

export interface DetalleDeLaDimension {
  queMide: string | null;
  respondiste: string | null;
  esteNivel: { nombre: string; descripcion: string } | null;
  siguiente: { nombre: string; criterios: string[] } | null;
  riesgos: string[];
}

/** El detalle de cada dimensión preguntada y ubicada del resultado, por su id. */
export function detallesDelResultado(
  escala: Escala,
  r: Pick<ResultadoDelTest, "areaId" | "dimensiones">,
  lo?: { preguntas: readonly PreguntaDelBanco[]; respuestas: RespuestasDelTest } | null,
): Record<string, DetalleDeLaDimension> {
  const area = escala.areas.find((a) => a.id === r.areaId);
  if (!area) return {};
  const out: Record<string, DetalleDeLaDimension> = {};
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const dim = area.dimensiones.find((x) => x.id === d.id);
    if (!dim) continue;
    const i = LETRAS.indexOf(d.nivel);
    const nivel = dim.niveles.find((n) => n.letra === d.nivel);
    const letraSiguiente: Letra | undefined = LETRAS[i + 1];
    const siguiente = letraSiguiente ? dim.niveles.find((n) => n.letra === letraSiguiente) : undefined;
    const riesgos: string[] = [];
    for (const n of dim.niveles) {
      if (LETRAS.indexOf(n.letra) <= i) continue;
      for (const c of n.criterios) {
        const msg = c.riesgo ? escala.riesgos[c.id] : undefined;
        if (msg && !riesgos.includes(msg)) riesgos.push(msg);
      }
    }
    const respondiste = lo ? loQueRespondio(dim.id, lo.preguntas, lo.respuestas) : null;
    const descripcion = nivel?.descripcion.trim() ?? "";
    out[d.id] = {
      queMide: dim.descripcion?.trim() || null,
      respondiste,
      esteNivel: descripcion && !mismoTexto(descripcion, respondiste) ? { nombre: nombreDeNivel(escala, d.nivel), descripcion } : null,
      siguiente:
        letraSiguiente && siguiente && siguiente.criterios.length
          ? { nombre: nombreDeNivel(escala, letraSiguiente), criterios: siguiente.criterios.map((c) => c.texto.trim()).filter(Boolean) }
          : null,
      riesgos: riesgos.slice(0, MAX_RIESGOS_DEL_DETALLE),
    };
  }
  return out;
}

/** Dos textos que dicen lo mismo, sin mirar mayúsculas, espacios ni el punto final. */
const normal = (x: string) => x.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const mismoTexto = (a: string, b: string | null) => b !== null && normal(a) === normal(b);

/** El texto de la opción que eligió en la pregunta de esa dimensión. */
function loQueRespondio(dimensionId: string, preguntas: readonly PreguntaDelBanco[], respuestas: RespuestasDelTest): string | null {
  for (const p of preguntas) {
    if (p.dimensionId !== dimensionId) continue;
    const r = respuestas[p.id];
    const texto = r ? textoDeLaRespuesta(p, r) : null;
    if (texto) return texto;
  }
  return null;
}
