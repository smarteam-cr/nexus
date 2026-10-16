/**
 * lib/contexto/material-del-documento.ts — lo que el «Contexto» de un DOCUMENTO le da a su agente:
 * las reuniones que lo alimentan (las mismas que muestra el panel), las notas del CSE y, desde el
 * 2026-10-07, sus «Instrucciones adicionales» (la entry `__doc` del canvas de la pieza).
 *
 * Lo leen los runners de los documentos de lib/contexto/documento.ts. Es más simple que el material
 * del cronograma a propósito: estos documentos no ubican reuniones en un plan ni arman un
 * calendario, solo necesitan LEERLAS.
 *
 * ── LAS REGLAS QUE NO SE NEGOCIAN ────────────────────────────────────────────
 *  · Las reuniones salen del chokepoint (`getProjectDocumentSessions` → `getProjectMemberSessions`):
 *    lo que el panel dice que alimenta es EXACTAMENTE lo que se lee. Pertenencia al cliente y
 *    tombstone no se re-implementan.
 *  · SOLO LAS ELEGIDAS, ENTERAS (etapa 7, DECISIONS «Los documentos leen la memoria y solo las
 *    reuniones elegidas»): en los seis documentos de `DESTINOS_SOLO_ELEGIDAS` entra solo la reunión
 *    que eligió una persona, y se lee ENTERA: su minuta y lo que se dijo (la transcripción, con el
 *    principio y el final si no entra), no el resumen de Gemini. Las notas de Gemini solo si no hay
 *    transcripción. Topes (lib/contexto/documento.ts): 160.000 caracteres en total, 60.000 por
 *    reunión y 6 enteras como mucho, las más recientes; las demás, en resumen (2.000 cada una), y
 *    pasadas las 24 no entran (`MAX_ELEGIDAS_A_LEER`). Primero se apartan las que no tienen nada que
 *    leer: una vacía no ocupa lugar. La transcripción se corta EN SQL: nunca se trae el texto entero.
 *    Si no se leyeron todas, la primera línea del bloque (después de la regla) dice cuántas y por qué.
 *    Sin elegidas el bloque queda en "" y `avisoSinReuniones` trae la línea que lo dice: el documento
 *    trabaja con la memoria del proyecto (lib/memoria), que el lector suma aparte. La exploración,
 *    mientras siga en el módulo, lee como antes (la regla sugerida, en resumen).
 *  · LA MINUTA EN UN DOCUMENTO DEL CLIENTE (`minutaParaElDocumento`): la regla de la memoria. Solo la
 *    revisada, y de ella solo los acuerdos y las decisiones, sin montos. Nunca el resumen, los riesgos
 *    ni una minuta en borrador. La ejecución (interna) la lee entera.
 *  · Solo las que YA ocurrieron (`soloOcurridas`): la agenda vive en la misma tabla y una reunión
 *    agendada leída como si hubiera pasado es un compromiso inventado.
 *  · Cada reunión va con su sala («CON EL CLIENTE» / «PUERTAS ADENTRO»): el diagnóstico lo lee el
 *    cliente, y lo dicho entre nosotros no puede aparecer como si lo hubiera dicho él.
 *  · El espacio se reparte (lib/contexto/documento.ts): con muchas reuniones cada una entra más corta,
 *    nunca se corta el bloque entero a la mitad. Una reunión que va en resumen lo dice en su encabezado.
 *  · LA FRONTERA VIAJA ADENTRO (etapa 4, 2026-10): el bloque de reuniones y el de notas empiezan con
 *    la regla de la pieza (`fronteraDeLaPieza`, lib/contexto/frontera-de-los-documentos.ts). En un
 *    documento que lee el cliente: nunca precios ni condiciones de lo que cobra Smarteam, nunca lo
 *    dicho puertas adentro como dicho por el cliente, nunca de dónde salió cada cosa. En uno interno
 *    (ejecución, exploración), solo la de puertas adentro. Va DENTRO del bloque para que ninguno de
 *    los siete lectores la pueda olvidar: no la repiten, y un lector nuevo la recibe sin saberlo.
 *    Las notas también la llevan: un correo pegado trae precios igual que una reunión. Sin material,
 *    los dos bloques quedan en "" y el mensaje de cada lector es el de antes, byte por byte. Con
 *    material, `cierreDeFrontera` la repite para el FINAL del mensaje (el bloque puede ser largo).
 *  · Lo INTERNO también sale separado (`materialInterno`): el texto de cada reunión leída y el de las
 *    notas, sin encabezados ni regla, para medir la copia (`huellasDeFrontera`) como el cronograma.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getProjectDocumentSessions } from "@/lib/sessions/project-sources";
import { esSoloElegidas } from "@/lib/sessions/destinos-de-contexto";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { recortarTranscripcion } from "@/lib/sessions/recortar-transcripcion";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { modeloDisponible } from "@/lib/db/esquema";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { bloqueDeInstruccionesDeDoc, docBriefFrom } from "@/lib/business-cases/section-briefs";
import {
  MAX_ELEGIDAS_A_LEER,
  MAX_ELEGIDAS_ENTERAS,
  MAX_REUNIONES_DEL_DOCUMENTO,
  PISO_POR_ELEGIDA_EN_RESUMEN,
  TOPE_NOTAS_DEL_DOCUMENTO,
  espacioPorElegida,
  espacioPorReunion,
  tieneQueLeer,
  type DocumentoConContexto,
} from "./documento";
import { fronteraDeLaPieza } from "./frontera-de-los-documentos";
import { traeNegociacion, traeUnMonto } from "./frontera-del-cronograma";
import { recortarReunion, resumenDeReunion, type MinutaDeReunion } from "./material-cronograma";
import { pieceBySlug } from "@/lib/pieces/registry";

export interface MaterialDelDocumento {
  /** El bloque de reuniones para el prompt, con la regla de la frontera adelante ("" si no hay ninguna que leer). */
  reuniones: string;
  /** El bloque de notas del CSE, con la regla de la frontera adelante ("" si no hay). */
  notas: string;
  /**
   * Lo INTERNO que entró al prompt, cada pieza por separado: el texto de cada reunión leída y el
   * cuerpo de las notas, sin encabezados ni la regla. De acá salen las huellas de la frontera
   * (`huellasDeFrontera`), igual que `materialInterno` del cronograma (material-cronograma.ts).
   */
  materialInterno: string[];
  /**
   * Las «Instrucciones adicionales» de este documento, ya rotuladas como reglas duras
   * (`bloqueDeInstruccionesDeDoc`), o "" si no hay: así un documento sin instrucciones arma el mismo
   * mensaje que antes. Van PRIMERO en el mensaje: son lo de más peso.
   */
  instrucciones: string;
  /**
   * Los ids de las reuniones que entraron al bloque de reuniones (las que tenían contenido). Quien suma la memoria del
   * proyecto (lib/memoria) se los pasa como `yaLeidas`, así la misma reunión no se lee dos veces.
   */
  sesionesUsadas: string[];
  /**
   * Solo en los seis documentos que leen las elegidas (etapa 7): la línea que dice que no hay reuniones
   * elegidas para leer (o que las elegidas todavía no tienen nada), para el lugar donde iría el bloque de
   * reuniones. "" si el bloque trae reuniones o si el documento no lee solo las elegidas (la exploración).
   */
  avisoSinReuniones: string;
  /**
   * La regla de la frontera otra vez, para el FINAL del mensaje (`cierreDeFronteraDelDocumento`): el bloque de reuniones
   * puede ser largo y la regla va al principio. "" sin reuniones ni notas: el mensaje queda como antes.
   */
  cierreDeFrontera: string;
  /** Para el encuadre del informe («4 sesiones entre el 2 y el 16 de septiembre»). */
  resumen: {
    leidas: number;
    /** Cuántas de las leídas entraron ENTERAS (etapa 7). Las demás, en resumen. En la exploración y en el assist, 0. */
    enteras: number;
    futuras: number;
    sinContenido: number;
    /** Elegidas con algo que leer que no entraron por espacio (pasadas las `MAX_ELEGIDAS_A_LEER`). Fuera de los seis, 0. */
    fueraDelTope: number;
    /** Cuántas reuniones que ya ocurrieron lo alimentan (las leídas son las más recientes, si no caben). */
    ocurridas: number;
    desde: number | null;
    hasta: number | null;
  };
}

