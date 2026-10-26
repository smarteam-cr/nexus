/**
 * lib/analizador-venta/conjunto.ts — LA LECTURA DE CONJUNTO DE UN PROSPECTO (S5, 2026-10-27): cómo se lo ha trabajado a lo
 * largo de todas sus sesiones y qué falta diagnosticar antes de proponer. PURO y client-safe. Sin IA: junta lo que ya dijeron
 * los análisis de cada sesión (cada uno con sus citas) y lo cruza con la escala de la preventa.
 *
 * El norte (Elías, 26 oct): Ventas explora poco y va directo a la solución; queremos diagnosticar a fondo antes de proponer.
 * Por eso lo que importa arriba de la pieza «Análisis» es lo que falta:
 *   · las dimensiones de las áreas en juego que ninguna sesión exploró a fondo y que la preventa todavía no tiene confirmadas
 *     con evidencia (las que solo se tocaron van aparte: ya hay por dónde entrar);
 *   · las etapas del proceso consultivo que no se hicieron en ninguna sesión.
 * Lo de cada sesión cuenta aunque nadie lo haya confirmado todavía (es para preparar la próxima, no para evaluar): la
 * pantalla dice cuántas están confirmadas.
 */
import { paraComparar, type ResultadoDelAnalisis } from "./analisis";
import { PROCESO_CONSULTIVO, type EtapaDelProceso } from "./criterio";
import type { QuienHablo } from "./quien-hablo";
import { siguientePasoConFecha } from "./revision";
import { quienHabloSirve } from "./tendencia";

export interface SesionParaElConjunto {
  conTranscripcion: boolean;
  quienHablo: QuienHablo | null;
  /** El análisis vigente (de la empresa dueña), si hay. */
  resultado: ResultadoDelAnalisis | null;
  confirmado: boolean;
}

/** Una dimensión de las áreas en juego, con si la preventa ya la tiene confirmada con evidencia. */
export interface DimensionEnJuego {
  nombre: string;
  area: string;
  diagnosticada: boolean;
}

export interface LecturaDeConjunto {
  reuniones: number;
  conTranscripcion: number;
  analizadas: number;
  confirmadas: number;
  /** Cuánto habló el cliente, en promedio, donde se sabe (Nexus reconoció a alguien del equipo hablando). null = en ninguna. */
  clienteHablo: number | null;
  /** De las analizadas: cuántas fueron muy, en parte o poco consultivas. */
  consultiva: { mucho: number; en_parte: number; poco: number };
  /** De las analizadas: en qué posición quedó el vendedor. */
  posicion: { asesor: number; mixto: number; vendedor_de_licencias: number };
  /** De las analizadas: cuántas dejaron un siguiente paso con fecha. */
  conSiguientePasoConFecha: number;
  /** Una o dos frases, para arriba de la pieza. */
  frase: string;
  falta: {
    /** Las dimensiones que nadie exploró ni tocó y la preventa no tiene confirmadas. */
    sinTocar: { nombre: string; area: string }[];
    /** Se tocaron en alguna sesión, sin explorarse a fondo. */
    soloTocadas: { nombre: string; area: string }[];
    /** Las etapas del proceso consultivo que no se hicieron en ninguna sesión analizada. */
    etapas: { id: EtapaDelProceso; nombre: string }[];
  };
  exploradas: string[];
}

const contar = <K extends string>(claves: readonly K[], valores: (string | null | undefined)[]) =>
  Object.fromEntries(claves.map((k) => [k, valores.filter((v) => v === k).length])) as Record<K, number>;

