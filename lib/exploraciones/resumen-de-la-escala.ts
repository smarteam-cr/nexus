/**
 * lib/exploraciones/resumen-de-la-escala.ts — EL RESUMEN de la escala que ve el cliente (Elías, 9 nov). PURO (sin base ni
 * red). Lo arma ./resumen-de-la-escala-server.ts.
 *
 * Marco presenta el diagnóstico de Centauro Solutions el jueves 12 de noviembre y tiene 15 a 20 minutos. La página de la
 * escala abría directo en un departamento; ahora abre en «Resumen», la portada que lo guía en cuatro partes:
 *   1. «Lo que hicimos»: cuántas sesiones, con qué equipos y cuánto tiempo invirtieron (la duración REAL de las
 *      reuniones: la conferencia de Meet; sin ella, el evento). Reconoce su esfuerzo. Sale de los datos, sin IA.
 *   2. «Lo que encontramos»: los hallazgos críticos de cada equipo, en pocas líneas, cada uno con la cita que lo sostiene.
 *   3. «Dónde quedan»: el nivel de cada equipo (del cálculo, nunca del agente) y una frase de por qué está ahí y no un
 *      nivel arriba o abajo. Si los niveles cambiaron desde que se escribió (`firmaDelArea`), sale la de respaldo.
 *   4. «La validación»: «¿Entendimos bien?» y «¿Falta algo?».
 * Arriba de todo, los DATOS ROJOS (Marco: «convencen más que cualquier nivel», y es lo que espera ver la CEO): dos o tres
 * cifras concretas del cliente que muestran cuánto está perdiendo («gana 25 clientes al mes y pierde 14»), cada una
 * conectada al equipo y a la parte de la escala que explica.
 *
 * ⛔ NINGUNA CIFRA SIN SU CITA. El agente devuelve, con cada dato rojo y cada hallazgo, de qué reunión y de qué turno sale;
 * el código busca esa cita en la transcripción (`verificarCita`, la del analizador de la venta: tolera los «eh» y las
 * frases partidas en dos turnos), exige que la haya dicho alguien del CLIENTE (o que alguien del cliente la confirme en el
 * turno siguiente: «Ajá. Exacto.», `confirmacion`) y que TODOS los números del texto estén en lo citado (`cantidadesDe`: «25 mil» no es «25 millones»). Lo que no pasa se descarta. Sin un dato rojo que pase, la sección
 * no sale. Los demás textos (por qué está ahí, las preguntas) no pueden traer números que no estén en las reuniones.
 * ⛔ Lo que ve el cliente (`resumenParaLaPagina` con `conCitas: false`) no lleva las citas, ni quién habló, ni los títulos
 * de las reuniones: solo de qué fecha sale cada dato (la misma regla de la escala: ni citas ni porqués salen del lienzo).
 * Se edita EN SU LUGAR en la página interna (la operación `resumenDeLaEscala`, `editarElResumen`). Lo editado a mano queda
 * marcado y «Rehacer con IA» no lo pisa (`juntarConLoEditado`). Las pruebas: resumen-de-la-escala.test.ts.
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
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  type AreaDelResumenDeLaPagina,
  type CitaDelResumen,
  type DatoRojoDeLaPagina,
  type LoQueHicimos,
  type PreguntaDelResumen,
  type ResumenDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
export { enHoras, TOPE_A_MANO, TOPE_DE_LA_CIFRA };
export type { AreaDelResumenDeLaPagina, CitaDelResumen, DatoRojoDeLaPagina, LoQueHicimos, PreguntaDelResumen, ResumenDeLaPagina };

// ── Lo que se guarda ────────────────────────────────────────────────────────────

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

/** Una reunión que ya pasó, para «Lo que hicimos». */
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
  hallazgos: HallazgoDelResumen[];
  /** Por qué está en su nivel y no uno arriba o abajo, con la firma de los niveles con que se escribió. */
  porque: { texto: string; firma: string; mano?: boolean } | null;
}

export interface ResumenGuardado {
  v: 1;
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
  datosRojos: DatoRojo[];
  areas: Record<string, AreaDelResumenGuardada>;
  entendimos: PreguntaDelResumen[];
  falta: PreguntaDelResumen[];
  /**
   * Lo que una persona quitó (`claveDeQuitado`): «Rehacer con IA» no lo vuelve a poner (revisión del 9 nov: si la CEO no
   * quería ver una cifra y alguien la quitó, rehacer la publicaba de nuevo sin aviso).
   */
  quitados?: string[];
}

/** Los topes. */
export const MAX_DATOS_ROJOS = 3;
export const MAX_HALLAZGOS_POR_AREA = 3;
export const MAX_PREGUNTAS = 3;
/**
 * Lo que puede tener una lista con lo que agrega una persona: más que lo del agente, pero con tope. La lectura del Json
 * (esquemas.ts) acepta más, así un Resumen nunca se pierde entero por pasarse.
 */
export const MAX_POR_LISTA = 8;
export const MAX_QUITADOS = 60;
export const TOPE_DEL_TEXTO_DEL_RESUMEN = 280;
/** Una afirmación para confirmar o una pregunta de la validación. */
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
   * Los que hablaron del lado del cliente (quien-hablo.ts). Vacío: no se sabe, y NADIE cuenta como de la empresa (revisión
   * del 9 nov: con «cualquiera», un número que Smarteam dijo en voz alta salía como dicho por la empresa).
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
}

/** El modelo: lee las transcripciones enteras y escribe lo que lee la CEO del cliente; las cifras las verifica el código. */
export const MODELO_DEL_RESUMEN = "claude-sonnet-4-6";
/** Lo que puede escribir: con Centauro usó unos 2 mil; tres equipos llenos rondan los 4 mil. Con margen, para no cortarse. */
export const MAX_TOKENS_DEL_RESUMEN = 8000;