function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}

export interface OpcionesDelMaterial {
  /**
   * Las elegidas en RESUMEN y no enteras (la regla de antes: el espacio repartido, sin la minuta). Lo usa «Mejorar con
   * IA» del diagnóstico (canvas-assist): manda el contexto entero en cada pedido, y 160.000 caracteres de transcripción
   * por pedido no se justifican para mejorar una sección.
   */
  elegidasEnResumen?: boolean;
}

export async function cargarMaterialDelDocumento(
  projectId: string,
  doc: DocumentoConContexto,
  opts: OpcionesDelMaterial = {},
): Promise<MaterialDelDocumento> {
  const [{ sessions }, categorias, notas, instrucciones] = await Promise.all([
    getProjectDocumentSessions(projectId, doc.destino),
    getSessionCategories(),
    leerNotas(projectId, doc.pieza),
    leerInstrucciones(projectId, doc.pieza),
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const ahora = Date.now();
  const soloElegidas = esSoloElegidas(doc.destino);

  const ocurridas = soloOcurridas(sessions, ahora);
  /* Primero cuáles tienen algo que leer: una elegida vacía no ocupa uno de los 6 lugares de reunión entera ni le quita
     espacio a una que tiene transcripción. */
  const plan =
    soloElegidas && !opts.elegidasEnResumen
      ? planDeLasElegidas(ocurridas, await elegidasConContenido(ocurridas.map((s) => s.id)))
      : null;
  // Las más recientes, si no caben todas; y después en orden de fecha, que es como se cuenta una historia.
  const aLeer = (plan ? [...plan.enteras, ...plan.enResumen] : masRecientes(ocurridas, MAX_REUNIONES_DEL_DOCUMENTO)).sort(
    (a, b) => a.date - b.date || a.id.localeCompare(b.id),
  );

  // Las elegidas, con UNA consulta (y la transcripción cortada en SQL); la exploración y el assist, en resumen.
  const contenidos = plan
    ? await leerLasElegidas(plan, ahora, { pieza: doc.pieza })
    : await leerEnResumen(aLeer, espacioPorReunion(aLeer.length));

  let sinContenido = plan?.vacias.length ?? 0;
  let enteras = 0;
  const leidas: ReunionLeidaDelDocumento[] = [];
  const sesionesUsadas: string[] = [];
  for (const s of aLeer) {
    const c = contenidos.get(s.id);
    const texto = c?.texto.trim() ?? "";
    if (!texto) {
      sinContenido++;
      continue;
    }
    const sala = prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios));
    const enResumen = plan && !c?.entera ? " (en resumen: no entró entera)" : "";
    leidas.push({ encabezado: `### ${sala}${s.title} — ${fecha(s.date)}${enResumen}`, texto });
    sesionesUsadas.push(s.id);
    if (plan && c?.entera) enteras++;
  }
  const fueraDelTope = soloElegidas ? Math.max(0, ocurridas.length - leidas.length - sinContenido) : 0;
  const cobertura = soloElegidas
    ? lineaDeCoberturaDeLasElegidas({ elegidas: ocurridas.length, leidas: leidas.length, sinContenido, fueraDelTope })
    : "";

  return {
    ...armarMaterialDelDocumento({ pieza: doc.pieza, leidas, notas, cobertura }),
    instrucciones,
    sesionesUsadas,
    avisoSinReuniones:
      soloElegidas && leidas.length === 0 ? avisoSinReunionesElegidas(doc, { elegidas: sessions.length }) : "",
    cierreDeFrontera: cierreDeFronteraDelDocumento(doc.pieza, {
      reuniones: leidas.length > 0,
      notas: notas.length > 0,
      transcripciones: enteras > 0,
    }),
    resumen: {
      leidas: leidas.length,
      enteras,
      futuras: sessions.length - ocurridas.length,
      sinContenido,
      fueraDelTope,
      ocurridas: ocurridas.length,
      desde: aLeer.length ? aLeer[0].date : null,
      hasta: aLeer.length ? aLeer[aLeer.length - 1].date : null,
    },
  };
}

