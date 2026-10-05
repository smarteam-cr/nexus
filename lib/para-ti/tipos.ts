/**
 * lib/para-ti/tipos.ts — las formas de «Para ti» (2026-10-04). CLIENT-SAFE.
 *
 * Dos clases de cosas, y no se mezclan:
 * · PENDIENTE: algo que te TOCA HACER. Se calcula del estado cada vez que se mira y desaparece solo cuando se resuelve:
 *   no hay que «marcarlo leído». Sale de las reglas que ya usa cada módulo (lib/para-ti/fuentes).
 * · AVISO: algo que PASÓ (el cliente aprobó, te devolvieron un pago). Se guarda en la tabla `Aviso`, se marca leído.
 */
import type { ClaveDeFrente } from "./frentes";

/** Cuándo conviene hacerlo. «luego» va plegado («Cuando puedas»). */
export type Cuando = "hoy" | "semana" | "luego";

export interface Pendiente {
  /** Única en la lista: `<fuente>:<id del dato>`. */
  clave: string;
  /** La clave de la fuente que lo midió. */
  fuente: string;
  cuando: Cuando;
  /** Lo dejó un agente y espera que una persona decida: va arriba, en azul y con la chispa. */
  delAgente: boolean;
  titulo: string;
  detalle: string;
  /** Dónde y de quién: «Cronograma · Wherex». */
  meta: string;
  /** La plata que mueve, ya con su moneda. */
  plata?: string;
  accion: string;
  href: string;
  /** Algo FALLÓ (rojo): una copia automática, un proceso del servidor. */
  error?: boolean;
  /** Desde cuándo espera (ISO): ordena dentro del bloque y dice «lo que más espera» en «Del equipo». */
  desde?: string | null;
}

/** Lo que devuelve una fuente al medirse para una persona. */
export interface ResultadoDeFuente {
  fuente: string;
  /** El texto de «También revisé y está al día» cuando no hay nada. */
  alDia: string;
  ok: boolean;
  items: Pendiente[];
}

export interface ParaTi {
  agente: Pendiente[];
  hoy: Pendiente[];
  semana: Pendiente[];
  luego: Pendiente[];
  /** Lo que se revisó y no tiene nada pendiente. */
  alDia: string[];
  /** Lo que no se pudo medir esta vez (se dice, no se calla). */
  sinMedir: string[];
}

export interface AvisoVisto {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  href: string;
  /** Por qué te llegó (el frente) o null si era personal. */
  frente: ClaveDeFrente | null;
  creadoAt: string;
  nuevo: boolean;
  /** Una buena noticia (el cliente aprobó): lleva ✓ en verde. */
  bueno: boolean;
}

/** Lo que pide el menú cada minuto y medio. */
export interface CuentaDeParaTi {
  /** El número del menú: lo de hoy, lo que dejó el agente y los avisos sin leer. */
  cuenta: number;
  avisosNuevos: number;
  /** El aviso sin leer más nuevo, para la notificación del navegador. */
  ultimoAviso: { id: string; titulo: string; href: string } | null;
}

/** Una fila de «Del equipo»: una persona o, para dirección, un área. */
export interface FilaDelEquipo {
  clave: string;
  quien: string;
  sub: string;
  hoy: number;
  semana: number;
  /** Lo que más espera, ya dicho; null = al día. Vacío cuando la persona que mira no puede ver esas cuentas. */
  espera: string | null;
  sinDueno?: boolean;
  esTu?: boolean;
  href?: string;
}

export interface DelEquipo {
  porArea: boolean;
  /** true = quien mira no ve el detalle (solo los números). */
  soloNumeros: boolean;
  filas: FilaDelEquipo[];
}
