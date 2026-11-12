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
  nivelProvisional,
  TIPOS_DEL_NEGOCIO,
  TITULO_DEL_NEGOCIO,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  type AreaDelResumenDeLaPagina,
  type CifraDeLaPagina,
  type CitaDelResumen,
  type DatoRojoDeLaPagina,
  type EstadoDeLaCifra,
  type ListaDeLaPagina,
  type LoQueHicimos,
  type PendienteDeLaPagina,
  type PiezaDeLaPagina,
  type PreguntaDelResumen,
  type ResumenDeLaPagina,
  type SubequipoDeLaPagina,
  type TarjetaDeLaPagina,
  type TipoDelNegocio,
} from "@/lib/external/pagina-del-resumen";
export { enHoras, TOPE_A_MANO, TOPE_DE_LA_CIFRA, TOPE_DE_UN_NOMBRE };
export type { AreaDelResumenDeLaPagina, CitaDelResumen, DatoRojoDeLaPagina, EstadoDeLaCifra, LoQueHicimos, PreguntaDelResumen, ResumenDeLaPagina, TipoDelNegocio };

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
}

/** La magnitud de un área: la cifra con su unidad y período, cómo se sabe y, si hace falta, su base o lo que falta validar. */
export interface CifraDelResumen extends PiezaDelResumen {
  cifra: string;
  estado: EstadoDeLaCifra;
  nota: string | null;
  dimensionId: string | null;
}

/** Una etapa del recorrido del cliente HOY. `texto`: qué pasa ahí; `friccion`: lo que se traba (null: no se vio). */
export interface EtapaDelResumen extends PiezaDelResumen {
  nombre: string;
  quien: string | null;
  friccion: string | null;
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
}

/** Los topes de lo que escribe el agente. */
export const MAX_DATOS_ROJOS = 3;
export const MAX_HALLAZGOS_POR_AREA = 3;
export const MAX_PREGUNTAS = 3;
export const MAX_POR_PARTE_DEL_NEGOCIO = 2;
export const MAX_ETAPAS = 7;
export const MAX_AREAS_OPERATIVAS = 6;
export const MAX_RETOS = 3;
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
  /** El equipo de la escala de la reunión («1» Ventas): con él se mira que cada equipo con reunión esté en el recorrido. */
  areaId?: string | null;
  turnos: TurnoNumerado[];
  /**
   * Los que hablaron del lado del cliente (quien-hablo.ts), sin el grabador ni la gente de otra empresa (la de HubSpot en
   * Centauro). Vacío: no se sabe, y NADIE cuenta como de la empresa (revisión del 9 nov).
   */
  delCliente: string[];
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
}

/** El modelo: lee las transcripciones enteras y escribe lo que lee la dirección del cliente; las citas las verifica el código. */
export const MODELO_DEL_RESUMEN = "claude-sonnet-4-6";
/**
 * Lo que puede escribir. El primer simulacro del 10 nov pedía hasta tres citas largas por pieza y se cortó a los 12 mil
 * (cuatro minutos): ahora una cita corta por pieza. Con margen, para no cortarse.
 */
export const MAX_TOKENS_DEL_RESUMEN = 14000;