/**
 * Cuáles de estas elegidas tienen ALGO que leer: transcripción, notas de Gemini o minuta. En un documento que lee el
 * cliente, la minuta cuenta solo si la revisó una persona (`minutaParaElDocumento`: una en borrador no llega). Viaja un
 * booleano por reunión, nunca el texto: el mismo criterio que el panel (session-candidates).
 */
async function elegidasConContenido(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  // La regla es UNA (`tieneQueLeer`, documento.ts): la usa también la migración del 2026-10-10.
  const filas = await prisma.$queryRaw<{ id: string; texto: boolean; minuta: boolean; minutaRevisada: boolean }[]>`
    SELECT s."id",
      (coalesce(length(s."transcript"), 0) > 0 OR s."summary" IS NOT NULL) AS "texto",
      EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id") AS "minuta",
      EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id" AND m."status" IN ('REVIEWED', 'EDITED')) AS "minutaRevisada"
    FROM "FirefliesSession" s
    WHERE s."id" IN (${Prisma.join([...ids])})`;
  return new Set(filas.filter((f) => tieneQueLeer(f)).map((f) => f.id));
}

/** Lo que se leyó de una reunión, y si entró entera (las elegidas) o en resumen. */
interface ContenidoLeido {
  texto: string;
  entera: boolean;
}

