/**
 * lib/external/pagina-del-resumen.ts — LA FORMA del Resumen de la escala tal como llega a la página (9 nov; rehecho el
 * 10 nov como resumen ejecutivo). PURO, sin nada de la exploración: lo importa la vista del cliente
 * (components/external/test/ResumenDeLaEscalaVista.tsx), que no puede leer de lib/exploraciones
 * (lib/exploraciones/lectores.test.ts: la escala al cliente solo entra por su puerta). Quien decide qué sale es
 * `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts).
 *
 * Las partes (10 nov; segunda vuelta el 11 nov): arriba, las tres cifras de lo que hicimos · 1 Qué entendimos del
 * negocio · 2 Cómo funciona la operación · 3 Qué encontramos, una tarjeta por EQUIPO DE LA ESCALA con sus subequipos
 * adentro (Soporte y Customer Success dentro de Servicio) · 4 Qué falta validar, tres líneas simples. Sin «provisional»
 * y sin «¿Entendimos bien?» (Elías, 11 nov). Un Resumen del formato 1 (el del 9 nov) se pinta en el mismo molde: sin
 * negocio ni recorrido, y un subequipo por equipo con sus hallazgos y sus datos rojos.
 *
 * Cada pieza lleva su `clave` de edición (la operación `resumenDeLaEscala`): la vista no sabe de formatos, solo pinta.
 */
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";

/** De dónde sale una pieza: la reunión (su id), su fecha, el turno y lo dicho, con la letra de la transcripción. */
export interface CitaDelResumen {
  reunion: string;
  /** ISO. */
  fecha: string;
  turno: number;
  hablante: string;
  texto: string;
  /**
   * Lo dijo alguien de Smarteam y alguien de la empresa lo confirmó en el turno siguiente («Ajá. Exacto.»): quién y qué
   * dijo. En Centauro, «25 clientes y se nos van 14» lo resumió Marco y lo confirmó la empresa.
   */
  confirmo?: { hablante: string; texto: string };
}

export interface PreguntaDelResumen {
  id: string;
  texto: string;
  mano?: boolean;
}

/** La cifra en grande («14 de 25»). */
export const TOPE_DE_LA_CIFRA = 28;

/** Lo que escribe una persona: más holgado. */
export const TOPE_A_MANO = 600;

/** El nombre de un área operativa o de una etapa del recorrido. */
export const TOPE_DE_UN_NOMBRE = 48;

