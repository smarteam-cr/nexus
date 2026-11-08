/**
 * lib/exploraciones/contexto-de-la-exploracion.ts — el contexto que da la persona ANTES de que Nexus arme una guía
 * (2026-11-06, puntos 1 a 5 de la especificación de Elías). PURO.
 *
 * Desde el 2026-11-07 (Elías, segunda vuelta con Centauro; DECISIONS «La exploración desde el vendedor») el contexto vive
 * en tres niveles y nada se llena a mano:
 *   · la EMPRESA, en su ficha (Información del cliente): el desafío principal y el resultado del negocio;
 *   · el EQUIPO explorado, en las casillas de retos y metas, cada uno con su equipo (`Reto.equipo`, `Meta.equipo`);
 *   · LA COMPRA, una sola vez, en las casillas del Resumen (tiempos, presupuesto, quién decide, qué pasa si no actúa y qué
 *     cambia si lo logra), y el objetivo de la exploración en `contexto.objetivo`.
 * Nexus lo propone en UNA llamada por exploración (contexto-server.ts) y la persona lo valida. Una sesión no pide nada: con
 * quién es y cuánto dura salen de su reunión del calendario; sin ella, la guía se arma para 60 minutos. Las tarjetas de
 * «Lo que ya sabemos» (2026-11-06) y el formulario «Esta sesión» se retiraron: en producción nadie los había confirmado.
 *
 * En preventa, además, si no hubo contacto con el prospecto antes de la primera sesión, Nexus ofrece redactar un correo
 * corto o un guion de llamada de 2 a 3 minutos (contacto-previo.ts).
 */
import { valorVigente, type FichaGuardada } from "@/lib/clients/ficha";
import type { SesionPlaneada } from "./guia";
import { DURACION_POR_DEFECTO } from "./agenda";

/** El contexto de toda la exploración, como lo confirmó una persona. */
export interface ContextoDeLaExploracion {
  /** Por qué exploramos esta empresa y qué queremos lograr. */
  objetivo: string;
  /** Lo que ya sabemos del cliente, como texto libre: el formato de la primera tanda (se sigue leyendo). */
  sabemos?: string;
  /** Lo que ya sabemos, en tarjetas con su fuente (2026-11-06). Lo que falta, por averiguar. */
  tarjetas?: TarjetasDeLoQueSabemos;
  /** Quién lo confirmó y cuándo (lo pone el servidor). */
  por: string | null;
  en: string;
}

/** Una persona del cliente con la que es la sesión. */
export interface PersonaDeLaSesion {
  nombre: string;
  puesto?: string;
  area?: string;
}

export const MAX_OBJETIVO_DE_LA_EXPLORACION = 600;
export const MAX_LO_QUE_SABEMOS = 3000;
export const MAX_PERSONAS_DE_LA_SESION = 8;
export const MAX_LO_QUE_ESPERA = 300;
export const DURACIONES = [30, 45, 60, 90] as const;

/**
 * Lo que falta para que Nexus arme la guía de una sesión, en palabras. Vacío = se puede armar. Desde el 2026-11-07 (Elías:
 * «una sesión sin reunión se prepara igual») solo el objetivo de la exploración: con quién es y cuánto dura salen de la
 * reunión del calendario al asociarla (sin ella, 60 minutos), y el objetivo de la sesión lo sugiere la guía.
 */
export function faltaParaLaGuia(contexto: Pick<ContextoDeLaExploracion, "objetivo"> | undefined): string[] {
  return contexto?.objetivo.trim() ? [] : ["el objetivo de la exploración"];
}

/** Cuánto dura una sesión sin reunión asociada (2026-11-07): el valor vive en agenda.ts, uno solo para todo. */
export { DURACION_POR_DEFECTO };

/** Los minutos de una reunión del calendario, redondeados a 5 y entre 10 y 240. null si no se sabe. PURO. */
export function duracionDelEvento(inicio: string | null | undefined, fin: string | null | undefined): number | null {
  if (!inicio || !fin) return null;
  const min = (Date.parse(fin) - Date.parse(inicio)) / 60000;
  if (!Number.isFinite(min) || min <= 0) return null;
  return Math.min(240, Math.max(10, Math.round(min / 5) * 5));
}