function masRecientes<S extends { id: string; date: number }>(sesiones: readonly S[], max: number): S[] {
  return [...sesiones].sort((a, b) => b.date - a.date || a.id.localeCompare(b.id)).slice(0, max);
}

/** La exploración (la regla sugerida de antes): cada reunión en resumen, con el espacio repartido. */
async function leerEnResumen(
  sesiones: ReadonlyArray<{ id: string; title: string }>,
  espacio: number,
): Promise<Map<string, ContenidoLeido>> {
  const out = new Map<string, ContenidoLeido>();
  for (const s of sesiones) {
    const texto = (await fetchTranscriptContent(s.id, s.title, { maxChars: espacio }))?.trim() ?? "";
    out.set(s.id, { texto, entera: false });
  }
  return out;
}

/** Cómo se leen las elegidas: cuáles enteras, cuáles en resumen, y cuánto de cada entera. */
export interface PlanDeLasElegidas<S> {
  enteras: S[];
  enResumen: S[];
  /** Cuánto de cada entera (`espacioPorElegida`). */
  espacio: number;
  /** Las que no tienen nada que leer: no ocupan lugar ni espacio (las cuenta `resumen.sinContenido`). */
  vacias: S[];
}

/**
 * QUÉ ELEGIDAS SE LEEN ENTERAS. Puro. Primero se apartan las que no tienen nada que leer (`conContenido`; sin él, todas
 * cuentan): una vacía no ocupa uno de los lugares de reunión entera ni le quita espacio a otra. De las que quedan, las
 * más recientes, hasta `MAX_ELEGIDAS_A_LEER`: las primeras `MAX_ELEGIDAS_ENTERAS` enteras y las demás en resumen; las
 * más viejas que eso no entran (la línea de cobertura lo dice). Recibe solo las que ya ocurrieron.
 */
export function planDeLasElegidas<S extends { id: string; date: number }>(
  ocurridas: readonly S[],
  conContenido?: ReadonlySet<string>,
): PlanDeLasElegidas<S> {
  const vacias = conContenido ? ocurridas.filter((s) => !conContenido.has(s.id)) : [];
  const conTexto = conContenido ? ocurridas.filter((s) => conContenido.has(s.id)) : ocurridas;
  const recientes = masRecientes(conTexto, MAX_ELEGIDAS_A_LEER);
  const enteras = recientes.slice(0, MAX_ELEGIDAS_ENTERAS);
  const enResumen = recientes.slice(MAX_ELEGIDAS_ENTERAS);
  return { enteras, enResumen, espacio: espacioPorElegida(enteras.length, enResumen.length), vacias };
}

/**
 * LA LÍNEA DE COBERTURA de las elegidas: cuántas se leyeron de las que ya ocurrieron, y por qué no las demás. Puro. ""
 * si se leyeron todas, o si no se leyó ninguna (ahí va `avisoSinReunionesElegidas`). Va dentro del bloque de reuniones,
 * después de la regla: sin ella, el modelo cree que leyó todo lo que el equipo eligió.
 */
