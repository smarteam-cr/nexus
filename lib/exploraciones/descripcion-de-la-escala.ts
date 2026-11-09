/**
 * lib/exploraciones/descripcion-de-la-escala.ts — LA DESCRIPCIÓN DE CADA EQUIPO bajo «Resultado general» en la escala que
 * se le presenta al cliente (Elías, 8 nov, Centauro Solutions). PURO (sin base ni red).
 *
 * Antes la página decía «Por lo que hemos visto hasta ahora, tu área depende más del esfuerzo de cada persona que de un
 * sistema… 1 de las 8 partes está por explorar: es lo que creemos por lo conversado, y lo confirmamos contigo». Elías: que
 * sea puntual y fácil de entender para alguien de negocio con poco tiempo, con lo que Nexus sabe de esa empresa, y sin
 * fórmulas de relleno (lo «por explorar» ya lo muestra el radar).
 *
 * Tres orígenes, en este orden (`descripcionDelArea`, el ÚNICO lugar que decide qué texto sale, en la página del cliente y
 * en el artefacto interno):
 *   1. la guardada (`contenido.descripcionesDeLaEscala[area]`), la escriba el agente (./descripcion-de-la-escala-server.ts)
 *      o una persona a mano (la operación `descripcionDeLaEscala`), SOLO si sigue VIGENTE: se escribió con los mismos
 *      niveles que el área tiene hoy (`firmaDelArea`). Si un nivel cambió después, puede decir algo que el radar ya no
 *      dice (otro «lo que más frena»): no sale, y la pantalla interna avisa que hay que regenerarla o confirmarla;
 *   2. si no, la de respaldo (`descripcionDeRespaldo`), armada con los datos, que ya cumple las mismas reglas.
 * El agente nunca mueve un número: los niveles, lo que más frena y el puntaje salen del cálculo; él solo los cuenta en
 * palabras de la empresa, con lo que se vio de ella (lo que leyó de cada parte y las minutas de sus reuniones, que llegan
 * del chokepoint de sesiones). Lo que devuelve pasa por `descripcionValida`: con voseo, el nombre de un nivel, una cifra
 * que no leyó, una fórmula de relleno o demasiado largo, se descarta y queda la de respaldo.
 * Las pruebas: descripcion-de-la-escala.test.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { primeraOracion } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import type { ContenidoDeExploracion, EstimadoGuardado } from "./contenido";

/** El tope de lo que escribe el agente: dos frases cortas. Lo que pasa de ahí se descarta. */
export const TOPE_DE_LA_DESCRIPCION = 360;
/** El tope de lo que escribe una persona a mano: más holgado, la decide ella. */
export const TOPE_DE_LA_DESCRIPCION_A_MANO = 700;

/** Lo que queda guardado por área en `contenido.descripcionesDeLaEscala`. */
export interface DescripcionGuardada {
  texto: string;
  /** Quién la escribió: el agente o una persona a mano. */
  origen: "agente" | "mano";
  /** Los niveles del área cuando se escribió (`firmaDelArea`): si cambian, deja de salir. */
  firma: string;
  /** Cuándo (ISO). */
  at: string;
  /** Quién la pidió o la escribió (correo), si se sabe. */
  por?: string | null;
}

export type OrigenDeLaDescripcion = DescripcionGuardada["origen"] | "respaldo";

/** Lo que se muestra de un área, y de dónde salió. */
export interface DescripcionDelArea {
  /** El texto bajo «Resultado general»: lo que ve el cliente. */
  texto: string;
  origen: OrigenDeLaDescripcion;
  /**
   * La guardada, aunque no salga (para la pantalla interna: editarla, o avisar que quedó vieja). null: no hay ninguna.
   */
  guardada: DescripcionGuardada | null;
  /** La guardada se escribió con los niveles de hoy. False con una guardada: quedó vieja y sale la de respaldo. */
  vigente: boolean;
}

/**
 * Lo demás que cambia el resultado de un área sin tocar sus niveles: la edición por industria y el perfil del negocio
 * deciden qué partes aplican (un área en medición puede quedar completa), y la versión publicada de la escala, sus textos
 * y su cálculo (revisión del 8 nov).
 */
