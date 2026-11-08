/**
 * lib/exploraciones/escala-para-el-cliente.ts — LA ESCALA QUE SE LE PRESENTA AL CLIENTE (Elías, 30 oct; tercera vuelta
 * el 8 nov). PURO.
 *
 * El «Acceso» de La escala abre una página igual a la del resultado del test (ResultadoDelTestVista), con lo que la
 * empresa ya tiene medido en vez de lo que respondió. Sale del mismo cálculo (`resultadoDeLosNiveles`), un resultado por
 * área.
 *
 * Qué áreas (8 nov, Centauro Solutions): las que eligió el vendedor entre las que Nexus detectó, o, si no eligió, las en
 * juego con algo confirmado (`areasParaElCliente`, equipos-de-la-escala.ts). En Centauro se habló de Ventas, Servicio y
 * algo de Marketing, y la página salía con una sola área: «Acceso» ofrece las demás.
 *
 * Qué partes: lo que el vendedor USÓ. Con evidencia (lo dijo el cliente, se vio, lo marcó el vendedor o lo contestó en
 * el test) sale como nivel; la hipótesis del agente que el vendedor usó sale como nivel «por explorar» (`porExplorar`),
 * con su marca en el radar, en las barras y en «Por dónde empezar» si sale de ella. Hasta el 8 nov una hipótesis no llegaba nunca al cliente y la página decía «En medición» casi siempre; Elías
 * pidió que lo que no tiene evidencia directa salga como hipótesis por explorar. Lo que el agente sugiere y nadie usó NO
 * sale: el vendedor valida antes de que el cliente lo vea.
 * ⛔ Del lienzo solo se lee el nivel: ni las citas, ni los porqués, ni la fuente salen de acá.
 * ⛔ Un área o una capa con partes sin nada NO lleva nivel (igual que el chequeo por dentro, que exige todas las que
 * aplican): con 1 de 8 en Óptimo, la página decía «Óptimo». Tampoco lleva lo que más frena ni qué lo mueve. Con todas las
 * partes ubicadas (con evidencia o por explorar) sí lleva nivel, y la página dice cuántas son por explorar.
 */
import { interpretacionSinIa } from "@/lib/tests-diagnostico/redaccion";
import { resultadoDeLosNiveles, type NivelDeLaDimension, type ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import type { Escala } from "@/lib/escala/documento/tipos";
import type { EstadoDeExploracion } from "./contenido";
import type { AreaDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { areasDeLaEscala, areasParaElCliente } from "./equipos-de-la-escala";

export interface ResultadoDeUnArea {
  resultado: ResultadoDelTest;
  /** Las dimensiones con un nivel por explorar (una hipótesis que el vendedor usó). */
  porExplorar: string[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

function resultadoDelArea(escala: Escala, area: AreaDelLienzo, niveles: Record<string, NivelDeLaDimension>, porExplorar: readonly string[]): ResultadoDelTest | null {
  // `version` es del test: esta página no la usa.
  const r = resultadoDeLosNiveles({ escala, areaId: area.id, version: "marketing", preguntadas: new Set(Object.keys(niveles)), niveles, orden: area.paraChequeo.orden });
  if (!r) return null;
  const aplican = area.dimensiones.filter((d) => d.aplica);
  const dimensiones = r.dimensiones.filter((d) => aplican.some((x) => x.id === d.id));
  const total = aplican.length;
  if (r.preguntadas === 0) {
    return {
      ...r,
      dimensiones,
      total,
      nivel: null,
      nivelNombre: null,
      puntaje: null,
      capas: r.capas.map((c) => ({ ...c, nivel: null, nivelNombre: null, puntaje: null })),
      recomendacion: null,
      casos: [],
      sintesis: `Todavía no medimos tu área de ${r.areaNombre}: la vamos a conocer en las próximas conversaciones, y aquí verás cómo está.`,
    };
  }
  if (r.preguntadas === total) {
    const nota = porExplorar.length
      ? ` ${porExplorar.length} de las ${total} partes ${plural(porExplorar.length, "está", "están")} por explorar: es lo que creemos por lo conversado, y lo confirmamos contigo.`
      : "";
    return { ...r, dimensiones, total, sintesis: interpretacionSinIa(r, porExplorar.length ? "Por lo que hemos visto hasta ahora" : "Por lo que hemos visto") + nota };
  }
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
    sintesis: `Hasta ahora vimos ${r.preguntadas} de las ${total} partes de tu área de ${r.areaNombre}. Cuando estén todas, aquí verás su nivel general.`,
  };
}

/** Las áreas de la página, en orden: las que eligió el vendedor o, sin elegir, las que tienen algo confirmado. */
export function areasDeLaPagina(lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): string[] {
  const lo = Object.fromEntries(Object.entries(estado.contenido.chequeo).map(([id, e]) => [id, { confirmado: { fuente: e.fuente } }]));
  const cuentas = areasDeLaEscala({ areas: lienzo.areas, enJuego: estado.areas, lo, areasDeLasSesiones: [] });
  return areasParaElCliente(cuentas, estado.contenido.areasAlCliente);
}

/** Un resultado por área de la página (la elegida sin nada, «En medición»), con lo que está por explorar. */
export function resultadosDeLaEscala(escala: Escala, lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): ResultadoDeUnArea[] {
  const out: ResultadoDeUnArea[] = [];
  for (const areaId of areasDeLaPagina(lienzo, estado)) {
    const area = lienzo.areas.find((a) => a.id === areaId);
    if (!area) continue;
    const niveles: Record<string, NivelDeLaDimension> = {};
    const porExplorar: string[] = [];
    for (const d of area.dimensiones) {
      const e = estado.contenido.chequeo[d.id];
      if (!d.aplica || !e) continue;
      niveles[d.id] = { nivel: e.nivel, noLoSe: false, riesgo: !!e.riesgo };
      // Lo que contestó en el test lo dijo el cliente: no es «lo que creemos por lo conversado».
      if (e.fuente === "hipotesis") porExplorar.push(d.id);
    }
    // Sin nada, sale igual (solo llega acá si el vendedor la eligió): «En medición», con todos sus ejes sin medir.
    const resultado = resultadoDelArea(escala, area, niveles, porExplorar);
    if (resultado) out.push({ resultado, porExplorar });
  }
  return out;
}

/** Cuántas partes aplican en las áreas de la página, tengan o no algo: contra eso dice el «Acceso» cuánto ve el cliente. */
export function partesDeLaPagina(lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): number {
  const areas = areasDeLaPagina(lienzo, estado);
  return lienzo.areas.filter((a) => areas.includes(a.id)).reduce((n, a) => n + a.dimensiones.filter((d) => d.aplica).length, 0);
}
