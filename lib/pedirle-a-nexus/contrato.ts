/**
 * lib/pedirle-a-nexus/contrato.ts — EL CONTRATO DE UN DOCUMENTO para «✨ Pedirle a Nexus» (etapa 3 del plan maestro de
 * «Hablar con Nexus», punto 4.4; docs/plan-maestro-hablar-con-nexus.md). PURO y client-safe: las formas que comparten la
 * pantalla, las rutas y, después, la herramienta `proponer_cambio` del conector de Claude (docs/plan-conector-claude.md).
 *
 * Un pedido, una propuesta (la versión sin cajón, aprobada por Elías el 23 nov): la persona escribe qué quiere («cambia el
 * título», «agrega esta parte»), Nexus propone por PIEZA con el antes y el después, y la persona aplica una a una o todas.
 * Nada se publica: el cliente sigue viendo lo publicado hasta que una persona publique.
 *
 * Cada documento que trabaja con Nexus llena el mismo contrato (`ContratoDeDocumento`, servidor) y `registro.test.ts` vigila
 * que esté completo:
 *   1. quién es: a qué empresa y a qué preventa o proyecto pertenece, verificado por el servidor (nunca lo elige el modelo);
 *   2. qué se lee: el documento como lo ve el cliente, en piezas con nombre (`PiezaDelDocumento`);
 *   3. qué se puede cambiar: cada pieza con su tope y si se agrega o se quita;
 *   4. cómo se aplica: por el editor de siempre, nunca por un segundo camino de escritura;
 *   5. cómo se guarda la versión y cómo se deshace: el historial de versiones («Cambiado con Nexus»);
 *   6. qué ve el cliente: publicado o borrador, y quién publica (siempre una persona);
 *   7. su permiso: la celda que pide;
 *   8. para el agente de impacto: sus piezas principales y si está publicado.
 */

/** Una pieza del documento como la ve el cliente, con lo que acepta. */
export interface PiezaDelDocumento {
  /** Estable dentro del documento: lo que manda la pantalla (y el conector) al aplicar. */
  clave: string;
  /** Qué es, en palabras de la pantalla: «Título del punto clave», «El titular». */
  nombre: string;
  /**
   * La parte de la página donde está: «Puntos clave», «Equipos y hallazgos · Televentas». Desde el 24 nov es también lo que
   * pide el botón de su sección: con el pedido hecho desde ahí, al modelo le llegan solo las piezas de esa sección.
   */
  seccion: string;
  /** Lo que ve el cliente. null: un lugar para AGREGAR una pieza nueva a una lista. */
  valor: string | null;
  /** El largo que acepta. */
  tope: number;
  /** Un lugar para agregar (su `valor` es null). */
  agregar: boolean;
  /** Se puede quitar para el cliente (vaciarla). */
  quitable: boolean;
  /** La escribió (o la cambió) una persona: Nexus no la pisa sin preguntar. */
  aMano: boolean;
  /** Tiene una cita verificada de una reunión: cambiarle una cifra la suelta de su cita. */
  conCita: boolean;
  /**
   * El cliente no la ve (una cifra que su cita no sostiene: la vara de las cifras). Sus números no valen para otras piezas:
   * si no, Nexus llevaría a la página una cifra que el sistema le escondió al cliente.
   */
  noLaVeElCliente?: boolean;
}

/** Lo que Nexus propone cambiar en una pieza. `despues` null: quitarla. `antes` null: es una pieza nueva. */
export interface CambioPropuesto {
  clave: string;
  nombre: string;
  seccion: string;
  antes: string | null;
  despues: string | null;
  /** La pieza la escribió una persona: la pantalla pregunta antes de pisarla y «Aplicar todo» no la incluye. */
  aMano: boolean;
  /** Es una pieza nueva en una lista. */
  agregar: boolean;
  /**
   * Trae algo interno de la venta (el presupuesto, quién decide, una nota del equipo) porque el pedido lo nombró y Nexus lo
   * tiene de la cuenta (24 nov, ./veracidad.ts). La pantalla lo avisa con `AVISO_DE_LO_INTERNO`.
   */
  interno?: true;
}

/** El aviso de un cambio que trae algo interno (24 nov): lo ve el cliente cuando alguien publique. */
export const AVISO_DE_LO_INTERNO = "Esto es interno de la venta y lo verá el cliente al publicar.";

/** Lo que Nexus escribió y no pasó la revisión del código, con el porqué (se muestra: nada se esconde). */
export interface CambioDescartado {
  clave: string | null;
  nombre: string | null;
  texto: string;
  motivo: string;
}

/** La respuesta a un pedido: los cambios por pieza, lo descartado y lo que Nexus le dice a la persona. */
export interface PropuestaDeNexus {
  pedido: string;
  cambios: CambioPropuesto[];
  descartados: CambioDescartado[];
  /** Por qué propone esto, o por qué no pudo (lo interno, una cifra que nadie dijo). */
  nota: string | null;
  /** La corrida (AgentRun) de la propuesta: su gasto queda medido ahí. */
  corrida: string | null;
}

/** Lo que manda la pantalla (o el conector) para aplicar: la pieza, lo que se vio antes y lo que queda. */
export interface CambioParaAplicar {
  clave: string;
  antes: string | null;
  despues: string | null;
}

/**
 * Cómo se deshace lo aplicado: volver a la versión de ANTES del historial (la que guardó aplicar), si el documento sigue
 * como lo dejó Nexus (`firma`). Vuelve exacto: con sus citas y con quién lo escribió. Si alguien lo cambió después, choca.
 */
export interface DeshacerDeNexus {
  versionId: string;
  firma: string;
}

/** Una pieza que cambió desde que se propuso: no se aplica (otra persona la editó). */
export interface Choque {
  clave: string;
  nombre: string | null;
  /** Lo que dice ahora; null si la pieza ya no está. */
  ahora: string | null;
}

export type ResultadoDeAplicar =
  | {
      ok: true;
      /** Cuántas piezas cambiaron. */
      aplicados: number;
      /** Cómo deshacerlo (null: no quedó la versión de antes; se vuelve desde el historial). */
      deshacer: DeshacerDeNexus | null;
      /** «Hay cambios que el cliente no ve…». */
      aviso: string;
    }
  | { ok: false; status: number; error: string; choques?: Choque[] };

/** Quién pide: la persona del equipo (el navegador o, después, el token del conector). Nunca la elige el modelo. */
export interface QuienPide {
  email: string;
}

/**
 * El nombre del botón, en UN solo lugar (23 nov: Elías decidió «✨ Mejorar con IA»; el código sigue diciendo «Pedirle a
 * Nexus», que es lo que hace). Lo usan el botón del Resumen, el de cada área, el de cada sección (24 nov; antes, el de cada
 * pieza) y el título del panel.
 */
export const NOMBRE_DEL_BOTON = "✨ Mejorar con IA";

/** Cuántos pedidos por persona al día (el tope por persona de Nexus conversando, como las 20 preguntas del chat). */
export const PEDIDOS_POR_DIA = 20;

/** Cómo se dice que nada de esto lo ve el cliente todavía. */
export const AVISO_SIN_PUBLICAR = "Listo. Hay cambios que el cliente no ve: los verá cuando alguien publique.";

/** El tope de un pedido. */
export const MAX_PEDIDO = 1200;
/** Cuántos cambios se aplican de una vez, como mucho (una página entera de La escala cabe de sobra). */
export const MAX_CAMBIOS = 40;