export interface EntornoDeLaFirma {
  edicion?: string | null;
  perfilCierre?: string | null;
  perfilDespues?: string | null;
  escalaVersion?: string | null;
}

/**
 * Lo que mueve el resultado de un área (y por eso su descripción), como texto: por dimensión, su nivel y si es una hipótesis,
 * un riesgo o un «no sé», y el entorno. Sale solo de lo confirmado: los ids de dimensión son `área.n`.
 */
export function firmaDelArea(chequeo: Readonly<Record<string, EstimadoGuardado>>, areaId: string, entorno: EntornoDeLaFirma = {}): string {
  const niveles = Object.entries(chequeo)
    .filter(([id]) => id.startsWith(`${areaId}.`))
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([id, e]) => `${id}:${e.nivel}${e.fuente === "hipotesis" ? "h" : ""}${e.riesgo ? "r" : ""}${e.noSabe ? "n" : ""}`)
    .join(",");
  return `${niveles}|${entorno.edicion ?? ""}|${entorno.perfilCierre ?? ""}|${entorno.perfilDespues ?? ""}|${entorno.escalaVersion ?? ""}`;
}

/** Debajo de Funcional: la base que se sostiene en el esfuerzo de cada persona. */
const esBaja = (l: Letra | null) => l !== null && LETRAS.indexOf(l) < LETRAS.indexOf("F");

