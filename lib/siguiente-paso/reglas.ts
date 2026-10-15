/**
 * lib/siguiente-paso/reglas.ts — las reglas del siguiente paso por equipo (2026-10-15, etapa 2 de docs/mi-dia-plan.md).
 * PURO y client-safe: lo leen la pantalla, la escritura en HubSpot y la copia que vuelve de HubSpot.
 *
 * Decisiones de Elías (2026-10-14):
 *   · un siguiente paso por equipo (Ventas, CS, Dev) sobre una empresa, un negocio o un proyecto, con qué, fecha y
 *     responsable. Marketing no lleva el suyo;
 *   · el de la empresa es el de la cuenta entera: sirve cuando hay varios proyectos y para retomar una cuenta sin nada
 *     abierto (un excliente);
 *   · cada persona escribe el de su equipo. `hs_next_step` de HubSpot solo se ofrece como sugerencia.
 */
import { EQUIPOS_DEL_SIGUIENTE_PASO, nombresDelEquipo, type EquipoDelSiguientePaso } from "./propiedades";

export type ObjetoDelPaso = "empresa" | "negocio" | "proyecto";
export type FuenteDelPaso = "persona" | "chat" | "reunion" | "hubspot";
export type EstadoDelPaso = "vigente" | "hecho" | "reemplazado";
export type EstadoEnHubspot = "pendiente" | "escrito" | "error" | "sin_hubspot";

export const OBJETOS_DEL_PASO: readonly ObjetoDelPaso[] = ["empresa", "negocio", "proyecto"];

/** Dónde vive cada objeto en HubSpot. */
export const OBJETO_EN_HUBSPOT: Record<ObjetoDelPaso, "companies" | "deals" | "0-970"> = {
  empresa: "companies",
  negocio: "deals",
  proyecto: "0-970",
};

export const NOMBRE_DEL_OBJETO: Record<ObjetoDelPaso, string> = {
  empresa: "La cuenta",
  negocio: "Negocio",
  proyecto: "Proyecto",
};

export const NOMBRE_DEL_EQUIPO: Record<EquipoDelSiguientePaso, string> = Object.fromEntries(
  EQUIPOS_DEL_SIGUIENTE_PASO.map((e) => [e.clave, e.etiqueta]),
) as Record<EquipoDelSiguientePaso, string>;

/** Un siguiente paso como lo ve la pantalla. */
export interface SiguientePasoVisto {
  id: string;
  objeto: ObjetoDelPaso;
  objetoId: string;
  equipo: EquipoDelSiguientePaso;
  que: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  responsableEmail: string | null;
  responsableNombre: string | null;
  escritoPor: string;
  escritoPorNombre: string | null;
  fuente: FuenteDelPaso;
  /** ISO. */
  creadoAt: string;
  hubspotEstado: EstadoEnHubspot;
  hubspotError: string | null;
}

/** Un objeto de la cuenta que puede llevar siguiente paso. */
export interface ObjetoDeLaCuenta {
  objeto: ObjetoDelPaso;
  objetoId: string;
  nombre: string;
  /** El pipeline y la etapa de un negocio. */
  detalle: string | null;
  hubspotUrl: string | null;
  /** `hs_next_step` del negocio: se ofrece como sugerencia, nunca se escribe. */
  sugerencia: string | null;
}

export interface PasosDeLaCuenta {
  objetos: ObjetoDeLaCuenta[];
  pasos: SiguientePasoVisto[];
  /** false = falta aplicar scripts/sql/2026-10-15-siguiente-paso.sql. */
  disponible: boolean;
}

/**
 * Los equipos cuyo siguiente paso puede escribir una persona: el suyo. Dirección escribe cualquiera (Marco vende).
 * La CSL y el CSE escriben el de CS. Marketing, Finanzas y el resto, ninguno.
 */
export function equiposQueEscribe(rol: string | null | undefined): EquipoDelSiguientePaso[] {
  switch (rol) {
    case "SUPER_ADMIN":
      return ["ventas", "cs", "dev"];
    case "VENTAS":
      return ["ventas"];
    case "CSE":
    case "CSL":
      return ["cs"];
    case "DEV":
      return ["dev"];
    default:
      return [];
  }
}

/** El equipo con el que abre el diálogo: el de la persona; dirección, Ventas. */
export function equipoDelRol(rol: string | null | undefined): EquipoDelSiguientePaso | null {
  return equiposQueEscribe(rol)[0] ?? null;
}

const DIA_MS = 86_400_000;