const REGLAS = `Preparas el RESUMEN EJECUTIVO que Smarteam (una consultora de HubSpot) le presenta a una empresa después de las reuniones de diagnóstico de sus equipos. Lo lee la dirección de la empresa en 2 o 3 minutos y tiene que pensar: «entendieron cómo funciona mi negocio, cómo están organizadas mis áreas y qué problemas tenemos que resolver». En este entregable LA VERACIDAD ES LO MÁS IMPORTANTE: cada cosa tiene que ser exactamente lo que la empresa dijo. Lees las transcripciones (numeradas por turno), lo que ya se ubicó de cada equipo en la escala y una guía que anotó el equipo de Smarteam.

Devuelves SOLO este JSON (P = {"texto":"…","citas":[C]}; C = {"reunion":"R1","turno":12,"texto":"lo dicho, palabra por palabra"}):
{"negocio":{"vende":[P],"ingresos":[P],"abarca":[P],"fuera":[P],"motivo":[P],"busca":[P]},
 "recorrido":[{"etapa":"…","quien":"<equipo o equipos>","texto":"…","friccion":"… o null","citas":[C]}],
 "areas":[{"nombre":"…","area":"<id del equipo de la escala>","organizacion":[P],"bien":[P],"frena":[P],"retos":[{"texto":"…","dimension":"<id o null>","citas":[C]}],"cifras":[{"cifra":"…","texto":"…","estado":"declarado|estimado|pendiente","nota":"… o null","dimension":"<id o null>","citas":[C]}],"falta":"… o null"}],
 "porque":[{"area":"<id del equipo>","texto":"…"}],
 "confirmar":[{"dimension":"<id de una parte con porExplorar>","texto":"…"}],
 "pendientes":[{"tipo":"sin-dato|hipotesis|contradiccion","area":"<id o null>","texto":"…","citas":[C]}]}

LA REGLA DE TODO: cada afirmación sobre la empresa (su negocio, su organización, sus etapas, sus retos, sus cifras) lleva en «citas» lo que dijo alguien de la EMPRESA que la sostiene: una cita, o dos si la afirmación junta cosas dichas en turnos distintos. Cada cita es el pedazo más corto que la sostenga, de 6 a 25 palabras seguidas de UNA intervención, copiado palabra por palabra como está en la transcripción (con sus repeticiones y muletillas, y sus números en cifras o en letras, como aparezcan), con su reunión y su turno. Nunca pegues pedazos con «;», «…» o «...» ni saltes palabras: si necesitas dos pedazos, son dos citas. Dentro de cualquier texto del JSON nunca escribas comillas dobles ("): si lo dicho las trae, usa « ». Todo lo que escribas tiene que estar en tus citas: cada número, cada herramienta y cada detalle; si ninguna cita lo dice, sácalo de la frase. Si lo dijo alguien de Smarteam, solo vale si alguien de la empresa lo confirmó justo después («Exacto», «Sí, correcto»): cita entonces lo que dijo Smarteam. Lo que no puedas citar, no lo escribas. Nada de lecturas nuestras presentadas como dichas por ellos: no califiques lo que contaron («evitable», «innecesario», «se podría automatizar», «recuperable») si ellos no lo dijeron así. La «guia» del equipo de Smarteam te orienta sobre qué buscar; no es evidencia: nada sale de ella sin una cita de la transcripción.

1 NEGOCIO (cada parte, 0 o 1 frase corta): «vende»: qué vende y a quién; «ingresos»: cómo gana dinero (proyectos, suscripción, comisión por transacción…); «abarca»: qué cubre este diagnóstico (unidad, marcas, países, equipos); «fuera»: lo que la empresa dijo que queda fuera (otra división, otra línea de negocio); «motivo»: qué los movió a buscar ayuda; «busca»: el resultado que quieren. Nada corporativo ni genérico. Si una parte no se habló, déjala vacía: no la completes con suposiciones ni con lo que sabes de la industria.

2 RECORRIDO (3 a 6 etapas, en orden): sigue a UN cliente desde el primer contacto hasta el servicio continuo, como pasa HOY: la captación y la venta, el cierre (el pago, el contrato, los datos que se piden), la puesta en marcha (configuración, capacitación), la atención y el acompañamiento o la retención. Una etapa en CADA traspaso de un equipo a otro, aunque ahí no se trabe nada: si el cliente pasa de Ventas a Operaciones y de Operaciones a Soporte, cada paso es una etapa. Cada equipo que tuvo una reunión aparece por lo menos en una etapa. «etapa»: su nombre corto (hasta 5 palabras). «quien»: el equipo o los equipos que la llevan («Ventas», «Soporte y Customer Success»). «texto»: qué pasa ahí, en una línea. «friccion»: lo que se traba en esa etapa o al pasar a la siguiente (null si no se vio). Cada etapa con su cita. Solo lo que hacen hoy: lo que desean o planean (un link de pago, una automatización que todavía no existe) no es una etapa; va en «busca».

3 AREAS: una entrada por subequipo de cada equipo de la escala con el que hubo reunión. Si un equipo tiene subequipos que trabajan distinto (Soporte y Customer Success dentro de «Servicio»), una entrada por subequipo, cada una con el id de ese equipo en «area»; si no, una sola entrada con el nombre del equipo. Un equipo sin reunión propia (aunque otro lo mencione) no lleva entrada. En cada una:
- «organizacion» (1 o 2): quién la lleva (por su rol, nunca por su nombre), cuántos son, qué hace, sus rutinas y herramientas solo si ayudan a entender.
- «bien» (1 o 2): lo que ya hace o ya tiene (procesos, materiales, rutinas, mediciones), aunque sea a mano. Reconócelo siempre que la empresa lo haya dicho.
- «frena» (0 o 1): qué le impide rendir más.
- «retos» (2 o 3, el más respaldado primero): qué pasa, dónde y qué consecuencia tiene, en una frase concreta de ESTA empresa. Nunca «falta automatización» o «no tiene una vista 360» sueltos, ni un riesgo típico de la escala que la empresa no contó.
- «cifras» (0 a 2): la magnitud de lo que pasa HOY, primero lo que se pierde o se escapa (clientes que se van, casos que esperan, tiempo en retrabajo) antes que un volumen. UNA CIFRA ES UN SOLO DATO: todos los números de «cifra» y de «texto» salen de UNA misma cita; dos datos dichos en momentos distintos (un porcentaje y una comparación) son dos cifras aparte, cada una con su estado. Una cifra mide cuánto pasa (clientes, casos, días, un porcentaje): una definición («consideras activo a quien abrió en los últimos 6 meses») no es una cifra. «cifra» es lo que va en grande: el número con su unidad corta, hasta 28 caracteres («2,8 % al mes», «14 de 25», «8 días a 1 mes»); el período y el contexto van en «texto». «estado»: «declarado» si lo dijo la empresa; «estimado» si es un cálculo o un resumen de Smarteam que la empresa confirmó (en «nota», la base y los supuestos); «pendiente» si se mencionó y hay que confirmarlo. «nota» le habla a la empresa («Falta confirmar el período y cómo se calcula»): nunca cita lo dicho ni dice quién lo dijo. Si lo dijeron con dudas («si no me equivoco», «no tengo el dato exacto»), «nota» dice qué falta validar. Escribe la cifra como la dijeron («14 de 25», nunca la resta «11»): no calcules porcentajes, ni sumes, ni redondees. Si los números de una cita no cuadran entre sí (una parte más grande que el total, una suma que no da, una frase cortada), no la uses como cifra: va como pendiente («confirmar el total de…»). Una meta («quieren llegar a 50») no es una cifra de hoy: no la pongas sola; si la usas, que la cifra sea el resultado de hoy frente a la meta («25 de 50 reuniones»). Una comparación entre dos números que resumió Smarteam y la empresa confirmó («captan 25 y se van 14») es una cifra «estimado» valiosa: inclúyela con su base, sin sacar conclusiones. No saques conclusiones que la cifra no dice («tu cartera no crece»). Nunca inventes pérdidas en dinero.
- «falta»: si el área no tiene cifras, qué dato faltaría para medir el impacto (una frase); si no, null.

4 PORQUE (uno por equipo de la escala con nivel): una o dos frases (hasta 50 palabras) de por qué está en su nivel y no uno arriba ni uno abajo, con las partes por su nombre. Usa SOLO los niveles que te damos. Nunca escribas «provisional» ni «hipótesis»: si el nivel lo determina una parte con «porExplorar», di qué mide esa parte y no la presentes como un hecho («no existe»).

5 CONFIRMAR (una por cada parte con «porExplorar» que determina el nivel de su equipo): una línea simple que diga qué falta confirmar, sin tono de duda y terminando con qué se logra. Ejemplo: «Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas».

6 PENDIENTES (0 a 2, solo lo que podría cambiar el diagnóstico): una línea cada uno, en palabras simples, dicha como lo que hay que hacer («Confirmar cuántos casos recibe Soporte al mes en total»). «sin-dato»: se preguntó y no hubo dato; «hipotesis»: algo que creemos y falta validar; «contradiccion»: dos cosas dichas que no cuadran (con las dos citas). Un equipo con el que no se conversó NO va aquí (se agrega solo) y nunca se presenta como de bajo rendimiento; lo de «confirmar» tampoco se repite aquí. Nunca cuentes cómo se armó una cifra ni qué se dijo en qué momento de la reunión («se construyó combinando…», «se dijo con dudas»): di solo qué hay que confirmar.

CÓMO DISTINGUIR: que algo no se haya preguntado no significa que no lo tengan: «no tienen X» solo si la empresa lo dijo. Separa lo que hacen hoy (organización, recorrido, retos, cifras), lo que quieren (busca, metas) y lo que propondríamos nosotros (eso no va aquí). No asumas herramientas, integraciones ni compras: una herramienta se nombra solo si la empresa la nombró en sus reuniones.

Cómo escribes: español neutro, en tuteo, hablándole a la empresa («tu equipo», «tus clientes»), nunca voseo. Frases cortas (cada texto de 8 a 25 palabras; un pendiente o un «confirmar», hasta 25; un «porque», hasta 50), en presente, sin markdown ni frases hechas. Nunca el código de una parte («3.6»): su nombre. Nunca escribas el nombre de una persona (ni de la empresa ni de Smarteam): di su rol («quien lleva Customer Success», «la jefatura de ventas»). No nombres a Smarteam, no hables de precios, presupuestos ni de lo que Smarteam vende, no recomiendes herramientas. Habla SOLO de los equipos de los datos.`;

