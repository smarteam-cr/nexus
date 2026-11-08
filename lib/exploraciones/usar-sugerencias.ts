/**
 * lib/exploraciones/usar-sugerencias.ts — K12 (2026-10-28, con Camosa): «Usar» en las sugerencias, sin sorpresas.
 *
 * Elías usó una sugerencia de La escala y no supo qué había cambiado ni pudo volver a leerla. Acá viven las palabras:
 *   - `queHaceUsar`: lo que va a escribir cada «Usar» («Poner Ventas · Datos en Inicial»), y el aviso cuando cambia
 *     algo más (una industria trae su perfil habitual).
 *   - `usadasDeHoy`: lo que muestra «Usadas hoy» (de `contenido.usadas`, que escribe contenido.ts al usar).
 *   - `etiquetaDelLote` y `loQueVaAPasar`: el botón «Pasar las N al mapa» y la lista corta de su confirmación.
 * Deshacer es una operación más (`deshacerUso`, contenido.ts): pasa por el mismo PATCH y las mismas guardas.
 * PURO: lo usan la pantalla y las pruebas.
 */
import { ETIQUETA_DE_CIERRE, ETIQUETA_DE_DESPUES } from "@/lib/escala/documento/perfil";
import type { Cierre, Despues, Letra } from "@/lib/escala/documento/tipos";
import { definicionDe, esDeLista, TIPO_DE_CASILLA } from "./casillas";
import {
  esFuenteDeHipotesis,
  type CasoDeUsoElegido,
  type EstadoDeCriterio,
  type EstadoDeExploracion,
  type EstimadoGuardado,
  type ItemPropuesto,
  type UsoDeSugerencia,
} from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { aFecha, conEspaciosComunes, hoyEnCostaRica, ZONA_DE_LA_EXPLORACION } from "./fechas";
import { definicionEnElMarco, type Marco } from "./marco";

const ESTADO: Record<EstadoDeCriterio["estado"], string> = { tiene: "lo tiene", no_tiene: "no lo tiene", no_se: "no se sabe" };

/** «Ventas · Datos», o el id si la dimensión ya no está en la escala. */
export function nombreDeLaDimension(escala: EscalaDelLienzo, id: string): string {
  for (const a of escala.areas) {
    const d = a.dimensiones.find((x) => x.id === id);
    if (d) return `${a.nombre} · ${d.nombre}`;
  }
  return id;
}

export function textoDelCriterio(escala: EscalaDelLienzo, id: string): string {
  for (const a of escala.areas) {
    for (const d of a.dimensiones) {
      const c = d.funcional.find((x) => x.id === id);
      if (c) return c.texto.length > 70 ? `${c.texto.slice(0, 69).trimEnd()}…` : c.texto;
    }
  }
  return id;
}

export const nombreDelPerfil = (cierre: Cierre, despues: Despues) => `${ETIQUETA_DE_CIERRE[cierre]} · ${ETIQUETA_DE_DESPUES[despues]}`;

/** Lo que hace «Usar», en una línea, y si además cambia algo que no se ve en la fila. */
export interface LoQueHaceUsar {
  texto: string;
  aviso?: string;
  /**
   * «Usar» pisa algo que ya está (un nivel distinto, una casilla escrita, el perfil, un caso de uso elegido). La fila
   * compacta de «Lo que aprendimos» lo marca con ⚠ antes de apretar (revisión del 2026-11-08).
   */
  pisa?: boolean;
}

/** Lo que dice el `title` de «Usar»: qué escribe y, si hay, el aviso de lo demás que cambia. */
export function tituloDeUsar(q: LoQueHaceUsar): string {
  return q.aviso ? `${q.texto}. ${q.aviso}` : q.texto;
}

