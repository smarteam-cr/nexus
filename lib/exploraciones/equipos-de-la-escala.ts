/**
 * lib/exploraciones/equipos-de-la-escala.ts — DE QUÉ EQUIPOS SE HABLÓ y qué se sabe de cada uno (2026-11-08, tercera
 * vuelta de La escala con Centauro Solutions). PURO.
 *
 * Elías: «Nexus detecta los equipos de los que se habló en las reuniones (en Centauro: Ventas, Servicio y algo de
 * Marketing); el vendedor elige cuáles aparecen» en la página del cliente, y «Dónde está hoy» tiene que ser un resumen
 * rápido de lo explorado. Las dos cosas salen de acá, con la misma cuenta:
 *   · `areasDeLaEscala`: cada área (Ventas, Marketing, Servicio) con cuántas partes tienen evidencia, cuántas son hipótesis
 *     y cuántas no tienen nada, cuántas sesiones fueron con su equipo y si se habló de ella;
 *   · `resumenDeLoExplorado`: la frase de «Dónde está hoy»;
 *   · `areasParaElCliente`: las que salen en la página del cliente (las que eligió el vendedor o, si no eligió, las que
 *     tienen algo que mostrar).
 *
 * «Se habló de ella» = una sesión fue con su equipo, o alguna parte tiene un nivel con evidencia (lo dijo el cliente,
 * confirmado o sugerido con su cita). Una hipótesis sola NO cuenta: el agente puede deducirla sin que nadie la haya
 * nombrado. Un área en juego sin nada de eso está elegida, pero nadie habló de ella todavía.
 */
import type { FuenteDelNivel } from "./contenido";
import { esFuenteDeHipotesis } from "./contenido";

export interface AreaParaContar {
  id: string;
  nombre: string;
  dimensiones: readonly { id: string; aplica: boolean }[];
}

/** Lo que se sabe de una dimensión: lo confirmado (usado por el vendedor) y lo que sugiere el agente sin usar. */
export interface LoDeLaDimension {
  confirmado?: { fuente: FuenteDelNivel } | null;
  /** Lo que sugiere el agente y sigue pendiente. `conCita`: trae una frase del cliente (evidencia). */
  sugerido?: { fuente: FuenteDelNivel; conCita: boolean } | null;
}

export interface AreaDeLaEscala {
  id: string;
  nombre: string;
  /** Las partes que aplican (las que no aplican a su perfil no cuentan). */
  partes: number;
  /** Confirmadas con evidencia (lo dijo el cliente, se vio o lo marcó el vendedor). */
  conEvidencia: number;
  /** Confirmadas como hipótesis (el vendedor usó lo que dedujo el agente, o lo del test): «por explorar». */
  porExplorar: number;
  /** Con algo que sugiere el agente y nadie usó todavía. */
  sugeridas: number;
  /** De esas, las que traen una frase del cliente (evidencia por revisar): las otras son hipótesis. */
  sugeridasConCita: number;
  /** Sin nada, ni confirmado ni sugerido. */
  sinDato: number;
  /** Sesiones que ya ocurrieron con el equipo de esta área. */
  sesiones: number;
  enJuego: boolean;
  /** Se habló de ella: una sesión con su equipo o alguna parte con evidencia (confirmada o sugerida con su cita). */
  seHablo: boolean;
}