const REGLAS = `Preparas la portada de la página que Smarteam (una consultora de HubSpot) le presenta a una empresa con el diagnóstico de sus equipos (Ventas, Servicio, Marketing). Quien presenta tiene 15 minutos; quien lee es la dirección de la empresa. Lees las transcripciones de las reuniones de diagnóstico, numeradas por turno, y lo que ya se ubicó de cada equipo en la escala.

Devuelves SOLO este JSON:
{"datosRojos":[{"cifra":"…","texto":"…","seEscapa":"…","area":"<id del equipo>","dimension":"<id de la parte o null>","citas":[{"reunion":"R1","turno":12,"texto":"…"}]}],
 "areas":[{"area":"<id>","hallazgos":[{"texto":"…","dimension":"<id o null>","citas":[{"reunion":"R1","turno":40,"texto":"…"}]}],"porque":"…"}],
 "entendimos":["…"],"falta":["…"]}

DATOS ROJOS (de 1 a 3; mejor dos fuertes que tres con una floja): cifras CONCRETAS que dijo la empresa y que muestran cuánto está perdiendo: clientes, negocios, tiempo, casos o dinero que se le escapan. Ejemplo: gana 25 clientes al mes y pierde 14 (escribe «14 de 25», nunca la resta «11»). Un volumen (cuántos tickets reciben, cuántos clientes tienen) NO es un dato rojo: tiene que decir qué se le escapa (clientes que se van, negocios que se caen, metas que no se cumplen, tiempo que se va en retrabajo). «seEscapa» dice eso en pocas palabras («clientes que se van», «la mitad de las reuniones»); si no lo puedes decir, no es un dato rojo. Si los números de la cita no cierran entre sí, no la uses. «cifra» es lo que va en grande (hasta 28 caracteres: «14 de 25», «3 días»); «texto», una línea que diga qué significa para la empresa. Cada número de «cifra» y de «texto» tiene que estar en lo que citas: copia en «citas» (hasta 3) lo dicho, palabra por palabra y tal como está escrito en la transcripción (con sus números en cifras o en letras, como aparezcan), un pedazo seguido de UNA intervención por cita, con su reunión y el número de ese turno. Lo tiene que haber dicho alguien de la EMPRESA; si lo resumió alguien de Smarteam, solo vale si alguien de la empresa lo confirmó justo después («Exacto», «Sí»): cita entonces lo que dijo Smarteam. No calcules porcentajes, ni sumes, ni redondees: si no lo dijeron así, no va. Si no hay cifras de pérdida dichas por la empresa, devuelve la lista vacía: es mejor ninguna que una floja.

HALLAZGOS (hasta 3 por equipo): lo más crítico que encontramos de ese equipo, una línea cada uno (hasta 30 palabras), concreto de ESTA empresa, con la parte de la escala que explica («dimension») y en «citas» (1 o 2) lo dicho por alguien de la empresa que lo sostiene, palabra por palabra, con su turno. Si el hallazgo trae un número, tiene que estar en esas citas. No agregues nada que las citas no digan. Solo de los equipos de los datos.

PORQUE (uno por equipo con nivel): una o dos frases cortas (hasta 50 palabras) de por qué ese equipo está en su nivel y no uno arriba ni uno abajo, con las partes por su nombre: qué lo frena para subir (las partes más bajas) y qué lo sostiene (las más altas). Usa SOLO los niveles que te damos; no inventes ni muevas ninguno. Si «abajo» es null (está en el nivel más bajo), di solo qué lo frena para subir. Sin nivel general, deja "porque" vacío.

ENTENDIMOS (2 o 3): afirmaciones cortas para que la empresa confirme si entendimos bien lo más importante («Que el seguimiento de cada cotización depende de la memoria del vendedor»).
FALTA (1 a 3): preguntas cortas sobre lo que no alcanzamos a ver (un equipo de los datos sin reuniones, una parte sin dato). Habla SOLO de los equipos de los datos: de ningún otro.

Nunca escribas el código de una parte («3.6»): nómbrala. Cómo escribes: español neutro, en tuteo, hablándole a la empresa («tu equipo», «pierdes», «no sabes»), nunca voseo. Directo, en presente, sin markdown ni frases hechas. No nombres a personas (ni de la empresa ni de Smarteam), no nombres a Smarteam, no hables de precios, presupuestos ni de lo que Smarteam vende, no recomiendes herramientas. «contexto» lo escribió el equipo de Smarteam: pesa para elegir qué contar, pero no lo copies.`;

/** El pedido al agente. `aviso`: por qué no sirvió el intento anterior. */
export function pedidoDelResumen(ctx: ContextoDelResumen, aviso = ""): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const reuniones = ctx.reuniones.map(
    (r) => `### ${r.clave} · ${r.fecha.slice(0, 10)}${r.equipo ? ` · con ${r.equipo}` : ""}\n${r.turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n")}`,
  );
  const partes = [
    `La empresa: ${ctx.empresa}`,
    `Sus equipos, con lo que ya se ubicó en la escala:\n${JSON.stringify(ctx.areas, null, 1)}`,
    `Las reuniones de diagnóstico (cada línea es un turno: [número] quien habla: lo que dijo):\n\n${reuniones.join("\n\n")}`,
    ctx.instrucciones,
    aviso,
  ].filter(Boolean);
  return { model: MODELO_DEL_RESUMEN, max_tokens: MAX_TOKENS_DEL_RESUMEN, system: REGLAS, messages: [{ role: "user", content: partes.join("\n\n") }] };
}