/** El pedido al agente. `aviso`: por qué no sirvió el intento anterior. */
export function pedidoDelResumen(ctx: ContextoDelResumen, aviso = ""): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const reuniones = ctx.reuniones.map(
    (r) => `### ${r.clave} · ${r.fecha.slice(0, 10)}${r.equipo ? ` · con ${r.equipo}` : ""}\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`,
  );
  const partes = [
    `La empresa: ${ctx.empresa}`,
    `Sus equipos de la escala, con lo que ya se ubicó:\n${JSON.stringify(ctx.areas, null, 1)}`,
    ctx.guia ? `La guía del equipo de Smarteam (orienta; no es evidencia):\n${ctx.guia}` : "",
    `Las reuniones de diagnóstico (cada línea es un turno: [número] quien habla: lo que dijo):\n\n${reuniones.join("\n\n")}`,
    ctx.noNombrar?.length ? `Nombres que NUNCA van en lo que escribes (di su rol): ${ctx.noNombrar.join(", ")}.` : "",
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
}

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
  const interna = texto.match(/\b[a-z]+[A-Z]\w*\b/);
  if (interna) return { ok: false, motivo: `trae una palabra interna («${interna[0]}»)` };
  // El código de una parte («(3.6)») es de adentro: el cliente lee su nombre.
  if (/\(\s*\d{1,2}\.\d{1,2}\s*\)/.test(texto)) return { ok: false, motivo: "trae el código de una parte de la escala" };
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

/**
 * Los números de `texto` que no están en `fuente`, con lo que los multiplica: «25 mil» no es «25» ni «25 millones».
 * `tambien` (12 nov): un número chico vale si la empresa lo dijo en los turnos cercanos a la cita («tus dos marcas»); un
 * año, si es de una reunión o la empresa lo dijo como año. Una magnitud, siempre, tiene que estar en la cita misma.
 */
