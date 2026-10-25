/**
 * lib/tests-diagnostico/banco.ts — EL BANCO DE PREGUNTAS del test: el borrador que sale de la escala y lo que se revisa
 * antes de aprobarlo. PURO.
 *
 * El BORRADOR se arma desde la escala publicada vista por la edición de la industria (`aplicarEdicion`): la pregunta de
 * cada dimensión y una opción por nivel con la descripción del nivel. Es un punto de partida, no el texto final: el plan
 * pide preguntas escritas para el cliente, no la descripción del nivel, y las reescribe Elías antes de aprobarlas.
 *
 * Lo que se revisa antes de aprobar (`problemasDelBanco`), porque una pregunta mal armada mueve el nivel del prospecto:
 *   · cada pregunta apunta a una dimensión del área, y ninguna se repite;
 *   · la web pregunta TODAS las dimensiones del área; la de Marketing, exactamente 4 de ellas (salen de las 8);
 *   · cada pregunta tiene una opción por cada nivel, los cinco: NUNCA se veta un nivel (la app vieja no dejaba elegir
 *     Funcional en tres dimensiones);
 *   · ningún texto nombra un nivel de la escala («Funcional», «Óptimo»…): quien responde no ve niveles.
 */
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { PreguntaDelBanco, VersionDelTest } from "./tipos";

/** Cuántas preguntas tiene cada versión. */
export const PREGUNTAS_POR_VERSION: Record<VersionDelTest, number> = { marketing: 4, web: 8 };

/** Las dimensiones de un área, en el orden de la escala. */
function dimensionesDelArea(escala: Escala, areaId: string) {
  return escala.areas.find((a) => a.id === areaId)?.dimensiones ?? [];
}

/**
 * Las dimensiones que pregunta cada versión en el BORRADOR: la web, todas; la de Marketing, las de la capa base (cómo está
 * montado el departamento por dentro: lo que una persona de marketing responde sin investigar). Elías puede cambiarlas.
 */
export function dimensionesDelBorrador(escala: Escala, areaId: string, version: VersionDelTest): string[] {
  const dims = dimensionesDelArea(escala, areaId);
  const elegidas = version === "web" ? dims : dims.filter((d) => d.capa === "base");
  return elegidas.slice(0, PREGUNTAS_POR_VERSION[version]).map((d) => d.id);
}

/** El borrador de una (área, versión) desde la escala ya vista por su edición. Ids estables por dimensión y nivel. */
export function borradorDesdeLaEscala(escala: Escala, areaId: string, version: VersionDelTest): PreguntaDelBanco[] {
  const dims = new Map(dimensionesDelArea(escala, areaId).map((d) => [d.id, d]));
  return dimensionesDelBorrador(escala, areaId, version).flatMap((id): PreguntaDelBanco[] => {
    const d = dims.get(id);
    if (!d) return [];
    return [
      {
        id: `p-${d.id}`,
        dimensionId: d.id,
        texto: d.pregunta,
        ayuda: d.descripcion,
        opciones: LETRAS.flatMap((l) => {
          const n = d.niveles.find((x) => x.letra === l);
          return n ? [{ id: `o-${d.id}-${l}`, texto: n.descripcion, nivel: l }] : [];
        }),
      },
    ];
  });
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Qué impide aprobar este banco. Vacío = se puede aprobar. */
export function problemasDelBanco(escala: Escala, areaId: string, version: VersionDelTest, preguntas: readonly PreguntaDelBanco[]): string[] {
  const problemas: string[] = [];
  const dims = new Map(dimensionesDelArea(escala, areaId).map((d) => [d.id, d]));
  if (!dims.size) return [`La escala publicada no tiene el área ${areaId}.`];
  const esperadas = version === "web" ? dims.size : Math.min(PREGUNTAS_POR_VERSION.marketing, dims.size);
  if (preguntas.length !== esperadas) {
    problemas.push(`Tiene ${preguntas.length} ${preguntas.length === 1 ? "pregunta" : "preguntas"} y la versión pide ${esperadas}.`);
  }
  const vistas = new Set<string>();
  const nombresDeNivel = escala.niveles.map((n) => sinTildes(n.nombre));
  preguntas.forEach((p, i) => {
    const n = i + 1;
    const d = dims.get(p.dimensionId);
    if (!d) problemas.push(`La pregunta ${n} apunta a una dimensión que no es de esta área (${p.dimensionId}).`);
    if (vistas.has(p.dimensionId)) problemas.push(`La pregunta ${n} repite una dimensión: «${d?.nombre ?? p.dimensionId}».`);
    vistas.add(p.dimensionId);
    if (!p.texto.trim()) problemas.push(`La pregunta ${n} no tiene texto.`);
    const letras = p.opciones.map((o) => o.nivel);
    const faltan = LETRAS.filter((l) => !letras.includes(l));
    if (faltan.length) problemas.push(`La pregunta ${n} no deja elegir todos los niveles: falta ${faltan.map((l) => nombreDe(escala, l)).join(", ")}.`);
    if (new Set(letras).size !== letras.length) problemas.push(`La pregunta ${n} tiene dos opciones con el mismo nivel.`);
    if (p.opciones.some((o) => !o.texto.trim())) problemas.push(`La pregunta ${n} tiene una opción sin texto.`);
    const textos = [p.texto, p.ayuda ?? "", ...p.opciones.map((o) => o.texto)].map(sinTildes);
    const nombra = nombresDeNivel.find((nom) => textos.some((t) => new RegExp(`(^|[^a-z])${nom}([^a-z]|$)`).test(t)));
    if (nombra) problemas.push(`La pregunta ${n} nombra un nivel de la escala («${nombra}»): quien responde no ve niveles.`);
  });
  if (version === "web") {
    const sinPregunta = [...dims.values()].filter((d) => !vistas.has(d.id));
    if (sinPregunta.length) problemas.push(`Falta preguntar: ${sinPregunta.map((d) => d.nombre).join(", ")}.`);
  }
  return problemas;
}

function nombreDe(escala: Escala, l: Letra): string {
  return escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
}
