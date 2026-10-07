/**
 * lib/recorridos/tipos.ts — la forma de un recorrido guiado.
 *
 * Client-safe y sin dependencias: lo leen el registro, el proveedor del navegador y los tests.
 * El contenido vive en el REPO (registro.ts), no en la base: viaja con el deploy y se revisa
 * como código, igual que la Documentación derivada (DECISIONS §Recorridos).
 */
import type { TeamRole } from "@prisma/client";

/** De qué lado del elemento sale el globo. Si no hay lugar, la librería lo da vuelta sola. */
export type LadoDelGlobo =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

/**
 * Lo que un paso le pide a la pantalla antes de mostrarse (elegir una dimensión en la rueda, cambiar
 * de vista). Viaja como un evento del navegador: la pantalla que sabe hacerlo lo escucha. Una acción
 * elige algo explícito, nunca alterna: repetirla (al volver con «Anterior») deja lo mismo elegido.
 */
export interface AccionDelRecorrido {
  evento: string;
  valor?: string;
}

/** El nombre del evento con que el recorrido le pide una acción a la pantalla. */
export const EVENTO_DEL_RECORRIDO = "nexus:recorrido";

export interface PasoDelRecorrido {
  /**
   * El `data-recorrido` del elemento que explica el paso. Si no está en la pantalla (un botón que
   * el permiso esconde, el panel oculto, una propuesta que no existe), el paso NO sale: un
   * recorrido nunca señala algo que no está. El test exige que el ancla exista en el código.
   */
  ancla: string;
  titulo: string;
  /** Una o dos frases, en tuteo. Lo que se hace con eso, no cómo está construido. */
  texto: string;
  /** Solo para estos roles. Sin `roles` = todos los que ven el recorrido. */
  roles?: readonly TeamRole[];
  /** Para lo que es más alto que media pantalla, `top`: así la librería deja lugar arriba para el globo. */
  lado?: LadoDelGlobo;
  /**
   * Se pide antes de mostrar el paso; el elemento se busca después de hacerla. Varias van en orden
   * (abrir una pieza y, ya abierta, elegir el momento de la sesión).
   */
  accion?: AccionDelRecorrido | readonly AccionDelRecorrido[];
  /**
   * Cuánto se espera, en ms, a que la acción pinte el elemento. Por defecto, lo que tarda la pantalla en
   * cambiar algo que ya tiene. Más para una acción que vuelve a pedir la página (las pestañas de Feedback).
   */
  espera?: number;
}

/** Las acciones de un paso, siempre como lista. */
export function accionesDelPaso(p: Pick<PasoDelRecorrido, "accion">): readonly AccionDelRecorrido[] {
  if (!p.accion) return [];
  return Array.isArray(p.accion) ? (p.accion as readonly AccionDelRecorrido[]) : [p.accion as AccionDelRecorrido];
}

export interface Recorrido {
  /** Identidad estable: va en la cookie de lo visto y en la prop `recorrido` de cada cabecera. */
  id: string;
  /**
   * Sube cuando la pantalla cambia lo suficiente como para volver a mostrarlo. Quien lo vio en
   * una versión anterior ve otra vez el punto azul y «Cambió» en su lista.
   */
  version: number;
  /** El nombre en la lista («Ficha del cliente»). */
  titulo: string;
  /** Una línea para la lista: qué vas a ver. */
  descripcion: string;
  /** El rótulo del globo («Recorrido · Ficha del cliente»). */
  rotulo: string;
  /** La invitación de la primera vez (`INVITAR_LA_PRIMERA_VEZ`). Sin número de pasos: depende de lo que haya a la vista. */
  invitacion: { titulo: string; texto: string };
  /** La pantalla donde corre. Si la pantalla actual no calza, «Ver» lleva a `irA` y arranca al llegar. */
  ruta: RegExp;
  /**
   * Para las piezas de un lienzo que comparten dirección (el cronograma y la información del
   * cliente viven en `/clients/[id]`):
   * el recorrido vale solo mientras la pieza lo declara con `usePantallaDelRecorrido(id)`. El botón
   * de la cabecera toma ese recorrido en vez del de la ficha.
   */
  porPantalla?: boolean;
  /** Lo que se le pide a la pantalla al arrancar, antes de mirar qué pasos hay (por ejemplo, abrir la vista del mapa). */
  alArrancar?: readonly AccionDelRecorrido[];
  /** Una dirección real que calza con `ruta`, para el test. */
  ejemplo: string;
  /** A dónde lleva «Ver» desde otra pantalla, y qué se le dice a la persona al llegar. */
  irA: { href: string; aviso?: string };
  grupo: GrupoDeRecorridos;
  /** Quiénes lo ven. "todos" = todo el equipo interno. */
  roles: readonly TeamRole[] | "todos";
  pasos: readonly PasoDelRecorrido[];
}

export type GrupoDeRecorridos = "empieza" | "clientes" | "ventas" | "finanzas" | "marketing" | "direccion" | "equipo";

export const NOMBRE_DEL_GRUPO: Record<GrupoDeRecorridos, string> = {
  empieza: "Empieza aquí",
  clientes: "Clientes y proyectos",
  ventas: "Ventas",
  finanzas: "Finanzas",
  marketing: "Marketing",
  direccion: "Dirección",
  equipo: "Para todo el equipo",
};

export const ORDEN_DE_GRUPOS: readonly GrupoDeRecorridos[] = ["empieza", "clientes", "ventas", "finanzas", "marketing", "direccion", "equipo"];