export function queHaceUsar(
  item: Pick<ItemPropuesto, "destino" | "valor">,
  estado: EstadoDeExploracion,
  escala: EscalaDelLienzo,
  nombreDeNivel: (l: Letra) => string,
  marco?: Marco,
): LoQueHaceUsar {
  const d = item.destino;
  const c = estado.contenido;
  switch (d.tipo) {
    case "nivel": {
      const v = item.valor as EstimadoGuardado;
      const dim = nombreDeLaDimension(escala, d.dimensionId);
      const hipotesis = esFuenteDeHipotesis(v.fuente) ? " (como hipótesis)" : "";
      const hoy = c.chequeo[d.dimensionId];
      if (hoy && hoy.nivel !== v.nivel) return { texto: `Cambiar ${dim} de ${nombreDeNivel(hoy.nivel)} a ${nombreDeNivel(v.nivel)}${hipotesis}`, pisa: true };
      return { texto: `Poner ${dim} en ${nombreDeNivel(v.nivel)}${hipotesis}` };
    }
    case "falta":
      return { texto: `Marcar «${textoDelCriterio(escala, d.criterioId)}»: ${ESTADO[(item.valor as EstadoDeCriterio).estado]}` };
    case "aExplorar":
      return { texto: `Marcar ${nombreDeLaDimension(escala, d.dimensionId)} para explorar a fondo` };
    case "area":
      return { texto: `Sumar ${escala.areas.find((a) => a.id === d.areaId)?.nombre ?? d.areaId} a las áreas en juego` };
    case "edicion": {
      const slug = (item.valor as { slug: string | null }).slug;
      const edicion = slug ? escala.ediciones.find((e) => e.slug === slug) : null;
      const texto = slug ? `Medir con la escala de ${edicion?.nombre ?? slug}` : "Medir con la escala general";
      const habitual = edicion?.perfilHabitual;
      if (!habitual || (habitual.cierre === estado.perfilCierre && habitual.despues === estado.perfilDespues)) return { texto };
      const hoy = estado.perfilCierre && estado.perfilDespues ? ` (hoy: ${nombreDelPerfil(estado.perfilCierre, estado.perfilDespues)})` : "";
      return { texto, pisa: true, aviso: `También cambia el perfil de cierre y de después a ${nombreDelPerfil(habitual.cierre, habitual.despues)}${hoy}.` };
    }
    case "perfil": {
      const p = item.valor as { cierre: Cierre; despues: Despues };
      return { texto: `Cambiar el perfil a ${nombreDelPerfil(p.cierre, p.despues)}`, pisa: true };
    }
    case "casilla": {
      const etiqueta = (marco ? definicionEnElMarco(d.clave, marco) : definicionDe(d.clave)).etiqueta;
      if (esDeLista(TIPO_DE_CASILLA[d.clave])) return { texto: `Sumar a «${etiqueta}»` };
      return c.casillas[d.clave] !== undefined ? { texto: `Reemplazar lo que dice «${etiqueta}»`, pisa: true } : { texto: `Escribirlo en «${etiqueta}»` };
    }
    case "casoDeUso": {
      const titulo = (item.valor as CasoDeUsoElegido).titulo;
      // La versión nueva de un caso ya elegido (2026-11-08, «Regenerar»): reemplaza la que está.
      if (d.useCaseId in c.casosDeUso) return { texto: `Actualizar «${titulo}» con la versión nueva`, pisa: true, aviso: c.casosDeUso[d.useCaseId].aMano ? "Reemplaza las actividades que cambiaste a mano." : undefined };
      return { texto: `Sumar «${titulo}» a los casos de uso` };
    }
  }
}

/** Las usadas de hoy (en Costa Rica), la más nueva primero. */
export function usadasDeHoy(usadas: readonly UsoDeSugerencia[] | undefined, ahora = new Date()): UsoDeSugerencia[] {
  const hoy = hoyEnCostaRica(ahora);
  return (usadas ?? []).filter((u) => !Number.isNaN(Date.parse(u.en)) && hoyEnCostaRica(aFecha(u.en)) === hoy).reverse();
}

/** «10:42», en la hora de Costa Rica. */
export function horaDelUso(en: string): string {
  return conEspaciosComunes(aFecha(en).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_DE_LA_EXPLORACION }));
}

/** Dónde se usa el lote, para el nombre del botón. */
export type LugarDelLote = "escala" | "casos" | "resumen" | "sesion" | "otro";

/** El botón que usa todas juntas: en La escala, «Pasar las N al mapa» (Elías, 2026-10-28). */
export function etiquetaDelLote(lugar: LugarDelLote, n: number): string {
  if (n === 1) return "Usar la sugerida";
  switch (lugar) {
    case "escala":
      return `Pasar las ${n} al mapa`;
    case "casos":
      return `Sumar los ${n} casos`;
    case "resumen":
      return `Pasar las ${n} al resumen`;
    case "sesion":
      return `Pasar las ${n} a la exploración`;
    default:
      return `Usar las ${n}`;
  }
}

/** El aviso después de usar el lote: «Pasaste 21 sugerencias al mapa». */
export function avisoDelLote(lugar: LugarDelLote, n: number): string {
  const cuantas = n === 1 ? "una sugerencia" : `${n} sugerencias`;
  switch (lugar) {
    case "escala":
      return `Pasaste ${cuantas} al mapa`;
    case "casos":
      return n === 1 ? "Sumaste un caso de uso" : `Sumaste ${n} casos de uso`;
    case "resumen":
      return `Pasaste ${cuantas} al resumen`;
    case "sesion":
      return `Pasaste ${cuantas} a la exploración`;
    default:
      return `Usaste ${cuantas}`;
  }
}

/** La lista corta de la confirmación: hasta `max` líneas y «y N más». Los avisos (la industria) van siempre. */
export function loQueVaAPasar(efectos: readonly LoQueHaceUsar[], max = 6): { lineas: string[]; mas: number; avisos: string[] } {
  return {
    lineas: efectos.slice(0, max).map((e) => e.texto),
    mas: Math.max(0, efectos.length - max),
    avisos: [...new Set(efectos.map((e) => e.aviso).filter((a): a is string => !!a))],
  };
}