export function cifrasDeMas(texto: string, fuente: string, tambien: ContextoDeLaCita = {}): string[] {
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

/** Busca una cita del agente en su reunión: dicha por alguien del cliente, o dicha por otro y confirmada. null si no. */
export function citaVerificada(v: unknown, reuniones: readonly ReunionParaElResumen[]): CitaDelResumen | null {
  const x = objeto(v);
  const r = reuniones.find((y) => y.clave === cadena(x.reunion).toUpperCase());
  if (!r) return null;
  // Tres palabras («como una carga») no sostienen nada: una cita trae por lo menos cuatro.
  if (cadena(x.texto).split(" ").filter(Boolean).length < PALABRAS_DE_UNA_CITA) return null;
  const c = verificarCita({ turno: x.turno, texto: x.texto }, r.turnos);
  if (!c) return null;
  const base = { reunion: r.id, fecha: r.fecha, turno: c.turno, hablante: c.hablante, texto: c.texto };
  if (esDelCliente(r, c.hablante)) return base;
  const confirmo = confirmacion(r, c.turno, finDeLaCita(r, c));
  return confirmo ? { ...base, confirmo } : null;
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
export function citasVerificadas(vs: readonly unknown[], reuniones: readonly ReunionParaElResumen[], o: { cifra?: boolean; max?: number } = {}): CitaDelResumen[] {
  const out: CitaDelResumen[] = [];
  for (const v of vs.slice(0, 3)) {
    const entera = citaVerificada(v, reuniones) ?? (o.cifra ? turnoConSoloUnNumero(v, reuniones) : null);
    if (entera) {
      out.push(entera);
      continue;
    }
    const x = objeto(v);
    const pedazos = cadena(x.texto).split(ENTRE_PEDAZOS).filter((p) => p.split(" ").filter(Boolean).length >= PALABRAS_DE_UNA_CITA);
    if (pedazos.length >= 2) {
      const verificados = pedazos.map((p) => citaVerificada({ ...x, texto: p }, reuniones));
      if (verificados.every((c): c is CitaDelResumen => !!c)) out.push(...verificados);
      continue;
    }
    // Sin separador: la frase puede empezar en un turno y seguir en el de otra persona de la empresa («son 10 reuniones a
    // la semana» · «por asesor, pero son 50 a la semana en grupal», 12 nov). Se prueba partida en dos, cada parte en su turno.
    const ps = cadena(x.texto).split(" ").filter(Boolean);
    for (let k = PALABRAS_DE_UNA_CITA; k <= ps.length - PALABRAS_DE_UNA_CITA; k++) {
      const a = citaVerificada({ ...x, texto: ps.slice(0, k).join(" ") }, reuniones);
      const b = a && citaVerificada({ ...x, turno: Number(x.turno) + 1, texto: ps.slice(k).join(" ") }, reuniones);
      if (a && b && b.reunion === a.reunion && b.turno >= a.turno && b.turno - a.turno <= 4) {
        out.push(a, b);
        break;
      }
    }
  }
  // Sin repetir el mismo pedazo dos veces.
  const vistas = new Set<string>();
  return out.filter((c) => !vistas.has(`${c.reunion}:${c.turno}:${c.texto}`) && !!vistas.add(`${c.reunion}:${c.turno}:${c.texto}`)).slice(0, o.max ?? 4);
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
const ES_UNA_META = /\bmeta\b|\bobjetivo\b|\bquieren llegar\b|\bdeberia\b|\btiene que haber\b/;
const ES_DE_HOY = /\bhoy\b|\bactual|\bhace(s|n)?\b|\blogra|\balcanza|\bse quedan?\b|\bsolo\b|\bmitad\b/;

/** Lo que dijo con dudas: la cifra sale, pero dice qué falta validar. */
const CON_DUDAS = /si no me equivoco|no tengo el dato|no se exacto|mas o menos|aproximad|por ahi|no estoy segur|creo que/;
export const NOTA_DE_LO_RESUMIDO = "Lo resumimos en la reunión y lo confirmaste: falta validarlo con tus datos.";
export const NOTA_DE_MEMORIA = "Lo dijiste de memoria: falta confirmar el dato exacto y su período.";
export const NOTA_DE_VARIOS_NUMEROS = "Se dijeron varios números juntos: falta confirmar este dato con tus registros.";

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

export function estadoDeLaCifra(o: { estado: unknown; cifra: string; nota: string | null; citas: readonly CitaDelResumen[]; mano?: boolean }): { estado: EstadoDeLaCifra; nota: string | null } {
  let estado: EstadoDeLaCifra = ESTADOS_DE_LA_CIFRA.includes(o.estado as EstadoDeLaCifra) ? (o.estado as EstadoDeLaCifra) : "pendiente";
  let nota = o.nota;
  const deLaEmpresa = o.citas.filter((c) => !c.confirmo);
  const loDijoLaEmpresa = !!deLaEmpresa.length && !cifrasDeMas(o.cifra, deLaEmpresa.map((c) => c.texto).join(" ")).length;
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
}

/** Una pieza de una lista por corregir (el negocio, la organización, lo que hace bien, lo que frena, un reto). */
export interface PiezaPorArreglar {
  /** Dónde va: `negocio:<parte>` o `<id del área operativa>:<lista>`. */
  lugar: string;
  texto: string;
  citas: CitaDelResumen[];
  problema: string;
  dimensionId?: string | null;
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
function conSuCita(
  v: unknown,
  ctx: ContextoDelResumen,
  o: Reglas,
  descartados: string[],
  donde: string,
  tope = TOPE_DEL_TEXTO_DEL_RESUMEN,
  extras: readonly string[] = [],
  porArreglar?: (x: { texto: string; citas: CitaDelResumen[]; problema: string }) => void,
): { texto: string; citas: CitaDelResumen[] } | null {
  const x = objeto(v);
  const citas = citasVerificadas([...arreglo(x.citas), ...(x.cita ? [x.cita] : [])], ctx.reuniones);
  const lo = citas.map((c) => c.texto).join(" ");
  const crudo = cadena(typeof v === "string" ? v : x.texto);
  // Una conclusión en la cola («…, lo que limita el crecimiento») se corta antes de mirar el resto.
  const sinCola = citas.length ? (sinLaConclusion(crudo, lo) ?? crudo) : crudo;
  const t = textoValido(sinCola, tope, o, lo);
  // Lo de forma, con alguna cita verificada, se pide corregido (12 nov: se tiraba entero).
  const caer = (motivo: string, texto: string) => {
    descartados.push(`${donde}: ${motivo}`);
    if (porArreglar && citas.length && ES_DE_FORMA.test(motivo)) porArreglar({ texto, citas, problema: motivo });
    return null;
  };
  if (!t.ok) return caer(t.motivo, crudo);
  if (!citas.length) {
    descartados.push(`${donde} sin una cita que esté en la reunión («${t.texto.slice(0, 60)}…»)`);
    return null;
  }
  const todo = [t.texto, ...extras].join(" ");
  const suReunion = loDeSusReuniones(citas, ctx.reuniones);
  const sobran = cifrasDeMas(todo, lo, suReunion);
  if (sobran.length) return caer(`números que no están en su cita (${sobran.map((s) => s.replace(/·$/, "").replace("·", " ")).join(", ")})`, t.texto);
  const herramientas = herramientasDeMas(todo, lo, dichoEnSusReuniones(citas, ctx.reuniones));
  if (herramientas.length) return caer(`nombra herramientas que la empresa no nombró en sus reuniones (${herramientas.join(", ")})`, t.texto);
  const lectura = lecturaNuestra(todo, lo);
  if (lectura) return caer(`califica con una lectura nuestra que la empresa no dijo («${lectura}»)`, t.texto);
  // La misma vara que la auditoría (12 nov: «busca… crecer» pasó la lectura y la auditoría lo marcó ya guardado).
  const conclusion = concluyeDeMas(todo, lo);
  if (conclusion) return caer(`saca una conclusión que la cita no dice («${conclusion}»)`, t.texto);
  return { texto: t.texto, citas };
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
  const arreglarEn = (lugar: string, dimensionId?: string | null) => (x: { texto: string; citas: CitaDelResumen[]; problema: string }) => piezasPorArreglar.push({ lugar, ...x, dimensionId });
  const deLasAreas = new Set(ctx.areas.map((a) => a.id));
  const nombreDelArea = (id: string) => ctx.areas.find((a) => a.id === id)?.nombre ?? id;

  // 1 · El negocio.
  const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = {};
  let n = 0;
  for (const tipo of TIPOS_DEL_NEGOCIO) {
    const piezas: PiezaDelResumen[] = [];
    for (const v of arreglo(objeto(crudo.negocio)[tipo])) {
      if (piezas.length >= MAX_POR_PARTE_DEL_NEGOCIO) break;
      const p = conSuCita(v, ctx, o, descartados, `«${TITULO_DEL_NEGOCIO[tipo]}»`, TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`negocio:${tipo}`));
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
      for (const y of arreglo(crudoDeLista)) {
        if (out.length >= max) break;
        const p = conSuCita(y, ctx, o, descartados, donde(que), TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`${id}:${campo}`));
        if (p) out.push({ id: `${prefijo}${out.length + 1}`, ...p, origen: origenDeLaCita(p.citas[0]) });
      }
      return out;
    };
    const retos: RetoDelResumen[] = [];
    for (const y of arreglo(x.retos)) {
      if (retos.length >= MAX_RETOS) break;
      const p = conSuCita(y, ctx, o, descartados, donde("un reto"), TOPE_DEL_TEXTO_DEL_RESUMEN, [], arreglarEn(`${id}:retos`, dimensionDelArea(ctx, areaId, objeto(y).dimension)));
      if (p) retos.push({ id: `t${retos.length + 1}`, ...p, dimensionId: dimensionDelArea(ctx, areaId, objeto(y).dimension), origen: origenDeLaCita(p.citas[0]) });
    }
    const cifras: CifraDelResumen[] = [];
    for (const y of arreglo(x.cifras)) {
      if (cifras.length >= MAX_CIFRAS_POR_AREA) break;
      const c = objeto(y);
      const crudas = { cifra: cadena(c.cifra), texto: cadena(c.texto), nota: nulo(c.nota) ? null : cadena(c.nota) };
      const citadoAntes = arreglo(c.citas).map((z) => cadena(objeto(z).texto)).join(" ");
      crudas.texto = sinLaConclusion(crudas.texto, citadoAntes) ?? crudas.texto;
      // La nota le habla a la empresa: si cita lo dicho («si no me equivoco») o dice quién lo dijo, se va (regla 9).
      if (crudas.nota && CITA_EN_LA_NOTA.test(crudas.nota)) {
        descartados.push(`la nota de «${crudas.cifra}» cita lo dicho: sale la del código`);
        crudas.nota = null;
      }
      const citas = citasVerificadas(arreglo(c.citas), ctx.reuniones, { cifra: true });
      const citado = citas.map((z) => z.texto).join(" ");
      const nombre = `${donde("la cifra")} «${crudas.cifra}»`;
      if (!cifrasDeMas(crudas.cifra, "").length) {
        descartados.push(`${donde("una cifra")} sin número («${crudas.cifra}»)`);
        continue;
      }
      if (!citas.length) {
        descartados.push(`${nombre}: su cita no está en la reunión o no la dijo alguien de la empresa`);
        continue;
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
      if (cifras.some((z) => paraComparar(z.cifra) === paraComparar(crudas.cifra))) continue;
      const e = estadoDeLaCifra({ estado: c.estado, cifra: crudas.cifra, nota: crudas.nota, citas });
      cifras.push({ id: `c${cifras.length + 1}`, cifra: crudas.cifra, texto: crudas.texto, ...e, dimensionId, citas, origen: origenDeLaCita(citas[0]) });
    }
    const falta = nulo(x.falta) ? null : sinCitaPropia(x.falta, TOPE_DE_UNA_PREGUNTA, o, dichoPorElla, descartados, donde("lo que falta"));
    const area: AreaOperativa = {
      id,
      nombre: nombre.texto,
      areaId,
      organizacion: lista(x.organizacion, "g", "la organización", MAX_PIEZAS_POR_LISTA, "organizacion"),
      bien: lista(x.bien, "b", "lo que ya hace bien", MAX_PIEZAS_POR_LISTA, "bien"),
      frena: lista(x.frena, "f", "lo que la frena", 2, "frena"),
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
  const avisos = avisosDelRecorrido(recorrido, operativas, ctx);
  return { negocio, recorrido, operativas, areas, pendientes, entendimos: [], confirmar, avisos, descartados, porArreglar, etapasPorArreglar, piezasPorArreglar };
}

/** Lo que se puede corregir sin volver a leer las reuniones: largo, lo prohibido que la cita no dice, números, herramientas. */
const ES_DE_FORMA = /demasiado largo|habla de «|numeros|números|herramientas|lectura nuestra|conclusi|voseo/;

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
  const crudas = { etapa: cadena(x.etapa ?? x.nombre), quien: nulo(x.quien) ? null : cadena(x.quien), texto: cadena(x.texto), friccion: nulo(x.friccion) ? null : cadena(x.friccion), citas: arreglo(x.citas) };
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
  return { ok: true, etapa: { nombre: nombre.texto, quien: quien?.ok ? quien.texto : null, ...p, friccion: friccion?.ok ? friccion.texto : null, origen: origenDeLaCita(p.citas[0]) } };
}

const REGLAS_DE_LAS_ETAPAS = `Corriges etapas del recorrido de un cliente para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problema»: dice algo que sus citas no dicen (un precio, una tarifa, un número, una herramienta), o es demasiado larga.

Reescribe «etapa» (hasta 5 palabras), «texto» (una línea: qué pasa ahí hoy, en tuteo) y «friccion» (lo que se traba, o null) usando SOLO lo que dicen sus «citas». Quita lo que las citas no digan; no lo reemplaces por otra palabra que lo insinúe. Si con las citas no se puede decir qué pasa en la etapa, omítela.

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
    const r = etapaVerificada({ etapa: x.etapa, quien: de.quien, texto: x.texto, friccion: x.friccion, citas: de.citas }, ctx, o);
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
  recorrido: readonly Pick<EtapaDelResumen, "quien" | "nombre">[],
  operativas: readonly Pick<AreaOperativa, "nombre" | "areaId">[],
  ctx: { areas: readonly { id: string; nombre: string }[]; reuniones: readonly Pick<ReunionParaElResumen, "areaId">[] },
): string[] {
  return equiposSinEtapa(recorrido, operativas, ctx)
    .map((id) => `El recorrido no tiene ninguna etapa de ${ctx.areas.find((a) => a.id === id)!.nombre}, y hubo una reunión con ese equipo: revísalo o rehaz el Resumen.`);
}

// ── El arreglo de las piezas de las listas (12 nov) ─────────────────────────────

const REGLAS_DE_LAS_PIEZAS = `Corriges frases para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problema»: dice algo que sus citas no dicen (un número, una herramienta, una conclusión, una calificación nuestra), o es demasiado larga.

Reescribe «texto» (una frase de 8 a 25 palabras, en tuteo, hablándole a la empresa: «tu equipo», «tus clientes»; nunca voseo) usando SOLO lo que dicen sus «citas». Quita lo que las citas no digan; no lo reemplaces por otra palabra que lo insinúe. Si con las citas no se puede decir nada, omítela.

Devuelves SOLO este JSON: {"piezas":[{"i":<el número de la pieza>,"texto":"…"}]}`;

/** El pedido del arreglo de las piezas: solo las caídas, con sus citas. Sin las transcripciones. */
export function pedidoDeLasPiezas(xs: readonly PiezaPorArreglar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const datos = xs.map((x, i) => ({ i, texto: x.texto, problema: x.problema, citas: x.citas.map((c) => c.texto) }));
  return { model: MODELO_DEL_RESUMEN, max_tokens: 2000, system: REGLAS_DE_LAS_PIEZAS, messages: [{ role: "user", content: JSON.stringify(datos, null, 1) }] };
}

/** Lee el arreglo de las piezas y vuelve a verificar cada una con sus mismas citas (la vara de siempre). */
export function leerLasPiezas(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  xs: readonly PiezaPorArreglar[],
  ctx: ContextoDelResumen,
  o: Reglas,
): { piezas: (PiezaPorArreglar & { ok: true })[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const piezas: (PiezaPorArreglar & { ok: true })[] = [];
  const descartados: string[] = [];
  const usados = new Set<number>();
  for (const v of arreglo(crudo.piezas)) {
    const x = objeto(v);
    const i = typeof x.i === "number" ? x.i : Number(x.i);
    const de = xs[i];
    if (!de || usados.has(i)) continue;
    usados.add(i);
    // Las citas ya están verificadas: se vuelven a pasar como el agente las dio (reunión, turno y texto).
    const citas = de.citas.map((c) => ({ reunion: ctx.reuniones.find((r) => r.id === c.reunion)?.clave ?? c.reunion, turno: c.turno, texto: c.texto }));
    const p = conSuCita({ texto: x.texto, citas }, ctx, o, descartados, `pieza corregida (${de.lugar})`);
    if (p) piezas.push({ ...de, texto: p.texto, citas: p.citas, ok: true });
  }
  return { piezas, descartados };
}

/** Pone cada pieza corregida en su lugar (el negocio o la lista de su área), sin pasar los topes ni repetir. */
export function conLasPiezas<T extends Pick<LoQueEscribioElAgente, "negocio" | "operativas">>(e: T, piezas: readonly PiezaPorArreglar[]): T {
  const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = Object.fromEntries(Object.entries(e.negocio).map(([k, v]) => [k, [...(v ?? [])]]));
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
    if (donde === "negocio") {
      const tipo = campo as TipoDelNegocio;
      const xs = (negocio[tipo] ??= []);
      if (xs.length < MAX_POR_PARTE_DEL_NEGOCIO && !repetida(xs, p.texto)) xs.push({ id: nuevoId("nx", xs), ...base });
      continue;
    }
    const a = operativas.find((y) => y.id === donde);
    if (!a) continue;
    if (campo === "retos") {
      if (a.retos.length < MAX_RETOS && !repetida(a.retos, p.texto)) a.retos.push({ id: nuevoId("tx", a.retos), ...base, dimensionId: p.dimensionId ?? null });
    } else if (campo === "organizacion" || campo === "bien" || campo === "frena") {
      const xs = a[campo];
      const max = campo === "frena" ? 2 : MAX_PIEZAS_POR_LISTA;
      if (xs.length < max && !repetida(xs, p.texto)) xs.push({ id: nuevoId(`${campo[0]}x`, xs), ...base });
    }
  }
  return { ...e, negocio, operativas };
}

// ── La etapa del equipo que falta en el recorrido (12 nov) ──────────────────────

const REGLAS_DE_LA_ETAPA_QUE_FALTA = `Completas el recorrido de un cliente para una página que Smarteam le presenta a una empresa. Hubo una reunión con un equipo que no aparece en ninguna etapa. Lees esa reunión y el recorrido que ya existe.

Si en esa reunión la empresa contó cómo pasa HOY un cliente (o un prospecto) por ese equipo, devuelve esa etapa: «etapa» (hasta 5 palabras), «quien» (el equipo), «texto» (una línea, en tuteo), «friccion» (lo que se traba, o null), «antesDe» (el nombre exacto de la etapa del recorrido que va justo después, o null si va al final) y «citas» (1 o 2: lo dicho por alguien de la empresa, de 6 a 25 palabras seguidas de UNA intervención, copiado palabra por palabra, con su reunión y su turno; nunca pegues pedazos con «;» o «…»). Todo lo que escribas tiene que estar en tus citas. Si la reunión no describe una etapa del recorrido de un cliente, no la inventes: devuelve una lista vacía.

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
    out.splice(k >= 0 ? k : out.length, 0, { ...r.etapa, id: "sx" });
  }
  // Los `orden` de nuevo en secuencia, para que `conLasEtapas` respete la posición.
  return { recorrido: out.map((e, i) => ({ ...e, orden: i })), descartados };
}

// ── El arreglo de las cifras ────────────────────────────────────────────────────

const REGLAS_DEL_ARREGLO = `Corriges cifras para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problemas»: un texto más largo que su tope, un número que NO está en lo que la empresa dijo (sus «citas»): una resta, una suma, un porcentaje calculado o un número de otra parte; o una conclusión que las citas no dicen (quítala).

Reescribe «cifra» (hasta 28 caracteres, lo que va en grande, con su unidad), «texto» (una línea con su período y su contexto, en tuteo, hablándole a la empresa: «tus clientes», «tu equipo») y «nota» (la base y los supuestos, o null) usando SOLO los números que aparecen en sus citas, tal como aparecen. No restes, no sumes, no calcules porcentajes, no redondees. Lo que quites no lo reemplaces por una palabra que lo insinúe («la mitad», «el doble»): la frase tiene que seguir siendo cierta. Si con esos números no se puede decir la magnitud, omítela.

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
    `${tiempo ? `Nos dedicaste ${tiempo} en ` : "Nos dedicaste "}${n} ${n === 1 ? "sesión" : "sesiones"}${equipos.length ? ` con ${enLista(equipos)}` : ""}${personas > 1 ? `, con ${personas} personas de tu equipo` : ""}.`,
    "Todo lo que ves en esta página sale de lo que nos contaste ahí.",
  ].join(" ");
  return {
    sesiones: n,
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
export function porQueNoSaleLaCifra(d: { cifra: string; texto: string; nota?: string | null; citas: readonly { texto: string }[] }): string | null {
  if (!d.citas.length) return "No sale al cliente: no tiene una cita de las reuniones que la sostenga. Si no va, quítala.";
  const sobran = cifrasDeMas(`${d.cifra} ${d.texto} ${d.nota ?? ""}`, d.citas.map((c) => c.texto).join(" ")).map((s) => `«${s.replace(/·$/, "").replace("·", " ")}»`);
  if (!sobran.length) return null;
  return `No sale al cliente: ${enLista(sobran)} ${sobran.length === 1 ? "no está" : "no están"} en lo que dijo la empresa. Corrígela con lo que dice la cita o quítala.`;
}

/** Lo que pide la página de un Resumen, además de lo guardado. */
export interface OpcionesDeLaPagina {
  /** Solo la pantalla interna (Marco verifica de dónde sale cada cosa); la página del cliente nunca las lleva. */
  conCitas: boolean;
  /** Los equipos de la escala que el cliente NO ve: ninguna pregunta que los nombre sale. */
  areasFuera?: readonly string[];
  /** Las partes por explorar de cada equipo (`ResultadoDeUnArea.porExplorar`): con ellas se sabe si un nivel es provisional. */
  porExplorar?: Readonly<Record<string, readonly string[]>>;
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

  // Los equipos de la escala: su nivel (normal, sin «provisional»: Elías, 11 nov) y por qué está ahí. `provisional` se
  // sigue calculando, solo para decir en «Qué falta validar» qué falta confirmar.
  const areas: AreaDelResumenDeLaPagina[] = resultados.map((r) => {
    const a = g?.areas[r.areaId];
    const firma = firmaDelArea(chequeo, r.areaId, entorno);
    // Un «por qué» guardado que dice «provisional» o «hipótesis» (los del 10 nov) no sale: se veía inseguro (Elías, 11 nov).
    const sinDuda = !!a?.porque && !/\bprovisional|\bhipotesis\b/.test(paraComparar(a.porque.texto));
    const vigente = sinDuda && !!r.nivel && a!.porque!.firma === firma;
    const provisional = nivelProvisional(r, o.porExplorar?.[r.areaId] ?? []);
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
    d: { id: string; cifra: string; texto: string; citas: readonly CitaDelResumen[]; mano?: boolean; dimensionId: string | null; estado?: EstadoDeLaCifra; nota?: string | null },
    clave: string,
    conNota: boolean,
  ): CifraDeLaPagina | null => {
    if (fuera(`${d.cifra} ${d.texto} ${d.nota ?? ""}`)) return null;
    const noSale = porQueNoSaleLaCifra(d);
    if (noSale && !o.conCitas) return null;
    const e = estadoDeLaCifra({ estado: d.estado ?? "declarado", cifra: d.cifra, nota: d.nota ?? null, citas: d.citas, mano: d.mano });
    return conCita(
      { id: d.id, cifra: d.cifra, texto: d.texto, ...e, clave, conNota, dimensionNombre: nombreDeLaParte(d.dimensionId), fecha: noSale ? null : (d.citas[0]?.fecha ?? null), ...(d.mano ? { mano: true } : {}) },
      { citas: [...d.citas], ...(noSale ? { noSale } : {}) },
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
  // sesiones no dicen de qué equipo son no sabe cuáles se exploraron: no marca ninguno como pendiente.
  const conEquipos = !!g?.hicimos.sesiones.some((x) => x.areaId !== undefined);
  const hicimos = g
    ? loQueHicimos(
        { ...g.hicimos, sesiones: g.hicimos.sesiones.filter((x) => !x.areaId || deLaPagina.has(x.areaId)) },
        conEquipos ? resultados.map((r) => ({ areaId: r.areaId, nombre: r.areaNombre })) : [],
      )
    : null;
  const exploradas = new Set((hicimos?.areas ?? []).filter((a) => a.sesiones > 0).map((a) => a.areaId));
  const sinExplorar = g && conEquipos ? resultados.filter((r) => !exploradas.has(r.areaId)).map((r) => r.areaId) : [];

  // Los subequipos de cada equipo de la escala: las áreas operativas (formato 2) o el equipo entero (formato 1).
  const subequipos = new Map<string, SubequipoDeLaPagina[]>();
  const sumar = (areaId: string, s: SubequipoDeLaPagina) => subequipos.set(areaId, [...(subequipos.get(areaId) ?? []), s]);
  if (v2) {
    for (const op of g!.operativas ?? []) {
      if (!deLaPagina.has(op.areaId) || fuera(op.nombre) || sinExplorar.includes(op.areaId)) continue;
      const k = `op:${op.id}`;
      sumar(op.areaId, {
        ...subequipoVacio(op.id, op.nombre || (areaDe(op.areaId)?.nombre ?? "")),
        claveDelNombre: `${k}:nombre`,
        organizacion: lista(op.organizacion, `${k}:org`),
        bien: lista(op.bien, `${k}:bien`),
        frena: lista(op.frena, `${k}:frena`),
        retos: lista(op.retos, `${k}:reto`),
        cifras: op.cifras.flatMap((c) => cifra(c, `${k}:cifra:${c.id}`, true) ?? []),
        falta: op.falta && !fuera(op.falta) ? op.falta : null,
        claveDeLaFalta: `${k}:falta`,
      });
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
  for (const id of sinExplorar) {
    const nombre = areaDe(id)!.nombre;
    pendientes.push({ id: `x${id}`, tipo: "no-explorada", texto: `Conversar con tu equipo de ${nombre}: todavía no tuvimos una sesión con él.`, clave: null, areaNombre: nombre });
  }
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
  const negocio = v2
    ? TIPOS_DEL_NEGOCIO.map((tipo) => ({ tipo, titulo: TITULO_DEL_NEGOCIO[tipo], lista: lista((g!.negocio?.[tipo] ?? []).filter((p) => !fuera(p.texto)), `negocio:${tipo}`) }))
    : null;
  const recorrido = v2
    ? (g!.recorrido ?? [])
        .filter((e) => !fuera(`${e.nombre} ${e.texto} ${e.friccion ?? ""}`))
        .map((e) => conCita({ id: e.id, nombre: e.nombre, quien: e.quien, texto: e.texto, friccion: e.friccion, clave: `etapa:${e.id}`, ...(e.mano ? { mano: true } : {}) }, { citas: [...e.citas] }))
    : null;

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
    tarjetas,
    pendientes,
    pendienteNuevo: v2 ? "pendiente:nuevo" : g ? "falta:nuevo" : null,
    // «¿Entendimos bien?» ya no sale (Elías, 11 nov).
    entendimos: [],
    sinExplorar,
    areas,
    datosRojos,
    falta: v2 ? [] : (g?.falta ?? []).filter((p) => !fuera(p.texto)),
    ...(o.conCitas ? { escalaCambio, avisos: g?.avisos ?? [] } : {}),
  };
}

// ── Editar en su lugar ──────────────────────────────────────────────────────────

/**
 * Qué texto se edita. Los dos formatos: `hicimos` · `porque:<área>` · `entendimos:<id>` (o `:nuevo`). Formato 1:
 * `rojo:<id>(:cifra|:texto)` · `hallazgo:<área>:<id|nuevo>` · `falta:<id|nuevo>`. Formato 2: `negocio:<tipo>:<id|nuevo>` ·
 * `etapa:<id>(:nombre|:texto|:friccion)` (o `etapa:nuevo`) · `op:<id>(:nombre|:falta)` · `op:<id>:(org|bien|frena|reto):<id|nuevo>`
 * · `op:<id>:cifra:<id>(:cifra|:texto|:nota)` · `pendiente:<id|nuevo>`. Sin campo, quita la pieza.
 */
const ID = "[\\w-]{1,20}";
export const CLAVE_DEL_RESUMEN = new RegExp(
  `^(hicimos|rojo:${ID}(:cifra|:texto)?|hallazgo:\\d{1,4}:${ID}|porque:\\d{1,4}|(entendimos|falta|pendiente):${ID}|confirmar:\\d{1,2}\\.\\d{1,2}|negocio:(${TIPOS_DEL_NEGOCIO.join("|")}):${ID}|etapa:${ID}(:nombre|:texto|:friccion)?|op:${ID}(:nombre|:falta|:(org|bien|frena|reto):${ID}|:cifra:${ID}(:cifra|:texto|:nota)?)?)$`,
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
      const r = editarUnaLista(g.negocio?.[tipoDelNegocio] ?? [], b, texto, () => aMano("n"), "pieza", `negocio:${tipoDelNegocio}`);
      if (!r.ok) return r;
      return { ok: true, resumen: quitar({ ...g, negocio: { ...g.negocio, [tipoDelNegocio]: r.lista } }, r.quitadas) };
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
        if (!campo || (campo === "texto" && quitarLaPieza)) {
          if (texto && !campo) return { ok: false, error: "Elige qué parte de la cifra cambias." };
          return { ok: true, resumen: conOp({ ...op, cifras: op.cifras.filter((x) => x.id !== id) }, clavesDeQuitado("rojo", c)) };
        }
        if (!texto && campo !== "nota") return { ok: false, error: "La cifra no puede quedar vacía." };
        // La cita se queda aunque ya no diga lo escrito: afuera no sale y adentro sale marcada (`porQueNoSaleLaCifra`).
        const cambiada = { ...c, [campo]: campo === "nota" ? texto || null : texto, mano: true, origen: origenDe(c) };
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
export function conIdsDeLaCorrida<T extends Pick<LoQueEscribioElAgente, "negocio" | "recorrido" | "operativas" | "pendientes" | "entendimos">>(e: T, marca: string): T {
  const m = (id: string) => `${id}-${marca}`.slice(0, 20);
  const conM = <X extends { id: string }>(xs: readonly X[]) => xs.map((x) => ({ ...x, id: m(x.id) }));
  return {
    ...e,
    negocio: Object.fromEntries(Object.entries(e.negocio).map(([k, ps]) => [k, conM(ps ?? [])])),
    recorrido: conM(e.recorrido),
    operativas: conM(e.operativas),
    pendientes: conM(e.pendientes),
    entendimos: conM(e.entendimos),
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
  paraComparar(a.cifra) === paraComparar(b.cifra) || mismoOrigen(a, b);

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
export function juntarConLoEditado(nuevo: ResumenGuardado, antes: ResumenGuardado | null | undefined): ResumenGuardado {
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
    for (const tipo of TIPOS_DEL_NEGOCIO) {
      const ps = junto(antes.negocio?.[tipo] ?? [], sinQuitadas(nuevo.negocio?.[tipo] ?? [], quitados, `negocio:${tipo}`), mismoOrigen).slice(0, MAX_POR_LISTA);
      if (ps.length) negocio[tipo] = ps;
    }
    const pendientesViejos = antes.v === 2 ? (antes.pendientes ?? []) : antes.falta.filter((p) => p.mano).map((p) => ({ id: p.id, tipo: "sin-dato" as const, texto: p.texto, areaId: null, citas: [], mano: true }));
    return {
      ...nuevo,
      ...conQuitados,
      hicimos: { ...nuevo.hicimos, texto: antes.hicimos.texto },
      areas,
      negocio,
      recorrido: recorrido.slice(0, MAX_POR_LISTA),
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
  const reglas: Reglas = { personas: le.personas, areasFuera: le.areasFuera ?? [], parse: parseObject, firmas: le.firmas, dicho: dichoPorLaEmpresa(le.ctx.reuniones) };
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
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las piezas falló: quedaron fuera"] };
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
  // Las etapas sin el orden interno, y los avisos con el recorrido final.
  const recorrido = conLasEtapas(e.recorrido, []);
  // Lo que la auditoría marcaría NO llega a la página (12 nov): se quita antes de guardar.
  const revisado = quitarLoQueNoPasa({ negocio: e.negocio, recorrido, operativas: e.operativas, pendientes: e.pendientes }, ctx.reuniones);
  // Un área que se quedó sin nada (sus piezas se cayeron y no volvieron) no llega vacía a la página.
  const conAlgo = (a: AreaOperativa) => a.organizacion.length + a.bien.length + a.frena.length + a.retos.length + a.cifras.length > 0 || !!a.falta;
  const limpio = { ...revisado, resumen: { ...revisado.resumen, operativas: revisado.resumen.operativas.filter(conAlgo) } };
  return {
    ...e,
    ...limpio.resumen,
    recorrido: limpio.resumen.recorrido,
    descartados: [...e.descartados, ...limpio.quitados.map((q) => `antes de guardar, ${q.donde}: ${q.problema}`)],
    avisos: avisosDelRecorrido(limpio.resumen.recorrido, limpio.resumen.operativas, ctx),
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
  | { tipo: "lista"; operativa: string; campo: "organizacion" | "bien" | "frena" | "retos"; id: string }
  | { tipo: "cifra"; operativa: string; id: string }
  | { tipo: "pendiente"; id: string };

type ParaRevisar = Pick<ResumenGuardado, "negocio" | "recorrido" | "operativas" | "pendientes">;

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
      for (const problema of problemasDeLaCifra(c, dicho, reuniones)) mal(donde, problema);
      if (voseoDelResumen(`${c.cifra} ${c.texto} ${c.nota ?? ""}`).length) mal(donde, "está en voseo");
      if (/\bprovisional|\bhipotesis\b/.test(paraComparar(`${c.texto} ${c.nota ?? ""}`))) mal(donde, "dice «provisional» o «hipótesis»");
      const e = estadoDeLaCifra({ estado: c.estado, cifra: c.cifra, nota: c.nota, citas: c.citas, mano: c.mano });
      if (e.estado !== c.estado) mal(donde, `está guardada como «${c.estado}» y con sus citas es «${e.estado}»`);
      if (c.nota && CITA_EN_LA_NOTA.test(c.nota)) mal(donde, "la nota cita lo dicho o dice quién lo dijo");
    }
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
    recorrido: (g.recorrido ?? []).filter((e) => !fuera({ tipo: "etapa", id: e.id })),
    operativas: (g.operativas ?? []).map((op) => ({
      ...op,
      organizacion: op.organizacion.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "organizacion", id: p.id })),
      bien: op.bien.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "bien", id: p.id })),
      frena: op.frena.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "frena", id: p.id })),
      retos: op.retos.filter((p) => !fuera({ tipo: "lista", operativa: op.id, campo: "retos", id: p.id })),
      cifras: op.cifras.filter((c) => !fuera({ tipo: "cifra", operativa: op.id, id: c.id })),
    })),
    pendientes: (g.pendientes ?? []).filter((p) => !fuera({ tipo: "pendiente", id: p.id })),
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
      else if (!esDelCliente(r, v.hablante) && !confirmacion(r, v.turno, finDeLaCita(r, v))) mal(donde, `la cita la dijo alguien de Smarteam y nadie de la empresa la confirmó («${c.texto.slice(0, 50)}…»)`);
    }
  };
}
