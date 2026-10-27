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
 *   · ningún texto nombra un nivel de la escala («Funcional», «Óptimo»…): quien responde no ve niveles;
 *   · ningún texto muestra un código de la escala (`1.7.F`, `1.7.F2`, `(1.7)`): quien responde no ve códigos.
 */
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { EDICION_GENERAL, VERSIONES_DEL_TEST, type PreguntaDelBanco, type VersionDelTest } from "./tipos";

/** Las áreas que mide la escala y tienen test. */
export const AREAS_DEL_TEST = ["1", "2", "3"] as const;

/** La escala vista por la edición de un banco (`general` = sin edición). */
export const escalaDelBanco = (escala: Escala, edicion: string) => aplicarEdicion(escala, edicion === EDICION_GENERAL ? null : edicion);

/** Un borrador por cada área × versión, para la escala general y cada edición. Los que quedan sin preguntas no van. */
export function borradoresDeLaEscala(escala: Escala): { area: string; version: VersionDelTest; edicion: string; preguntas: PreguntaDelBanco[] }[] {
  const ediciones = [EDICION_GENERAL, ...escala.ediciones.map((e) => e.slug)];
  return AREAS_DEL_TEST.flatMap((area) =>
    VERSIONES_DEL_TEST.flatMap((version) =>
      ediciones.map((edicion) => ({ area, version, edicion, preguntas: borradorDesdeLaEscala(escalaDelBanco(escala, edicion), area, version) })),
    ),
  ).filter((f) => f.preguntas.length > 0);
}

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
    const codigo = [p.texto, p.ayuda ?? "", ...p.opciones.map((o) => o.texto)].map(codigoDeLaEscala).find(Boolean);
    if (codigo) problemas.push(`La pregunta ${n} muestra un código de la escala («${codigo}»): quien responde no ve códigos.`);
  });
  if (version === "web") {
    const sinPregunta = [...dims.values()].filter((d) => !vistas.has(d.id));
    if (sinPregunta.length) problemas.push(`Falta preguntar: ${sinPregunta.map((d) => d.nombre).join(", ")}.`);
  }
  return problemas;
}

/**
 * El código de la escala que asoma en un texto, si hay: el de un nivel (`1.7.F`) o un criterio (`1.7.F2`), o el de una
 * dimensión entre paréntesis (`(1.7)`). Un número suelto («2.5 millones») no cuenta: se parece a una dimensión.
 */
export function codigoDeLaEscala(texto: string): string | null {
  // Después del código puede venir el punto final de la oración; no otro número («1.2.0» es una versión).
  const m = texto.match(/(?:^|[^\w.])([1-3]\.\d{1,2}\.[DIFEO]\d{0,2}|\([1-3]\.\d{1,2}\))(?!\w|\.\d)/);
  return m ? m[1] : null;
}

function nombreDe(escala: Escala, l: Letra): string {
  return escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
}

// ── Qué hacer con cada banco al generarlos y aprobarlos de una vez (scripts/tests-preguntas.ts) ─────────────────────────

/** Lo que el plan necesita de un banco guardado. */
export interface BancoParaElPlan {
  area: string;
  version: VersionDelTest;
  edicion: string;
  escalaVersion: string;
  preguntas: PreguntaDelBanco[];
  aprobadas: PreguntaDelBanco[] | null;
  editadoPor: string | null;
}

export type AccionDelPlan =
  | { tipo: "crear" }
  | { tipo: "rearmar"; desde: string }
  | { tipo: "aprobar" }
  | { tipo: "al-dia" }
  | { tipo: "de-una-persona"; aprobado: boolean };

export interface PlanDelBanco {
  area: string;
  version: VersionDelTest;
  edicion: string;
  preguntas: PreguntaDelBanco[];
  accion: AccionDelPlan;
  problemas: string[];
}

const firma = (p: readonly PreguntaDelBanco[] | null) => JSON.stringify(p ?? []);

/**
 * Qué hacer con cada banco de la escala. `por` es el autor que pone el script: un banco suyo armado con otra versión de la
 * escala se rearma; uno distinto del borrador que guardó otra persona no se toca (lo editó). Uno igual al borrador se
 * aprueba aunque lo haya generado otra persona: nadie lo cambió. Lo que tiene problemas no se aprueba.
 * `preguntas` deben venir ya leídas (`leerPreguntasDelBanco`): así se comparan igual que lo guardado.
 */
export function planDeLosBancos(
  escala: Escala,
  borradores: readonly { area: string; version: VersionDelTest; edicion: string; preguntas: PreguntaDelBanco[] }[],
  bancos: readonly BancoParaElPlan[],
  por: string,
): PlanDelBanco[] {
  return borradores.map((f) => {
    const existente = bancos.find((b) => b.area === f.area && b.version === f.version && b.edicion === f.edicion) ?? null;
    const igualAlGenerado = !!existente && firma(existente.preguntas) === firma(f.preguntas);
    let accion: AccionDelPlan;
    if (!existente) accion = { tipo: "crear" };
    else if (existente.editadoPor !== por && !igualAlGenerado) accion = { tipo: "de-una-persona", aprobado: !!existente.aprobadas?.length };
    else if (!igualAlGenerado) accion = { tipo: "rearmar", desde: existente.escalaVersion };
    else if (firma(existente.aprobadas) === firma(f.preguntas) && existente.escalaVersion === escala.version) accion = { tipo: "al-dia" };
    else accion = { tipo: "aprobar" };
    const problemas = accion.tipo === "de-una-persona" ? [] : problemasDelBanco(escalaDelBanco(escala, f.edicion), f.area, f.version, f.preguntas);
    return { area: f.area, version: f.version, edicion: f.edicion, preguntas: f.preguntas, accion, problemas };
  });
}
