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
export const MAX_PENDIENTES = 4;
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

const REGLAS = `Preparas el RESUMEN EJECUTIVO que Smarteam (una consultora de HubSpot) le presenta a una empresa después de las reuniones de diagnóstico de sus equipos. Lo lee la dirección de la empresa en 2 o 3 minutos y tiene que pensar: «entendieron cómo funciona mi negocio, cómo están organizadas mis áreas y qué problemas tenemos que resolver». Lees las transcripciones (numeradas por turno), lo que ya se ubicó de cada equipo en la escala y una guía que anotó el equipo de Smarteam.

Devuelves SOLO este JSON (P = {"texto":"…","citas":[C]}; C = {"reunion":"R1","turno":12,"texto":"lo dicho, palabra por palabra"}):
{"negocio":{"vende":[P],"ingresos":[P],"abarca":[P],"fuera":[P],"motivo":[P],"busca":[P]},
 "recorrido":[{"etapa":"…","quien":"<área operativa>","texto":"…","friccion":"… o null","citas":[C]}],
 "areas":[{"nombre":"…","area":"<id del equipo de la escala>","organizacion":[P],"bien":[P],"frena":[P],"retos":[{"texto":"…","dimension":"<id o null>","citas":[C]}],"cifras":[{"cifra":"…","texto":"…","estado":"declarado|estimado|pendiente","nota":"… o null","dimension":"<id o null>","citas":[C]}],"falta":"… o null"}],
 "porque":[{"area":"<id del equipo>","texto":"…"}],
 "pendientes":[{"tipo":"sin-dato|hipotesis|contradiccion","area":"<id o null>","texto":"…","citas":[C]}],
 "entendimos":["…"]}

LA REGLA DE TODO: cada afirmación sobre la empresa (su negocio, su organización, sus etapas, sus retos, sus cifras) lleva en «citas» lo que dijo alguien de la EMPRESA que la sostiene: una cita, o dos si la afirmación junta cosas dichas en turnos distintos. Cada cita es el pedazo más corto que la sostenga, de 6 a 25 palabras seguidas de UNA intervención, copiado palabra por palabra como está en la transcripción (con sus números en cifras o en letras, como aparezcan), con su reunión y su turno. Todo lo que escribas tiene que estar en tus citas: cada número, cada herramienta y cada detalle; si ninguna cita lo dice, sácalo de la frase. Si lo dijo alguien de Smarteam, solo vale si alguien de la empresa lo confirmó justo después («Exacto», «Sí, correcto»): cita entonces lo que dijo Smarteam. Lo que no puedas citar, no lo escribas: déjalo fuera o como pendiente. Cada número que escribas tiene que estar en tus citas, tal como se dijo. La «guia» del equipo de Smarteam te orienta sobre qué buscar; no es evidencia: nada sale de ella sin una cita de la transcripción.

1 NEGOCIO (cada parte, 0 o 1 frase corta): «vende»: qué vende y a quién; «ingresos»: cómo gana dinero (proyectos, suscripción, comisión por transacción…); «abarca»: qué cubre este diagnóstico (unidad, marcas, países, equipos); «fuera»: lo que la empresa dijo que queda fuera (otra división, otra línea de negocio); «motivo»: qué los movió a buscar ayuda; «busca»: el resultado que quieren. Nada corporativo ni genérico. Si una parte no se habló, déjala vacía: no la completes con suposiciones ni con lo que sabes de la industria.

2 RECORRIDO (3 a 5 etapas, en orden): cómo pasa HOY un cliente entre las áreas, de la captación a la venta, la puesta en marcha, la atención y la retención. Solo etapas que la empresa describió, una por cada paso que lleva un área distinta (la puesta en marcha, el soporte y el acompañamiento de Customer Success van separados si los llevan áreas distintas). «etapa»: su nombre corto (hasta 5 palabras). «quien»: el área que la lleva. «texto»: qué pasa ahí, en una línea. «friccion»: lo que se traba en esa etapa o al pasar a la siguiente (null si no se vio). Nada de cómo debería ser: lo deseado va en «busca».

3 AREAS: una por área OPERATIVA, como la empresa se organiza de verdad: si dos equipos distintos cuelgan del mismo equipo de la escala (Soporte y Customer Success, los dos de «Servicio»), van separados, cada uno con el id de ese equipo en «area». Solo áreas de equipos con los que hubo una reunión: un equipo sin reunión propia (aunque otro lo mencione) no lleva área; va como pendiente. En cada una:
- «organizacion» (1 o 2): quién la lleva (por su rol, nunca por su nombre), cuántos son, qué hace, sus rutinas y herramientas solo si ayudan a entender.
- «bien» (1 o 2): lo que ya hace o ya tiene (procesos, materiales, rutinas, mediciones), aunque sea a mano. Reconócelo siempre que la empresa lo haya dicho.
- «frena» (0 o 1): qué le impide rendir más.
- «retos» (2 o 3, el más respaldado primero): qué pasa, dónde y qué consecuencia tiene, en una frase concreta de ESTA empresa. Nunca «falta automatización» o «no tiene una vista 360» sueltos, ni un riesgo típico de la escala que la empresa no contó.
- «cifras» (0 a 2): la magnitud de lo que pasa HOY, primero lo que se pierde o se escapa (clientes que se van, casos que esperan, tiempo en retrabajo) antes que un volumen. «cifra» es lo que va en grande: el número con su unidad corta, hasta 28 caracteres («2,8 % al mes», «14 de 25», «8 días a 1 mes»); el período y el contexto van en «texto». «estado»: «declarado» si lo dijo la empresa; «estimado» si es un cálculo o un resumen de Smarteam que la empresa confirmó (en «nota», la base y los supuestos); «pendiente» si se mencionó y hay que confirmarlo. Si lo dijeron con dudas («si no me equivoco», «no tengo el dato exacto»), «nota» dice qué falta validar (el cálculo, el período). «nota» le habla a la empresa («Falta confirmar el período y cómo se calcula»): nunca cita lo dicho ni dice quién lo dijo. Una comparación entre dos números que resumió Smarteam y la empresa confirmó («captan 25 y se van 14») es una cifra «estimado» valiosa: inclúyela con su base, sin sacar conclusiones. Escribe la cifra como la dijeron («14 de 25», nunca la resta «11»): no calcules porcentajes, ni sumes, ni redondees. No juntes en una cifra números de períodos, poblaciones o canales distintos. Una meta («quieren llegar a 50») no es una cifra de hoy: no la pongas sola; si la usas, que la cifra sea el resultado de hoy frente a la meta («25 de 50 reuniones»). No saques conclusiones que la cifra no dice («tu cartera no crece»). Nunca inventes pérdidas en dinero.
- «falta»: si el área no tiene cifras, qué dato faltaría para medir el impacto (una frase); si no, null.

4 PORQUE (uno por equipo de la escala con nivel): una o dos frases (hasta 50 palabras) de por qué está en su nivel y no uno arriba ni uno abajo, con las partes por su nombre. Usa SOLO los niveles que te damos. Si el nivel lo determina una parte con «porExplorar», dilo así: el nivel es provisional y depende de confirmar esa parte; nunca la presentes como un hecho («no existe»).

5 PENDIENTES (1 a 4, solo lo que podría cambiar el diagnóstico): «sin-dato»: se preguntó y no hubo dato; «hipotesis»: algo que creemos y falta validar; «contradiccion»: dos cosas dichas que no cuadran (con las dos citas). Un equipo con el que no se conversó NO va aquí (se agrega solo) y nunca se presenta como de bajo rendimiento.

6 ENTENDIMOS (2 o 3): afirmaciones cortas para que la empresa confirme o corrija lo más importante de lo que contó; sin conclusiones ni comparaciones que nadie dijo.

CÓMO DISTINGUIR: que algo no se haya preguntado no significa que no lo tengan: «no tienen X» solo si la empresa lo dijo. Separa lo que hacen hoy (organización, recorrido, retos, cifras), lo que quieren (busca, metas) y lo que propondríamos nosotros (eso no va aquí). No asumas herramientas, integraciones ni compras: una herramienta se nombra solo si la empresa la nombró en lo citado.

Cómo escribes: español neutro, en tuteo, hablándole a la empresa («tu equipo», «tus clientes»), nunca voseo. Frases cortas (cada texto de 8 a 25 palabras; un pendiente o una afirmación para confirmar, hasta 30; un «porque», hasta 50), en presente, sin markdown ni frases hechas. Nunca el código de una parte («3.6»): su nombre. Nunca escribas el nombre de una persona (ni de la empresa ni de Smarteam): di su rol («quien lleva Customer Success», «la jefatura de ventas»). No nombres a Smarteam, no hables de precios, presupuestos ni de lo que Smarteam vende, no recomiendes herramientas. Habla SOLO de los equipos de los datos.`;

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
  const voseo = voseoEnProsa(texto);
  if (voseo.length) return { ok: false, motivo: `está en voseo (${voseo.join(", ")})` };
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

