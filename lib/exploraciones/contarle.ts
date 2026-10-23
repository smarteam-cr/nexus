/**
 * lib/exploraciones/contarle.ts — qué contarle al cliente en la sesión, además de preguntarle. PURO.
 *
 * Marco (feedback de Ventas, 22 oct): «la sesión dura una hora y el cliente no solo quiere responder: también espera que
 * le hablen y lo entusiasmen». La guía tenía abrir, preguntar y cerrar en 45 minutos. Desde el 2026-10-23 la sesión dura
 * una hora y tiene un tramo «Contarle» (guia.ts › `TRAMOS_DE_LA_SESION.contar`): lo que se ve de su operación, sin demo,
 * con lo que Nexus ya sabe de verdad (dónde está cada área en la escala y los casos de uso elegidos). Nada inventado:
 * ningún caso de otro cliente ni un resultado prometido.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import type { ClaveDeMarco } from "./marco";
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";

export interface QueContarle {
  /** Qué hacer en el tramo, en una frase. */
  guia: string;
  /** Lo que se le puede contar, de lo que Nexus ya sabe: el nivel de su área, un caso de uso que encaja. */
  puntos: string[];
}

/** Hasta cuántos casos de uso se nombran: más no entran en diez minutos. */
const MAX_CASOS = 2;

export function queContarle(o: {
  marco: ClaveDeMarco;
  equipo: ClaveDeEquipo | null;
  /** Las áreas en juego y dónde parece estar cada una (el chequeo del mapa). */
  areas: readonly { id: string; nombre: string; nivel: Letra | null }[];
  nombreDeNivel: (l: Letra) => string;
  /** Los casos de uso elegidos (la preventa). */
  casos: readonly { titulo: string; areaId: string | null }[];
}): QueContarle {
  const def = o.equipo ? EQUIPOS[o.equipo] : null;
  const guia = def
    ? `Cuéntale a ${def.nombre} lo que ves de su área, sin demo ni licencias: dónde está hoy y qué cambiaría al subir un escalón. Una idea concreta entusiasma más que una lista.`
    : o.marco === "cs"
      ? "Cuéntale cómo el proyecto ataca lo que te contó: une lo que dijo con lo que se vendió y con el siguiente paso del proyecto."
      : "Cuéntale lo que ves de su operación, sin demo ni licencias: dónde está y qué cambiaría al subir un escalón. Una idea concreta entusiasma más que una lista.";
  // Con un equipo que la escala mide, solo su área; si no, todas las áreas en juego que ya tienen nivel.
  const areas = o.areas.filter((a) => a.nivel && (!def?.area || a.id === def.area));
  const puntos = areas.map((a) => `${a.nombre} está hoy en ${o.nombreDeNivel(a.nivel!)}: cuéntale qué cambia en el siguiente escalón.`);
  if (o.marco !== "cs") {
    const casos = o.casos.filter((c) => !def?.area || !c.areaId || c.areaId === def.area).slice(0, MAX_CASOS);
    for (const c of casos) puntos.push(`Un caso que encaja: ${c.titulo}.`);
  }
  return { guia, puntos };
}