export function lecturaDeConjunto(sesiones: readonly SesionParaElConjunto[], enJuego: readonly DimensionEnJuego[]): LecturaDeConjunto {
  const analizadas = sesiones.filter((s) => s.resultado);
  const juicios = analizadas.flatMap((s) => s.resultado!.juicios);
  const de = (p: string) => juicios.filter((j) => j.punto === p);
  const conHabla = sesiones.filter((s) => quienHabloSirve(s.quienHablo));
  const clienteHablo = conHabla.length ? Math.round(conHabla.reduce((t, s) => t + s.quienHablo!.cliente.porcentaje, 0) / conHabla.length) : null;
  const consultiva = contar(["mucho", "en_parte", "poco"] as const, analizadas.map((s) => s.resultado!.juicios.find((j) => j.punto === "consultiva")?.valor));
  const posicion = contar(["asesor", "mixto", "vendedor_de_licencias"] as const, analizadas.map((s) => s.resultado!.juicios.find((j) => j.punto === "posicion")?.valor));
  const conSiguientePasoConFecha = analizadas.filter((s) => siguientePasoConFecha(s.resultado!.juicios.find((j) => j.punto === "siguiente_paso") ?? null)).length;

  // Por nombre, sin tildes ni mayúsculas: el modelo nombra la dimensión como se la pasó el material.
  const exploracion = de("exploracion").filter((j) => j.dimension);
  const exploradas = new Set(exploracion.filter((j) => j.valor === "explorado").map((j) => paraComparar(j.dimension!)));
  const tocadas = new Set(exploracion.filter((j) => j.valor === "tocado").map((j) => paraComparar(j.dimension!)));
  const pendientes = enJuego.filter((d) => !d.diagnosticada && !exploradas.has(paraComparar(d.nombre)));
  const etapasHechas = new Set(de("etapa").filter((j) => j.valor === "se_hizo").map((j) => j.etapa));

  const falta = {
    sinTocar: pendientes.filter((d) => !tocadas.has(paraComparar(d.nombre))).map(({ nombre, area }) => ({ nombre, area })),
    soloTocadas: pendientes.filter((d) => tocadas.has(paraComparar(d.nombre))).map(({ nombre, area }) => ({ nombre, area })),
    etapas: analizadas.length ? PROCESO_CONSULTIVO.filter((e) => !etapasHechas.has(e.id)).map((e) => ({ id: e.id, nombre: e.nombre })) : [],
  };

  return {
    reuniones: sesiones.length,
    conTranscripcion: sesiones.filter((s) => s.conTranscripcion).length,
    analizadas: analizadas.length,
    confirmadas: analizadas.filter((s) => s.confirmado).length,
    clienteHablo,
    consultiva,
    posicion,
    conSiguientePasoConFecha,
    frase: fraseDelConjunto({
      analizadas: analizadas.length,
      reuniones: sesiones.length,
      clienteHablo,
      consultiva,
      posicion,
      // Sin áreas en juego no se sabe qué falta: no se dice «no falta nada».
      faltan: enJuego.length ? falta.sinTocar.length + falta.soloTocadas.length : null,
    }),
    falta,
    exploradas: [...new Set(exploracion.filter((j) => j.valor === "explorado").map((j) => j.dimension!))],
  };
}

/** La frase de arriba: cómo se ha trabajado, en palabras, sin puntaje. */
export function fraseDelConjunto(o: {
  analizadas: number;
  reuniones: number;
  clienteHablo: number | null;
  consultiva: LecturaDeConjunto["consultiva"];
  posicion: LecturaDeConjunto["posicion"];
  /** null = no se sabe (la preventa no tiene áreas en juego). */
  faltan: number | null;
}): string {
  if (!o.reuniones) return "Todavía no hay reuniones de venta con esta empresa.";
  if (!o.analizadas) return `${o.reuniones === 1 ? "Hay una reunión" : `Hay ${o.reuniones} reuniones`} y ninguna analizada: analiza las que tienen transcripción para ver cómo se ha trabajado.`;
  const partes: string[] = [];
  const { mucho, en_parte, poco } = o.consultiva;
  if (poco > mucho && poco >= en_parte) partes.push("Hasta ahora se ha ido más a la solución que al diagnóstico");
  else if (mucho > poco && mucho >= en_parte) partes.push("Hasta ahora se ha trabajado de forma consultiva");
  else partes.push("Hasta ahora se ha trabajado en parte de forma consultiva");
  const { asesor, vendedor_de_licencias } = o.posicion;
  if (vendedor_de_licencias > asesor) partes[0] += ", con el vendedor más en el papel de vendedor de licencias que de asesor";
  else if (asesor > vendedor_de_licencias) partes[0] += ", con el vendedor en el papel de asesor";
  if (o.clienteHablo !== null) partes.push(o.clienteHablo >= 50 ? `El cliente habló el ${o.clienteHablo} % en promedio` : `El cliente habló solo el ${o.clienteHablo} % en promedio`);
  partes.push(
    o.faltan === null
      ? "Sin áreas en juego en la preventa no se sabe qué falta diagnosticar"
      : o.faltan
        ? `Antes de proponer faltan ${o.faltan === 1 ? "una dimensión" : `${o.faltan} dimensiones`} por diagnosticar`
        : "No quedan dimensiones del área en juego sin diagnosticar",
  );

  return partes.join(". ") + ".";
}
