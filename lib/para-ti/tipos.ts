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
   * El siguiente paso que sugiere Nexus para una cuenta con reunión esta semana y sin acción: la reunión misma
   * (lib/mi-dia/servicio.ts › siguientePasoDeLaReunion). Se usa o se descarta ahí mismo.
   */
  siguientePaso?: SiguientePasoDelPendiente;
}

/** Lo que necesita la pantalla para «Usar» o «Descartar» la sugerencia del siguiente paso. */
export interface SiguientePasoDelPendiente {
  eventoId: string;
  titulo: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  /** «hoy», «mañana» o «el jue 22». */
  cuando: string;
  /** Quien lleva la cuenta (de su calendario sale la reunión). null = quien mira. */
  llevaEmail: string | null;
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
  /** «Lo que importa hoy» (fase 1.1): como mucho 5, una por cuenta, de lo de hoy y lo que dejó un agente. */
  importa: Pendiente[];
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
