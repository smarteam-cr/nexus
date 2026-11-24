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
import { CLAVES, huella, textoDeLaPagina, type TextosDeLaPagina } from "./textos-de-la-pagina";

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
  /**
   * Lo dijo alguien de Smarteam y la empresa NO lo corrigió en los turnos siguientes (18 nov, Elías: «si el vendedor dice
   * una cifra y el cliente no corrige, posiblemente es real»). Solo vale como cita de una cifra, que sale «por confirmar».
   */
  sinCorregir?: true;
  /**
   * 21 nov: la cita es de una NOTA DEL EQUIPO («Lo que sabes del cliente»), no de una reunión: quién la escribió y cuándo.
   * Pesa más que una reunión. Solo adentro: la página pública no lleva citas.
   */
  delEquipo?: { nombre: string; en: string };
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

/** El título de un punto clave (18 nov): corto, en negrita. */
export const TOPE_DEL_TITULO_DEL_PUNTO = 80;

/** Las etiquetas del negocio bajo la tesis (forma editorial): qué vende, a quién o dónde, cómo cobra. */
export const MAX_ETIQUETAS = 3;

/** El título del recorrido (forma editorial): hasta 9 palabras. Lo usan la lectura del agente, la edición y su cuadro. */
export const TOPE_DEL_TITULO_DEL_RECORRIDO = 90;

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

/**
 * El titular de la portada (21 nov, Elías: «En el H1 no debería estar el problema. Ahí debería estar las sesiones de
 * exploración, cuántas horas de conversaciones, con cuántas personas se ha hablado»): «13 sesiones y 8 h de conversación
 * con 3 personas de tu equipo.». Los números salen de lo que hicimos (nunca de la IA); `escritos` son los que una persona
 * cambió en las cifras de abajo, para que el titular no diga otro número que ellas. Sin sesiones, null: la portada dice
 * lo de siempre.
 */