export function areasDeLaEscala(o: {
  areas: readonly AreaParaContar[];
  enJuego: readonly string[];
  lo: Readonly<Record<string, LoDeLaDimension>>;
  /** El área de la escala de cada sesión que ya ocurrió con un equipo (null: con la empresa entera o un equipo sin área). */
  areasDeLasSesiones: readonly (string | null)[];
}): AreaDeLaEscala[] {
  return o.areas.map((a) => {
    const c = { conEvidencia: 0, porExplorar: 0, sugeridas: 0, sinDato: 0, sugeridaConCita: 0 };
    const aplican = a.dimensiones.filter((d) => d.aplica);
    for (const d of aplican) {
      const lo = o.lo[d.id];
      if (lo?.confirmado) {
        if (esFuenteDeHipotesis(lo.confirmado.fuente)) c.porExplorar++;
        else c.conEvidencia++;
      } else if (lo?.sugerido) {
        c.sugeridas++;
        if (lo.sugerido.conCita && !esFuenteDeHipotesis(lo.sugerido.fuente)) c.sugeridaConCita++;
      } else c.sinDato++;
    }
    const sesiones = o.areasDeLasSesiones.filter((x) => x === a.id).length;
    return {
      id: a.id,
      nombre: a.nombre,
      partes: aplican.length,
      conEvidencia: c.conEvidencia,
      porExplorar: c.porExplorar,
      sugeridas: c.sugeridas,
      sugeridasConCita: c.sugeridaConCita,
      sinDato: c.sinDato,
      sesiones,
      enJuego: o.enJuego.includes(a.id),
      seHablo: sesiones > 0 || c.conEvidencia > 0 || c.sugeridaConCita > 0,
    };
  });
}

/**
 * Lo que pesa lo explorado de un área: lo que dijo el cliente (confirmado o sugerido con su frase) y las sesiones con su
 * equipo. Una hipótesis no pesa: el agente la deduce sin que nadie haya hablado de esa área.
 */
const peso = (a: AreaDeLaEscala) => a.conEvidencia * 2 + a.sesiones * 3 + a.sugeridasConCita;

/** «A», «A y B», «A, B y C». */
const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

function loDelArea(a: AreaDeLaEscala): string {
  const partes: string[] = [];
  if (a.conEvidencia) partes.push(`${a.conEvidencia} de ${a.partes} con evidencia`);
  if (a.porExplorar) partes.push(`${a.porExplorar} por explorar`);
  if (a.sugeridas) partes.push(`${a.sugeridas} ${a.sugeridas === 1 ? "sugerida" : "sugeridas"} por revisar`);
  return partes.join(", ");
}

/**
 * La frase de «Dónde está hoy»: qué se exploró y por eso qué escala está más llena. Por ejemplo: «Hasta ahora se exploró
 * sobre todo Ventas (2 sesiones con su equipo, 6 de 8 con evidencia): por eso su escala es la más llena. De Servicio hay
 * 2 de 8 con evidencia. De Marketing todavía no se habló.»
 */
export function resumenDeLoExplorado(areas: readonly AreaDeLaEscala[]): string {
  const conAlgo = areas.filter((a) => peso(a) > 0 || a.porExplorar > 0 || a.sugeridas > 0).sort((x, y) => peso(y) - peso(x) || y.porExplorar - x.porExplorar);
  if (!conAlgo.length) return "Todavía no hay nada de las reuniones en la escala: se llena con lo que cuente la empresa.";
  const [primera, ...resto] = conAlgo;
  const sesiones = (a: AreaDeLaEscala) => (a.sesiones ? `${a.sesiones} ${a.sesiones === 1 ? "sesión" : "sesiones"} con su equipo` : "");
  const detalle = (a: AreaDeLaEscala) => [sesiones(a), loDelArea(a)].filter(Boolean).join(", ");
  const frases: string[] = [];
  const empatadas = resto.filter((a) => peso(a) === peso(primera) && peso(a) > 0);
  if (!peso(primera)) {
    // Solo hipótesis: nadie de la empresa habló todavía de ninguna.
    frases.push(`Todavía no hay nada con evidencia: lo de ${enLista(conAlgo.map((a) => a.nombre))} es por explorar, lo que se cree antes de preguntarlo.`);
  } else if (empatadas.length) {
    const igual = [primera, ...empatadas];
    frases.push(`Hasta ahora se exploraron por igual ${enLista(igual.map((a) => a.nombre))}.`);
    for (const a of igual) frases.push(`${a.nombre}: ${detalle(a)}.`);
  } else {
    frases.push(`Hasta ahora se exploró sobre todo ${primera.nombre} (${detalle(primera)}): por eso su escala es la más llena.`);
  }
  for (const a of resto) {
    if (empatadas.includes(a) || !peso(primera)) continue;
    frases.push(`De ${a.nombre} hay ${loDelArea(a) || "poco"}${a.sesiones ? ` (${sesiones(a)})` : ""}.`);
  }
  const sinNada = areas.filter((a) => !conAlgo.includes(a));
  if (sinNada.length) frases.push(`De ${enLista(sinNada.map((a) => a.nombre))} todavía no se habló.`);
  return frases.join(" ");
}