/**
 * Cuánto dura la sesión: la de su reunión del calendario (si la alargan allá, la sesión se entera al mirar el calendario),
 * la guardada al asociarla (una reunión de HubSpot no trae el fin) o 60 minutos. PURO.
 */
export function duracionDeLaSesion(s: Pick<SesionPlaneada, "duracion" | "evento"> | null | undefined): number {
  return duracionDelEvento(s?.evento?.inicio, s?.evento?.fin) ?? s?.duracion ?? DURACION_POR_DEFECTO;
}

/**
 * Con quién es la sesión, de los invitados de su reunión (2026-11-07): solo la gente de la empresa (`esDeLaEmpresa`), con el
 * nombre que trae el calendario o, si no lo trae, el del correo («ana.perez@x.com» → «Ana Perez»). PURO.
 */
export function personasDeLaReunion(
  invitados: readonly string[],
  nombres: Readonly<Record<string, string>> | undefined,
  esDeLaEmpresa: (correo: string) => boolean,
): PersonaDeLaSesion[] {
  const delCorreo = (c: string) =>
    c
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  return invitados
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.includes("@") && esDeLaEmpresa(c))
    .map((c) => ({ nombre: (nombres?.[c]?.trim() || delCorreo(c) || c).slice(0, 120) }))
    .slice(0, MAX_PERSONAS_DE_LA_SESION);
}

/** «Ana Pérez (gerente general, Dirección), Luis Mora (jefe de ventas)». */
export function textoDeConQuien(personas: readonly PersonaDeLaSesion[] | undefined): string | null {
  const t = (personas ?? [])
    .filter((p) => p.nombre.trim())
    .map((p) => {
      const detalle = [p.puesto?.trim(), p.area?.trim()].filter(Boolean).join(", ");
      return detalle ? `${p.nombre.trim()} (${detalle})` : p.nombre.trim();
    })
    .join(", ");
  return t || null;
}

/** De dónde sale cada parte del borrador de «lo que ya sabemos». */
export interface PiezaDelBorrador {
  de: string;
  texto: string;
}

/**
 * El borrador de «lo que ya sabemos»: lo que Nexus ya tiene, en piezas con su origen, sin IA. La persona lo confirma o
 * lo completa; nada de esto se usa sin confirmar.
 */
export function borradorDeLoQueSabemos(piezas: readonly PiezaDelBorrador[], max = MAX_LO_QUE_SABEMOS): string {
  const partes: string[] = [];
  let largo = 0;
  for (const p of piezas) {
    const texto = p.texto.replace(/\s+\n/g, "\n").trim();
    if (!texto) continue;
    const parte = `${p.de}:\n${texto}`;
    if (largo + parte.length + 2 > max) {
      const queda = max - largo - p.de.length - 6;
      if (queda > 120) partes.push(`${p.de}:\n${texto.slice(0, queda).trimEnd()}…`);
      break;
    }
    partes.push(parte);
    largo += parte.length + 2;
  }
  return partes.join("\n\n");
}

/** Preventa: si hubo contacto con el prospecto antes de la primera sesión, y el mensaje que Nexus redactó si no lo hubo. */
export interface ContactoPrevio {
  hubo: boolean;
  mensaje?: { tipo: TipoDeMensajePrevio; texto: string; en: string };
}
export const TIPOS_DE_MENSAJE_PREVIO = ["correo", "llamada"] as const;
export type TipoDeMensajePrevio = (typeof TIPOS_DE_MENSAJE_PREVIO)[number];
export const MAX_MENSAJE_PREVIO = 2500;

// ── «Lo que ya sabemos» en tarjetas (2026-11-06, segunda tanda) ───────────────