/** Días desde hoy hasta la fecha (negativo = ya pasó). Las dos son `YYYY-MM-DD`. */
export function diasHastaElPaso(fecha: string, hoyISO: string): number {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoyISO}T00:00:00Z`)) / DIA_MS);
}

/** Un paso con la fecha pasada es una señal: hay que hacerlo, darlo por hecho o definir el siguiente. */
export function estaVencido(paso: Pick<SiguientePasoVisto, "fecha">, hoyISO: string): boolean {
  return !!paso.fecha && diasHastaElPaso(paso.fecha, hoyISO) < 0;
}

/** Lo que dice el paso cuando se lee rápido: «Enviar la propuesta · 20 oct · Andrés». */
export function resumenDelPaso(p: Pick<SiguientePasoVisto, "que" | "fecha" | "responsableNombre" | "responsableEmail">, fechaCorta: (f: string) => string): string {
  const partes = [p.que.trim()];
  if (p.fecha) partes.push(fechaCorta(p.fecha));
  const quien = p.responsableNombre ?? p.responsableEmail;
  if (quien) partes.push(quien.split(" ")[0]!);
  return partes.join(" · ");
}

/* ── HubSpot ─────────────────────────────────────────────────────────────────────────── */

/** Lo que se le manda a HubSpot. `null` = borrar (el paso se dio por hecho). */
export function valoresParaHubspot(
  equipo: EquipoDelSiguientePaso,
  paso: { que: string; fecha: string | null; responsableOwnerId: string | null } | null,
): Record<string, string> {
  const n = nombresDelEquipo(equipo);
  if (!paso) return { [n.que]: "", [n.fecha]: "", [n.responsable]: "" };
  return {
    [n.que]: paso.que.trim(),
    // Una propiedad de tipo fecha acepta el día como `YYYY-MM-DD`.
    [n.fecha]: paso.fecha ?? "",
    [n.responsable]: paso.responsableOwnerId ?? "",
  };
}

/** Todas las propiedades del siguiente paso, para pedirlas en una lectura de HubSpot. */
export function propiedadesALeer(): string[] {
  return EQUIPOS_DEL_SIGUIENTE_PASO.flatMap(({ clave }) => Object.values(nombresDelEquipo(clave)));
}

export interface PasoEnHubspot {
  que: string;
  fecha: string | null;
  responsableOwnerId: string | null;
}

/** El paso de un equipo como está en HubSpot. null = vacío. */
export function leerDeHubspot(equipo: EquipoDelSiguientePaso, props: Record<string, string | null | undefined>): PasoEnHubspot | null {
  const n = nombresDelEquipo(equipo);
  const que = (props[n.que] ?? "").trim();
  if (!que) return null;
  const crudo = (props[n.fecha] ?? "").trim();
  // HubSpot devuelve una fecha como `YYYY-MM-DD` o como un instante a la medianoche UTC.
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(crudo)
    ? crudo.slice(0, 10)
    : /^\d{10,}$/.test(crudo)
      ? new Date(Number(crudo)).toISOString().slice(0, 10)
      : null;
  return { que, fecha, responsableOwnerId: (props[n.responsable] ?? "").trim() || null };
}

const normalizar = (s: string) => s.replace(/\s+/g, " ").trim();

export function mismoPaso(a: PasoEnHubspot, b: PasoEnHubspot): boolean {
  return normalizar(a.que) === normalizar(b.que) && (a.fecha ?? null) === (b.fecha ?? null) && (a.responsableOwnerId ?? null) === (b.responsableOwnerId ?? null);
}

export type DecisionDeImportacion = "nada" | "crear" | "cerrar";

/** El último paso de Nexus de un objeto y equipo: el vigente, o el último que se dio por hecho. */
export interface UltimoPaso extends PasoEnHubspot {
  estado: "vigente" | "hecho";
  hubspotEstado: EstadoEnHubspot;
  hubspotEscritoAt: Date | null;
  creadoAt: Date;
  cerradoAt: Date | null;
}

/**
 * Lo que vuelve de HubSpot (alguien lo cambió allá) frente al último paso de Nexus.
 *   · Si Nexus todavía no escribió lo suyo en HubSpot (el paso, o borrarlo al darlo por hecho), o lo escribió después de
 *     que se leyó HubSpot, gana Nexus: la lectura es vieja y Nexus lo reintenta.
 *   · Igual a lo de Nexus: nada.
 *   · Distinto: alguien lo cambió en HubSpot → un paso nuevo con fuente «hubspot».
 *   · Vacío en HubSpot con un vigente en Nexus: alguien lo borró allá → se da por hecho.
 */
export function decidirImportacion(ultimo: UltimoPaso | null, enHubspot: PasoEnHubspot | null, leidoAt: Date): DecisionDeImportacion {
  if (!ultimo) return enHubspot ? "crear" : "nada";
  if (ultimo.hubspotEstado !== "escrito") return "nada";
  const despues = (d: Date | null) => !!d && d > leidoAt;
  if (despues(ultimo.creadoAt) || despues(ultimo.cerradoAt) || despues(ultimo.hubspotEscritoAt)) return "nada";
  if (ultimo.estado === "hecho") return enHubspot ? "crear" : "nada";
  if (!enHubspot) return "cerrar";
  return mismoPaso(ultimo, enHubspot) ? "nada" : "crear";
}

/** Cuántas veces se reintenta escribir en HubSpot antes de dejarlo en error para una persona. */
export const MAX_INTENTOS_EN_HUBSPOT = 5;