/**
 * Las áreas que salen en la página del cliente, en orden (las en juego primero). `elegidas` es lo que eligió el vendedor
 * (undefined: no eligió todavía). Sin elegir, las EN JUEGO con algo confirmado, como antes del 8 nov: un enlace que ya se
 * mandó no suma áreas solo con el deploy (la revisión lo cazó). Las demás las ofrece «Qué ve el cliente» y las suma el
 * vendedor con un clic. Elegida por el vendedor, un área sin nada sale «En medición» (8 nov); sin elegir, no sale. Primero
 * las que tienen algo (la página abre en la primera: no en una vacía), después las en juego.
 */
export function areasParaElCliente(areas: readonly AreaDeLaEscala[], elegidas: readonly string[] | undefined): string[] {
  const conAlgo = (a: AreaDeLaEscala) => a.conEvidencia + a.porExplorar > 0;
  const orden = [...areas].sort((x, y) => Number(conAlgo(y)) - Number(conAlgo(x)) || Number(y.enJuego) - Number(x.enJuego));
  // Elegida por el vendedor, sale aunque no tenga nada: la página la muestra «En medición» (8 nov, Elías: «debe aparecer
  // que está en medición o que está incompleta, pero también debería poder aparecer»). Sin elegir, como antes.
  return orden.filter((a) => (elegidas ? elegidas.includes(a.id) : a.enJuego && conAlgo(a))).map((a) => a.id);
}

/** Cuántas hipótesis tiene un área: las usadas como «por explorar» y las que sugiere el agente sin una frase del cliente. */
export const hipotesisDelArea = (a: AreaDeLaEscala) => a.porExplorar + (a.sugeridas - a.sugeridasConCita);

/**
 * «Para explorar más esta área» (cuarta vuelta, 2026-11-08): la sugerencia aparece por cada área elegida y se ordena por
 * hipótesis. La regla de Elías: entre más hipótesis tiene un área, más se puede explorar. A igual número, la que tiene
 * más partes sin dato. Un área sin hipótesis ni partes sin dato no lleva sugerencia: ya está explorada.
 */
export function ordenParaExplorar(areas: readonly AreaDeLaEscala[]): AreaDeLaEscala[] {
  return areas
    .filter((a) => hipotesisDelArea(a) + a.sinDato > 0)
    .sort((x, y) => hipotesisDelArea(y) - hipotesisDelArea(x) || y.sinDato - x.sinDato);
}

/**
 * Las partes de un área que se pueden explorar más, en orden: primero las hipótesis (lo que se cree y hay que confirmar)
 * y después las que no tienen nada. Lo que tiene evidencia no va.
 */
export function partesParaExplorar<D extends { id: string; aplica: boolean }>(
  dimensiones: readonly D[],
  clase: (id: string) => "evidencia" | "hipotesis" | null,
): { hipotesis: D[]; sinDato: D[] } {
  const aplican = dimensiones.filter((d) => d.aplica);
  return { hipotesis: aplican.filter((d) => clase(d.id) === "hipotesis"), sinDato: aplican.filter((d) => clase(d.id) === null) };
}