/** Minutos en palabras: «2 h 53 min», «45 min». */
export function enHoras(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Un equipo de la escala en «Qué hicimos»: con qué sesiones se exploró, o si quedó pendiente. */
export interface AreaExplorada {
  areaId: string;
  nombre: string;
  sesiones: number;
  minutos: number;
}

export interface LoQueHicimos {
  sesiones: number;
  minutos: number;
  /** Reuniones sin duración conocida: el tiempo es «al menos». */
  sinDuracion: number;
  equipos: string[];
  personas: number;
  /** El texto de la parte: el de una persona o el de los datos. */
  texto: string;
  /** Lo escribió una persona. */
  mano: boolean;
  /** Los equipos de la escala que ve el cliente: los explorados (con sesiones) y los pendientes (sin ninguna). */
  areas: AreaExplorada[];
}

/** Una afirmación del Resumen tal como sale: su texto, cómo se edita y, solo adentro, de dónde sale. */
export interface PiezaDeLaPagina {
  id: string;
  texto: string;
  /** La clave de la edición en su lugar (`editarElResumen`). */
  clave: string;
  /** La parte de la escala que explica, por su nombre (un reto). */
  dimensionNombre?: string | null;
  /** Solo adentro (`conCitas`). Vacío: lo escribió una persona. */
  citas?: CitaDelResumen[];
  mano?: boolean;
}

/** Una lista de piezas y la clave para agregar una (null: no se agrega a mano). */
export interface ListaDeLaPagina {
  piezas: PiezaDeLaPagina[];
  nueva: string | null;
}

/**
 * Cómo se sabe una cifra (10 nov): DECLARADO, la dijo la empresa; ESTIMADO, la calculó o la resumió alguien (con su base
 * y sus supuestos a la vista); PENDIENTE, se mencionó y falta confirmarla. Siempre con texto, nunca solo con color.
 */
export type EstadoDeLaCifra = "declarado" | "estimado" | "pendiente";
export const ESTADOS_DE_LA_CIFRA: readonly EstadoDeLaCifra[] = ["declarado", "estimado", "pendiente"];
export const ETIQUETA_DEL_ESTADO: Record<EstadoDeLaCifra, string> = {
  declarado: "Lo dijiste tú",
  estimado: "Estimado",
  pendiente: "Por confirmar",
};

export interface CifraDeLaPagina {
  id: string;
  /** La cifra en grande, con su unidad («2,8 % mensual»). */
  cifra: string;
  /** Qué significa, con su período y su contexto. */
  texto: string;
  estado: EstadoDeLaCifra;
  /** La base y los supuestos de un estimado, o lo que falta validar de una declarada. */
  nota: string | null;
  /** La clave de la edición: `<clave>:cifra`, `<clave>:texto`, `<clave>:nota`; sola, para quitarla. */
  clave: string;
  /** Las claves de la nota: null en el formato 1 (no tiene nota). */
  conNota: boolean;
  dimensionNombre: string | null;
  /** La fecha de la reunión de donde sale (ISO), sin la cita. */
  fecha: string | null;
  /** Solo adentro (`conCitas`). */
  citas?: CitaDelResumen[];
  mano?: boolean;
  /** Solo adentro: por qué NO sale al cliente (se escribió a mano con un número que su cita no dice, o no tiene cita). */
  noSale?: string;
}

/** Una etapa del recorrido del cliente: lo que pasa HOY, con la fricción que se vio (si se vio). */
export interface EtapaDeLaPagina {
  id: string;
  nombre: string;
  /** El área operativa que la lleva («Ventas», «Soporte»). */
  quien: string | null;
  texto: string;
  friccion: string | null;
  /** `<clave>:nombre`, `<clave>:texto`, `<clave>:friccion`; sola, para quitarla. */
  clave: string;
  citas?: CitaDelResumen[];
  mano?: boolean;
}

/** Las partes de «Qué entendimos del negocio», en orden. */
export type TipoDelNegocio = "vende" | "ingresos" | "abarca" | "fuera" | "motivo" | "busca";
export const TIPOS_DEL_NEGOCIO: readonly TipoDelNegocio[] = ["vende", "ingresos", "abarca", "fuera", "motivo", "busca"];
export const TITULO_DEL_NEGOCIO: Record<TipoDelNegocio, string> = {
  vende: "Qué vendes y a quién",
  ingresos: "Cómo generas ingresos",
  abarca: "Qué abarca este diagnóstico",
  fuera: "Qué queda fuera",
  motivo: "Por qué empezamos a conversar",
  busca: "Qué resultado buscas",
};

export interface ParteDelNegocio {
  tipo: TipoDelNegocio;
  titulo: string;
  lista: ListaDeLaPagina;
}

/**
 * Un subequipo dentro de la tarjeta de su equipo de la escala (Soporte y Customer Success dentro de Servicio; 11 nov). Si
 * el equipo no tiene subequipos, hay uno solo con su mismo nombre y la tarjeta no repite el título.
 */
export interface SubequipoDeLaPagina {
  id: string;
  nombre: string;
  /** La clave para cambiar el nombre (null: es el del equipo de la escala, formato 1). */
  claveDelNombre: string | null;
  organizacion: ListaDeLaPagina;
  bien: ListaDeLaPagina;
  frena: ListaDeLaPagina;
  retos: ListaDeLaPagina;
  cifras: CifraDeLaPagina[];
  /** La clave para agregar una cifra a mano (null: no se agrega). */
  cifraNueva: string | null;
  /** Sin cifra: qué dato falta para medirlo. */
  falta: string | null;
  claveDeLaFalta: string | null;
}

/**
 * Una tarjeta de «Qué encontramos»: un EQUIPO DE LA ESCALA (Ventas, Marketing, Servicio) con sus subequipos adentro
 * (Elías, 11 nov: las tarjetas son las áreas de la escala). El nivel va normal, sin «provisional». Un equipo sin sesiones
 * sale como «Por explorar», sin nivel y sin contenido: nunca como malo.
 */
export interface TarjetaDeLaPagina {
  id: string;
  /** Su equipo de la escala: a su pestaña lleva el «Ver diagnóstico de…». */
  areaId: string;
  nombre: string;
  nivel: Letra | null;
  nivelNombre: string | null;
  /** El «por qué este nivel» va en un desplegable. */
  conPorque: boolean;
  /** No tuvo sesiones: la tarjeta dice «Por explorar» y su pestaña no se abre. */
  porExplorar: boolean;
  subequipos: SubequipoDeLaPagina[];
}

/** Los tipos de lo que falta validar (10 nov). `por-confirmar`: una pregunta del formato 1, sin tipo. */
export type TipoDePendiente = "no-explorada" | "sin-dato" | "hipotesis" | "contradiccion" | "por-confirmar";
export const ETIQUETA_DEL_PENDIENTE: Record<TipoDePendiente, string> = {
  "no-explorada": "Área sin explorar",
  "sin-dato": "Lo preguntamos, falta el dato",
  hipotesis: "Hipótesis por validar",
  contradiccion: "Datos que no cuadran",
  "por-confirmar": "Por confirmar",
};

export interface PendienteDeLaPagina {
  id: string;
  tipo: TipoDePendiente;
  texto: string;
  /** null: lo calculó Nexus (un área sin sesiones, un nivel provisional) y no se edita. */
  clave: string | null;
  areaNombre: string | null;
  citas?: CitaDelResumen[];
  mano?: boolean;
}

/** Un dato rojo del formato 1 (9 nov). En el formato 2 las cifras van en cada tarjeta. */
export interface DatoRojoDeLaPagina {
  id: string;
  cifra: string;
  texto: string;
  areaId: string;
  areaNombre: string;
  dimensionNombre: string | null;
  fecha: string | null;
  citas?: CitaDelResumen[];
  mano?: boolean;
  noSale?: string;
}

/** Un equipo de la escala: su nivel (del cálculo) y por qué está ahí. */
export interface AreaDelResumenDeLaPagina {
  areaId: string;
  nombre: string;
  nivel: Letra | null;
  nivelNombre: string | null;
  /** El nivel depende de partes por explorar: sus nombres. null: no es provisional. */
  provisional: string[] | null;
  porque: string | null;
  /** De dónde sale el «por qué»: el agente, una persona o los datos. Solo adentro importa. */
  origenDelPorque: "agente" | "mano" | "respaldo" | null;
  /** El «por qué» guardado se escribió con otros niveles: sale el de respaldo. */
  porqueViejo: boolean;
  /** Formato 1: los hallazgos del equipo. */
  hallazgos: { id: string; texto: string; dimensionNombre: string | null; citas?: CitaDelResumen[]; mano?: boolean }[];
}

export interface ResumenDeLaPagina {
  /** Cuándo se armó (ISO). null: nunca. */
  at: string | null;
  /** 1: el del 9 nov (datos rojos, hallazgos por equipo). 2: el resumen ejecutivo del 10 nov. */
  formato: 1 | 2;
  hicimos: LoQueHicimos | null;
  /** null: el formato 1 no lo tiene (la parte no sale). */
  negocio: ParteDelNegocio[] | null;
  /** null: el formato 1 no lo tiene. Vacío en el 2: no se pudo confirmar ninguna etapa. */
  recorrido: EtapaDeLaPagina[] | null;
  /** La clave para agregar una etapa (null: no se agrega). */
  etapaNueva: string | null;
  tarjetas: TarjetaDeLaPagina[];
  /** «Qué falta validar»: tres líneas como mucho, en palabras simples (el tipo solo sirve adentro). */
  pendientes: PendienteDeLaPagina[];
  pendienteNuevo: string | null;
  /** Desde el 11 nov no sale: siempre vacío (se lee lo guardado, no se muestra). */
  entendimos: PreguntaDelResumen[];
  /** Los equipos de la escala sin sesiones: su pestaña dice «Por explorar» y no se abre. */
  sinExplorar: string[];
  /** Solo adentro: los niveles cambiaron desde que se armó el Resumen (compara la firma de los niveles). */
  escalaCambio?: boolean;
  /** Solo adentro: lo que el código vio al armarlo (un equipo con reunión que no está en el recorrido). */
  avisos?: string[];
  /** Los equipos de la escala que ve el cliente, con su nivel (la etiqueta de cada tarjeta y los sin tarjeta). */
  areas: AreaDelResumenDeLaPagina[];
  /** Formato 1: los datos rojos (también van en la tarjeta de su equipo). */
  datosRojos: DatoRojoDeLaPagina[];
  /** Formato 1: «¿Falta algo?» (también van en «Qué falta validar»). */
  falta: PreguntaDelResumen[];
}

/** Lo mínimo de un nivel por dimensión para decir si el general es provisional. */
interface DimensionConNivel {
  id: string;
  nombre: string;
  preguntada: boolean;
  nivel: Letra | null;
}

/**
 * ¿El nivel general lo determina una parte por explorar (una hipótesis)? (10 nov: Ventas de Centauro está en Deficiente
 * por «Aprendizaje de Ganadas y Perdidas», que es hipótesis.) Las partes que lo determinan son las que están en ese nivel
 * (o, si ninguna lo está, las más bajas). Si TODAS son por explorar, es provisional y depende de ellas: devuelve sus
 * nombres. Solo cambia cómo se presenta; el cálculo es el mismo. null: no es provisional (o no tiene nivel).
 */
export function nivelProvisional(r: { nivel: Letra | null; dimensiones: readonly DimensionConNivel[] }, porExplorar: readonly string[]): string[] | null {
  if (!r.nivel || !porExplorar.length) return null;
  const medidas = r.dimensiones.filter((d) => d.preguntada && d.nivel);
  if (!medidas.length) return null;
  const i = (l: Letra) => LETRAS.indexOf(l);
  let determinan = medidas.filter((d) => d.nivel === r.nivel);
  if (!determinan.length) {
    const minimo = Math.min(...medidas.map((d) => i(d.nivel!)));
    determinan = medidas.filter((d) => i(d.nivel!) === minimo);
  }
  return determinan.every((d) => porExplorar.includes(d.id)) ? determinan.map((d) => d.nombre) : null;
}