const nombresEntreComillas = (xs: readonly string[]) => {
  const q = xs.map((x) => `«${x}»`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} y ${q[q.length - 1]}`;
};

/**
 * La descripción armada con los datos, para cuando no hay una guardada vigente. Cumple las mismas reglas que la del
 * agente: qué significa hoy para el equipo, lo que más lo frena y lo que cuesta quedarse así. Sin conteos de partes, sin
 * «por explorar» ni «lo confirmamos contigo» (el radar ya lo muestra).
 */
export function descripcionDeRespaldo(r: Pick<ResultadoDelTest, "areaNombre" | "nivel" | "capas" | "recomendacion" | "dimensiones" | "preguntadas">): string {
  const Equipo = `Tu equipo de ${r.areaNombre}`;
  if (r.preguntadas === 0) return `Todavía no conocemos cómo trabaja tu equipo de ${r.areaNombre}. Cuando lo conozcamos, aquí verás cómo está hoy y qué lo frena.`;

  if (!r.nivel) {
    // En medición: lo que ya se vio, y qué falta para darle un nivel general (por su nombre: un conteo no dice nada).
    const medidas = r.dimensiones.filter((d) => d.preguntada && d.nivel);
    const bajas = medidas.filter((d) => esBaja(d.nivel)).length;
    const visto =
      bajas * 2 >= medidas.length
        ? `${Equipo} se sostiene más en el esfuerzo de cada persona que en un sistema.`
        : `${Equipo} tiene su base montada.`;
    const faltan = r.dimensiones.filter((d) => !d.preguntada || !d.nivel).map((d) => d.nombre);
    const falta = faltan.length && faltan.length <= 3 ? `Para darle un nivel general nos falta conocer ${nombresEntreComillas(faltan)}.` : "Para darle un nivel general nos falta conocer el resto de sus partes.";
    return `${visto} ${falta}`;
  }

  const base = r.capas.find((c) => c.clave === "base")?.nivel ?? null;
  const prod = r.capas.find((c) => c.clave === "produccion")?.nivel ?? null;
  const practica =
    esBaja(base) && esBaja(prod)
      ? `${Equipo} depende más del esfuerzo de cada persona que de un sistema, y eso se nota en lo que entrega hacia afuera.`
      : esBaja(base)
        ? `${Equipo} entrega hacia afuera, pero se sostiene en el esfuerzo de cada persona más que en un sistema.`
        : esBaja(prod)
          ? `${Equipo} tiene su base montada, pero todavía no se traduce en lo que entrega hacia afuera.`
          : `${Equipo} tiene su base montada y entrega bien hacia afuera: lo que sigue es afinarlo.`;
  const rec = r.recomendacion;
  if (rec?.tipo !== "trabajar") return practica;
  const costo = rec.costoDeQuedarse?.trim() ? primeraOracion(rec.costoDeQuedarse) : "";
  return `${practica} Lo que más lo frena es «${rec.dimensionNombre}».${costo ? ` ${costo}` : ""}`;
}

/**
 * El ÚNICO que decide qué texto sale bajo «Resultado general» de un área: la guardada si sigue vigente, o la de respaldo.
 * Lo usan la página del cliente (por `resultadosDeLaEscala`) y el artefacto interno.
 */
export function descripcionDelArea(
  contenido: Pick<ContenidoDeExploracion, "chequeo" | "descripcionesDeLaEscala">,
  r: Pick<ResultadoDelTest, "areaId" | "areaNombre" | "nivel" | "capas" | "recomendacion" | "dimensiones" | "preguntadas">,
  entorno: EntornoDeLaFirma = {},
): DescripcionDelArea {
  const guardada = contenido.descripcionesDeLaEscala?.[r.areaId] ?? null;
  const vigente = !!guardada && r.preguntadas > 0 && guardada.firma === firmaDelArea(contenido.chequeo, r.areaId, entorno);
  if (guardada && vigente) return { texto: guardada.texto, origen: guardada.origen, guardada, vigente };
  return { texto: descripcionDeRespaldo(r), origen: "respaldo", guardada, vigente: false };
}

// ── El pedido al agente ─────────────────────────────────────────────────────────

/** Lo que el agente sabe de cada área de la página. */
export interface AreaParaLaDescripcion {
  id: string;
  nombre: string;
  /** Con todas sus partes ubicadas lleva nivel general; si no, la página dice «En medición». */
  nivelGeneral: string | null;
  capas: { nombre: string; nivel: string | null }[];
  loQueMasFrena: { dimension: string; llevarA: string; costoDeQuedarse: string } | null;
  /**
   * El contexto que el CSE escribió para este equipo en el artefacto interno («agregar contexto», 8 nov): pesa más que lo
   * demás, entra al prompt y nunca sale tal cual. null: no escribió nada.
   */
  contextoDelEquipo: string | null;
  dimensiones: {
    nombre: string;
    capa: string;
    /** null: todavía no se sabe nada de esta parte. */
    nivel: string | null;
    /** Cómo es ese nivel, según la escala (la primera oración). */
    comoEs: string | null;
    /** Es una hipótesis del equipo, sin evidencia directa: no se da por hecha. */
    porExplorar: boolean;
    /** Lo que se vio de esta parte en la empresa (interno: se usa para entender, no se cita). */
    loQueSeVio: string | null;
  }[];
}

export interface ContextoDeLaDescripcion {
  empresa: string;
  areas: AreaParaLaDescripcion[];
  /** Las minutas de sus reuniones más recientes (del chokepoint de sesiones), o "". */
  reuniones: string;
  /** Las instrucciones adicionales del vendedor para la escala, ya como bloque, o "". */
  instrucciones: string;
}

/** El tope del contexto de un equipo que llega al agente. */
export const TOPE_DEL_CONTEXTO_DEL_EQUIPO = 2000;

/**
 * El contexto que el CSE escribió para un equipo. El campo y su operación los pone el artefacto interno editable
 * (`contenido.contextoDeLaEscala[área]`); aquí se lee tolerante, como texto o como `{ texto }`, porque solo se lee.
 */
export function contextoDelEquipo(contenido: unknown, areaId: string): string | null {
  if (!contenido || typeof contenido !== "object") return null;
  const todos = (contenido as { contextoDeLaEscala?: unknown }).contextoDeLaEscala;
  if (!todos || typeof todos !== "object") return null;
  const x = (todos as Record<string, unknown>)[areaId];
  const texto = typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { texto?: unknown }).texto === "string" ? (x as { texto: string }).texto : "";
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, TOPE_DEL_CONTEXTO_DEL_EQUIPO) : null;
}

/** Lo que el agente de la descripción lee de un resultado de la página. */
export function areaParaLaDescripcion(
  escala: Escala,
  r: ResultadoDelTest,
  chequeo: Readonly<Record<string, EstimadoGuardado>>,
  porExplorar: readonly string[],
  contexto: string | null = null,
): AreaParaLaDescripcion {
  const area = escala.areas.find((a) => a.id === r.areaId);
  const rec = r.recomendacion;
  return {
    id: r.areaId,
    nombre: r.areaNombre,
    nivelGeneral: r.nivelNombre,
    capas: r.capas.map((c) => ({ nombre: c.nombre, nivel: c.nivelNombre })),
    loQueMasFrena: rec?.tipo === "trabajar" ? { dimension: rec.dimensionNombre, llevarA: rec.objetivoNombre, costoDeQuedarse: rec.costoDeQuedarse } : null,
    contextoDelEquipo: contexto,
    dimensiones: r.dimensiones.map((d) => {
      const nivel = d.preguntada && d.nivel ? d.nivel : null;
      const comoEs = nivel ? area?.dimensiones.find((x) => x.id === d.id)?.niveles.find((n) => n.letra === nivel)?.descripcion : null;
      const e = chequeo[d.id];
      const visto = [e?.porQue, e?.evidencia ? `(lo que se escuchó: ${e.evidencia})` : ""].filter(Boolean).join(" ");
      return {
        nombre: d.nombre,
        capa: d.capa,
        nivel: nivel ? nombreDeNivel(escala, nivel) : null,
        comoEs: comoEs ? primeraOracion(comoEs) : null,
        porExplorar: porExplorar.includes(d.id),
        loQueSeVio: nivel && visto ? visto.slice(0, 700) : null,
      };
    }),
  };
}

/** El modelo: la descripción es corta, pero la lee el cliente; la misma de la exploración. */
export const MODELO_DE_LA_DESCRIPCION = "claude-sonnet-4-6";

const REGLAS = `Escribes, para una página que Smarteam (una consultora) le muestra a una empresa, el párrafo que va bajo «Resultado general» de cada uno de sus equipos (Ventas, Servicio, Marketing). Encima del párrafo ya se ve el nivel en grande y, al lado, un radar con cada parte del equipo.

Quién lo lee: alguien de negocio de esa empresa, con poco tiempo. Tiene que entenderlo en una lectura.

Qué escribes, por equipo: UNO o DOS frases cortas (hasta 45 palabras en total) que digan:
1. cómo trabaja hoy ese equipo en la práctica, con lo concreto de ESTA empresa (lo que se vio de ella), no una frase que serviría para cualquiera;
2. si el equipo tiene «loQueMasFrena», qué es y qué le cuesta hoy, en palabras de negocio.
Si el equipo no tiene nivel general («nivelGeneral» null), di lo que ya se ve y, en una frase corta, qué falta conocer para darle un nivel general: las partes sin nivel por su nombre si son hasta tres; si son más, «el resto de sus partes».

Cómo escribes: español neutro, en tuteo, hablándole a la empresa: «tu equipo», «tienes», «no sabes» (nunca «no saben», «ellos» ni «la empresa»), nunca voseo. «Lo que más lo frena» (al equipo). Directo, concreto, en presente. Sin markdown, sin adornos, sin frases hechas.

Lo que NO puedes hacer (si lo haces, tu texto se descarta):
- Nombrar un nivel de la escala ni usar esas palabras en ningún sentido («deficiente», «inicial», «funcional», «eficiente», «óptimo»): el nivel ya se ve en grande.
- Fórmulas de relleno o de procedencia: nada de «por lo que hemos visto», «hasta ahora», «por lo conversado», «lo confirmamos contigo», «por explorar», «hipótesis», ni contar partes («1 de las 8 partes»). Tampoco hables de reuniones, sesiones, conversaciones o del diagnóstico: habla del equipo, no de cómo lo supimos.
- Una parte con «porExplorar» es una sospecha, no algo que la empresa dijo: NO afirmes cómo está hoy esa parte («nadie registra por qué se pierde»). Si es «loQueMasFrena», nómbrala y di lo que cuesta en condicional o en general («sin saber por qué se pierde un negocio, cada vendedor se queda con su versión»). Lo concreto de la empresa sácalo de las partes sin «porExplorar».
- Nombrar personas (ni de la empresa ni de Smarteam), ni nombrar a Smarteam.
- Escribir cifras que no estén en lo que lees. Una cifra de la empresa que sí está (por ejemplo, cuántos casos reciben) se puede usar si ayuda.
- Recomendar productos, herramientas o servicios, prometer resultados o hablar de precios. Nombra una herramienta solo si la empresa ya la usa.
- Citar textual lo que alguien dijo.

«contextoDelEquipo», si viene, lo escribió el equipo de Smarteam que atiende a la empresa: pesa más que lo demás para elegir qué contar y cómo. No lo copies ni lo cites, y no digas que es lo que alguien de Smarteam piensa.

Devuelves SOLO este JSON: {"descripciones": [{"area": "<id del equipo>", "texto": "..."}]}, una entrada por cada equipo de los datos.`;

/** El pedido al agente: una sola llamada con todas las áreas de la página. `aviso`: por qué se descartó el intento anterior. */
export function pedidoDeLaDescripcion(ctx: ContextoDeLaDescripcion, aviso = ""): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const partes = [
    `La empresa: ${ctx.empresa}`,
    `Sus equipos, con lo que se sabe de cada uno:\n${JSON.stringify(ctx.areas, null, 1)}`,
    ctx.reuniones ? `Las minutas de sus reuniones más recientes (para entender a la empresa; no las cites ni las nombres):\n${ctx.reuniones}` : "",
    ctx.instrucciones,
    aviso,
  ].filter(Boolean);
  return {
    model: MODELO_DE_LA_DESCRIPCION,
    max_tokens: 1200,
    system: REGLAS,
    messages: [{ role: "user", content: partes.join("\n\n") }],
  };
}

/** Las minutas sin su encabezado («- Título (fecha): »): la fecha no es una cifra que la empresa dijo. */
const sinEncabezados = (minutas: string) => minutas.replace(/^- .*?\(\d[^)]*\): /gm, "");

/** Lo que se sabe de cada parte y el contexto del CSE: lo que la empresa hace, dicho por ella o visto por el equipo. */
const deSusPartes = (ctx: ContextoDeLaDescripcion) => ctx.areas.flatMap((a) => [a.contextoDelEquipo ?? "", ...a.dimensiones.map((d) => d.loQueSeVio ?? "")]).join("\n");

const sinTildes = (x: string) => x.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface ReglasDeLaDescripcion {
  /** Los nombres de los niveles de la escala («Inicial»…): ninguno puede salir. */
  niveles: readonly string[];
  /** Lo que dijo o hace la empresa (lo de sus partes y las minutas sin sus fechas): una cifra que no está aquí no sale. */
  deLaEmpresa: string;
  /** Todo lo interno que leyó (lo de la empresa y las instrucciones del vendedor): no se copia textual. */
  interno: string;
  /** Lo de sus partes o el contexto del CSE dicen HubSpot: lo usa. Una minuta que lo nombra no cuenta (se lo mostramos). */
  usaHubspot: boolean;
  /** Los nombres de la gente de Smarteam: ninguno puede salir. */
  equipo?: readonly string[];
}

/** Las reglas con que se valida lo que escribe el agente para `ctx`. */
export function reglasDeLaDescripcion(ctx: ContextoDeLaDescripcion, niveles: readonly string[], equipo: readonly string[] = []): ReglasDeLaDescripcion {
  const partes = deSusPartes(ctx);
  const deLaEmpresa = [partes, sinEncabezados(ctx.reuniones)].join("\n");
  return { niveles, deLaEmpresa, interno: [deLaEmpresa, ctx.instrucciones].join("\n"), usaHubspot: /hubspot/i.test(partes), equipo };
}

/** Las fórmulas de relleno o de procedencia que Elías pidió sacar (8 nov), y lo que habla de cómo lo supimos. */
const RELLENO =
  /por explorar|confirm\w*|lo que creemos|por lo (?:conversado|que hemos visto|que vimos)|hasta ahora|hasta el momento|de las \w+ partes|\bhipotesis\b|\bestimad[oa]s?\b|\bestimacion\b|\breunion(?:es)?\b|\bsesion(?:es)?\b|\bconversa\w*|\bnos (?:conto|contaron|contaste|dijo|dijeron|dijiste|comento|comentaron)\b|\bmenciona\w*|\bdiagnostico\b|\bsmarteam\b/;

/** Plata: un monto de una propuesta o de un presupuesto nunca sale, aunque esté en una minuta. */
const DINERO = /\$|\busd\b|\bdolar(?:es)?\b|\bcolon(?:es)?\b|₡|€|\beuros?\b|\bmillon(?:es)?\b|\bpresupuesto\b|\bprecio\b|\btarifa\b/;

/** Las cifras de un texto, sin separadores: «1.800» y «1800» son la misma. */
const cifras = (x: string) => (x.match(/\d[\d.,]*\d|\d/g) ?? []).map((c) => c.replace(/[.,]/g, ""));

/** Cuántas palabras seguidas iguales a lo leído cuentan como copia textual. */
export const PALABRAS_DE_UNA_COPIA = 6;
const palabras = (x: string) => sinTildes(x).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** La primera tira de `PALABRAS_DE_UNA_COPIA` palabras del texto que está tal cual en lo leído, o null. */
export function copiaTextual(texto: string, leido: string): string | null {
  const n = PALABRAS_DE_UNA_COPIA;
  const fuente = palabras(leido);
  const tiras = new Set<string>();
  for (let i = 0; i + n <= fuente.length; i++) tiras.add(fuente.slice(i, i + n).join(" "));
  const t = palabras(texto);
  for (let i = 0; i + n <= t.length; i++) {
    const tira = t.slice(i, i + n).join(" ");
    if (tiras.has(tira)) return tira;
  }
  return null;
}

/** ¿El texto del agente pasa las reglas? Devuelve el texto limpio, o por qué no. */
export function descripcionValida(crudo: unknown, o: ReglasDeLaDescripcion): { ok: true; texto: string } | { ok: false; motivos: string[] } {
  if (typeof crudo !== "string" || !crudo.trim()) return { ok: false, motivos: ["vino vacía"] };
  const texto = crudo.replace(/\s+/g, " ").trim();
  const motivos: string[] = [];
  if (texto.length > TOPE_DE_LA_DESCRIPCION) motivos.push(`es demasiado larga (${texto.length} caracteres; el tope es ${TOPE_DE_LA_DESCRIPCION})`);
  const t = sinTildes(texto);
  const relleno = t.match(RELLENO);
  if (relleno) motivos.push(`usa una fórmula de relleno o habla de cómo lo supimos («${relleno[0]}»)`);
  for (const n of o.niveles) {
    if (new RegExp(`(^|[^\\p{L}])${sinTildes(n)}($|[^\\p{L}])`, "u").test(t)) motivos.push(`nombra un nivel de la escala («${n}»)`);
  }
  const dinero = t.match(DINERO);
  if (dinero) motivos.push(`habla de plata («${dinero[0]}»)`);
  const leidas = new Set(cifras(o.deLaEmpresa));
  const ajenas = cifras(texto).filter((c) => !leidas.has(c));
  if (ajenas.length) motivos.push(`trae cifras que la empresa no dijo (${ajenas.join(", ")})`);
  if (/hubspot/.test(t) && !o.usaHubspot) motivos.push("nombra HubSpot y la empresa no lo usa");
  const copia = copiaTextual(texto, o.interno);
  if (copia) motivos.push(`copia textual algo que leyó («${copia}»)`);
  const voseo = voseoEnProsa(texto);
  if (voseo.length) motivos.push(`está en voseo (${voseo.join(", ")})`);
  for (const nombre of o.equipo ?? []) {
    const primero = nombre.trim().split(/\s+/)[0];
    if (primero && primero.length >= 3 && new RegExp(`(^|[^\\p{L}])${sinTildes(primero)}($|[^\\p{L}])`, "u").test(t)) motivos.push(`nombra a alguien de Smarteam («${primero}»)`);
  }
  return motivos.length ? { ok: false, motivos } : { ok: true, texto };
}

/** Lo que devolvió el agente, por área: el texto que pasó las reglas, o por qué se descartó. */
export interface LoQueEscribio {
  validas: Record<string, string>;
  descartadas: Record<string, string[]>;
}

/** Lee la respuesta con el lector de JSON compartido (`parse`: `parseObject`) y valida cada texto. */
export function leerLaDescripcion(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  o: ReglasDeLaDescripcion & { areas: readonly string[]; parse: (texto: string) => Record<string, unknown> },
): LoQueEscribio {
  const crudo = o.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  const lista = Array.isArray(crudo.descripciones) ? (crudo.descripciones as unknown[]) : [];
  const out: LoQueEscribio = { validas: {}, descartadas: {} };
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const area = typeof d.area === "string" ? d.area : typeof d.area === "number" ? String(d.area) : "";
    if (!o.areas.includes(area) || out.validas[area]) continue;
    const v = descripcionValida(d.texto, o);
    if (v.ok) {
      out.validas[area] = v.texto;
      delete out.descartadas[area];
    } else out.descartadas[area] = v.motivos;
  }
  for (const a of o.areas) if (!out.validas[a] && !out.descartadas[a]) out.descartadas[a] = ["no la devolvió"];
  return out;
}

/** El aviso para el segundo intento: qué texto se descartó y por qué. */
export function avisoDeLoDescartado(descartadas: Readonly<Record<string, string[]>>, areas: readonly Pick<AreaParaLaDescripcion, "id" | "nombre">[]): string {
  const lineas = Object.entries(descartadas).map(([id, m]) => `- ${areas.find((a) => a.id === id)?.nombre ?? id}: ${m.join("; ")}.`);
  return `⚠ Tu intento anterior se descartó por esto. Vuelve a escribir SOLO estos equipos, cumpliendo las reglas:\n${lineas.join("\n")}`;
}

/**
 * Pide la descripción y, con las áreas que no pasaron, UNA vez más diciéndole por qué. `pedir` hace la llamada (la app la
 * mide con `conContextoDeIA`; el simulacro no). Lo comparten la app y el simulacro: un solo lugar decide el reintento.
 */
export async function escribirConUnReintento(
  ctx: ContextoDeLaDescripcion,
  reglas: ReglasDeLaDescripcion & { parse: (texto: string) => Record<string, unknown> },
  pedir: (pedido: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Pick<Anthropic.Messages.Message, "content" | "usage">>,
): Promise<LoQueEscribio & { usos: Anthropic.Messages.Usage[] }> {
  const areas = ctx.areas.map((a) => a.id);
  const r1 = await pedir(pedidoDeLaDescripcion(ctx));
  const escrito = leerLaDescripcion(r1, { ...reglas, areas });
  const usos = [r1.usage];
  const faltan = Object.keys(escrito.descartadas);
  if (!faltan.length) return { ...escrito, usos };
  const r2 = await pedir(pedidoDeLaDescripcion({ ...ctx, areas: ctx.areas.filter((a) => faltan.includes(a.id)) }, avisoDeLoDescartado(escrito.descartadas, ctx.areas)));
  usos.push(r2.usage);
  const otra = leerLaDescripcion(r2, { ...reglas, areas: faltan });
  return { validas: { ...escrito.validas, ...otra.validas }, descartadas: otra.descartadas, usos };
}

/**
 * Qué se guarda de lo que escribió el agente, contra lo que hay AHORA en la fila (bloqueada). Un área se salta si su
 * guardada cambió mientras el agente escribía (alguien la escribió a mano: no se pisa sin aviso), o, con `soloFaltantes`
 * (la corrida en segundo plano del «Acceso»), si ya tiene una vigente.
 */
export function cualesSeGuardan(o: {
  nuevas: Readonly<Record<string, DescripcionGuardada>>;
  /** El `at` de la guardada de cada área cuando empezó la corrida, o null si no había. */
  alEmpezar: Readonly<Record<string, string | null>>;
  ahora: Readonly<Record<string, DescripcionGuardada>>;
  soloFaltantes: boolean;
  firmaDeHoy: (areaId: string) => string;
}): { guardar: Record<string, DescripcionGuardada>; saltadas: { areaId: string; motivos: string[] }[] } {
  const guardar: Record<string, DescripcionGuardada> = {};
  const saltadas: { areaId: string; motivos: string[] }[] = [];
  for (const [a, d] of Object.entries(o.nuevas)) {
    const actual = o.ahora[a] ?? null;
    if ((actual?.at ?? null) !== (o.alEmpezar[a] ?? null)) saltadas.push({ areaId: a, motivos: ["alguien la cambió mientras el agente escribía: se queda la suya"] });
    else if (o.soloFaltantes && actual && actual.firma === o.firmaDeHoy(a)) continue;
    else guardar[a] = d;
  }
  return { guardar, saltadas };
}