/**
 * Lo que ya sabemos del cliente deja de ser un cuadro de texto libre: seis tarjetas cortas y editables, cada una con su
 * fuente. Lo que no se encuentra queda «por averiguar» y entra a la guía como algo por averiguar.
 */
export const CLAVES_DE_LO_QUE_SABEMOS = ["retos", "resultado", "plazos", "presupuesto", "decide", "siNada"] as const;
export type ClaveDeLoQueSabemos = (typeof CLAVES_DE_LO_QUE_SABEMOS)[number];

export const NOMBRE_DE_LA_TARJETA: Readonly<Record<ClaveDeLoQueSabemos, string>> = {
  retos: "Retos",
  resultado: "Resultado que buscan",
  plazos: "Plazos",
  presupuesto: "Presupuesto",
  decide: "Quién decide",
  siNada: "Qué pasa si no hacen nada",
};

export interface TarjetaDeLoQueSabemos {
  texto: string;
  /** De dónde sale («El traspaso», «Las notas de HubSpot», «La reunión del 3 nov», «Lo escribió el equipo»). */
  fuente: string;
}
export type TarjetasDeLoQueSabemos = Partial<Record<ClaveDeLoQueSabemos, TarjetaDeLoQueSabemos>>;

export const MAX_TEXTO_DE_LA_TARJETA = 400;
export const FUENTE_DEL_EQUIPO = "Lo escribió el equipo";

/**
 * Lo que Nexus propuso para el contexto y nadie confirmó todavía (contexto-server.ts), en UNA llamada por exploración:
 * las tarjetas y, desde el 2026-11-07, el objetivo de la exploración y el desafío principal (este solo si la ficha de la
 * empresa no lo tiene). `objetivo: null` = se pidió y las fuentes no daban para uno: no se vuelve a pedir. Sin la clave
 * `objetivo`, la propuesta es de antes y se pide una vez más. `desafio` se borra al validarlo (va a la ficha) o al descartarlo.
 */
export interface ContextoPropuesto {
  /** Las tarjetas de «Lo que ya sabemos» (2026-11-06). Retiradas el 2026-11-07: una propuesta vieja las trae y no se usan. */
  tarjetas: TarjetasDeLoQueSabemos;
  objetivo?: string | null;
  desafio?: string | null;
  /** El resultado del negocio (2026-11-07), solo si la ficha no lo tiene. Como `desafio`, se borra al validarlo o descartarlo. */
  resultado?: string | null;
  en: string;
}

export const MAX_DESAFIO_PROPUESTO = 500;

/**
 * ¿Hay que pedirle a Nexus la propuesta del contexto? Una vez por exploración: sin propuesta, o con una de antes del
 * 2026-11-07 (sin la clave `resultado`), que no traía el resultado del negocio ni lo de la compra.
 */
export function faltaPedirLaPropuesta(propuesto: ContextoPropuesto | null | undefined): boolean {
  return !propuesto || !("resultado" in propuesto);
}

/** Las tarjetas que siguen por averiguar (sin texto). */
export function porAveriguar(t: TarjetasDeLoQueSabemos | undefined): ClaveDeLoQueSabemos[] {
  return CLAVES_DE_LO_QUE_SABEMOS.filter((k) => !t?.[k]?.texto.trim());
}

/** Las tarjetas para el pedido de la guía: lo que se sabe, con su fuente, y lo que está por averiguar. */
export function tarjetasParaLaGuia(t: TarjetasDeLoQueSabemos | undefined): { sabido: string[]; porAveriguar: string[] } {
  return {
    sabido: CLAVES_DE_LO_QUE_SABEMOS.filter((k) => t?.[k]?.texto.trim()).map((k) => `${NOMBRE_DE_LA_TARJETA[k]}: ${t![k]!.texto} (fuente: ${t![k]!.fuente})`),
    porAveriguar: porAveriguar(t).map((k) => NOMBRE_DE_LA_TARJETA[k]),
  };
}

// ── El desafío principal en la ficha de la empresa (2026-11-07) ───────────────