export function lineaDeCoberturaDeLasElegidas(c: {
  elegidas: number;
  leidas: number;
  sinContenido: number;
  fueraDelTope: number;
}): string {
  if (c.leidas === 0 || c.leidas >= c.elegidas) return "";
  const porque: string[] = [];
  if (c.sinContenido > 0) {
    porque.push(`${c.sinContenido} no ${c.sinContenido === 1 ? "dejó" : "dejaron"} transcripción, notas ni minuta que leer`);
  }
  if (c.fueraDelTope > 0) {
    porque.push(`${c.fueraDelTope}, las más viejas, no ${c.fueraDelTope === 1 ? "entró" : "entraron"} por espacio`);
  }
  return (
    `Se leyeron ${c.leidas} de las ${c.elegidas} reuniones elegidas que ya ocurrieron` +
    (porque.length ? `: ${porque.join(" y ")}` : "") +
    ". No concluyas nada de las que no se leyeron."
  );
}

function fechaLarga(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
}

/**
 * Cómo se leyeron las reuniones elegidas, en una línea (el encuadre del diagnóstico). Puro. Sin enteras (el assist las
 * lee en resumen) dice «en resumen», nunca «0 enteras».
 */
export function encuadreDeLasElegidas(r: Pick<MaterialDelDocumento["resumen"], "leidas" | "enteras" | "desde" | "hasta">): string {
  const enResumen = r.leidas - r.enteras;
  const como =
    r.enteras === 0
      ? "en resumen."
      : enResumen > 0
        ? `${r.enteras} ${r.enteras === 1 ? "entera" : "enteras"}, con su minuta y lo que se dijo, y ${enResumen} en resumen.`
        : `${r.leidas === 1 ? "entera" : "enteras"}, con su minuta y lo que se dijo.`;
  return (
    (r.leidas === 1 ? "Se leyó 1 reunión" : `Se leyeron ${r.leidas} reuniones`) +
    `${r.desde && r.hasta && r.leidas > 1 ? `, entre el ${fechaLarga(r.desde)} y el ${fechaLarga(r.hasta)}` : ""}: ` +
    como
  );
}

/**
 * LA REGLA OTRA VEZ, AL FINAL DEL MENSAJE. Puro. La frontera va al principio del bloque de reuniones, y ese bloque
 * puede traer 160.000 caracteres de transcripción: los cinco documentos del cliente (y la ejecución, con la suya) la
 * repiten justo antes de la instrucción final. Con transcripciones enteras suma una línea: lo último de una
 * transcripción suele ser lo que el equipo habló cuando el cliente ya había colgado, y llega rotulado como reunión con
 * el cliente. "" sin reuniones ni notas: el mensaje de cada lector queda como antes.
 */
export function cierreDeFronteraDelDocumento(
  pieza: string,
  hay: { reuniones: boolean; notas: boolean; transcripciones: boolean },
): string {
  if (!hay.reuniones && !hay.notas) return "";
  const cola = hay.transcripciones
    ? " El final de una transcripción puede ser lo que el equipo habló cuando el cliente ya había colgado: lo que suene a " +
      "conversación interna (precios, opiniones del equipo, cómo cobrar) es de Smarteam, aunque la reunión diga «CON EL CLIENTE»."
    : "";
  return `=== ANTES DE ESCRIBIR: LA MISMA REGLA DEL PRINCIPIO ===\n${fronteraDeLaPieza(pieza)}${cola}`;
}

/** La marca entre el principio y el final de una transcripción que no entra entera. */
const MARCA_DE_TRANSCRIPCION_CORTADA = "\n[…]\n";

/**
 * EL LECTOR DE LAS ELEGIDAS: UNA consulta con el título, las notas de Gemini y la minuta (cortada por
 * fecha otra vez: nada que no haya ocurrido llega al prompt) y la transcripción cortada EN SQL —el
 * principio y el final, nunca el texto entero—. Para las enteras, a `plan.espacio`; para las que van en
 * resumen y no tienen notas ni minuta, el principio de la transcripción a 2.000. La minuta pasa antes por
 * `minutaParaElDocumento`: en un documento del cliente, solo los acuerdos y las decisiones (también de un borrador).
 */