/** Los números de `texto` que no están en `fuente`, con lo que los multiplica: «25 mil» no es «25» ni «25 millones». */
export function cifrasDeMas(texto: string, fuente: string): string[] {
  const hay = new Set(cantidadesDe(sinEspaciosDeMiles(fuente)));
  const enCifras = cantidadesDe(sinEspaciosDeMiles(texto)).filter((c) => !hay.has(c));
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
export function herramientasDeMas(texto: string, fuente: string): string[] {
  const f = paraComparar(fuente);
  return [...new Set(paraComparar(texto).match(HERRAMIENTAS) ?? [])].filter((h) => !f.includes(h));
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
  return reuniones.flatMap((r) => r.turnos.filter((t) => esDelCliente(r, t.hablante) || confirmacion(r, t.n)).map((t) => t.texto)).join("\n");
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

/** Lo que habla de una meta; y lo que dice qué pasa hoy (con eso, la cifra es un resultado frente a la meta). */
const ES_UNA_META = /\bmeta\b|\bobjetivo\b|\bquieren llegar\b|\bdeberia\b|\btiene que haber\b/;
const ES_DE_HOY = /\bhoy\b|\bactual|\bhace(s|n)?\b|\blogra|\balcanza|\bse quedan?\b|\bsolo\b|\bmitad\b/;

/** Lo que dijo con dudas: la cifra sale, pero dice qué falta validar. */
const CON_DUDAS = /si no me equivoco|no tengo el dato|no se exacto|mas o menos|aproximad|por ahi|no estoy segur|creo que/;
export const NOTA_DE_LO_RESUMIDO = "Lo resumimos en la reunión y lo confirmaste: falta validarlo con tus datos.";
export const NOTA_DE_MEMORIA = "Lo dijiste de memoria: falta confirmar el dato exacto y su período.";

/**
 * Cómo se sabe una cifra, con la regla en el código (10 nov): no es «declarada» si su número grande no lo dijo la empresa
 * (lo resumió Smarteam y ella confirmó: «25 clientes y se nos van 14» es ESTIMADA); una estimada sin base dice de dónde
 * sale; una declarada dicha con dudas («si no me equivoco») dice qué falta validar.
 */
export function estadoDeLaCifra(o: { estado: unknown; cifra: string; nota: string | null; citas: readonly CitaDelResumen[] }): { estado: EstadoDeLaCifra; nota: string | null } {
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
  return { estado, nota };
}

/** Lo que el agente escribió y quedó, y lo que se descartó (con su motivo, para el registro de la corrida). */
export interface LoQueEscribioElAgente {
  negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>>;
  recorrido: EtapaDelResumen[];
  operativas: AreaOperativa[];
  /** Solo el «por qué» de cada equipo de la escala (los hallazgos son del formato 1). */
  areas: Record<string, AreaDelResumenGuardada>;
  pendientes: PendienteDelResumen[];
  entendimos: PreguntaDelResumen[];
  descartados: string[];
  /**
   * Las cifras con su cita verificada que se cayeron solo porque traen un número que la cita no dice (una resta, un
   * porcentaje, «1 800»): se piden una vez más, corregidas (`pedidoDelArreglo`).
   */
  porArreglar: DatoPorArreglar[];
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

type Reglas = ReglasDelResumen & { parse: (texto: string) => Record<string, unknown>; firmas: Readonly<Record<string, string>> };

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
): { texto: string; citas: CitaDelResumen[] } | null {
  const x = objeto(v);
  const citas = [...arreglo(x.citas), ...(x.cita ? [x.cita] : [])]
    .slice(0, 3)
    .map((c) => citaVerificada(c, ctx.reuniones))
    .filter((c): c is CitaDelResumen => !!c);
  const t = textoValido(typeof v === "string" ? v : x.texto, tope, o, citas.map((c) => c.texto).join(" "));
  if (!t.ok) {
    descartados.push(`${donde}: ${t.motivo}`);
    return null;
  }
  if (!citas.length) {
    descartados.push(`${donde} sin una cita que esté en la reunión («${t.texto.slice(0, 60)}…»)`);
    return null;
  }
  const lo = citas.map((c) => c.texto).join(" ");
  const todo = [t.texto, ...extras].join(" ");
  const sobran = cifrasDeMas(todo, lo);
  if (sobran.length) {
    descartados.push(`${donde} con números que no están en su cita (${sobran.join(", ")})`);
    return null;
  }
  const herramientas = herramientasDeMas(todo, lo);
  if (herramientas.length) {
    descartados.push(`${donde} nombra herramientas que la empresa no nombró en lo citado (${herramientas.join(", ")})`);
    return null;
  }
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
  const deLasAreas = new Set(ctx.areas.map((a) => a.id));
  const nombreDelArea = (id: string) => ctx.areas.find((a) => a.id === id)?.nombre ?? id;

  // 1 · El negocio.
  const negocio: Partial<Record<TipoDelNegocio, PiezaDelResumen[]>> = {};
  let n = 0;
  for (const tipo of TIPOS_DEL_NEGOCIO) {
    const piezas: PiezaDelResumen[] = [];
    for (const v of arreglo(objeto(crudo.negocio)[tipo])) {
      if (piezas.length >= MAX_POR_PARTE_DEL_NEGOCIO) break;
      const p = conSuCita(v, ctx, o, descartados, `«${TITULO_DEL_NEGOCIO[tipo]}»`);
      if (p) piezas.push({ id: `n${++n}`, ...p, origen: origenDeLaCita(p.citas[0]) });
    }
    if (piezas.length) negocio[tipo] = piezas;
  }

  // 2 · El recorrido.
  const recorrido: EtapaDelResumen[] = [];
  for (const v of arreglo(crudo.recorrido)) {
    if (recorrido.length >= MAX_ETAPAS) break;
    const x = objeto(v);
    const nombre = textoValido(x.etapa ?? x.nombre, TOPE_DE_UN_NOMBRE, o);
    if (!nombre.ok) {
      descartados.push(`etapa del recorrido: ${nombre.motivo}`);
      continue;
    }
    const friccion = nulo(x.friccion) ? null : textoValido(x.friccion, TOPE_DEL_TEXTO_DEL_RESUMEN, o);
    if (friccion && !friccion.ok) {
      descartados.push(`la fricción de «${nombre.texto}»: ${friccion.motivo}`);
      continue;
    }
    const quien = nulo(x.quien) ? null : textoValido(x.quien, TOPE_DE_UN_NOMBRE, o);
    const p = conSuCita(x, ctx, o, descartados, `etapa «${nombre.texto}»`, TOPE_DEL_TEXTO_DEL_RESUMEN, [nombre.texto, friccion?.ok ? friccion.texto : ""]);
    if (!p) continue;
    recorrido.push({ id: `s${recorrido.length + 1}`, nombre: nombre.texto, quien: quien?.ok ? quien.texto : null, ...p, friccion: friccion?.ok ? friccion.texto : null, origen: origenDeLaCita(p.citas[0]) });
  }

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
    const lista = (crudoDeLista: unknown, prefijo: string, que: string, max: number): PiezaDelResumen[] => {
      const out: PiezaDelResumen[] = [];
      for (const y of arreglo(crudoDeLista)) {
        if (out.length >= max) break;
        const p = conSuCita(y, ctx, o, descartados, donde(que));
        if (p) out.push({ id: `${prefijo}${out.length + 1}`, ...p, origen: origenDeLaCita(p.citas[0]) });
      }
      return out;
    };
    const retos: RetoDelResumen[] = [];
    for (const y of arreglo(x.retos)) {
      if (retos.length >= MAX_RETOS) break;
      const p = conSuCita(y, ctx, o, descartados, donde("un reto"));
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
      const citas = arreglo(c.citas)
        .slice(0, 3)
        .map((z) => citaVerificada(z, ctx.reuniones))
        .filter((z): z is CitaDelResumen => !!z);
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
      const revisadas = [
        ["la cifra", textoValido(crudas.cifra, TOPE_DE_LA_CIFRA, o, citado)],
        ["el texto", textoValido(crudas.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o, citado)],
        ...(crudas.nota !== null ? [["la nota", textoValido(crudas.nota, TOPE_DE_UNA_PREGUNTA, o, citado)] as const] : []),
      ] as const;
      const deForma = (r: ReturnType<typeof textoValido>) => !r.ok && r.motivo.startsWith("es demasiado largo");
      const deFondo = revisadas.find(([, r]) => !r.ok && !deForma(r));
      const todo = `${crudas.cifra} ${crudas.texto} ${crudas.nota ?? ""}`;
      const herramientas = herramientasDeMas(todo, citado);
      if (deFondo && !deFondo[1].ok) {
        descartados.push(`${nombre}: ${deFondo[1].motivo}`);
        continue;
      }
      if (herramientas.length) {
        descartados.push(`${nombre} nombra herramientas que la empresa no nombró en lo citado (${herramientas.join(", ")})`);
        continue;
      }
      const sobran = cifrasDeMas(todo, citado);
      const conclusion = concluyeDeMas(`${crudas.texto} ${crudas.nota ?? ""}`, citado);
      const problemas = [
        ...(conclusion ? [`saca una conclusión que la cita no dice («${conclusion}»): quítala`] : []),
        ...revisadas.filter(([, r]) => deForma(r)).map(([que, r]) => `${que} ${!r.ok ? r.motivo : ""}`),
        ...(sobran.length ? [`trae números que no están en lo citado (${sobran.map((x) => x.replace(/·$/, "").replace("·", " ")).join(", ")})`] : []),
      ];
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
    const falta = nulo(x.falta) ? null : sinCitaPropia(x.falta, TOPE_DE_UNA_PREGUNTA, o, todoLoDicho, descartados, donde("lo que falta"));
    const area: AreaOperativa = {
      id,
      nombre: nombre.texto,
      areaId,
      organizacion: lista(x.organizacion, "g", "la organización", MAX_PIEZAS_POR_LISTA),
      bien: lista(x.bien, "b", "lo que ya hace bien", MAX_PIEZAS_POR_LISTA),
      frena: lista(x.frena, "f", "lo que la frena", 2),
      retos,
      cifras,
      falta,
    };
    const conAlgo = area.organizacion.length + area.bien.length + area.frena.length + area.retos.length + area.cifras.length > 0;
    if (!conAlgo && !porArreglar.some((p) => p.operativa === id)) {
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
    const t = sinCitaPropia(x.texto, TOPE_DEL_PORQUE, o, todoLoDicho, descartados, `por qué de ${area.nombre}`);
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
    const t = sinCitaPropia(x.texto, TOPE_DE_UNA_PREGUNTA, o, todoLoDicho, descartados, `pendiente (${tipo})`);
    if (!t) continue;
    const citas = arreglo(x.citas)
      .slice(0, 3)
      .map((c) => citaVerificada(c, ctx.reuniones))
      .filter((c): c is CitaDelResumen => !!c);
    // Una contradicción se sostiene con las dos cosas dichas.
    if (tipo === "contradiccion" && citas.length < 2) {
      descartados.push(`contradicción sin sus dos citas («${t.slice(0, 60)}…»)`);
      continue;
    }
    const areaId = deLasAreas.has(cadena(x.area)) ? cadena(x.area) : null;
    pendientes.push({ id: `p${pendientes.length + 1}`, tipo, texto: t, areaId, citas });
  }
  const entendimos: PreguntaDelResumen[] = [];
  for (const v of arreglo(crudo.entendimos)) {
    if (entendimos.length >= MAX_PREGUNTAS) break;
    const t = sinCitaPropia(v, TOPE_DE_UNA_PREGUNTA, o, todoLoDicho, descartados, "«¿Entendimos bien?»");
    const conclusion = t ? concluyeDeMas(t, todoLoDicho) : null;
    if (conclusion) descartados.push(`«¿Entendimos bien?» saca una conclusión que nadie dijo («${conclusion}»)`);
    else if (t) entendimos.push({ id: `e${entendimos.length + 1}`, texto: t });
  }
  return { negocio, recorrido, operativas, areas, pendientes, entendimos, descartados, porArreglar };
}

// ── El arreglo de las cifras ────────────────────────────────────────────────────

const REGLAS_DEL_ARREGLO = `Corriges cifras para una página que Smarteam le presenta a una empresa. Cada una se descartó por un problema de forma, que te digo en «problemas»: un texto más largo que su tope, un número que NO está en lo que la empresa dijo (sus «citas»): una resta, una suma, un porcentaje calculado o un número de otra parte; o una conclusión que las citas no dicen (quítala).

Reescribe «cifra» (hasta 28 caracteres, lo que va en grande, con su unidad), «texto» (una línea con su período y su contexto, en tuteo, hablándole a la empresa: «tus clientes», «tu equipo») y «nota» (la base y los supuestos, o null) usando SOLO los números que aparecen en sus citas, tal como aparecen. No restes, no sumes, no calcules porcentajes, no redondees. Si con esos números no se puede decir la magnitud, omítela.

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
  o: ReglasDelResumen & { parse: (texto: string) => Record<string, unknown> },
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
    const lo = de.citas.map((c) => c.texto).join(" ");
    const todo = `${cifra.texto} ${texto.texto} ${nota?.ok ? nota.texto : ""}`;
    const sobran = cifrasDeMas(todo, lo);
    if (sobran.length || herramientasDeMas(todo, lo).length || concluyeDeMas(`${texto.texto} ${nota?.ok ? nota.texto : ""}`, lo)) {
      descartados.push(`cifra corregida «${cifra.texto}»: sigue con números o herramientas que no están en lo citado (${sobran.join(", ")})`);
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
 * Por qué el área está en su nivel, armado con los datos (sin IA): lo que la frena para subir y lo que la sostiene. Con
 * `provisional` (las partes por explorar que lo determinan), lo dice: el nivel depende de confirmarlas.
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
  if (provisional?.length)
    partes.push(`Es un nivel provisional: depende de ${nombresEntreComillas(provisional)}, que todavía ${provisional.length === 1 ? "es una hipótesis" : "son hipótesis"} por confirmar contigo.`);
  else if (siguiente && ordenadas.length)
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

  // Los equipos de la escala: su nivel, si es provisional y por qué está ahí.
  const areas: AreaDelResumenDeLaPagina[] = resultados.map((r) => {
    const a = g?.areas[r.areaId];
    const firma = firmaDelArea(chequeo, r.areaId, entorno);
    const vigente = !!a?.porque && !!r.nivel && a.porque.firma === firma;
    const provisional = nivelProvisional(r, o.porExplorar?.[r.areaId] ?? []);
    const respaldo = porqueDeRespaldo(r, provisional);
    return {
      areaId: r.areaId,
      nombre: r.areaNombre,
      nivel: r.nivel,
      nivelNombre: r.nivelNombre,
      provisional,
      porque: vigente ? a!.porque!.texto : respaldo,
      origenDelPorque: vigente ? (a!.porque!.mano ? "mano" : "agente") : respaldo ? "respaldo" : null,
      porqueViejo: !!a?.porque && !vigente,
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
    const e = estadoDeLaCifra({ estado: d.estado ?? "declarado", cifra: d.cifra, nota: d.nota ?? null, citas: d.citas });
    return conCita(
      { id: d.id, cifra: d.cifra, texto: d.texto, ...e, clave, conNota, dimensionNombre: nombreDeLaParte(d.dimensionId), fecha: noSale ? null : (d.citas[0]?.fecha ?? null), ...(d.mano ? { mano: true } : {}) },
      { citas: [...d.citas], ...(noSale ? { noSale } : {}) },
    );
  };
  const tarjetaVacia = (areaId: string, id: string, nombre: string): TarjetaDeLaPagina => {
    const a = areaDe(areaId)!;
    return {
      id,
      nombre,
      claveDelNombre: null,
      areaId,
      areaNombre: a.nombre,
      nivel: a.nivel,
      nivelNombre: a.nivelNombre,
      provisional: a.provisional,
      conPorque: false,
      organizacion: vacia(),
      bien: vacia(),
      frena: vacia(),
      retos: vacia(),
      cifras: [],
      cifraNueva: null,
      falta: null,
      claveDeLaFalta: null,
    };
  };

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

  // Las tarjetas: una por área operativa (formato 2) o por equipo de la escala (formato 1).
  let tarjetas: TarjetaDeLaPagina[] = [];
  if (v2) {
    for (const op of g!.operativas ?? []) {
      // Un equipo sin sesiones no lleva tarjeta aunque otra reunión lo mencione: va en «Qué falta validar», nunca como mal resultado.
      if (!deLaPagina.has(op.areaId) || fuera(op.nombre) || (conEquipos && !exploradas.has(op.areaId))) continue;
      const k = `op:${op.id}`;
      tarjetas.push({
        ...tarjetaVacia(op.areaId, op.id, op.nombre || (areaDe(op.areaId)?.nombre ?? "")),
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
      const rojos = g.datosRojos.filter((d) => d.areaId === r.areaId).flatMap((d) => cifra(d, `rojo:${d.id}`, false) ?? []);
      tarjetas.push({
        ...tarjetaVacia(r.areaId, `a${r.areaId}`, r.areaNombre),
        retos: { piezas: (g.areas[r.areaId]?.hallazgos ?? []).filter((h) => !fuera(h.texto)).map((h) => pieza(h, `hallazgo:${r.areaId}:${h.id}`)), nueva: `hallazgo:${r.areaId}:nuevo` },
        cifras: rojos,
      });
    }
  }
  // Un equipo con nivel o con sesiones que no quedó en ninguna tarjeta sale igual, con su nivel (sin Resumen, todos).
  for (const r of resultados) {
    if (tarjetas.some((t) => t.areaId === r.areaId)) continue;
    if (g && !r.nivel && conEquipos && !exploradas.has(r.areaId)) continue;
    if (!g && !r.nivel) continue;
    tarjetas.push(tarjetaVacia(r.areaId, `a${r.areaId}`, r.areaNombre));
  }
  // En el orden de los equipos de la página; el «por qué» va solo en la primera tarjeta de cada equipo.
  const orden = (id: string) => resultados.findIndex((r) => r.areaId === id);
  tarjetas = [...tarjetas].sort((a, b) => orden(a.areaId) - orden(b.areaId));
  const conPorque = new Set<string>();
  tarjetas = tarjetas.map((t) => {
    const primera = !conPorque.has(t.areaId);
    conPorque.add(t.areaId);
    return { ...t, conPorque: primera && !!areaDe(t.areaId)?.porque };
  });

  // Lo que falta validar: primero lo que calcula Nexus (equipos sin explorar, niveles provisionales), después lo escrito.
  const pendientes: PendienteDeLaPagina[] = [];
  if (g && conEquipos) {
    for (const r of resultados) {
      if (!exploradas.has(r.areaId))
        pendientes.push({
          id: `x${r.areaId}`,
          tipo: "no-explorada",
          texto: `Todavía no conversamos con ${r.areaNombre}: su lugar en la escala queda por medir contigo, no es un mal resultado.`,
          clave: null,
          areaNombre: r.areaNombre,
        });
    }
  }
  for (const a of areas) {
    if (!a.provisional) continue;
    pendientes.push({
      id: `h${a.areaId}`,
      tipo: "hipotesis",
      texto: `El nivel de ${a.nombre} (${a.nivelNombre}) es provisional: depende de confirmar ${nombresEntreComillas(a.provisional)}.`,
      clave: null,
      areaNombre: a.nombre,
    });
  }
  if (v2) {
    for (const p of g!.pendientes ?? []) {
      if (fuera(p.texto) || (p.areaId && !deLaPagina.has(p.areaId))) continue;
      pendientes.push(conCita({ id: p.id, tipo: p.tipo, texto: p.texto, clave: `pendiente:${p.id}`, areaNombre: p.areaId ? (areaDe(p.areaId)?.nombre ?? null) : null, ...(p.mano ? { mano: true } : {}) }, { citas: p.citas }));
    }
  } else if (g) {
    for (const p of g.falta) {
      if (fuera(p.texto)) continue;
      pendientes.push({ id: p.id, tipo: "por-confirmar", texto: p.texto, clave: `falta:${p.id}`, areaNombre: null, ...(p.mano ? { mano: true } : {}) });
    }
  }

  // El negocio y el recorrido: solo el formato 2 los tiene.
  const negocio = v2
    ? TIPOS_DEL_NEGOCIO.map((tipo) => ({ tipo, titulo: TITULO_DEL_NEGOCIO[tipo], lista: lista((g!.negocio?.[tipo] ?? []).filter((p) => !fuera(p.texto)), `negocio:${tipo}`) }))
    : null;
  const recorrido = v2
    ? (g!.recorrido ?? [])
        .filter((e) => !fuera(`${e.nombre} ${e.texto} ${e.friccion ?? ""}`))
        .map((e) => conCita({ id: e.id, nombre: e.nombre, quien: e.quien, texto: e.texto, friccion: e.friccion, clave: `etapa:${e.id}`, ...(e.mano ? { mano: true } : {}) }, { citas: [...e.citas] }))
    : null;

  const datosRojos = v2 ? [] : tarjetas.flatMap((t) => t.cifras.map((c) => ({ id: c.id, cifra: c.cifra, texto: c.texto, areaId: t.areaId, areaNombre: t.areaNombre, dimensionNombre: c.dimensionNombre, fecha: c.fecha, ...(o.conCitas ? { citas: c.citas, ...(c.noSale ? { noSale: c.noSale } : {}) } : {}), ...(c.mano ? { mano: true } : {}) })));
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
    // Una pregunta que nombra un equipo que el cliente ya no ve (se armó cuando sí lo veía) no sale.
    entendimos: (g?.entendimos ?? []).filter((p) => !fuera(p.texto)),
    areas,
    datosRojos,
    falta: v2 ? [] : (g?.falta ?? []).filter((p) => !fuera(p.texto)),
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
  `^(hicimos|rojo:${ID}(:cifra|:texto)?|hallazgo:\\d{1,4}:${ID}|porque:\\d{1,4}|(entendimos|falta|pendiente):${ID}|negocio:(${TIPOS_DEL_NEGOCIO.join("|")}):${ID}|etapa:${ID}(:nombre|:texto|:friccion)?|op:${ID}(:nombre|:falta|:(org|bien|frena|reto):${ID}|:cifra:${ID}(:cifra|:texto|:nota)?)?)$`,
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
  const reglas = { personas: le.personas, areasFuera: le.areasFuera ?? [], parse: parseObject, firmas: le.firmas };
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
      const a = leerElArreglo(r3, e.porArreglar, reglas);
      e = { ...e, operativas: conLoArreglado(e.operativas, a.cifras), descartados: [...e.descartados, ...a.descartados] };
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las cifras falló: quedaron fuera"] };
    }
  }
  return { ...e, usos, cortado };
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
