/**
 * lib/exploraciones/contexto-de-la-exploracion.ts — el contexto que da la persona ANTES de que Nexus arme una guía
 * (2026-11-06, puntos 1 a 5 de la especificación de Elías). PURO.
 *
 * Nexus ya no planifica por defecto: antes de armar cualquier guía pide
 *   · el contexto de TODA la exploración: por qué exploramos esta empresa y qué queremos lograr, y lo que ya sabemos del
 *     cliente (en preventa, cómo llegó; en un cliente, lo que entregó ventas en el traspaso). Si Nexus ya tiene algo (el
 *     traspaso, notas de HubSpot, lo que agregó el equipo, sesiones leídas), lo muestra cargado para confirmar o completar;
 *   · el contexto de CADA sesión: con quién es (nombre, puesto y área), qué espera el cliente de la reunión, el objetivo y
 *     cuánto dura. El nombre de la sesión y su reunión ya existían.
 * Nexus no impone cuántas sesiones ni cada cuánto.
 *
 * En preventa, además, si no hubo contacto con el prospecto antes de la primera sesión, Nexus ofrece redactar un correo
 * corto o un guion de llamada de 2 a 3 minutos (contacto-previo.ts).
 */
import { valorVigente, type FichaGuardada } from "@/lib/clients/ficha";
import type { SesionPlaneada } from "./guia";

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

/** Lo que falta para que Nexus arme la guía de una sesión, en palabras. Vacío = se puede armar. */
export function faltaParaLaGuia(contexto: ContextoDeLaExploracion | undefined, sesion: Pick<SesionPlaneada, "objetivo" | "conQuien"> | null | undefined): string[] {
  const falta: string[] = [];
  if (!contexto?.objetivo.trim()) falta.push("el objetivo de la exploración");
  if (!sesion?.conQuien?.some((p) => p.nombre.trim())) falta.push("con quién es la sesión");
  if (!sesion?.objetivo?.trim()) falta.push("el objetivo de la sesión");
  return falta;
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
  tarjetas: TarjetasDeLoQueSabemos;
  objetivo?: string | null;
  desafio?: string | null;
  en: string;
}

export const MAX_DESAFIO_PROPUESTO = 500;

/** ¿Hay que pedirle a Nexus el objetivo? Sin objetivo confirmado y sin haberlo pedido nunca (una vez por exploración). */
export function faltaPedirElObjetivo(contexto: Pick<ContextoDeLaExploracion, "objetivo"> | undefined, propuesto: ContextoPropuesto | null | undefined): boolean {
  if (contexto?.objetivo.trim()) return false;
  return !propuesto || !("objetivo" in propuesto);
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