async function leerLasElegidas(
  plan: Pick<PlanDeLasElegidas<{ id: string }>, "enteras" | "enResumen" | "espacio">,
  ahora: number,
  o: { pieza: string },
): Promise<Map<string, ContenidoLeido>> {
  const ids = [...plan.enteras, ...plan.enResumen].map((s) => s.id);
  if (!ids.length) return new Map();
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: ids }, date: { lte: new Date(ahora) } },
    select: {
      id: true,
      title: true,
      summary: true,
      minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
    },
  });
  // La minuta que puede leer ESTE documento: en uno del cliente, solo los acuerdos y las decisiones.
  const porId = new Map(filas.map((f) => [f.id, { ...f, minute: minutaParaElDocumento(f.minute, o.pieza) }]));
  const idsEnteras = plan.enteras.map((s) => s.id).filter((id) => porId.has(id));
  const espacio = plan.espacio;
  const inicio = Math.floor(espacio * 0.3);
  const transcripciones = new Map<string, string>();
  if (idsEnteras.length) {
    const cortadas = await prisma.$queryRaw<{ id: string; texto: string | null }[]>`
      SELECT "id",
        CASE WHEN length("transcript") <= ${espacio}::int THEN "transcript"
             ELSE left("transcript", ${inicio}::int) || ${MARCA_DE_TRANSCRIPCION_CORTADA}::text || right("transcript", ${espacio - inicio}::int)
        END AS "texto"
      FROM "FirefliesSession"
      WHERE "id" IN (${Prisma.join(idsEnteras)})`;
    for (const c of cortadas) if (c.texto?.trim()) transcripciones.set(c.id, c.texto);
  }

  const out = new Map<string, ContenidoLeido>();
  for (const id of idsEnteras) {
    const f = porId.get(id)!;
    out.set(id, {
      texto: textoDeUnaElegidaEntera({ title: f.title, summary: f.summary, minuta: f.minute, transcripcion: transcripciones.get(id) ?? null }, espacio),
      entera: true,
    });
  }
  const sinNotas: string[] = [];
  for (const s of plan.enResumen) {
    const f = porId.get(s.id);
    if (!f) continue;
    const texto = textoDeUnaElegidaEnResumen({ title: f.title, summary: f.summary, minuta: f.minute, transcripcion: null });
    if (texto) out.set(s.id, { texto, entera: false });
    else sinNotas.push(s.id);
  }
  if (sinNotas.length) {
    const inicios = await prisma.$queryRaw<{ id: string; texto: string | null }[]>`
      SELECT "id", left("transcript", ${PISO_POR_ELEGIDA_EN_RESUMEN}::int) AS "texto"
      FROM "FirefliesSession"
      WHERE "id" IN (${Prisma.join(sinNotas)})`;
    for (const c of inicios) {
      const f = porId.get(c.id);
      if (!f || !c.texto?.trim()) continue;
      out.set(c.id, { texto: textoDeUnaElegidaEnResumen({ title: f.title, summary: f.summary, minuta: f.minute, transcripcion: c.texto }), entera: false });
    }
  }
  return out;
}

/** El texto de un acuerdo, una decisión o un riesgo de la minuta (viene como texto o como `{ text }`). */
function textosDeLaMinuta(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string"
          ? (x as { text: string }).text
          : "",
    )
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * LA MINUTA QUE PUEDE LEER UN DOCUMENTO. Puro. En uno que lee el cliente (`clientFacing`), la misma regla que la memoria
 * (`queCargar`, lib/memoria/consumidores.ts): solo los acuerdos y las decisiones, sin los que traen un monto o hablan de
 * negociación. Nunca su resumen ni sus riesgos (una valoración interna, con severidad). Desde el 2026-10-15 (la IA como
 * borrador) también la minuta que nadie revisó: conserva su estado, y el texto la marca «en borrador» para que lo
 * confirmado mande. En un documento interno (la ejecución), la minuta entera.
 */
