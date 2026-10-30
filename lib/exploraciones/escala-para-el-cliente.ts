/**
 * lib/exploraciones/escala-para-el-cliente.ts — LA ESCALA QUE SE LE PRESENTA AL CLIENTE (Elías, 30 oct). PURO.
 *
 * El «Acceso» de La escala abre una página igual a la del resultado del test (ResultadoDelTestVista), con lo que la
 * empresa ya tiene medido en vez de lo que respondió. Sale del mismo cálculo (`resultadoDeLosNiveles`), un resultado por
 * área en juego.
 *
 * ⛔ Solo lo CONFIRMADO CON EVIDENCIA (lib/exploraciones/mapa.ts): una hipótesis no llega al cliente, ni aunque alguien la
 * haya usado, y lo que propone el agente tampoco. Del lienzo solo se lee el nivel: ni las citas, ni los porqués, ni la
 * fuente salen de acá.
 * ⛔ Un área o una capa con partes sin medir NO lleva nivel (igual que el chequeo por dentro, que exige todas las que
 * aplican): con 1 de 8 confirmada en Óptimo, la página decía «Óptimo». Tampoco lleva lo que más frena ni qué lo mueve: lo
 * que falta medir podría cambiarlo. Lo medido sigue visible parte por parte. Las que no aplican a su perfil no salen.
 */
import { interpretacionSinIa } from "@/lib/tests-diagnostico/redaccion";
import { resultadoDeLosNiveles, type NivelDeLaDimension, type ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import type { Escala } from "@/lib/escala/documento/tipos";
import { esFuenteDeHipotesis, type EstadoDeExploracion } from "./contenido";
import type { AreaDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";

function resultadoDelArea(escala: Escala, area: AreaDelLienzo, niveles: Record<string, NivelDeLaDimension>): ResultadoDelTest | null {
  // `version` es del test: esta página no la usa.
  const r = resultadoDeLosNiveles({ escala, areaId: area.id, version: "marketing", preguntadas: new Set(Object.keys(niveles)), niveles, orden: area.paraChequeo.orden });
  if (!r) return null;
  const aplican = area.dimensiones.filter((d) => d.aplica);
  const dimensiones = r.dimensiones.filter((d) => aplican.some((x) => x.id === d.id));
  const total = aplican.length;
  if (r.preguntadas === total) return { ...r, dimensiones, total, sintesis: interpretacionSinIa(r, "Por lo que hemos visto") };
  return {
    ...r,
    dimensiones,
    total,
    nivel: null,
    nivelNombre: null,
    puntaje: null,
    capas: r.capas.map((c) => (aplican.some((d) => d.capa === c.clave && !niveles[d.id]) ? { ...c, nivel: null, nivelNombre: null, puntaje: null } : c)),
    recomendacion: null,
    casos: [],
    sintesis: `Hasta ahora medimos ${r.preguntadas} de las ${total} partes de tu área de ${r.areaNombre}. Cuando estén todas, aquí verás su nivel general.`,
  };
}

/** Un resultado por área en juego que tiene algo con evidencia, en el orden en que se eligieron. */
export function resultadosDeLaEscala(escala: Escala, lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): ResultadoDelTest[] {
  const out: ResultadoDelTest[] = [];
  for (const areaId of estado.areas) {
    const area = lienzo.areas.find((a) => a.id === areaId);
    if (!area) continue;
    const niveles: Record<string, NivelDeLaDimension> = {};
    for (const d of area.dimensiones) {
      const e = estado.contenido.chequeo[d.id];
      if (d.aplica && e && !esFuenteDeHipotesis(e.fuente)) niveles[d.id] = { nivel: e.nivel, noLoSe: false, riesgo: !!e.riesgo };
    }
    if (!Object.keys(niveles).length) continue;
    const r = resultadoDelArea(escala, area, niveles);
    if (r) out.push(r);
  }
  return out;
}

/** Cuántas partes aplican en TODAS las áreas en juego, tengan o no evidencia: contra eso dice el «Acceso» cuánto ve el cliente. */
export function partesEnJuego(lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas">): number {
  return lienzo.areas.filter((a) => estado.areas.includes(a.id)).reduce((n, a) => n + a.dimensiones.filter((d) => d.aplica).length, 0);
}