/**
 * «Dolor principal» de la ficha guarda el desafío y, desde la preventa, las líneas «- Si no actúa: …» y «- Si lo logra:
 * …» (lib/exploraciones/a-la-ficha.ts). El desafío es lo demás.
 */
const LINEA_DE_LA_PREVENTA = /^\s*-\s*Si (no actúa|lo logra):/i;

/** El desafío dentro del texto de «Dolor principal»: sin las líneas de consecuencias e implicaciones de la preventa. */
export function desafioEnElDolor(dolor: string): string {
  return dolor
    .split("\n")
    .filter((l) => !LINEA_DE_LA_PREVENTA.test(l))
    .join("\n")
    .trim();
}

/** «Dolor principal» con el desafío nuevo: reemplaza el desafío y conserva las líneas de la preventa. */
export function dolorConElDesafio(dolor: string, desafio: string): string {
  return [desafio.trim(), ...dolor.split("\n").filter((l) => LINEA_DE_LA_PREVENTA.test(l))].filter(Boolean).join("\n");
}

/**
 * El desafío que muestra la exploración, de la ficha: lo propuesto si cambia el desafío (lo corrigió alguien y espera
 * que Customer Success lo confirme), si no lo confirmado. null si la ficha no lo tiene.
 */
export function desafioDeLaFichaGuardada(ficha: FichaGuardada): { texto: string; confirmado: boolean } | null {
  const confirmado = desafioEnElDolor(ficha.valores.dolorPrincipal ?? "");
  const vigente = desafioEnElDolor(valorVigente(ficha, "dolorPrincipal"));
  if (vigente && vigente !== confirmado) return { texto: vigente, confirmado: false };
  return confirmado ? { texto: confirmado, confirmado: true } : null;
}

// ── El resultado del negocio en la ficha de la empresa (2026-11-07) ───────────

/**
 * La ficha no acepta nada de la preventa en «Resultados que persigue»: sale de los resultados confirmados de cada proyecto
 * (lib/clients/ficha.ts › `deLosResultados`). Por eso el resultado del negocio que valida la preventa va, como ya iban sus
 * metas (a-la-ficha.ts), a «Retos estratégicos», en su propia línea: «- Resultado que buscan: …».
 */
const LINEA_DEL_RESULTADO = /^\s*-\s*Resultado que buscan:\s*/i;

/** El resultado del negocio dentro de «Retos estratégicos». Vacío si no está. */
export function resultadoEnLosRetos(retos: string): string {
  const l = retos.split("\n").find((x) => LINEA_DEL_RESULTADO.test(x));
  return l ? l.replace(LINEA_DEL_RESULTADO, "").trim() : "";
}

/** «Retos estratégicos» con el resultado nuevo: reemplaza su línea (o la suma al final) y conserva lo demás. */
export function retosConElResultado(retos: string, resultado: string): string {
  const resto = retos.split("\n").filter((l) => !LINEA_DEL_RESULTADO.test(l));
  return [...resto, `- Resultado que buscan: ${resultado.trim()}`].join("\n").trim();
}

/**
 * El resultado del negocio que muestra la exploración, de la ficha: los resultados confirmados de sus proyectos si los hay
 * (`deLosProyectos`: no se editan desde acá); si no, la línea de «Retos estratégicos», propuesta o confirmada. null si no.
 */
export function resultadoDeLaFichaGuardada(ficha: FichaGuardada): { texto: string; confirmado: boolean; deLosProyectos?: true } | null {
  const deLosProyectos = (ficha.valores.resultadosQuePersigue ?? "").trim();
  if (deLosProyectos) return { texto: deLosProyectos, confirmado: true, deLosProyectos: true };
  const confirmado = resultadoEnLosRetos(ficha.valores.retosEstrategicos ?? "");
  const vigente = resultadoEnLosRetos(valorVigente(ficha, "retosEstrategicos"));
  if (vigente && vigente !== confirmado) return { texto: vigente, confirmado: false };
  return confirmado ? { texto: confirmado, confirmado: true } : null;
}