export function minutaParaElDocumento(m: MinutaDeReunion | null, pieza: string): MinutaDeReunion | null {
  if (!m) return null;
  if (pieceBySlug(pieza)?.clientFacing === false) return m;
  // La IA como borrador (2026-10-15): también la minuta que nadie revisó, con su estado (el texto la marca «en borrador»).
  const sinMontos = (v: unknown) => textosDeLaMinuta(v).filter((t) => !traeUnMonto(t) && !traeNegociacion(t));
  const decisions = sinMontos(m.decisions);
  const agreements = sinMontos(m.agreements);
  if (!decisions.length && !agreements.length) return null;
  return { summary: null, decisions, agreements, risks: [], status: m.status };
}

/** Lo que se sabe de una reunión para leerla: sus notas de Gemini, su minuta y su transcripción (ya cortada). */
export interface ReunionParaLeer {
  title: string;
  summary: unknown;
  minuta: MinutaDeReunion | null;
  transcripcion: string | null;
}

/**
 * EL TEXTO DE UNA ELEGIDA ENTERA. Puro. Con transcripción: la minuta (si hay) y lo que se dijo, con el
 * principio y, sobre todo, el FINAL si no entra (ahí se acuerda qué sigue; `recortarTranscripcion`, el
 * mismo corte del correo de seguimiento y del avance). Las notas de Gemini NO van: la transcripción ya
 * dice lo que pasó. Sin transcripción, las notas priorizadas y la minuta (`resumenDeReunion`), al espacio.
 * Recibe la minuta ya pasada por `minutaParaElDocumento` (el lector lo hace).
 */
export function textoDeUnaElegidaEntera(r: ReunionParaLeer, espacio: number): string {
  if (espacio <= 0) return "";
  const transcripcion = (r.transcripcion ?? "").trim();
  if (transcripcion) {
    const minuta = r.minuta ? resumenDeReunion({ title: r.title, summary: null, minuta: r.minuta }).texto : "";
    return recortarTranscripcion(minuta, transcripcion, espacio);
  }
  return recortarReunion(resumenDeReunion({ title: r.title, summary: r.summary, minuta: r.minuta }).texto.trim(), espacio);
}

/**
 * EL TEXTO DE UNA ELEGIDA QUE NO ENTRA ENTERA. Puro. Sus notas y su minuta en resumen; si no tiene
 * ninguna de las dos, el principio de la transcripción. Siempre a 2.000.
 */
export function textoDeUnaElegidaEnResumen(r: ReunionParaLeer): string {
  const resumen = resumenDeReunion({ title: r.title, summary: r.summary, minuta: r.minuta }).texto.trim();
  const texto = resumen || (r.transcripcion ?? "").trim();
  return texto ? recortarReunion(texto, PISO_POR_ELEGIDA_EN_RESUMEN) : "";
}

/**
 * LA LÍNEA DE UN DOCUMENTO SIN REUNIONES QUE LEER (etapa 7). Puro. Va donde iría el bloque de reuniones:
 * sin ella, el modelo no sabe si no hubo reuniones o si nadie las eligió. No nombra la memoria: el lector
 * la suma aparte, con su propio rótulo, y puede no haber.
 */
export function avisoSinReunionesElegidas(
  doc: Pick<DocumentoConContexto, "elDocumento">,
  r: { elegidas: number },
): string {
  if (r.elegidas === 0) {
    return `=== SIN REUNIONES ELEGIDAS ===\nNadie eligió reuniones para ${doc.elDocumento}: no hay transcripciones en este pedido. No inventes lo que se habría dicho en una reunión.`;
  }
  const cuales =
    r.elegidas === 1
      ? `La reunión elegida para ${doc.elDocumento} todavía no ocurrió o no tiene transcripción, notas ni minuta`
      : `Las ${r.elegidas} reuniones elegidas para ${doc.elDocumento} todavía no ocurrieron o no tienen transcripción, notas ni minuta`;
  return `=== LAS REUNIONES ELEGIDAS NO TIENEN NADA QUE LEER ===\n${cuales}. No inventes lo que se habría dicho en una reunión.`;
}