export function tituloDeLoQueHicimos(
  h: { sesiones: number; minutos: number; personas: number },
  escritos: { sesiones?: string; tiempo?: string; personas?: string } = {},
): string | null {
  if (h.sesiones <= 0) return null;
  // El singular sale del número que se ve: si una persona escribió «2», dice «2 sesiones» aunque el sistema contara 1.
  const cuantos = (escrito: string | undefined, n: number) => {
    const x = Number((escrito ?? "").trim().replace(",", "."));
    return escrito !== undefined && escrito.trim() !== "" && Number.isFinite(x) ? x : n;
  };
  const s = cuantos(escritos.sesiones, h.sesiones);
  const p = cuantos(escritos.personas, h.personas);
  const sesiones = `${escritos.sesiones ?? h.sesiones} ${s === 1 ? "sesión" : "sesiones"}`;
  const tiempo = h.minutos > 0 ? ` y ${escritos.tiempo ?? enHoras(h.minutos)} de conversación` : "";
  const personas = h.personas > 0 ? ` con ${escritos.personas ?? h.personas} ${p === 1 ? "persona" : "personas"} de tu equipo` : "";
  return `${sesiones}${tiempo}${personas}.`;
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
export type EstadoDeLaCifra = "declarado" | "estimado" | "pendiente" | "calculado";
/**
 * CALCULADO (24 nov, Elías: «el costo se calcula con las cifras que dio el cliente»): la cifra es una cuenta que hizo el
 * CÓDIGO con números que dijo la empresa, cada uno con su cita (lib/exploraciones/cuenta-con-tus-cifras.ts). La cuenta va a
 * la vista; afuera sale solo si quien presenta la confirmó.
 */
export const ESTADOS_DE_LA_CIFRA: readonly EstadoDeLaCifra[] = ["declarado", "estimado", "pendiente", "calculado"];
export const ETIQUETA_DEL_ESTADO: Record<EstadoDeLaCifra, string> = {
  declarado: "Lo dijiste tú",
  estimado: "Estimado",
  pendiente: "Por confirmar",
  calculado: "Con tus cifras",
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
  /** Solo adentro: la dijo Smarteam y la empresa no la corrigió (18 nov): lleva «Confirmar» al lado de «Quitar». */
  porConfirmar?: boolean;
  /**
   * La pérdida que la empresa validó en la preventa (20 nov, lib/exploraciones/perdida-de-la-escala.ts): la calcula Nexus
   * con sus cifras, no la escribe el agente. No se edita como una cifra del Resumen: se quita (o se cambia su rótulo) con el
   * texto fijo del Resumen `nombreFijo` (`CLAVES.delResumen`), atado a la huella de su cuenta. `cuenta`: la cuenta a la vista, que es su nota.
   */
  dePerdida?: { nombreFijo: string; cuenta: string };
  /**
   * Una cifra «calculado» (24 nov): la cuenta a la vista, hecha por el código con las cifras de la empresa («10 clientes ×
   * US$ 85 = US$ 850 al mes»). Solo la trae una calculada.
   */
  cuenta?: string;
}

/** La etiqueta del estado de una cifra: la pérdida de la preventa la validó la empresa (20 nov), no la dijo en una reunión. */
export const ETIQUETA_DE_LA_PERDIDA = "Lo validaste con nosotros";
export function etiquetaDeLaCifra(c: Pick<CifraDeLaPagina, "estado" | "dePerdida">): string {
  return c.dePerdida ? ETIQUETA_DE_LA_PERDIDA : ETIQUETA_DEL_ESTADO[c.estado];
}

/**
 * ¿La cifra es de DINERO? (20 nov, Elías: «están perdiendo US$1.5M al mes en cuentas incobrables», no «las ventas se
 * gestionan por WhatsApp»): una moneda en la cifra o en su rótulo. La primera de un subequipo es su COSTO: va de titular.
 */
const DINERO = /(?:US\$|\$|₡|€|\bUSD\b|\bCRC\b|\bGTQ\b|\bEUR\b|\bQ\s?\d[\d.,]{2,}|\bd[oó]lar(?:es)?\b|\bcolones\b|\bquetzal(?:es)?\b|\beuros?\b|\blempiras?\b|\bpesos\b)/i;
export function esDinero(c: Pick<CifraDeLaPagina, "cifra" | "texto">): boolean {
  return DINERO.test(`${c.cifra} ${c.texto}`);
}

/** Lo que dice que el dinero se PIERDE (no se cobra, se deja de vender, se va), no que se invierte o se vende. */
const LO_QUE_SE_PIERDE = /pierd|p[eé]rdida|no se cobra|sin cobrar|incobr|vencid|\bmora\b|dej(a|an|amos) de (vender|cobrar|ganar|facturar|entrar)|no (entra|entran|llega|llegan|se vende|se venden)|se (va|van|escapa|escapan)\b|fuga|retrabajo|devoluci|castigad|multa/i;
/**
 * ¿La cifra es LO QUE CUESTA? Dinero que se pierde (Cemaco, simulacro del 20 nov: la única cifra en dinero era la inversión
 * de marketing del mes, y no es lo que le cuesta el problema). Solo esa va de titular; otra en dinero queda entre las cifras.
 */
export function esCosto(c: Pick<CifraDeLaPagina, "cifra" | "texto">): boolean {
  return esDinero(c) && LO_QUE_SE_PIERDE.test(c.texto);
}

/**
 * El ícono de un paso del recorrido (forma editorial, 15 nov): lo elige el agente de esta lista; sin él, la página lo
 * deduce del nombre del paso (`iconoDelPaso`).
 */
export const ICONOS_DEL_PASO = ["captacion", "contacto", "visita", "demo", "cotizacion", "cierre", "configuracion", "entrega", "tienda", "opera", "filtro", "soporte"] as const;
export type IconoDelPaso = (typeof ICONOS_DEL_PASO)[number];

/** El ícono de un paso por su nombre, cuando el agente no lo dio (un Resumen de antes del 15 nov, o una etapa a mano). */
export function iconoDelPaso(nombre: string, continuo = false): IconoDelPaso {
  const n = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (continuo || /soporte|atencion|reclamo|acompan|retenc|postventa|caso/.test(n)) return "soporte";
  if (/captac|lead|pauta|campan|anuncio|marketing/.test(n)) return "captacion";
  if (/visita|levantamiento/.test(n)) return "visita";
  if (/demo|presentac/.test(n)) return "demo";
  if (/cotiza|precio|propuesta|calculo/.test(n)) return "cotizacion";
  if (/cierre|contrato|firma|pago/.test(n)) return "cierre";
  if (/configur|implement|capacit|instal|puesta|onboard/.test(n)) return "configuracion";
  if (/entrega|despacho|pedido|orden|envio/.test(n)) return "entrega";
  if (/tienda|compra/.test(n)) return "tienda";
  if (/filtro|asigna|califica/.test(n)) return "filtro";
  if (/contacto|llamada|cita|primer/.test(n)) return "contacto";
  return "opera";
}

/** Una etapa del recorrido del cliente: lo que pasa HOY, con la fricción que se vio (si se vio). */
export interface EtapaDeLaPagina {
  id: string;
  nombre: string;
  /** El área operativa que la lleva («Ventas», «Soporte»). */
  quien: string | null;
  texto: string;
  friccion: string | null;
  /** Su ícono (el del agente o el que deduce la página del nombre). */
  icono: IconoDelPaso;
  /** Acompaña mientras el cliente opera (Soporte, Customer Success): va en el bucle de abajo, no en la línea. */
  continuo: boolean;
  /** `<clave>:nombre`, `<clave>:texto`, `<clave>:friccion`; sola, para quitarla. */
  clave: string;
  citas?: CitaDelResumen[];
  mano?: boolean;
  /**
   * El traspaso de este paso al siguiente (24 nov): de qué equipo a cuál, qué pasa y, si la empresa la dijo, la cifra de lo
   * que pasa de uno a otro («180 leads al mes»). Solo lo trae un paso con un traspaso verificado.
   */
  traspaso?: TraspasoDeLaPagina;
}

/** Lo que pasa entre dos pasos del recorrido, con su cifra si la empresa la dijo (el dibujo pone el volumen en la flecha). */
export interface TraspasoDeLaPagina {
  de: string;
  a: string;
  texto: string;
  /** El número en grande («180»), o null si no se dijo. */
  cifra: string | null;
  /** Su rótulo («leads al mes»), o null. */
  rotulo: string | null;
  citas?: CitaDelResumen[];
}

/**
 * Las partes de «Qué entendimos del negocio», en orden. Desde la forma editorial (15 nov) la página muestra arriba la
 * TESIS (dos frases cortas), las ETIQUETAS (qué vende, a quién, cómo cobra), el ALCANCE (qué abarca y qué queda fuera) y el
 * TAMAÑO del negocio (una cifra que dijo la empresa: «500 clientes activos»). Vende, ingresos, motivo y busca se siguen
 * guardando (sostienen la tesis y las etiquetas, y un Resumen anterior las trae), pero ya no salen al cliente.
 */
export type TipoDelNegocio = "tesis" | "etiquetas" | "tamano" | "vende" | "ingresos" | "abarca" | "fuera" | "motivo" | "busca";
export const TIPOS_DEL_NEGOCIO: readonly TipoDelNegocio[] = ["tesis", "etiquetas", "tamano", "vende", "ingresos", "abarca", "fuera", "motivo", "busca"];
export const TITULO_DEL_NEGOCIO: Record<TipoDelNegocio, string> = {
  tesis: "La tesis",
  etiquetas: "Las etiquetas del negocio",
  tamano: "El tamaño del negocio",
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
  /** Sin cifra: qué dato falta para medirlo. Desde el 20 nov, sin COSTO: qué falta para saber cuánto le cuesta. */
  falta: string | null;
  claveDeLaFalta: string | null;
  /**
   * CUÁNTO CUESTA (20 nov): la primera cifra en dinero del subequipo (sale de `cifras` para ir de titular) o, en Ventas, la
   * pérdida que la empresa validó en la preventa. null: no hay cifra en dinero, y la página dice «por validar» con `falta`.
   * `undefined`: una foto publicada antes del 20 nov, que se pinta como antes (las cifras a la derecha).
   */
  costo?: CifraDeLaPagina | null;
}

/** Sin cifra en dinero ni lo que falta para saberla (20 nov): el «por validar» dice que se mide con la empresa, nunca un monto. */
export const sinCosto = (equipo: string) => `Lo medimos contigo: falta el dato de cuánto le cuesta esto a ${equipo}.`;

/** Lo que dice «Cuánto cuesta · Por validar» con una cuenta de la pérdida que nadie validó: de qué meta sale, nunca el monto. */
export function faltaDeLaPerdida(p: { meta: string }): string {
  return `Falta validar contigo cuánto pierden al mes por no llegar a «${p.meta}»: la cuenta sale de tus cifras.`;
}

/** La conclusión de un subequipo, como la presentan el Resumen y la página de su área (20 nov). */
export interface ConclusionDelSubequipo {
  /** Lo que cuesta en dinero (null: no se sabe, y la página dice «Por validar»). */
  costo: CifraDeLaPagina | null;
  /** El titular de la fila cuando no hay costo, o la línea debajo del costo: el reto principal (o, si no hay, el primer reto). */
  reto: PiezaDeLaPagina | null;
  /** Los problemas que lo causan: los retos (sin el que hizo de titular) y lo que frena de un Resumen de antes. */
  causas: PiezaDeLaPagina[];
}

/**
 * EL RETO PRINCIPAL → LO QUE LO CAUSA → CUÁNTO CUESTA (20 nov, Elías tras presentar con Ventas: las conclusiones
 * describían cómo opera el cliente en vez de decir cuánto le cuesta). El titular es lo que cuesta si hay una cifra en dinero;
 * si no, el reto principal (la pieza `frena` desde el 20 nov); en un Resumen de antes, que no lo trae, el primer reto. Nunca
 * un monto inventado: sin costo, la página dice «Por validar» con lo que falta saber. `perdidaQuitada`: quien presenta quitó
 * la pérdida de la preventa para el cliente (afuera no sale).
 */
export function conclusionDelSubequipo(x: Pick<SubequipoDeLaPagina, "costo" | "frena" | "retos">, perdidaQuitada = false): ConclusionDelSubequipo {
  const costo = x.costo && !(x.costo.dePerdida && perdidaQuitada) ? x.costo : null;
  const [principal, ...frenaDeAntes] = x.frena.piezas;
  const retoDeTitular = !principal ? (x.retos.piezas[0] ?? null) : null;
  return {
    costo,
    reto: principal ?? retoDeTitular,
    causas: [...(retoDeTitular ? x.retos.piezas.slice(1) : x.retos.piezas), ...frenaDeAntes],
  };
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

/**
 * «500 clientes activos» → «500» y «clientes activos»; «≈60 casos al mes» → «≈60» y «casos al mes». Sin un número al
 * principio, todo es el rótulo y no hay cifra en grande.
 */
export function partirElTamano(texto: string): { valor: string; rotulo: string } {
  const m = texto.trim().match(/^((?:más de |menos de |cerca de |unos? |unas |alrededor de |≈|~)?(?:(?:US)?\$|₡|€|L|Q)?\s?\d[\d.,\s\u00a0\u202f]*(?:\s?[–-]\s?\d[\d.,]*)?(?:\s?(?:%|mil(?:lones)?\b|k\b))?)\s*(.*)$/i);
  if (!m || !m[2]) return { valor: "", rotulo: texto.trim() };
  return { valor: m[1].trim(), rotulo: m[2].trim() };
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
  /**
   * El tamaño del negocio en grande (forma editorial, 15 nov): «500» y «clientes activos», con su estado. Sale de la parte
   * «tamano» del negocio (su clave es la de esa pieza). null: nadie lo dijo.
   */
  tamano: { valor: string; rotulo: string; estado: EstadoDeLaCifra; clave: string; citas?: CitaDelResumen[]; noSale?: string } | null;
  /** El título del recorrido («De la pauta en Meta a la compra en tienda.»): null, el de siempre. */
  tituloDelRecorrido: string | null;
  /** La clave para editarlo (null: formato 1). */
  claveDelTituloDelRecorrido: string | null;
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
  /**
   * Los 5 puntos clave (18 nov, Marco: «que abajo se explique más»): los más críticos de toda la empresa, en orden de peso.
   * Opcional: un Resumen o una foto publicada de antes no los trae, y la página se pinta igual sin la parte.
   */
  puntos?: PuntoDeLaPagina[];
  /** La clave para agregar un punto (null: no se agrega). */
  puntoNuevo?: string | null;
  /** Solo adentro: las reuniones que el Resumen no pudo leer bien (cortadas, o casi sin la voz de la empresa). */
  malLeidas?: ReunionMalLeida[];
}

/** Un punto clave: un título corto y una o dos frases, con el equipo de la escala del que habla. */
export interface PuntoDeLaPagina {
  id: string;
  titulo: string;
  texto: string;
  /** `<clave>:titulo`, `<clave>:texto`; sola, para quitarlo. */
  clave: string;
  areaNombre: string | null;
  citas?: CitaDelResumen[];
  mano?: boolean;
}

/** Por qué el Resumen no pudo leer bien una reunión (18 nov). */
export type MotivoDeMalLeida = "recortada" | "poco-del-cliente";
export const MOTIVO_DE_MAL_LEIDA: Record<MotivoDeMalLeida, string> = {
  recortada: "era muy larga y se leyó sin un pedazo del medio",
  "poco-del-cliente": "casi todo lo dijo Smarteam: la empresa habló poco",
};

/** Una reunión que el Resumen no pudo leer bien, con lo que hace falta para avisarlo y volver a leerla. */
export interface ReunionMalLeida {
  /** El id de la reunión (FirefliesSession). */
  reunion: string;
  /** ISO. */
  fecha: string;
  titulo: string | null;
  motivos: MotivoDeMalLeida[];
  /** Qué parte de su texto se leyó (0 a 100). */
  leido: number;
  /** Qué parte de lo dicho es de la empresa (0 a 100). */
  delCliente: number;
}

/**
 * Las piezas OBLIGATORIAS de un Resumen armado (21 nov, Elías: «que al hacer un resumen no se pierda el titular»): sin
 * ellas la página del cliente queda rota. Hoy, el titular (la tesis). Al rehacer con la IA, una obligatoria que la
 * verificación descartó se queda como estaba (`juntarConLoEditado`); y una página sin ella no se publica.
 */
export const PIEZAS_OBLIGATORIAS: readonly TipoDelNegocio[] = ["tesis"];

/**
 * Por qué esta página del Resumen no se puede publicar, o null si se puede. Solo un Resumen ARMADO del formato 2 (desde el
 * 10 nov) lleva tesis: sin Resumen, o uno del 9 nov, la página tiene su texto de siempre. Desde el 21 nov la tesis ya no
 * es el H1 de la portada (lo es lo que hicimos) sino «El problema principal», y sigue siendo obligatoria.
 */
export function faltaParaPublicar(r: Pick<ResumenDeLaPagina, "at" | "formato" | "negocio">): string | null {
  if (!r.at || r.formato !== 2) return null;
  const vacia = PIEZAS_OBLIGATORIAS.find((tipo) => !(r.negocio ?? []).find((p) => p.tipo === tipo)?.lista.piezas.length);
  if (!vacia) return null;
  return "El Resumen no tiene el problema principal: escríbelo en «El problema principal» antes de publicar (si lo armó la IA, también puedes rehacerlo).";
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

/** La bajada de la portada, debajo del titular (un texto fijo: se cambia por empresa, atado a este texto). */
export const BAJADA_DEL_RESUMEN = "Así entendimos tu negocio, cómo trabajan tus equipos y qué los frena hoy.";

/**
 * La clave de un texto fijo del Resumen ATADO a su texto de siempre (`resumen.<nombre>.<huella>`): lo escrito para un
 * número o una frase deja de valer cuando el Resumen se rehace y cambia (la vista: `fijo(…, atado)`).
 */
export const claveAtadaDelResumen = (nombre: string, original: string): string => CLAVES.delResumen(`${nombre}.${huella(original)}`);

/**
 * El titular de la portada (el H1, 21 nov) como lo ve el cliente, con su clave de edición (23 nov: lo comparten la vista y
 * «Pedirle a Nexus», que lo cambia por el mismo texto fijo). Va atado a los números del SISTEMA, no a los escritos:
 * corregir una cifra no lo suelta; rehacer el Resumen con otras sesiones, sí. `valor`: lo cambiado para esta empresa o,
 * si nadie lo cambió, el titular con los números que se ven abajo. null: sin sesiones (la portada dice lo de siempre).
 */
export function titularDelResumen(
  h: { sesiones: number; minutos: number; personas: number } | null | undefined,
  textos: TextosDeLaPagina | null | undefined,
): { clave: string; original: string; valor: string } | null {
  if (!h) return null;
  const delSistema = tituloDeLoQueHicimos(h);
  if (!delSistema) return null;
  const escrito = (nombre: string, original: string) => textoDeLaPagina(textos, claveAtadaDelResumen(nombre, original), original);
  const conLosDeAbajo =
    tituloDeLoQueHicimos(h, {
      sesiones: escrito("hicimos.sesiones", String(h.sesiones)),
      tiempo: h.minutos > 0 ? escrito("hicimos.tiempo", enHoras(h.minutos)) : undefined,
      personas: h.personas > 0 ? escrito("hicimos.personas", String(h.personas)) : undefined,
    }) ?? delSistema;
  const clave = claveAtadaDelResumen("titular.hicimos", delSistema);
  return { clave, original: conLosDeAbajo, valor: textoDeLaPagina(textos, clave, conLosDeAbajo) };
}
