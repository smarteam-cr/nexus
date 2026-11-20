/**
 * lib/exploraciones/lo-que-falta-saber.ts — «Lo que falta saber»: la agenda de una sesión como LISTA por tema (2026-11-20,
 * Elías tras la sesión con Ventas). PURO y client-safe.
 *
 * En una reunión los temas saltan: el cliente habla del embudo en el bloque de la apertura y de su meta en el cierre. Con
 * lo pendiente repartido entre bloques, quien lleva la sesión no sabía de un vistazo qué le faltaba. Ahora, arriba de la
 * guía en «En vivo», va todo lo que hay que averiguar agrupado por tema (la tarjeta del marco, la dimensión de la escala
 * o el tema del equipo al que apunta; sin tema, el bloque de donde sale) y se marca ahí mismo. Las marcas son las MISMAS
 * de los bloques (`av:<huella>` en `SesionPlaneada.hechas`, agenda.ts): marcar arriba marca abajo, y al revés.
 *
 * Además de lo que trae la agenda, Nexus suma lo que la agenda no pregunta y hace falta para la cuenta de la pérdida
 * (perdida.ts): las cifras mínimas de Negocio y de Embudo cuando faltan, y «Validar con el cliente: pierden ~US$ X al
 * mes» cuando ya hay cuenta sin validar. Los bloques siguen debajo como apoyo: no se esconde nada.
 */
import { estaAveriguada, idDeAveriguar, type AgendaDeLaGuia, type CosaPorAveriguar } from "./agenda";
import type { Cifras, Meta } from "./casillas";
import { faltaEnElEmbudo, faltaEnElNegocio } from "./estado-de-las-tarjetas";
import { formatearMonto, perdidaDeLaExploracion, validarConElCliente, type PerdidaValidada } from "./perdida";

/** Una cosa de la lista. `deNexus`: la sumó Nexus (no está en ningún bloque). `huella`: la de la cuenta, en la de la pérdida. */
export interface CosaQueFalta extends CosaPorAveriguar {
  deNexus?: "negocio" | "embudo" | "perdida";
  huella?: string;
}

export interface TemaDeLoQueFalta {
  /** El tema (`para`) o, sin tema, `bloque:<título>`. */
  clave: string;
  /** A qué apunta (una tarjeta, una dimensión o un tema del equipo). null: lo que no apunta a nada, con el título de su bloque. */
  para: string | null;
  /** El título del bloque de donde sale, para los que no tienen tema. */
  titulo: string | null;
  cosas: CosaQueFalta[];
  /** Cuántas siguen sin marcar. */
  pendientes: number;
}

export const ID_DE_LA_PERDIDA = "av:perdida";

/** La pregunta para validar la pérdida en la sesión: con su número, sin pedirle al cliente que haga la cuenta. */
const PREGUNTA_DE_LA_PERDIDA = "Con lo que nos contaste, cada mes que no llegan a la meta se les van unos {monto}. ¿Te hace sentido esa cifra?";

/** «faltan el ticket promedio y el volumen» → «El ticket promedio y el volumen». */
const comoCosa = (motivo: string) => {
  const t = motivo.replace(/^falta(n)?\s+/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Lo que Nexus suma a la lista (preventa): las cifras de Negocio y Embudo que faltan para la cuenta, si la agenda no las
 * pregunta ya, y la validación de la pérdida si hay una cuenta sin validar.
 */
export function cosasDeNexus(o: {
  marco: "venta" | "cs";
  casillas: { negocio?: Cifras; embudo?: Cifras; metas?: readonly Meta[] };
  perdida: PerdidaValidada | undefined | null;
  agenda: AgendaDeLaGuia;
  /** La pregunta de base de cada tarjeta (marco.ts). */
  pregunta: (para: "negocio" | "embudo" | "consecuencias") => string | undefined;
}): CosaQueFalta[] {
  if (o.marco !== "venta") return [];
  const temas = new Set(o.agenda.bloques.flatMap((b) => b.averiguar.map((c) => c.para)));
  const out: CosaQueFalta[] = [];
  const { porValidar } = perdidaDeLaExploracion(o.casillas, o.perdida);
  if (porValidar) {
    out.push({
      id: `${ID_DE_LA_PERDIDA}:${porValidar.huella}`,
      que: validarConElCliente(porValidar),
      preguntas: [PREGUNTA_DE_LA_PERDIDA.replace("{monto}", formatearMonto(porValidar.montoAlMes, porValidar.moneda))],
      para: "consecuencias",
      deNexus: "perdida",
      huella: porValidar.huella,
    });
  }
  for (const clave of ["negocio", "embudo"] as const) {
    if (temas.has(clave)) continue;
    const falta = clave === "negocio" ? faltaEnElNegocio(o.casillas.negocio) : faltaEnElEmbudo(o.casillas.embudo);
    if (!falta) continue;
    const que = comoCosa(falta);
    const pregunta = o.pregunta(clave);
    out.push({ id: idDeAveriguar(`${clave}: ${que}`), que, preguntas: pregunta ? [pregunta] : [], para: clave, deNexus: clave });
  }
  return out;
}

/**
 * La agenda como lista por tema, con lo que sumó Nexus. Los temas en el orden en que aparecen (los de Nexus, en su tema
 * si la agenda lo tiene; si no, al final); los que ya están completos, al fondo. Una cosa que se repite (la misma huella)
 * va una vez.
 */
export function loQueFaltaSaber(agenda: AgendaDeLaGuia, hechas: readonly string[] | undefined, extras: readonly CosaQueFalta[] = []): TemaDeLoQueFalta[] {
  const temas = new Map<string, TemaDeLoQueFalta>();
  const vistas = new Set<string>();
  const sumar = (c: CosaQueFalta, titulo: string | null) => {
    if (vistas.has(c.id)) return;
    vistas.add(c.id);
    const clave = c.para ?? `bloque:${titulo ?? ""}`;
    const tema = temas.get(clave) ?? { clave, para: c.para ?? null, titulo: c.para ? null : titulo, cosas: [], pendientes: 0 };
    tema.cosas.push(c);
    if (!estaAveriguada(c, hechas)) tema.pendientes++;
    temas.set(clave, tema);
  };
  for (const b of agenda.bloques) for (const c of b.averiguar) sumar(c, b.titulo);
  for (const c of extras) sumar(c, null);
  const lista = [...temas.values()];
  return [...lista.filter((t) => t.pendientes > 0), ...lista.filter((t) => t.pendientes === 0)];
}

/** Cuántas cosas faltan en toda la lista. */
export function cuantasFaltan(temas: readonly TemaDeLoQueFalta[]): number {
  return temas.reduce((n, t) => n + t.pendientes, 0);
}