// ── Leer y verificar ────────────────────────────────────────────────────────────

const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arreglo = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cadena = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : typeof v === "number" ? String(v) : "");

/** Lo que nunca sale: plata de una venta y quién la vende (un monto que perdió la empresa sí, en un dato rojo con su cita). */
const PROHIBIDO = /\bpresupuesto\b|\bprecio\b|\btarifa\b|\bsmarteam\b|\blicencia/;

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
export function textoValido(crudo: unknown, tope: number, o: ReglasDelResumen): { ok: true; texto: string } | { ok: false; motivo: string } {
  const texto = cadena(crudo);
  if (!texto) return { ok: false, motivo: "vino vacío" };
  if (texto.length > tope) return { ok: false, motivo: `es demasiado largo (${texto.length} de ${tope})` };
  const t = paraComparar(texto);
  const prohibido = t.match(PROHIBIDO);
  if (prohibido) return { ok: false, motivo: `habla de «${prohibido[0]}»` };
  const voseo = voseoEnProsa(texto);
  if (voseo.length) return { ok: false, motivo: `está en voseo (${voseo.join(", ")})` };
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
const sinEspaciosDeMiles = (x: string) => x.replace(/(\d)[ \u00a0\u202f](?=\d{3}(?!\d))/g, "$1");

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
    .filter((p) => !palabrasDeLaFuente.has(p) && !(CANTIDADES_EN_PALABRAS[p] && hay.has(`${CANTIDADES_EN_PALABRAS[p]}·`)));
  return [...enCifras, ...enPalabras];
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
 * del «por qué» y de las preguntas (Centauro: «1800 al mes» lo calculó Marco en voz alta y nadie lo confirmó).
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

/** Lo que el agente escribió y quedó, y lo que se descartó (con su motivo, para el registro de la corrida). */
export interface LoQueEscribioElAgente {
  datosRojos: DatoRojo[];
  areas: Record<string, AreaDelResumenGuardada>;
  entendimos: PreguntaDelResumen[];
  falta: PreguntaDelResumen[];
  descartados: string[];
  /**
   * Los datos rojos con su cita verificada que se cayeron solo porque el texto trae un número que la cita no dice (una
   * resta, un porcentaje, «1 800»): se le piden una vez más, corregidos (`pedidoDelArreglo`).
   */
  porArreglar: DatoPorArreglar[];
}

export interface DatoPorArreglar {
  cifra: string;
  texto: string;
  areaId: string;
  dimensionId: string | null;
  citas: CitaDelResumen[];
  sobran: string[];
}

const dimensionDelArea = (ctx: ContextoDelResumen, areaId: string, v: unknown): string | null => {
  const id = cadena(v);
  return ctx.areas.find((a) => a.id === areaId)?.dimensiones.some((d) => d.id === id) ? id : null;
};

/**
 * Lee la respuesta (`parse`: el lector de JSON compartido, `parseObject`) y se queda con lo que pasa las reglas. `firmas`:
 * la de los niveles de cada área HOY (el «por qué» la guarda). `todoLoDicho`: las transcripciones juntas (los números de
 * un «por qué» o de una pregunta tienen que estar ahí).
 */
export function leerElResumen(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  ctx: ContextoDelResumen,
  o: ReglasDelResumen & { parse: (texto: string) => Record<string, unknown>; firmas: Readonly<Record<string, string>> },
): LoQueEscribioElAgente {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const descartados: string[] = [];
  const todoLoDicho = dichoPorLaEmpresa(ctx.reuniones);
  const deLasAreas = new Set(ctx.areas.map((a) => a.id));

  const datosRojos: DatoRojo[] = [];
  const porArreglar: DatoPorArreglar[] = [];
  for (const v of arreglo(crudo.datosRojos)) {
    if (datosRojos.length >= MAX_DATOS_ROJOS) break;
    const x = objeto(v);
    const areaId = cadena(x.area);
    const cifra = textoValido(x.cifra, TOPE_DE_LA_CIFRA, o);
    const texto = textoValido(x.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o);
    if (!deLasAreas.has(areaId)) {
      descartados.push(`dato rojo de un equipo que no sale (${areaId || "sin equipo"})`);
      continue;
    }
    // Un volumen no es un dato rojo: el agente tiene que poder decir qué se le escapa a la empresa.
    if ("seEscapa" in x && !cadena(x.seEscapa)) {
      descartados.push(`dato rojo «${cadena(x.cifra)}»: no dice qué se le escapa a la empresa (es un volumen, no una pérdida)`);
      continue;
    }
    if (!cifra.ok || !texto.ok) {
      descartados.push(`dato rojo: ${!cifra.ok ? cifra.motivo : !texto.ok ? texto.motivo : ""}`);
      continue;
    }
    if (!cantidadesDe(cifra.texto).length) {
      descartados.push(`dato rojo sin número («${cifra.texto}»)`);
      continue;
    }
    const citas = arreglo(x.citas)
      .slice(0, 3)
      .map((c) => citaVerificada(c, ctx.reuniones))
      .filter((c): c is CitaDelResumen => !!c);
    if (!citas.length) {
      descartados.push(`dato rojo «${cifra.texto}»: su cita no está en la reunión o no la dijo alguien de la empresa`);
      continue;
    }
    const sobran = cifrasDeMas(`${cifra.texto} ${texto.texto}`, citas.map((c) => c.texto).join(" "));
    if (sobran.length) {
      descartados.push(`dato rojo «${cifra.texto}»: trae números que no están en lo citado (${sobran.join(", ")})`);
      porArreglar.push({ cifra: cifra.texto, texto: texto.texto, areaId, dimensionId: dimensionDelArea(ctx, areaId, x.dimension), citas, sobran });
      continue;
    }
    if (datosRojos.some((d) => paraComparar(d.cifra) === paraComparar(cifra.texto))) continue;
    datosRojos.push({ id: `r${datosRojos.length + 1}`, cifra: cifra.texto, texto: texto.texto, areaId, dimensionId: dimensionDelArea(ctx, areaId, x.dimension), citas, origen: origenDeLaCita(citas[0]) });
  }

  const areas: Record<string, AreaDelResumenGuardada> = {};
  for (const v of arreglo(crudo.areas)) {
    const x = objeto(v);
    const areaId = cadena(x.area);
    const area = ctx.areas.find((a) => a.id === areaId);
    if (!area || areas[areaId]) continue;
    const hallazgos: HallazgoDelResumen[] = [];
    for (const h of arreglo(x.hallazgos)) {
      if (hallazgos.length >= MAX_HALLAZGOS_POR_AREA) break;
      const y = objeto(h);
      const t = textoValido(y.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o);
      if (!t.ok) {
        descartados.push(`hallazgo de ${area.nombre}: ${t.motivo}`);
        continue;
      }
      const citas = [...arreglo(y.citas), ...(y.cita ? [y.cita] : [])]
        .slice(0, 2)
        .map((c) => citaVerificada(c, ctx.reuniones))
        .filter((c): c is CitaDelResumen => !!c);
      if (!citas.length) {
        descartados.push(`hallazgo de ${area.nombre} sin una cita que esté en la reunión («${t.texto.slice(0, 60)}…»)`);
        continue;
      }
      const sobran = cifrasDeMas(t.texto, citas.map((c) => c.texto).join(" "));
      if (sobran.length) {
        descartados.push(`hallazgo de ${area.nombre} con números que no están en su cita (${sobran.join(", ")})`);
        continue;
      }
      hallazgos.push({ id: `h${areaId}-${hallazgos.length + 1}`, texto: t.texto, dimensionId: dimensionDelArea(ctx, areaId, y.dimension), citas, origen: origenDeLaCita(citas[0]) });
    }
    let porque: AreaDelResumenGuardada["porque"] = null;
    if (area.nivel && cadena(x.porque)) {
      const t = textoValido(x.porque, TOPE_DEL_PORQUE, o);
      const sobran = t.ok ? cifrasDeMas(t.texto, todoLoDicho) : [];
      if (!t.ok) descartados.push(`por qué de ${area.nombre}: ${t.motivo}`);
      else if (sobran.length) descartados.push(`por qué de ${area.nombre} con números que la empresa no dijo (${sobran.join(", ")})`);
      else porque = { texto: t.texto, firma: o.firmas[areaId] ?? "" };
    }
    areas[areaId] = { hallazgos, porque };
  }

  const preguntas = (v: unknown, prefijo: string, cual: string): PreguntaDelResumen[] => {
    const out: PreguntaDelResumen[] = [];
    for (const p of arreglo(v)) {
      if (out.length >= MAX_PREGUNTAS) break;
      const t = textoValido(p, TOPE_DE_UNA_PREGUNTA, o);
      if (!t.ok) {
        descartados.push(`${cual}: ${t.motivo}`);
        continue;
      }
      const sobran = cifrasDeMas(t.texto, todoLoDicho);
      if (sobran.length) {
        descartados.push(`${cual} con números que la empresa no dijo (${sobran.join(", ")})`);
        continue;
      }
      out.push({ id: `${prefijo}${out.length + 1}`, texto: t.texto });
    }
    return out;
  };
  return { datosRojos, areas, entendimos: preguntas(crudo.entendimos, "e", "«¿Entendimos bien?»"), falta: preguntas(crudo.falta, "f", "«¿Falta algo?»"), descartados, porArreglar };
}

// ── El arreglo de los datos rojos ───────────────────────────────────────────────

const REGLAS_DEL_ARREGLO = `Corriges cifras para una página que Smarteam le presenta a una empresa. Cada una se descartó porque su «cifra» o su «texto» traen un número que NO está en lo que la empresa dijo (sus «citas»): una resta, una suma, un porcentaje calculado o un número de otra parte.

Reescribe «cifra» (hasta 28 caracteres, lo que va en grande) y «texto» (una línea, en tuteo, hablándole a la empresa: «pierdes», «tu equipo») usando SOLO los números que aparecen en sus citas, tal como aparecen. No restes, no sumes, no calcules porcentajes, no redondees. Si con esos números no se puede decir lo que se pierde, omítela.

Devuelves SOLO este JSON: {"datosRojos":[{"i":<el número de la cifra>,"cifra":"…","texto":"…"}]}`;

/** El pedido del arreglo: solo las cifras caídas, con sus citas. Unos pocos cientos de tokens, sin las transcripciones. */
export function pedidoDelArreglo(xs: readonly DatoPorArreglar[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const datos = xs.map((x, i) => ({ i, cifra: x.cifra, texto: x.texto, numerosQueNoEstan: x.sobran.map((s) => s.replace(/·$/, "").replace("·", " ")), citas: x.citas.map((c) => c.texto) }));
  return { model: MODELO_DEL_RESUMEN, max_tokens: 800, system: REGLAS_DEL_ARREGLO, messages: [{ role: "user", content: JSON.stringify(datos, null, 1) }] };
}

/** Lee el arreglo y vuelve a verificar cada cifra contra SUS citas (las mismas, ya verificadas). */
export function leerElArreglo(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  xs: readonly DatoPorArreglar[],
  o: ReglasDelResumen & { parse: (texto: string) => Record<string, unknown> },
): { datosRojos: Omit<DatoRojo, "id">[]; descartados: string[] } {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const datosRojos: Omit<DatoRojo, "id">[] = [];
  const descartados: string[] = [];
  const usados = new Set<number>();
  for (const v of arreglo(crudo.datosRojos)) {
    const x = objeto(v);
    const i = typeof x.i === "number" ? x.i : Number(x.i);
    const de = xs[i];
    if (!de || usados.has(i)) continue;
    usados.add(i);
    const cifra = textoValido(x.cifra, TOPE_DE_LA_CIFRA, o);
    const texto = textoValido(x.texto, TOPE_DEL_TEXTO_DEL_RESUMEN, o);
    if (!cifra.ok || !texto.ok || !cantidadesDe(cifra.texto).length) {
      descartados.push(`dato rojo corregido «${cadena(x.cifra)}»: ${!cifra.ok ? cifra.motivo : !texto.ok ? texto.motivo : "sin número"}`);
      continue;
    }
    const sobran = cifrasDeMas(`${cifra.texto} ${texto.texto}`, de.citas.map((c) => c.texto).join(" "));
    if (sobran.length) {
      descartados.push(`dato rojo corregido «${cifra.texto}»: sigue con números que no están en lo citado (${sobran.join(", ")})`);
      continue;
    }
    datosRojos.push({ cifra: cifra.texto, texto: texto.texto, areaId: de.areaId, dimensionId: de.dimensionId, citas: de.citas, origen: origenDeLaCita(de.citas[0]) });
  }
  return { datosRojos, descartados };
}

/** Suma lo corregido a lo que ya pasó, sin repetir cifras y hasta el tope; los ids siguen la numeración. */
export function conLoArreglado(datos: readonly DatoRojo[], arreglados: readonly Omit<DatoRojo, "id">[]): DatoRojo[] {
  const out = [...datos];
  for (const a of arreglados) {
    if (out.length >= MAX_DATOS_ROJOS) break;
    if (out.some((d) => paraComparar(d.cifra) === paraComparar(a.cifra))) continue;
    let n = out.length + 1;
    while (out.some((d) => d.id === `r${n}`)) n++;
    out.push({ ...a, id: `r${n}` });
  }
  return out;
}

// ── Lo que hicimos ──────────────────────────────────────────────────────────────

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

/** Lo que dice «Lo que hicimos», con los datos de las reuniones. */
export function loQueHicimos(h: ResumenGuardado["hicimos"]): LoQueHicimos | null {
  if (!h.sesiones.length) return null;
  // Las personas de las sesiones que se cuentan (sin repetir); un Resumen sin ese dato, el total que se guardó.
  const conQuienes = h.sesiones.some((x) => x.quienes);
  const personas = conQuienes ? new Set(h.sesiones.flatMap((x) => x.quienes ?? [])).size : h.personas;
  h = { ...h, personas };
  const minutos = h.sesiones.reduce((s, x) => s + (x.minutos ?? 0), 0);
  const sinDuracion = h.sesiones.filter((x) => x.minutos === null).length;
  const equipos = [...new Set(h.sesiones.flatMap((x) => (x.equipo ? [x.equipo] : [])))];
  const n = h.sesiones.length;
  const tiempo = minutos ? `${sinDuracion ? "más de " : ""}${enHoras(minutos)}` : null;
  const deDatos = [
    `${tiempo ? `Nos dedicaste ${tiempo} en ` : "Nos dedicaste "}${n} ${n === 1 ? "sesión" : "sesiones"}${equipos.length ? ` con ${enLista(equipos)}` : ""}${h.personas > 1 ? `, con ${h.personas} personas de tu equipo` : ""}.`,
    "Todo lo que ves en esta página sale de lo que nos contaste ahí.",
  ].join(" ");
  return { sesiones: n, minutos, sinDuracion, equipos, personas: h.personas, texto: h.texto ?? deDatos, mano: h.texto !== null };
}

// ── Dónde quedan ────────────────────────────────────────────────────────────────

const idx = (l: Letra) => LETRAS.indexOf(l);
const nombresEntreComillas = (xs: readonly string[]) => enLista(xs.map((x) => `«${x}»`));

/** Por qué el área está en su nivel, armado con los datos (sin IA): lo que la frena para subir y lo que la sostiene. */
export function porqueDeRespaldo(r: Pick<ResultadoDelTest, "areaNombre" | "nivel" | "nivelNombre" | "dimensiones" | "niveles" | "recomendacion">): string | null {
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
 * muestra. Sale solo si tiene cita y todos los números de su cifra y su texto están en lo citado (`cifrasDeMas`, la misma
 * vara que al armarla). La cita se guarda aunque la cifra cambie: así, al corregirla con lo que dijo la empresa, vuelve.
 */
export function porQueNoSaleLaCifra(d: { cifra: string; texto: string; citas: readonly { texto: string }[] }): string | null {
  if (!d.citas.length) return "No sale al cliente: no tiene una cita de las reuniones que la sostenga. Si no va, quítala.";
  const sobran = cifrasDeMas(`${d.cifra} ${d.texto}`, d.citas.map((c) => c.texto).join(" ")).map((s) => `«${s.replace(/·$/, "").replace("·", " ")}»`);
  if (!sobran.length) return null;
  return `No sale al cliente: ${enLista(sobran)} ${sobran.length === 1 ? "no está" : "no están"} en lo que dijo la empresa. Corrígela con lo que dice la cita o quítala.`;
}

/**
 * EL ÚNICO que decide qué sale en el Resumen, en la página del cliente y en la interna. Solo de las áreas de la página
 * (`resultados`); el nivel sale del cálculo. `conCitas`: solo la pantalla interna (Marco verifica de dónde sale cada
 * cifra); la página del cliente nunca las lleva. Sin `conCitas` (la del cliente) tampoco sale una cifra que su cita no
 * sostiene (`porQueNoSaleLaCifra`); adentro sale marcada con `noSale`.
 */
export function resumenParaLaPagina(
  guardado: ResumenGuardado | null | undefined,
  resultados: readonly ResultadoDelTest[],
  chequeo: Readonly<Record<string, EstimadoGuardado>>,
  entorno: EntornoDeLaFirma,
  o: { conCitas: boolean; areasFuera?: readonly string[] },
): ResumenDeLaPagina {
  const deLaPagina = new Set(resultados.map((r) => r.areaId));
  const nombreDeLaParte = (id: string | null) => (id ? (resultados.flatMap((r) => r.dimensiones).find((d) => d.id === id)?.nombre ?? null) : null);
  const conCita = <T extends object>(x: T, citas: object) => (o.conCitas ? { ...x, ...citas } : x);
  const areas: AreaDelResumenDeLaPagina[] = resultados.map((r) => {
    const g = guardado?.areas[r.areaId];
    const firma = firmaDelArea(chequeo, r.areaId, entorno);
    const vigente = !!g?.porque && !!r.nivel && g.porque.firma === firma;
    const respaldo = porqueDeRespaldo(r);
    return {
      areaId: r.areaId,
      nombre: r.areaNombre,
      nivel: r.nivel,
      nivelNombre: r.nivelNombre,
      porque: vigente ? g!.porque!.texto : respaldo,
      origenDelPorque: vigente ? (g!.porque!.mano ? "mano" : "agente") : respaldo ? "respaldo" : null,
      porqueViejo: !!g?.porque && !vigente,
      hallazgos: (g?.hallazgos ?? []).map((h) => conCita({ id: h.id, texto: h.texto, dimensionNombre: nombreDeLaParte(h.dimensionId), ...(h.mano ? { mano: true } : {}) }, { citas: h.citas })),
    };
  });
  const datosRojos = (guardado?.datosRojos ?? [])
    .filter((d) => deLaPagina.has(d.areaId))
    .map((d) => ({ d, noSale: porQueNoSaleLaCifra(d) }))
    // ⛔ Afuera, una cifra sin cita que la sostenga no sale nunca (Elías, 9 nov).
    .filter((x) => o.conCitas || !x.noSale)
    .map(({ d, noSale }) =>
      conCita(
        {
          id: d.id,
          cifra: d.cifra,
          texto: d.texto,
          areaId: d.areaId,
          areaNombre: resultados.find((r) => r.areaId === d.areaId)?.areaNombre ?? "",
          dimensionNombre: nombreDeLaParte(d.dimensionId),
          fecha: noSale ? null : (d.citas[0]?.fecha ?? null),
          ...(d.mano ? { mano: true } : {}),
        },
        { citas: d.citas, ...(noSale ? { noSale } : {}) },
      ),
    );
  return {
    at: guardado?.at ?? null,
    // Una sesión con un equipo de la escala que el cliente no ve no se cuenta (ni su tiempo, ni su gente).
    hicimos: guardado ? loQueHicimos({ ...guardado.hicimos, sesiones: guardado.hicimos.sesiones.filter((x) => !x.areaId || deLaPagina.has(x.areaId)) }) : null,
    datosRojos,
    areas,
    // Una pregunta que nombra un equipo que el cliente ya no ve (se armó cuando sí lo veía) no sale.
    entendimos: (guardado?.entendimos ?? []).filter((p) => !nombraA(p.texto, o.areasFuera)),
    falta: (guardado?.falta ?? []).filter((p) => !nombraA(p.texto, o.areasFuera)),
  };
}

// ── Editar en su lugar ──────────────────────────────────────────────────────────

/**
 * Qué texto se edita: `hicimos` · `rojo:<id>:cifra` · `rojo:<id>:texto` · `rojo:<id>` (solo para quitarlo) ·
 * `hallazgo:<área>:<id>` (o `hallazgo:<área>:nuevo`) · `porque:<área>` · `entendimos:<id>` / `falta:<id>` (o `:nuevo`).
 */
export const CLAVE_DEL_RESUMEN = /^(hicimos|rojo:[\w-]{1,20}(:cifra|:texto)?|hallazgo:\d{1,4}:[\w-]{1,20}|porque:\d{1,4}|(entendimos|falta):[\w-]{1,20})$/;

/** Lo que mide una clave de lo quitado: corta, para que la lectura del Json nunca la rechace. */
const LARGO_DE_UNA_CLAVE = 160;

/**
 * Cómo se reconoce, al rehacer, algo que una persona quitó (revisión del 9 nov: el agente lo vuelve a escribir con otras
 * palabras). Un dato, por su cifra Y por la cita de la que nació; un hallazgo, por su cita (o su texto, si no tiene); una
 * pregunta, por su texto (y se compara por parecido: `pareceQuitada`).
 */
export function clavesDeQuitado(tipo: "rojo" | "hallazgo" | "entendimos" | "falta", x: { cifra?: string; texto: string; citas?: readonly CitaDelResumen[]; origen?: string }): string[] {
  const origen = x.citas ? origenDe({ origen: x.origen, citas: x.citas }) : x.origen;
  const corta = (k: string) => k.slice(0, LARGO_DE_UNA_CLAVE);
  if (tipo === "rojo") return [corta(`rojo:${paraComparar(x.cifra ?? "")}`), ...(origen ? [corta(`cita:${origen}`)] : [])];
  if (tipo === "hallazgo") return [corta(origen ? `cita:${origen}` : `hallazgo:${paraComparar(x.texto)}`)];
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
export function pareceQuitada(tipo: "rojo" | "hallazgo" | "entendimos" | "falta", x: Parameters<typeof clavesDeQuitado>[1], quitados: readonly string[]): boolean {
  const claves = clavesDeQuitado(tipo, x);
  if (claves.some((k) => quitados.includes(k))) return true;
  if (tipo !== "entendimos" && tipo !== "falta") return false;
  return quitados.some((k) => k.startsWith(`${tipo}:`) && parecidos(k.slice(tipo.length + 1), x.texto));
}

const quitar = (g: ResumenGuardado, claves: readonly string[]): ResumenGuardado => ({
  ...g,
  quitados: [...(g.quitados ?? []).filter((k) => !claves.includes(k)), ...claves].slice(-MAX_QUITADOS),
});

/**
 * Aplica una edición. `texto` null o vacío: quita (un dato, un hallazgo o una pregunta) o vuelve al de los datos (lo que
 * hicimos, el por qué). Lo editado queda `mano`. Devuelve el resumen nuevo o por qué no.
 */
export function editarElResumen(
  g: ResumenGuardado,
  clave: string,
  crudo: string | null,
  o: { firmaDe: (areaId: string) => string; areas: ReadonlySet<string>; en: string },
): { ok: true; resumen: ResumenGuardado } | { ok: false; error: string } {
  if (!CLAVE_DEL_RESUMEN.test(clave)) return { ok: false, error: "No se reconoce ese texto del Resumen." };
  const texto = crudo?.replace(/[ \t]+/g, " ").trim() ?? "";
  const [tipo, a, b] = clave.split(":");
  const tope = tipo === "rojo" && b === "cifra" ? TOPE_DE_LA_CIFRA : TOPE_A_MANO;
  if (texto.length > tope) return { ok: false, error: `El texto pasa de ${tope} caracteres.` };
  const nuevoId = (prefijo: string) => `${prefijo}m${Date.parse(o.en).toString(36)}`;
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
      let hallazgos: HallazgoDelResumen[];
      if (b === "nuevo") {
        if (!texto) return { ok: true, resumen: g };
        if (area.hallazgos.length >= MAX_POR_LISTA) return { ok: false, error: `Ya hay ${MAX_POR_LISTA} hallazgos en este equipo: quita uno antes de agregar otro.` };
        hallazgos = [...area.hallazgos, { id: nuevoId(`h${a}-`), texto, dimensionId: null, citas: [], mano: true }];
      } else {
        const h = area.hallazgos.find((x) => x.id === b);
        if (!h) return { ok: false, error: "Ese hallazgo ya no está." };
        if (!texto) return { ok: true, resumen: quitar({ ...g, areas: { ...g.areas, [a]: { ...area, hallazgos: area.hallazgos.filter((x) => x.id !== b) } } }, clavesDeQuitado("hallazgo", h)) };
        // Como en los datos rojos: si el texto nuevo trae un número que su cita no dice, la cita se va (queda el origen).
        const sigue = !cifrasDeMas(texto, h.citas.map((c) => c.texto).join(" ")).length;
        hallazgos = area.hallazgos.map((x) => (x.id === b ? { ...x, texto, mano: true, origen: origenDe(x), citas: sigue ? x.citas : [] } : x));
      }
      return { ok: true, resumen: { ...g, areas: { ...g.areas, [a]: { ...area, hallazgos } } } };
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
  }
  return { ok: false, error: "No se reconoce ese texto del Resumen." };
}

/**
 * Los ids de lo que escribió el agente, marcados con la corrida (`r1-k3x9`): una pantalla que quedó abierta con el Resumen
 * anterior no puede editar ni quitar, por el id, otra pieza que tomó su lugar (revisión del 9 nov). Responde «ya no está».
 */
export function conIdsDeLaCorrida<T extends Pick<LoQueEscribioElAgente, "datosRojos" | "areas" | "entendimos" | "falta">>(e: T, marca: string): T {
  const m = (id: string) => `${id}-${marca}`.slice(0, 20);
  return {
    ...e,
    datosRojos: e.datosRojos.map((d) => ({ ...d, id: m(d.id) })),
    areas: Object.fromEntries(Object.entries(e.areas).map(([a, x]) => [a, { ...x, hallazgos: x.hallazgos.map((h) => ({ ...h, id: m(h.id) })) }])),
    entendimos: e.entendimos.map((p) => ({ ...p, id: m(p.id) })),
    falta: e.falta.map((p) => ({ ...p, id: m(p.id) })),
  };
}

/**
 * «Rehacer con IA» sobre lo que hay: lo nuevo del agente, más lo que una persona escribió o cambió (`mano`), que no se
 * pisa. Un dato a mano con la misma cifra que uno nuevo se queda el de la persona.
 */
export function juntarConLoEditado(nuevo: ResumenGuardado, antes: ResumenGuardado | null | undefined): ResumenGuardado {
  if (!antes) return nuevo;
  // Lo que una persona quitó no vuelve.
  const quitados = antes.quitados ?? [];
  nuevo = {
    ...nuevo,
    datosRojos: nuevo.datosRojos.filter((d) => !pareceQuitada("rojo", d, quitados)),
    areas: Object.fromEntries(Object.entries(nuevo.areas).map(([id, a]) => [id, { ...a, hallazgos: a.hallazgos.filter((h) => !pareceQuitada("hallazgo", h, quitados)) }])),
    entendimos: nuevo.entendimos.filter((p) => !pareceQuitada("entendimos", p, quitados)),
    falta: nuevo.falta.filter((p) => !pareceQuitada("falta", p, quitados)),
    ...(antes.quitados?.length ? { quitados: antes.quitados } : {}),
  };
  /** Lo de la persona primero; lo nuevo después, sin lo repetido y con otro id si choca con uno de ella. */
  const junto = <T extends { id: string; mano?: boolean }>(viejos: readonly T[], nuevos: readonly T[], repetido: (a: T, b: T) => boolean = () => false): T[] => {
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
  };
  // Lo que la persona corrigió no vuelve con el valor del agente: el mismo dato es la misma cifra o la misma cita de origen.
  const mismoOrigen = (a: { origen?: string; citas: readonly CitaDelResumen[] }, b: { origen?: string; citas: readonly CitaDelResumen[] }) => !!origenDe(a) && origenDe(a) === origenDe(b);
  const datosRojos = junto(antes.datosRojos, nuevo.datosRojos, (a, b) => paraComparar(a.cifra) === paraComparar(b.cifra) || mismoOrigen(a, b));
  const areas: Record<string, AreaDelResumenGuardada> = { ...nuevo.areas };
  for (const [id, a] of Object.entries(antes.areas)) {
    const n = areas[id] ?? { hallazgos: [], porque: null };
    areas[id] = { hallazgos: junto(a.hallazgos, n.hallazgos, mismoOrigen).slice(0, MAX_POR_LISTA), porque: a.porque?.mano ? a.porque : n.porque };
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
 * Pide el Resumen y lee lo que vuelve. Si no se pudo leer (ningún equipo) o se cortó por largo, una vez más. Las cifras que
 * se cayeron por un número de más se piden corregidas, con sus citas (`pedidoDelArreglo`). `cortado`: el último intento
 * todavía vino cortado o sin ningún equipo, y NO se guarda (revisión del 9 nov: un Resumen vacío pisaba al anterior).
 * `pedir` hace la llamada (la app la mide con `conContextoDeIA`; el simulacro no). Lo comparten la app y el simulacro.
 */
export async function escribirElResumen(
  le: { ctx: ContextoDelResumen; personas: readonly string[]; firmas: Readonly<Record<string, string>>; areasFuera?: readonly string[] },
  pedir: (p: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Respuesta>,
): Promise<LoQueEscribioElAgente & { usos: Anthropic.Messages.Usage[]; cortado: boolean }> {
  const reglas = { personas: le.personas, areasFuera: le.areasFuera ?? [], parse: parseObject, firmas: le.firmas };
  const usos: Anthropic.Messages.Usage[] = [];
  const mal = (r: Respuesta, e: LoQueEscribioElAgente) => r.stop_reason === "max_tokens" || (!Object.keys(e.areas).length && le.ctx.areas.length > 0);
  let r = await pedir(pedidoDelResumen(le.ctx));
  usos.push(r.usage);
  let e = leerElResumen(r, le.ctx, reglas);
  if (mal(r, e)) {
    const aviso =
      r.stop_reason === "max_tokens"
        ? "⚠ Tu respuesta anterior se cortó por larga: escribe más corto (hallazgos de una línea) y devuelve SOLO el JSON pedido."
        : "⚠ Tu respuesta anterior no se pudo leer: devuelve SOLO el JSON pedido, con una entrada en «areas» por cada equipo.";
    r = await pedir(pedidoDelResumen(le.ctx, aviso));
    usos.push(r.usage);
    e = leerElResumen(r, le.ctx, reglas);
  }
  const cortado = mal(r, e);
  // Las cifras que se cayeron por un número de más (una resta, un porcentaje) se piden corregidas, con sus citas: la
  // cifra que más le importa a Marco no se pierde por cómo la escribió el modelo (Centauro: «11» por 25 − 14).
  if (!cortado && e.porArreglar.length && e.datosRojos.length < MAX_DATOS_ROJOS) {
    // Si el arreglo falla (Anthropic saturado), se guarda lo que ya se pagó, sin esas cifras.
    try {
      const r3 = await pedir(pedidoDelArreglo(e.porArreglar));
      usos.push(r3.usage);
      const a = leerElArreglo(r3, e.porArreglar, reglas);
      e = { ...e, datosRojos: conLoArreglado(e.datosRojos, a.datosRojos), descartados: [...e.descartados, ...a.descartados] };
    } catch {
      e = { ...e, descartados: [...e.descartados, "el arreglo de las cifras falló: quedaron fuera"] };
    }
  }
  return { ...e, usos, cortado };
}

// ── Qué reuniones lee y quién es de la empresa ─────────────────────────────────

/** El grabador de la reunión aparece como un hablante más: no es de la empresa. */
export const NO_ES_UNA_PERSONA = /notetaker|note taker|smarteam|gemini|fireflies|otter|read\.ai|tl;?dv/i;

/** Quiénes hablaron del lado de la empresa (sin el grabador). */
export function delClienteDe(personas: readonly { nombre: string; lado: string }[] | undefined): string[] {
  return (personas ?? []).filter((p) => p.lado === "cliente" && !NO_ES_UNA_PERSONA.test(p.nombre)).map((p) => p.nombre);
}

/**
 * Las reuniones que lee el agente, de la más vieja a la más nueva: solo con TRANSCRIPCIÓN (las notas de Gemini no dicen
 * quién habló) y solo de equipos que ve el cliente (una sin equipo, o de un equipo sin área, se lee). `fuentes` vienen
 * de la más nueva a la más vieja, como las da `transcripcionesDeLaExploracion`.
 */
export function reunionesQueLee<R extends { id: string; areaId: string | null }>(fuentes: readonly R[], conTranscripcion: ReadonlySet<string>, areasQueVe: ReadonlySet<string>): R[] {
  return fuentes.filter((r) => conTranscripcion.has(r.id) && (!r.areaId || areasQueVe.has(r.areaId))).reverse();
}
