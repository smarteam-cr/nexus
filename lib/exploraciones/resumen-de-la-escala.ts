/**
 * lib/exploraciones/resumen-de-la-escala.ts — EL RESUMEN de la escala que ve el cliente (Elías, 9 nov; rehecho el 10 nov
 * como resumen ejecutivo). PURO (sin base ni red). Lo arma ./resumen-de-la-escala-server.ts.
 *
 * El objetivo (10 nov): que la dirección del cliente lea la portada en 2 o 3 minutos y diga «entendieron cómo funciona mi
 * negocio, cómo están organizadas mis áreas y qué problemas tenemos que resolver». Cinco partes, en este orden:
 *   1. Qué entendimos del negocio: qué vende y a quién, cómo gana, qué abarca el diagnóstico y qué queda fuera, qué lo
 *      motivó y qué busca. Lo que no se habló sale como pendiente, nunca supuesto.
 *   2. Qué hicimos: sesiones, tiempo, personas de la empresa y equipos explorados frente a pendientes (de los datos, sin IA).
 *   3. Cómo funciona la operación: el recorrido del cliente entre áreas, solo con etapas que la empresa describió.
 *   4. Qué encontramos por área OPERATIVA (Soporte y Customer Success separadas aunque las dos sean Servicio en la escala):
 *      cómo está organizada, lo que ya hace bien, lo que la frena, 2 o 3 retos y la magnitud (cifras declaradas,
 *      estimadas o pendientes, siempre con su estado en palabras). El nivel de la escala va como etiqueta; «provisional» si
 *      lo determina una parte por explorar.
 *   5. Qué falta validar: áreas sin explorar, preguntas sin dato, hipótesis y contradicciones; y «¿Entendimos bien?».
 * Los datos rojos del 9 nov dejan de ser una banda de alarma: son las cifras de cada tarjeta, con su estado.
 *
 * ⛔ NINGUNA AFIRMACIÓN SIN SU CITA. El agente devuelve, con cada pieza del negocio, de la organización, de los retos, de
 * las etapas y de las cifras, de qué reunión y turno sale; el código busca esa cita en la transcripción (`verificarCita`:
 * tolera los «eh» y las frases partidas), exige que la haya dicho alguien del CLIENTE (o que la confirme en el turno
 * siguiente: «Ajá. Exacto.», `confirmacion`), que TODOS los números del texto estén en lo citado (`cifrasDeMas`) y que una
 * herramienta nombrada esté en lo citado (`herramientasDeMas`). Una cifra que solo dijo Smarteam (y la empresa confirmó)
 * no es «declarada»: es «estimada» (`estadoDeLaCifra`). Lo que no pasa se descarta.
 * ⛔ Lo que ve el cliente (`resumenParaLaPagina` con `conCitas: false`) no lleva citas, ni quién habló, ni títulos de
 * reuniones. Se edita EN SU LUGAR en la página interna (la operación `resumenDeLaEscala`, `editarElResumen`); lo editado
 * queda `mano` y «Rehacer con IA» no lo pisa (`juntarConLoEditado`). Un Resumen guardado con el formato 1 (9 nov) se sigue
 * leyendo, pintando y editando hasta que se rehace. Las pruebas: resumen-de-la-escala.test.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { parseObject } from "@/lib/ai/section-schema";
import { cantidadesDe, paraComparar, verificarCita, type TurnoNumerado } from "@/lib/analizador-venta/analisis";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import type { EstimadoGuardado } from "./contenido";
import { firmaDelArea, type EntornoDeLaFirma } from "./descripcion-de-la-escala";
import {
  enHoras,
  ESTADOS_DE_LA_CIFRA,
  ICONOS_DEL_PASO,
  iconoDelPaso,
  nivelProvisional,
  partirElTamano,
  MAX_ETIQUETAS,
  FORMA_DE_LA_PORTADA,
  MAX_LARGO_DEL_EQUIPO_DEL_MAPA,
  MAX_LINEAS_DEL_MAPA,
  MAX_PARRAFOS_DE_LA_PORTADA,
  TIPOS_DEL_NEGOCIO,
  TOPE_DEL_TITULO_DEL_RECORRIDO,
  TITULO_DEL_NEGOCIO,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  TOPE_DEL_TITULO_DEL_PUNTO,
  type AreaDelResumenDeLaPagina,
  type CifraDeLaPagina,
  type CitaDelResumen,
  type DatoRojoDeLaPagina,
  type EstadoDeLaCifra,
  type IconoDelPaso,
  type ListaDeLaPagina,
  type LoQueHicimos,
  type PendienteDeLaPagina,
  type PiezaDeLaPagina,
  type PreguntaDelResumen,
  type PuntoDeLaPagina,
  type ReunionMalLeida,
  type ResumenDeLaPagina,
  type SubequipoDeLaPagina,
  type TarjetaDeLaPagina,
  type TipoDelNegocio,
  esCosto,
  faltaDeLaPerdida,
  PIEZAS_OBLIGATORIAS,
} from "@/lib/external/pagina-del-resumen";
import type { LaPerdidaEnLaEscala, PerdidaDeLaEscala } from "./perdida-de-la-escala";
import { bloqueDeLasNotas, esNotaDelEquipo } from "./notas-del-equipo";
import { cuentaConTusCifras, MAX_FACTORES, monedaDelFactor } from "./cuenta-con-tus-cifras";
import { ROTULO_DE_LO_QUE_LO_CAUSA, ROTULO_DEL_RETO_PRINCIPAL } from "./rotulos-del-resumen";
import { monedaDe, porMesDe, porMesDelPrimero } from "./perdida";
export { enHoras, MAX_ETIQUETAS, MAX_LINEAS_DEL_MAPA, MAX_PARRAFOS_DE_LA_PORTADA, TOPE_A_MANO, TOPE_DE_LA_CIFRA, TOPE_DE_UN_NOMBRE, TOPE_DEL_TITULO_DEL_PUNTO, TOPE_DEL_TITULO_DEL_RECORRIDO };
export type { AreaDelResumenDeLaPagina, CitaDelResumen, DatoRojoDeLaPagina, EstadoDeLaCifra, LoQueHicimos, PreguntaDelResumen, ResumenDeLaPagina, ReunionMalLeida, TipoDelNegocio };

// ── Lo que se guarda ────────────────────────────────────────────────────────────

/** Formato 1 (9 nov): una cifra de lo que la empresa pierde. Se sigue leyendo; el formato 2 no los escribe. */
export interface DatoRojo {
  id: string;
  /** La cifra en grande: «14 de 25», «3 días». */
  cifra: string;
  /** Lo que significa, en una línea, hablándole a la empresa. */
  texto: string;
  areaId: string;
  dimensionId: string | null;
  citas: CitaDelResumen[];
  /** Lo cambió o lo escribió una persona: «Rehacer con IA» no lo pisa. */
  mano?: boolean;
  /** La cita de la que nació (`reunión:turno`), aunque una edición a mano se la haya quitado: así se reconoce al rehacer. */
  origen?: string;
}

/** Formato 1: un hallazgo de un equipo de la escala. */
export interface HallazgoDelResumen {
  id: string;
  texto: string;
  dimensionId: string | null;
  /** Lo dicho que lo sostiene (una o dos intervenciones). Vacío: lo escribió una persona. */
  citas: CitaDelResumen[];
  mano?: boolean;
  /** La cita de la que nació (`reunión:turno`), como en `DatoRojo`. */
  origen?: string;
}

/** Formato 2: una afirmación sobre la empresa, con lo que la sostiene. Sin citas: la escribió una persona. */
export interface PiezaDelResumen {
  id: string;
  texto: string;
  citas: CitaDelResumen[];
  mano?: boolean;
  origen?: string;
}

/** Un reto de un área operativa: qué pasa, dónde y qué consecuencia tiene, con la parte de la escala que explica. */
export interface RetoDelResumen extends PiezaDelResumen {
  dimensionId: string | null;
  /**
   * Un reto del TRASPASO (24 nov): lo que un equipo dijo de otro («me suben y me bajan los leads, depende de ventas»). Es el
   * otro equipo de la escala. Se guarda UNA vez, aquí; la página lo muestra también en la primera fila del otro
   * (`resumenParaLaPagina`), con la misma clave.
   */
  traspaso?: string;
}

/** La cuenta de una cifra «calculado» (24 nov): cada número con la cita de la empresa que lo dice, y la cuenta a la vista. */
export interface CuentaGuardada {
  factores: { valor: string; rotulo: string; cita: CitaDelResumen }[];
  /** «10 clientes que se van × US$ 85 de cuota = US$ 850 al mes». La hace el código (`cuentaConTusCifras`). */
  texto: string;
}

/** La magnitud de un área: la cifra con su unidad y período, cómo se sabe y, si hace falta, su base o lo que falta validar. */
export interface CifraDelResumen extends PiezaDelResumen {
  cifra: string;
  estado: EstadoDeLaCifra;
  nota: string | null;
  dimensionId: string | null;
  /**
   * Una persona tocó «Confirmar» en una cifra que dijo Smarteam y la empresa no corrigió (18 nov): queda «Lo dijiste tú».
   * En una «calculado» (24 nov), quien presenta confirmó la cuenta: recién ahí sale al cliente.
   */
  confirmada?: boolean;
  /** Solo una «calculado»: la cuenta con sus factores. Sin ella, la cifra no es calculada. */
  cuenta?: CuentaGuardada;
}

/** Un punto clave (18 nov): de lo más crítico de toda la empresa, en orden de peso, con su título y su cita. */
export interface PuntoClave extends PiezaDelResumen {
  titulo: string;
  /** El equipo de la escala del que habla («3» Servicio), o null si es de toda la empresa. */
  areaId: string | null;
}

/** Una etapa del recorrido del cliente HOY. `texto`: qué pasa ahí; `friccion`: lo que se traba (null: no se vio). */
export interface EtapaDelResumen extends PiezaDelResumen {
  nombre: string;
  quien: string | null;
  friccion: string | null;
  /** Forma editorial (15 nov): su ícono, de la lista; sin él, la página lo deduce del nombre (`iconoDelPaso`). */
  icono?: IconoDelPaso | null;
  /** Acompaña mientras el cliente opera (Soporte, Customer Success): la página lo pinta en el bucle, no en la línea. */
  continuo?: boolean;
  /** El traspaso de este paso al siguiente (24 nov): de qué equipo a cuál, qué pasa y su cifra, con su cita. */
  traspaso?: TraspasoDelResumen;
}

/** Lo que pasa entre un paso y el siguiente: de un equipo a otro, qué pasa y, si se dijo, cuánto pasa (con su cita). */
export interface TraspasoDelResumen {
  de: string;
  a: string;
  texto: string;
  cifra: string | null;
  rotulo: string | null;
  citas: CitaDelResumen[];
}

/** Un área operativa, como la empresa se organiza (Soporte, Customer Success), colgada de su equipo de la escala. */
export interface AreaOperativa {
  id: string;
  nombre: string;
  /** El equipo de la escala («3» Servicio). */
  areaId: string;
  nombreMano?: boolean;
  /** El nombre que le puso el agente, si una persona lo cambió: con él se reconoce la misma área al rehacer. */
  nombreDelAgente?: string;
  organizacion: PiezaDelResumen[];
  bien: PiezaDelResumen[];
  frena: PiezaDelResumen[];
  retos: RetoDelResumen[];
  cifras: CifraDelResumen[];
  /** Sin cifras: qué dato falta para medir el impacto. */
  falta: string | null;
  faltaMano?: boolean;
}

/** Lo que falta validar (lo escrito; las áreas sin explorar y los niveles provisionales los calcula la página). */
export type TipoDePendienteGuardado = "sin-dato" | "hipotesis" | "contradiccion";
export const TIPOS_DE_PENDIENTE: readonly TipoDePendienteGuardado[] = ["sin-dato", "hipotesis", "contradiccion"];

export interface PendienteDelResumen {
  id: string;
  tipo: TipoDePendienteGuardado;
  texto: string;
  areaId: string | null;
  citas: CitaDelResumen[];
  mano?: boolean;
}

/** Una reunión que ya pasó, para «Qué hicimos». */
export interface SesionHecha {
  /** ISO. */
  fecha: string;
  /** El equipo con que fue («Ventas»), o null. */
  equipo: string | null;
  /** Lo que duró de verdad (la conferencia; si no, el evento). null: no se sabe (una reunión de HubSpot). */
  minutos: number | null;
  /** El área de la escala del equipo (`1` Ventas…): si el cliente no la ve, la sesión no se cuenta en su página. */
  areaId?: string | null;
  /** Quiénes de la empresa hablaron (normalizados): las personas se cuentan solo de las sesiones que se muestran. */
  quienes?: string[];
  /**
   * 24 nov (la preventa de un cliente): fue una REUNIÓN DE TRABAJO (`SesionPlaneada.deLoQueYaSabemos`), no una sesión de
   * diagnóstico. «Lo que hicimos» la nombra aparte: «N reuniones de trabajo juntos y N sesiones de diagnóstico» (D4).
   */
  deTrabajo?: true;
}

export interface AreaDelResumenGuardada {
  /** Formato 1. En el 2, siempre vacío. */
  hallazgos: HallazgoDelResumen[];
  /** Por qué está en su nivel y no uno arriba o abajo, con la firma de los niveles con que se escribió. */
  porque: { texto: string; firma: string; mano?: boolean } | null;
}

export interface ResumenGuardado {
  /** 1: el del 9 nov (datos rojos y hallazgos por equipo). 2: el resumen ejecutivo del 10 nov. */
  v: 1 | 2;
  /** Cuándo se armó (ISO) y quién lo pidió. */
  at: string;
  por: string | null;
  modelo: string;
  agentRunId: string | null;
  hicimos: {
    sesiones: SesionHecha[];
    /** Cuántas personas del cliente hablaron en las reuniones con texto. */
    personas: number;
    /** El texto de la parte, si una persona lo escribió. null: el de los datos. */
    texto: string | null;
  };
  /** Formato 1. */
  datosRojos: DatoRojo[];
  areas: Record<string, AreaDelResumenGuardada>;
  entendimos: PreguntaDelResumen[];
  /** Formato 1: «¿Falta algo?». */
  falta: PreguntaDelResumen[];
  /**
   * Lo que una persona quitó (`clavesDeQuitado`): «Rehacer con IA» no lo vuelve a poner (revisión del 9 nov: si la CEO no
   * quería ver una cifra y alguien la quitó, rehacer la publicaba de nuevo sin aviso).
   */
  quitados?: string[];
  /** Formato 2 (10 nov). */
  negocio?: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>>;
  recorrido?: EtapaDelResumen[];
  /** Forma editorial (15 nov): el título del recorrido («De la pauta en Meta a la compra en tienda.»). */
  tituloDelRecorrido?: { texto: string; mano?: boolean } | null;
  operativas?: AreaOperativa[];
  pendientes?: PendienteDelResumen[];
  /**
   * La firma de los niveles de cada equipo cuando se armó (`firmaDelArea`, 11 nov): si cambian, la pantalla interna avisa
   * «La escala cambió desde este resumen».
   */
  firmas?: Record<string, string>;
  /**
   * Qué falta confirmar de cada parte por explorar que determina el nivel de su equipo (11 nov: «provisional» se veía
   * inseguro). Una línea simple, por parte: «Confirmar cómo registran por qué ganan o pierden una venta; con eso…».
   */
  confirmar?: Record<string, string>;
  /** Las partes cuyo «confirmar» cambió o quitó una persona: «Rehacer con IA» no las pisa. */
  confirmarMano?: string[];
  /** Lo que el código vio al armarlo y conviene revisar adentro (un equipo con reunión que no está en el recorrido). */
  avisos?: string[];
  /** Los 5 puntos clave (18 nov), en orden de peso. */
  puntos?: PuntoClave[];
  /** Las reuniones que no se pudieron leer bien al armarlo (18 nov): se avisan en La escala y en su sesión. */
  malLeidas?: ReunionMalLeida[];
  /**
   * Se armó leyendo las reuniones ENTERAS (24 nov, Elías: «que se lean enteras»). Un Resumen sin esta marca con una reunión
   * cortada se arregla rehaciéndolo, y lo dice la línea de arriba de La escala; con la marca, una cortada era tan larga que
   * no entró ni con el tope nuevo.
   */
  leidasEnteras?: true;
}

/** Los topes de lo que escribe el agente. */
export const MAX_DATOS_ROJOS = 3;
export const MAX_HALLAZGOS_POR_AREA = 3;
export const MAX_PREGUNTAS = 3;
export const MAX_POR_PARTE_DEL_NEGOCIO = 2;
/** Cuántas piezas lleva cada parte del negocio: las etiquetas son tres (forma editorial, 15 nov); la tesis y el tamaño, una. */
export const maxDelNegocio = (tipo: TipoDelNegocio): number =>
  tipo === "etiquetas"
    ? MAX_ETIQUETAS
    : tipo === "tesis" || tipo === "tamano"
      ? 1
      : tipo === "quienes"
        ? MAX_LINEAS_DEL_MAPA
        : tipo === "portada"
          ? MAX_PARRAFOS_DE_LA_PORTADA
          : MAX_POR_PARTE_DEL_NEGOCIO;
/** Una línea de quién es quién: el equipo y su gente, corta. */
export const TOPE_DE_UNA_LINEA_DEL_MAPA = 140;

export const MAX_ETAPAS = 7;
export const MAX_AREAS_OPERATIVAS = 6;
/** Los retos de un subequipo: de 1 a 4 según su peso (18 nov; antes, exactamente 2). */
export const MAX_RETOS = 4;
/** Los puntos clave (18 nov, Marco: «5 puntos clave que están críticos»). */
export const MAX_PUNTOS = 5;
/**
 * Los candidatos a punto clave que se guardan hasta el final de la corrida (24 nov): el agente da 7 en orden de peso, y si
 * la revisión de lo ya resuelto saca uno, entra el siguiente. Al guardar quedan los 5 primeros.
 */
export const MAX_CANDIDATOS_A_PUNTO = 7;
export const MAX_CIFRAS_POR_AREA = 3;
export const MAX_PIEZAS_POR_LISTA = 3;
export const MAX_PENDIENTES = 2;
/** Lo que ve el cliente en «Qué falta validar» (11 nov): tres líneas como mucho. */
export const MAX_LINEAS_POR_VALIDAR = 3;
/**
 * Lo que puede tener una lista con lo que agrega una persona: más que lo del agente, pero con tope. La lectura del Json
 * (esquemas.ts) acepta más, así un Resumen nunca se pierde entero por pasarse.
 */
export const MAX_POR_LISTA = 8;
export const MAX_QUITADOS = 60;
export const TOPE_DEL_TEXTO_DEL_RESUMEN = 280;
/** Una afirmación para confirmar, una pregunta de la validación, la nota de una cifra o el dato que falta. */
export const TOPE_DE_UNA_PREGUNTA = 240;
/** «Por qué está ahí»: dos frases, con las partes por su nombre. */
export const TOPE_DEL_PORQUE = 480;

// ── Lo que lee el agente ────────────────────────────────────────────────────────

export interface ReunionParaElResumen {
  /** El id de la reunión (FirefliesSession). */
  id: string;
  /** Cómo la nombra el pedido: «R1». */
  clave: string;
  fecha: string;
  equipo: string | null;
  /**
   * El título de la reunión y lo que duró (18 nov): con eso el agente sabe de qué se habló y cuánto («COBRANZA», 73 min).
   * Solo los lee el agente: el cliente nunca ve un título de reunión.
   */
  titulo?: string | null;
  minutos?: number | null;
  /** Se le omitió un pedazo del medio por el tope de texto. */
  recortada?: boolean;
  /** 24 nov: una reunión de trabajo (lo que ya sabemos), no una sesión de diagnóstico: pesa menos. */
  deTrabajo?: true;
  /** Los que hablaron de Smarteam (por su correo, quien-hablo.ts): solo lo suyo sin corregir vale como cifra por confirmar. */
  deSmarteam?: string[];
  /** El equipo de la escala de la reunión («1» Ventas): con él se mira que cada equipo con reunión esté en el recorrido. */
  areaId?: string | null;
  turnos: TurnoNumerado[];
  /**
   * Los que hablaron del lado del cliente (quien-hablo.ts), sin el grabador ni la gente de otra empresa (la de HubSpot en
   * Centauro). Vacío: no se sabe, y NADIE cuenta como de la empresa (revisión del 9 nov).
   */
  delCliente: string[];
  /**
   * 21 nov: no es una reunión, es una NOTA DEL EQUIPO («Lo que sabes del cliente», notas-del-equipo.ts): quién la escribió
   * y cuándo. Pesa más que una reunión, y su cita sale adentro como «lo dijo <persona> del equipo».
   */
  delEquipo?: { por: string | null; en: string; nombre: string };
}

export interface AreaParaElResumen {
  id: string;
  nombre: string;
  /** El nivel general (del cálculo), su vecino de arriba y el de abajo. null sin nivel general («En medición»). */
  nivel: string | null;
  arriba: string | null;
  abajo: string | null;
  loQueMasFrena: string | null;
  dimensiones: { id: string; nombre: string; capa: string; nivel: string | null; porExplorar: boolean }[];
  /** Lo que el equipo de Smarteam escribió de este equipo para el agente (`contextoDeLaEscala`): pesa, no se copia. */
  contexto: string | null;
}

export interface ContextoDelResumen {
  empresa: string;
  areas: AreaParaElResumen[];
  reuniones: ReunionParaElResumen[];
  /** Las instrucciones del vendedor (`bloqueDeInstrucciones`), o "". */
  instrucciones: string;
  /** Lo que anotó el equipo de Smarteam (retos, metas, planes, su CRM): orienta, no es evidencia (`guiaDelEquipo`). */
  guia?: string;
  /** Los nombres de pila que no pueden salir (`textoValido` los rechaza): se le dicen al agente para que no los gaste. */
  noNombrar?: string[];
  /**
   * El peso de cada sesión (18 nov): su título, sus minutos y si se pudo leer. Va antes de las reuniones para que el
   * agente ordene los temas por cuánto se habló de cada uno (en Cemaco, crédito y cobro fue el 31 % del tiempo).
   */
  peso?: PesoDeLaSesion[];
  /**
   * Quiénes dirigen o deciden en la empresa (20 nov, la casilla «Quién decide», `quienesDecidenDe`): sin dinero dicho, el
   * titular y el reto principal salen de lo que MÁS repitieron ellos. Orienta; sus nombres nunca salen (`noNombrar`).
   */
  deciden?: string;
  /** La pérdida que la empresa validó en la preventa (`perdidaParaElAgente`): orienta qué pesa; su número lo pone la página. */
  perdida?: string;
  /**
   * La gente de la EMPRESA (24 nov): quienes hablaron de su lado en las reuniones y quienes deciden. Son los únicos nombres
   * que pueden salir, y solo en «Quién es quién» (`lineaDelMapa`). La de Smarteam o de otra empresa nunca.
   */
  gente?: string[];
}

/** Una sesión con su peso, para el agente. */
export interface PesoDeLaSesion {
  fecha: string;
  titulo: string | null;
  minutos: number | null;
  /** La clave con que va en el pedido («R3»), o null si no se leyó (sin transcripción). */
  clave: string | null;
  /** 24 nov: una reunión de trabajo (lo que ya sabemos): pesa menos que una sesión de diagnóstico. */
  deTrabajo?: true;
}

/** El modelo: lee las transcripciones enteras y escribe lo que lee la dirección del cliente; las citas las verifica el código. */
export const MODELO_DEL_RESUMEN = "claude-sonnet-4-6";
/**
 * Lo que puede escribir. El primer simulacro del 10 nov pedía hasta tres citas largas por pieza y se cortó a los 12 mil
 * (cuatro minutos): ahora una cita corta por pieza. Con margen, para no cortarse.
 */
export const MAX_TOKENS_DEL_RESUMEN = 16000;

const REGLAS = `Preparas el RESUMEN EJECUTIVO que Smarteam (una consultora de HubSpot) le presenta a una empresa después de las reuniones de diagnóstico de sus equipos. Lo lee la dirección de la empresa en 2 o 3 minutos y tiene que pensar: «entendieron cómo funciona mi negocio, cómo están organizadas mis áreas y qué problemas tenemos que resolver». En este entregable LA VERACIDAD ES LO MÁS IMPORTANTE: cada cosa tiene que ser exactamente lo que la empresa dijo. Lees las transcripciones (numeradas por turno), lo que ya se ubicó de cada equipo en la escala y una guía que anotó el equipo de Smarteam.

Devuelves SOLO este JSON (P = {"texto":"…","citas":[C]}; C = {"reunion":"R1","turno":12,"texto":"lo dicho, palabra por palabra"}):
{"tituloDelRecorrido":"…","negocio":{"tesis":[P],"etiquetas":[P,P,P],"tamano":[P],"vende":[P],"ingresos":[P],"abarca":[P],"fuera":[P],"motivo":[P],"busca":[P],"portada":[P,P],"quienes":[P,P,P]},
 "recorrido":[{"etapa":"…","quien":"<equipo o equipos, o null en el resultado>","texto":"…","friccion":"… o null","icono":"<uno de la lista>","continuo":false,"citas":[C],"traspaso":{"a":"<quien del paso siguiente>","texto":"…","cifra":"… o null","rotulo":"… o null","citas":[C]} o null}],
 "areas":[{"nombre":"…","area":"<id del equipo de la escala>","organizacion":[P],"bien":[P],"frena":[P],"retos":[{"texto":"…","dimension":"<id o null>","traspaso":"<id del otro equipo o null>","citas":[C]}],"cifras":[{"cifra":"…","texto":"…","estado":"declarado|estimado|pendiente|calculado","nota":"… o null","dimension":"<id o null>","citas":[C],"cuenta":[{"valor":"…","rotulo":"…","cita":C}] o null}],"falta":"… o null"}],
 "porque":[{"area":"<id del equipo>","texto":"…"}],
 "confirmar":[{"dimension":"<id de una parte con porExplorar>","texto":"…"}],
 "pendientes":[{"tipo":"sin-dato|hipotesis|contradiccion","area":"<id o null>","texto":"…","citas":[C]}],
 "puntos":[{"titulo":"…","texto":"…","area":"<id del equipo o null>","citas":[C]}]}

LA REGLA DE TODO: cada afirmación sobre la empresa (su negocio, su organización, sus etapas, sus retos, sus cifras) lleva en «citas» lo que dijo alguien de la EMPRESA que la sostiene: una cita, o dos si la afirmación junta cosas dichas en turnos distintos. Cada cita es el pedazo más corto que la sostenga, de 6 a 25 palabras seguidas de UNA intervención (aunque la pieza sea de tres palabras, su cita no baja de 6), copiado palabra por palabra como está en la transcripción (con sus repeticiones y muletillas, y sus números en cifras o en letras, como aparezcan), con su reunión y su turno. Nunca pegues pedazos con «;», «…» o «...» ni saltes palabras: si necesitas dos pedazos, son dos citas. Dentro de cualquier texto del JSON nunca escribas comillas dobles ("): si lo dicho las trae, usa « ». Todo lo que escribas tiene que estar en tus citas: cada número, cada herramienta y cada detalle; si ninguna cita lo dice, sácalo de la frase. Si lo dijo alguien de Smarteam, solo vale si alguien de la empresa lo confirmó justo después («Exacto», «Sí, correcto»): cita entonces lo que dijo Smarteam. La única excepción son las CIFRAS (ver 3): una que dijo Smarteam y la empresa no corrigió entra «pendiente». Lo que no puedas citar, no lo escribas. Nada de lecturas nuestras presentadas como dichas por ellos: no califiques lo que contaron («evitable», «innecesario», «se podría automatizar», «recuperable») si ellos no lo dijeron así. La «guia» del equipo de Smarteam te orienta sobre qué buscar; no es evidencia: nada sale de ella sin una cita de la transcripción.

LAS NOTAS DEL EQUIPO (N1, N2…, si te las damos): son lo que una persona del equipo de Smarteam CONFIRMÓ sobre la empresa y escribió en Nexus. Valen como evidencia y PESAN MÁS que las reuniones: si una nota y una reunión dicen cosas distintas (una cifra, quién decide, un problema que ya no aplica), escribe lo de la nota. Se citan como una reunión, con "reunion":"N1", su turno y lo escrito palabra por palabra. Las mismas reglas de siempre: solo lo que la nota dice, sin calcular ni concluir, y nunca el nombre de quien la escribió. No escribas que lo dijo el equipo: la página lo rotula sola. Una nota que es una tarea interna («llamar el lunes») o una opinión sin hecho no se usa.

0 EL PROBLEMA PRINCIPAL Y EL PESO (antes de escribir nada). PRIMERO busca el dolor que CRUZA EQUIPOS: el que aparece en las reuniones de dos o más equipos, o en el paso de un equipo a otro (lo que uno entrega y el otro no recibe, lo que uno no sabe del otro, los clientes o los leads que se pierden entre los dos). Si existe, ESE es el problema principal: va en el titular y en el primer punto clave, con citas de reuniones DISTINTAS (una de cada equipo). Un dolor de un solo equipo, aunque se repita, no le gana a uno que cruza equipos. Solo si ningún dolor cruza equipos, el problema principal es el del tema que más pesó. Para el peso te damos cada sesión con su título y sus minutos: con eso y con lo que se dijo, decide cuáles son los TEMAS de la empresa (un área, un proceso, un problema) y ordénalos: cuánto tiempo y cuántas reuniones se le dedicaron, y cuánto lo señaló la empresa como urgente o crítico. Los puntos clave y la mayor parte de las cifras siguen ese orden, pero CADA EQUIPO con reunión propia tiene su espacio (ver 3). Un tema del que se habló de pasada no puede ocupar el titular. El título de una reunión solo te orienta: nunca lo copies ni lo cites.

LO QUE NO VA: lo que la empresa ya resolvió o acordó cómo manejar (forma: «el sistema no tiene integración, pero exportamos a Excel y con eso basta»), y lo que no cambia el plan de trabajo. Antes de escribir un reto, un punto clave, una fricción o un pendiente, lee lo que se dijo DESPUÉS en esa misma reunión: si ahí se acordó cómo manejarlo (lo propuso la empresa o Smarteam y nadie lo objetó: un archivo que se exporta, un paso a mano que les sirve, «lo armamos con lo que es posible hoy»), ya está resuelto y no va. Si te queda la duda, no lo pongas.

LOS EQUIPOS se nombran como en los datos («Ventas», «Marketing», «Servicio» o el subequipo que la empresa nombró: «Soporte», «Customer Success»). Nunca «comercial», «el área comercial» ni «el equipo comercial»: para la empresa ese equipo es Ventas.

1 NEGOCIO (forma editorial: la dirección lo lee en 60 segundos). «tesis» (1): el TITULAR. Nombra el PROBLEMA PRINCIPAL de la empresa (regla 0: el que cruza equipos, si hay uno). Dos frases cortas, de 3 a 8 palabras cada una, terminadas en punto: la primera, qué pasa hoy en ese tema (qué se hace a mano, dónde se pierde, qué no se ve); la segunda, su escala o su consecuencia, con un número o un hecho de la empresa (forma: «Las citas se confirman a mano. Cada recepción llama a 200 pacientes.»); dos citas, una por frase. LO QUE MÁS PESA ES EL DINERO: si la empresa dijo cuánto le cuesta ese problema (lo que pierde, no cobra o deja de vender), esa cifra va en el titular tal como la dijo, con su moneda y su cita (forma: «Se pierden US$ 40 mil al mes. La cartera vencida no se cobra.»). Sin dinero dicho y sin un dolor que cruce equipos, el titular sale del dolor que MÁS repitieron quienes dirigen o deciden (te damos quiénes son), dicho como lo que no pueden hacer o lo que les cuesta (forma: «La gerencia no ve qué vende cada asesor.»). NUNCA un titular que solo describe cómo operan («Las ventas se gestionan por WhatsApp.»): eso no le dice a la dirección qué le duele. NUNCA dos hechos neutros de la operación («Las ventas son por teléfono. Los clientes pagan a plazos.» describe y no dice qué duele). Cada frase con sujeto y verbo claros, sin metáforas ni imágenes («clientes que no dejan rastro»). Nada aspiracional ni de folleto («visión compartida», «crecimiento», «transformación»). «etiquetas» (3): de 1 a 5 palabras cada una, sin verbo conjugado y sin punto: qué vende, a quién o dónde, y cómo vende o cobra («Clínicas veterinarias», «Dueños de mascotas», «Planes de salud por año»). «tamano» (0 o 1): el tamaño del negocio que dijo la empresa, con el número primero y su unidad («120 clínicas», «3.000 pedidos al mes»): clientes, sedes, tiendas, transacciones. Si la empresa respondió solo con un número («500.»), busca otra intervención suya que lo diga con su unidad y cita esa. Nunca la cifra de un área (leads de marketing, casos de soporte); si nadie lo dijo, vacío. «abarca» y «fuera» (0 o 1 cada una, hasta 15 palabras): qué cubre este diagnóstico (unidad, marcas, países, equipos) y lo que la empresa dijo que queda fuera (solo lo que dijo: no lo deduzcas de lo que sí entra). «vende» (qué vende y a quién), «ingresos» (cómo cobra: el modelo, nunca una meta ni un monto), «motivo» (qué los movió a buscar ayuda) y «busca» (el resultado que quieren): 0 o 1 frase corta cada una; sostienen la tesis y las etiquetas. Nada corporativo ni genérico. Si una parte no se habló, déjala vacía: no la completes con suposiciones ni con lo que sabes de la industria.
«portada» (1 o 2 párrafos): el resumen que va debajo del título del diagnóstico; lo primero que lee la dirección. Cada párrafo de 15 a 35 palabras (hasta 220 caracteres), en tercera persona, con el nombre de la empresa. El primero: en qué invierte hoy la empresa (equipos, canales, campañas, volumen) y dónde se rompe ese esfuerzo, con un número suyo si lo dijo (forma inventada: «Ferretería Norte invierte en tres tiendas y 20 vendedores, pero no sabe qué pedido sale de cada visita.»). El segundo, si hay de qué: dónde se pierde la trazabilidad o el dinero, con sus cifras (forma: «Los pedidos llegan por teléfono y se anotan en papel: la gerencia ve las ventas a fin de mes.»). Solo lo que dijo la empresa, con sus citas (hasta 3 por párrafo, una por cada dato); sin adjetivos de folleto.
«quienes» (QUIÉN ES QUIÉN, de 0 a 7 líneas): la gente de la empresa por su NOMBRE DE PILA, en qué equipo está y quién lidera. Si alguien lidera de forma transversal (la gerencia, quien dirige los equipos), la primera línea es «Lidera: <nombre>, <su rol como lo dijeron>». Después, una línea por equipo con reunión: «<equipo>: <nombres>» y, si lo dijeron, cuántos más y su rol («Marketing: Catalina, Verónica y Fabián», «Ventas: Laura y 8 asesores», «Soporte y onboarding: Emiley»). Hasta 140 caracteres por línea. Solo gente de la EMPRESA (te damos quiénes son); nunca de Smarteam ni de otra empresa. Un nombre va solo si esa persona habló en las reuniones o la cita lo nombra. Es la ÚNICA parte con nombres y NUNCA lleva un dolor, una crítica ni lo que alguien hace o no hace: solo quién está y dónde. Cada línea con su cita (la presentación de la persona, o lo dicho de quién lleva ese equipo).

2 RECORRIDO: sigue a UN cliente desde el primer contacto hasta que opera con lo que compró, como pasa HOY, en 3 a 5 PASOS en línea (la captación, la venta, el cierre, la puesta en marcha o la entrega). Junta en un paso las etapas seguidas del mismo equipo; cuando el cliente pasa de un equipo a otro, es otro paso. El ÚLTIMO paso en línea es el resultado para el cliente («La mascota en control», «Pedido entregado», «Mueble instalado»), con «quien» null si ya no lo lleva un equipo; es el ÚNICO paso en línea con «quien» null. Aparte, con «continuo»: true y al final, el equipo o los equipos que acompañan MIENTRAS el cliente opera (soporte, Customer Success, postventa, reclamos): 0 a 2. Cada equipo que tuvo una reunión aparece por lo menos en un paso. «etapa»: su nombre, de 2 a 4 palabras. «quien»: el equipo o los equipos de los datos que lo llevan, hasta 3 palabras («Ventas», «Soporte + Customer Success»); si lo lleva alguien que no es un equipo de los datos, su rol («Vendedores», «Bodega»). Nunca dos pasos seguidos con el mismo «quien» y el mismo ícono: son uno. «texto»: un detalle de hasta 6 palabras, sin verbo en segunda persona («Llamada, correo y la web», «Contrato y planos a fábrica»). «friccion»: lo que se traba en ese paso o al pasar al siguiente, hasta 18 palabras (null si no se vio). «icono»: uno de captacion, contacto, visita, demo, cotizacion, cierre, configuracion, entrega, tienda, opera, filtro, soporte. Cada paso con su cita. «traspaso»: en cada paso en línea cuyo paso siguiente lo lleva OTRO equipo, lo que pasa al pasar de uno a otro: «a» (el «quien» del paso siguiente), «texto» (qué pasa en el traspaso, de 4 a 12 palabras, sin «tu»: «Los leads llegan sin datos de la campaña»), «cifra» y «rotulo» (cuántos pasan, si la empresa lo dijo: «180» y «leads al mes»; si no, null) y su cita (la de la cifra, si la hay). null en el último paso, en los que acompañan y entre pasos del mismo equipo. Solo lo que hacen hoy: lo que desean o planean no es un paso; va en «busca». «tituloDelRecorrido»: «De <el primer paso> a <el último paso>.», en palabras del negocio, hasta 9 palabras («De la llamada al mueble instalado.»): como pasa HOY, nunca cómo debería ser ni lo que falta («con trazabilidad», «sin pérdidas»), y nada que los pasos no digan.

3 AREAS: una entrada por subequipo de cada equipo de la escala con el que hubo reunión, en orden de peso (el que más se habló primero). EL PISO: cada equipo con reunión propia lleva SIEMPRE su reto principal («frena») y por lo menos 2 retos, aunque se haya hablado poco de él; y no solo de cómo mide: lo que contó de su trabajo y de lo que le duele. LO QUE UN EQUIPO DICE DE OTRO (forma: Marketing cuenta que Ventas no le avisa qué pasó con los leads) es un reto del TRASPASO: va en el equipo que lo contó, con «traspaso» = el id del otro equipo (la página lo pone en los dos), y su cita es la de quien lo contó. Si un equipo tiene subequipos que trabajan distinto (Soporte y Customer Success dentro de «Servicio»), una entrada por subequipo, cada una con el id de ese equipo en «area»; si no, una sola entrada con el nombre del equipo. Un equipo sin reunión propia (aunque otro lo mencione) no lleva entrada. En cada una:
- «organizacion» (2): primero QUIÉNES son, por su rol y cuántos, de 2 a 6 palabras («Coordinación + 3 técnicos», «Una persona, con apoyo externo»); después QUÉ HACEN, de 6 a 12 palabras. Si no se dijo quiénes son, solo qué hacen. Cuántos: el total como lo dijeron («somos cuatro» incluye a quien habla); no agregues «por marca», «por país» ni repartos que la cita no diga. Un horario, un turno o la antigüedad del equipo no es ninguna de las dos. Nunca un nombre.
- «bien» (1): lo que ya hace o ya tiene (procesos, materiales, rutinas, mediciones), aunque sea a mano, de 6 a 12 palabras. Reconócelo siempre que la empresa lo haya dicho.
- «frena» (1): EL RETO PRINCIPAL del subequipo, el título de su fila, de 4 a 10 palabras, sin «tu» y SIN NÚMEROS (la cifra en dinero va en «cifras» y la página la pone arriba de este título): lo más importante que se conversó sobre cómo vende y cuánto dinero gana o pierde ese equipo; si no se habló de dinero, el dolor que más repitieron quienes dirigen o deciden. Es lo que duele, no cómo operan: «Cuentas a crédito que no se cobran a tiempo», «La gerencia no puede medir a ventas por resultados»; nunca «Gestión de ventas por WhatsApp» ni una herramienta. Con su cita.
- «retos» (de 2 a 4 según el PESO del subequipo: el tema que más pesó lleva 3 o 4, uno del que se habló poco lleva 2; el más respaldado primero): LOS PROBLEMAS QUE CAUSAN el reto principal, dichos como lo que hay que mejorar, de 5 a 10 palabras, empezando con un verbo en infinitivo y concreto de ESTA empresa («Confirmar cada cita un día antes», «Separar los reclamos de las consultas de uso»). Sale de un problema que la empresa contó, con su cita. Nunca «Implementar…» ni «Automatizar…» sueltos, ni una herramienta, ni lo que Smarteam vende: lo que hay que lograr, no cómo. Nunca un riesgo típico de la escala que la empresa no contó.
- «cifras» (de 0 a 2 según el PESO del subequipo; la más reveladora primero): la magnitud de lo que pasa HOY, primero lo que se pierde o se escapa (clientes que se van, casos que esperan, tiempo en retrabajo) antes que un volumen. LA PRIMERA, si se dijo, es CUÁNTO CUESTA EN DINERO: lo que se pierde, no se cobra o se deja de vender, con su moneda en «cifra» como la dijeron («US$ 40 mil», «₡ 12 M») y en «texto» qué es («al mes en cuentas que no se cobran»); la página la pone de titular de la fila. Vale la regla de siempre: la que dijo la empresa; la que dijo Smarteam si nadie la corrigió («pendiente»); si la corrigieron, la corregida. UNA CIFRA ES UN SOLO DATO: todos los números de «cifra» y de «texto» salen de UNA misma cita; dos datos dichos en momentos distintos (un porcentaje y una comparación) son dos cifras aparte, cada una con su estado. Una cifra mide cuánto pasa (clientes, casos, días, un porcentaje): una definición («consideras activo a quien abrió en los últimos 6 meses») no es una cifra. «cifra» es lo que va en grande: solo el número, hasta 12 caracteres («40», «120–150», «≈60», «3,5 %», «9 de 30»); «texto» es su rótulo, de 2 a 6 palabras, sin verbo y sin «tu» ni «tus» («reuniones por semana», «pedidos al mes», «clientes que se van al mes»); el período y el contexto, si hacen falta, van en «nota». Si la cita da un rango o una lista de valores, la cifra es el rango como lo dijeron; nunca llames «máximo», «mínimo» ni «promedio» a un valor si no lo dijeron así. «estado»: «declarado» si lo dijo la empresa; «estimado» si es un cálculo o un resumen de Smarteam que la empresa confirmó (en «nota», la base y los supuestos); «pendiente» si se mencionó y hay que confirmarlo; «calculado» si es CUÁNTO CUESTA y sale de multiplicar números que dijo la empresa (forma: 10 clientes que se van al mes y US$ 85 de cuota). En una «calculado» NO haces la cuenta: das «cuenta», de 2 a 3 factores, cada uno con «valor» (UN número como lo dijo la empresa, con su moneda o su «%»; nunca un rango ni «9 de 30»), «rotulo» (qué es, de 1 a 6 palabras, con el período si lo tiene: «clientes que se van al mes», «de cuota al mes»; si dos factores tienen período, el mismo) y «cita» (la de la EMPRESA que dice ese número, y su moneda si la tiene); «cifra» va vacía y «texto» dice qué cuesta («al mes en clientes que se van»). Nexus multiplica y quien presenta confirma la cuenta. Solo multiplicar: nunca sumas ni restas en una cuenta. Úsala cuando la empresa dio los números y no dijo el total en dinero. USA TODO lo que cambia el plan: una cifra que dijo alguien de Smarteam y la empresa NO corrigió en los turnos siguientes (no dijo que no, no dio otro número, no la puso en duda) también va, con «estado» «pendiente» y su cita de lo que dijo Smarteam; si la empresa la corrigió, no la pongas (o pon la corregida, con la cita de la empresa). «nota» le habla a la empresa («Falta confirmar el período y cómo se calcula»): nunca cita lo dicho ni dice quién lo dijo («según…», «estimado por…»). Si lo dijeron con dudas («si no me equivoco», «no tengo el dato exacto»), «nota» dice qué falta validar. Escribe la cifra como la dijeron («9 de 30», nunca la resta «21»): no calcules porcentajes, ni sumes, ni redondees. Si los números de una cita no cuadran entre sí (una parte más grande que el total, una suma que no da, una frase cortada), no la pongas en «cifras»: va en PENDIENTES como «Confirmar el total de…». Si la cita da un valor habitual y uno ocasional («en promedio 24 horas, a veces tres días»), la cifra es el habitual y el otro va en «nota»; no califiques el rótulo («habitual», «típico») si no lo dijeron. Una meta («quieren llegar a 50») no es una cifra de hoy: no la pongas sola; si la usas, que la cifra sea el resultado de hoy frente a la meta («25 de 50 reuniones»). Una comparación entre dos números que resumió Smarteam y la empresa confirmó («entran 40 y se van 9») es una cifra «estimado» valiosa: inclúyela con su base, sin sacar conclusiones. No saques conclusiones que la cifra no dice («tu cartera no crece»). Nunca inventes pérdidas en dinero.
- «falta»: solo si ninguna cifra es en dinero (ni «calculado») Y el dato existe y no se dio: qué falta para saber CUÁNTO LE CUESTA, en una frase que le habla («Falta medir cuánto deja de cobrar la cartera vencida al mes»); la página lo pone como «por validar». Si la empresa dijo que NO tiene ese dato o no lo mide («no tenemos trazabilidad», «no sabemos cuántos se pierden»), eso es un HALLAZGO: va como reto (o reto principal), y «falta» es null. Nunca un monto que nadie dijo. Con una cifra en dinero, null.

4 PORQUE (uno por equipo de la escala con nivel): una o dos frases (hasta 50 palabras) de por qué está en su nivel y no uno arriba ni uno abajo, con las partes por su nombre. Usa SOLO los niveles que te damos. Nunca escribas «provisional» ni «hipótesis»: si el nivel lo determina una parte con «porExplorar», di qué mide esa parte y no la presentes como un hecho («no existe»).

5 CONFIRMAR (una por cada parte con «porExplorar» que determina el nivel de su equipo): una línea simple que diga qué falta confirmar, sin tono de duda y terminando con qué se logra. Ejemplo: «Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas».

6 PENDIENTES (0 a 2, solo lo que podría cambiar el diagnóstico): una línea cada uno, en palabras simples, dicha como lo que hay que hacer («Confirmar cuántos casos recibe Soporte al mes en total»). «sin-dato»: se preguntó, el dato existe y quedaron de darlo (si la empresa dijo que no lo tiene o no lo mide, NO es pendiente: es un reto); «hipotesis»: algo que creemos y falta validar; «contradiccion»: dos cosas dichas que no cuadran (con las dos citas). Un equipo con el que no se conversó NO va aquí (se agrega solo) y nunca se presenta como de bajo rendimiento; lo de «confirmar» tampoco se repite aquí. Nunca cuentes cómo se armó una cifra ni qué se dijo en qué momento de la reunión («se construyó combinando…», «se dijo con dudas»): di solo qué hay que confirmar.

7 PUNTOS CLAVE (7 candidatos en orden de peso; la página se queda con los 5 primeros que pasen la verificación): lo MÁS CRÍTICO de toda la empresa (el primero, del tema que más pesó). Explican más que el titular: no lo repitas palabra por palabra. «titulo»: de 3 a 8 palabras, qué está crítico hoy, sin «tu», con lo que le cuesta a la empresa si lo dijo («US$ 40 mil al mes sin cobrar», «La cartera se asigna a mano»); nunca cómo operan sin decir qué duele; si lleva un número, la cita de ese número va en «citas»; «texto»: una o dos frases, de 12 a 30 palabras y hasta 220 caracteres (cuéntalos: lo más largo se descarta), qué pasa y dónde, con lo que la empresa dijo; una consecuencia SOLO si la empresa la dijo (nunca «puede dañar…», «genera fricciones»: eso es una lectura nuestra); «area»: el id del equipo de la escala del que habla, o null. Cada uno con su cita de la EMPRESA, copiada palabra por palabra (es lo que más se cae); ninguno es una recomendación, una herramienta ni lo que Smarteam vende.

CÓMO DISTINGUIR: que algo no se haya preguntado no significa que no lo tengan: «no tienen X» solo si la empresa lo dijo. Separa lo que hacen hoy (organización, recorrido, retos, cifras), lo que quieren (busca, metas) y lo que propondríamos nosotros (eso no va aquí). No asumas herramientas, integraciones ni compras: una herramienta se nombra solo si la empresa la nombró en sus reuniones.

LOS EJEMPLOS de estas reglas son inventados: muestran la FORMA, no el contenido. No copies su estructura ni sus palabras; cada pieza sale de las reuniones de ESTA empresa.

Cómo escribes: español neutro, nunca voseo. El tuteo («tu equipo», «tus clientes») es para las frases que le hablan a la empresa: la fricción, «falta», los pendientes, «confirmar», el «porque» y el texto de un punto clave. Las etiquetas, el tamaño, el paso y su detalle, la organización, lo que funciona, los retos, el título de un punto clave y el rótulo de una cifra son rótulos: sin «tu» ni «tus» y sin verbos en segunda persona («Envía el blog cada mes a…», no «Envías…»). Cada pieza con el largo que se le pide arriba (un pendiente o un «confirmar», de 6 a 16 palabras; un «porque», hasta 50), en presente, sin markdown ni frases hechas: si no cabe, quita palabras, nunca hechos. Ningún texto pasa de 240 caracteres: el código descarta lo más largo. Nunca el código de una parte («3.6»): su nombre. Nunca escribas el nombre de una persona (ni de la empresa ni de Smarteam): di su rol («quien lleva Customer Success», «la jefatura de ventas»). La única excepción es «quienes», con la gente de la empresa. No nombres a Smarteam, no hables de precios, presupuestos ni de lo que Smarteam vende, no recomiendes herramientas. Habla SOLO de los equipos de los datos.`;

/**
 * La tabla del peso (18 nov): cada sesión con sus minutos y su parte del tiempo total, la más larga primero. Las que no se
 * pudieron leer van igual (pesan: se habló de eso), marcadas.
 */
export function bloqueDelPeso(peso: readonly PesoDeLaSesion[]): string {
  const total = peso.reduce((s, x) => s + (x.minutos ?? 0), 0);
  return [...peso]
    .sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0))
    .map((x) => {
      const parte = total && x.minutos ? ` (${Math.round((100 * x.minutos) / total)} %)` : "";
      return `- ${x.clave ?? "sin texto"} · ${x.fecha.slice(0, 10)} · «${x.titulo ?? "sin título"}» · ${x.minutos ? `${x.minutos} min${parte}` : "duración desconocida"}${x.deTrabajo ? ` · ${COMO_SE_NOMBRA_UNA_DE_TRABAJO}` : ""}`;
    })
    .join("\n");
}

/**
 * Cuánto texto lee el agente de cada reunión (18 nov). Antes el tope se partía en partes iguales y a las largas se les
 * cortaba el medio aunque todo cupiera (Cemaco: 294 mil de 320 mil, y las dos de cobranza perdieron el 23 % y el 31 %).
 * Ahora, si todo cabe, nada se corta; si no, las cortas van enteras y lo que queda se reparte entre las largas. Ninguna
 * pasa de `porUna`. Devuelve el tope de cada una, en el mismo orden.
 */
export function repartirElTope(largos: readonly number[], total: number, porUna: number): number[] {
  const topes = largos.map(() => 0);
  let queda = total;
  let pendientes = largos.map((_, i) => i);
  // Por niveles: en cada vuelta, la parte justa de lo que queda; la que pide menos se lleva lo suyo y sale.
  while (pendientes.length) {
    const justo = Math.floor(queda / pendientes.length);
    const caben = pendientes.filter((i) => Math.min(largos[i], porUna) <= justo);
    if (!caben.length) {
      for (const i of pendientes) topes[i] = Math.min(justo, porUna);
      break;
    }
    for (const i of caben) {
      topes[i] = Math.min(largos[i], porUna);
      queda -= topes[i];
    }
    pendientes = pendientes.filter((i) => !caben.includes(i));
  }
  return topes;
}

/**
 * Menos de esto de lo dicho por la empresa: la reunión fue casi toda nuestra (Cemaco, 16 nov: 27 %). Medido con Cemaco:
 * con un tercio se marcaban también el arranque (30 %) y una demo (31 %), que son nuestras por naturaleza y se leen bien.
 */
export const PARTE_MINIMA_DEL_CLIENTE = 0.28;

/** Cómo nombra el pedido del Resumen una reunión de trabajo (24 nov, la preventa de un cliente). */
export const COMO_SE_NOMBRA_UNA_DE_TRABAJO = "reunión de trabajo (lo que ya sabemos)";

/**
 * Lo que dice el pedido cuando entre las reuniones hay de trabajo (24 nov, DECISIONS «La escala de un cliente con lo que ya
 * sabemos»): valen, pero pesan menos que una sesión de diagnóstico, y nunca se presentan como exploración.
 */
export const REGLA_DE_LAS_REUNIONES_DE_TRABAJO =
  "Las reuniones marcadas «reunión de trabajo» son capacitaciones o revisiones de avance con Smarteam, no sesiones de diagnóstico: lo que la empresa contó ahí de cómo trabaja hoy vale como evidencia, pero pesa menos que lo que dijo en una sesión de diagnóstico (si se contradicen, vale la sesión de diagnóstico), y lo que Smarteam explicó o configuró en ellas no es un hallazgo de la empresa. Nunca las llames sesiones de exploración ni de diagnóstico.";

/**
 * Si una reunión no se pudo leer bien (18 nov): se le cortó un pedazo del medio, o la empresa dijo menos del 28 % de lo
 * dicho. `largo` y `leido`: los caracteres de la reunión entera y los que leyó el agente; `delCliente`: los de la empresa.
 * null: se leyó bien.
 */
export function comoSeLeyo(
  r: Pick<ReunionParaElResumen, "id" | "fecha" | "titulo" | "delCliente">,
  o: { largo: number; leido: number; delCliente: number },
): ReunionMalLeida | null {
  const motivos: ReunionMalLeida["motivos"] = [];
  if (o.leido < o.largo) motivos.push("recortada");
  // Sin saber quién habló de la empresa (sin hablantes), no se puede decir que habló poco.
  if (r.delCliente.length > 0 && o.largo > 0 && o.delCliente / o.largo < PARTE_MINIMA_DEL_CLIENTE) motivos.push("poco-del-cliente");
  if (!motivos.length) return null;
  return {
    reunion: r.id,
    fecha: r.fecha,
    titulo: r.titulo ?? null,
    motivos,
    leido: o.largo ? Math.round((100 * Math.min(o.leido, o.largo)) / o.largo) : 100,
    delCliente: o.largo ? Math.round((100 * o.delCliente) / o.largo) : 0,
  };
}

/** El pedido al agente. `aviso`: por qué no sirvió el intento anterior. */
export function pedidoDelResumen(ctx: ContextoDelResumen, aviso = ""): Anthropic.Messages.MessageCreateParamsNonStreaming {
  // Las notas del equipo van aparte y antes de las reuniones, con su peso (21 nov, notas-del-equipo.ts).
  const notas = ctx.reuniones.filter(esNotaDelEquipo);
  const reuniones = ctx.reuniones.filter((r) => !esNotaDelEquipo(r)).map(
    (r) =>
      `### ${r.clave} · ${r.fecha.slice(0, 10)}${r.titulo ? ` · «${r.titulo}»` : ""}${r.minutos ? ` · ${r.minutos} min` : ""}${r.equipo ? ` · con ${r.equipo}` : ""}${r.deTrabajo ? ` · ${COMO_SE_NOMBRA_UNA_DE_TRABAJO}` : ""}${r.recortada ? " · (se omitió un pedazo del medio por largo)" : ""}\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`,
  );
  const conDeTrabajo = ctx.reuniones.some((r) => !esNotaDelEquipo(r) && r.deTrabajo);
  const partes = [
    `La empresa: ${ctx.empresa}`,
    `Sus equipos de la escala, con lo que ya se ubicó:\n${JSON.stringify(ctx.areas, null, 1)}`,
    ctx.peso?.length ? `El peso de cada sesión (para ordenar los temas, regla 0):\n${bloqueDelPeso(ctx.peso)}` : "",
    ctx.guia ? `La guía del equipo de Smarteam (orienta; no es evidencia):\n${ctx.guia}` : "",
    ctx.deciden ? `Quiénes dirigen o deciden en la empresa (sus dolores pesan más; nunca escribas sus nombres):\n${ctx.deciden}` : "",
    ctx.perdida ?? "",
    bloqueDeLasNotas(notas),
    conDeTrabajo ? REGLA_DE_LAS_REUNIONES_DE_TRABAJO : "",
    `${conDeTrabajo ? "Las reuniones con la empresa" : "Las reuniones de diagnóstico"} (cada línea es un turno: [número] quien habla: lo que dijo):\n\n${reuniones.join("\n\n")}`,
    ctx.noNombrar?.length ? `Nombres que NUNCA van en lo que escribes (di su rol), salvo los de la gente de la empresa en «quienes»: ${ctx.noNombrar.join(", ")}.` : "",
    ctx.gente?.length ? `La gente de la EMPRESA (los únicos nombres de «quienes»): ${ctx.gente.join(", ")}.` : "",
    ctx.instrucciones,
    aviso,
  ].filter(Boolean);
  return { model: MODELO_DEL_RESUMEN, max_tokens: MAX_TOKENS_DEL_RESUMEN, system: REGLAS, messages: [{ role: "user", content: partes.join("\n\n") }] };
}

/**
 * Lo que anotó el equipo (las casillas de la exploración), corto y como guía: retos, metas, planes y su CRM. SOLO casillas que
 * pueden ir al cliente (`alCliente`): «Particularidades» es interna y un pendiente sin cita podría repetirla (revisión del 10 nov).
 */
export function guiaDelEquipo(casillas: Readonly<Record<string, unknown>>): string {
  const lineas = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).flatMap((x) => {
      if (typeof x === "string") return [x];
      const o = objeto(x);
      const t = cadena(o.texto) || cadena(o.que);
      return t ? [`${t}${cadena(o.actual) ? ` (hoy: ${cadena(o.actual)})` : ""}`] : [];
    });
  const bloques: [string, unknown][] = [
    ["Retos anotados", casillas.retos],
    ["Metas anotadas", casillas.metas],
    ["Planes que mencionaron", casillas.planes],
    ["Su CRM y sus herramientas, según el equipo", casillas.hubspotActual],
  ];
  return bloques
    .map(([t, v]) => [t, lineas(v).slice(0, 12)] as const)
    .filter(([, xs]) => xs.length)
    .map(([t, xs]) => `${t}:\n${xs.map((x) => `- ${x.slice(0, 300)}`).join("\n")}`)
    .join("\n");
}

/**
 * Quiénes dirigen o deciden (20 nov), de la casilla «Quién decide» (`autoridad`): quien aprueba y quien decide, con su
 * cargo. Es interna (no va a la propuesta): acá solo le dice al agente de quién pesan más los dolores. Sus nombres van a la
 * lista de los que no salen (`nombresDeQuienesDeciden`).
 */
/**
 * Un grupo o un cargo anotado en «Quién decide» («Equipo de ventas», «Gerencia», el ejemplo de la casilla): no es una
 * persona. Si entrara a los nombres que no salen, el Resumen descartaría toda frase con «equipo» o «gerencia» (revisión del
 * 20 nov).
 */
const NO_ES_UN_NOMBRE = /^(el|la|los|las|un|una|equipo|equipos|gerencia|gerente|direcci[oó]n|director|directora|junta|comit[eé]|[aá]rea|departamento|jefatura|jefe|jefa|socios?|due[nñ]os?|todos|area|staff|consejo|ventas|marketing|servicio|finanzas|operaciones|compras)\b/i;
const esUnaPersona = (p: Record<string, unknown>) => {
  const n = cadena(p.nombre);
  return n.length >= 3 && !NO_ES_UN_NOMBRE.test(n);
};
const decideOAprueba = (p: Record<string, unknown>) => cadena(p.rol) === "firma" || cadena(p.rol) === "decide";

export function quienesDecidenDe(casillas: Readonly<Record<string, unknown>>): string {
  return arreglo(casillas.autoridad)
    .map(objeto)
    .filter((p) => decideOAprueba(p) && esUnaPersona(p))
    .slice(0, 6)
    .map((p) => `- ${cadena(p.nombre).slice(0, 60)}${cadena(p.cargo) ? ` (${cadena(p.cargo).slice(0, 60)})` : ""}: ${cadena(p.rol) === "firma" ? "aprueba" : "decide"}`)
    .join("\n");
}

/** Los nombres de quienes deciden: no pueden salir en lo que escribe el agente, aunque no hayan hablado en las reuniones. */
export function nombresDeQuienesDeciden(casillas: Readonly<Record<string, unknown>>): string[] {
  return arreglo(casillas.autoridad)
    .map(objeto)
    .filter(esUnaPersona)
    .map((p) => cadena(p.nombre));
}

// ── Leer y verificar ────────────────────────────────────────────────────────────

const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arreglo = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cadena = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : typeof v === "number" ? String(v) : "");
/** null, "null", "" o un texto vacío: no hay. */
const nulo = (v: unknown) => !cadena(v) || /^(null|ninguna?|n\/a)$/i.test(cadena(v));

/** Lo que nunca sale: plata de una venta y quién la vende (un monto que perdió la empresa sí, en una cifra con su cita). */
const PROHIBIDO = /\bpresupuesto\b|\bprecio\b|\btarifa\b|\bsmarteam\b|\blicencia/;
/** Lo prohibido que sí vale cuando la empresa lo dijo en lo citado: las tarifas y los precios de SU negocio (un hotel). */
const DE_SU_NEGOCIO = /^(precio|tarifa)$/;

export interface ReglasDelResumen {
  /** Los nombres de la gente de Smarteam y de quienes hablaron en las reuniones: ninguno sale. */
  personas: readonly string[];
  /** Los equipos de la escala que el cliente NO ve («Marketing»): ningún texto habla de ellos. */
  areasFuera?: readonly string[];
  /**
   * Los nombres de los equipos de la escala: si uno se llama «Comercial» (una edición de la escala), nombrarlo así vale.
   * Si no, «el equipo comercial» no sale (24 nov, Centauro): para la empresa ese equipo es Ventas.
   */
  equipos?: readonly string[];
}

/**
 * Un equipo nombrado «comercial» (24 nov, Centauro: «El equipo comercial no registra sus actividades»). Los equipos se
 * nombran como en la escala. Solo cuando nombra a un EQUIPO o a su gente: «la propuesta comercial» no es un equipo. Sobre
 * `paraComparar`.
 */
const EQUIPO_COMERCIAL = /\b(equipos?|areas?|departamentos?|gerencias?|jefaturas?|lado|parte|fuerza) comercial(es)?\b|\blos comerciales\b|\bcomercial(es)? (y|e) (marketing|mercadeo|servicio)\b|\b(marketing|mercadeo|servicio) (y|e) (lo )?comercial\b/;

/**
 * ¿El texto pasa las reglas de lo que lee el cliente? Sin voseo, sin personas, sin precios ni Smarteam, y con tope. Los
 * números se miran aparte (cada pieza contra lo suyo).
 */
export function textoValido(crudo: unknown, tope: number, o: ReglasDelResumen, citado = ""): { ok: true; texto: string } | { ok: false; motivo: string } {
  const texto = cadena(crudo);
  if (!texto) return { ok: false, motivo: "vino vacío" };
  if (texto.length > tope) return { ok: false, motivo: `es demasiado largo (${texto.length} de ${tope})` };
  const t = paraComparar(texto);
  const enLoCitado = paraComparar(citado);
  const prohibido = [...t.matchAll(new RegExp(PROHIBIDO.source, "g"))].map((m) => m[0]).find((x) => !(DE_SU_NEGOCIO.test(x) && enLoCitado.includes(x)));
  if (prohibido) return { ok: false, motivo: `habla de «${prohibido}»` };
  const voseo = voseoDelResumen(texto);
  if (voseo.length) return { ok: false, motivo: `está en voseo (${voseo.join(", ")})` };
  // Quién lo dijo no le llega al cliente (11 nov: «La supervisora identificó que…»): se dice lo que pasa, no quién lo contó.
  const quien = t.match(QUIEN_LO_DIJO);
  if (quien) return { ok: false, motivo: `cuenta quién lo dijo («${quien[0]}»)` };
  // «Provisional» e «hipótesis» se ven inseguros (Elías, 11 nov): lo que falta se dice como lo que hay que confirmar.
  const duda = t.match(/\bprovisional(es)?\b|\bhipotesis\b/);
  if (duda) return { ok: false, motivo: `dice «${duda[0]}»` };
  // Una palabra del código («porExplorar», «hubspotActual») es de adentro.
  const interna = texto.match(/\b[a-z]{2,}[A-Z]\w*\b/);
  if (interna) return { ok: false, motivo: `trae una palabra interna («${interna[0]}»)` };
  // El código de una parte («(3.6)») es de adentro: el cliente lee su nombre.
  if (/\(\s*\d{1,2}\.\d{1,2}\s*\)/.test(texto)) return { ok: false, motivo: "trae el código de una parte de la escala" };
  // «Comercial» no es un equipo de la escala (24 nov): se pide corregido con el nombre del equipo (es de forma).
  const comercial = (o.equipos ?? []).some((e) => /comercial/.test(paraComparar(e))) ? null : t.match(EQUIPO_COMERCIAL);
  if (comercial) return { ok: false, motivo: `nombra un equipo como «comercial» («${comercial[0]}»): nómbralo como en la escala (Ventas)` };
  for (const area of o.areasFuera ?? []) {
    const a = paraComparar(area);
    if (a && new RegExp(`(^|[^\\p{L}])${a}($|[^\\p{L}])`, "u").test(t)) return { ok: false, motivo: `habla de un equipo que el cliente no ve («${area}»)` };
  }
  for (const nombre of o.personas) {
    const primero = paraComparar(nombre.trim().split(/\s+/)[0] ?? "");
    if (primero.length >= 3 && new RegExp(`(^|[^\\p{L}])${primero}($|[^\\p{L}])`, "u").test(t)) return { ok: false, motivo: `nombra a una persona («${nombre.split(/\s+/)[0]}»)` };
  }
  return { ok: true, texto };
}

/** Futuros que terminan en -rás (iguales en tuteo). */
const FUTUROS = new Set(["podras", "tendras", "haras", "sabras", "querras", "pondras", "saldras", "vendras", "diras", "habras", "valdras", "cabras", "veras", "seras", "estaras", "iras", "daras"]);

/** Nombres que terminan como un verbo en voseo: con mayúscula al empezar una frase son nombres, no voseo. */
const NOMBRES_AGUDOS = new Set(["tomas", "andres", "ines", "jesus", "matias", "elias", "tobias", "nicolas", "moises", "jonas", "isaias", "lucas", "ulises", "dionis", "paris", "pais", "anis", "seis", "ademas", "despues", "atras", "jamas", "quizas", "detras", "demas", "interes", "ingles", "frances", "japones", "portugues", "mes", "tres", "tambien", "ningun", "algun", "estres", "expres", "cortes", "traves", "reves", "marques", "lograras", "recibiras"]);

/**
 * El voseo de lo que escribe el agente para el cliente (12 nov, Centauro: «Considerás activo a quien…» pasó): lo que caza
 * `voseoEnProsa` y, además, el verbo agudo en -ás, -és o -ís con mayúscula al empezar una frase, que ella deja pasar
 * porque suele ser un nombre. Aquí no van nombres de personas, y los que terminan así están en la lista de arriba.
 */
export function voseoDelResumen(texto: string): string[] {
  const out = new Set(voseoEnProsa(texto));
  for (const m of texto.matchAll(/(?:^|[.!?¿¡:;]\s*|\n\s*)(\p{Lu}\p{Ll}{2,}(?:ás|és|ís))(?!\p{L})/gu)) {
    const w = m[1];
    if (!NOMBRES_AGUDOS.has(paraComparar(w)) && !FUTUROS.has(paraComparar(w))) out.add(w);
  }
  // El presente en -rás («considerás», «registrás») que `voseoEnProsa` deja pasar por el futuro («podrás»): aquí se escribe
  // en presente, así que solo se perdonan los futuros irregulares de la lista.
  for (const m of texto.matchAll(/(?<!\p{L})(\p{Ll}{3,}r(?:ás|és|ís))(?!\p{L})/gu)) if (!FUTUROS.has(paraComparar(m[1])) && !NOMBRES_AGUDOS.has(paraComparar(m[1]))) out.add(m[1]);
  return [...out];
}

/** Un texto que cuenta quién dijo algo («la supervisora identificó», «el responsable mencionó»). */
const QUIEN_LO_DIJO = /\b(la|el|los|las|su|tu|segun la|segun el)\s+(supervisora?|responsables?|jef[ae]s?|jefatura|gerentes?|directora?|dueñ[oa]s?|duen[oa]s?|lider(es)?|encargad[oa]s?|coordinador[a]?|asesor[a]?|vendedor[a]?)\b[^.]{0,60}?\b(dijo|dijeron|comento|comentaron|menciono|mencionaron|identifico|identificaron|explico|aclaro|reporto|senalo|indico|conto|aporta|aporto)\b/;

/** «1 800» (con un espacio, también el fino) es «1800»: así lo escribe el modelo y así no lo dice la transcripción. */
const sinEspaciosDeMiles = (x: string) => x.replace(/(\d)[   ](?=\d{3}(?!\d))/g, "$1");

/**
 * Las cantidades en palabras que `cantidadesDe` no convierte (ella sabe de «dos» a «doce», «quince», las decenas redondas
 * y «cien»): «trece», «la mitad», «un tercio». Cada una vale si la fuente dice la misma palabra o el mismo número.
 */
const CANTIDADES_EN_PALABRAS: Readonly<Record<string, string | null>> = {
  trece: "13", catorce: "14", dieciseis: "16", diecisiete: "17", dieciocho: "18", diecinueve: "19",
  veintiuno: "21", veintidos: "22", veintitres: "23", veinticuatro: "24", veinticinco: "25", veintiseis: "26", veintisiete: "27", veintiocho: "28", veintinueve: "29",
  sesenta: "60", setenta: "70", ochenta: "80", noventa: "90", ciento: "100",
  doscientos: "200", trescientos: "300", cuatrocientos: "400", quinientos: "500", seiscientos: "600", setecientos: "700", ochocientos: "800", novecientos: "900",
  mil: "1000", miles: null, millon: null, millones: null, cientos: null, centenar: null, docena: null,
  mitad: null, tercio: null, tercera: null, cuarta: null, quinta: null, doble: null, triple: null, cuadruple: null, porcentaje: null,
};

/**
 * Una cantidad con su multiplicador en su forma de número: «23 mil» (`23·mil`) es «23 000» (`23000·`); «2,5 mil», 2500
 * (12 nov, Centauro: «~23 000 contactos» se caía porque la cita decía «23 mil»).
 */
function enNumero(c: string): string {
  const [n, m] = c.split("·");
  if (m !== "mil") return c;
  const v = Number(n.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? `${Math.round(v * 1000)}·` : c;
}
const conMilesDecimales = (x: string) => x.replace(/(\d+)[.,](\d{1,2})\s*mil(?!\p{L})/giu, (_, a: string, b: string) => String(Math.round(Number(`${a}.${b}`) * 1000)));
const cantidadesNormales = (x: string) => cantidadesDe(sinEspaciosDeMiles(conMilesDecimales(x))).map(enNumero);

/** Un número chico (hasta 12: «dos marcas», «tres asesores»). */
const ES_CHICO = (c: string) => /^(\d{1,2})·$/.test(c) && Number(c.slice(0, -1)) <= 12;
/** Un año. */
const ES_ANIO = (c: string) => /^(19|20)\d\d·$/.test(c);

/** Lo que vale además de la cita corta: los turnos vecinos (números chicos) y los años de las reuniones (12 nov). */
export interface ContextoDeLaCita {
  /** Lo dicho por la empresa en los turnos cercanos a las citas: de ahí valen los números chicos. */
  chicos?: string;
  /** Los años de las reuniones y los que la empresa dijo como año («en 2025», «desde 2024»). */
  anios?: string;
}

/**
 * «1 mes» con «un mes» en la fuente: el 1 en letras vale solo con la misma palabra al lado (12 nov, la revisión: un «un»
 * cualquiera sostenía cualquier 1).
 */
function unoEnLetras(texto: string, fuente: string): boolean {
  const f = paraComparar(fuente);
  const unos = [...paraComparar(texto).matchAll(/(?:^|\s)1\s+(\p{L}+)/gu)];
  return unos.length > 0 && unos.every((m) => new RegExp(`(^|\\s)(un|una|uno)\\s+${m[1]}(\\s|$)`, "u").test(f));
}

/** Lo que cuenta cómo debería ser el recorrido, no cómo es (el título del recorrido). Sobre `paraComparar`. */
const TITULO_ASPIRACIONAL = /\bcon (trazabilidad|visibilidad|control)\b|\bsin (friccion|fricciones|perdidas)\b|\bautomatiz|\bcentraliz/;

/** «Según quien coordina…», «estimado por la coordinadora…»: la nota de una cifra no dice quién lo dijo. Sobre `paraComparar`. */
const NOTA_CON_QUIEN = /\bsegun (quien|la persona|el equipo|la coordinadora|el coordinador|la jefatura|el jefe|la jefa|la gerencia|el gerente|la gerente|la encargada|el encargado)\b|\bestimad[oa] por\b|\bquien (coordina|lleva|gestiona|dirige)\b/;

/** El primer número de dos cifras, para no repetir la misma con otra forma («~50 formularios web/semana», «≈50 /semana»). */
const mismoPrimerNumero = (a: string, b: string) => {
  const x = cantidadesNormales(a);
  const y = cantidadesNormales(b);
  // Los mismos números y la misma clase: «40 tickets» y «40 %» son dos cifras; «3 días» y «3 de cada 10», también.
  return x.length > 0 && x.join("|") === y.join("|") && a.includes("%") === b.includes("%");
};

/** Las palabras de cada frase de la tesis: el prompt pide de 3 a 8. */
const MAX_PALABRAS_DE_LA_TESIS = 9;
const tesisLarga = (t: string) => t.split(/[.!?]+/).some((f) => f.trim().split(/\s+/).length > MAX_PALABRAS_DE_LA_TESIS);

const NO_SON_CANTIDADES = /\bB2B2C\b|\bB2[BC]\b|\b24\s?\/\s?7\b|(?<=\b(?:vista|visión|vision)\s)360\b/gi;

/**
 * Los números de `texto` que no están en `fuente`, con lo que los multiplica: «25 mil» no es «25» ni «25 millones».
 * `tambien` (12 nov): un número chico vale si la empresa lo dijo en los turnos cercanos a la cita («tus dos marcas»); un
 * año, si es de una reunión o la empresa lo dijo como año. Una magnitud, siempre, tiene que estar en la cita misma.
 */
export function cifrasDeMas(textoCrudo: string, fuente: string, tambien: ContextoDeLaCita = {}): string[] {
  // «B2B», «B2C», «24/7» y «vista 360» no son cantidades (16 nov: se perdían etiquetas de Cicadex y lo que queda fuera de Polaris).
  const dicho = paraComparar(`${fuente} ${tambien.chicos ?? ""}`);
  const texto = textoCrudo.replace(NO_SON_CANTIDADES, (m) => (dicho.includes(paraComparar(m).replace(/\s+/g, " ")) ? " " : m));
  const hay = new Set(cantidadesNormales(fuente));
  const chicos = tambien.chicos ? new Set(cantidadesNormales(tambien.chicos)) : null;
  const anios = tambien.anios ? new Set((tambien.anios.match(/(?<!\d)(19|20)\d\d(?!\d)/g) ?? []).map((a) => `${a}·`)) : null;
  const uno = unoEnLetras(texto, fuente);
  const enCifras = cantidadesNormales(texto).filter(
    (c) => !hay.has(c) && !(chicos && ES_CHICO(c) && chicos.has(c)) && !(anios && ES_ANIO(c) && anios.has(c)) && !(c === "1·" && uno),
  );
  const palabrasDeLaFuente = new Set(paraComparar(fuente).split(" "));
  const delTexto = paraComparar(sinEspaciosDeMiles(texto)).split(" ");
  const enPalabras = delTexto
    // «25 mil»: el «mil» ya lo mira `cantidadesDe` con su número.
    .filter((p, i) => p in CANTIDADES_EN_PALABRAS && !(/^(mil|millon|millones)$/.test(p) && /\d$/.test(delTexto[i - 1] ?? "")))
    .filter((p) => !palabrasDeLaFuente.has(p) && !(CANTIDADES_EN_PALABRAS[p] && hay.has(`${CANTIDADES_EN_PALABRAS[p]}·`)))
    // «porcentaje» habla del «2,8%» que dice la cita (Centauro, 10 nov: el churn se perdía por esa palabra).
    .filter((p) => !(p === "porcentaje" && fuente.includes("%")));
  return [...enCifras, ...enPalabras];
}

/**
 * Las herramientas que nombra un texto y lo citado no (regla 6 del 10 nov: no asumir herramientas, integraciones ni
 * compras). Centauro nunca dijo que usara HubSpot: un texto que diga «tu HubSpot» sin que la empresa lo nombre no sale.
 */
const HERRAMIENTAS = /\b(hubspot|salesforce|zoho|pipedrive|dynamics|odoo|monday|jira|zendesk|freshdesk|intercom|excel|google forms|google sheets|whatsapp|slack|mailchimp|shopify)\b/g;
export function herramientasDeMas(texto: string, fuente: string, tambien = ""): string[] {
  // 12 nov (Centauro): «WhatsApp» o «Excel» los nombró la empresa en otra parte de la reunión; lo que no nombró, nunca.
  const f = paraComparar(`${fuente} ${tambien}`);
  return [...new Set(paraComparar(texto).match(HERRAMIENTAS) ?? [])].filter((h) => !new RegExp(`(^|[^a-z0-9])${h}([^a-z0-9]|$)`).test(f));
}

/**
 * Una lectura nuestra presentada como dicha por ellos (11 nov: «200 tickets evitables» salió como declarado). Vale solo si
 * lo citado dice lo mismo.
 */
const LECTURA_NUESTRA = /\bevitabl\w*|\binnecesari\w*|\brecuperabl\w*|\bdesperdici\w*|\bautomatizabl\w*|\bpodrian? (evitar|resolver|automatizar)\w*/;
export function lecturaNuestra(texto: string, citado: string): string | null {
  const m = paraComparar(texto).match(LECTURA_NUESTRA);
  if (!m) return null;
  // La misma palabra, sin el plural: «evitable» o «evitables» en la cita; «podría» suelto no sostiene «podría evitarse».
  const raiz = m[0].replace(/(es|s)$/, "");
  return paraComparar(citado).includes(raiz) ? null : m[0];
}

/**
 * UNA CIFRA ES UN SOLO DATO (11 nov: el 2,8 % y «14 de 25» quedaron fundidos en una cifra «declarada»). Las citas que
 * sostienen la cifra grande son las que traen alguno de sus números; los números del texto tienen que estar en ESAS
 * citas. «25 de 50» con el 25 de un turno y el 50 de otro vale: es un dato y su meta. Devuelve los números que salen de
 * otro dicho, o [] si no hay.
 */
export function numerosDeOtroDicho(cifra: string, texto: string, citas: readonly { texto: string }[]): string[] {
  const deLaCifra = citas.filter((c) => cifrasDeMas(cifra, c.texto).length < cifrasDeMas(cifra, "").length);
  if (!deLaCifra.length) return [];
  return cifrasDeMas(texto, `${cifra} ${deLaCifra.map((c) => c.texto).join(" ")}`);
}

/** Lo mínimo de una cita: con menos, cualquier frase «está» en la reunión. */
export const PALABRAS_DE_UNA_CITA = 4;

const esDelCliente = (r: ReunionParaElResumen, hablante: string) => r.delCliente.some((n) => paraComparar(n) === paraComparar(hablante));

/** Las palabras de una confirmación corta; «okay» o «ajá» solos son acuse, no confirman. */
const DE_UNA_CONFIRMACION = new Set(["si", "exacto", "exactamente", "correcto", "claro", "efectivamente", "aja", "asi", "es", "tal", "cual", "eso", "totalmente", "ok", "okay", "mhm"]);
const CONFIRMAN = new Set(["si", "exacto", "exactamente", "correcto", "efectivamente", "asi", "cual", "eso", "totalmente"]);

const palabrasDe = (texto: string) => paraComparar(texto).split(" ").filter(Boolean);
const confirma = (texto: string) => {
  // «¿Sí?» o «¿Exacto?» es duda, no acuerdo (revisión del 9 nov: al comparar se borraban los signos).
  if (texto.includes("?")) return false;
  const ps = palabrasDe(texto);
  return ps.length > 0 && ps.length <= 6 && !ps.includes("no") && ps.every((p) => DE_UNA_CONFIRMACION.has(p)) && ps.some((p) => CONFIRMAN.has(p));
};

/**
 * Alguien de la empresa confirma lo que dijo otro entre los turnos `desde` y `hasta` (una frase que siguió en otro turno
 * de la misma persona). La PRIMERA respuesta de la empresa después de `hasta` (en los dos turnos siguientes) tiene que ser
 * una confirmación corta: hasta seis palabras, solo de confirmación y sin un «no» («Sí, no,» no confirma). Y entre las dos
 * partes, nadie de la empresa pudo decir que no. Revisión del 9 nov: Marco dice «cierran unos 25», la empresa «Sí,
 * correcto», Marco «y pierden como 14», la empresa «No, no tanto»: el «Sí, correcto» del medio confirmaba la cifra entera.
 * null si nadie lo confirmó.
 */
export function confirmacion(r: ReunionParaElResumen, desde: number, hasta = desde): { hablante: string; texto: string } | null {
  /* Entre las partes, la empresa solo pudo decir acuses o confirmaciones: «Menos.», «Nunca», «Ni cerca» también niegan
     sin decir «no» (revisión del 9 nov). */
  const delMedio = r.turnos.filter((t) => t.n > desde && t.n < hasta && esDelCliente(r, t.hablante));
  if (delMedio.some((t) => t.texto.includes("?") || palabrasDe(t.texto).some((p) => !DE_UNA_CONFIRMACION.has(p)))) return null;
  const respuesta = r.turnos.find((t) => t.n > hasta && t.n <= hasta + 2 && esDelCliente(r, t.hablante));
  return respuesta && confirma(respuesta.texto) ? { hablante: respuesta.hablante, texto: respuesta.texto } : null;
}

/** Lo que corrige, en CUALQUIER parte de lo que responde la empresa: «Sí, bueno, en realidad son 3.200» también corrige. */
const CORRIGE = /\b(no|nunca|menos|tampoco|ni|perdon|corrijo|corrige|en realidad|mas bien|equivocad\w*)\b/;
/** Cuántos turnos después de lo que dijo Smarteam se mira si la empresa lo corrigió. */
const TURNOS_PARA_CORREGIR = 4;

/**
 * La empresa NO corrigió lo que dijo Smarteam (18 nov, Elías: «si el vendedor dice una cifra y el cliente no corrige,
 * posiblemente es real»). Se exige mucho: en lo que respondió (sus turnos hasta que otro vuelve a hablar) solo pudo callar
 * o decir algo sin un «no», un «menos», un «en realidad», una pregunta ni un número distinto de los de la cita, en
 * cualquier parte de la frase (revisión del 18 nov: «Sí, bueno, en realidad son como 3.200» y «Eso no es así» pasaban).
 * Y lo que viene justo después tiene que haberse leído: en una reunión recortada, la corrección puede estar en lo omitido.
 * `citado`: lo que dijo Smarteam.
 */
export function noLaCorrigio(r: ReunionParaElResumen, hasta: number, citado: string): boolean {
  if (!r.turnos.some((t) => t.n === hasta + 1)) return false;
  const dichos = cantidadesNormales(citado);
  // Lo que respondió la empresa a ESO: sus turnos hasta que otro vuelve a hablar (lo de después responde a otra cosa).
  const respuestas: TurnoNumerado[] = [];
  for (const t of r.turnos.filter((u) => u.n > hasta && u.n <= hasta + TURNOS_PARA_CORREGIR)) {
    if (!esDelCliente(r, t.hablante)) break;
    respuestas.push(t);
  }
  for (const t of respuestas) {
    if (t.texto.includes("?")) return false;
    if (CORRIGE.test(paraComparar(t.texto))) return false;
    if (cantidadesNormales(t.texto).some((n) => !dichos.includes(n))) return false;
  }
  return true;
}

/** Alguien de Smarteam (por su correo: `quien-hablo.ts`). Ni la gente de HubSpot ni un hablante sin identificar lo son. */
const esDeSmarteam = (r: ReunionParaElResumen, hablante: string) => (r.deSmarteam ?? []).some((n) => paraComparar(n) === paraComparar(hablante));

/** Lo que mide una conversación, con la misma cuenta que el recorte (lib/analizador-venta/conversacion.ts). */
export const largoDeLosTurnos = (ts: readonly { hablante: string; texto: string }[]): number => ts.reduce((s, t) => s + t.hablante.length + t.texto.length + 4, 0);

/** Cuánto de una conversación dijo la empresa, con la misma regla de quién es de la empresa que las citas. */
export function loQueDijoLaEmpresa(turnos: readonly { hablante: string; texto: string }[], delCliente: readonly string[]): number {
  const r = { delCliente } as Pick<ReunionParaElResumen, "delCliente"> as ReunionParaElResumen;
  return largoDeLosTurnos(turnos.filter((t) => esDelCliente(r, t.hablante)));
}

/**
 * El peso de cada sesión para el agente (18 nov): solo las de Meet que pasaron y de un equipo que el cliente ve (o sin
 * equipo), con su título, sus minutos y su clave en el pedido si se leyó.
 */
export function pesoDeLasSesiones(
  sesiones: readonly { id: string; origen: string; fecha: string; titulo: string | null; minutos: number | null; areaId: string | null; deTrabajo?: boolean }[],
  areasQueVe: ReadonlySet<string>,
  claves: ReadonlyMap<string, string>,
): PesoDeLaSesion[] {
  return sesiones
    .filter((s) => s.origen === "meet" && (!s.areaId || areasQueVe.has(s.areaId)))
    .map((s) => ({ fecha: s.fecha, titulo: s.titulo || null, minutos: s.minutos, clave: claves.get(s.id) ?? null, ...(s.deTrabajo ? { deTrabajo: true as const } : {}) }));
}

/** El último turno que abarca una cita: el suyo o, si la frase siguió en otro turno de la misma persona, ese. */
function finDeLaCita(r: ReunionParaElResumen, c: { turno: number; hablante: string; texto: string }): number {
  if (r.turnos.find((t) => t.n === c.turno)?.texto.includes(c.texto)) return c.turno;
  return r.turnos.find((t) => t.n > c.turno && t.n <= c.turno + 3 && t.hablante === c.hablante)?.n ?? c.turno;
}

/**
 * Lo que dijo la empresa en las reuniones: sus turnos y los de Smarteam que ella confirmó. Contra esto se miran los números
 * del «por qué», de los pendientes y de las preguntas (Centauro: «1800 al mes» lo calculó Marco y nadie lo confirmó).
 */
export function dichoPorLaEmpresa(reuniones: readonly ReunionParaElResumen[]): string {
  return reuniones.map(dichoEnLaReunion).join("\n");
}

const DICHO_EN_LA_REUNION = new WeakMap<ReunionParaElResumen, string>();
/** Lo que dijo la empresa en UNA reunión (sus turnos y los de Smarteam que confirmó), guardado: se mira en cada pieza. */
export function dichoEnLaReunion(r: ReunionParaElResumen): string {
  let d = DICHO_EN_LA_REUNION.get(r);
  if (d === undefined) {
    d = r.turnos.filter((t) => esDelCliente(r, t.hablante) || confirmacion(r, t.n)).map((t) => t.texto).join("\n");
    DICHO_EN_LA_REUNION.set(r, d);
  }
  return d;
}

/** Los turnos vecinos a una cita que cuentan para sus números chicos: cuatro antes y cuatro después. */
const VECINOS = 4;

/**
 * Lo que vale además de la cita corta (12 nov): lo dicho por la empresa en los turnos vecinos a cada cita (los números
 * chicos), y los años: los de las reuniones («este año» es «2026») y los que la empresa dijo como año («en 2025»).
 */
export function loDeSusReuniones(citas: readonly Pick<CitaDelResumen, "reunion" | "turno">[], reuniones: readonly ReunionParaElResumen[]): ContextoDeLaCita {
  const chicos = citas.flatMap((c) => {
    const r = reuniones.find((x) => x.id === c.reunion || x.clave === c.reunion);
    return r ? r.turnos.filter((t) => Math.abs(t.n - c.turno) <= VECINOS && esDelCliente(r, t.hablante)).map((t) => t.texto) : [];
  });
  return { chicos: chicos.join("\n"), anios: aniosDe(reuniones, reuniones.map((r) => r.turnos.filter((t) => esDelCliente(r, t.hablante)).map((t) => t.texto).join("\n")).join("\n")) };
}

/** Lo dicho por la empresa en las reuniones de unas citas (las herramientas de su equipo, no las de otro). */
export function dichoEnSusReuniones(citas: readonly Pick<CitaDelResumen, "reunion">[], reuniones: readonly ReunionParaElResumen[]): string {
  return reuniones.filter((r) => citas.some((c) => c.reunion === r.id || c.reunion === r.clave)).map(dichoEnLaReunion).join("\n");
}

/** De qué reunión y turno sale algo: con eso se reconoce al rehacer, aunque se reescriba. */
export const origenDeLaCita = (c: Pick<CitaDelResumen, "reunion" | "turno"> | undefined): string | undefined => (c ? `${c.reunion}:${c.turno}` : undefined);
const origenDe = (x: { origen?: string; citas: readonly CitaDelResumen[] }) => x.origen ?? origenDeLaCita(x.citas[0]);

/**
 * Busca una cita del agente en su reunión: dicha por alguien del cliente, o dicha por otro y confirmada. Con `sinCorregir`
 * (solo las cifras, 18 nov), también una con un número que dijo Smarteam y la empresa no corrigió. null si no.
 */
export function citaVerificada(v: unknown, reuniones: readonly ReunionParaElResumen[], o: { sinCorregir?: boolean } = {}): CitaDelResumen | null {
  const x = objeto(v);
  const r = reuniones.find((y) => y.clave === cadena(x.reunion).toUpperCase());
  if (!r) return null;
  // Tres palabras («como una carga») no sostienen nada: una cita trae por lo menos cuatro.
  if (cadena(x.texto).split(" ").filter(Boolean).length < PALABRAS_DE_UNA_CITA) return null;
  const c = verificarCita({ turno: x.turno, texto: x.texto }, r.turnos);
  if (!c) return null;
  const base = { reunion: r.id, fecha: r.fecha, turno: c.turno, hablante: c.hablante, texto: c.texto };
  // Una nota del equipo (21 nov): vale como lo dicho por la empresa, y adentro dice quién del equipo la escribió.
  if (r.delEquipo) return { ...base, delEquipo: { nombre: r.delEquipo.nombre, en: r.delEquipo.en } };
  if (esDelCliente(r, c.hablante)) return base;
  const fin = finDeLaCita(r, c);
  const confirmo = confirmacion(r, c.turno, fin);
  if (confirmo) return { ...base, confirmo };
  if (o.sinCorregir && esDeSmarteam(r, c.hablante) && cantidadesNormales(c.texto).length > 0 && noLaCorrigio(r, fin, c.texto)) return { ...base, sinCorregir: true };
  return null;
}

/** Los pedazos seguidos de una cita sin separador: hasta tres intervenciones, cada una a no más de cuatro de la anterior. */
const MAX_PEDAZOS_SEGUIDOS = 3;
const TURNOS_ENTRE_PEDAZOS = 4;

/**
 * Una cita que sigue en las intervenciones siguientes (24 nov, Centauro: Luis habla entrecortado, «ahorita estamos eh 70
 * 30.» · «Sí, sí, sí, estamos mejor,» · «pero pero creo que estamos como un 70 30», con un «Okay» de Marco en el medio, y
 * el agente lo cita de corrido: se caía «sin una cita»). Se parte en el pedazo más largo que está en la reunión y el resto
 * se busca en las intervenciones que siguen; vale solo si TODO el texto queda en pedazos de cuatro palabras o más, cada
 * uno dicho por la empresa (o confirmado), en una intervención posterior a la del anterior y a no más de cuatro de ella;
 * si son tres, de la misma persona. Cada pedazo queda como su cita.
 */
function enPedazosSeguidos(x: Record<string, unknown>, reuniones: readonly ReunionParaElResumen[]): CitaDelResumen[] | null {
  const ps = cadena(x.texto).split(" ").filter(Boolean);
  /* El turno que dio el agente suele ser el de un pedazo del medio o del final: el primero se busca también en las
     intervenciones de antes (si no, la verificación lo encuentra a medias en ese mismo turno y el resto ya no cabe después). */
  const r = reuniones.find((y) => y.clave === cadena(x.reunion).toUpperCase());
  const turnoDado = Number(x.turno);
  const pistasDelPrimero = [...new Set([...(r?.turnos ?? []).filter((t) => t.n >= turnoDado - 2 * TURNOS_ENTRE_PEDAZOS && t.n < turnoDado).map((t) => t.n), turnoDado])];
  // Con vuelta atrás: el pedazo más largo que está en la reunión puede no dejar que el resto encaje; se prueba el siguiente.
  const seguir = (desde: number, out: readonly CitaDelResumen[]): CitaDelResumen[] | null => {
    if (desde >= ps.length) return out.length >= 2 ? [...out] : null;
    if (out.length >= MAX_PEDAZOS_SEGUIDOS) return null;
    const previo = out.at(-1);
    const pistas = previo ? [previo.turno + 1] : pistasDelPrimero;
    for (let hasta = ps.length - (out.length ? 0 : PALABRAS_DE_UNA_CITA); hasta >= desde + PALABRAS_DE_UNA_CITA; hasta--) {
      // Lo que queda después tiene que poder ser su propio pedazo.
      if (ps.length - hasta > 0 && ps.length - hasta < PALABRAS_DE_UNA_CITA) continue;
      const probados = new Set<number>();
      for (const pista of pistas) {
        const c = citaVerificada({ ...x, turno: pista, texto: ps.slice(desde, hasta).join(" ") }, reuniones);
        if (!c || probados.has(c.turno)) continue;
        probados.add(c.turno);
        // Siempre en una intervención que sigue (revisión del 24 nov, segunda vuelta: dos pedazos del mismo turno saltan
        // palabras), y el tercero de la misma persona que los dos primeros.
        const sigue = !previo || (c.reunion === previo.reunion && c.turno > previo.turno && c.turno - previo.turno <= TURNOS_ENTRE_PEDAZOS);
        const mismaPersona = out.length < 2 || out.every((y) => y.hablante === c.hablante);
        if (!sigue || !mismaPersona) continue;
        const resto = seguir(hasta, [...out, c]);
        if (resto) return resto;
      }
    }
    return null;
  };
  return seguir(0, []);
}

/** Lo que separa los pedazos de una cita pegada («…», «...» o «;»). */
const ENTRE_PEDAZOS = /\s*(?:…|\.\.\.|;)\s*/;

/**
 * Un turno corto que es solo un número («25.»), dicho por la empresa: la cifra de una respuesta (12 nov, Centauro: «25»
 * era la respuesta a cuántas reuniones logran por semana). Vale solo como cita de una cifra y si es el turno entero.
 */
function turnoConSoloUnNumero(v: unknown, reuniones: readonly ReunionParaElResumen[]): CitaDelResumen | null {
  const x = objeto(v);
  const r = reuniones.find((y) => y.clave === cadena(x.reunion).toUpperCase());
  const t = r?.turnos.find((u) => u.n === Number(x.turno));
  if (!r || !t || !esDelCliente(r, t.hablante)) return null;
  const solo = paraComparar(t.texto).trim();
  if (!/^\d+([.,]\d+)?( ?%)?$/.test(solo.replace(/\s+/g, " ")) || solo !== paraComparar(cadena(x.texto)).trim()) return null;
  // Solo como corrección de una cantidad dicha en los dos turnos de antes («cerramos unos 30» · «25.»): sin eso, no se sabe
  // a qué pregunta responde (la revisión del 12 nov: «¿cuántos años llevan?» · «25.»).
  const antes = r.turnos.filter((u) => u.n < t.n && u.n >= t.n - 2);
  if (!antes.some((u) => cantidadesDe(u.texto).length > 0)) return null;
  return { reunion: r.id, fecha: r.fecha, turno: t.n, hablante: t.hablante, texto: t.texto.trim() };
}

/**
 * Las citas verificadas de lo que devolvió el agente (12 nov). Muchas veces pega dos o tres pedazos de lo dicho en una
 * sola cita, con «;» o «…» («mantenemos informado al cliente cuando él pregunta; lo escalamos, puede tardar…»): cada
 * pedazo está en la reunión, la cita entera no. Si la cita entera no se encuentra, se busca cada pedazo de 4 palabras o
 * más en la misma reunión; vale solo si TODOS esos pedazos están, y cada uno queda como su propia cita. Lo que un pedazo
 * más corto diga (un número) no queda en lo citado: la regla de los números lo caza. `cifra`: acepta un turno que es solo
 * un número. Con hasta `max` citas.
 */
export function citasVerificadas(vs: readonly unknown[], reuniones: readonly ReunionParaElResumen[], o: { cifra?: boolean; max?: number; sinCorregir?: boolean } = {}): CitaDelResumen[] {
  const out: CitaDelResumen[] = [];
  // Los pedazos de cada cita del agente, para el tope.
  const grupos: CitaDelResumen[][] = [];
  const deSmarteam = { sinCorregir: !!o.sinCorregir };
  for (const v of vs.slice(0, 3)) {
    const desde = out.length;
    citasDeUna(v);
    grupos.push(out.slice(desde));
  }
  function citasDeUna(v: unknown): void {
    const entera = citaVerificada(v, reuniones, deSmarteam) ?? (o.cifra ? turnoConSoloUnNumero(v, reuniones) : null);
    if (entera) {
      out.push(entera);
      return;
    }
    const x = objeto(v);
    const pedazos = cadena(x.texto).split(ENTRE_PEDAZOS).filter((p) => p.split(" ").filter(Boolean).length >= PALABRAS_DE_UNA_CITA);
    if (pedazos.length >= 2) {
      const verificados = pedazos.map((p) => citaVerificada({ ...x, texto: p }, reuniones, deSmarteam));
      if (verificados.every((c): c is CitaDelResumen => !!c)) out.push(...verificados);
      return;
    }
    // Sin separador: la frase puede empezar en un turno y seguir en el de otra persona de la empresa («son 10 reuniones a
    // la semana» · «por asesor, pero son 50 a la semana en grupal», 12 nov), o en tres turnos de la misma (24 nov).
    const seguidos = enPedazosSeguidos(x, reuniones);
    if (seguidos) out.push(...seguidos);
  }
  // Sin repetir el mismo pedazo dos veces.
  const vistas = new Set<string>();
  const unicas = out.filter((c) => !vistas.has(`${c.reunion}:${c.turno}:${c.texto}`) && !!vistas.add(`${c.reunion}:${c.turno}:${c.texto}`));
  /* Hasta tres, como las guardadas (esquemas.ts): con una cuarta, la pieza entera no se leía al volver a abrir. Primero un
     pedazo de cada cita del agente (revisión del 24 nov, segunda vuelta: una contradicción cuya primera cita venía en tres
     pedazos se quedaba sin la segunda), después los demás, en su orden. */
  const max = o.max ?? MAX_CITAS_DE_UNA_PIEZA;
  if (unicas.length <= max) return unicas;
  const primeros = new Set(grupos.flatMap((g) => g.slice(0, 1)));
  const elegidas = new Set([...unicas.filter((c) => primeros.has(c)), ...unicas.filter((c) => !primeros.has(c))].slice(0, max));
  return unicas.filter((c) => elegidas.has(c));
}

/** Una nota que cita lo dicho o dice quién lo dijo (comillas de cualquier tipo, o el rol de quien habló). */
const CITA_EN_LA_NOTA = /['"«»“”‘’]|\b(la|el) (supervisora?|responsable|jefa|jefe|gerente|directora?)\b.*\b(dijo|aporta|declara|introduce|menciona)/i;
/**
 * Una conclusión que nadie dijo (regla del 10 nov: «25 clientes y se nos van 14» es una comparación por validar, no una
 * conclusión sobre el crecimiento): vale solo si lo citado habla de lo mismo (de crecer, por ejemplo).
 */
const CONCLUSION = /\blo que (limita|indica|significa|muestra|demuestra|refleja)\b|\bcrec(e|en|er|imiento)\b|\bneto\b|\bajustad[oa]\b|\bestrech[oa]\b/;
export function concluyeDeMas(texto: string, citado: string): string | null {
  const m = paraComparar(texto).match(CONCLUSION);
  if (!m) return null;
  if (paraComparar(citado).includes(m[0].slice(0, 4))) return null;
  return m[0];
}

/**
 * El texto sin la cola que concluye («…, lo que deja el saldo neto muy ajustado»): se corta en la última «, lo que», «; »
 * o «, así que» antes de la conclusión. null si la conclusión no está en una cola que se pueda cortar.
 */
export function sinLaConclusion(texto: string, citado: string): string | null {
  if (!concluyeDeMas(texto, citado)) return texto;
  const cortes = [", lo que ", "; ", ", así que ", ", por lo que ", ", y eso "].map((c) => texto.lastIndexOf(c)).filter((i) => i > 0);
  if (!cortes.length) return null;
  const corto = `${texto.slice(0, Math.min(...cortes)).trim().replace(/[,;:]$/, "")}.`;
  return concluyeDeMas(corto, citado) || corto.split(" ").length < 5 ? null : corto;
}

/** Un total que se cuela en el texto de una cifra (11 nov: «400 a 500 por WhatsApp… un total aproximado de 1.008»). */
const TOTAL = /\ben total\b|\bun total\b|\bsumando\b|\bsuman\b/;

/** Lo que dice «provisional» o «hipótesis»: se ve inseguro (Elías, 11 nov). */
const DICE_DUDA = /\bprovisional|\bhipotesis\b/;

/** Lo que habla de una meta; y lo que dice qué pasa hoy (con eso, la cifra es un resultado frente a la meta). */
const ES_UNA_META = /\b(la|una|su|tu|nuestra|sus|tus|las|nuestras) metas?\b|\bmetas? (de|del|mensual(es)?|semanal(es)?|anual(es)?|final(es)?)\b|\bcomo metas?\b|\bobjetivo\b|\bquieren llegar\b|\bdeberia\b|\btiene que haber\b/;
const ES_DE_HOY = /\bhoy\b|\bactual|\bhace(s|n)?\b|\blogra|\balcanza|\bse quedan?\b|\bsolo\b|\bmitad\b/;

/** Lo que dijo con dudas: la cifra sale, pero dice qué falta validar. */
const CON_DUDAS = /si no me equivoco|no tengo el dato|no se exacto|mas o menos|aproximad|por ahi|no estoy segur|creo que/;
export const NOTA_DE_LO_RESUMIDO = "Lo resumimos en la reunión y lo confirmaste: falta validarlo con tus datos.";
export const NOTA_DE_MEMORIA = "Lo dijiste de memoria: falta confirmar el dato exacto y su período.";
export const NOTA_DE_VARIOS_NUMEROS = "Se dijeron varios números juntos: falta confirmar este dato con tus registros.";
/**
 * La nota de una cifra que no dijo alguien que sepamos de la empresa y nadie corrigió (18 nov). No dice quién la dijo: puede
 * ser Smarteam, o alguien de la empresa que la transcripción no reconoce (Cemaco: el 2 % lo dijo la gerente de marketing).
 */
export const NOTA_SIN_CORREGIR = "Salió en la reunión y nadie la corrigió: falta confirmarla con tus datos.";

/**
 * Cómo se sabe una cifra, con la regla en el código (10 nov): no es «declarada» si su número grande no lo dijo la empresa
 * (lo resumió Smarteam y ella confirmó: «25 clientes y se nos van 14» es ESTIMADA); una estimada sin base dice de dónde
 * sale; una declarada dicha con dudas («si no me equivoco») dice qué falta validar.
 */
/** Las cantidades distintas de un texto, sin años («2025») y con un decimal como un solo número («2,8»). */
export function numerosDistintos(texto: string): number {
  const xs = (sinEspaciosDeMiles(texto).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((x) => !/^(19|20)\d\d$/.test(x)).map((x) => x.replace(",", "."));
  return new Set(xs).size;
}

/**
 * La cifra solo la sostiene lo que dijo Smarteam y la empresa no corrigió (18 nov): nadie de la empresa dijo su número ni lo
 * confirmó. La misma regla decide el estado (`estadoDeLaCifra`) y el «Confirmar» de adentro.
 */
export function soloLaDijoSmarteam(o: { cifra: string; citas: readonly CitaDelResumen[] }): boolean {
  const deLaEmpresa = o.citas.filter((c) => !c.confirmo && !c.sinCorregir);
  const loDijoLaEmpresa = !!deLaEmpresa.length && !cifrasDeMas(o.cifra, deLaEmpresa.map((c) => c.texto).join(" ")).length;
  const sostiene = (c: CitaDelResumen) => cifrasDeMas(o.cifra, c.texto).length < cifrasDeMas(o.cifra, "").length;
  return !loDijoLaEmpresa && !o.citas.some((c) => c.confirmo && sostiene(c)) && o.citas.some((c) => c.sinCorregir);
}

export function estadoDeLaCifra(o: {
  estado: unknown;
  cifra: string;
  nota: string | null;
  citas: readonly CitaDelResumen[];
  mano?: boolean;
  confirmada?: boolean;
  /** Una «calculado» (24 nov): con su cuenta es calculada, también confirmada; sin cuenta, no lo es. */
  cuenta?: CuentaGuardada;
}): { estado: EstadoDeLaCifra; nota: string | null } {
  if (o.cuenta) return { estado: "calculado", nota: o.nota };
  // Una persona la confirmó (la dijo Smarteam y la empresa no la corrigió, 18 nov): es suya.
  if (o.confirmada) return { estado: "declarado", nota: o.nota };
  let estado: EstadoDeLaCifra = ESTADOS_DE_LA_CIFRA.includes(o.estado as EstadoDeLaCifra) && o.estado !== "calculado" ? (o.estado as EstadoDeLaCifra) : "pendiente";
  let nota = o.nota;
  const deLaEmpresa = o.citas.filter((c) => !c.confirmo && !c.sinCorregir);
  const loDijoLaEmpresa = !!deLaEmpresa.length && !cifrasDeMas(o.cifra, deLaEmpresa.map((c) => c.texto).join(" ")).length;
  // La dijo Smarteam y la empresa no la corrigió ni la confirmó: va por confirmar, con su nota (18 nov).
  if (soloLaDijoSmarteam(o)) {
    return { estado: "pendiente", nota: o.mano && o.nota ? o.nota : NOTA_SIN_CORREGIR };
  }
  if (estado === "declarado" && !loDijoLaEmpresa) estado = "estimado";
  // Una «estimada» sin base que la empresa dijo tal cual es declarada (Centauro, 10 nov: el 2,8 % lo dijo Emiley; el agente
  // lo marcó estimado y la nota del código decía que lo había resumido Smarteam).
  if (estado === "estimado" && !nota && loDijoLaEmpresa) estado = "declarado";
  if (estado === "estimado" && !nota) nota = NOTA_DE_LO_RESUMIDO;
  if (estado === "declarado" && !nota && deLaEmpresa.some((c) => CON_DUDAS.test(paraComparar(c.texto)))) nota = NOTA_DE_MEMORIA;
  /* Una cita que dice tres números o más juntos («400 a 500… correo son 13… para llegar a los 1008», 11 nov) no sostiene
     ninguno como declarado: puede ser un total, una parte o una frase cortada. */
  const deLaCifra = o.citas.filter((c) => cifrasDeMas(o.cifra, c.texto).length < cifrasDeMas(o.cifra, "").length);
  // Una cifra que corrigió una persona queda con su estado y su nota: la responsabilidad es suya (revisión del 11 nov).
  if (!o.mano && estado !== "pendiente" && deLaCifra.some((c) => numerosDistintos(c.texto) >= 3)) {
    estado = "pendiente";
    nota = NOTA_DE_VARIOS_NUMEROS;
  }
  return { estado, nota };
}

/** Lo que el agente escribió y quedó, y lo que se descartó (con su motivo, para el registro de la corrida). */
export interface LoQueEscribioElAgente {
  negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>>;
  operativas: AreaOperativa[];
  /** `orden`: dónde la puso el agente (para volver a ordenar las etapas corregidas). */
  recorrido: (EtapaDelResumen & { orden?: number })[];
  /** El título del recorrido (forma editorial). null: no vino o no pasó. */
  tituloDelRecorrido: string | null;
  /** Solo el «por qué» de cada equipo de la escala (los hallazgos son del formato 1). */
  areas: Record<string, AreaDelResumenGuardada>;
  pendientes: PendienteDelResumen[];
  /** Desde el 11 nov el agente ya no escribe «¿Entendimos bien?»: siempre vacío. */
  entendimos: PreguntaDelResumen[];
  confirmar: Record<string, string>;
  avisos: string[];
  descartados: string[];
  /**
   * Las cifras con su cita verificada que se cayeron solo porque traen un número que la cita no dice (una resta, un
   * porcentaje, «1 800»): se piden una vez más, corregidas (`pedidoDelArreglo`).
   */
  porArreglar: DatoPorArreglar[];
  /** Las etapas con su cita verificada que se cayeron por algo de forma: se piden corregidas (`pedidoDeLasEtapas`). */
  etapasPorArreglar: EtapaPorArreglar[];
  /** Las piezas de las listas con su cita verificada que se cayeron por algo de forma (12 nov): `pedidoDeLasPiezas`. */
  piezasPorArreglar: PiezaPorArreglar[];
  /** Los 5 puntos clave (18 nov), en orden de peso. */
  puntos: PuntoClave[];
}

/** Una pieza de una lista por corregir (el negocio, la organización, lo que hace bien, lo que frena, un reto). */
export interface PiezaPorArreglar {
  /** Dónde va: `negocio:<parte>` o `<id del área operativa>:<lista>`. */
  lugar: string;
  /** Su lugar en la lista que escribió el agente: la corregida vuelve ahí (la organización es [quiénes, qué hacen]). */
  indice?: number;
  /** Cuántas piezas traía esa lista: la organización de una sola pieza es «qué hacen», no «quiénes son». */
  largo?: number;
  texto: string;
  citas: CitaDelResumen[];
  problema: string;
  dimensionId?: string | null;
  /** Un punto clave (18 nov): su título (ya verificado) y su equipo; se corrige solo el texto. */
  titulo?: string;
  areaId?: string | null;
  /** Un reto del traspaso (24 nov): el otro equipo; el reto corregido lo conserva. */
  traspaso?: string;
  /**
   * Las citas que dio el agente, si se le sumó una encontrada (24 nov): de su vecindad valen los números chicos, también
   * en la pieza corregida.
   */
  delAgente?: CitaDelResumen[];
}

/** Una etapa por corregir: lo que escribió el agente, sus citas tal como las devolvió y por qué se cayó. */
export interface EtapaPorArreglar {
  orden: number;
  etapa: string;
  quien: string | null;
  texto: string;
  friccion: string | null;
  citas: unknown[];
  problema: string;
  /** Lo de la forma editorial, para que la etapa corregida no pierda su lugar en el bucle ni su ícono. */
  icono?: unknown;
  continuo?: unknown;
  /** El traspaso al paso siguiente, como lo devolvió el agente (24 nov): se vuelve a verificar con la etapa corregida. */
  traspaso?: unknown;
}

export interface DatoPorArreglar {
  /** El área operativa donde va (su id). */
  operativa: string;
  cifra: string;
  texto: string;
  estado: unknown;
  nota: string | null;
  dimensionId: string | null;
  citas: CitaDelResumen[];
  sobran: string[];
  /** Lo que tiene de forma: un texto más largo que su tope, un número de más. */
  problemas?: string[];
}

const dimensionDelArea = (ctx: ContextoDelResumen, areaId: string, v: unknown): string | null => {
  const id = cadena(v);
  return ctx.areas.find((a) => a.id === areaId)?.dimensiones.some((d) => d.id === id) ? id : null;
};

type Reglas = ReglasDelResumen & {
  parse: (texto: string) => Record<string, unknown>;
  firmas: Readonly<Record<string, string>>;
  /** Lo dicho por la empresa en todas las reuniones (las herramientas): `leerElResumen` lo calcula una vez. */
  dicho?: string;
};

/**
 * Lo que tiene una cifra contra sus citas, con la misma vara en la lectura, en el arreglo y en la auditoría: números que la
 * cita no dice, herramientas que la empresa no nombró, una conclusión, una lectura nuestra, números de otro dicho y un total
 * colado. Vacío = pasa.
 */
export function problemasDeLaCifra(
  d: { cifra: string; texto: string; nota: string | null; citas: readonly CitaDelResumen[] },
  dicho: string,
  reuniones: readonly ReunionParaElResumen[] = [],
): string[] {
  const lo = d.citas.map((c) => c.texto).join(" ");
  const todo = `${d.cifra} ${d.texto} ${d.nota ?? ""}`;
  // Los años valen si son de una reunión o los dijo la empresa; los números chicos, no: en una cifra cada número cuenta.
  const sobran = cifrasDeMas(todo, lo, { anios: aniosDe(reuniones, dicho) });
  const conclusion = concluyeDeMas(`${d.texto} ${d.nota ?? ""}`, lo);
  const lectura = lecturaNuestra(`${d.cifra} ${d.texto}`, lo);
  const otro = numerosDeOtroDicho(d.cifra, d.texto, d.citas);
  const herramientas = herramientasDeMas(todo, lo, reuniones.length ? dichoEnSusReuniones(d.citas, reuniones) : dicho);
  const total = TOTAL.test(paraComparar(d.texto)) && cifrasDeMas(d.texto, d.cifra).length > 0;
  const comoNumero = (xs: string[]) => xs.map((x) => x.replace(/·$/, "").replace("·", " ")).join(", ");
  return [
    ...(conclusion ? [`saca una conclusión que la cita no dice («${conclusion}»): quítala`] : []),
    ...(lectura ? [`califica con una lectura nuestra («${lectura}»): di solo lo que dijeron`] : []),
    ...(otro.length ? [`junta números de otro dicho (${comoNumero(otro)}): una cifra es un solo dato, deja solo los de su cita`] : []),
    ...(total ? ["suma un total que no es la cifra: quítalo (si hace falta, va aparte como pendiente)"] : []),
    ...(sobran.length ? [`trae números que no están en lo citado (${comoNumero(sobran)})`] : []),
    ...(herramientas.length ? [`nombra herramientas que la empresa no nombró (${herramientas.join(", ")})`] : []),
  ];
}

/**
 * La revisión de una cifra «calculado» (24 nov), la misma en la lectura, en la página y en la auditoría: cada número de la
 * cuenta está en su cita, la cuenta (`cuentaConTusCifras`, el código) sigue dando la cifra guardada, y el rótulo no trae
 * números que las citas no digan. Vacío = pasa.
 */
export function problemasDelCalculado(c: { cifra: string; texto: string; cuenta?: CuentaGuardada }): string[] {
  if (!c.cuenta) return ["es una cuenta sin sus números"];
  const out: string[] = [];
  for (const f of c.cuenta.factores) {
    if (!cifrasDeMas(f.valor, "").length || cifrasDeMas(f.valor, f.cita.texto).length) out.push(`«${f.valor}» no está en lo que dijo la empresa`);
    const moneda = monedaDelFactor(f);
    if (moneda && monedaDe(f.cita.texto) !== moneda) out.push(`la moneda de «${f.valor}» no es la que dijo la empresa`);
    if (cifrasDeMas(f.rotulo, f.cita.texto).length) out.push(`el rótulo de «${f.valor}» trae un número que su cita no dice`);
  }
  const hecha = cuentaConTusCifras(c.cuenta.factores);
  if (!hecha.ok) out.push(hecha.motivo);
  else if (paraComparar(hecha.cifra) !== paraComparar(c.cifra)) out.push(`la cuenta da ${hecha.cifra}, no ${c.cifra}`);
  if (cifrasDeMas(c.texto, c.cuenta.factores.map((f) => f.cita.texto).join(" ")).length) out.push("el texto trae números que no están en sus citas");
  return out;
}

/**
 * Una cifra «calculado» del agente (24 nov): sus factores, cada uno con su cita de la EMPRESA (dicha o confirmada; lo que
 * dijo Smarteam sin corregir no entra en una cuenta), y la cuenta la hace el código. Un número sin cita, o que su cita no
 * dice, tumba la cuenta entera: nunca sale una cuenta a medias.
 */
export function calculadaConSusCitas(
  v: unknown,
  ctx: Pick<ContextoDelResumen, "reuniones">,
  o: ReglasDelResumen,
): { ok: true; cifra: Omit<CifraDelResumen, "id" | "dimensionId"> } | { ok: false; motivo: string } {
  const x = objeto(v);
  const crudos = arreglo(x.cuenta).map(objeto);
  if (crudos.length < 2 || crudos.length > MAX_FACTORES) return { ok: false, motivo: `la cuenta trae ${crudos.length} números (van de 2 a ${MAX_FACTORES})` };
  const factores: CuentaGuardada["factores"] = [];
  for (const f of crudos) {
    let valor = cadena(f.valor);
    let rotuloCrudo = cadena(f.rotulo);
    const [cita] = citasVerificadas([...(f.cita ? [f.cita] : []), ...arreglo(f.citas)], ctx.reuniones, { cifra: true, max: 1 });
    if (!cita) return { ok: false, motivo: `«${valor}» no trae una cita de la empresa que lo diga` };
    if (!cifrasDeMas(valor, "").length || cifrasDeMas(valor, cita.texto).length) return { ok: false, motivo: `«${valor}» no está en su cita` };
    /* La moneda también, la del número o la de su rótulo (revisión del 24 nov): «85 colones» no es «US$ 85». Vale solo la
       que dice su cita, la misma regla que mira la página (`problemasDelCalculado`). Si la cita, la pregunta de antes o lo que
       siguió diciendo la empresa dicen OTRA, no entra; si no, se quita y la cuenta queda sin moneda (segunda vuelta del 24
       nov, Centauro: «85 más o menos ese promedio» tumbaba la cuenta entera por un «US$» que puso el agente). Una cuenta sin
       confirmar no sale al cliente. */
    const moneda = monedaDelFactor({ valor, rotulo: rotuloCrudo });
    const dichaEnLaCita = monedaDe(cita.texto);
    const dichaAlrededor = monedaDe(alrededorDeLaCita(cita, ctx.reuniones));
    if (moneda && dichaEnLaCita !== moneda && (dichaEnLaCita || (dichaAlrededor && dichaAlrededor !== moneda)))
      return { ok: false, motivo: `la moneda de «${valor}» no es la que dijo la empresa` };
    if (moneda && dichaEnLaCita !== moneda) {
      valor = sinMoneda(valor);
      rotuloCrudo = sinMoneda(rotuloCrudo);
      if (monedaDelFactor({ valor, rotulo: rotuloCrudo }) || !cifrasDeMas(valor, "").length) return { ok: false, motivo: `la moneda de «${cadena(f.valor)}» no es la que dijo la empresa` };
    }
    const rotulo = textoValido(rotuloCrudo, TOPE_DE_UN_NOMBRE, o, cita.texto);
    if (!rotulo.ok) return { ok: false, motivo: `el rótulo de «${valor}» ${rotulo.motivo}` };
    if (cifrasDeMas(rotulo.texto, cita.texto).length || herramientasDeMas(rotulo.texto, cita.texto, dichoEnSusReuniones([cita], ctx.reuniones)).length)
      return { ok: false, motivo: `el rótulo de «${valor}» dice algo que su cita no dice` };
    /* Si es de lo que se pierde o de lo que entra lo dice la empresa, no el rótulo del agente (revisión final del 24 nov:
       «cerramos unos 25 clientes al mes» rotulado «clientes que se van»). Se mira la cita y lo que se dijo alrededor. */
    const rot = paraComparar(rotulo.texto);
    if (DICE_UNA_PERDIDA.test(rot) && !DICE_UNA_PERDIDA.test(paraComparar(`${alrededorDeLaCita(cita, ctx.reuniones)} ${cita.texto}`)))
      return { ok: false, motivo: `el rótulo de «${valor}» dice una pérdida que su cita no dice` };
    if (DICE_UNA_GANANCIA.test(rot) && DICE_UNA_PERDIDA.test(paraComparar(cita.texto))) return { ok: false, motivo: `el rótulo de «${valor}» dice una ganancia y su cita habla de una pérdida` };
    factores.push({ valor: valor.slice(0, 40), rotulo: rotulo.texto, cita });
  }
  const hecha = cuentaConTusCifras(factores);
  if (!hecha.ok) return { ok: false, motivo: hecha.motivo };
  if (hecha.cifra.length > TOPE_DE_LA_CIFRA) return { ok: false, motivo: `la cifra «${hecha.cifra}» no cabe` };
  const vistas = new Set<string>();
  const citas = factores.map((f) => f.cita).filter((c) => !vistas.has(`${c.reunion}:${c.turno}`) && !!vistas.add(`${c.reunion}:${c.turno}`));
  const lo = citas.map((c) => c.texto).join(" ");
  // Sin moneda en sus números, el texto tampoco la trae («dólares al mes en clientes que se van»): sería una que nadie dijo.
  const textoCrudo = hecha.moneda ? cadena(x.texto) : sinMoneda(cadena(x.texto));
  const texto = textoValido(sinLaConclusion(textoCrudo, lo) ?? textoCrudo, TOPE_DEL_TEXTO_DEL_RESUMEN, o, lo);
  if (!texto.ok) return { ok: false, motivo: `el texto ${texto.motivo}` };
  const deMas = cifrasDeMas(texto.texto, lo).length ? "trae números que no están en sus citas" : lecturaNuestra(texto.texto, lo) ? "califica con una lectura nuestra" : concluyeDeMas(texto.texto, lo) ? "saca una conclusión que las citas no dicen" : null;
  if (deMas) return { ok: false, motivo: `el texto ${deMas}` };
  /* Un texto que dice que se PIERDE algo necesita un número de lo que se pierde (segunda vuelta del 24 nov, Centauro:
     «25 cierres × 85 ticket promedio» salía como «al mes en clientes que se van»; antes la tumbaba la moneda, y al
     quitarla quedaba a la vista). Revisión de esa vuelta: pedir que el texto repita una palabra de los rótulos descartaba
     cuentas buenas («al mes en ingresos que se pierden», con «clientes que se van»). */
  const pierdeElTexto = DICE_UNA_PERDIDA.test(paraComparar(texto.texto));
  const pierdeLaCuenta = factores.some((f) => DICE_UNA_PERDIDA.test(paraComparar(f.rotulo)));
  if (pierdeElTexto && !pierdeLaCuenta) return { ok: false, motivo: `el texto («${texto.texto}») habla de una pérdida y ningún número de la cuenta es de lo que se pierde` };
  // Y al revés (revisión de esa vuelta): números de lo que se pierde presentados como una ganancia («al mes en ventas nuevas»).
  if (pierdeLaCuenta && !pierdeElTexto && DICE_UNA_GANANCIA.test(paraComparar(texto.texto)))
    return { ok: false, motivo: `el texto («${texto.texto}») habla de una ganancia y la cuenta es de lo que se pierde` };
  return { ok: true, cifra: { cifra: hecha.cifra, texto: texto.texto, estado: "calculado", nota: null, citas, cuenta: { factores, texto: hecha.texto }, origen: origenDeLaCita(citas[0]) } };
}

/** Lo que se pierde o no se cobra («se van», «no cierran», «vencidas»). Sobre `paraComparar`. */
const DICE_UNA_PERDIDA =
  /\b(se van|se va|se fueron|se nos van|se nos va|se retir\w*|pierd\w*|perd\w*|baja|bajas|churn|desercion|no renuev\w*|no cierra\w*|no se cierra\w*|no se cobra\w*|no se factura\w*|sin cobrar|vencid\w*|morosi\w*|mora|cancela\w*|abandon\w*|fuga|se escapa\w*|dejan de|deja de|renuncia\w*)\b/;
/** Lo que se gana o entra («ventas nuevas», «clientes nuevos», «cierres»). Sobre `paraComparar`. */
const DICE_UNA_GANANCIA = /\b(ventas? nuevas?|nuevas? ventas?|clientes nuevos|nuevos clientes|cierres?|captad\w*|captacion|ingresos nuevos|crecimiento|ganancia\w*)\b/;

/** Un valor sin su moneda («US$ 85» → «85»): lo que `monedaDe` reconoce. */
export const sinMoneda = (x: string) =>
  x
    // «en dólares», «de colones»: se va con su preposición, para que la frase no quede rota («pérdida mensual en por…»).
    .replace(/\s+(?:en|de)\s+(?:us\s?\$|usd|d[oó]lares|d[oó]lar|colones|crc|euros?|eur|quetzales|gtq)(?![\p{L}])/giu, "")
    .replace(/us\s?\$|\busd\b|d[oó]lar(es)?|₡|\bcolones\b|\bcrc\b|€|\beuros?\b|\beur\b|\bquetzal(es)?\b|\bgtq\b|\bQ\s?(?=\d)|\$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Lo dicho alrededor de una cita para su moneda: las dos intervenciones de antes (la pregunta) y lo que la empresa siguió
 * diciendo en las dos de después.
 */
function alrededorDeLaCita(c: Pick<CitaDelResumen, "reunion" | "turno">, reuniones: readonly ReunionParaElResumen[]): string {
  const r = reuniones.find((x) => x.id === c.reunion || x.clave === c.reunion);
  if (!r) return "";
  return r.turnos
    .filter((t) => t.n >= c.turno - 2 && t.n <= c.turno + 2 && t.n !== c.turno && (t.n < c.turno || esDelCliente(r, t.hablante)))
    .map((t) => t.texto)
    .join(" ");
}

/** Los años de las reuniones y los que dijo la empresa («en 2025»): solo eso vale en una cifra además de su cita. */
function aniosDe(reuniones: readonly ReunionParaElResumen[], dicho: string): string {
  // Solo dichos como año («en 2025», «desde 2024», «el año 2023»): «2000 clientes» no es un año (la revisión del 12 nov).
  const comoAnio = [...paraComparar(dicho).matchAll(/(?:^|\s)(?:en|desde|hasta|del|de|ano|el)\s+((?:19|20)\d\d)(?!\d)/g)].map((m) => m[1]);
  return [...reuniones.map((r) => r.fecha.slice(0, 4)), ...comoAnio].join(" ");
}

/**
 * Una «cifra» que es una definición y no una magnitud (12 nov, Centauro: «~6 meses de actividad: consideras activo a quien
 * abrió o interactuó…»): no mide cuánto pasa, dice cómo se cuenta algo.
 */
const ES_UNA_DEFINICION = /\bconsidera(s|n|mos)?\b|\bse considera\b|\bse define\b|\bdefine(s|n)?\b|\bcuenta(s|n)? como\b|\bse cuenta como\b|\bcriterio\b/;

/**
 * Un pendiente que cuenta cómo se armó una cifra (12 nov: «la cifra de 1.800 se construyó combinando estimaciones dadas con
 * dudas en dos momentos distintos de la reunión»): eso es cocina nuestra, no lo que hay que validar con la empresa.
 */
const COCINA = /\bse constru(y|i)\w*|\bcombinand\w*|\bestimaciones\b|\bmomentos distintos\b|\bdos momentos\b|\bse arm(o|aron)\b|\bcon dudas\b|\bde memoria\b|\bla cifra de\b|\bdadas?\b.*\bdudas?\b|\btranscripci\w*/;

/**
 * Una pieza con su cita: el texto pasa las reglas, alguna cita está en su reunión (dicha o confirmada por la empresa), sus
 * números y sus herramientas están en lo citado. `extras`: otros textos de la pieza que se miran igual (la fricción de una
 * etapa, la nota de una cifra). null y el motivo en `descartados` si no pasa.
 */
/** Las citas de una pieza: las guardadas aceptan hasta tres (lib/exploraciones/esquemas.ts). */
export const MAX_CITAS_DE_UNA_PIEZA = 3;

/**
 * Los números que distinguen un dato (24 nov): de tres cifras o más («1.800», «23 000», «23 mil») o con decimales
 * («2,8»). Uno chico («3 asesores») sale en muchas intervenciones y no dice de cuál es. Cada uno con su valor canónico:
 * «1.800», «1,800» y «1800» son 1800; «23 mil», 23000; «2,8» y «2.8», 2.8 (un separador seguido de tres cifras es de
 * miles; de una o dos, decimal). Un año no distingue nada: «2025» después de «en», «de», «desde»… o sin una unidad
 * después; «2000 tickets» y «2.000», sí son cantidades. `desde` y `largo`: dónde está en el texto.
 */
export function numerosDistintivos(texto: string): { valor: string; desde: number; largo: number }[] {
  const out: { valor: string; desde: number; largo: number }[] = [];
  // El separador de miles: punto, coma, espacio, el espacio duro y el fino («1 800»).
  const SEP = `[.,${String.fromCharCode(0xa0, 0x202f)} ]`;
  const MILES = new RegExp(String.raw`^\d{1,3}(?:${SEP}\d{3})+$`);
  const CON_SEPARADOR = new RegExp(SEP, "g");
  const CON_MIL = /^(\d+(?:[.,]\d{1,2})?)\s*mil$/i;
  const NUMERO = new RegExp(
    String.raw`(?<![\d.,])\d+(?:[.,]\d{1,2})?\s*mil(?!\p{L})|(?<![\d.,])\d{1,3}(?:${SEP}\d{3})+(?!\d)|(?<![\d.,])\d+(?:[.,]\d{1,2})?(?!\d)`,
    "giu",
  );
  for (const m of texto.matchAll(NUMERO)) {
    const crudo = m[0];
    const desde = m.index ?? 0;
    const conMil = crudo.match(CON_MIL);
    const miles = !conMil && MILES.test(crudo);
    const valor = conMil ? String(Math.round(Number(conMil[1].replace(",", ".")) * 1000)) : miles ? crudo.replace(CON_SEPARADOR, "") : crudo.replace(",", ".");
    const entero = valor.split(".")[0];
    const decimal = valor.includes(".");
    if (!conMil && !miles && /^(19|20)\d\d$/.test(valor)) {
      const antes = paraComparar(texto.slice(0, desde)).split(" ").filter(Boolean).at(-1) ?? "";
      if (DE_UN_ANIO.has(antes) || (!ES_UNA_CANTIDAD.has(antes) && !unidadDe(texto, { desde, largo: crudo.length }).palabras.length)) continue;
    }
    if (entero.length >= 3 || decimal) out.push({ valor: String(Number(valor)), desde, largo: crudo.length });
  }
  return out;
}

/** Lo que va antes de una cantidad, no de un año («unos 2000», «como 1950»). Sobre `paraComparar`. */
const ES_UNA_CANTIDAD = new Set(["unos", "unas", "como", "aproximadamente", "cerca", "casi", "alrededor", "mas", "menos", "sobre"]);
/** Lo que va antes de un año («en 2025», «desde 2024»). Sobre `paraComparar`. */
const DE_UN_ANIO = new Set(["en", "de", "del", "desde", "hasta", "para", "ano", "el", "al", "durante", "antes", "despues"]);

/** Lo que no dice de qué habla un número («al mes», «unos», «de»). Sobre `paraComparar`. */
const NO_DICEN_DE_QUE = new Set(["al", "mes", "meses", "ano", "anos", "semana", "semanas", "dia", "dias", "por", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "que", "con", "sin", "en", "y", "o", "a", "aproximadamente", "cerca", "mas", "menos", "casi", "hoy", "cada", "son", "es", "se", "su", "sus", "tu", "tus", "entre", "como", "hay", "tiene", "tienen", "tenemos", "mensual", "mensuales", "anual", "diario", "diarios", "semanal", "semanales", "esos", "esas", "estos", "estas", "alrededor", "pero", "porque", "entonces", "digamos", "okay", "bueno"]);

/** La misma palabra escrita de otra forma, y en singular («tiquetes» y «tickets» son «ticket»). Sobre `paraComparar`. */
const raizDe = (w: string) => w.replace(/^tiquete/, "ticket").replace(/(es|s)$/, "");

/**
 * La unidad de un número en un texto: las palabras que dicen QUÉ cuenta, de las tres que lo siguen («1.800 tickets al
 * mes» → «ticket»), y si es un porcentaje. Revisión del 24 nov: las palabras de ANTES («Marketing recibe…») y un comienzo
 * parecido («recibe» y «recién») daban por iguales dos números de cosas distintas.
 */
function unidadDe(texto: string, n: { desde: number; largo: number }, cuantas = 3): { porcentaje: boolean; palabras: string[] } {
  const resto = texto.slice(n.desde + n.largo);
  const porcentaje = /^\s*(%|por ciento)/i.test(resto);
  // Hasta el primer signo: en «1800 al mes, ¿verdad?», «verdad» no dice qué cuenta el número.
  // También en «y», «pero», «aunque», «mientras» o «sino»: lo de después es otra frase («500 clientes pero activos son 300»,
  // «500 clientes y solo uno atendiendo»).
  const palabras = paraComparar(resto.split(/[.,;:?!¿¡()]|\s(?:y|e|pero|aunque|mientras|sino)\s/i)[0] ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, cuantas)
    .filter((w) => w.length >= 4 && !NO_DICEN_DE_QUE.has(w) && !/^\d/.test(w))
    .map(raizDe);
  return { porcentaje, palabras: [...new Set(palabras)] };
}

/** Lo que mide un porcentaje en un texto: las palabras con contenido de las tres de antes («churn» en «churn del 2,8 %»). */
function queMideDe(texto: string, n: { desde: number }): string[] {
  return paraComparar(texto.slice(0, n.desde))
    .split(" ")
    .filter(Boolean)
    .slice(-3)
    .filter((w) => w.length >= 4 && !NO_DICEN_DE_QUE.has(w) && !/^\d/.test(w))
    .map(raizDe);
}

/** Si un texto nombra alguna de estas palabras (la palabra entera, en singular o plural). */
const nombraAlguna = (texto: string, ws: readonly string[]) => {
  const ps = new Set(paraComparar(texto).split(" ").map(raizDe));
  return ws.some((w) => ps.has(w));
};

/** Otro momento u otra cosa alrededor de un número (un piloto, una meta, lo que tenían antes). Sobre `paraComparar`. */
const OTRO_MOMENTO = new Set(["tuvimos", "tuvieron", "teniamos", "tenian", "tenia", "tuvo", "habia", "hubo", "era", "eran", "fue", "fueron", "estaba", "estaban", "arrancamos", "empezamos", "antes", "anterior", "pasado", "piloto", "prueba", "meta", "objetivo", "queremos", "quisieramos", "esperamos", "proyectamos", "llegar", "competencia"]);
/** «de esos 1800»: el número retoma uno que se dijo antes. Sobre `paraComparar` de lo que va justo antes del número. */
const RETOMA_LO_DICHO = /\b(esos|esas|estos|estas)$/;
/** Una intervención corta que es la respuesta a una pregunta («Aproximadamente unos 100»): su unidad está en la pregunta. */
const PALABRAS_DE_UNA_RESPUESTA_CORTA = 8;

/**
 * Si un número de una intervención habla de lo mismo que en la pieza (revisión del 24 nov, dos vueltas).
 *   · Un porcentaje, con un porcentaje; y si la pieza dice qué mide («churn»), la intervención o las cuatro de antes lo
 *     nombran.
 *   · Si la intervención dice la unidad del número («1.800 dólares»), tiene que ser la de la pieza: «dólares» no es
 *     «tickets», aunque se haya hablado de tickets antes.
 *   · Sin unidad: si es una respuesta corta («Aproximadamente unos 100»), la unidad está en las cuatro de antes; si retoma
 *     el número con «esos» (Centauro, 6 nov: Emiley, «de esos 1800, 100 son de facturas», veinte intervenciones después de
 *     «Tiquetes» y de Marco, «1800 al mes»), vale la vez anterior que se dijo ese número en la reunión, con estas mismas
 *     reglas. Si no, no.
 */
function hablaDeLoMismo(
  r: ReunionParaElResumen,
  t: TurnoNumerado,
  valor: string,
  pieza: { porcentaje: boolean; palabras: string[]; mide: string[]; texto: string; periodo: number | null },
  vueltas = 1,
): boolean {
  const aqui = numerosDistintivos(t.texto).find((x) => x.valor === valor);
  if (!aqui) return false;
  /* Un número de otro momento o de otra cosa no sostiene el de hoy (revisión del 24 nov, segunda vuelta: «tuvimos 500
     clientes en el piloto» sostenía «~500 clientes activos»): si alrededor se habla de antes, de una prueba o de una meta,
     y la pieza no, no vale. */
  const cerca = r.turnos.filter((u) => u.n <= t.n && u.n >= t.n - VECINOS).map((u) => u.texto).join(" ");
  // En una respuesta corta, el momento lo dice la pregunta («¿Y cuántos clientes tuvieron en el piloto?» · «Como unos 500»).
  const corta = vueltas === 0 || palabrasDe(t.texto).length <= PALABRAS_DE_UNA_RESPUESTA_CORTA;
  const alrededor = corta ? cerca : alrededorDe(t.texto, aqui.desde);
  if (paraComparar(alrededor).split(" ").some((w) => OTRO_MOMENTO.has(w) && !nombraAlguna(pieza.texto, [raizDe(w)]))) return false;
  // El mismo período (revisión final del 24 nov: «al año entran como 1800 tickets» sostenía «~1.800 tickets al mes»).
  const periodo = periodoDelNumero(t.texto, aqui.desde) ?? (corta ? porMesDe(cerca) : null);
  if (pieza.periodo !== null && periodo !== null && periodo !== pieza.periodo) return false;
  const suya = unidadDe(t.texto, aqui);
  if (pieza.porcentaje) return suya.porcentaje && (!pieza.mide.length || nombraAlguna(cerca, pieza.mide));
  if (suya.porcentaje) return false;
  if (suya.palabras.length) {
    if (!suya.palabras.some((w) => pieza.palabras.includes(w))) return false;
    // Si las dos le agregan algo a la unidad, es lo mismo («500 clientes inactivos» no sostiene «500 clientes activos»).
    const agregaLaPieza = pieza.palabras.some((w) => !suya.palabras.includes(w));
    if (agregaLaPieza && suya.palabras.some((w) => !pieza.palabras.includes(w))) return false;
    /* Lo que la pieza agrega a la unidad no puede estar dicho de OTRO número de la misma intervención («teníamos 500
       clientes, ahora activos son unos 300» no sostiene «500 clientes activos»); si la intervención no lo nombra, es el
       rótulo del agente («tickets de soporte») y vale. */
    const delTurno = new Set(paraComparar(t.texto).split(" ").map(raizDe));
    const pegadas = new Set([...unidadDe(t.texto, aqui, 5).palabras, ...queMideDe(t.texto, aqui)]);
    return pieza.palabras.every((w) => !delTurno.has(w) || pegadas.has(w));
  }
  // La vez anterior que se dijo el número (la que se retoma) se mira con lo que se hablaba ahí, sea corta o larga: basta
  // la cabeza de la unidad («tickets» en «tickets de soporte al mes»).
  if (corta && !!pieza.palabras.length && nombraAlguna(cerca, pieza.palabras.slice(0, 1))) return true;
  if (vueltas <= 0 || !RETOMA_LO_DICHO.test(paraComparar(t.texto.slice(0, aqui.desde)).trim())) return false;
  const antes = [...r.turnos].reverse().find((u) => u.n < t.n && numerosDistintivos(u.texto).some((x) => x.valor === valor));
  return !!antes && hablaDeLoMismo(r, antes, valor, pieza, vueltas - 1);
}

/**
 * El período de un número en un texto: el que sigue al número hasta el próximo número («1.800 tickets al mes»), o el de
 * las seis palabras de antes («al año entran como 1800»). null si no dice.
 */
function periodoDelNumero(texto: string, desde: number): number | null {
  return porMesDelPrimero(texto.slice(desde)) ?? porMesDe(texto.slice(0, desde).split(/\s+/).slice(-6).join(" "));
}

/** El pedazo de una intervención alrededor de un número, como se dijo: hasta 8 palabras antes y 12 después. */
function alrededorDe(texto: string, desde: number): string {
  const antes = texto.slice(0, desde).split(/\s+/).filter(Boolean);
  const despues = texto.slice(desde).split(/\s+/).filter(Boolean);
  return [...antes.slice(-8), ...despues.slice(0, 12)].join(" ");
}

/**
 * Las citas de los números de una pieza que su cita no trae (24 nov, Centauro: «~1.800 tickets al mes» lo dijo la empresa
 * el 6 nov, «de esos 1800, 100 son de facturas», y el punto citaba otra frase). Solo los números que distinguen
 * (`numerosDistintivos`), solo lo que dijo la EMPRESA (o una nota del equipo), y solo una intervención que habla de LO
 * MISMO (`hablaDeLoMismo`; revisión del 24 nov: «pagamos como 1.800 dólares al año» no sostiene «1.800 tickets»). Primero en las reuniones de sus citas, la intervención más cercana; si no, en otra reunión, pero solo si una
 * sola intervención de la empresa lo dice. Cada una pasa por `citaVerificada`, la vara de siempre.
 */
export function citasDeSusNumeros(texto: string, citas: readonly CitaDelResumen[], reuniones: readonly ReunionParaElResumen[]): CitaDelResumen[] {
  const yaDichos = new Set(numerosDistintivos(citas.map((c) => c.texto).join(" ")).map((x) => x.valor));
  const faltan = numerosDistintivos(texto).filter((x, i, xs) => !yaDichos.has(x.valor) && xs.findIndex((y) => y.valor === x.valor) === i);
  const out: CitaDelResumen[] = [];
  for (const n of faltan) {
    const valor = n.valor;
    const pieza = { ...unidadDe(texto, n), mide: queMideDe(texto, n), texto, periodo: periodoDelNumero(texto, n.desde) };
    // Sin saber qué cuenta el número en la pieza, no se puede decir que otra intervención hable de lo mismo.
    if (!pieza.porcentaje && !pieza.palabras.length) continue;
    const candidatos = reuniones.flatMap((r) =>
      r.turnos
        .filter((t) => (!!r.delEquipo || esDelCliente(r, t.hablante)) && numerosDistintivos(t.texto).some((x) => x.valor === valor))
        .filter((t) => hablaDeLoMismo(r, t, valor, pieza))
        .map((t) => ({ r, t })),
    );
    if (!candidatos.length) continue;
    const deSusReuniones = candidatos.filter(({ r }) => citas.some((c) => c.reunion === r.id));
    const cerca = (n: number, r: ReunionParaElResumen) => Math.min(...citas.filter((c) => c.reunion === r.id).map((c) => Math.abs(c.turno - n)));
    const elegido = deSusReuniones.length ? [...deSusReuniones].sort((a, b) => cerca(a.t.n, a.r) - cerca(b.t.n, b.r))[0] : candidatos.length === 1 ? candidatos[0] : null;
    if (!elegido) continue;
    const donde = numerosDistintivos(elegido.t.texto).find((x) => x.valor === valor)!.desde;
    const pedazo = alrededorDe(elegido.t.texto, donde);
    const c = citaVerificada({ reunion: elegido.r.clave, turno: elegido.t.n, texto: pedazo }, reuniones);
    if (c && !out.some((y) => y.reunion === c.reunion && y.turno === c.turno)) out.push(c);
  }
  return out;
}

/** Las palabras de un equipo en «Quién es quién», además de los equipos de la escala. Sobre `paraComparar`. */
const EQUIPOS_DEL_MAPA = ["ventas", "marketing", "mercadeo", "servicio", "soporte", "onboarding", "customer", "success", "atencion", "cliente", "clientes", "posventa", "postventa", "operaciones", "finanzas", "cobranza", "credito", "cobro", "ti", "tecnologia", "sistemas", "direccion", "gerencia", "comunicacion", "contenido", "ecommerce", "comercio", "retencion", "implementacion", "comercial"];
/**
 * Las palabras con mayúscula de una línea del mapa que no son nombres de personas: los roles y las de un equipo (una sola
 * lista con `EQUIPOS_DEL_MAPA`: «Servicio: Ana (Atención al cliente)» se caía por «Atención»). Sobre `paraComparar`.
 */
const NO_SON_NOMBRES_DEL_MAPA = new Set([...EQUIPOS_DEL_MAPA, "y", "e", "al", "a", "con", "el", "la", "los", "las", "un", "una", "de", "del", "equipo", "lidera", "ceo", "coo", "cfo", "cto", "gerente", "general", "director", "directora", "jefe", "jefa", "lider", "asesores", "asesoras", "asesor", "asesora", "socio", "socia", "socios", "dueno", "duena", "coordinador", "coordinadora", "supervisor", "supervisora"]);
/** Quién lidera en «Quién es quién» («Lidera», «CEO», «Gerencia general», «Dueño»). Sobre `paraComparar`. */
const QUIEN_LIDERA = /^(lider\w*|ceo|gerencia|gerente|direccion|director\w*|duen[oa]s?|fundador\w*)\b/;
/** Un dolor pegado a una persona en «Quién es quién»: ahí solo va quién está y dónde. Sobre `paraComparar`. */
const DOLOR_EN_EL_MAPA = /\b(no|sin|nunca|falta|faltan|problemas?|error(es)?|mal|tarde|olvida\w*|pierde\w*|duplicad\w*|manual\w*|desorden\w*|reclam\w*|queja\w*)\b/;

/** Las palabras de la parte del equipo de una línea del mapa: quién lidera o un equipo, sin más. */
const MAX_PALABRAS_DEL_EQUIPO_DEL_MAPA = 5;
/**
 * Lo único que puede ir con los nombres en la gente de una línea del mapa, además de los roles y las cantidades: «y 3
 * personas más», «jefatura y 5 asesores». Lo demás (revisión del 24 nov: «que está saturada», «sobrecargada», «solo ella
 * atiende todo») es una calificación de la persona y no va. Sobre `paraComparar`.
 */
const VAN_CON_LA_GENTE = new Set(["mas", "personas", "persona", "otros", "otras", "otro", "otra", "apoyo", "externo", "externa", "externos", "jefatura", "gerencia", "direccion", "analista", "analistas", "ejecutivo", "ejecutivos", "ejecutiva", "ejecutivas", "vendedor", "vendedores", "vendedora", "vendedoras", "agente", "agentes", "tecnico", "tecnicos", "tecnica", "tecnicas", "especialista", "especialistas", "practicante", "practicantes", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "su", "sus"]);

/** Los roles con que alguien de la empresa se presenta o lo presentan, para buscar la cita de una línea. Sobre `paraComparar`. */
const ROLES_DEL_MAPA = new Set(["lidera", "lidero", "lideran", "lider", "lideres", "gerente", "gerencia", "general", "director", "directora", "direccion", "dueno", "duena", "jefe", "jefa", "jefatura", "supervisor", "supervisora", "coordinador", "coordinadora", "encargado", "encargada", "encargo", "fundador", "fundadora", "socio", "socia"]);
/** Lo único que puede ir entre un nombre y su rol («Fernando, nuestro gerente general», «el gerente general, Fernando»). */
const ENTRE_NOMBRE_Y_ROL = new Set(["nuestro", "nuestra", "el", "la", "es", "que", "quien", "como", "de", "del", "este", "digamos", "pues", "actual"]);
/** Lo que, antes del rol, dice que ya no lo es («el ex gerente general», «el anterior gerente»). Sobre `paraComparar`. */
const ANTES_DEL_ROL_YA_NO = new Set(["ex", "anterior", "antiguo", "antigua", "previo", "previa"]);
/**
 * Quien habla se presenta: «yo» o «me» (con a lo sumo un «digamos», «este», «pues» o «solo» en el medio) y uno de estos
 * verbos, con el rol o el equipo después y solo esto en el medio (`ENTRE_VERBO_Y_EQUIPO`): «yo digamos lidero el equipo de
 * comunicación y marketing», «yo solo llevo Customer Success». «Yo soy la asistente del gerente general», «yo llevo dos
 * años con el director» o «yo manejo la agenda de la gerencia» no (revisión del 24 nov, segunda vuelta). Sobre `paraComparar`.
 */
const SE_PRESENTA = new Set(["soy", "lidero", "dirijo", "coordino", "superviso", "encargo", "llevo", "manejo"]);
const ANTES_DEL_VERBO = new Set(["yo", "me", "digamos", "este", "pues", "solo", "ahorita"]);
const ENTRE_VERBO_Y_EQUIPO = new Set(["el", "la", "los", "las", "de", "del", "equipo", "area", "departamento", "y", "e", "digamos", "este", "todo", "toda", "lo", "que"]);
/** Lo más lejos que pueden estar el nombre (o el verbo) y el rol. */
const PALABRAS_ENTRE_NOMBRE_Y_ROL = 6;
/** Lo que niega o pone en pasado un rol, en la ventana o en las tres palabras que siguen al rol. Sobre `paraComparar`. */
const NIEGA_O_YA_NO = new Set(["no", "ni", "ex", "ya", "antes", "nunca", "tampoco", "dejo", "salio", "renuncio", "sin", "anterior", "anteriormente", "era", "eran", "fue", "fueron", "fui", "estaba", "estaban", "estuvo", "trabajaba", "trabajaban"]);

/**
 * La gente de una línea del mapa: cada persona, por los nombres seguidos con mayúscula, con su nombre de pila (el primero)
 * y sus apellidos. «Carolina Vicente» es Carolina: su apellido no es el nombre de pila de Vicente Mora.
 */
function personasDeLaLinea(texto: string, dePila: ReadonlySet<string>, equipos: ReadonlySet<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of texto.matchAll(/\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)*/gu)) {
    const ws = m[0].split(/\s+/).map(paraComparar).filter((w) => !NO_SON_NOMBRES_DEL_MAPA.has(w) && !equipos.has(w));
    if (ws.length && dePila.has(ws[0])) out.set(ws[0], new Set([...(out.get(ws[0]) ?? []), ...ws.slice(1)]));
  }
  return out;
}

/**
 * La cita de una línea de «Quién es quién» que no trajo ninguna que esté en la reunión (24 nov, segunda vuelta, Centauro:
 * «Lidera: Fernando Segura, gerente general» citaba una frase de Marco, y Luis dijo el 10 nov «Fernando nuestro gerente
 * general»). Se busca en lo que dijo la EMPRESA una intervención con una de estas tres formas, y nada más en el medio:
 *   · el NOMBRE DE PILA de alguien de la línea, escrito con mayúscula, y su rol o su equipo después («Fernando, nuestro
 *     gerente general»), con a lo sumo sus apellidos o `ENTRE_NOMBRE_Y_ROL` en el medio;
 *   · el rol antes del nombre («el gerente general, Fernando»);
 *   · esa misma persona que se presenta (`SE_PRESENTA`: «yo digamos lidero el equipo de comunicación y marketing»).
 * Y nada que lo niegue o lo ponga en pasado ni en el medio ni justo después (`NIEGA_O_YA_NO`: «Fernando era el gerente
 * general», «ex gerente»). Revisiones de esa vuelta: un apellido que es una palabra («no estoy segura» por Segura), un
 * «mi» suelto («Mi jefe es el gerente general»), «yo soy la asistente del gerente general», «Fernando le reporta al
 * director» y un apellido que es el nombre de pila de otro sostenían a la persona equivocada. De la más cercana a la más
 * lejana, la primera cuyo pedazo pasa por `citaVerificada`.
 */
function citaDeQuienEs(texto: string, ctx: ContextoDelResumen, equipos: ReadonlySet<string>): { reunion: string; turno: number; texto: string } | null {
  const dePila = new Set((ctx.gente ?? []).map((n) => paraComparar(n.trim().split(/\s+/)[0] ?? "")).filter((x) => x.length >= 3));
  const personas = personasDeLaLinea(texto, dePila, equipos);
  const roles = new Set(paraComparar(texto).split(" ").filter((w) => ROLES_DEL_MAPA.has(w) || equipos.has(w)));
  // Una cita encontrada sostiene a UNA persona: con dos en la línea, la otra saldría con un cargo que nadie le dio.
  if (personas.size !== 1 || !roles.size) return null;
  const esRolOEquipo = (w: string) => roles.has(w) || ROLES_DEL_MAPA.has(w) || equipos.has(w);
  const candidatos: { distancia: number; r: ReunionParaElResumen; t: TurnoNumerado; desde: number; hasta: number }[] = [];
  for (const r of ctx.reuniones) {
    if (r.delEquipo) continue;
    for (const t of r.turnos) {
      if (!esDelCliente(r, t.hablante)) continue;
      const ws = t.texto.split(/\s+/).filter(Boolean);
      const ps = ws.map((w) => paraComparar(w));
      const limpio = (desde: number, hasta: number) =>
        !ps.slice(desde, Math.min(ps.length, hasta + 4)).some((w) => NIEGA_O_YA_NO.has(w)) && !ps.slice(Math.max(0, desde - 3), desde).some((w) => ANTES_DEL_ROL_YA_NO.has(w));
      const deRol = ps.flatMap((w, i) => (roles.has(w) ? [i] : []));
      for (const [nombre, apellidos] of personas) {
        // El nombre, escrito como nombre: con su mayúscula.
        const anclas = ps.flatMap((w, i) => (w === nombre && /^[¿¡«"(]?\p{Lu}/u.test(ws[i]) ? [i] : []));
        for (const x of anclas)
          for (const y of deRol) {
            const desde = Math.min(x, y);
            const hasta = Math.max(x, y);
            const medio = ps.slice(desde + 1, hasta);
            // Con el rol primero, «de» justo antes del nombre es de otra persona («la jefa de Rosa»).
            const vale =
              y > x ? medio.every((w) => ENTRE_NOMBRE_Y_ROL.has(w) || apellidos.has(w)) : medio.every((w) => ENTRE_NOMBRE_Y_ROL.has(w) || esRolOEquipo(w)) && !["de", "del"].includes(ps[x - 1] ?? "");
            if (hasta - desde <= PALABRAS_ENTRE_NOMBRE_Y_ROL && vale && limpio(desde, hasta)) candidatos.push({ distancia: hasta - desde, r, t, desde, hasta });
          }
        // Esa persona se presenta: quien habla tiene ese nombre de pila (y sus apellidos, si la línea los da).
        const delHablante = paraComparar(t.hablante).split(" ");
        if (delHablante[0] !== nombre || [...apellidos].some((a) => !delHablante.includes(a))) continue;
        for (let i = 0; i < ps.length; i++) {
          if (!SE_PRESENTA.has(ps[i])) continue;
          const antes = ps.slice(Math.max(0, i - 3), i);
          const yo = antes.lastIndexOf("yo") >= 0 ? antes.lastIndexOf("yo") : antes.lastIndexOf("me");
          if (yo < 0 || !antes.slice(yo).every((w) => ANTES_DEL_VERBO.has(w))) continue;
          const j = deRol.find((y) => y > i && y - i <= PALABRAS_ENTRE_NOMBRE_Y_ROL && ps.slice(i + 1, y).every((w) => ENTRE_VERBO_Y_EQUIPO.has(w) || esRolOEquipo(w)));
          const desde = Math.max(0, i - 3) + yo;
          if (j !== undefined && limpio(desde, j)) candidatos.push({ distancia: j - i, r, t, desde, hasta: j });
        }
      }
    }
  }
  // De la más cercana a la más lejana, la primera cuyo pedazo está en la reunión tal como se dijo.
  for (const k of [...candidatos].sort((a, b) => a.distancia - b.distancia)) {
    const ws = k.t.texto.split(/\s+/).filter(Boolean);
    const desde = Math.max(0, k.desde - 3);
    const hasta = Math.min(ws.length, Math.max(k.hasta + 4, desde + PALABRAS_DE_UNA_CITA + 2));
    const cita = { reunion: k.r.clave, turno: k.t.n, texto: ws.slice(desde, hasta).join(" ") };
    if (citaVerificada(cita, ctx.reuniones)) return cita;
  }
  return null;
}

/**
 * Una línea de «Quién es quién» (24 nov, Elías: el mapa de los equipos con su gente y quién lidera, como el business case
 * de Marco para Centauro). Es la ÚNICA pieza con nombres: los de la gente de la EMPRESA (`ContextoDelResumen.gente`),
 * nunca de Smarteam ni de otra empresa, y nunca pegados a un dolor. Pasa la vara de siempre (su cita, los números, las
 * herramientas), sin el rechazo de los nombres de la empresa, y además: tiene la forma «<equipo o quién lidera>: <gente>»;
 * cada nombre es de alguien de la empresa que habló en las reuniones o quien decide (también su diminutivo: «Cata» por
 * «Catalina»), o lo nombra su cita; el nombre de pila de alguien de Smarteam no pasa aunque sea el apellido de alguien de
 * la empresa («Ana Marco» no deja pasar a Marco Salas); y antes de los dos puntos no lleva un dolor («Soporte que olvida
 * los tickets: Emiley»). Sin la gente de la empresa (una empresa sin dominios de correo registrados, donde no se sabe quién
 * es de afuera) no pasa ningún nombre, ni con su cita.
 * Segunda vuelta del 24 nov (Centauro, corrida real: se cayeron Ventas, Customer Success y quien lidera): sin una cita que
 * esté en la reunión, se busca la de esa persona (`citaDeQuienEs`); y una línea con algo de más después de los dos puntos
 * (una calificación, un dolor, lo que alguien hace) se pide corregida (`arreglar`) en vez de tirarla.
 */
export function lineaDelMapa(
  v: unknown,
  ctx: ContextoDelResumen,
  o: Reglas,
  descartados: string[],
  arreglar?: (x: { texto: string; citas: CitaDelResumen[]; problema: string }) => void,
): { texto: string; citas: CitaDelResumen[] } | null {
  const primero = (n: string) => paraComparar(n.trim().split(/\s+/)[0] ?? "");
  // Cada palabra de cada nombre (24 nov, Centauro: «Luis Humberto» es un nombre de pila compuesto).
  const gente = new Set((ctx.gente ?? []).flatMap((n) => paraComparar(n).split(" ")).filter((x) => x.length >= 3));
  const deLaEmpresa = new Set((ctx.gente ?? []).map(primero));
  // Los nombres de pila que no son de la empresa (los de Smarteam y los de otra empresa que hablaron).
  const deAfuera = new Set(o.personas.filter((n) => !(ctx.gente ?? []).some((g) => paraComparar(g) === paraComparar(n))).map(primero).filter((x) => x.length >= 3 && !deLaEmpresa.has(x)));
  const deEquipos = new Set([...EQUIPOS_DEL_MAPA, ...(o.equipos ?? []).flatMap((e) => paraComparar(e).split(" "))]);
  const donde = "«Quién es quién»";
  const crudo = objeto(v);
  const conCita = citasVerificadas([...arreglo(crudo.citas), ...(crudo.cita ? [crudo.cita] : [])], ctx.reuniones).length > 0;
  const buscada = conCita ? null : citaDeQuienEs(cadena(crudo.texto), ctx, deEquipos);
  const p = conSuCita(buscada ? { ...crudo, citas: [buscada] } : v, ctx, { ...o, personas: o.personas.filter((n) => !deLaEmpresa.has(primero(n))) }, descartados, donde, TOPE_DE_UNA_LINEA_DEL_MAPA);
  if (!p) return null;
  const i = p.texto.indexOf(":");
  // Lo de antes de los dos puntos es quién lidera o un equipo (24 nov, Centauro: «También mencionado: Eduardo…» no lo es).
  const equipo = i > 0 ? paraComparar(p.texto.slice(0, i)) : "";
  if (
    !equipo ||
    i > MAX_LARGO_DEL_EQUIPO_DEL_MAPA ||
    equipo.split(" ").length > MAX_PALABRAS_DEL_EQUIPO_DEL_MAPA ||
    !(QUIEN_LIDERA.test(equipo) || equipo.split(" ").some((w) => deEquipos.has(w)))
  ) {
    descartados.push(`${donde}: no dice quién lidera ni de qué equipo es («${p.texto.slice(0, 60)}»)`);
    return null;
  }
  if (DOLOR_EN_EL_MAPA.test(equipo)) {
    descartados.push(`${donde}: le pega un dolor a la gente («${p.texto.slice(0, 60)}»)`);
    return null;
  }
  // Toda la línea, también antes de los dos puntos (revisión del 24 nov: «Lidera Eduardo Mora: Ventas» se saltaba).
  const nombresDe = (x: string) => [...x.matchAll(/(?<!\p{L})\p{Lu}\p{Ll}+(?!\p{L})/gu)].map((m) => m[0]).filter((w) => !NO_SON_NOMBRES_DEL_MAPA.has(paraComparar(w)) && !deEquipos.has(paraComparar(w)));
  const deLosNombres = new Set(nombresDe(p.texto).map((w) => paraComparar(w)));
  /* Con la gente, solo nombres, roles y cantidades: lo demás (una calificación, un dolor, lo que alguien hace) se pide
     corregido, con su cita (segunda vuelta del 24 nov: «único en el área», «Laura gestiona…»), y lo corregido vuelve por
     esta misma función. No se recorta en el código: lo que sobra puede decir que alguien ya no está («se fue en marzo»,
     «era la jefa»), y quitarlo lo haría pasar por vigente. */
  const deMas = paraComparar(p.texto.slice(i + 1))
    .split(" ")
    .filter(Boolean)
    .find((w) => (!/^\d+$/.test(w) && !deLosNombres.has(w) && !NO_SON_NOMBRES_DEL_MAPA.has(w) && !VAN_CON_LA_GENTE.has(w)) || DOLOR_EN_EL_MAPA.test(w));
  if (deMas) {
    descartados.push(`${donde}: dice algo más que quién está («${deMas}» en «${p.texto.slice(0, 60)}»)`);
    /* Si lo de más dice que alguien ya no está o ya no tiene ese rol («se fue en marzo», «era la jefa», «ya no»), se cae:
       pedirlo corregido con una cita que no lo dice podía devolver a esa persona como vigente (revisión final del 24 nov). */
    const gente = paraComparar(p.texto.slice(i + 1)).split(" ");
    if (!gente.some((w) => NIEGA_O_YA_NO.has(w) || ANTES_DEL_ROL_YA_NO.has(w)))
      arreglar?.({ texto: p.texto, citas: p.citas, problema: `dice algo más que quién está («${deMas}»): deja solo quién está y dónde` });
    return null;
  }
  const texto = p.texto;
  const citado = new Set(paraComparar(p.citas.map((c) => c.texto).join(" ")).split(" "));
  const desconocido = nombresDe(texto).find((w) => {
    const x = paraComparar(w);
    if (!gente.size || deAfuera.has(x)) return true;
    if (citado.has(x)) return false;
    return ![...gente].some((g) => g === x || (x.length >= 3 && g.startsWith(x)));
  });
  if (desconocido) {
    descartados.push(`${donde}: nombra a alguien que no habló en las reuniones ni sale en su cita («${desconocido}»)`);
    return null;
  }
  return { texto, citas: p.citas };
}

function conSuCita(
  v: unknown,
  ctx: ContextoDelResumen,
  o: Reglas,
  descartados: string[],
  donde: string,
  tope = TOPE_DEL_TEXTO_DEL_RESUMEN,
  extras: readonly string[] = [],
  porArreglar?: (x: { texto: string; citas: CitaDelResumen[]; problema: string; delAgente?: CitaDelResumen[] }) => void,
  vecinosDe?: readonly CitaDelResumen[],
): { texto: string; citas: CitaDelResumen[] } | null {
  const x = objeto(v);
  let citas = citasVerificadas([...arreglo(x.citas), ...(x.cita ? [x.cita] : [])], ctx.reuniones);
  const delAgente = citas;
  let lo = citas.map((c) => c.texto).join(" ");
  const crudo = cadena(typeof v === "string" ? v : x.texto);
  // Una conclusión en la cola («…, lo que limita el crecimiento») se corta antes de mirar el resto.
  const sinCola = citas.length ? (sinLaConclusion(crudo, lo) ?? crudo) : crudo;
  const t = textoValido(sinCola, tope, o, lo);
  // Lo de forma, con alguna cita verificada, se pide corregido (12 nov: se tiraba entero).
  const caer = (motivo: string, texto: string) => {
    descartados.push(`${donde}: ${motivo}`);
    if (porArreglar && citas.length && ES_DE_FORMA.test(motivo)) porArreglar({ texto, citas, problema: motivo, ...(citas !== delAgente ? { delAgente: [...(vecinosDe ?? delAgente)] } : {}) });
    return null;
  };
  if (!t.ok) return caer(t.motivo, crudo);
  if (!citas.length) {
    descartados.push(`${donde} sin una cita que esté en la reunión («${t.texto.slice(0, 60)}…»)`);
    return null;
  }
  const texto = t.texto;
  const todo = [texto, ...extras].join(" ");
  // Los números chicos valen de la vecindad de las citas del AGENTE, no de una cita encontrada para otro número (revisión
  // del 24 nov, segunda vuelta): la vecindad de la nueva habla de otra cosa.
  const vecindad = loDeSusReuniones(vecinosDe ?? citas, ctx.reuniones);
  let sobran = cifrasDeMas(todo, lo, vecindad);
  /* Antes de descartar, se busca la cita (24 nov, segunda vuelta: en la corrida real de Centauro se perdían el «~1.800»,
     el churn y la portada): un número que la empresa sí dijo en otra intervención sobre lo mismo va como otra cita, aunque
     otro número de la pieza no aparezca (antes era todo o nada). El texto no se toca: lo que siga sin cita se pide corregido
     a la IA, con las citas que se encontraron, y lo corregido pasa la misma vara. (Las revisiones de esa vuelta mostraron
     que recortarlo en el código —quitar una frase, un paréntesis— cambiaba lo dicho: una excepción, un «eso» que remitía a
     lo quitado.) */
  if (sobran.length) {
    const nuevas = citasDeSusNumeros(todo, citas, ctx.reuniones).slice(0, Math.max(0, MAX_CITAS_DE_UNA_PIEZA - citas.length));
    if (nuevas.length) {
      const con = [...citas, ...nuevas];
      const loCon = con.map((c) => c.texto).join(" ");
      const quedan = cifrasDeMas(todo, loCon, vecindad);
      if (quedan.length < sobran.length) {
        citas = con;
        lo = loCon;
        sobran = quedan;
      }
    }
  }
  if (sobran.length) return caer(`números que no están en su cita (${sobran.map((s) => s.replace(/·$/, "").replace("·", " ")).join(", ")})`, texto);
  const herramientas = herramientasDeMas(todo, lo, dichoEnSusReuniones(citas, ctx.reuniones));
  if (herramientas.length) return caer(`nombra herramientas que la empresa no nombró en sus reuniones (${herramientas.join(", ")})`, texto);
  const lectura = lecturaNuestra(todo, lo);
  if (lectura) return caer(`califica con una lectura nuestra que la empresa no dijo («${lectura}»)`, texto);
  // La misma vara que la auditoría (12 nov: «busca… crecer» pasó la lectura y la auditoría lo marcó ya guardado).
  const conclusion = concluyeDeMas(todo, lo);
  if (conclusion) return caer(`saca una conclusión que la cita no dice («${conclusion}»)`, texto);
  return { texto, citas };
}

/**
 * La tesis son dos frases: el agente a veces las manda como dos piezas, una por frase (simulacro de Polaris, 15 nov), y
 * solo pasaba la primera. Dos piezas con texto se juntan en una, con las citas de las dos.
 */
function unaTesis(xs: readonly unknown[]): unknown[] {
  const conTexto = xs.filter((x) => typeof objeto(x).texto === "string" && cadena(objeto(x).texto));
  if (conTexto.length < 2) return [...xs];
  const [a, b] = conTexto.map(objeto);
  return [{ texto: `${cadena(a.texto)} ${cadena(b.texto)}`, citas: [...arreglo(a.citas), ...arreglo(b.citas)] }];
}

/** Un texto sin cita propia (un «por qué», un pendiente, una pregunta): sus números y herramientas los tuvo que decir la empresa. */
function sinCitaPropia(v: unknown, tope: number, o: Reglas, todoLoDicho: string, descartados: string[], donde: string): string | null {
  const t = textoValido(v, tope, o);
  if (!t.ok) {
    descartados.push(`${donde}: ${t.motivo}`);
    return null;
  }
  const sobran = cifrasDeMas(t.texto, todoLoDicho);
  if (sobran.length) {
    descartados.push(`${donde} con números que la empresa no dijo (${sobran.join(", ")})`);
    return null;
  }
  const herramientas = herramientasDeMas(t.texto, todoLoDicho);
  if (herramientas.length) {
    descartados.push(`${donde} nombra herramientas que la empresa no nombró (${herramientas.join(", ")})`);
    return null;
  }
  return t.texto;
}

/**
 * Lee la respuesta (`parse`: el lector de JSON compartido, `parseObject`) y se queda con lo que pasa las reglas. `firmas`:
 * la de los niveles de cada área HOY (el «por qué» la guarda).
 */
export function leerElResumen(respuesta: Pick<Anthropic.Messages.Message, "content">, ctx: ContextoDelResumen, o: Reglas): LoQueEscribioElAgente {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const descartados: string[] = [];
  const todoLoDicho = dichoPorLaEmpresa(ctx.reuniones);
  o = { ...o, dicho: todoLoDicho };
  // Lo que no lleva cita propia: sus números los dijo la empresa misma, no un cálculo de Smarteam que confirmó.
  const dichoPorElla = ctx.reuniones.map((r) => r.turnos.filter((t) => esDelCliente(r, t.hablante)).map((t) => t.texto).join("\n")).join("\n");
  const piezasPorArreglar: PiezaPorArreglar[] = [];
  const arreglarEn = (lugar: string, dimensionId?: string | null, indice?: number, largo?: number, traspaso?: string) => (x: { texto: string; citas: CitaDelResumen[]; problema: string; delAgente?: CitaDelResumen[] }) =>
    piezasPorArreglar.push({ lugar, ...x, dimensionId, ...(indice === undefined ? {} : { indice }), ...(largo === undefined ? {} : { largo }), ...(traspaso ? { traspaso } : {}) });
  const deLasAreas = new Set(ctx.areas.map((a) => a.id));
  const nombreDelArea = (id: string) => ctx.areas.find((a) => a.id === id)?.nombre ?? id;

  // 1 · El negocio.
  const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = {};
  let n = 0;
  for (const tipo of TIPOS_DEL_NEGOCIO) {
    const piezas: PiezaDelResumen[] = [];
    const max = maxDelNegocio(tipo);
    for (const v of tipo === "tesis" ? unaTesis(arreglo(objeto(crudo.negocio).tesis)) : arreglo(objeto(crudo.negocio)[tipo])) {
      if (piezas.length >= max) break;
      // Quién es quién (24 nov): la única parte con nombres, los de la gente de la empresa.
      if (tipo === "quienes") {
        const l = lineaDelMapa(v, ctx, o, descartados, arreglarEn("negocio:quienes"));
        if (l && !piezas.some((y) => paraComparar(y.texto) === paraComparar(l.texto))) piezas.push({ id: `n${++n}`, ...l, origen: origenDeLaCita(l.citas[0]) });
        continue;
      }
      const p = conSuCita(v, ctx, o, descartados, `«${TITULO_DEL_NEGOCIO[tipo]}»`, TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`negocio:${tipo}`));
      // La tesis es el titular (16 nov: salían frases de 14 palabras): una frase de más de 9 se pide corregida.
      if (p && tipo === "tesis" && tesisLarga(p.texto)) {
        descartados.push(`«${TITULO_DEL_NEGOCIO[tipo]}»: es demasiado largo para el titular`);
        arreglarEn(`negocio:${tipo}`)({ texto: p.texto, citas: p.citas, problema: "es demasiado largo para el titular" });
        continue;
      }
      if (p) piezas.push({ id: `n${++n}`, ...p, origen: origenDeLaCita(p.citas[0]) });
    }
    if (piezas.length) negocio[tipo] = piezas;
  }

  // 2 · El recorrido. Una etapa con su cita verificada que se cayó por algo de FORMA (dice «tarifa» o un número que la
  // cita no dice, o es larga) se pide corregida (`pedidoDeLasEtapas`): en Centauro, cada corrida perdía otro equipo.
  const recorrido: (EtapaDelResumen & { orden: number })[] = [];
  const etapasPorArreglar: EtapaPorArreglar[] = [];
  arreglo(crudo.recorrido).forEach((v, orden) => {
    if (recorrido.length + etapasPorArreglar.length >= MAX_ETAPAS) return;
    const r = etapaVerificada(v, ctx, o);
    if (r.ok) recorrido.push({ ...r.etapa, id: `s${recorrido.length + 1}`, orden });
    else {
      descartados.push(r.motivo);
      if (r.deForma) etapasPorArreglar.push({ ...r.deForma, orden, problema: r.motivo });
    }
  });

  // 3 · Las áreas operativas.
  const operativas: AreaOperativa[] = [];
  const porArreglar: DatoPorArreglar[] = [];
  for (const v of arreglo(crudo.areas)) {
    if (operativas.length >= MAX_AREAS_OPERATIVAS) break;
    const x = objeto(v);
    const areaId = cadena(x.area);
    if (!deLasAreas.has(areaId)) {
      descartados.push(`área «${cadena(x.nombre)}» de un equipo que no sale (${areaId || "sin equipo"})`);
      continue;
    }
    const nombre = textoValido(x.nombre, TOPE_DE_UN_NOMBRE, o);
    if (!nombre.ok) {
      descartados.push(`el nombre de un área de ${nombreDelArea(areaId)}: ${nombre.motivo}`);
      continue;
    }
    if (operativas.some((a) => paraComparar(a.nombre) === paraComparar(nombre.texto))) continue;
    const id = `o${operativas.length + 1}`;
    const donde = (que: string) => `${que} de ${nombre.texto}`;
    const lista = (crudoDeLista: unknown, prefijo: string, que: string, max: number, campo: string): PiezaDelResumen[] => {
      const out: PiezaDelResumen[] = [];
      const todas = arreglo(crudoDeLista);
      for (const [i, y] of todas.entries()) {
        if (out.length >= max) break;
        const p = conSuCita(y, ctx, o, descartados, donde(que), TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`${id}:${campo}`, undefined, i, todas.length));
        if (p) out.push({ id: `${prefijo}${out.length + 1}`, ...p, origen: origenDeLaCita(p.citas[0]) });
      }
      return out;
    };
    const retos: RetoDelResumen[] = [];
    for (const y of arreglo(x.retos)) {
      if (retos.length >= MAX_RETOS) break;
      // Lo que este equipo dijo de otro (24 nov): un reto del traspaso; la página lo muestra también en el otro.
      const traspaso = deLasAreas.has(cadena(objeto(y).traspaso)) && cadena(objeto(y).traspaso) !== areaId ? cadena(objeto(y).traspaso) : undefined;
      const p = conSuCita(y, ctx, o, descartados, donde("un reto"), TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`${id}:retos`, dimensionDelArea(ctx, areaId, objeto(y).dimension), undefined, undefined, traspaso));
      if (p) retos.push({ id: `t${retos.length + 1}`, ...p, dimensionId: dimensionDelArea(ctx, areaId, objeto(y).dimension), origen: origenDeLaCita(p.citas[0]), ...(traspaso ? { traspaso } : {}) });
    }
    const cifras: CifraDelResumen[] = [];
    let faltaDeLaCifra: string | null = null;
    for (const y of arreglo(x.cifras)) {
      if (cifras.length >= MAX_CIFRAS_POR_AREA) break;
      const c = objeto(y);
      // Una «calculado» (24 nov, Elías): la cuenta la hace el código con los números de la empresa, cada uno con su cita.
      if (cadena(c.estado) === "calculado") {
        const k = calculadaConSusCitas(c, ctx, o);
        if (!k.ok) {
          descartados.push(`${donde("una cifra calculada")}: ${k.motivo}`);
          continue;
        }
        if (!cifras.some((z) => paraComparar(z.cifra) === paraComparar(k.cifra.cifra))) cifras.push({ id: `c${cifras.length + 1}`, ...k.cifra, dimensionId: dimensionDelArea(ctx, areaId, c.dimension) });
        continue;
      }
      const crudas = { cifra: cadena(c.cifra), texto: cadena(c.texto), nota: nulo(c.nota) ? null : cadena(c.nota) };
      const citadoAntes = arreglo(c.citas).map((z) => cadena(objeto(z).texto)).join(" ");
      crudas.texto = sinLaConclusion(crudas.texto, citadoAntes) ?? crudas.texto;
      // La nota le habla a la empresa: si cita lo dicho («si no me equivoco») o dice quién lo dijo, se va (regla 9).
      if (crudas.nota && CITA_EN_LA_NOTA.test(crudas.nota)) {
        descartados.push(`la nota de «${crudas.cifra}» cita lo dicho: sale la del código`);
        crudas.nota = null;
      }
      // Una cifra que dijo Smarteam y la empresa no corrigió también entra, por confirmar (18 nov).
      let citas = citasVerificadas(arreglo(c.citas), ctx.reuniones, { cifra: true, sinCorregir: true });
      let citado = citas.map((z) => z.texto).join(" ");
      const nombre = `${donde("la cifra")} «${crudas.cifra}»`;
      if (!cifrasDeMas(crudas.cifra, "").length) {
        descartados.push(`${donde("una cifra")} sin número («${crudas.cifra}»)`);
        continue;
      }
      if (!citas.length) {
        descartados.push(`${nombre}: su cita no está en la reunión o no la dijo alguien de la empresa`);
        continue;
      }
      /* Antes de descartar, se busca la cita (24 nov, segunda vuelta: en la corrida real de Centauro se perdía el «~1.800» de
         Soporte, que la empresa dijo el 6 nov: «de esos 1800, 100 son de facturas»). El número de la cifra que su cita no
         trae, en otra intervención de la empresa sobre lo mismo, va como su primera cita: es de donde sale la cifra. Lo que
         siga mal (una nota o un rótulo con números de otro dicho) se pide corregido, con las citas que se encontraron: las
         revisiones de esa vuelta mostraron que recortar la nota o el rótulo en el código podía hacer pasar una parte por el
         total («Excluye los 300 de WhatsApp», «en 2 de las 5 tiendas»). */
      const anios = { anios: aniosDe(ctx.reuniones, todoLoDicho) };
      // Solo una cifra que el agente dio como dicha por la empresa: una «estimada» que toma la cita de otro dicho subía a
      // «declarado» (revisión del 24 nov, segunda vuelta).
      if (cadena(c.estado) === "declarado" && cifrasDeMas(`${crudas.cifra} ${crudas.texto}`, citado, anios).length) {
        const nuevas = citasDeSusNumeros(`${crudas.cifra} ${crudas.texto}`, citas, ctx.reuniones).slice(0, Math.max(0, MAX_CITAS_DE_UNA_PIEZA - citas.length));
        if (nuevas.length) {
          citas = [...nuevas, ...citas];
          citado = citas.map((z) => z.texto).join(" ");
        }
      }
      /* Lo de FORMA (un texto más largo que su tope, un número que la cita no dice: una resta, un porcentaje) se pide
         corregido en una llamada chica, con sus citas ya verificadas; lo de FONDO (una persona, voseo, una herramienta que
         la empresa no nombró) se descarta. Centauro, 10 nov: el 2,8 % y «14 de 25» se perdían por una cifra de 49
         caracteres. */
      const notaRevisada = crudas.nota !== null ? textoValido(crudas.nota, TOPE_DE_UNA_PREGUNTA, o, citado) : null;
      const deForma = (r: ReturnType<typeof textoValido>) => !r.ok && (r.motivo.startsWith("es demasiado largo") || r.motivo.startsWith("está en voseo"));
      if (notaRevisada && !notaRevisada.ok && !deForma(notaRevisada)) {
        descartados.push(`${nombre}: la nota ${notaRevisada.motivo}; sale la del código`);
        crudas.nota = null;
      } else if (crudas.nota !== null && NOTA_CON_QUIEN.test(paraComparar(crudas.nota))) {
        // «Según quien coordina precios…» (Tecnosagot, 16 nov): al cliente no se le dice quién lo dijo.
        descartados.push(`${nombre}: la nota dice quién lo dijo; sale la del código`);
        crudas.nota = null;
      }
      const revisadas = [
        ["la cifra", textoValido(crudas.cifra, TOPE_DE_LA_CIFRA, o, citado)],
        ["el texto", textoValido(crudas.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o, citado)],
        ...(crudas.nota !== null ? [["la nota", textoValido(crudas.nota, TOPE_DE_UNA_PREGUNTA, o, citado)] as const] : []),
      ] as const;
      const deFondo = revisadas.find(([, r]) => !r.ok && !deForma(r));
      const todo = `${crudas.cifra} ${crudas.texto} ${crudas.nota ?? ""}`;
      if (deFondo && !deFondo[1].ok) {
        descartados.push(`${nombre}: ${deFondo[1].motivo}`);
        continue;
      }
      const sobran = cifrasDeMas(todo, citado, { anios: aniosDe(ctx.reuniones, todoLoDicho) });
      const problemas = [
        ...problemasDeLaCifra({ ...crudas, citas }, todoLoDicho, ctx.reuniones),
        ...revisadas.filter(([, r]) => deForma(r)).map(([que, r]) => `${que} ${!r.ok ? r.motivo : ""}`),
      ];
      if (ES_UNA_DEFINICION.test(paraComparar(`${crudas.cifra} ${crudas.texto}`))) {
        descartados.push(`${nombre}: es una definición (cómo se cuenta algo), no una magnitud`);
        continue;
      }
      // Una meta sola («llegar a 500») no es una cifra de hoy (regla 2): la cifra tiene que traer el resultado frente a ella.
      const deLaCifra = paraComparar(`${crudas.texto} ${crudas.nota ?? ""}`);
      if (ES_UNA_META.test(deLaCifra) && !ES_DE_HOY.test(deLaCifra) && cifrasDeMas(crudas.cifra, "").length < 2) {
        descartados.push(`${nombre}: es una meta sola, no una cifra de hoy`);
        continue;
      }
      const dimensionId = dimensionDelArea(ctx, areaId, c.dimension);
      if (problemas.length) {
        descartados.push(`${nombre}: ${problemas.join("; ")}`);
        porArreglar.push({ operativa: id, ...crudas, estado: c.estado, dimensionId, citas, sobran, problemas });
        continue;
      }
      if (cifras.some((z) => paraComparar(z.cifra) === paraComparar(crudas.cifra) || mismoPrimerNumero(z.cifra, crudas.cifra))) continue;
      const e = estadoDeLaCifra({ estado: c.estado, cifra: crudas.cifra, nota: crudas.nota, citas });
      // Una cita con tres números o más juntos no sostiene ninguno (16 nov, Centauro: «1008 tickets al mes» salía en grande
      // de «para llegar a los 1008 sí son como 500»): no sale como cifra; queda lo que falta confirmar.
      // También si el agente ya la marcó «pendiente» (con su nota, `estadoDeLaCifra` no la toca).
      // Un rango («180–200») dice lo mismo que la empresa: queda «por confirmar», como antes. «24/7» no cuenta como dos números.
      const variosNumeros = citas.some(
        (z) => cifrasDeMas(crudas.cifra, z.texto).length < cifrasDeMas(crudas.cifra, "").length && numerosDistintos(z.texto.replace(NO_SON_CANTIDADES, " ")) >= 3,
      );
      if (!/\d\s?[–-]\s?\d/.test(crudas.cifra) && (e.nota === NOTA_DE_VARIOS_NUMEROS || variosNumeros)) {
        descartados.push(`${nombre}: la cifra «${crudas.cifra}» sale de una cita con varios números juntos: va a lo que falta confirmar`);
        faltaDeLaCifra ??= `Confirmar con tus registros: ${crudas.texto}.`;
        continue;
      }
      cifras.push({ id: `c${cifras.length + 1}`, cifra: crudas.cifra, texto: crudas.texto, ...e, dimensionId, citas, origen: origenDeLaCita(citas[0]) });
    }
    const falta = (nulo(x.falta) ? null : sinCitaPropia(x.falta, TOPE_DE_UNA_PREGUNTA, o, dichoPorElla, descartados, donde("lo que falta"))) ?? (cifras.length ? null : faltaDeLaCifra);
    const area: AreaOperativa = {
      id,
      nombre: nombre.texto,
      areaId,
      organizacion: lista(x.organizacion, "g", "la organización", MAX_PIEZAS_POR_LISTA, "organizacion"),
      bien: lista(x.bien, "b", "lo que ya hace bien", MAX_PIEZAS_POR_LISTA, "bien"),
      // El reto principal (20 nov): una pieza, el título de la fila. Un Resumen de antes trae aquí «lo que la frena».
      frena: lista(x.frena, "f", "el reto principal", 1, "frena"),
      retos,
      cifras,
      falta,
    };
    const conAlgo = area.organizacion.length + area.bien.length + area.frena.length + area.retos.length + area.cifras.length > 0;
    if (!conAlgo && !porArreglar.some((p) => p.operativa === id) && !piezasPorArreglar.some((p) => p.lugar.startsWith(`${id}:`))) {
      descartados.push(`el área «${nombre.texto}» quedó sin nada que pasara la verificación`);
      continue;
    }
    operativas.push(area);
  }

  // 4 · El «por qué» de cada equipo de la escala.
  const areas: Record<string, AreaDelResumenGuardada> = Object.fromEntries(ctx.areas.map((a) => [a.id, { hallazgos: [], porque: null }]));
  for (const v of arreglo(crudo.porque)) {
    const x = objeto(v);
    const area = ctx.areas.find((a) => a.id === cadena(x.area));
    if (!area || !area.nivel || areas[area.id].porque || nulo(x.texto)) continue;
    const t = sinCitaPropia(x.texto, TOPE_DEL_PORQUE, o, dichoPorElla, descartados, `por qué de ${area.nombre}`);
    if (t) areas[area.id] = { hallazgos: [], porque: { texto: t, firma: o.firmas[area.id] ?? "" } };
  }

  // 5 · Lo que falta validar y lo que hay que confirmar.
  const pendientes: PendienteDelResumen[] = [];
  for (const v of arreglo(crudo.pendientes)) {
    if (pendientes.length >= MAX_PENDIENTES) break;
    const x = objeto(v);
    const tipo = cadena(x.tipo) as TipoDePendienteGuardado;
    if (!TIPOS_DE_PENDIENTE.includes(tipo)) {
      descartados.push(`pendiente sin un tipo que se reconozca («${cadena(x.tipo)}»)`);
      continue;
    }
    const t = sinCitaPropia(x.texto, TOPE_DE_UNA_PREGUNTA, o, dichoPorElla, descartados, `pendiente (${tipo})`);
    if (!t) continue;
    if (COCINA.test(paraComparar(t))) {
      descartados.push(`pendiente que cuenta cómo se armó una cifra («${t.slice(0, 60)}…»)`);
      continue;
    }
    const citas = citasVerificadas(arreglo(x.citas), ctx.reuniones);
    // Una contradicción se sostiene con las dos cosas dichas.
    if (tipo === "contradiccion" && citas.length < 2) {
      descartados.push(`contradicción sin sus dos citas («${t.slice(0, 60)}…»)`);
      continue;
    }
    const areaId = deLasAreas.has(cadena(x.area)) ? cadena(x.area) : null;
    pendientes.push({ id: `p${pendientes.length + 1}`, tipo, texto: t, areaId, citas });
  }
  // Qué falta confirmar de cada parte por explorar (en vez de decir «provisional»).
  const porExplorar = new Set(ctx.areas.flatMap((a) => a.dimensiones.filter((d) => d.porExplorar).map((d) => d.id)));
  const confirmar: Record<string, string> = {};
  for (const v of arreglo(crudo.confirmar)) {
    const x = objeto(v);
    const dim = cadena(x.dimension);
    if (!porExplorar.has(dim) || confirmar[dim]) continue;
    const t = sinCitaPropia(x.texto, TOPE_DE_UNA_PREGUNTA, o, dichoPorElla, descartados, `qué falta confirmar de ${dim}`);
    if (t) confirmar[dim] = t;
  }
  // El tamaño que sale de la misma cita que la cifra de un área es esa cifra, no el tamaño del negocio (Cicadex, 16 nov).
  // Con el mismo número: «500 clientes activos y se nos van 14 al mes» trae el tamaño Y la cifra, y los dos quedan.
  const turnosDeCifras = new Set(operativas.flatMap((a) => a.cifras.flatMap((c) => c.citas.map((x) => `${x.reunion}:${x.turno}:${cantidadesNormales(c.cifra)[0] ?? ""}`))));
  if (negocio.tamano?.some((p) => p.citas.some((x) => turnosDeCifras.has(`${x.reunion}:${x.turno}:${cantidadesNormales(p.texto)[0] ?? ""}`)))) {
    descartados.push("«El tamaño del negocio»: es la cifra de un área, no el tamaño del negocio");
    delete negocio.tamano;
  }
  const avisos = avisosDelRecorrido(recorrido, operativas, ctx);
  // El título del recorrido no lleva cita propia: sus números y herramientas los tuvo que decir la empresa.
  const tituloCrudo = nulo(crudo.tituloDelRecorrido) || !(recorrido.length + etapasPorArreglar.length) ? null : sinCitaPropia(crudo.tituloDelRecorrido, TOPE_DEL_TITULO_DEL_RECORRIDO, o, todoLoDicho, descartados, "el título del recorrido");
  // Como pasa HOY: «…a la entrega con trazabilidad» (Tecnosagot, 16 nov) contaba lo que falta. Sin título, la página pone el suyo.
  const aspiracional = tituloCrudo ? paraComparar(tituloCrudo).match(TITULO_ASPIRACIONAL) : null;
  if (aspiracional) descartados.push(`el título del recorrido cuenta cómo debería ser («${aspiracional[0]}»)`);
  const tituloDelRecorrido = aspiracional ? null : tituloCrudo;
  // 7 · Los puntos clave (18 nov, Marco: «5 puntos clave que están críticos»): de toda la empresa, en orden de peso, con su cita.
  const puntos: PuntoClave[] = [];
  for (const v of arreglo(crudo.puntos)) {
    if (puntos.length >= MAX_CANDIDATOS_A_PUNTO) break;
    const x = objeto(v);
    const titulo = textoValido(x.titulo, TOPE_DEL_TITULO_DEL_PUNTO, o);
    const areaDelPunto = deLasAreas.has(cadena(x.area)) ? cadena(x.area) : null;
    const indice = arreglo(crudo.puntos).indexOf(v);
    if (!titulo.ok) {
      descartados.push(`el título de un punto clave: ${titulo.motivo}`);
      // Un título largo con su punto citado se pide acortado (24 nov, Centauro: se perdía uno por 82 caracteres de 80).
      const citasDelPunto = titulo.motivo.startsWith("es demasiado largo") ? citasVerificadas(arreglo(x.citas), ctx.reuniones) : [];
      if (citasDelPunto.length && !nulo(x.texto))
        piezasPorArreglar.push({ lugar: "puntos", texto: cadena(x.texto), citas: citasDelPunto, problema: `el título ${titulo.motivo}: acórtalo`, indice, titulo: cadena(x.titulo), areaId: areaDelPunto });
      continue;
    }
    // Lo que dice el título también tiene que estar en lo citado (sus números, sus herramientas). Lo de forma se pide
    // corregido, como las piezas de las listas (en Cemaco, uno se caía por un número del texto que la cita no decía).
    const p = conSuCita(v, ctx, o, descartados, `el punto clave «${titulo.texto}»`, TOPE_DEL_TEXTO_DEL_RESUMEN, [titulo.texto], (y) =>
      piezasPorArreglar.push({ lugar: "puntos", ...y, indice, titulo: titulo.texto, areaId: areaDelPunto }),
    );
    if (!p) continue;
    if (puntos.some((y) => paraComparar(y.titulo) === paraComparar(titulo.texto))) continue;
    // El id lleva su lugar en la lista del agente (el orden es el peso): un punto corregido vuelve a su lugar.
    puntos.push({ id: `k${indice + 1}`, titulo: titulo.texto, ...p, areaId: areaDelPunto, origen: origenDeLaCita(p.citas[0]) });
  }
  return { negocio, recorrido, tituloDelRecorrido, operativas, areas, pendientes, entendimos: [], confirmar, avisos, descartados, porArreglar, etapasPorArreglar, piezasPorArreglar, puntos };
}

/** Lo que se puede corregir sin volver a leer las reuniones: largo, lo prohibido que la cita no dice, números, herramientas. */
// «nombra a una persona» también es de forma (21 nov, Tecnosagot: la tesis decía «Diego» y el titular se perdía): se pide
// corregida con su rol, y la corregida se vuelve a verificar con la misma vara.
// «comercial» también (24 nov): se pide corregido con el nombre del equipo de la escala.
const ES_DE_FORMA = /demasiado largo|habla de «|numeros|números|herramientas|lectura nuestra|conclusi|voseo|nombra a una persona|comercial/;

/**
 * Una etapa del recorrido, con su cita: el nombre, la fricción y el texto pasan las reglas y lo que dicen está en lo citado.
 * Si se cae por algo de forma y tiene alguna cita verificada, devuelve lo necesario para pedirla corregida.
 */
function etapaVerificada(
  v: unknown,
  ctx: ContextoDelResumen,
  o: Reglas,
): { ok: true; etapa: Omit<EtapaDelResumen, "id"> } | { ok: false; motivo: string; deForma: Omit<EtapaPorArreglar, "orden" | "problema"> | null } {
  const x = objeto(v);
  const crudas = { etapa: cadena(x.etapa ?? x.nombre), quien: nulo(x.quien) ? null : cadena(x.quien), texto: cadena(x.texto), friccion: nulo(x.friccion) ? null : cadena(x.friccion), citas: arreglo(x.citas), icono: x.icono, continuo: x.continuo, traspaso: x.traspaso };
  const verificadas = citasVerificadas(crudas.citas, ctx.reuniones);
  const citado = verificadas.map((c) => c.texto).join(" ");
  const caida = (motivo: string) => ({ ok: false as const, motivo, deForma: verificadas.length && ES_DE_FORMA.test(motivo) && crudas.etapa ? crudas : null });
  const nombre = textoValido(crudas.etapa, TOPE_DE_UN_NOMBRE, o, citado);
  if (!nombre.ok) return caida(`etapa del recorrido «${crudas.etapa}»: ${nombre.motivo}`);
  const friccion = crudas.friccion === null ? null : textoValido(crudas.friccion, TOPE_DEL_TEXTO_DEL_RESUMEN, o, citado);
  if (friccion && !friccion.ok) return caida(`la fricción de «${nombre.texto}»: ${friccion.motivo}`);
  const quien = crudas.quien === null ? null : textoValido(crudas.quien, TOPE_DE_UN_NOMBRE, o);
  const motivos: string[] = [];
  const p = conSuCita(x, ctx, o, motivos, `etapa «${nombre.texto}»`, TOPE_DEL_TEXTO_DEL_RESUMEN, [nombre.texto, friccion?.ok ? friccion.texto : ""]);
  if (!p) return caida(motivos[0] ?? `etapa «${nombre.texto}» sin cita`);
  // El ícono, de la lista (uno que no está se deduce del nombre en la página); `continuo`, solo si lo dijo.
  const icono = (ICONOS_DEL_PASO as readonly string[]).includes(cadena(x.icono)) ? (cadena(x.icono) as IconoDelPaso) : null;
  // El traspaso al paso siguiente (24 nov): si no pasa, se cae solo él, no la etapa.
  const traspaso = x.continuo === true || !quien?.ok ? null : traspasoVerificado(x.traspaso, quien.texto, ctx, o);
  return {
    ok: true,
    etapa: {
      nombre: nombre.texto,
      quien: quien?.ok ? quien.texto : null,
      ...p,
      friccion: friccion?.ok ? friccion.texto : null,
      origen: origenDeLaCita(p.citas[0]),
      ...(icono ? { icono } : {}),
      ...(x.continuo === true ? { continuo: true } : {}),
      ...(traspaso ? { traspaso } : {}),
    },
  };
}

/**
 * El traspaso de un paso al siguiente (24 nov): de quién (el equipo de este paso) a quién, qué pasa y, si la empresa lo
 * dijo, cuánto pasa. Con su cita, como cualquier pieza: lo que dice tiene que estar en lo citado. null si no viene o no
 * pasa (la etapa queda igual).
 */
export function traspasoVerificado(v: unknown, de: string, ctx: ContextoDelResumen, o: Reglas): TraspasoDelResumen | null {
  const x = objeto(v);
  if (nulo(x.texto) || nulo(x.a)) return null;
  const a = textoValido(x.a, TOPE_DE_UN_NOMBRE, o);
  if (!a.ok || paraComparar(a.texto) === paraComparar(de)) return null;
  const cifraCruda = nulo(x.cifra) ? null : cadena(x.cifra);
  const cifra = cifraCruda && cifrasDeMas(cifraCruda, "").length && cifraCruda.length <= TOPE_DE_LA_CIFRA ? cifraCruda : null;
  const rotulo = cifra && !nulo(x.rotulo) ? textoValido(x.rotulo, TOPE_DE_UN_NOMBRE, o) : null;
  const p = conSuCita({ texto: x.texto, citas: x.citas }, ctx, o, [], "traspaso", TOPE_DEL_TEXTO_DEL_RESUMEN, [cifra ?? "", rotulo?.ok ? rotulo.texto : ""]);
  if (!p) return null;
  // La cifra tiene que estar en la cita misma (no en los turnos vecinos): es lo que va en grande en la flecha.
  const conCifra = !!cifra && !cifrasDeMas(cifra, p.citas.map((c) => c.texto).join(" ")).length;
  return { de, a: a.texto, texto: p.texto, cifra: conCifra ? cifra : null, rotulo: conCifra && rotulo?.ok ? rotulo.texto : null, citas: p.citas.slice(0, 3) };
}

const REGLAS_DE_LAS_ETAPAS = `Corriges etapas del recorrido de un cliente para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problema»: dice algo que sus citas no dicen (un precio, una tarifa, un número, una herramienta), es demasiado larga, nombra a una persona (cámbiala por su rol: «la gerencia», «quien lleva cobranza»; nunca un nombre) o dice «comercial» (nombra el equipo como en la escala: «Ventas»).

Reescribe «etapa» (hasta 5 palabras), «texto» (qué pasa ahí hoy, hasta 6 palabras, sin «tu» ni «tus») y «friccion» (lo que se traba, o null) usando SOLO lo que dicen sus «citas». Quita lo que las citas no digan; no lo reemplaces por otra palabra que lo insinúe. Si con las citas no se puede decir qué pasa en la etapa, omítela.

Devuelves SOLO este JSON: {"etapas":[{"i":<el número de la etapa>,"etapa":"…","texto":"…","friccion":"… o null"}]}`;

/** El pedido del arreglo de las etapas: solo las caídas, con sus citas. Sin las transcripciones. */
export function pedidoDeLasEtapas(xs: readonly EtapaPorArreglar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const datos = xs.map((x, i) => ({ i, etapa: x.etapa, quien: x.quien, texto: x.texto, friccion: x.friccion, problema: x.problema, citas: x.citas.map((c) => cadena(objeto(c).texto)) }));
  return { model: MODELO_DEL_RESUMEN, max_tokens: 1500, system: REGLAS_DE_LAS_ETAPAS, messages: [{ role: "user", content: JSON.stringify(datos, null, 1) }] };
}

/** Lee el arreglo de las etapas y vuelve a verificar cada una con sus mismas citas (la vara de siempre). */
export function leerLasEtapas(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  xs: readonly EtapaPorArreglar[],
  ctx: ContextoDelResumen,
  o: Reglas,
): { etapas: (Omit<EtapaDelResumen, "id"> & { orden: number })[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const etapas: (Omit<EtapaDelResumen, "id"> & { orden: number })[] = [];
  const descartados: string[] = [];
  const usados = new Set<number>();
  for (const v of arreglo(crudo.etapas)) {
    const x = objeto(v);
    const i = typeof x.i === "number" ? x.i : Number(x.i);
    const de = xs[i];
    if (!de || usados.has(i)) continue;
    usados.add(i);
    const r = etapaVerificada({ etapa: x.etapa, quien: de.quien, texto: x.texto, friccion: x.friccion, citas: de.citas, icono: de.icono, continuo: de.continuo, traspaso: de.traspaso }, ctx, o);
    if (r.ok) etapas.push({ ...r.etapa, orden: de.orden });
    else descartados.push(`etapa corregida: ${r.motivo}`);
  }
  return { etapas, descartados };
}

/** Las etapas en el orden en que las puso el agente, con las corregidas en su lugar y los ids de nuevo en orden. */
export function conLasEtapas(recorrido: readonly (EtapaDelResumen & { orden?: number })[], corregidas: readonly (Omit<EtapaDelResumen, "id"> & { orden: number })[]): EtapaDelResumen[] {
  return [...recorrido, ...corregidas]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .slice(0, MAX_ETAPAS)
    .map((e, k) => {
      const { orden, ...resto } = e as EtapaDelResumen & { orden?: number };
      void orden;
      return { ...resto, id: `s${k + 1}` };
    });
}

/**
 * Cada equipo que tuvo una reunión tiene que aparecer en alguna etapa del recorrido (11 nov: en Centauro salieron dos
 * etapas, las dos de Ventas). Se reconoce por el nombre del equipo o de uno de sus subequipos en «quien». Lo que falta va
 * como aviso en la pantalla interna: rehacer cuesta otra corrida entera.
 */
export function avisosDelRecorrido(
  recorrido: readonly (Pick<EtapaDelResumen, "quien" | "nombre"> & { continuo?: boolean })[],
  operativas: readonly Pick<AreaOperativa, "nombre" | "areaId">[],
  ctx: { areas: readonly { id: string; nombre: string }[]; reuniones: readonly Pick<ReunionParaElResumen, "areaId">[] },
): string[] {
  const enLinea = recorrido.filter((e) => !e.continuo).length;
  return [
    ...(enLinea > 0 && enLinea < MIN_PASOS_EN_LINEA
      ? [`El recorrido quedó con ${enLinea} ${enLinea === 1 ? "paso" : "pasos"}: no sale al cliente hasta tener ${MIN_PASOS_EN_LINEA}. Agrégalos o rehaz el Resumen.`]
      : []),
    ...equiposSinEtapa(recorrido, operativas, ctx).map(
      (id) => `El recorrido no tiene ninguna etapa de ${ctx.areas.find((a) => a.id === id)!.nombre}, y hubo una reunión con ese equipo: revísalo o rehaz el Resumen.`,
    ),
  ];
}

/** Menos pasos en línea que esto no cuentan el recorrido de un cliente: afuera no sale (adentro, con su aviso). */
export const MIN_PASOS_EN_LINEA = 3;

/**
 * Los avisos guardados, con el del recorrido corto calculado al abrir: uno guardado antes del 16 nov, o al que alguien le
 * borró un paso, deja de salir afuera y adentro tiene que decirlo (no esconder sin avisar).
 */
function conElAvisoDelRecorrido(guardados: readonly string[], recorrido: readonly { continuo?: boolean }[] | null): string[] {
  const otros = guardados.filter((a) => !a.startsWith("El recorrido quedó con "));
  const enLinea = (recorrido ?? []).filter((e) => !e.continuo).length;
  return enLinea > 0 && enLinea < MIN_PASOS_EN_LINEA
    ? [`El recorrido quedó con ${enLinea} ${enLinea === 1 ? "paso" : "pasos"}: no sale al cliente hasta tener ${MIN_PASOS_EN_LINEA}. Agrégalos o rehaz el Resumen.`, ...otros]
    : otros;
}

// ── El arreglo de las piezas de las listas (12 nov) ─────────────────────────────

const REGLAS_DE_LAS_PIEZAS = `Corriges frases para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problema»: dice algo que sus citas no dicen (un número, una herramienta, una conclusión, una calificación nuestra), o es demasiado larga.

Reescribe «texto» con la forma que te doy en «forma», usando SOLO lo que dicen sus «citas». Si nombra a una persona, cámbiala por su rol («la gerencia», «quien lleva cobranza»); nunca un nombre, salvo que «forma» diga que van nombres. Si dice «comercial», nombra el equipo como en la escala («Ventas»). Sin «tu» ni «tus» salvo que «forma» lo pida; nunca voseo. Quita lo que las citas no digan; no lo reemplaces por otra palabra que lo insinúe («la mitad», «el doble», «un tercio» también son números: van solo si una cita los dice). Lo que queda no puede cambiar de sentido: si quitas un número de una excepción o de un límite («salvo los 300 de WhatsApp», «en 2 de las 5 tiendas»), conserva la excepción o el límite sin el número, y no dejes un «eso» o un «los» que remita a lo que quitaste. Si con las citas no se puede decir nada, omítela.

Si una cita se ve cortada («anda entre 15 lits» por «1.500 leads»), no copies su número: quita el número.

Si la pieza trae «titulo» (un punto clave), el problema puede estar en él: reescríbelo también, de 3 a 8 palabras, sin «tu», con la misma vara (cada número, en sus citas), y devuélvelo en «titulo»; si el título está bien, devuélvelo igual.

Devuelves SOLO este JSON: {"piezas":[{"i":<el número de la pieza>,"texto":"…","titulo":"… (solo si la pieza trae «titulo»)"}]}`;

/** La forma que se le pide a una pieza corregida, según dónde va (la misma del prompt del Resumen). */
export function formaDelLugar(x: Pick<PiezaPorArreglar, "lugar" | "indice" | "largo">): string {
  const [donde, campo] = x.lugar.split(":");
  if (donde === "puntos") return "«texto»: una o dos frases, de 12 a 35 palabras, que le hablan a la empresa; solo lo que dicen las citas, sin consecuencias que no dijo. «titulo»: de 3 a 8 palabras, qué está crítico, solo con lo que dicen las citas";
  if (donde === "negocio") {
    if (campo === "etiquetas") return "de 1 a 5 palabras, sin verbo conjugado, sin «tu» ni «tus» y sin punto";
    if (campo === "tesis") return `dos frases de 3 a ${MAX_PALABRAS_DE_LA_TESIS - 1} palabras cada una (cuéntalas: ninguna pasa de ${MAX_PALABRAS_DE_LA_TESIS - 1}), terminadas en punto, con sujeto y verbo claros y sin metáforas; si no cabe, quita palabras, nunca un hecho`;
    if (campo === "tamano") return "el número primero y su unidad, de 2 a 5 palabras («120 clínicas»)";
    if (campo === "portada") return "un párrafo de 15 a 35 palabras y hasta 220 caracteres, en tercera persona con el nombre de la empresa: en qué invierte y dónde se rompe, con sus números";
    if (campo === "quienes")
      return "una línea «<equipo o quién lidera>: <gente>» de «Quién es quién», hasta 140 caracteres. AQUÍ SÍ van los nombres de la gente de la empresa que dicen las citas. Con la gente, solo nombres, roles y cuántos («y 3 personas más»): ni lo que hacen, ni cómo están, ni un dolor. Si algo dice que una persona ya no está o ya no tiene ese rol (se fue, era, ex, ya no), sácala; si no queda nadie, omite la pieza";
    return "una frase corta, hasta 15 palabras, sin «tu» ni «tus»";
  }
  if (campo === "organizacion" && (x.indice ?? 0) === 0 && (x.largo ?? 2) >= 2) return "quiénes son: su rol y cuántos, de 2 a 6 palabras; sin número si las citas no lo dicen";
  if (campo === "retos") return "de 5 a 10 palabras, empezando con un verbo en infinitivo, sin «tu» ni «tus»";
  if (campo === "frena") return "el reto principal como título, de 4 a 10 palabras, sin números, sin «tu» ni «tus»: lo que le duele a la empresa, no cómo opera";
  return "de 6 a 12 palabras, sin «tu» ni «tus» y sin verbos en segunda persona";
}

/** El pedido del arreglo de las piezas: solo las caídas, con sus citas. Sin las transcripciones. */
export function pedidoDeLasPiezas(xs: readonly PiezaPorArreglar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const datos = xs.map((x, i) => ({ i, ...(x.titulo ? { titulo: x.titulo } : {}), texto: x.texto, forma: formaDelLugar(x), problema: x.problema, citas: x.citas.map((c) => c.texto) }));
  return { model: MODELO_DEL_RESUMEN, max_tokens: 2000, system: REGLAS_DE_LAS_PIEZAS, messages: [{ role: "user", content: JSON.stringify(datos, null, 1) }] };
}

/** Lee el arreglo de las piezas y vuelve a verificar cada una con sus mismas citas (la vara de siempre). */
export function leerLasPiezas(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  xs: readonly PiezaPorArreglar[],
  ctx: ContextoDelResumen,
  o: Reglas,
): { piezas: (PiezaPorArreglar & { ok: true })[]; descartados: string[]; aCortar: PiezaPorArreglar[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const piezas: (PiezaPorArreglar & { ok: true })[] = [];
  const descartados: string[] = [];
  /** La tesis corregida que sigue larga: se pide acortada una vez más (21 nov, Polaris), con lo que trajo. */
  const aCortar: PiezaPorArreglar[] = [];
  const usados = new Set<number>();
  for (const v of arreglo(crudo.piezas)) {
    const x = objeto(v);
    const i = typeof x.i === "number" ? x.i : Number(x.i);
    const de = xs[i];
    if (!de || usados.has(i)) continue;
    usados.add(i);
    // Las citas ya están verificadas: se vuelven a pasar como el agente las dio (reunión, turno y texto).
    const citas = de.citas.map((c) => ({ reunion: ctx.reuniones.find((r) => r.id === c.reunion)?.clave ?? c.reunion, turno: c.turno, texto: c.texto }));
    // Un punto clave corregido puede traer su título corregido (24 nov, Centauro: «Churn mensual consume la mitad de lo que
    // Ventas cierra» se caía por «mitad», que estaba en el título y el arreglo solo tocaba el texto).
    const tituloNuevo = de.titulo && !nulo(x.titulo) ? textoValido(x.titulo, TOPE_DEL_TITULO_DEL_PUNTO, o) : null;
    // El de antes vale solo si pasa (uno largo se mandó a acortar: sin uno nuevo que pase, el punto no vuelve).
    const titulo = tituloNuevo?.ok ? tituloNuevo.texto : de.titulo && textoValido(de.titulo, TOPE_DEL_TITULO_DEL_PUNTO, o).ok ? de.titulo : undefined;
    if (de.titulo && !titulo) {
      descartados.push(`pieza corregida (${de.lugar}): el título ${tituloNuevo && !tituloNuevo.ok ? tituloNuevo.motivo : "no volvió corregido"}`);
      continue;
    }
    // Una línea de «Quién es quién» corregida pasa la vara del mapa (sus nombres, su forma), sin otra vuelta.
    const p =
      de.lugar === "negocio:quienes"
        ? lineaDelMapa({ texto: x.texto, citas }, ctx, o, descartados)
        : conSuCita({ texto: x.texto, citas }, ctx, o, descartados, `pieza corregida (${de.lugar})`, TOPE_DEL_TEXTO_DEL_RESUMEN, titulo ? [titulo] : [], undefined, de.delAgente ?? de.citas);
    /* Un número que la IA tomó de una transcripción cortada (revisión final del 24 nov: «~1.500 leads» volvía como «~15»
       porque la cita dice «entre 15 lits»): un número nuevo que es el comienzo de uno de la pieza y diez veces más chico,
       o más grande, no pasa. */
    const cortado = p && numeroCortado(`${de.titulo ?? ""} ${de.texto}`, `${titulo ?? ""} ${p.texto}`);
    if (cortado) {
      descartados.push(`pieza corregida (${de.lugar}): ${cortado}`);
      continue;
    }
    // La tesis corregida se vuelve a medir: si sigue larga, no llega al titular (revisión del 16 nov).
    if (p && de.lugar === "negocio:tesis" && tesisLarga(p.texto)) {
      descartados.push(`pieza corregida (${de.lugar}): sigue demasiado larga para el titular`);
      aCortar.push({ ...de, texto: p.texto, citas: p.citas, problema: `sigue demasiado larga: una frase pasa de ${MAX_PALABRAS_DE_LA_TESIS - 1} palabras; acórtala` });
      continue;
    }
    if (p) piezas.push({ ...de, texto: p.texto, citas: p.citas, ...(titulo ? { titulo } : {}), ok: true });
  }
  return { piezas, descartados, aCortar };
}

/** Pone cada pieza corregida en su lugar (el negocio o la lista de su área), sin pasar los topes ni repetir. */
export function conLasPiezas<T extends Pick<LoQueEscribioElAgente, "negocio" | "operativas"> & { puntos?: PuntoClave[] }>(e: T, piezas: readonly PiezaPorArreglar[]): T {
  const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = Object.fromEntries(Object.entries(e.negocio).map(([k, v]) => [k, [...(v ?? [])]]));
  const puntos = [...(e.puntos ?? [])];
  const operativas = e.operativas.map((a) => ({ ...a, organizacion: [...a.organizacion], bien: [...a.bien], frena: [...a.frena], retos: [...a.retos] }));
  const nuevoId = (prefijo: string, xs: readonly { id: string }[]) => {
    let k = xs.length + 1;
    while (xs.some((y) => y.id === `${prefijo}${k}`)) k++;
    return `${prefijo}${k}`;
  };
  const repetida = (xs: readonly { texto: string }[], t: string) => xs.some((y) => paraComparar(y.texto) === paraComparar(t));
  for (const p of piezas) {
    const [donde, campo] = p.lugar.split(":");
    const base = { texto: p.texto, citas: p.citas, origen: origenDeLaCita(p.citas[0]) };
    if (donde === "puntos") {
      // Vuelve a su lugar en el orden del agente (el peso, por su id `k<lugar>`), sin repetir el título; quedan los 5 primeros.
      const id = `k${(p.indice ?? 98) + 1}`;
      if (p.titulo && !puntos.some((y) => y.id === id || paraComparar(y.titulo) === paraComparar(p.titulo!))) puntos.push({ id, titulo: p.titulo, ...base, areaId: p.areaId ?? null });
      continue;
    }
    if (donde === "negocio") {
      const tipo = campo as TipoDelNegocio;
      const xs = (negocio[tipo] ??= []);
      if (xs.length < maxDelNegocio(tipo) && !repetida(xs, p.texto)) xs.push({ id: nuevoId("nx", xs), ...base });
      continue;
    }
    const a = operativas.find((y) => y.id === donde);
    if (!a) continue;
    if (campo === "retos") {
      if (a.retos.length < MAX_RETOS && !repetida(a.retos, p.texto)) a.retos.push({ id: nuevoId("tx", a.retos), ...base, dimensionId: p.dimensionId ?? null, ...(p.traspaso ? { traspaso: p.traspaso } : {}) });
    } else if (campo === "organizacion" || campo === "bien" || campo === "frena") {
      const xs = a[campo];
      const max = campo === "frena" ? 2 : MAX_PIEZAS_POR_LISTA;
      if (xs.length < max && !repetida(xs, p.texto)) xs.splice(Math.min(p.indice ?? xs.length, xs.length), 0, { id: nuevoId(`${campo[0]}x`, xs), ...base });
    }
  }
  const lugar = (id: string) => Number(id.replace(/\D/g, "")) || 99;
  return { ...e, negocio, operativas, ...(e.puntos ? { puntos: puntos.sort((a, b) => lugar(a.id) - lugar(b.id)).slice(0, MAX_CANDIDATOS_A_PUNTO) } : {}) };
}

// ── Lo que ya está resuelto (24 nov) ────────────────────────────────────────────

/**
 * Cuántas intervenciones después de su cita se miran para saber si algo se resolvió (24 nov, Centauro: «La extranet no
 * tiene API» salió como punto clave, y en esa misma reunión se acordó exportar un Excel diario que HubSpot toma solo).
 * Medido con Centauro: el punto cita la intervención 25 y el acuerdo está entre la 84 y la 140; con 40 no se veía.
 */
export const TURNOS_DESPUES_DE_LA_CITA = 120;
/** Lo que se le manda de cada intervención: lo justo para leer si se acordó algo. */
const LARGO_DE_UN_TURNO_PARA_LO_RESUELTO = 280;

/** Una pieza que podría estar resuelta: lo que se ve al cliente y dónde se dijo. */
export interface PiezaParaLoResuelto {
  /** Dónde va: `punto:<id>`, `<operativa>:frena:<id>`, `etapa:<id>` (su fricción), `pendiente:<id>`. */
  lugar: string;
  donde: string;
  texto: string;
  /** La reunión (su id) y la intervención de su primera cita. */
  reunion: string;
  turno: number;
}

/**
 * Las piezas que el cliente vería como un problema y que pudieron quedar resueltas en la misma reunión: los puntos clave,
 * el reto principal de cada equipo, lo que se traba en cada paso y los pendientes. Los retos de cada equipo no (son lo que
 * hay que mejorar, y con ellos el pedido se triplicaba: medido con Centauro).
 */
export function piezasParaLoResuelto(e: Pick<LoQueEscribioElAgente, "puntos" | "operativas" | "recorrido" | "pendientes">, reuniones: readonly ReunionParaElResumen[]): PiezaParaLoResuelto[] {
  const out: PiezaParaLoResuelto[] = [];
  const de = (lugar: string, donde: string, texto: string, citas: readonly CitaDelResumen[]) => {
    const c = citas.find((x) => reuniones.some((r) => r.id === x.reunion && !r.delEquipo));
    if (c && texto.trim()) out.push({ lugar, donde, texto, reunion: c.reunion, turno: c.turno });
  };
  for (const p of e.puntos) de(`punto:${p.id}`, `el punto clave «${p.titulo}»`, `${p.titulo}. ${p.texto}`, p.citas);
  for (const a of e.operativas) {
    for (const p of a.frena) de(`${a.id}:frena:${p.id}`, `el reto principal de ${a.nombre}`, p.texto, p.citas);
  }
  for (const x of e.recorrido) if (x.friccion) de(`etapa:${x.id}`, `lo que se traba en «${x.nombre}»`, x.friccion, x.citas);
  for (const p of e.pendientes) de(`pendiente:${p.id}`, "un pendiente", p.texto, p.citas);
  return out;
}

const REGLAS_DE_LO_RESUELTO = `Revisas, antes de que lo vea la dirección de una empresa, los problemas que anotó un resumen de sus reuniones de diagnóstico. Cada problema tiene su reunión y la intervención donde se dijo; te damos lo que se habló DESPUÉS en esa misma reunión.

Un problema está RESUELTO en dos casos: (1) la empresa dijo que ya lo resolvió; (2) es una LIMITACIÓN con la que se acordó convivir: algo que no se puede cambiar (un sistema cerrado, una regla de la casa matriz) y para lo que la empresa aceptó un paso que le alcanza (forma: «el sistema no tiene integración» y después «exportamos un Excel diario y con eso nos basta», «armamos el caso con lo que es posible hoy»). NO está resuelto lo que el proyecto va a resolver: si Smarteam propone sincronizar, integrar, automatizar o configurar algo para arreglarlo, ese problema es justo lo que la empresa tiene que ver en su diagnóstico. Tampoco si solo se dijo que hay que resolverlo, que se quiere, o si se habló de otra cosa. En la duda, no lo marques: quitar un problema que sigue abierto le esconde algo real a la empresa.

La cita es lo que dijo alguien de la EMPRESA (no de Smarteam) que muestra que ya está resuelto o que acepta convivir con eso. Devuelves SOLO este JSON: {"resueltos":[{"i":<el número del problema>,"turno":<la intervención de esa cita>,"cita":"lo dicho, palabra por palabra, de 6 a 25 palabras seguidas de esa intervención","como":"cómo quedó resuelto, hasta 15 palabras"}]}. Sin ninguno: {"resueltos":[]}.`;

/** El pedido: cada problema con lo que se dijo después en su reunión (sin repetir las intervenciones que comparten). */
export function pedidoDeLoResuelto(piezas: readonly PiezaParaLoResuelto[], reuniones: readonly ReunionParaElResumen[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const porReunion = new Map<string, Set<number>>();
  for (const p of piezas) {
    const r = reuniones.find((x) => x.id === p.reunion);
    if (!r) continue;
    const ns = porReunion.get(r.id) ?? new Set<number>();
    for (const t of r.turnos) if (t.n >= p.turno && t.n <= p.turno + TURNOS_DESPUES_DE_LA_CITA) ns.add(t.n);
    porReunion.set(r.id, ns);
  }
  const bloques = [...porReunion.entries()].map(([id, ns]) => {
    const r = reuniones.find((x) => x.id === id)!;
    const corto = (t: string) => (t.length > LARGO_DE_UN_TURNO_PARA_LO_RESUELTO ? `${t.slice(0, LARGO_DE_UN_TURNO_PARA_LO_RESUELTO)}…` : t);
    const lineas = r.turnos.filter((t) => ns.has(t.n)).map((t) => `[${t.n}] ${t.hablante}: ${corto(t.texto)}`);
    return `### ${r.clave} · ${r.fecha.slice(0, 10)}${r.titulo ? ` · «${r.titulo}»` : ""}\n${lineas.join("\n")}`;
  });
  const lista = piezas.map((p, i) => ({ i, problema: p.texto, reunion: reuniones.find((r) => r.id === p.reunion)?.clave ?? p.reunion, turno: p.turno }));
  return {
    model: MODELO_DEL_RESUMEN,
    max_tokens: 1500,
    system: REGLAS_DE_LO_RESUELTO,
    messages: [
      {
        role: "user",
        content: `Los problemas:\n${JSON.stringify(lista, null, 1)}\n\nLo que se habló después de cada uno (cada línea es una intervención: [número] quien habla: lo que dijo):\n\n${bloques.join("\n\n")}`,
      },
    ],
  };
}

/** Las palabras de una intervención de la empresa que acepta un acuerdo después de lo que dijo Smarteam («Mhm.» no alcanza). */
const PALABRAS_DE_UNA_ACEPTACION = 4;
/**
 * Una objeción, una queja, una duda o un aplazamiento: no es una aceptación («No, eso no nos sirve», «eso nos complica»,
 * «puede ser, habría que ver», «déjame consultarlo», «lo vemos después»). Sobre `paraComparar`.
 */
const OBJETA =
  /^(no|nunca|tampoco|ni)\b|\bno (nos |me |les )?(sirve|funciona|alcanza|basta)\b|\bno es suficiente\b|\bimposible\b|\bcomplica\w*|\bproblema\w*|\bdificil\w*|\bqueja\w*|\bmalo\b|\bpeor\b|\bpuede ser\b|\b(habria|hay|tendriamos) que (ver|revisar|consultar)\b|\bconsultar\w*|\blo vemos (despues|luego|con)\b|\b(te|les) confirmo\b|\bveremos\b|\bquizas?\b|\btal vez\b|\bno se\b|\bpasemos\b|\botro tema\b/;
/** Una aceptación dicha: lo que tiene que traer la respuesta de la empresa a lo que propuso Smarteam. Sobre `paraComparar`. */
const ACEPTA = /\b(si|claro|perfecto|excelente|de acuerdo|dale|listo|me parece|nos parece|nos basta|basta|nos sirve|funciona|esta bien|positivo|correcto|exacto|hagamoslo|genial)\b/;

/**
 * Lee lo resuelto y lo VERIFICA: la cita tiene que estar en esa reunión, en una intervención de después de la del problema
 * (dentro de las que se le mandaron), y ser de la EMPRESA: lo que propone Smarteam no resuelve nada por sí solo. Si el
 * modelo cita a Smarteam (Centauro: «vamos a armar el caso de negocio bajo lo que es posible hoy», de Marco), vale solo si
 * la empresa lo confirmó, o si la PRIMERA respuesta de la empresa (en las dos intervenciones siguientes) acepta: trae un
 * «sí», «perfecto», «nos basta», «me parece»… y ninguna objeción, duda, aplazamiento ni cambio de tema (revisión del 24
 * nov, dos vueltas: «No, eso no nos sirve» partido en dos intervenciones, una queja de antes de la propuesta, la respuesta a
 * OTRA pregunta del mismo turno, «puede ser, habría que ver», «pasemos al otro tema»). Si lo de Smarteam termina con una
 * pregunta, la respuesta es a esa pregunta y no vale. Una cita de la empresa vale si su intervención ENTERA no objeta (se
 * citaba solo la segunda frase de «No, eso no nos sirve. Lo que hacemos hoy es…»). Lo que se guarda como prueba es lo que
 * dijo la empresa. Lo que no se verifica no quita nada.
 */
export function leerLoResuelto(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  piezas: readonly PiezaParaLoResuelto[],
  reuniones: readonly ReunionParaElResumen[],
  parse: (texto: string) => Record<string, unknown>,
): { lugar: string; motivo: string }[] {
  const crudo = parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const out: { lugar: string; motivo: string }[] = [];
  for (const v of arreglo(crudo.resueltos)) {
    const x = objeto(v);
    const p = piezas[typeof x.i === "number" ? x.i : Number(x.i)];
    const r = p && reuniones.find((y) => y.id === p.reunion);
    if (!p || !r || out.some((y) => y.lugar === p.lugar)) continue;
    if (cadena(x.cita).split(" ").filter(Boolean).length < PALABRAS_DE_UNA_CITA) continue;
    const enLaVentana = r.turnos.filter((t) => t.n > p.turno && t.n <= p.turno + TURNOS_DESPUES_DE_LA_CITA);
    const c = verificarCita({ turno: Number(x.turno), texto: cadena(x.cita) }, enLaVentana);
    if (!c) continue;
    const objeta = (texto: string) => texto.includes("?") || OBJETA.test(paraComparar(texto));
    const deLaEmpresa = esDelCliente(r, c.hablante);
    const suTurno = r.turnos.find((t) => t.n === c.turno)?.texto ?? c.texto;
    if (deLaEmpresa && (objeta(c.texto) || objeta(suTurno))) continue;
    const confirmo = deLaEmpresa ? null : confirmacion(r, c.turno, finDeLaCita(r, c));
    // La primera respuesta de la empresa a lo que propuso Smarteam, si lo propuesto no terminó en una pregunta.
    const respuesta = deLaEmpresa || confirmo || suTurno.includes("?") ? undefined : enLaVentana.find((t) => t.n > c.turno && esDelCliente(r, t.hablante));
    const alLado =
      respuesta &&
      respuesta.n <= c.turno + 2 &&
      palabrasDe(respuesta.texto).length >= PALABRAS_DE_UNA_ACEPTACION &&
      !objeta(respuesta.texto) &&
      !CORRIGE.test(paraComparar(respuesta.texto)) &&
      ACEPTA.test(paraComparar(respuesta.texto))
        ? respuesta
        : null;
    if (!deLaEmpresa && !confirmo && !alLado) continue;
    const prueba = alLado ? { turno: alLado.n, texto: alLado.texto } : confirmo ? { turno: c.turno, texto: `${c.texto} · ${confirmo.texto}` } : c;
    const como = cadena(x.como);
    out.push({ lugar: p.lugar, motivo: `${p.donde}: ya está resuelto en la misma reunión (${r.clave}, intervención ${prueba.turno}: «${prueba.texto.slice(0, 90)}»)${como ? `: ${como}` : ""}` });
  }
  return out;
}

/** Quita lo resuelto: la pieza entera, o solo la fricción de un paso del recorrido (el paso sigue). */
export function sinLoResuelto<T extends Pick<LoQueEscribioElAgente, "puntos" | "operativas" | "recorrido" | "pendientes">>(e: T, lugares: readonly string[]): T {
  if (!lugares.length) return e;
  const fuera = new Set(lugares);
  return {
    ...e,
    puntos: e.puntos.filter((p) => !fuera.has(`punto:${p.id}`)),
    operativas: e.operativas.map((a) => ({ ...a, frena: a.frena.filter((p) => !fuera.has(`${a.id}:frena:${p.id}`)) })),
    recorrido: e.recorrido.map((x) => (fuera.has(`etapa:${x.id}`) ? { ...x, friccion: null } : x)),
    pendientes: e.pendientes.filter((p) => !fuera.has(`pendiente:${p.id}`)),
  };
}

// ── La etapa del equipo que falta en el recorrido (12 nov) ──────────────────────

const REGLAS_DE_LA_ETAPA_QUE_FALTA = `Completas el recorrido de un cliente para una página que Smarteam le presenta a una empresa. Hubo una reunión con un equipo que no aparece en ninguna etapa. Lees esa reunión y el recorrido que ya existe.

Si en esa reunión la empresa contó cómo pasa HOY un cliente (o un prospecto) por ese equipo, devuelve esa etapa: «etapa» (hasta 5 palabras), «quien» (el equipo), «texto» (hasta 6 palabras, sin «tu» ni «tus»), «friccion» (lo que se traba, o null), «antesDe» (el nombre exacto de la etapa del recorrido que va justo después, o null si va al final) y «citas» (1 o 2: lo dicho por alguien de la empresa, de 6 a 25 palabras seguidas de UNA intervención, copiado palabra por palabra, con su reunión y su turno; nunca pegues pedazos con «;» o «…»). Todo lo que escribas tiene que estar en tus citas. Si la reunión no describe una etapa del recorrido de un cliente, no la inventes: devuelve una lista vacía.

Devuelves SOLO este JSON: {"etapas":[{"etapa":"…","quien":"…","texto":"…","friccion":"… o null","antesDe":"… o null","citas":[{"reunion":"R1","turno":12,"texto":"…"}]}]}`;

/** El pedido de la etapa de un equipo que tuvo reunión y no quedó en el recorrido: solo su reunión y el recorrido de hoy. */
export function pedidoDeLaEtapaQueFalta(equipo: string, reunion: ReunionParaElResumen, recorrido: readonly Pick<EtapaDelResumen, "nombre" | "quien">[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const contenido = [
    `El equipo sin etapa: ${equipo}`,
    `El recorrido de hoy, en orden: ${recorrido.map((e, i) => `${i + 1}. ${e.nombre}${e.quien ? ` (${e.quien})` : ""}`).join(" · ") || "(vacío)"}`,
    `La reunión con ese equipo (cada línea es un turno: [número] quien habla: lo que dijo):\n### ${reunion.clave} · ${reunion.fecha.slice(0, 10)}\n${reunion.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`,
  ].join("\n\n");
  return { model: MODELO_DEL_RESUMEN, max_tokens: 1200, system: REGLAS_DE_LA_ETAPA_QUE_FALTA, messages: [{ role: "user", content: contenido }] };
}

/** Lee la etapa que faltaba, la verifica como cualquier otra y la pone antes de la que dijo (o al final). */
export function conLaEtapaQueFalta(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  recorrido: readonly (EtapaDelResumen & { orden?: number })[],
  ctx: ContextoDelResumen,
  o: Reglas,
): { recorrido: (EtapaDelResumen & { orden?: number })[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const descartados: string[] = [];
  const out = [...recorrido];
  for (const v of arreglo(crudo.etapas).slice(0, 1)) {
    if (out.length >= MAX_ETAPAS) break;
    const r = etapaVerificada(v, ctx, o);
    if (!r.ok) {
      descartados.push(`etapa del equipo que faltaba: ${r.motivo}`);
      continue;
    }
    const antes = paraComparar(cadena(objeto(v).antesDe));
    const k = antes ? out.findIndex((e) => paraComparar(e.nombre) === antes) : -1;
    // El equipo que faltaba suele ser el que atiende después (Soporte): si su paso es de atención, va en el bucle.
    const acompana = r.etapa.continuo || (out.some((e) => e.continuo) || !antes) && iconoDelPaso(r.etapa.nombre) === "soporte";
    out.splice(k >= 0 && !acompana ? k : out.length, 0, { ...r.etapa, id: "sx", ...(acompana ? { continuo: true } : {}) });
  }
  // Los `orden` de nuevo en secuencia, para que `conLasEtapas` respete la posición.
  return { recorrido: out.map((e, i) => ({ ...e, orden: i })), descartados };
}

// ── El arreglo de las cifras ────────────────────────────────────────────────────

const REGLAS_DEL_ARREGLO = `Corriges cifras para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problemas»: un texto más largo que su tope, un número que NO está en lo que la empresa dijo (sus «citas»): una resta, una suma, un porcentaje calculado o un número de otra parte; o una conclusión que las citas no dicen (quítala).

Reescribe «cifra» (solo el número, hasta 12 caracteres: «40», «120–150», «3,5 %»), «texto» (su rótulo, de 2 a 6 palabras, sin verbo y sin «tu» ni «tus»: «leads al mes») y «nota» (el período, la base y los supuestos, hablándole a la empresa, o null) usando SOLO los números que aparecen en sus citas, tal como aparecen. No restes, no sumes, no calcules porcentajes, no redondees. Lo que quites no lo reemplaces por una palabra que lo insinúe («la mitad», «el doble»): la frase tiene que seguir siendo cierta. Si el rótulo o la nota dicen de qué parte es la cifra («excluye los 300 de WhatsApp», «en 2 de las 5 tiendas», «solo los de correo»), conserva eso sin el número que la cita no dice: sin eso, una parte pasaría por el total. Si una transcripción se ve cortada («anda entre 15 lits» por «1.500 leads»), no la copies: omite la cifra. Si con esos números no se puede decir la magnitud, omítela.

Devuelves SOLO este JSON: {"cifras":[{"i":<el número de la cifra>,"cifra":"…","texto":"…","nota":"… o null"}]}`;

/** El pedido del arreglo: solo las cifras caídas, con sus citas. Unos pocos cientos de tokens, sin las transcripciones. */
export function pedidoDelArreglo(xs: readonly DatoPorArreglar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const datos = xs.map((x, i) => ({ i, cifra: x.cifra, texto: x.texto, nota: x.nota, problemas: x.problemas ?? [], numerosQueNoEstan: x.sobran.map((s) => s.replace(/·$/, "").replace("·", " ")), citas: x.citas.map((c) => c.texto) }));
  return { model: MODELO_DEL_RESUMEN, max_tokens: 800, system: REGLAS_DEL_ARREGLO, messages: [{ role: "user", content: JSON.stringify(datos, null, 1) }] };
}

/** Lee el arreglo y vuelve a verificar cada cifra contra SUS citas (las mismas, ya verificadas). */
export function leerElArreglo(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  xs: readonly DatoPorArreglar[],
  o: ReglasDelResumen & { parse: (texto: string) => Record<string, unknown>; dicho?: string; reuniones?: readonly ReunionParaElResumen[] },
): { cifras: (Omit<CifraDelResumen, "id"> & { operativa: string })[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const cifras: (Omit<CifraDelResumen, "id"> & { operativa: string })[] = [];
  const descartados: string[] = [];
  const usados = new Set<number>();
  for (const v of arreglo(crudo.cifras ?? crudo.datosRojos)) {
    const x = objeto(v);
    const i = typeof x.i === "number" ? x.i : Number(x.i);
    const de = xs[i];
    if (!de || usados.has(i)) continue;
    usados.add(i);
    const citado = de.citas.map((c) => c.texto).join(" ");
    const cifra = textoValido(x.cifra, TOPE_DE_LA_CIFRA, o, citado);
    const texto = textoValido(sinLaConclusion(cadena(x.texto), citado) ?? x.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o, citado);
    const nota = nulo(x.nota) ? null : textoValido(x.nota, TOPE_DE_UNA_PREGUNTA, o, citado);
    if (!cifra.ok || !texto.ok || (nota && !nota.ok) || !cifrasDeMas(cifra.texto, "").length) {
      descartados.push(`cifra corregida «${cadena(x.cifra)}»: ${!cifra.ok ? cifra.motivo : !texto.ok ? texto.motivo : nota && !nota.ok ? nota.motivo : "sin número"}`);
      continue;
    }
    // Una cifra corregida que cambia de magnitud no es la misma cifra (24 nov, Centauro: «~1.400–1.500 contactos» volvió como
    // «~15», porque la transcripción dice «anda entre 15 lits»): es la transcripción cortada, no un dato nuevo.
    if (cambiaDeMagnitud(de.cifra, cifra.texto)) {
      descartados.push(`cifra corregida «${cifra.texto}»: cambia la magnitud de «${de.cifra}» (la transcripción puede estar cortada)`);
      continue;
    }
    const motivos = problemasDeLaCifra({ cifra: cifra.texto, texto: texto.texto, nota: nota?.ok ? nota.texto : null, citas: de.citas }, o.dicho ?? "", o.reuniones);
    if (motivos.length) {
      // 12 nov: decía «sigue con números… ()» con la lista vacía cuando el motivo era otro. Ahora dice cuál.
      descartados.push(`cifra corregida «${cifra.texto}»: ${motivos.join("; ")}`);
      continue;
    }
    const e = estadoDeLaCifra({ estado: de.estado, cifra: cifra.texto, nota: nota?.ok ? nota.texto : null, citas: de.citas });
    cifras.push({ operativa: de.operativa, cifra: cifra.texto, texto: texto.texto, ...e, dimensionId: de.dimensionId, citas: de.citas, origen: origenDeLaCita(de.citas[0]) });
  }
  return { cifras, descartados };
}

/** El primer número de una cifra, con sus miles («1.400–1.500» → 1400; «2,8 %» → 2.8); null sin número. */
/**
 * Los números de una cifra, en orden, con sus miles y su multiplicador («1.400–1.500» → 1400, 1500; «US$ 40 mil» → 40000;
 * «1,5 millones» y «₡ 12 M», en millones).
 */
function valoresDe(x: string): number[] {
  const MULTIPLICA: Record<string, number> = { mil: 1e3, miles: 1e3, k: 1e3, millon: 1e6, millones: 1e6, m: 1e6, mm: 1e6 };
  const out: number[] = [];
  for (const m of sinEspaciosDeMiles(x).matchAll(/(\d+(?:[.,]\d+)*)\s*(mil|miles|millones|mill[oó]n|mm|m|k)?(?!\p{L})/giu)) {
    const n = /^\d{1,3}(?:[.,]\d{3})+$/.test(m[1]) ? Number(m[1].replace(/[.,]/g, "")) : Number(m[1].replace(",", "."));
    const v = n * (m[2] ? (MULTIPLICA[paraComparar(m[2])] ?? 1) : 1);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/**
 * Un número de `despues` que no estaba en `antes`, que es el comienzo de uno que sí estaba y diez veces distinto («15»
 * por «1.500»): la huella de una transcripción cortada. El motivo, o null.
 */
export function numeroCortado(antes: string, despues: string): string | null {
  const viejos = valoresDe(antes);
  for (const n of valoresDe(despues)) {
    if (viejos.includes(n)) continue;
    const de = viejos.find((v) => Math.max(v, n) / Math.min(v, n) >= 10 && String(Math.round(v)).startsWith(String(Math.round(n))));
    if (de !== undefined) return `«${n}» parece «${de}» cortado en la transcripción`;
  }
  return null;
}

/**
 * Diez veces más o menos, entre dos cifras que no son porcentajes: no es la misma. Se comparan el primer número y el
 * mayor de cada una (revisiones del 24 nov, segunda vuelta: «120–150» → «~15» se escapaba con el primero, «~180 de 200»
 * → «~18 de 200» con el mayor, y «~23 mil» → «~23.000» se descartaba sin leer el «mil»).
 */
export function cambiaDeMagnitud(antes: string, despues: string): boolean {
  if (antes.includes("%") || despues.includes("%")) return false;
  const a = valoresDe(antes);
  const d = valoresDe(despues);
  if (!a.length || !d.length) return false;
  const diez = (x: number, y: number) => Math.max(x, y) / Math.min(x, y) >= 10;
  return diez(a[0], d[0]) || diez(Math.max(...a), Math.max(...d));
}

/** Suma lo corregido a su área, sin repetir cifras y hasta el tope; los ids siguen la numeración. */
export function conLoArreglado(operativas: readonly AreaOperativa[], arreglados: readonly (Omit<CifraDelResumen, "id"> & { operativa: string })[]): AreaOperativa[] {
  return operativas.map((a) => {
    const out = [...a.cifras];
    for (const { operativa, ...c } of arreglados) {
      if (operativa !== a.id || out.length >= MAX_CIFRAS_POR_AREA) continue;
      if (out.some((d) => paraComparar(d.cifra) === paraComparar(c.cifra))) continue;
      let k = out.length + 1;
      while (out.some((d) => d.id === `c${k}`)) k++;
      out.push({ ...c, id: `c${k}` });
    }
    return { ...a, cifras: out };
  });
}

// ── El piso de cada equipo y los retos del traspaso (24 nov) ─────────────────────

/**
 * Lo mínimo de un equipo con reunión propia: su reto principal y dos retos (24 nov, Centauro: Marketing quedaba solo en
 * medición y todo se inclinaba hacia Ventas). Es por equipo de la escala, no por subequipo.
 */
export const RETOS_DEL_PISO = 2;

/** Los equipos de la escala con una reunión propia (no una nota del equipo) que no llegan al piso. */
export function equiposBajoElPiso(operativas: readonly Pick<AreaOperativa, "areaId" | "frena" | "retos">[], ctx: Pick<ContextoDelResumen, "areas" | "reuniones">): string[] {
  const conReunion = [...new Set(ctx.reuniones.filter((r) => !esNotaDelEquipo(r)).flatMap((r) => (r.areaId ? [r.areaId] : [])))].filter((id) => ctx.areas.some((a) => a.id === id));
  return conReunion.filter((id) => {
    const suyas = operativas.filter((x) => x.areaId === id);
    // Lo que otro equipo dijo de este (un reto del traspaso) también se ve en su fila: cuenta para el piso.
    const delTraspaso = suyas.length ? operativas.filter((x) => x.areaId !== id).flatMap((x) => x.retos.filter((r) => r.traspaso === id)).length : 0;
    return !suyas.some((x) => x.frena.length) || suyas.reduce((s, x) => s + x.retos.length, 0) + delTraspaso < RETOS_DEL_PISO;
  });
}

const REGLAS_DEL_PISO = `Completas, para una página que Smarteam (una consultora) le presenta a una empresa, lo que encontramos de UN equipo de la empresa. Ese equipo tuvo su propia reunión y quedó con poco: te doy sus reuniones (cada línea es un turno: [número] quien habla: lo que dijo) y lo que ya tiene.

Devuelve lo que le falta, solo con lo que dijo alguien de la EMPRESA en estas reuniones:
- «frena» (0 o 1, solo si no tiene): EL RETO PRINCIPAL del equipo, de 4 a 10 palabras, sin números y sin «tu»: lo que le duele, no cómo opera ni una herramienta.
- «retos» (los que falten para llegar a 2): los problemas que lo causan, de 5 a 10 palabras, empezando con un verbo en infinitivo y sin «tu», concretos de ESTA empresa; no solo cómo mide: también lo que contó de su trabajo y de lo que le duele. Si lo que contó es de OTRO equipo (forma: Marketing cuenta que Ventas no le avisa qué pasó con los leads), es un reto del traspaso: pon en «traspaso» el id de ese otro equipo.
- «dimension»: el id de la parte de la escala que explica el reto, o null.
Cada uno con 1 o 2 citas: lo dicho por alguien de la empresa, de 6 a 25 palabras seguidas de UNA intervención, copiado palabra por palabra, con su reunión y su turno; nunca pegues pedazos con «;» o «…». Todo lo que escribas tiene que estar en tus citas. No repitas lo que ya tiene. Nada de lo que la empresa ya resolvió o acordó cómo manejar. Los equipos se nombran como en los datos; nunca «comercial». Nunca el nombre de una persona (su rol). Si la reunión no da para más, devuelve listas vacías: no inventes.

Devuelves SOLO este JSON: {"frena":[{"texto":"…","citas":[{"reunion":"R1","turno":12,"texto":"…"}]}],"retos":[{"texto":"…","dimension":"<id o null>","traspaso":"<id o null>","citas":[{"reunion":"R1","turno":12,"texto":"…"}]}]}`;

/** Lo que ya tiene un equipo (para no repetirlo en el piso). */
function loQueYaTiene(operativas: readonly AreaOperativa[], areaId: string): { frena: string[]; retos: string[] } {
  const suyas = operativas.filter((x) => x.areaId === areaId);
  return { frena: suyas.flatMap((x) => x.frena.map((p) => p.texto)), retos: suyas.flatMap((x) => x.retos.map((p) => p.texto)) };
}

/** El pedido del piso de UN equipo: solo sus reuniones (las de su equipo, hasta dos) y lo que ya tiene. */
export function pedidoDelPisoDelEquipo(
  area: Pick<AreaParaElResumen, "id" | "nombre" | "dimensiones">,
  reuniones: readonly ReunionParaElResumen[],
  operativas: readonly AreaOperativa[],
  otros: readonly { id: string; nombre: string }[],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const tiene = loQueYaTiene(operativas, area.id);
  const contenido = [
    `El equipo: ${area.nombre} (id ${area.id})`,
    `Sus partes de la escala: ${area.dimensiones.map((d) => `${d.id} ${d.nombre}`).join(" · ")}`,
    `Los otros equipos (para «traspaso»): ${otros.map((x) => `${x.id} ${x.nombre}`).join(" · ") || "ninguno"}`,
    `Lo que ya tiene: reto principal: ${tiene.frena.join(" | ") || "(ninguno)"} · retos: ${tiene.retos.join(" | ") || "(ninguno)"}`,
    ...reuniones.map((r) => `### ${r.clave} · ${r.fecha.slice(0, 10)}\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`),
  ].join("\n\n");
  return { model: MODELO_DEL_RESUMEN, max_tokens: 1500, system: REGLAS_DEL_PISO, messages: [{ role: "user", content: contenido }] };
}

/**
 * Lee el piso de un equipo y lo verifica como cualquier pieza (`conSuCita`). Va al primer subequipo de ese equipo; si el
 * agente no le dio ninguno, se crea uno con el nombre del equipo. Sin repetir y sin pasar los topes.
 */
export function conElPisoDelEquipo(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  areaId: string,
  operativas: readonly AreaOperativa[],
  ctx: ContextoDelResumen,
  o: Reglas,
): { operativas: AreaOperativa[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const descartados: string[] = [];
  const area = ctx.areas.find((x) => x.id === areaId);
  const out = operativas.map((x) => ({ ...x, frena: [...x.frena], retos: [...x.retos] }));
  if (!area) return { operativas: out, descartados };
  const nuevoId = (prefijo: string, xs: readonly { id: string }[]) => {
    let k = xs.length + 1;
    while (xs.some((y) => y.id === `${prefijo}${k}`)) k++;
    return `${prefijo}${k}`;
  };
  const piezas = (lista: unknown, que: string) =>
    arreglo(lista).flatMap((y) => {
      const p = conSuCita(y, ctx, o, descartados, `el piso de ${area.nombre} (${que})`);
      return p ? [{ ...p, crudo: objeto(y) }] : [];
    });
  const frenas = piezas(crudo.frena, "reto principal").slice(0, 1);
  const retos = piezas(crudo.retos, "reto");
  if (!frenas.length && !retos.length) return { operativas: out, descartados };
  let destino = out.find((x) => x.areaId === areaId);
  if (!destino) {
    destino = { id: nuevoId("o", out), nombre: area.nombre, areaId, organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null };
    out.push(destino);
  }
  const yaEsta = (xs: readonly { texto: string }[], t: string) => xs.some((y) => paraComparar(y.texto) === paraComparar(t));
  if (!out.some((x) => x.areaId === areaId && x.frena.length))
    for (const p of frenas) destino.frena.push({ id: nuevoId("fp", destino.frena), texto: p.texto, citas: p.citas, origen: origenDeLaCita(p.citas[0]) });
  for (const p of retos) {
    if (destino.retos.length >= MAX_RETOS || yaEsta(destino.retos, p.texto)) continue;
    const otro = cadena(p.crudo.traspaso);
    const traspaso = ctx.areas.some((x) => x.id === otro) && otro !== areaId ? otro : undefined;
    destino.retos.push({ id: nuevoId("tp", destino.retos), texto: p.texto, citas: p.citas, dimensionId: dimensionDelArea(ctx, areaId, p.crudo.dimension), origen: origenDeLaCita(p.citas[0]), ...(traspaso ? { traspaso } : {}) });
  }
  return { operativas: out, descartados };
}

/** Un equipo con reunión propia que igual quedó sin su reto principal o sin dos retos: se avisa adentro. */
export function avisosDelPiso(operativas: readonly Pick<AreaOperativa, "areaId" | "frena" | "retos">[], ctx: Pick<ContextoDelResumen, "areas" | "reuniones">): string[] {
  return equiposBajoElPiso(operativas, ctx).map(
    (id) => `${ctx.areas.find((a) => a.id === id)!.nombre} tuvo su reunión y quedó sin su reto principal o con menos de ${RETOS_DEL_PISO} retos: revísalo o rehaz el Resumen.`,
  );
}

// ── Qué hicimos ─────────────────────────────────────────────────────────────────

/** Una conferencia de más de esto es un error de los datos (alguien dejó la sala abierta): vale la del evento. */
const MAX_MINUTOS_CREIBLES = 6 * 60;

/** Los minutos que duró de verdad una reunión: la conferencia de Meet; si no se sabe o no es creíble, la del evento. */
export function minutosDeLaReunion(f: { duration: number; conferenciaInicio: Date | null; conferenciaFin: Date | null }): number | null {
  if (f.conferenciaInicio && f.conferenciaFin) {
    const m = (f.conferenciaFin.getTime() - f.conferenciaInicio.getTime()) / 60_000;
    if (m > 0 && m <= MAX_MINUTOS_CREIBLES) return Math.round(m);
  }
  return f.duration > 0 ? Math.round(f.duration) : null;
}

/** «A», «A y B», «A, B y C». */
const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Lo que dice «Qué hicimos», con los datos de las reuniones. `areas`: los equipos de la escala que ve el cliente, para
 * decir cuáles se exploraron (con sesiones) y cuáles quedan pendientes.
 */
/**
 * Cuántas sesiones, en palabras (24 nov, D4): las reuniones de trabajo nunca se presentan como exploración. Sin ninguna de
 * trabajo, «3 sesiones», como siempre; con alguna, «4 reuniones de trabajo juntos y 2 sesiones de diagnóstico» (sin la
 * parte que es cero).
 */
export function cuantasSesiones(sesiones: readonly Pick<SesionHecha, "deTrabajo">[]): string {
  const trabajo = sesiones.filter((x) => x.deTrabajo).length;
  const diagnostico = sesiones.length - trabajo;
  if (!trabajo) return `${diagnostico} ${diagnostico === 1 ? "sesión" : "sesiones"}`;
  const deTrabajo = `${trabajo} ${trabajo === 1 ? "reunión de trabajo" : "reuniones de trabajo"} juntos`;
  return diagnostico ? `${deTrabajo} y ${diagnostico} ${diagnostico === 1 ? "sesión de diagnóstico" : "sesiones de diagnóstico"}` : deTrabajo;
}

export function loQueHicimos(h: ResumenGuardado["hicimos"], areas: readonly { areaId: string; nombre: string }[] = []): LoQueHicimos | null {
  if (!h.sesiones.length) return null;
  // Las personas de las sesiones que se cuentan (sin repetir); un Resumen sin ese dato, el total que se guardó.
  const conQuienes = h.sesiones.some((x) => x.quienes);
  const personas = conQuienes ? new Set(h.sesiones.flatMap((x) => x.quienes ?? [])).size : h.personas;
  const minutos = h.sesiones.reduce((s, x) => s + (x.minutos ?? 0), 0);
  const sinDuracion = h.sesiones.filter((x) => x.minutos === null).length;
  const equipos = [...new Set(h.sesiones.flatMap((x) => (x.equipo ? [x.equipo] : [])))];
  const n = h.sesiones.length;
  const tiempo = minutos ? `${sinDuracion ? "más de " : ""}${enHoras(minutos)}` : null;
  const deDatos = [
    `${tiempo ? `Nos dedicaste ${tiempo} en ` : "Nos dedicaste "}${cuantasSesiones(h.sesiones)}${equipos.length ? ` con ${enLista(equipos)}` : ""}${personas > 1 ? `, con ${personas} personas de tu equipo` : ""}.`,
    "Todo lo que ves en esta página sale de lo que nos contaste ahí.",
  ].join(" ");
  const deTrabajo = h.sesiones.filter((x) => x.deTrabajo).length;
  return {
    sesiones: n,
    ...(deTrabajo ? { deTrabajo } : {}),
    minutos,
    sinDuracion,
    equipos,
    personas,
    texto: h.texto ?? deDatos,
    mano: h.texto !== null,
    areas: areas.map((a) => {
      const suyas = h.sesiones.filter((x) => x.areaId === a.areaId);
      return { areaId: a.areaId, nombre: a.nombre, sesiones: suyas.length, minutos: suyas.reduce((s, x) => s + (x.minutos ?? 0), 0) };
    }),
  };
}

// ── Por qué está en su nivel ────────────────────────────────────────────────────

const idx = (l: Letra) => LETRAS.indexOf(l);
const nombresEntreComillas = (xs: readonly string[]) => enLista(xs.map((x) => `«${x}»`));

/**
 * Por qué el área está en su nivel, armado con los datos (sin IA): lo que la frena para subir y lo que la sostiene. Desde
 * el 11 nov no dice «provisional» (se veía inseguro): lo que falta confirmar va en «Qué falta validar».
 */
export function porqueDeRespaldo(r: Pick<ResultadoDelTest, "areaNombre" | "nivel" | "nivelNombre" | "dimensiones" | "niveles" | "recomendacion">, provisional: readonly string[] | null = null): string | null {
  if (!r.nivel || !r.nivelNombre) return null;
  const nivel = r.nivel;
  const nombre = (l: Letra) => r.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const medidas = r.dimensiones.filter((d) => d.preguntada && d.nivel);
  const siguiente = LETRAS[idx(nivel) + 1];
  const frenan = medidas.filter((d) => idx(d.nivel!) <= idx(nivel));
  // Lo que más frena va primero (el cálculo lo eligió), y como mucho tres.
  const frena = r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionId : null;
  const ordenadas = [...frenan].sort((a, b) => (a.id === frena ? -1 : b.id === frena ? 1 : idx(a.nivel!) - idx(b.nivel!))).slice(0, 3);
  const sostienen = medidas.filter((d) => idx(d.nivel!) > idx(nivel)).sort((a, b) => idx(b.nivel!) - idx(a.nivel!)).slice(0, 2);
  const partes: string[] = [];
  void provisional;
  if (siguiente && ordenadas.length)
    partes.push(`No llega a ${nombre(siguiente)} porque ${nombresEntreComillas(ordenadas.map((d) => d.nombre))} ${ordenadas.length === 1 ? "sigue" : "siguen"} en ${ordenadas.length === 1 ? nombre(ordenadas[0].nivel!) : "lo más bajo"}.`);
  if (idx(nivel) > 0 && sostienen.length)
    partes.push(`No está más abajo porque ${nombresEntreComillas(sostienen.map((d) => d.nombre))} ya ${sostienen.length === 1 ? "opera" : "operan"} en ${nombre(sostienen[0].nivel!)}.`);
  else if (idx(nivel) > 0) partes.push(`Todas sus partes ya están por lo menos en ${nombre(nivel)}.`);
  return partes.length ? partes.join(" ") : null;
}

/**
 * Las partes de la escala de las que el Resumen dice algo con su cita (24 nov): un reto o una cifra con su parte. Una
 * hipótesis así sube a evidencia: no se le pide «Confirmar cómo trabaja hoy…» y lleva sus riesgos y su detalle en la
 * página de su área (lib/exploraciones/escala-para-el-cliente.ts). Lo escrito a mano también cuenta.
 */
export function partesConCitaDelResumen(g: Pick<ResumenGuardado, "v" | "operativas"> | null | undefined): Set<string> {
  if (g?.v !== 2) return new Set();
  // Una cuenta con sus cifras que nadie confirmó todavía no es evidencia, ni lo que solo dijo Smarteam y nadie corrigió
  // (revisión del 24 nov: «sin pista del cliente no hay nivel»). Hace falta una cita de la empresa, o que la escribiera una persona.
  const piezas = (g.operativas ?? []).flatMap((op) => [...op.retos, ...op.cifras.filter((c) => !c.cuenta || c.confirmada)]);
  return new Set(piezas.filter((p) => !!p.dimensionId && (p.citas.some((c) => !c.sinCorregir) || !!p.mano)).map((p) => p.dimensionId!));
}

// ── Lo que ve la página ─────────────────────────────────────────────────────────

/** ¿El texto nombra alguno de estos equipos? */
function nombraA(texto: string, areas: readonly string[] = []): boolean {
  const t = paraComparar(texto);
  return areas.some((a) => {
    const n = paraComparar(a);
    return !!n && new RegExp(`(^|[^\\p{L}])${n}($|[^\\p{L}])`, "u").test(t);
  });
}

/**
 * Por qué una cifra NO sale al cliente; null si sale. Elías (9 nov): una cifra escrita a mano que pierde su cita no se
 * muestra. Sale solo si tiene cita y todos los números de su cifra, su texto y su nota están en lo citado (`cifrasDeMas`,
 * la misma vara que al armarla). La cita se guarda aunque la cifra cambie: al corregirla con lo que dijo la empresa, vuelve.
 */
export function porQueNoSaleLaCifra(d: { cifra: string; texto: string; nota?: string | null; citas: readonly { texto: string }[]; cuenta?: CuentaGuardada; confirmada?: boolean }): string | null {
  // Una «calculado» (24 nov): sale si su cuenta sigue dando esa cifra con números de sus citas, y si quien presenta la confirmó.
  if (d.cuenta) {
    const problemas = problemasDelCalculado({ cifra: d.cifra, texto: d.texto, cuenta: d.cuenta });
    if (problemas.length) return `No sale al cliente: ${problemas[0]}. Corrígela o quítala.`;
    return null;
  }
  if (!d.citas.length) return "No sale al cliente: no tiene una cita de las reuniones que la sostenga. Si no va, quítala.";
  const sobran = cifrasDeMas(`${d.cifra} ${d.texto} ${d.nota ?? ""}`, d.citas.map((c) => c.texto).join(" ")).map((s) => `«${s.replace(/·$/, "").replace("·", " ")}»`);
  if (!sobran.length) return null;
  return `No sale al cliente: ${enLista(sobran)} ${sobran.length === 1 ? "no está" : "no están"} en lo que dijo la empresa. Corrígela con lo que dice la cita o quítala.`;
}

/**
 * Lo que el Resumen encontró de un equipo, para el agente de la descripción de su página (20 nov): el reto principal, lo que
 * lo causa y lo que ya funciona, de cada subequipo. Todo lo que pasó la verificación contra las transcripciones (o lo que
 * escribió una persona). Sin cifras: la descripción no lleva montos. "" sin Resumen del formato 2.
 */
export function loQueEncontroElResumen(g: ResumenGuardado | null | undefined, areaId: string, areasFuera: readonly string[] = [], areasQueVe?: ReadonlySet<string>): string {
  if (g?.v !== 2) return "";
  const sale = (t: string) => !nombraA(t, areasFuera);
  // Lo que otro equipo dijo de este (24 nov, los retos del traspaso): va con su primer subequipo, como en la página.
  // De un equipo que el cliente no ve (`areasQueVe`), no: la página tampoco lo muestra.
  const delTraspaso = (g.operativas ?? [])
    .filter((op) => op.areaId !== areaId && sale(op.nombre) && (!areasQueVe || areasQueVe.has(op.areaId)))
    .flatMap((op) => op.retos.filter((r) => r.traspaso === areaId));
  const primero = (g.operativas ?? []).find((op) => op.areaId === areaId && sale(op.nombre));
  return (g.operativas ?? [])
    .filter((op) => op.areaId === areaId && sale(op.nombre))
    .map((op) => {
      const lineas = [
        ...op.frena.map((p) => `${ROTULO_DEL_RETO_PRINCIPAL}${p.texto}`),
        ...[...op.retos, ...(op === primero ? delTraspaso : [])].map((p) => `${ROTULO_DE_LO_QUE_LO_CAUSA}${p.texto}`),
        ...op.bien.map((p) => `Lo que ya funciona: ${p.texto}`),
      ].filter(sale);
      return lineas.length ? `${op.nombre}:\n${lineas.map((l) => `- ${l}`).join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);
}

/** El aviso de que quedó una pieza de antes (`juntarConLoEditado`): con qué empieza, para quitarlo cuando ya no es cierto. */
const avisoDeLaDeAntes = (tipo: TipoDelNegocio) => `${TITULO_DEL_NEGOCIO[tipo]}: la nueva no pasó la verificación`;
/** Los avisos guardados, sin el de una pieza de antes que una persona ya escribió a mano. */
function sinAvisosResueltos(g: ResumenGuardado | null | undefined): string[] {
  return (g?.avisos ?? []).filter((a) => !PIEZAS_OBLIGATORIAS.some((t) => a.startsWith(avisoDeLaDeAntes(t)) && (g?.negocio?.[t] ?? []).some((p) => p.mano)));
}

/** Lo que pide la página de un Resumen, además de lo guardado. */
export interface OpcionesDeLaPagina {
  /** Solo la pantalla interna (Marco verifica de dónde sale cada cosa); la página del cliente nunca las lleva. */
  conCitas: boolean;
  /** Los equipos de la escala que el cliente NO ve: ninguna pregunta que los nombre sale. */
  areasFuera?: readonly string[];
  /** Las partes por explorar de cada equipo (`ResultadoDeUnArea.porExplorar`): con ellas se sabe si un nivel es provisional. */
  porExplorar?: Readonly<Record<string, readonly string[]>>;
  /**
   * La pérdida de la preventa (20 nov, `perdidaDeLaEscala`): la VALIDADA con el cliente va de COSTO en la primera fila de
   * Ventas (la calcula Nexus con las cifras de la empresa: no pasa por las citas, no es del agente); una cuenta sin validar
   * va como «por validar», sin el monto.
   */
  perdida?: LaPerdidaEnLaEscala | null;
}

/**
 * El equipo de la escala al que va la pérdida validada: sale de cómo vende (leads, conversión, cierres), es de Ventas. Por su
 * número, como el resto de Nexus (`EQUIPOS`): en la edición de Educación el área 1 se llama «Admisiones».
 */
const AREA_DE_VENTAS = "1";

/**
 * La pérdida validada como una cifra de la página: la validó la empresa, así que va con ✓ («Lo validaste con nosotros»,
 * `etiquetaDeLaCifra`), nunca como «≈ Estimado»; su cuenta a la vista es la nota.
 */
export function cifraDeLaPerdida(p: PerdidaDeLaEscala): CifraDeLaPagina {
  return {
    id: "perdida",
    cifra: p.cifra,
    texto: p.rotulo,
    estado: "declarado",
    nota: `Con tus cifras: ${p.cuenta}.`,
    clave: "perdida",
    conNota: false,
    dimensionNombre: null,
    fecha: p.validadaEn,
    dePerdida: { nombreFijo: `perdida.${p.huella}`, cuenta: p.cuenta },
  };
}

/**
 * EL ÚNICO que decide qué sale en el Resumen, en la página del cliente y en la interna, para los dos formatos. Solo de las
 * áreas de la página (`resultados`); el nivel sale del cálculo. Sin `conCitas` (la del cliente) no salen citas, ni una
 * cifra que su cita no sostiene (`porQueNoSaleLaCifra`); adentro sale marcada con `noSale`.
 */
export function resumenParaLaPagina(
  guardado: ResumenGuardado | null | undefined,
  resultados: readonly ResultadoDelTest[],
  chequeo: Readonly<Record<string, EstimadoGuardado>>,
  entorno: EntornoDeLaFirma,
  o: OpcionesDeLaPagina,
): ResumenDeLaPagina {
  const deLaPagina = new Set(resultados.map((r) => r.areaId));
  const nombreDeLaParte = (id: string | null) => (id ? (resultados.flatMap((r) => r.dimensiones).find((d) => d.id === id)?.nombre ?? null) : null);
  const conCita = <T extends object>(x: T, citas: object) => (o.conCitas ? { ...x, ...citas } : x);
  const fuera = (texto: string) => nombraA(texto, o.areasFuera);
  const g = guardado ?? null;
  const v2 = g?.v === 2;
  // Una parte por explorar de la que el Resumen dice algo con su cita ya no es una hipótesis (24 nov).
  const conCitaDeLaParte = partesConCitaDelResumen(g);

  // Los equipos de la escala: su nivel (normal, sin «provisional»: Elías, 11 nov) y por qué está ahí. `provisional` se
  // sigue calculando, solo para decir en «Qué falta validar» qué falta confirmar.
  const areas: AreaDelResumenDeLaPagina[] = resultados.map((r) => {
    const a = g?.areas[r.areaId];
    const firma = firmaDelArea(chequeo, r.areaId, entorno);
    // Un «por qué» guardado que dice «provisional» o «hipótesis» (los del 10 nov) no sale: se veía inseguro (Elías, 11 nov).
    const sinDuda = !!a?.porque && !/\bprovisional|\bhipotesis\b/.test(paraComparar(a.porque.texto));
    const vigente = sinDuda && !!r.nivel && a!.porque!.firma === firma;
    const provisional = nivelProvisional(r, (o.porExplorar?.[r.areaId] ?? []).filter((id) => !conCitaDeLaParte.has(id)));
    const respaldo = porqueDeRespaldo(r);
    return {
      areaId: r.areaId,
      nombre: r.areaNombre,
      nivel: r.nivel,
      nivelNombre: r.nivelNombre,
      provisional,
      porque: vigente ? a!.porque!.texto : respaldo,
      origenDelPorque: vigente ? (a!.porque!.mano ? "mano" : "agente") : respaldo ? "respaldo" : null,
      porqueViejo: !!a?.porque && !!r.nivel && a.porque.firma !== firma,
      hallazgos: (a?.hallazgos ?? []).map((h) => conCita({ id: h.id, texto: h.texto, dimensionNombre: nombreDeLaParte(h.dimensionId), ...(h.mano ? { mano: true } : {}) }, { citas: h.citas })),
    };
  });
  const areaDe = (id: string) => areas.find((a) => a.areaId === id);

  // Una pieza, con su clave de edición y, solo adentro, sus citas.
  const pieza = (p: { id: string; texto: string; citas: readonly CitaDelResumen[]; mano?: boolean; dimensionId?: string | null }, clave: string): PiezaDeLaPagina =>
    conCita({ id: p.id, texto: p.texto, clave, ...(p.dimensionId !== undefined ? { dimensionNombre: nombreDeLaParte(p.dimensionId) } : {}), ...(p.mano ? { mano: true } : {}) }, { citas: [...p.citas] });
  const lista = (ps: readonly { id: string; texto: string; citas: readonly CitaDelResumen[]; mano?: boolean; dimensionId?: string | null }[], prefijo: string | null): ListaDeLaPagina => ({
    piezas: prefijo ? ps.filter((p) => !fuera(p.texto)).map((p) => pieza(p, `${prefijo}:${p.id}`)) : [],
    nueva: prefijo ? `${prefijo}:nuevo` : null,
  });
  const vacia = (): ListaDeLaPagina => ({ piezas: [], nueva: null });
  // Una cifra: su estado visible (la regla del código, también para lo editado) y, afuera, solo si su cita la sostiene.
  const cifra = (
    d: { id: string; cifra: string; texto: string; citas: readonly CitaDelResumen[]; mano?: boolean; dimensionId: string | null; estado?: EstadoDeLaCifra; nota?: string | null; confirmada?: boolean; cuenta?: CuentaGuardada },
    clave: string,
    conNota: boolean,
  ): CifraDeLaPagina | null => {
    if (fuera(`${d.cifra} ${d.texto} ${d.nota ?? ""} ${d.cuenta?.texto ?? ""}`)) return null;
    const noSale = porQueNoSaleLaCifra(d);
    if (noSale && !o.conCitas) return null;
    // Una cuenta con sus cifras que nadie confirmó (24 nov) no sale afuera; adentro lleva «Confirmar».
    if (d.cuenta && !d.confirmada && !o.conCitas) return null;
    const e = estadoDeLaCifra({ estado: d.estado ?? "declarado", cifra: d.cifra, nota: d.nota ?? null, citas: d.citas, mano: d.mano, confirmada: d.confirmada, cuenta: d.cuenta });
    // La dijo Smarteam y la empresa no la corrigió (18 nov), o es una cuenta con sus cifras (24 nov): adentro lleva «Confirmar».
    const porConfirmar = d.cuenta ? !d.confirmada : !d.confirmada && soloLaDijoSmarteam(d);
    // Una «calculado» lleva la cuenta a la vista, de nota («Con tus cifras · 10 clientes × US$ 85 = US$ 850 al mes»).
    const deLaCuenta = d.cuenta ? { nota: d.cuenta.texto, cuenta: d.cuenta.texto } : {};
    return conCita(
      { id: d.id, cifra: d.cifra, texto: d.texto, ...e, ...deLaCuenta, clave, conNota: conNota && !d.cuenta, dimensionNombre: nombreDeLaParte(d.dimensionId), fecha: noSale ? null : (d.citas[0]?.fecha ?? null), ...(d.mano ? { mano: true } : {}) },
      { citas: [...d.citas], ...(noSale ? { noSale } : {}), ...(porConfirmar ? { porConfirmar: true } : {}) },
    );
  };
  const subequipoVacio = (id: string, nombre: string): SubequipoDeLaPagina => ({
    id,
    nombre,
    claveDelNombre: null,
    organizacion: vacia(),
    bien: vacia(),
    frena: vacia(),
    retos: vacia(),
    cifras: [],
    cifraNueva: null,
    falta: null,
    claveDeLaFalta: null,
  });

  // Las sesiones que se cuentan: las de los equipos que ve el cliente (y las que no tienen equipo). Un Resumen viejo cuyas
  // sesiones no dicen de qué equipo son no sabe cuáles se exploraron: no marca ninguno como pendiente. Tampoco uno donde
  // NINGUNA sesión tiene equipo (Tecnosagot, 13 nov: sus tres sesiones sin marcar traían `areaId: null`, contaban como
  // «con equipos» y Ventas y Marketing salían «Por explorar», con su pestaña apagada, en plena presentación).
  const conEquipos = !!g?.hicimos.sesiones.some((x) => !!x.areaId);
  const hicimos = g
    ? loQueHicimos(
        { ...g.hicimos, sesiones: g.hicimos.sesiones.filter((x) => !x.areaId || deLaPagina.has(x.areaId)) },
        conEquipos ? resultados.map((r) => ({ areaId: r.areaId, nombre: r.areaNombre })) : [],
      )
    : null;
  const exploradas = new Set((hicimos?.areas ?? []).filter((a) => a.sesiones > 0).map((a) => a.areaId));
  /* Una sesión SIN equipo de la escala (sin marcar, o de Dirección) también explora el equipo cuyo contenido la cita (Polaris, 13 nov: Televentas tenía cinco
     hallazgos de las reuniones del 6, 10 y 11 nov y salía «Por explorar», porque solo una de sus nueve sesiones estaba
     marcada, con Marketing). Que un equipo cite una sesión de OTRO equipo no alcanza: puede ser una mención de pasada
     («No se hizo el diagnóstico», Marketing en Centauro). La sesión y la cita se reconocen por su fecha, que es la misma. */
  const sinEquipo = new Set((g?.hicimos.sesiones ?? []).filter((x) => !x.areaId).map((x) => x.fecha));
  const citaUnaSinEquipo = (ps: readonly { citas?: readonly CitaDelResumen[] }[]) => ps.some((p) => (p.citas ?? []).some((c) => sinEquipo.has(c.fecha)));
  if (conEquipos && v2) {
    for (const op of g!.operativas ?? []) if (citaUnaSinEquipo([...op.organizacion, ...op.bien, ...op.frena, ...op.retos, ...op.cifras])) exploradas.add(op.areaId);
  } else if (conEquipos && g) {
    for (const r of resultados) if (citaUnaSinEquipo([...(g.areas[r.areaId]?.hallazgos ?? []), ...g.datosRojos.filter((d) => d.areaId === r.areaId)])) exploradas.add(r.areaId);
  }
  const sinExplorar = g && conEquipos ? resultados.filter((r) => !exploradas.has(r.areaId)).map((r) => r.areaId) : [];

  // Los subequipos de cada equipo de la escala: las áreas operativas (formato 2) o el equipo entero (formato 1).
  const subequipos = new Map<string, SubequipoDeLaPagina[]>();
  const sumar = (areaId: string, s: SubequipoDeLaPagina) => subequipos.set(areaId, [...(subequipos.get(areaId) ?? []), s]);
  if (v2) {
    for (const op of g!.operativas ?? []) {
      if (!deLaPagina.has(op.areaId) || fuera(op.nombre) || sinExplorar.includes(op.areaId)) continue;
      const k = `op:${op.id}`;
      // CUÁNTO CUESTA (20 nov): la primera cifra de dinero que se pierde sale de las cifras y va de titular de la fila.
      const suyas = op.cifras.flatMap((c) => cifra(c, `${k}:cifra:${c.id}`, true) ?? []);
      // Solo una que su cita sostiene: adentro no puede ir de titular un monto que el cliente no verá.
      // Tampoco una cuenta sin confirmar (24 nov): afuera no sale, y adentro la fila tiene que ser la que verá el cliente.
      const iCosto = suyas.findIndex((c) => esCosto(c) && !c.noSale && !(c.cuenta && c.porConfirmar));
      sumar(op.areaId, {
        ...subequipoVacio(op.id, op.nombre || (areaDe(op.areaId)?.nombre ?? "")),
        claveDelNombre: `${k}:nombre`,
        organizacion: lista(op.organizacion, `${k}:org`),
        bien: lista(op.bien, `${k}:bien`),
        frena: lista(op.frena, `${k}:frena`),
        retos: lista(op.retos, `${k}:reto`),
        cifras: iCosto >= 0 ? suyas.filter((_, i) => i !== iCosto) : suyas,
        costo: iCosto >= 0 ? suyas[iCosto] : null,
        falta: op.falta && !fuera(op.falta) ? op.falta : null,
        claveDeLaFalta: `${k}:falta`,
      });
    }
    /* Los retos del TRASPASO (24 nov): lo que un equipo dijo de otro sale también en la primera fila del otro. Se guarda
       UNA vez (en el equipo que lo contó) y en los dos lleva la misma clave: corregirlo o quitarlo en cualquiera de las dos
       pestañas cambia el único que hay. */
    for (const op of g!.operativas ?? []) {
      if (!deLaPagina.has(op.areaId) || fuera(op.nombre) || sinExplorar.includes(op.areaId)) continue;
      for (const r of op.retos) {
        const destino = r.traspaso && r.traspaso !== op.areaId ? subequipos.get(r.traspaso)?.[0] : undefined;
        if (!destino || fuera(r.texto) || destino.retos.piezas.some((x) => paraComparar(x.texto) === paraComparar(r.texto))) continue;
        destino.retos.piezas.push({ ...pieza(r, `op:${op.id}:reto:${r.id}`), id: `${op.id}-${r.id}` });
      }
    }
    /* La pérdida que la empresa validó en la preventa (20 nov): en la primera fila de Ventas. Si esa fila ya tiene un costo
       dicho en las reuniones, la pérdida va primera entre sus cifras: las dos son de la empresa y ninguna tapa a la otra. */
    // Al equipo de SU meta (24 nov, `Meta.equipo`): la de clientes que se van es de Servicio. Sin equipo, Ventas; y si su
    // equipo no tiene fila en la página (sin explorar o sin entrada), también Ventas: una pérdida validada no se pierde.
    const conFila = (areaId: string) => !sinExplorar.includes(areaId) && !!subequipos.get(areaId)?.length && resultados.some((r) => r.areaId === areaId);
    const areaDeLaPerdida = o.perdida?.areaId && conFila(o.perdida.areaId) ? o.perdida.areaId : AREA_DE_VENTAS;
    const primera = o.perdida && conFila(areaDeLaPerdida) ? subequipos.get(areaDeLaPerdida)?.[0] : undefined;
    if (o.perdida?.validada && primera) {
      const p = cifraDeLaPerdida(o.perdida.validada);
      if (primera.costo) primera.cifras = [p, ...primera.cifras];
      else primera.costo = p;
    } else if (o.perdida?.porValidar && primera && !primera.costo && !primera.falta && !g!.operativas?.find((x) => x.id === primera.id)?.faltaMano) {
      // Una cuenta que nadie validó con el cliente: «por validar», con de qué meta sale y sin el monto.
      primera.falta = faltaDeLaPerdida(o.perdida.porValidar);
    }
  } else if (g) {
    for (const r of resultados) {
      sumar(r.areaId, {
        ...subequipoVacio(`a${r.areaId}`, r.areaNombre),
        retos: { piezas: (g.areas[r.areaId]?.hallazgos ?? []).filter((h) => !fuera(h.texto)).map((h) => pieza(h, `hallazgo:${r.areaId}:${h.id}`)), nueva: `hallazgo:${r.areaId}:nuevo` },
        cifras: g.datosRojos.filter((d) => d.areaId === r.areaId).flatMap((d) => cifra(d, `rojo:${d.id}`, false) ?? []),
      });
    }
  }
  // Una tarjeta por equipo de la escala, en su orden: con subequipos, con nivel, o «Por explorar» (sin Resumen, solo las
  // que tienen nivel).
  const tarjetas: TarjetaDeLaPagina[] = resultados.flatMap((r) => {
    const subs = subequipos.get(r.areaId) ?? [];
    const porExplorar = sinExplorar.includes(r.areaId);
    if (!subs.length && !porExplorar && !r.nivel) return [];
    const a = areaDe(r.areaId)!;
    return [{ id: `t${r.areaId}`, areaId: r.areaId, nombre: r.areaNombre, nivel: porExplorar ? null : r.nivel, nivelNombre: porExplorar ? null : r.nivelNombre, conPorque: !porExplorar && !!a.porque, porExplorar, subequipos: porExplorar ? [] : subs }];
  });

  /* «Qué falta validar» (Elías, 11 nov): tres líneas como mucho, en palabras simples. Primero lo que calcula Nexus (un
     equipo sin sesiones, lo que falta confirmar de una parte que ubica el nivel), después lo que escribió el agente o una
     persona. Lo del agente que nombra un equipo sin explorar no se repite (en Centauro, Marketing salía dos veces). */
  const pendientes: PendienteDeLaPagina[] = [];
  // «Conversar con tu equipo de…» ya no sale (24 nov): era texto genérico, y su pestaña ya dice «Por explorar».
  for (const a of areas) {
    if (!a.provisional || sinExplorar.includes(a.areaId)) continue;
    const dims = resultados.find((r) => r.areaId === a.areaId)!.dimensiones.filter((d) => a.provisional!.includes(d.nombre));
    // La línea se edita en su lugar (`confirmar:<parte>`); quitarla la guarda vacía y ya no sale.
    const dim = dims[0];
    const escrito = dim ? g?.confirmar?.[dim.id] : undefined;
    if (escrito === "" || (escrito && fuera(escrito))) continue;
    pendientes.push({
      id: `h${a.areaId}`,
      tipo: "hipotesis",
      texto: escrito ?? `Confirmar cómo trabaja hoy tu equipo en ${nombresEntreComillas(a.provisional)}; con eso terminamos de ubicar ${a.nombre}.`,
      clave: v2 && dim ? `confirmar:${dim.id}` : null,
      areaNombre: a.nombre,
    });
  }
  const nombresSinExplorar = sinExplorar.map((id) => areaDe(id)!.nombre);
  const escritos: PendienteDeLaPagina[] = v2
    ? (g!.pendientes ?? [])
        .filter((p) => !fuera(p.texto) && !(p.areaId && !deLaPagina.has(p.areaId)) && (p.mano || (!(p.areaId && sinExplorar.includes(p.areaId)) && !nombraA(p.texto, nombresSinExplorar) && !DICE_DUDA.test(paraComparar(p.texto)))))
        .map((p) => conCita({ id: p.id, tipo: p.tipo, texto: p.texto, clave: `pendiente:${p.id}`, areaNombre: p.areaId ? (areaDe(p.areaId)?.nombre ?? null) : null, ...(p.mano ? { mano: true } : {}) }, { citas: p.citas }))
    : g
      ? g.falta.filter((p) => !fuera(p.texto) && (p.mano || (!nombraA(p.texto, nombresSinExplorar) && !DICE_DUDA.test(paraComparar(p.texto))))).map((p) => ({ id: p.id, tipo: "por-confirmar" as const, texto: p.texto, clave: `falta:${p.id}`, areaNombre: null, ...(p.mano ? { mano: true } : {}) }))
      : [];
  /* Afuera, tres líneas como mucho (lo de Nexus primero), más lo escrito a mano, que va siempre. Adentro se ve todo, para
     poder quitar lo que sobra. */
  for (const p of escritos) pendientes.push(p);
  const deNexusYDelAgente = pendientes.filter((p) => !p.mano);
  const visibles = o.conCitas ? pendientes : [...deNexusYDelAgente.slice(0, MAX_LINEAS_POR_VALIDAR), ...pendientes.filter((p) => p.mano)];
  pendientes.splice(0, pendientes.length, ...pendientes.filter((p) => visibles.includes(p)));

  // El negocio y el recorrido: solo el formato 2 los tiene.
  /* El resumen de la portada y quién es quién (24 nov) van afuera solo si tienen algo: la foto publicada se compara entera
     (escala-publicada.ts › `mismaPagina`), y dos partes vacías de más decían «Hay cambios que el cliente no ve» en todas
     las escalas publicadas antes, sin que nada hubiera cambiado. */
  const negocio = v2
    ? TIPOS_DEL_NEGOCIO.map((tipo) => ({ tipo, titulo: TITULO_DEL_NEGOCIO[tipo], lista: lista((g!.negocio?.[tipo] ?? []).filter((p) => !fuera(p.texto)), `negocio:${tipo}`) })).filter(
        (x) => o.conCitas || x.lista.piezas.length > 0 || !NACIDAS_EL_24_NOV.includes(x.tipo),
      )
    : null;
  const recorrido = v2
    ? (g!.recorrido ?? [])
        // También su responsable: un equipo que el cliente no ve no sale ni como «quién lo lleva» (revisión del 15 nov).
        .filter((e) => !fuera(`${e.nombre} ${e.texto} ${e.friccion ?? ""} ${e.quien ?? ""}`))
        .map((e) =>
          conCita(
            {
              id: e.id,
              nombre: e.nombre,
              quien: e.quien,
              texto: e.texto,
              friccion: e.friccion,
              icono: e.icono ?? iconoDelPaso(e.nombre, !!e.continuo),
              continuo: !!e.continuo,
              clave: `etapa:${e.id}`,
              ...(e.mano ? { mano: true } : {}),
              // El traspaso al paso siguiente (24 nov): solo si lo hay, así una página de antes no cambia.
              ...(e.traspaso && !e.continuo && !fuera(`${e.traspaso.a} ${e.traspaso.texto} ${e.traspaso.rotulo ?? ""}`)
                ? { traspaso: conCita({ de: e.traspaso.de, a: e.traspaso.a, texto: e.traspaso.texto, cifra: e.traspaso.cifra, rotulo: e.traspaso.rotulo }, { citas: [...e.traspaso.citas] }) }
                : {}),
            },
            { citas: [...e.citas] },
          ),
        )
    : null;
  // Con menos de 3 pasos en línea, el cliente no lo ve (Polaris, 16 nov: 2 pasos y sin su equipo central); adentro sí.
  const recorridoCorto = !!recorrido && recorrido.length > 0 && recorrido.filter((e) => !e.continuo).length < MIN_PASOS_EN_LINEA;
  if (recorridoCorto && !o.conCitas) recorrido!.splice(0);
  const tituloDelRecorrido = v2 && g!.tituloDelRecorrido?.texto && !fuera(g!.tituloDelRecorrido.texto) && !(recorridoCorto && !o.conCitas) ? g!.tituloDelRecorrido.texto : null;
  // El tamaño del negocio en grande (forma editorial): su número, su rótulo y cómo se sabe (la misma regla que una cifra).
  const piezaDelTamano = v2 ? (g!.negocio?.tamano ?? []).find((p) => !fuera(p.texto)) : undefined;
  const tamano = piezaDelTamano
    ? (() => {
        const { valor, rotulo } = partirElTamano(piezaDelTamano.texto);
        // La misma vara que una cifra (revisión del 15 nov): un número que su cita no dice no sale al cliente; adentro sale
        // con el porqué, para corregirlo.
        // Con un número en cualquier parte («Aproximadamente 900 clientes»), la misma vara.
        const noSale = valor || /\d/.test(rotulo) ? porQueNoSaleLaCifra({ cifra: valor, texto: rotulo, nota: null, citas: piezaDelTamano.citas }) : null;
        if (noSale && !o.conCitas) return null;
        const { estado } = estadoDeLaCifra({ estado: "declarado", cifra: valor, nota: null, citas: piezaDelTamano.citas, mano: piezaDelTamano.mano });
        return conCita({ valor, rotulo, estado, clave: `negocio:tamano:${piezaDelTamano.id}` }, { citas: [...piezaDelTamano.citas], ...(noSale ? { noSale } : {}) });
      })()
    : null;

  // Los puntos clave (18 nov): sin los de un equipo que el cliente no ve ni los que lo nombran. Uno sin título no sale afuera.
  const puntos: PuntoDeLaPagina[] = v2
    ? (g!.puntos ?? [])
        // Ni uno de un equipo sin explorar, ni uno que lo nombre (su tarjeta dice «Por explorar»: la página se contradiría).
        .filter(
          (p) =>
            !fuera(`${p.titulo} ${p.texto}`) &&
            !(p.areaId && !deLaPagina.has(p.areaId)) &&
            (p.mano || (!(p.areaId && sinExplorar.includes(p.areaId)) && !nombraA(`${p.titulo} ${p.texto}`, nombresSinExplorar))) &&
            (o.conCitas || !!p.titulo),
        )
        .map((p) =>
          conCita(
            { id: p.id, titulo: p.titulo, texto: p.texto, clave: `punto:${p.id}`, areaNombre: p.areaId ? (areaDe(p.areaId)?.nombre ?? null) : null, ...(p.mano ? { mano: true } : {}) },
            { citas: [...p.citas] },
          ),
        )
    : [];
  // La escala cambió desde que se armó: alguna firma de los niveles es otra (solo adentro).
  const escalaCambio = !!g?.firmas && resultados.some((r) => g.firmas![r.areaId] !== undefined && g.firmas![r.areaId] !== firmaDelArea(chequeo, r.areaId, entorno));
  const datosRojos = v2
    ? []
    : tarjetas.flatMap((t) => t.subequipos.flatMap((s) => s.cifras.map((c) => ({ id: c.id, cifra: c.cifra, texto: c.texto, areaId: t.areaId, areaNombre: t.nombre, dimensionNombre: c.dimensionNombre, fecha: c.fecha, ...(o.conCitas ? { citas: c.citas, ...(c.noSale ? { noSale: c.noSale } : {}) } : {}), ...(c.mano ? { mano: true } : {}) }))));
  return {
    at: g?.at ?? null,
    formato: v2 || !g ? 2 : 1,
    hicimos,
    negocio,
    recorrido,
    etapaNueva: v2 ? "etapa:nuevo" : null,
    tamano,
    tituloDelRecorrido,
    claveDelTituloDelRecorrido: v2 ? "recorrido:titulo" : null,
    tarjetas,
    pendientes,
    pendienteNuevo: v2 ? "pendiente:nuevo" : g ? "falta:nuevo" : null,
    // «¿Entendimos bien?» ya no sale (Elías, 11 nov).
    entendimos: [],
    sinExplorar,
    areas,
    datosRojos,
    falta: v2 ? [] : (g?.falta ?? []).filter((p) => !fuera(p.texto)),
    /* Solo si hay: una página publicada antes del 18 nov no tiene estas claves, y con ellas vacías «Publicar» diría «Hay
       cambios que el cliente no ve» en todas las escalas sin que nada cambiara. Agregar un punto es solo de adentro. */
    ...(puntos.length ? { puntos } : {}),
    // El título del entregable y el dolor de cada equipo (24 nov): una foto publicada antes no lo trae y se pinta como se publicó.
    formaDeLaPortada: FORMA_DE_LA_PORTADA,
    ...(o.conCitas ? { puntoNuevo: v2 ? "punto:nuevo" : null, escalaCambio, avisos: conElAvisoDelRecorrido(sinAvisosResueltos(g), recorrido), malLeidas: g?.malLeidas ?? [], ...(g?.leidasEnteras ? { leidasEnteras: true } : {}) } : {}),
  };
}

// ── Editar en su lugar ──────────────────────────────────────────────────────────

/**
 * Qué texto se edita. Los dos formatos: `hicimos` · `porque:<área>` · `entendimos:<id>` (o `:nuevo`). Formato 1:
 * `rojo:<id>(:cifra|:texto)` · `hallazgo:<área>:<id|nuevo>` · `falta:<id|nuevo>`. Formato 2: `negocio:<tipo>:<id|nuevo>` ·
 * `etapa:<id>(:nombre|:texto|:friccion)` (o `etapa:nuevo`) · `op:<id>(:nombre|:falta)` · `op:<id>:(org|bien|frena|reto):<id|nuevo>`
 * · `op:<id>:cifra:<id>(:cifra|:texto|:nota|:confirmar)` · `pendiente:<id|nuevo>` · `punto:<id>(:titulo|:texto)` (o
 * `punto:nuevo`, 18 nov). Sin campo, quita la pieza. `:confirmar` confirma una cifra que dijo Smarteam (queda «Lo dijiste tú»).
 */
const ID = "[\\w-]{1,20}";
export const CLAVE_DEL_RESUMEN = new RegExp(
  `^(hicimos|recorrido:titulo|rojo:${ID}(:cifra|:texto)?|hallazgo:\\d{1,4}:${ID}|porque:\\d{1,4}|(entendimos|falta|pendiente):${ID}|confirmar:\\d{1,2}\\.\\d{1,2}|negocio:(${TIPOS_DEL_NEGOCIO.join("|")}):${ID}|etapa:${ID}(:nombre|:texto|:friccion|:traspaso)?|punto:${ID}(:titulo|:texto)?|op:${ID}(:nombre|:falta|:(org|bien|frena|reto):${ID}|:cifra:${ID}(:cifra|:texto|:nota|:confirmar)?)?)$`,
);

/** Lo que mide una clave de lo quitado: corta, para que la lectura del Json nunca la rechace. */
const LARGO_DE_UNA_CLAVE = 160;

type TipoDeQuitado = "rojo" | "hallazgo" | "entendimos" | "falta" | "pieza" | "area";

/**
 * Cómo se reconoce, al rehacer, algo que una persona quitó (revisión del 9 nov: el agente lo vuelve a escribir con otras
 * palabras). Una cifra, por su cifra Y por la cita de la que nació; un hallazgo o una pieza, por su cita (o su texto, si no
 * tiene); un área operativa, por su nombre; una pregunta, por su texto (y se compara por parecido: `pareceQuitada`).
 */
export function clavesDeQuitado(tipo: TipoDeQuitado, x: { cifra?: string; texto: string; citas?: readonly CitaDelResumen[]; origen?: string }, donde = ""): string[] {
  const origen = x.citas ? origenDe({ origen: x.origen, citas: x.citas }) : x.origen;
  const corta = (k: string) => k.slice(0, LARGO_DE_UNA_CLAVE);
  if (tipo === "rojo") return [corta(`rojo:${paraComparar(x.cifra ?? "")}`), ...(origen ? [corta(`cita:${origen}`)] : [])];
  if (tipo === "hallazgo") return [corta(origen ? `cita:${origen}` : `${tipo}:${paraComparar(x.texto)}`)];
  // Una pieza del formato 2, por su parte (`donde`): quitar «lo que ya hace bien» no se lleva la etapa que cita el mismo turno.
  if (tipo === "pieza") return [corta(`${donde}|${origen ? `cita:${origen}` : paraComparar(x.texto)}`)];
  return [corta(`${tipo}:${paraComparar(x.texto)}`)];
}

/** Dos textos dicen lo mismo con otras palabras: comparten la mayoría de sus palabras con contenido (Jaccard ≥ 0,6). */
function parecidos(a: string, b: string): boolean {
  const ps = (x: string) => new Set(paraComparar(x).split(" ").filter((p) => p.length >= 4));
  const A = ps(a);
  const B = ps(b);
  if (!A.size || !B.size) return paraComparar(a) === paraComparar(b);
  const comunes = [...A].filter((p) => B.has(p)).length;
  return comunes / (A.size + B.size - comunes) >= 0.6;
}

/** ¿Esto lo quitó una persona? Por clave exacta; una pregunta, también por parecido con una quitada. */
export function pareceQuitada(tipo: TipoDeQuitado, x: Parameters<typeof clavesDeQuitado>[1], quitados: readonly string[], donde = ""): boolean {
  const claves = clavesDeQuitado(tipo, x, donde);
  if (claves.some((k) => quitados.includes(k))) return true;
  if (tipo !== "entendimos" && tipo !== "falta") return false;
  return quitados.some((k) => (k.startsWith(`${tipo}:`) || (tipo === "falta" && k.startsWith("pendiente:"))) && parecidos(k.slice(k.indexOf(":") + 1), x.texto));
}

const quitar = (g: ResumenGuardado, claves: readonly string[]): ResumenGuardado => ({
  ...g,
  quitados: [...(g.quitados ?? []).filter((k) => !claves.includes(k)), ...claves].slice(-MAX_QUITADOS),
});

type Resultado = { ok: true; resumen: ResumenGuardado } | { ok: false; error: string };

/**
 * Una lista de piezas con cita: `id` «nuevo» agrega una escrita a mano; sin texto, quita (y recuerda que se quitó); con
 * texto, la cambia. Si el texto nuevo trae un número que su cita no dice, la cita se va (queda el origen).
 */
function editarUnaLista<T extends PiezaDelResumen>(
  ps: readonly T[],
  id: string,
  texto: string,
  nueva: (id: string) => T,
  tipo: TipoDeQuitado,
  donde = "",
): { ok: true; lista: T[]; quitadas: string[] } | { ok: false; error: string } {
  if (id === "nuevo") {
    if (!texto) return { ok: true, lista: [...ps], quitadas: [] };
    if (ps.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA} en esta lista: quita uno antes de agregar otro.` };
    return { ok: true, lista: [...ps, nueva(id)], quitadas: [] };
  }
  const p = ps.find((x) => x.id === id);
  if (!p) return { ok: false, error: "Ese texto ya no está." };
  if (!texto) return { ok: true, lista: ps.filter((x) => x.id !== id), quitadas: clavesDeQuitado(tipo, p, donde) };
  const sigue = !cifrasDeMas(texto, p.citas.map((c) => c.texto).join(" ")).length;
  return { ok: true, lista: ps.map((x) => (x.id === id ? { ...x, texto, mano: true, origen: origenDe(x), citas: sigue ? x.citas : [] } : x)), quitadas: [] };
}

/**
 * Aplica una edición. `texto` null o vacío: quita (una pieza, un dato, una etapa, un área) o vuelve al de los datos (lo
 * que hicimos, el por qué). Lo editado queda `mano`. Devuelve el resumen nuevo o por qué no.
 */
export function editarElResumen(g: ResumenGuardado, clave: string, crudo: string | null, o: { firmaDe: (areaId: string) => string; areas: ReadonlySet<string>; en: string }): Resultado {
  if (!CLAVE_DEL_RESUMEN.test(clave)) return { ok: false, error: "No se reconoce ese texto del Resumen." };
  const texto = crudo?.replace(/[ \t]+/g, " ").trim() ?? "";
  // El botón «Quitar…» del cuadro manda null con la clave del campo (`op:o1:cifra:c2:texto`): quita la pieza entera.
  const quitarLaPieza = crudo === null;
  const partes = clave.split(":");
  const [tipo, a, b] = partes;
  const ultimo = partes[partes.length - 1];
  const tope = ultimo === "cifra" && partes.length > 2 ? TOPE_DE_LA_CIFRA : ultimo === "nombre" ? TOPE_DE_UN_NOMBRE : TOPE_A_MANO;
  if (texto.length > tope) return { ok: false, error: `El texto pasa de ${tope} caracteres.` };
  const nuevoId = (prefijo: string) => `${prefijo}m${Date.parse(o.en).toString(36)}`.slice(0, 20);
  const aMano = (prefijo: string): PiezaDelResumen => ({ id: nuevoId(prefijo), texto, citas: [], mano: true });
  switch (tipo) {
    case "hicimos":
      return { ok: true, resumen: { ...g, hicimos: { ...g.hicimos, texto: texto || null } } };
    case "recorrido":
      // El título del recorrido: vacío vuelve al de siempre (y «Rehacer con IA» no lo pisa: queda `mano`).
      if (texto.length > TOPE_DEL_TITULO_DEL_RECORRIDO) return { ok: false, error: `El título pasa de ${TOPE_DEL_TITULO_DEL_RECORRIDO} caracteres.` };
      return { ok: true, resumen: { ...g, tituloDelRecorrido: texto ? { texto, mano: true } : { texto: "", mano: true } } };
    case "rojo": {
      const d = g.datosRojos.find((x) => x.id === a);
      if (!d) return { ok: false, error: "Ese dato ya no está." };
      if (!b || !texto) {
        if (b === "cifra" || (b === "texto" && texto)) return { ok: false, error: "La cifra no puede quedar vacía." };
        return { ok: true, resumen: quitar({ ...g, datosRojos: g.datosRojos.filter((x) => x.id !== a) }, clavesDeQuitado("rojo", d)) };
      }
      // La cita se queda aunque ya no diga lo escrito: si no lo sostiene, la cifra no sale al cliente y adentro sale marcada
      // (`porQueNoSaleLaCifra`, Elías 9 nov); al corregirla con lo que dijo la empresa, vuelve a salir.
      const cambiado = { ...d, [b]: texto, mano: true, origen: origenDe(d) };
      return { ok: true, resumen: { ...g, datosRojos: g.datosRojos.map((x) => (x.id === a ? cambiado : x)) } };
    }
    case "hallazgo": {
      if (!o.areas.has(a)) return { ok: false, error: `El área ${a} no existe.` };
      const area = g.areas[a] ?? { hallazgos: [], porque: null };
      const r = editarUnaLista(area.hallazgos, b, texto, () => ({ id: nuevoId(`h${a}-`), texto, dimensionId: null, citas: [], mano: true }), "hallazgo");
      if (!r.ok) return r;
      return { ok: true, resumen: quitar({ ...g, areas: { ...g.areas, [a]: { ...area, hallazgos: r.lista } } }, r.quitadas) };
    }
    case "porque": {
      if (!o.areas.has(a)) return { ok: false, error: `El área ${a} no existe.` };
      const area = g.areas[a] ?? { hallazgos: [], porque: null };
      return { ok: true, resumen: { ...g, areas: { ...g.areas, [a]: { ...area, porque: texto ? { texto, firma: o.firmaDe(a), mano: true } : null } } } };
    }
    case "entendimos":
    case "falta": {
      const lista = g[tipo];
      if (a === "nuevo") {
        if (!texto) return { ok: true, resumen: g };
        if (lista.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA}: quita una antes de agregar otra.` };
        return { ok: true, resumen: { ...g, [tipo]: [...lista, { id: nuevoId(tipo[0]), texto, mano: true }] } };
      }
      const p = lista.find((x) => x.id === a);
      if (!p) return { ok: false, error: "Esa pregunta ya no está." };
      if (!texto) return { ok: true, resumen: quitar({ ...g, [tipo]: lista.filter((x) => x.id !== a) }, clavesDeQuitado(tipo, p)) };
      return { ok: true, resumen: { ...g, [tipo]: lista.map((x) => (x.id === a ? { ...x, texto, mano: true } : x)) } };
    }
    case "confirmar": {
      // Lo que falta confirmar de una parte por explorar: se cambia, o se quita (queda vacío y la línea ya no sale).
      const dim = partes.slice(1).join(":");
      return { ok: true, resumen: { ...g, confirmar: { ...g.confirmar, [dim]: texto }, confirmarMano: [...new Set([...(g.confirmarMano ?? []), dim])] } };
    }
    case "pendiente": {
      const lista = g.pendientes ?? [];
      if (a === "nuevo") {
        if (!texto) return { ok: true, resumen: g };
        if (lista.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA}: quita uno antes de agregar otro.` };
        return { ok: true, resumen: { ...g, pendientes: [...lista, { id: nuevoId("p"), tipo: "sin-dato", texto, areaId: null, citas: [], mano: true }] } };
      }
      const p = lista.find((x) => x.id === a);
      if (!p) return { ok: false, error: "Ese pendiente ya no está." };
      if (!texto) return { ok: true, resumen: quitar({ ...g, pendientes: lista.filter((x) => x.id !== a) }, clavesDeQuitado("falta", p)) };
      return { ok: true, resumen: { ...g, pendientes: lista.map((x) => (x.id === a ? { ...x, texto, mano: true } : x)) } };
    }
    case "negocio": {
      const tipoDelNegocio = a as TipoDelNegocio;
      const yaHay = (g.negocio?.[tipoDelNegocio] ?? []).length;
      if (b === "nuevo" && texto && yaHay >= maxDelNegocio(tipoDelNegocio) && PARTES_ENTERAS.includes(tipoDelNegocio))
        return {
          ok: false,
          error:
            tipoDelNegocio === "etiquetas"
              ? `Ya hay ${MAX_ETIQUETAS} etiquetas: cambia o quita una.`
              : maxDelNegocio(tipoDelNegocio) > 1
                ? `Ya hay ${maxDelNegocio(tipoDelNegocio)}: cambia o quita una.`
                : "Ya hay una: cámbiala en su lugar.",
        };
      const r = editarUnaLista(g.negocio?.[tipoDelNegocio] ?? [], b, texto, () => aMano("n"), "pieza", `negocio:${tipoDelNegocio}`);
      if (!r.ok) return r;
      return { ok: true, resumen: quitar({ ...g, negocio: { ...g.negocio, [tipoDelNegocio]: r.lista } }, r.quitadas) };
    }
    case "punto": {
      const puntos = g.puntos ?? [];
      if (a === "nuevo") {
        if (!texto) return { ok: true, resumen: g };
        if (puntos.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA} puntos: quita uno antes de agregar otro.` };
        if (texto.length > TOPE_DEL_TITULO_DEL_PUNTO) return { ok: false, error: `El título pasa de ${TOPE_DEL_TITULO_DEL_PUNTO} caracteres.` };
        // Uno nuevo nace con su título; lo que explica se escribe después, en su lugar.
        return { ok: true, resumen: { ...g, puntos: [...puntos, { id: nuevoId("k"), titulo: texto, texto: "", areaId: null, citas: [], mano: true }] } };
      }
      const p = puntos.find((x) => x.id === a);
      if (!p) return { ok: false, error: "Ese punto ya no está." };
      if (!b || quitarLaPieza) {
        if (texto && !b) return { ok: false, error: "Elige qué parte del punto cambias." };
        return { ok: true, resumen: quitar({ ...g, puntos: puntos.filter((x) => x.id !== a) }, clavesDeQuitado("pieza", p, "punto")) };
      }
      if (b === "titulo" && !texto) return { ok: false, error: "El punto necesita un título." };
      if (b === "titulo" && texto.length > TOPE_DEL_TITULO_DEL_PUNTO) return { ok: false, error: `El título pasa de ${TOPE_DEL_TITULO_DEL_PUNTO} caracteres.` };
      const cambiado = { ...p, [b]: texto, mano: true, origen: origenDe(p) };
      const sigue = !cifrasDeMas(`${cambiado.titulo} ${cambiado.texto}`, p.citas.map((c) => c.texto).join(" ")).length;
      return { ok: true, resumen: { ...g, puntos: puntos.map((x) => (x.id === a ? { ...cambiado, citas: sigue ? p.citas : [] } : x)) } };
    }
    case "etapa": {
      const etapas = g.recorrido ?? [];
      if (a === "nuevo") {
        if (!texto) return { ok: true, resumen: g };
        if (etapas.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA} etapas: quita una antes de agregar otra.` };
        return { ok: true, resumen: { ...g, recorrido: [...etapas, { id: nuevoId("s"), nombre: texto.slice(0, TOPE_DE_UN_NOMBRE), quien: null, texto: "", friccion: null, citas: [], mano: true }] } };
      }
      const e = etapas.find((x) => x.id === a);
      if (!e) return { ok: false, error: "Esa etapa ya no está." };
      if (!b || (b === "texto" && quitarLaPieza)) {
        if (texto && !b) return { ok: false, error: "Elige qué parte de la etapa cambias." };
        return { ok: true, resumen: quitar({ ...g, recorrido: etapas.filter((x) => x.id !== a) }, clavesDeQuitado("pieza", e, "etapa")) };
      }
      // El traspaso al paso siguiente (24 nov): se corrige su texto o se quita (vacío), sin tocar la etapa.
      if (b === "traspaso") {
        if (!e.traspaso) return { ok: false, error: "Ese paso no tiene traspaso." };
        const { traspaso, ...sinTraspaso } = e;
        const cambiada = texto ? { ...e, traspaso: { ...traspaso, texto }, mano: true, origen: origenDe(e) } : { ...sinTraspaso, mano: true, origen: origenDe(e) };
        return { ok: true, resumen: { ...g, recorrido: etapas.map((x) => (x.id === a ? cambiada : x)) } };
      }
      if (b === "nombre" && !texto) return { ok: false, error: "La etapa necesita un nombre." };
      const cambiada = { ...e, [b]: b === "friccion" ? texto || null : texto, mano: true, origen: origenDe(e) };
      const sigue = !cifrasDeMas(`${cambiada.nombre} ${cambiada.texto} ${cambiada.friccion ?? ""}`, e.citas.map((c) => c.texto).join(" ")).length;
      return { ok: true, resumen: { ...g, recorrido: etapas.map((x) => (x.id === a ? { ...cambiada, citas: sigue ? e.citas : [] } : x)) } };
    }
    case "op": {
      const ops = g.operativas ?? [];
      const op = ops.find((x) => x.id === a);
      if (!op) return { ok: false, error: "Esa área ya no está." };
      const conOp = (nueva: AreaOperativa, quitadas: string[] = []) => quitar({ ...g, operativas: ops.map((x) => (x.id === a ? nueva : x)) }, quitadas);
      if (!b || (b === "nombre" && quitarLaPieza)) {
        if (texto && !b) return { ok: false, error: "Elige qué parte del área cambias." };
        return { ok: true, resumen: quitar({ ...g, operativas: ops.filter((x) => x.id !== a) }, clavesDeQuitado("area", { texto: op.nombre })) };
      }
      if (b === "nombre") {
        if (!texto) return { ok: false, error: "El área necesita un nombre." };
        return { ok: true, resumen: conOp({ ...op, nombre: texto, nombreMano: true, nombreDelAgente: op.nombreDelAgente ?? op.nombre }) };
      }
      if (b === "falta") return { ok: true, resumen: conOp({ ...op, falta: texto || null, faltaMano: true }) };
      if (b === "cifra") {
        const [, , , id, campo] = partes;
        const c = op.cifras.find((x) => x.id === id);
        if (!c) return { ok: false, error: "Esa cifra ya no está." };
        // «Confirmar» (18 nov): una cifra que dijo Smarteam y la empresa no corrigió pasa a ser suya. Sin la nota de por confirmar.
        // Una «calculado» (24 nov) sigue calculada: confirmarla es lo que la deja salir al cliente.
        if (campo === "confirmar")
          return {
            ok: true,
            resumen: conOp({ ...op, cifras: op.cifras.map((x) => (x.id !== id ? x : x.cuenta ? { ...x, confirmada: true, mano: true, origen: origenDe(x) } : { ...x, confirmada: true, estado: "declarado" as const, nota: null, mano: true, origen: origenDe(x) })) }),
          };
        if (!campo || (campo === "texto" && quitarLaPieza)) {
          if (texto && !campo) return { ok: false, error: "Elige qué parte de la cifra cambias." };
          return { ok: true, resumen: conOp({ ...op, cifras: op.cifras.filter((x) => x.id !== id) }, clavesDeQuitado("rojo", c)) };
        }
        if (!texto && campo !== "nota") return { ok: false, error: "La cifra no puede quedar vacía." };
        // La cita se queda aunque ya no diga lo escrito: afuera no sale y adentro sale marcada (`porQueNoSaleLaCifra`).
        const cambiada: CifraDelResumen = { ...c, [campo]: campo === "nota" ? texto || null : texto, mano: true, origen: origenDe(c) };
        // Cambiar el número de una cuenta (24 nov) la deja de ser: ya no es lo que dan sus cifras, y sale por confirmar.
        if (c.cuenta && campo === "cifra") {
          delete cambiada.cuenta;
          delete cambiada.confirmada;
          cambiada.estado = "pendiente";
        }
        return { ok: true, resumen: conOp({ ...op, cifras: op.cifras.map((x) => (x.id === id ? cambiada : x)) }) };
      }
      const campoDeLista = ({ org: "organizacion", bien: "bien", frena: "frena", reto: "retos" } as const)[b as "org" | "bien" | "frena" | "reto"];
      const [, , , id] = partes;
      if (campoDeLista === "retos") {
        const r = editarUnaLista(op.retos, id, texto, () => ({ ...aMano("t"), dimensionId: null }), "pieza", "reto");
        if (!r.ok) return r;
        return { ok: true, resumen: conOp({ ...op, retos: r.lista }, r.quitadas) };
      }
      const r = editarUnaLista(op[campoDeLista], id, texto, () => aMano(b[0]), "pieza", b);
      if (!r.ok) return r;
      return { ok: true, resumen: conOp({ ...op, [campoDeLista]: r.lista }, r.quitadas) };
    }
  }
  return { ok: false, error: "No se reconoce ese texto del Resumen." };
}

/**
 * Los ids de lo que escribió el agente, marcados con la corrida (`o1-k3x9`): una pantalla que quedó abierta con el Resumen
 * anterior no puede editar ni quitar, por el id, otra pieza que tomó su lugar (revisión del 9 nov). Responde «ya no está».
 * Las piezas de un área operativa no hace falta marcarlas: su clave lleva el id del área.
 */
export function conIdsDeLaCorrida<T extends Pick<LoQueEscribioElAgente, "negocio" | "recorrido" | "operativas" | "pendientes" | "entendimos"> & { puntos?: PuntoClave[] }>(e: T, marca: string): T {
  const m = (id: string) => `${id}-${marca}`.slice(0, 20);
  const conM = <X extends { id: string }>(xs: readonly X[]) => xs.map((x) => ({ ...x, id: m(x.id) }));
  return {
    ...e,
    negocio: Object.fromEntries(Object.entries(e.negocio).map(([k, ps]) => [k, conM(ps ?? [])])),
    recorrido: conM(e.recorrido),
    operativas: conM(e.operativas),
    pendientes: conM(e.pendientes),
    entendimos: conM(e.entendimos),
    ...(e.puntos ? { puntos: conM(e.puntos) } : {}),
  };
}

/** Lo de la persona primero; lo nuevo después, sin lo repetido y con otro id si choca con uno de ella. */
function junto<T extends { id: string; mano?: boolean }>(viejos: readonly T[], nuevos: readonly T[], repetido: (a: T, b: T) => boolean = () => false): T[] {
  const mano = viejos.filter((x) => x.mano);
  const ids = new Set(mano.map((x) => x.id));
  const otro = (id: string) => {
    let i = 2;
    while (ids.has(`${id}-${i}`)) i++;
    return `${id}-${i}`;
  };
  const resto = nuevos
    .filter((n) => !mano.some((m) => repetido(m, n)))
    .map((n) => {
      const id = ids.has(n.id) ? otro(n.id) : n.id;
      ids.add(id);
      return id === n.id ? n : { ...n, id };
    });
  return [...mano, ...resto];
}

// Lo que la persona corrigió no vuelve con el valor del agente: la misma pieza es la misma cita de origen.
const mismoOrigen = (a: { origen?: string; citas: readonly CitaDelResumen[] }, b: { origen?: string; citas: readonly CitaDelResumen[] }) => !!origenDe(a) && origenDe(a) === origenDe(b);
const mismaCifra = (a: { cifra: string; origen?: string; citas: readonly CitaDelResumen[] }, b: { cifra: string; origen?: string; citas: readonly CitaDelResumen[] }) =>
  paraComparar(a.cifra) === paraComparar(b.cifra) || mismoOrigen(a, b) || mismoPrimerNumero(a.cifra, b.cifra);

/**
 * La tesis, las etiquetas y el tamaño (forma editorial) se rehacen o se quedan ENTEROS: si una persona cambió, agregó o
 * quitó alguna, quedan como los dejó (revisión del 15 nov: las tres etiquetas salen de la misma cita, así que juntarlas
 * pieza por pieza borraba las otras al rehacer). Para cambiarlas otra vez, se editan. Lo mismo el resumen de la portada y
 * quién es quién (24 nov): se leen enteros, de arriba abajo.
 */
const PARTES_ENTERAS: readonly TipoDelNegocio[] = ["tesis", "etiquetas", "tamano", "portada", "quienes"];
/** Las partes del negocio que nacieron el 24 nov: afuera, sin piezas, no van (`resumenParaLaPagina`). */
const NACIDAS_EL_24_NOV: readonly TipoDelNegocio[] = ["portada", "quienes"];
const laTocoUnaPersona = (g: ResumenGuardado, tipo: TipoDelNegocio) =>
  (g.negocio?.[tipo] ?? []).some((p) => p.mano) || (g.quitados ?? []).some((k) => k.startsWith(`negocio:${tipo}|`));

/** Una pieza guardada cuyas citas se vuelven a encontrar, con la misma vara, en las reuniones que leyó esta corrida. */
function sigueEnLasReuniones(p: PiezaDelResumen, reuniones: readonly ReunionParaElResumen[]): boolean {
  if (!p.citas.length) return !!p.mano;
  return p.citas.every((c) => {
    const r = reuniones.find((x) => x.id === c.reunion);
    return !!r && !!citaVerificada({ reunion: r.clave, turno: c.turno, texto: c.texto }, reuniones);
  });
}

/** Las piezas de una parte (`donde`) que una persona no quitó. */
const sinQuitadas = <T extends PiezaDelResumen>(xs: readonly T[], quitados: readonly string[], donde: string) => xs.filter((x) => !pareceQuitada("pieza", x, quitados, donde));

/** Un Resumen del formato 1 con algo escrito a mano: lo de la persona pasa al formato 2 en la tarjeta de su equipo. */
function loDelFormato1(antes: ResumenGuardado, nuevo: ResumenGuardado): AreaOperativa[] {
  // Copias: lo de la persona no puede entrar en las áreas de `nuevo`, que la corrida guarda como lo que escribió la IA.
  const ops = (nuevo.operativas ?? []).map((x) => ({ ...x }));
  const deSuEquipo = (areaId: string) => {
    let op = ops.find((x) => x.areaId === areaId);
    if (!op) {
      op = { id: `o${areaId}m`, nombre: "", areaId, organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null };
      ops.push(op);
    }
    return op;
  };
  for (const [areaId, a] of Object.entries(antes.areas)) {
    for (const h of a.hallazgos.filter((x) => x.mano)) {
      const op = deSuEquipo(areaId);
      op.retos = [...op.retos, { id: `${h.id}`.slice(0, 20), texto: h.texto, citas: h.citas, mano: true, origen: h.origen, dimensionId: h.dimensionId }];
    }
  }
  for (const d of antes.datosRojos.filter((x) => x.mano)) {
    const op = deSuEquipo(d.areaId);
    op.cifras = [...op.cifras, { id: d.id, cifra: d.cifra, texto: d.texto, citas: d.citas, mano: true, origen: d.origen, dimensionId: d.dimensionId, estado: "declarado", nota: null }];
  }
  // Un área nueva solo para lo de la persona lleva el nombre de su equipo de la escala (lo pone la página si queda vacío).
  return ops.filter((x) => x.nombre || x.retos.length || x.cifras.length);
}

/**
 * «Rehacer con IA» sobre lo que hay: lo nuevo del agente, más lo que una persona escribió o cambió (`mano`), que no se
 * pisa; lo que quitó, no vuelve. Un Resumen del formato 1 que se rehace pasa al 2 con lo de la persona adentro.
 */
export function juntarConLoEditado(
  nuevo: ResumenGuardado,
  antes: ResumenGuardado | null | undefined,
  /**
   * Las reuniones que leyó esta corrida: una pieza obligatoria de antes vuelve solo si sus citas siguen en ellas (una
   * reunión que pasó a otra empresa o se limpió por traer el texto de otra no puede sostener el titular). Sin ellas, vuelve.
   */
  reuniones?: readonly ReunionParaElResumen[],
): ResumenGuardado {
  if (!antes) return nuevo;
  const quitados = antes.quitados ?? [];
  const conQuitados = antes.quitados?.length ? { quitados: antes.quitados } : {};
  const porque = (id: string, n: AreaDelResumenGuardada | undefined) => (antes.areas[id]?.porque?.mano ? antes.areas[id].porque : (n?.porque ?? null));

  if (nuevo.v === 2) {
    const areas: Record<string, AreaDelResumenGuardada> = { ...nuevo.areas };
    for (const id of Object.keys(antes.areas)) areas[id] = { hallazgos: [], porque: porque(id, areas[id]) };
    // Lo del formato 1 escrito a mano entra en la tarjeta de su equipo; si no, lo nuevo junto con lo de la persona.
    let operativas = antes.v === 2 ? (nuevo.operativas ?? []) : loDelFormato1(antes, nuevo);
    operativas = operativas
      .filter((op) => !pareceQuitada("area", { texto: op.nombre }, quitados))
      .map((op) => ({
        ...op,
        organizacion: sinQuitadas(op.organizacion, quitados, "org"),
        bien: sinQuitadas(op.bien, quitados, "bien"),
        frena: sinQuitadas(op.frena, quitados, "frena"),
        // Un hallazgo quitado en el formato 1 (`cita:<origen>`) tampoco vuelve como reto.
        retos: sinQuitadas(op.retos, quitados, "reto").filter((r) => !pareceQuitada("hallazgo", r, quitados)),
        cifras: op.cifras.filter((c) => !pareceQuitada("rojo", c, quitados)),
      }));
    if (antes.v === 2) {
      const mismas = (x: AreaOperativa, y: AreaOperativa) => x.id === y.id || paraComparar(x.nombre) === paraComparar(y.nombreDelAgente ?? y.nombre);
      for (const viejo of antes.operativas ?? []) {
        const conMano = viejo.nombreMano || viejo.faltaMano || [viejo.organizacion, viejo.bien, viejo.frena, viejo.retos, viejo.cifras].some((l) => l.some((p) => p.mano));
        if (!conMano) continue;
        const i = operativas.findIndex((x) => mismas(x, viejo));
        const base = i >= 0 ? operativas[i] : { ...viejo, organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null, faltaMano: undefined, nombreMano: undefined };
        const juntada: AreaOperativa = {
          ...base,
          nombre: viejo.nombreMano ? viejo.nombre : base.nombre,
          ...(viejo.nombreMano ? { nombreMano: true, nombreDelAgente: viejo.nombreDelAgente } : {}),
          falta: viejo.faltaMano ? viejo.falta : base.falta,
          ...(viejo.faltaMano ? { faltaMano: true } : {}),
          organizacion: junto(viejo.organizacion, base.organizacion, mismoOrigen).slice(0, MAX_POR_LISTA),
          bien: junto(viejo.bien, base.bien, mismoOrigen).slice(0, MAX_POR_LISTA),
          frena: junto(viejo.frena, base.frena, mismoOrigen).slice(0, MAX_POR_LISTA),
          retos: junto(viejo.retos, base.retos, mismoOrigen).slice(0, MAX_POR_LISTA),
          cifras: junto(viejo.cifras, base.cifras, mismaCifra).slice(0, Math.max(MAX_CIFRAS_POR_AREA, viejo.cifras.filter((c) => c.mano).length)),
        };
        operativas = i >= 0 ? operativas.map((x, k) => (k === i ? juntada : x)) : [...operativas, juntada];
      }
    }
    // El recorrido: lo de la persona en su lugar (reemplaza la etapa nueva de la misma cita o del mismo nombre).
    let recorrido = sinQuitadas(nuevo.recorrido ?? [], quitados, "etapa");
    for (const [k, e] of (antes.recorrido ?? []).entries()) {
      if (!e.mano) continue;
      // La misma etapa: primero por su nombre; si no, por la cita de la que nació.
      const porNombre = recorrido.findIndex((x) => paraComparar(x.nombre) === paraComparar(e.nombre));
      const i = porNombre >= 0 ? porNombre : recorrido.findIndex((x) => mismoOrigen(x, e));
      recorrido = i >= 0 ? recorrido.map((x, j) => (j === i ? e : x)) : [...recorrido.slice(0, k), e, ...recorrido.slice(k)];
    }
    const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = {};
    const seQuedaronDeAntes: TipoDelNegocio[] = [];
    for (const tipo of TIPOS_DEL_NEGOCIO) {
      const ps = PARTES_ENTERAS.includes(tipo) && laTocoUnaPersona(antes, tipo)
        ? [...(antes.negocio?.[tipo] ?? [])]
        : junto(antes.negocio?.[tipo] ?? [], sinQuitadas(nuevo.negocio?.[tipo] ?? [], quitados, `negocio:${tipo}`), mismoOrigen);
      let conTope = ps.slice(0, PARTES_ENTERAS.includes(tipo) ? maxDelNegocio(tipo) : MAX_POR_LISTA);
      /* Una pieza obligatoria (el titular) que la corrida nueva no pudo escribir —la verificación la descartó: nombraba a
         una persona, era larga— se queda como estaba, con sus citas (21 nov: Tecnosagot y Polaris quedaron sin titular y
         el cliente lo habría visto al publicar). Si la quitó una persona, no vuelve: eso es suyo. */
      const deAntes = (antes.negocio?.[tipo] ?? []).filter((p) => !reuniones || sigueEnLasReuniones(p, reuniones));
      if (!conTope.length && PIEZAS_OBLIGATORIAS.includes(tipo) && deAntes.length && !laTocoUnaPersona(antes, tipo)) {
        conTope = deAntes.slice(0, maxDelNegocio(tipo));
        seQuedaronDeAntes.push(tipo);
      }
      if (conTope.length) negocio[tipo] = conTope;
    }
    const pendientesViejos = antes.v === 2 ? (antes.pendientes ?? []) : antes.falta.filter((p) => p.mano).map((p) => ({ id: p.id, tipo: "sin-dato" as const, texto: p.texto, areaId: null, citas: [], mano: true }));
    return {
      ...nuevo,
      ...conQuitados,
      hicimos: { ...nuevo.hicimos, texto: antes.hicimos.texto },
      areas,
      negocio,
      recorrido: recorrido.slice(0, MAX_POR_LISTA),
      // El título que escribió (o vació) una persona se queda.
      ...(antes.tituloDelRecorrido?.mano ? { tituloDelRecorrido: antes.tituloDelRecorrido } : {}),
      // Adentro se avisa que el titular es el de antes: el nuevo no pasó la verificación.
      ...(seQuedaronDeAntes.length
        ? { avisos: [...(nuevo.avisos ?? []), ...seQuedaronDeAntes.map((t) => `${avisoDeLaDeAntes(t)} y quedó la de antes. Revísala o escríbela de nuevo.`)] }
        : {}),
      operativas,
      pendientes: junto(pendientesViejos, (nuevo.pendientes ?? []).filter((p) => !pareceQuitada("falta", p, quitados))).slice(0, MAX_POR_LISTA),
      // Lo que falta confirmar que tocó una persona se queda como lo dejó (cambiado, o vacío si lo quitó).
      ...(antes.confirmarMano?.length
        ? {
            confirmar: { ...nuevo.confirmar, ...Object.fromEntries(antes.confirmarMano.map((d) => [d, antes.confirmar?.[d] ?? ""])) },
            confirmarMano: antes.confirmarMano,
          }
        : {}),
      entendimos: junto(antes.entendimos, nuevo.entendimos.filter((p) => !pareceQuitada("entendimos", p, quitados))).slice(0, MAX_POR_LISTA),
      // Los puntos clave: lo de la persona primero, después los nuevos sin los que quitó (18 nov).
      puntos: junto(antes.puntos ?? [], sinQuitadas(nuevo.puntos ?? [], quitados, "punto"), mismoOrigen).slice(0, MAX_POR_LISTA),
    };
  }

  // Formato 1 sobre formato 1 (la lectura de lo guardado antes del 10 nov; el agente ya no lo escribe).
  nuevo = {
    ...nuevo,
    datosRojos: nuevo.datosRojos.filter((d) => !pareceQuitada("rojo", d, quitados)),
    areas: Object.fromEntries(Object.entries(nuevo.areas).map(([id, a]) => [id, { ...a, hallazgos: a.hallazgos.filter((h) => !pareceQuitada("hallazgo", h, quitados)) }])),
    entendimos: nuevo.entendimos.filter((p) => !pareceQuitada("entendimos", p, quitados)),
    falta: nuevo.falta.filter((p) => !pareceQuitada("falta", p, quitados)),
    ...conQuitados,
  };
  const datosRojos = junto(antes.datosRojos, nuevo.datosRojos, mismaCifra);
  const areas: Record<string, AreaDelResumenGuardada> = { ...nuevo.areas };
  for (const [id, a] of Object.entries(antes.areas)) {
    const n = areas[id] ?? { hallazgos: [], porque: null };
    areas[id] = { hallazgos: junto(a.hallazgos, n.hallazgos, mismoOrigen).slice(0, MAX_POR_LISTA), porque: porque(id, n) };
  }
  return {
    ...nuevo,
    hicimos: { ...nuevo.hicimos, texto: antes.hicimos.texto },
    datosRojos: datosRojos.slice(0, Math.max(MAX_DATOS_ROJOS, datosRojos.filter((d) => d.mano).length)),
    areas,
    entendimos: junto(antes.entendimos, nuevo.entendimos).slice(0, MAX_POR_LISTA),
    falta: junto(antes.falta, nuevo.falta).slice(0, MAX_POR_LISTA),
  };
}

// ── La corrida ──────────────────────────────────────────────────────────────────

type Respuesta = Pick<Anthropic.Messages.Message, "content" | "usage"> & { stop_reason?: Anthropic.Messages.Message["stop_reason"] };

/**
 * Pide el Resumen y lee lo que vuelve. Si no se pudo leer (ninguna área) o se cortó por largo, una vez más. Las cifras que
 * se cayeron por un número de más se piden corregidas, con sus citas (`pedidoDelArreglo`). `cortado`: el último intento
 * todavía vino cortado o sin ninguna área, y NO se guarda (revisión del 9 nov: un Resumen vacío pisaba al anterior).
 * `pedir` hace la llamada (la app la mide con `conContextoDeIA`; el simulacro no). Lo comparten la app y el simulacro.
 */
export async function escribirElResumen(
  le: { ctx: ContextoDelResumen; personas: readonly string[]; firmas: Readonly<Record<string, string>>; areasFuera?: readonly string[] },
  pedir: (p: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Respuesta>,
): Promise<LoQueEscribioElAgente & { usos: Anthropic.Messages.Usage[]; cortado: boolean }> {
  const reglas: Reglas = { personas: le.personas, areasFuera: le.areasFuera ?? [], equipos: le.ctx.areas.map((x) => x.nombre), parse: parseObject, firmas: le.firmas, dicho: dichoPorLaEmpresa(le.ctx.reuniones) };
  const usos: Anthropic.Messages.Usage[] = [];
  const mal = (r: Respuesta, e: LoQueEscribioElAgente) => r.stop_reason === "max_tokens" || (!e.operativas.length && le.ctx.areas.length > 0);
  // Los nombres de pila que `textoValido` rechazaría: se le dicen, así no gasta piezas que se caen.
  const noNombrar = [...new Set(le.personas.map((n) => n.trim().split(/\s+/)[0] ?? "").filter((n) => n.length >= 3 && !NO_ES_UNA_PERSONA.test(n)))];
  const ctx: ContextoDelResumen = { ...le.ctx, noNombrar };
  let r = await pedir(pedidoDelResumen(ctx));
  usos.push(r.usage);
  let e = leerElResumen(r, ctx, reglas);
  if (mal(r, e)) {
    const aviso =
      r.stop_reason === "max_tokens"
        ? "⚠ Tu respuesta anterior se cortó por larga: escribe más corto (una línea por pieza) y devuelve SOLO el JSON pedido."
        : "⚠ Tu respuesta anterior no se pudo leer: devuelve SOLO el JSON pedido, con por lo menos un área operativa en «areas».";
    r = await pedir(pedidoDelResumen(ctx, aviso));
    usos.push(r.usage);
    e = leerElResumen(r, ctx, reglas);
  }
  const cortado = mal(r, e);
  // Las cifras que se cayeron por un número de más (una resta, un porcentaje) se piden corregidas, con sus citas: la
  // cifra que más le importa a Marco no se pierde por cómo la escribió el modelo (Centauro: «11» por 25 − 14).
  if (!cortado && e.porArreglar.length) {
    // Si el arreglo falla (Anthropic saturado), se guarda lo que ya se pagó, sin esas cifras.
    try {
      const r3 = await pedir(pedidoDelArreglo(e.porArreglar));
      usos.push(r3.usage);
      const a = leerElArreglo(r3, e.porArreglar, { ...reglas, reuniones: ctx.reuniones });
      e = { ...e, operativas: conLoArreglado(e.operativas, a.cifras), descartados: [...e.descartados, ...a.descartados] };
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las cifras falló: quedaron fuera"] };
    }
  }
  if (!cortado && e.etapasPorArreglar.length) {
    try {
      const r4 = await pedir(pedidoDeLasEtapas(e.etapasPorArreglar));
      usos.push(r4.usage);
      const a = leerLasEtapas(r4, e.etapasPorArreglar, ctx, reglas);
      e = { ...e, recorrido: conLasEtapas(e.recorrido, a.etapas), descartados: [...e.descartados, ...a.descartados] };
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las etapas falló: quedaron fuera"] };
    }
  }
  // Las piezas de las listas que se cayeron por algo de forma se piden corregidas (12 nov: se tiraban enteras).
  if (!cortado && e.piezasPorArreglar.length) {
    try {
      const r5 = await pedir(pedidoDeLasPiezas(e.piezasPorArreglar));
      usos.push(r5.usage);
      const a = leerLasPiezas(r5, e.piezasPorArreglar, ctx, reglas);
      e = { ...e, ...conLasPiezas(e, a.piezas), descartados: [...e.descartados, ...a.descartados] };
      // El titular que volvió todavía largo se pide acortado UNA vez más (una llamada chica, sin las transcripciones).
      if (a.aCortar.length) {
        try {
          const r5b = await pedir(pedidoDeLasPiezas(a.aCortar));
          usos.push(r5b.usage);
          const b = leerLasPiezas(r5b, a.aCortar, ctx, reglas);
          e = { ...e, ...conLasPiezas(e, b.piezas), descartados: [...e.descartados, ...b.descartados] };
        } catch {
          e = { ...e, descartados: [...e.descartados, "acortar el titular falló: queda el de antes, si había"] };
        }
      }
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las piezas falló: quedaron fuera"] };
    }
  }
  // El piso (24 nov): un equipo con reunión propia sin su reto principal o sin dos retos se pide leyendo solo sus reuniones.
  if (!cortado) {
    for (const areaId of equiposBajoElPiso(e.operativas, ctx)) {
      const area = ctx.areas.find((x) => x.id === areaId);
      const suyas = ctx.reuniones.filter((x) => x.areaId === areaId && !esNotaDelEquipo(x)).slice(-2);
      if (!area || !suyas.length) continue;
      try {
        const r7 = await pedir(pedidoDelPisoDelEquipo(area, suyas, e.operativas, ctx.areas.filter((x) => x.id !== areaId)));
        usos.push(r7.usage);
        const a = conElPisoDelEquipo(r7, areaId, e.operativas, ctx, reglas);
        e = { ...e, operativas: a.operativas, descartados: [...e.descartados, ...a.descartados] };
      } catch {
        e = { ...e, descartados: [...e.descartados, `el piso de ${area.nombre} falló: quedó con lo que tenía`] };
      }
    }
  }
  // Un equipo que tuvo reunión y no quedó en el recorrido: se le pide su etapa leyendo solo esa reunión, sin forzarla.
  if (!cortado) {
    for (const areaId of equiposSinEtapa(conLasEtapas(e.recorrido, []), e.operativas, ctx)) {
      const reunion = ctx.reuniones.find((x) => x.areaId === areaId);
      const equipo = ctx.areas.find((x) => x.id === areaId)?.nombre;
      if (!reunion || !equipo) continue;
      try {
        const r6 = await pedir(pedidoDeLaEtapaQueFalta(equipo, reunion, conLasEtapas(e.recorrido, [])));
        usos.push(r6.usage);
        const a = conLaEtapaQueFalta(r6, conLasEtapas(e.recorrido, []), ctx, reglas);
        e = { ...e, recorrido: a.recorrido, descartados: [...e.descartados, ...a.descartados] };
      } catch {
        e = { ...e, descartados: [...e.descartados, `la etapa de ${equipo} falló: quedó fuera`] };
      }
    }
  }
  /* Lo que ya se resolvió en la misma reunión no le llega al cliente (24 nov, Elías: «la extranet no tiene API» salió aunque
     se acordó exportar a Excel). Una llamada chica, sin las transcripciones: cada problema con lo que se dijo después. Lo
     que el modelo marca se verifica (la cita está después del problema, en su reunión); si falla, queda todo como estaba. */
  if (!cortado) {
    const piezas = piezasParaLoResuelto(e, ctx.reuniones);
    if (piezas.length) {
      try {
        const r8 = await pedir(pedidoDeLoResuelto(piezas, ctx.reuniones));
        usos.push(r8.usage);
        const resueltas = leerLoResuelto(r8, piezas, ctx.reuniones, reglas.parse);
        e = { ...e, ...sinLoResuelto(e, resueltas.map((x) => x.lugar)), descartados: [...e.descartados, ...resueltas.map((x) => x.motivo)] };
      } catch {
        e = { ...e, descartados: [...e.descartados, "la revisión de lo ya resuelto falló: quedó todo como estaba"] };
      }
    }
  }
  // Las etapas sin el orden interno, y los avisos con el recorrido final.
  const recorrido = conLasEtapas(e.recorrido, []);
  // Lo que la auditoría marcaría NO llega a la página (12 nov): se quita antes de guardar.
  const revisado = quitarLoQueNoPasa({ negocio: e.negocio, recorrido, operativas: e.operativas, pendientes: e.pendientes, puntos: e.puntos }, ctx.reuniones);
  // Un área que se quedó sin nada (sus piezas se cayeron y no volvieron) no llega vacía a la página.
  const conAlgo = (a: AreaOperativa) => a.organizacion.length + a.bien.length + a.frena.length + a.retos.length + a.cifras.length > 0 || !!a.falta;
  const limpio = { ...revisado, resumen: { ...revisado.resumen, operativas: revisado.resumen.operativas.filter(conAlgo) } };
  return {
    ...e,
    ...limpio.resumen,
    recorrido: limpio.resumen.recorrido,
    // Los 5 primeros en orden de peso, después de sacar lo resuelto (un candidato de más ocupa su lugar).
    puntos: (limpio.resumen.puntos ?? []).slice(0, MAX_PUNTOS),
    descartados: [...e.descartados, ...limpio.quitados.map((q) => `antes de guardar, ${q.donde}: ${q.problema}`)],
    avisos: [...avisosDelRecorrido(limpio.resumen.recorrido, limpio.resumen.operativas, ctx), ...avisosDelPiso(limpio.resumen.operativas, ctx)],
    usos,
    cortado,
  };
}

/** Los equipos con reunión que no tienen ninguna etapa en el recorrido (la regla de `avisosDelRecorrido`). */
export function equiposSinEtapa(
  recorrido: readonly Pick<EtapaDelResumen, "quien" | "nombre">[],
  operativas: readonly Pick<AreaOperativa, "nombre" | "areaId">[],
  ctx: { areas: readonly { id: string; nombre: string }[]; reuniones: readonly Pick<ReunionParaElResumen, "areaId">[] },
): string[] {
  const conReunion = [...new Set(ctx.reuniones.flatMap((r) => (r.areaId ? [r.areaId] : [])))];
  const nombres = (areaId: string) => [ctx.areas.find((a) => a.id === areaId)?.nombre ?? "", ...operativas.filter((o) => o.areaId === areaId).map((o) => o.nombre)].map(paraComparar).filter(Boolean);
  const enEtapas = recorrido.map((e) => paraComparar(`${e.quien ?? ""} ${e.nombre}`));
  return conReunion.filter((id) => ctx.areas.some((a) => a.id === id)).filter((id) => !enEtapas.some((e) => nombres(id).some((n) => e.includes(n))));
}

// ── Qué reuniones lee y quién es de la empresa ─────────────────────────────────

/** El grabador de la reunión aparece como un hablante más: no es de la empresa. */
export const NO_ES_UNA_PERSONA = /notetaker|note taker|smarteam|gemini|fireflies|otter|read\.ai|tl;?dv/i;

/**
 * Si quien habla es alguien del equipo de Smarteam escrito de otra forma (revisión del 24 nov, dos vueltas): una sala de
 * Meet con su nombre («Presentación de Marco Salas»: su nombre entero, palabra por palabra), o su nombre acortado
 * («María Vargas» por «María José Vargas»: el mismo nombre de pila y el mismo último apellido, y nada que no esté en el
 * suyo). Por palabras enteras: «Juliana Morales» no es «Ana Mora». `equipo`: los nombres del equipo (`nombresDelEquipo`).
 * Un nombre de una sola palabra no cuenta: «Luis» puede ser de cualquiera.
 */
export function esDeSmarteamPorElNombre(nombre: string, equipo: readonly string[]): boolean {
  const ps = paraComparar(nombre).split(" ").filter(Boolean);
  return equipo.some((n) => {
    const suyo = paraComparar(n).split(" ").filter(Boolean);
    if (suyo.length < 2) return false;
    const entero = ps.some((_, i) => suyo.every((w, k) => ps[i + k] === w));
    const acortado = ps.length >= 2 && ps[0] === suyo[0] && ps[ps.length - 1] === suyo[suyo.length - 1] && ps.every((w) => suyo.includes(w));
    return entero || acortado;
  });
}

/**
 * ¿Quien habló es de OTRA empresa (ni del cliente ni de Smarteam)? Por los correos de los invitados: alguno de un dominio
 * que no es del cliente lleva su nombre o su apellido (Centauro, 10 nov: «Michael Pena» es mipena@hubspot.com y contaba
 * como persona de la empresa). Si uno del dominio del cliente también calza, es del cliente. Sin dominios del cliente, no
 * se sabe: false.
 */
export function esDeOtraEmpresa(nombre: string, correos: readonly string[], dominiosDelCliente: readonly string[], noCuentan: ReadonlySet<string> = new Set()): boolean {
  const dominios = new Set(dominiosDelCliente.map((d) => d.toLowerCase().replace(/^@/, "")));
  if (!dominios.size) return false;
  const piezas = paraComparar(nombre).split(" ").filter((p) => p.length >= 4);
  if (!piezas.length) return false;
  const calza = (correo: string) => {
    const local = paraComparar(correo.split("@")[0] ?? "").replace(/\s+/g, "");
    return piezas.some((p) => local.includes(p));
  };
  // Un correo de la casa (Smarteam) o personal (Gmail) no dice de qué empresa es nadie (revisión del 10 nov: «Mario Salas»,
  // del cliente, calzaba con msalas@smarteamcr.com).
  const deOtro = correos.filter((c) => {
    const d = (c.split("@")[1] ?? "").toLowerCase();
    return !dominios.has(d) && !noCuentan.has(d);
  });
  const delCliente = correos.filter((c) => dominios.has((c.split("@")[1] ?? "").toLowerCase()));
  return deOtro.some(calza) && !delCliente.some(calza);
}

/** Quiénes hablaron del lado de la empresa (sin el grabador ni la gente de otra empresa: `deOtra`). */
export function delClienteDe(personas: readonly { nombre: string; lado: string }[] | undefined, deOtra: (nombre: string) => boolean = () => false): string[] {
  return (personas ?? []).filter((p) => p.lado === "cliente" && !NO_ES_UNA_PERSONA.test(p.nombre) && !deOtra(p.nombre)).map((p) => p.nombre);
}

/**
 * Las reuniones que lee el agente, de la más vieja a la más nueva: solo con TRANSCRIPCIÓN (las notas de Gemini no dicen
 * quién habló) y solo de equipos que ve el cliente (una sin equipo, o de un equipo sin área, se lee). `fuentes` vienen
 * de la más nueva a la más vieja, como las da `transcripcionesDeLaExploracion`.
 */
export function reunionesQueLee<R extends { id: string; areaId: string | null }>(fuentes: readonly R[], conTranscripcion: ReadonlySet<string>, areasQueVe: ReadonlySet<string>): R[] {
  return fuentes.filter((r) => conTranscripcion.has(r.id) && (!r.areaId || areasQueVe.has(r.areaId))).reverse();
}

// ── La auditoría de veracidad ───────────────────────────────────────────────────

export interface ProblemaDeVeracidad {
  /** Qué pieza: «Customer Success · cifra «2,8 %»». */
  donde: string;
  problema: string;
}

/**
 * Relee un Resumen GUARDADO pieza por pieza contra las transcripciones, con las reglas de hoy (11 nov, Elías: «en este
 * tipo de entregable la veracidad es lo más importante»): que cada cita esté en su reunión y la haya dicho (o confirmado)
 * la empresa, que los números y las herramientas estén en lo citado, que una cifra sea un solo dato, que su estado sea el
 * que corresponde, y que no haya lecturas nuestras, conclusiones ni totales colados. No cambia nada: lo usa el simulacro
 * (`--auditar`) sobre lo que está en producción.
 */
export function auditarElResumen(g: ResumenGuardado, reuniones: readonly ReunionParaElResumen[], areas: readonly { id: string; nombre: string }[]): ProblemaDeVeracidad[] {
  const out: ProblemaDeVeracidad[] = revisarLasPiezas(g, reuniones).map(({ donde, problema }) => ({ donde, problema }));
  for (const a of avisosDelRecorrido(g.recorrido ?? [], g.operativas ?? [], { areas, reuniones })) out.push({ donde: "Recorrido", problema: a });
  return out;
}

/** Dónde está una pieza del Resumen, para quitarla. */
type LugarDeLaPieza =
  | { tipo: "negocio"; parte: string; id: string }
  | { tipo: "etapa"; id: string }
  | { tipo: "traspaso"; id: string }
  | { tipo: "lista"; operativa: string; campo: "organizacion" | "bien" | "frena" | "retos"; id: string }
  | { tipo: "cifra"; operativa: string; id: string }
  | { tipo: "pendiente"; id: string }
  | { tipo: "punto"; id: string };

type ParaRevisar = Pick<ResumenGuardado, "negocio" | "recorrido" | "operativas" | "pendientes" | "puntos">;

/**
 * La revisión de cada pieza contra las transcripciones, con la misma vara que la lectura (12 nov: la auditoría marcaba lo
 * que la lectura había dejado pasar, como «crecer» en «busca»). Lo escrito a mano no se revisa: la responsabilidad es de
 * quien lo escribió.
 */
function revisarLasPiezas(g: ParaRevisar, reuniones: readonly ReunionParaElResumen[]): (ProblemaDeVeracidad & { lugar: LugarDeLaPieza })[] {
  const out: (ProblemaDeVeracidad & { lugar: LugarDeLaPieza })[] = [];
  const dicho = dichoPorLaEmpresa(reuniones);
  let lugar: LugarDeLaPieza = { tipo: "etapa", id: "" };
  const mal = (donde: string, problema: string) => out.push({ donde, problema, lugar });
  const citasValidas = revisarLasCitas(reuniones, mal);
  const pieza = (donde: string, texto: string, citas: readonly CitaDelResumen[], extras = "", mano = false) => {
    if (!citas.length || mano) return;
    citasValidas(donde, citas);
    const lo = citas.map((c) => c.texto).join(" ");
    const todo = `${texto} ${extras}`;
    const sobran = cifrasDeMas(todo, lo, loDeSusReuniones(citas, reuniones));
    if (sobran.length) mal(donde, `números que no están en lo citado (${sobran.join(", ")})`);
    const h = herramientasDeMas(todo, lo, dichoEnSusReuniones(citas, reuniones));
    if (h.length) mal(donde, `nombra herramientas que la empresa no nombró (${h.join(", ")})`);
    const l = lecturaNuestra(todo, lo);
    if (l) mal(donde, `una lectura nuestra que no dijeron («${l}»)`);
    const c = concluyeDeMas(todo, lo);
    if (c) mal(donde, `una conclusión que la cita no dice («${c}»)`);
    if (/\bprovisional|\bhipotesis\b/.test(paraComparar(todo))) mal(donde, "dice «provisional» o «hipótesis»");
    const voseo = voseoDelResumen(todo);
    if (voseo.length) mal(donde, `está en voseo (${voseo.join(", ")})`);
  };
  for (const [tipo, ps] of Object.entries(g.negocio ?? {}))
    for (const p of ps ?? []) {
      lugar = { tipo: "negocio", parte: tipo, id: p.id };
      pieza(`Negocio · ${tipo}`, p.texto, p.citas, "", p.mano);
    }
  for (const e of g.recorrido ?? []) {
    lugar = { tipo: "etapa", id: e.id };
    pieza(`Recorrido · ${e.nombre}`, `${e.nombre} ${e.texto}`, e.citas, e.friccion ?? "", e.mano);
    // El traspaso (24 nov), aparte: si no pasa, se quita solo él.
    if (e.traspaso) {
      lugar = { tipo: "traspaso", id: e.id };
      pieza(`Recorrido · traspaso de ${e.nombre}`, e.traspaso.texto, e.traspaso.citas, `${e.traspaso.cifra ?? ""} ${e.traspaso.rotulo ?? ""}`, e.mano);
    }
  }
  for (const op of g.operativas ?? []) {
    for (const [k, campo, xs] of [
      ["organización", "organizacion", op.organizacion],
      ["lo que hace bien", "bien", op.bien],
      ["lo que frena", "frena", op.frena],
      ["reto", "retos", op.retos],
    ] as const)
      for (const p of xs) {
        lugar = { tipo: "lista", operativa: op.id, campo, id: p.id };
        pieza(`${op.nombre} · ${k}`, p.texto, p.citas, "", p.mano);
      }
    for (const c of op.cifras) {
      if (c.mano) continue;
      lugar = { tipo: "cifra", operativa: op.id, id: c.id };
      const donde = `${op.nombre} · cifra «${c.cifra}»`;
      citasValidas(donde, c.citas);
      for (const problema of c.cuenta ? problemasDelCalculado(c) : problemasDeLaCifra(c, dicho, reuniones)) mal(donde, problema);
      if (voseoDelResumen(`${c.cifra} ${c.texto} ${c.nota ?? ""}`).length) mal(donde, "está en voseo");
      if (/\bprovisional|\bhipotesis\b/.test(paraComparar(`${c.texto} ${c.nota ?? ""}`))) mal(donde, "dice «provisional» o «hipótesis»");
      const e = estadoDeLaCifra({ estado: c.estado, cifra: c.cifra, nota: c.nota, citas: c.citas, mano: c.mano, confirmada: c.confirmada, cuenta: c.cuenta });
      if (e.estado !== c.estado) mal(donde, `está guardada como «${c.estado}» y con sus citas es «${e.estado}»`);
      if (c.nota && CITA_EN_LA_NOTA.test(c.nota)) mal(donde, "la nota cita lo dicho o dice quién lo dijo");
    }
  }
  for (const p of g.puntos ?? []) {
    lugar = { tipo: "punto", id: p.id };
    pieza(`Punto clave · ${p.titulo}`, `${p.titulo} ${p.texto}`, p.citas, "", p.mano);
  }
  for (const p of g.pendientes ?? []) {
    if (p.mano) continue;
    lugar = { tipo: "pendiente", id: p.id };
    const t = paraComparar(p.texto);
    if (/\bprovisional|\bhipotesis\b/.test(t)) mal(`Pendiente «${p.texto.slice(0, 40)}…»`, "dice «provisional» o «hipótesis»");
    if (COCINA.test(t)) mal(`Pendiente «${p.texto.slice(0, 40)}…»`, "cuenta cómo se armó una cifra");
    if (voseoDelResumen(p.texto).length) mal(`Pendiente «${p.texto.slice(0, 40)}…»`, "está en voseo");
  }
  return out;
}

/**
 * Lo que la revisión marca, fuera ANTES de guardar (12 nov, Elías: lo que marca la auditoría nunca queda en la página del
 * cliente). Devuelve el Resumen sin esas piezas y qué se quitó.
 */
export function quitarLoQueNoPasa<T extends ParaRevisar>(g: T, reuniones: readonly ReunionParaElResumen[]): { resumen: T; quitados: ProblemaDeVeracidad[] } {
  const problemas = revisarLasPiezas(g, reuniones);
  if (!problemas.length) return { resumen: g, quitados: [] };
  const fuera = (l: LugarDeLaPieza) => problemas.some((p) => JSON.stringify(p.lugar) === JSON.stringify(l));
  const resumen: T = {
    ...g,
    negocio: Object.fromEntries(Object.entries(g.negocio ?? {}).map(([parte, ps]) => [parte, (ps ?? []).filter((p) => !fuera({ tipo: "negocio", parte, id: p.id }))])),
    recorrido: (g.recorrido ?? [])
      .filter((e) => !fuera({ tipo: "etapa", id: e.id }))
      .map((e) => {
        if (!e.traspaso || !fuera({ tipo: "traspaso", id: e.id })) return e;
        const { traspaso, ...sin } = e;
        void traspaso;
        return sin;
      }),
    operativas: (g.operativas ?? []).map((op) => ({
      ...op,
      organizacion: op.organizacion.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "organizacion", id: p.id })),
      bien: op.bien.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "bien", id: p.id })),
      frena: op.frena.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "frena", id: p.id })),
      retos: op.retos.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "retos", id: p.id })),
      cifras: op.cifras.filter((c) => !fuera({ tipo: "cifra", operativa: op.id, id: c.id })),
    })),
    pendientes: (g.pendientes ?? []).filter((p) => !fuera({ tipo: "pendiente", id: p.id })),
    ...(g.puntos ? { puntos: g.puntos.filter((p) => !fuera({ tipo: "punto", id: p.id })) } : {}),
  };
  return { resumen, quitados: problemas.map(({ donde, problema }) => ({ donde, problema })) };
}

/** La revisión de las citas de una pieza: en su reunión y dichas (o confirmadas) por la empresa. */
function revisarLasCitas(reuniones: readonly ReunionParaElResumen[], mal: (donde: string, problema: string) => void) {
  return (donde: string, citas: readonly CitaDelResumen[]) => {
    for (const c of citas) {
      const r = reuniones.find((x) => x.id === c.reunion);
      if (!r) {
        mal(donde, `cita de una reunión que no se leyó (${c.reunion})`);
        continue;
      }
      const v = verificarCita({ turno: c.turno, texto: c.texto }, r.turnos) ?? (paraComparar(r.turnos.find((t) => t.n === c.turno)?.texto ?? "").trim() === paraComparar(c.texto).trim() ? { turno: c.turno, hablante: r.turnos.find((t) => t.n === c.turno)!.hablante, texto: c.texto } : null);
      if (!v) mal(donde, `la cita no está en la reunión («${c.texto.slice(0, 50)}…»)`);
      else if (!esDelCliente(r, v.hablante) && !confirmacion(r, v.turno, finDeLaCita(r, v)) && !(c.sinCorregir && esDeSmarteam(r, v.hablante) && noLaCorrigio(r, finDeLaCita(r, v), c.texto)))
        mal(donde, `la cita la dijo alguien de Smarteam y nadie de la empresa la confirmó («${c.texto.slice(0, 50)}…»)`);
    }
  };
}
