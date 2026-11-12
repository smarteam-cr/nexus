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
 * ⛔ Del lienzo solo se lee el nivel: ni las citas, ni los porqués, ni la fuente salen de acá. Lo único escrito que sale
 * es lo que una persona escribió PARA el cliente en La escala interna editable (8 nov): el texto de la tarjeta de una
 * dimensión (`textosDelRadar`, solo en el nivel para el que se escribió). El contexto de un área (`contextoDeLaEscala`)
 * NO sale: lo lee el agente de la descripción (Elías, 8 nov).
 * ⛔ Un área o una capa con partes sin nada NO lleva nivel (igual que el chequeo por dentro, que exige todas las que
 * aplican): con 1 de 8 en Óptimo, la página decía «Óptimo». Tampoco lleva lo que más frena ni qué lo mueve. Con todas las
 * partes ubicadas (con evidencia o por explorar) sí lleva nivel.
 * La descripción bajo «Resultado general» (`sintesis`) la decide `descripcionDelArea` (./descripcion-de-la-escala.ts, 8
 * nov): la del agente o la escrita a mano mientras los niveles sigan siendo los de cuando se escribió, o una de respaldo
 * armada con los datos. Sin conteos de partes ni «lo confirmamos contigo»: lo por explorar ya lo muestra el radar.
 */
import { resultadoDeLosNiveles, type NivelDeLaDimension, type ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import type { Escala } from "@/lib/escala/documento/tipos";
import type { EstadoDeExploracion } from "./contenido";
import type { AreaDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { areasDeLaEscala, areasParaElCliente } from "./equipos-de-la-escala";
import { descripcionDelArea, type DescripcionDelArea } from "./descripcion-de-la-escala";
import { suHubspotDe } from "./casos-de-uso";

export interface ResultadoDeUnArea {
  resultado: ResultadoDelTest;
  /** Las dimensiones con un nivel por explorar (una hipótesis que el vendedor usó). */
  porExplorar: string[];
  /** La descripción bajo «Resultado general» (la misma que `resultado.sintesis`) y de dónde salió: para la pantalla interna. */
  descripcion: DescripcionDelArea;
}

/**
 * LA regla del texto de una tarjeta escrito por una persona: vale mientras la dimensión siga ubicada en el nivel para el
 * que se escribió (habla de cómo opera el área en ESE nivel); con otro nivel, o sin nivel, no vale y vuelve el de la escala.
 * La usan la página (`redaccionDeLasPersonas`) y la pantalla interna (el pie de la tarjeta y su editor): una sola regla.
 */
export function textoVigenteDelRadar(
  textos: EstadoDeExploracion["contenido"]["textosDelRadar"],
  d: Pick<ResultadoDelTest["dimensiones"][number], "id" | "preguntada" | "nivel">,
): string | null {
  const t = textos?.[d.id];
  return t && d.preguntada && d.nivel === t.nivel ? t.texto : null;
}

/**
 * Lo que una persona escribió para la tarjeta de cada dimensión, como lo lee la página: el `impacto` de `redaccion`
 * (lib/tests-diagnostico/detalle-de-la-dimension.ts lo prefiere al de la escala), con `textoVigenteDelRadar`.
 */
export function redaccionDeLasPersonas(r: Pick<ResultadoDelTest, "dimensiones">, textos: EstadoDeExploracion["contenido"]["textosDelRadar"]): ResultadoDelTest["redaccion"] {
  const dimensiones: NonNullable<ResultadoDelTest["redaccion"]>["dimensiones"] = {};
  for (const d of r.dimensiones) {
    const texto = textoVigenteDelRadar(textos, d);
    if (texto) dimensiones[d.id] = { impacto: texto, prioridad: null };
  }
  return Object.keys(dimensiones).length ? { v: 2, modelo: "persona", at: "", resumen: null, dimensiones } : null;
}

/** El resultado del área, con `sintesis` vacía: la pone `descripcionDelArea`. */
function resultadoDelArea(escala: Escala, area: AreaDelLienzo, niveles: Record<string, NivelDeLaDimension>, usaHubspot: boolean | null = null): ResultadoDelTest | null {
  // `version` es del test: esta página no la usa. Los casos solo ofrecen reactivar HubSpot si se confirmó que lo usan.
  const r = resultadoDeLosNiveles({ escala, areaId: area.id, version: "marketing", preguntadas: new Set(Object.keys(niveles)), niveles, orden: area.paraChequeo.orden, usaHubspot });
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
      sintesis: "",
    };
  }
  if (r.preguntadas === total) return { ...r, dimensiones, total, sintesis: "" };
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
    sintesis: "",
  };
}

/** Las áreas de la página, en orden: las que eligió el vendedor o, sin elegir, las que tienen algo confirmado. */
export function areasDeLaPagina(lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): string[] {
  const lo = Object.fromEntries(Object.entries(estado.contenido.chequeo).map(([id, e]) => [id, { confirmado: { fuente: e.fuente } }]));
  const cuentas = areasDeLaEscala({ areas: lienzo.areas, enJuego: estado.areas, lo, areasDeLasSesiones: [] });
  return areasParaElCliente(cuentas, estado.contenido.areasAlCliente);
}

/**
 * Un resultado por área de la página (la elegida sin nada, «En medición»), con lo que está por explorar y su descripción.
 * La edición y el perfil entran en la firma de la descripción guardada: cambian qué partes aplican. `areas`: las de la
 * pantalla interna, que las muestra todas (las que el cliente no ve, marcadas); sin él, las que ve el cliente.
 */
export function resultadosDeLaEscala(
  escala: Escala,
  lienzo: EscalaDelLienzo,
  estado: Pick<EstadoDeExploracion, "areas" | "contenido"> & Partial<Pick<EstadoDeExploracion, "edicion" | "perfilCierre" | "perfilDespues">>,
  areas: readonly string[] = areasDeLaPagina(lienzo, estado),
): ResultadoDeUnArea[] {
  const entorno = { edicion: estado.edicion, perfilCierre: estado.perfilCierre, perfilDespues: estado.perfilDespues, escalaVersion: escala.version };
  const out: ResultadoDeUnArea[] = [];
  for (const areaId of areas) {
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
    const r = resultadoDelArea(escala, area, niveles, suHubspotDe(estado).usa);
    if (!r) continue;
    const descripcion = descripcionDelArea(estado.contenido, r, entorno);
    const redaccion = redaccionDeLasPersonas(r, estado.contenido.textosDelRadar);
    out.push({ resultado: { ...r, sintesis: descripcion.texto, ...(redaccion ? { redaccion } : {}) }, porExplorar, descripcion });
  }
  return out;
}

/** Cuántas partes aplican en las áreas de la página, tengan o no algo: contra eso dice el «Acceso» cuánto ve el cliente. */
export function partesDeLaPagina(lienzo: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): number {
  const areas = areasDeLaPagina(lienzo, estado);
  return lienzo.areas.filter((a) => areas.includes(a.id)).reduce((n, a) => n + a.dimensiones.filter((d) => d.aplica).length, 0);
}

/** El logo de la ficha, solo si es una dirección https (la del bucket público): cualquier otra cosa no sale. */
export function logoQueSeSirve(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
