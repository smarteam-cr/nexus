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
  /**
   * Cuando el ítem junta cosas de VARIOS lugares (alertas de distintas cuentas), cada lugar con su enlace directo. El
   * botón (`href`) lleva al primero. Sin esto, la única salida sería un índice donde quizá no aparece lo que se avisa.
   */
  enlaces?: EnlaceDePendiente[];
  /** Algo FALLÓ (rojo): una copia automática, un proceso del servidor. */
  error?: boolean;
  /** Desde cuándo espera (ISO): ordena dentro del bloque. */
  desde?: string | null;
  /** Cuánto importa (lib/para-ti/importa.ts). Sin esto, el de su fuente. */
  peso?: number;
  /** La cuenta de la que es. Sin esto, la del enlace (`/clients/<id>`); null = no es de una cuenta. */
  clientId?: string | null;
  /** Solo en «Lo que importa hoy»: lo demás de esta cuenta («+N en esta cuenta»). */
  otrosEnLaCuenta?: Pendiente[];
  /**
   * El grupo dentro de un bloque del inicio de Customer Success: a quien lidera, el CSE que lleva la cuenta
   * (lib/para-ti/foco.ts). Sin esto, no se agrupa.
   */
  grupo?: string;
}

/** Uno de los lugares de un pendiente que junta varios: «Wherex (2)» → la ficha de Wherex. */
export interface EnlaceDePendiente {
  texto: string;
  href: string;
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
  /**
   * «Lo que importa hoy» (fase 1.1): como mucho 5, una por cuenta, de lo de hoy y lo que dejó un agente. En el inicio de
   * Customer Success (`foco`), lo que muestran sus tres bloques, en orden.
   */
  importa: Pendiente[];
  /** Solo CSE y CSL: los tres bloques de lo que más importa hoy de su cartera (lib/para-ti/foco.ts). */
  foco?: FocoDelDia;
  /** Lo de hoy (y del agente) que no entró en las cinco. */
  tambien: Pendiente[];
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
  /** Alguien te escribió (una respuesta, un comentario): sin leer, va en ámbar. */
  mensaje: boolean;
}

/** Lo que pide el menú cada minuto y medio. */
export interface CuentaDeParaTi {
  /** El número del menú: «Lo que importa hoy» (como mucho 5) y los avisos sin leer. */
  cuenta: number;
  avisosNuevos: number;
  /** El aviso sin leer más nuevo, para la notificación del navegador. `creadoAt` (ISO): se notifica solo si es posterior
   *  al último que la pestaña ya vio (`debeNotificar`, lib/para-ti/armar.ts). */
  ultimoAviso: { id: string; titulo: string; href: string; creadoAt: string } | null;
}

/** Los tres bloques del inicio de Customer Success, en orden (lib/para-ti/foco.ts). */
export type ClaveDeBloque = "reuniones" | "sin-paso" | "sin-seguimiento";

export interface BloqueDelFoco {
  clave: ClaveDeBloque;
  titulo: string;
  /** Una línea: qué es y qué hacer. */
  ayuda: string;
  /** Lo que se ve (con su tope). */
  items: Pendiente[];
  /** Cuántos había en total (lo que no entra va a «También para hoy»). */
  total: number;
  /** El texto cuando está vacío. */
  vacio: string;
  /** «Ver las N en la cartera» (el bloque de cuentas sin siguiente paso). */
  verTodas?: { texto: string; href: string } | null;
  /** Dónde está lo que no entró: en «También para hoy» o (las reuniones) en la agenda. null = entró todo. */
  sobranEn?: "tambien" | "agenda" | null;
}

export interface FocoDelDia {
  /** CSE: lo suyo; CSL: toda la cartera, agrupado por CSE (`Pendiente.grupo`). */
  modo: "cse" | "csl";
  bloques: BloqueDelFoco[];
}