/** Las instrucciones del documento: la entry `__doc` de SU canvas (doc-brief), rotuladas. */
async function leerInstrucciones(projectId: string, pieza: string): Promise<string> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf(pieza) },
    select: { sections: true },
  });
  return bloqueDeInstruccionesDeDoc(canvas ? docBriefFrom(canvas.sections) : null);
}

/** Solo las instrucciones de un documento, para los agentes que no leen su material completo. */
export async function instruccionesDelDocumento(projectId: string, pieza: string): Promise<string> {
  return leerInstrucciones(projectId, pieza);
}

async function leerNotas(projectId: string, pieza: string) {
  // Tolera la tabla ausente solo en la ventana SQL→deploy; el orden obligatorio sigue siendo SQL primero.
  if (!modeloDisponible(prisma.notaDeContexto)) return [];
  return prisma.notaDeContexto.findMany({
    where: { projectId, pieza, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true, createdAt: true },
  });
}

/** Una reunión ya leída: su encabezado (sala, título y fecha) y lo que se leyó de ella. */
export interface ReunionLeidaDelDocumento {
  encabezado: string;
  texto: string;
}

/** Una nota del CSE, como la guarda `NotaDeContexto`. */
export interface NotaDelDocumento {
  title: string | null;
  content: string;
  createdAt: Date;
}

/**
 * EL BLOQUE DE REUNIONES, con la regla de la frontera de la pieza adelante. Puro. Sin reuniones
 * devuelve "": el lector que pregunta `material.reuniones ? … : …` sigue igual que antes.
 */
export function bloqueDeReunionesDelDocumento(bloques: readonly string[], pieza: string): string {
  return bloques.length ? [fronteraDeLaPieza(pieza), ...bloques].join("\n\n") : "";
}

/** EL BLOQUE DE NOTAS: el cuerpo (`cuerpoDeNotasDelDocumento`) con la misma regla adelante. Puro. */
export function bloqueDeNotasDelDocumento(cuerpo: string, pieza: string): string {
  return cuerpo ? `${fronteraDeLaPieza(pieza)}\n\n${cuerpo}` : "";
}

/**
 * LO QUE EL MATERIAL LE DA AL LECTOR, armado de lo ya leído. Puro: es la mitad que se prueba sin
 * base (lib/contexto/documento.test.ts). `materialInterno` lleva cada texto por separado y sin la
 * regla: la copia se mide contra lo que se dijo, no contra nuestras instrucciones.
 */
export function armarMaterialDelDocumento(input: {
  pieza: string;
  leidas: readonly ReunionLeidaDelDocumento[];
  notas: readonly NotaDelDocumento[];
  /** La línea de cobertura de las elegidas (`lineaDeCoberturaDeLasElegidas`): va después de la regla. Sin reuniones no va. */
  cobertura?: string;
}): Pick<MaterialDelDocumento, "reuniones" | "notas" | "materialInterno"> {
  const cuerpoDeNotas = cuerpoDeNotasDelDocumento(input.notas);
  const cobertura = input.leidas.length && input.cobertura?.trim() ? [input.cobertura.trim()] : [];
  return {
    reuniones: bloqueDeReunionesDelDocumento(
      [...cobertura, ...input.leidas.map((r) => `${r.encabezado}\n${r.texto}`)],
      input.pieza,
    ),
    notas: bloqueDeNotasDelDocumento(cuerpoDeNotas, input.pieza),
    materialInterno: [...input.leidas.map((r) => r.texto), ...(cuerpoDeNotas ? [cuerpoDeNotas] : [])],
  };
}

/** Las notas, las más nuevas primero hasta el tope: si no entran todas, lo que queda afuera es lo viejo. */
export function cuerpoDeNotasDelDocumento(notas: readonly NotaDelDocumento[]): string {
  const partes: string[] = [];
  let usado = 0;
  for (const n of [...notas].reverse()) {
    const bloque = `### ${n.title?.trim() || "Nota"} — cargada el ${fecha(n.createdAt.getTime())}\n${n.content.trim()}`;
    if (usado + bloque.length > TOPE_NOTAS_DEL_DOCUMENTO) break;
    partes.unshift(bloque);
    usado += bloque.length;
  }
  return partes.join("\n\n");
}
