/**
 * lib/exploraciones/lo-que-ya-sabemos.ts — lo que el cliente ya respondió, con sus palabras y de dónde sale. PURO.
 *
 * Iniciativa A del roadmap (2026-10-18): Marco preparó la sesión 2 con Distribuidora Larce y, en vivo, la guía le hizo
 * repetir lo que el cliente ya había respondido en el diagnóstico. El test y la nota que deja en HubSpot estaban
 * guardados, pero solo como citas de las hipótesis de nivel: la guía no los leía. Esto los junta, tema por tema (una
 * tarjeta del marco o una dimensión de la escala), para dos cosas:
 *   · «Lo que ya sabemos», arriba de la guía: de 3 a 5 líneas, la más fuerte de cada tema.
 *   · El plan de la guía (plan-de-la-guia.ts): un tema que el cliente ya contó no se vuelve a preguntar desde cero.
 *
 * Solo lo que dijo o hizo el cliente: las respuestas del test, las citas verificadas de lo que leyó el agente (el test,
 * HubSpot, una reunión, lo sumado a mano, el handoff o un cuestionario; nunca N, las notas del vendedor), la evidencia
 * de un nivel confirmado en una reunión o en su portal, y las casillas del Resumen que dice el cliente. ⛔ Nunca lo
 * interno: presupuesto, quién decide, objeciones, contexto, particularidades ni la hipótesis de valor.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { ClaveDeCasilla, Meta, Reto } from "./casillas";
import type { EstadoDeExploracion, FuenteCitada } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { diaCorto } from "./fechas";
import type { LoLeidoDeHubspot } from "./lo-leido";

/** De dónde sale lo que se sabe, de lo más fuerte a lo más débil (para elegir la frase de cada línea). */
export const ORIGENES_DEL_DATO = ["reunion", "nota", "documento", "test", "proyecto", "portal", "resumen"] as const;
export type OrigenDelDato = (typeof ORIGENES_DEL_DATO)[number];

export interface DatoDelCliente {
  /** El tema: una tarjeta del marco (`tiempos`) o una dimensión (`1.7`). */
  para: string;
  /** Sus palabras (o lo confirmado en el Resumen, que son las nuestras sobre lo que dijo). */
  texto: string;
  /** De dónde sale, para mostrarlo: «Test de Ventas · Ana, 15 oct». */
  de: string;
  origen: OrigenDelDato;
}

/** Una línea de «Lo que ya sabemos»: la frase más fuerte de un tema y de dónde sale (con las otras fuentes, si hay). */
export interface LineaDeLoQueSabemos {
  para: string;
  texto: string;
  de: string;
  origen: OrigenDelDato;
}

export interface SaberDelCliente {
  /** Lo que el cliente ya dijo de cada tema, lo más fuerte primero. */
  porTema: ReadonlyMap<string, readonly DatoDelCliente[]>;
  /** «Lo que ya sabemos»: de 3 a 5 líneas (menos si no hay). */
  lineas: LineaDeLoQueSabemos[];
}

/** Las casillas que dice el cliente y se pueden contar como sabidas. Sin presupuesto: es interno. */
export const CASILLAS_DEL_SABER = ["metas", "retos", "planes", "tiempos", "consecuencias", "implicaciones", "obstaculos"] as const satisfies readonly ClaveDeCasilla[];

/** Cuántas líneas lleva «Lo que ya sabemos», y cuántas de ellas pueden ser dimensiones. */
export const MAX_LINEAS_DE_LO_QUE_SABEMOS = 5;
const MAX_LINEAS_DE_DIMENSIONES = 3;
/** El orden en que las casillas llenan «Lo que ya sabemos» después de los dolores. */
const ORDEN_DE_LAS_CASILLAS: readonly ClaveDeCasilla[] = ["tiempos", "metas", "consecuencias", "planes", "implicaciones", "retos", "obstaculos"];
const LARGO_DE_UNA_LINEA = 240;

/** El origen de una cita, por el id de su fuente. N (las notas del vendedor) no es del cliente: null. */
export function origenDeLaFuente(id: string): OrigenDelDato | null {
  switch (id.charAt(0)) {
    case "T":
      return /^T\d/.test(id) ? "test" : null;
    case "H":
      return /^H\d/.test(id) ? "nota" : null;
    case "S":
      return /^S\d/.test(id) ? "reunion" : null;
    case "M":
      return /^M\d/.test(id) ? "documento" : null;
    case "V":
    case "Q":
      return /^[VQ]\d/.test(id) ? "proyecto" : null;
    default:
      return null;
  }
}

/** La cita sin el «Lo marcó así:» que pone la nota del test, sin comillas de afuera y sin espacios de más. */
export function limpiarCita(cita: string): string {
  return cita
    .trim()
    .replace(/^lo marc[oó] as[ií]\s*:\s*/i, "")
    .replace(/^["«“]\s*/, "")
    .replace(/\s*["»”]$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** La etiqueta de una fuente, corta: sin lo que va después de los dos puntos (el título de una reunión) ni el año. */
function etiquetaCorta(etiqueta: string): string {
  const antes = etiqueta.split(":")[0]?.trim() ?? etiqueta;
  return antes.replace(/\s+\d{4}$/, "").slice(0, 60);
}

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function textoDeMeta(m: Meta): string {
  const desde = m.actual && m.objetivo ? `${m.actual} → ${m.objetivo}` : (m.actual ?? m.objetivo ?? "");
  const cifras = [desde, m.para ? `para ${m.para}` : null].filter(Boolean).join(", ");
  return cifras ? `${m.que}: ${cifras}` : m.que;
}

/** Los textos de una casilla confirmada (los ítems de una lista, uno por uno). */
function textosDeLaCasilla(clave: ClaveDeCasilla, v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (typeof x === "string") return x.trim() ? [x.trim()] : [];
    if (typeof x !== "object" || x === null) return [];
    if (clave === "metas") return (x as Meta).que ? [textoDeMeta(x as Meta)] : [];
    const t = (x as Reto).texto;
    return typeof t === "string" && t.trim() ? [t.trim()] : [];
  });
}

export interface EntradaDelSaber {
  estado: Pick<EstadoDeExploracion, "contenido" | "propuesta" | "areas">;
  /** Las respuestas del test (la columna `test` de la exploración). */
  tests: LoLeidoDeHubspot["tests"];
  escala: Pick<EscalaDelLienzo, "areas">;
  /** Dónde parece estar cada dimensión: ordena las líneas (lo más bajo, lo que más duele, primero). */
  posiciones: Readonly<Record<string, { nivel: Letra } | undefined>>;
}

/**
 * Lo que el cliente ya respondió, tema por tema, y las líneas de «Lo que ya sabemos». Las dimensiones son las de las
 * áreas en juego que aplican; un tema sin nada del cliente no aparece.
 */
export function loQueYaSabemos(o: EntradaDelSaber): SaberDelCliente {
  const { estado, escala } = o;
  const dims = new Map<string, { capa: string; orden: number }>();
  let orden = 0;
  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    for (const d of a.dimensiones) if (d.aplica) dims.set(d.id, { capa: d.capa, orden: orden++ });
  }
  const casillasDelSaber = new Set<string>(CASILLAS_DEL_SABER);
  const valido = (para: string) => dims.has(para) || casillasDelSaber.has(para);

  const porTema = new Map<string, DatoDelCliente[]>();
  const vistos = new Set<string>();
  const sumar = (d: DatoDelCliente) => {
    const texto = d.texto.slice(0, LARGO_DE_UNA_LINEA);
    const clave = `${d.para}|${normalizar(texto)}`;
    if (!texto || !valido(d.para) || vistos.has(clave)) return;
    vistos.add(clave);
    porTema.set(d.para, [...(porTema.get(d.para) ?? []), { ...d, texto }]);
  };

  // 1. La evidencia de un nivel confirmado: lo dijo en una reunión o se vio en su portal.
  for (const [dimensionId, e] of Object.entries(estado.contenido.chequeo)) {
    if (!e.evidencia?.trim() || (e.fuente !== "reunion" && e.fuente !== "portal")) continue;
    sumar({
      para: dimensionId,
      texto: limpiarCita(e.evidencia),
      de: e.fuente === "reunion" ? "Una reunión" : "Se vio en su HubSpot",
      origen: e.fuente === "reunion" ? "reunion" : "portal",
    });
  }

  /* 2. Las citas verificadas de lo que leyó el agente sobre cada dimensión (lo descartado no cuenta). De una tarjeta
     solo cuenta lo confirmado (punto 4): una propuesta sin usar no la da por sabida, y la guía la sigue preguntando;
     si la mostrara acá, «Lo que ya sabemos» y la guía se contradirían. */
  const lapidas = new Set(estado.contenido.descartadas);
  for (const it of estado.propuesta.items) {
    if (lapidas.has(it.id)) continue;
    const para = it.destino.tipo === "nivel" ? it.destino.dimensionId : null;
    if (!para) continue;
    for (const f of it.fuentes as FuenteCitada[]) {
      const origen = origenDeLaFuente(f.id);
      if (!origen || !f.cita?.trim()) continue;
      sumar({ para, texto: limpiarCita(f.cita), de: etiquetaCorta(f.etiqueta), origen });
    }
  }

  // 3. Lo que marcó en el test: la frase que eligió de cada dimensión.
  for (const t of o.tests) {
    const area = escala.areas.find((a) => a.id === t.resultado.areaId)?.nombre ?? "el diagnóstico";
    const quien = t.contacto.split(/\s+/)[0] ?? t.contacto;
    const cuando = t.resultado.fecha ? `, ${diaCorto(t.resultado.fecha)}` : "";
    for (const r of t.resultado.respuestas) {
      if (!r.respuesta?.trim()) continue;
      sumar({ para: r.dimensionId, texto: limpiarCita(r.respuesta), de: `Test de ${area} · ${quien}${cuando}`, origen: "test" });
    }
  }

  // 4. Lo confirmado en el Resumen que dice el cliente. Un reto atado a una dimensión también cuenta para ella.
  const casillas = estado.contenido.casillas as Partial<Record<ClaveDeCasilla, unknown>>;
  for (const clave of CASILLAS_DEL_SABER) {
    for (const texto of textosDeLaCasilla(clave, casillas[clave])) sumar({ para: clave, texto, de: "Confirmado en el Resumen", origen: "resumen" });
    if (clave === "retos" || clave === "obstaculos") {
      for (const r of (casillas[clave] as Reto[] | undefined) ?? []) {
        if (r?.dimensionId && r.texto?.trim()) sumar({ para: r.dimensionId, texto: r.texto.trim(), de: "Confirmado en el Resumen", origen: "resumen" });
      }
    }
  }

  // Lo más fuerte primero en cada tema (una reunión gana a una nota, la nota al test, el test al Resumen).
  const fuerza = (d: DatoDelCliente) => ORIGENES_DEL_DATO.indexOf(d.origen);
  for (const [k, v] of porTema) porTema.set(k, [...v].sort((a, b) => fuerza(a) - fuerza(b) || a.texto.length - b.texto.length));

  return { porTema, lineas: lineasDeLoQueSabemos(porTema, dims, o.posiciones) };
}

/** Cuántas fuentes distintas dicen algo de un tema (el test de dos personas cuenta como una). */
export function fuentesDistintas(datos: readonly DatoDelCliente[]): number {
  return new Set(datos.map((d) => d.origen)).size;
}

function linea(datos: readonly DatoDelCliente[]): LineaDeLoQueSabemos {
  const [mejor] = datos;
  const otras = [...new Set(datos.filter((d) => d.de !== mejor.de).map((d) => d.de))];
  const de = otras.length ? `${mejor.de} · ${otras[0]}${otras.length > 1 ? ` y ${otras.length - 1} más` : ""}` : mejor.de;
  return { para: mejor.para, texto: mejor.texto, de, origen: mejor.origen };
}

/**
 * Las líneas: primero las dimensiones con palabras del cliente (hasta 3: la más baja, después la que más fuentes la
 * dicen), después las casillas (los tiempos, la meta, las consecuencias…), hasta 5. Un tema con solo lo confirmado en
 * el Resumen va después de los que tienen palabras del cliente.
 */
function lineasDeLoQueSabemos(
  porTema: ReadonlyMap<string, readonly DatoDelCliente[]>,
  dims: ReadonlyMap<string, { capa: string; orden: number }>,
  posiciones: Readonly<Record<string, { nivel: Letra } | undefined>>,
): LineaDeLoQueSabemos[] {
  const nivel = (id: string) => {
    const p = posiciones[id];
    return p ? LETRAS.indexOf(p.nivel) : LETRAS.length;
  };
  const deDimensiones = [...dims.keys()]
    .filter((id) => (porTema.get(id) ?? []).length > 0)
    .sort((a, b) => {
      const da = porTema.get(a)!;
      const db = porTema.get(b)!;
      const soloResumen = (x: readonly DatoDelCliente[]) => Number(x.every((d) => d.origen === "resumen"));
      const esReto = (x: readonly DatoDelCliente[]) => Number(x.some((d) => d.origen === "resumen"));
      return (
        soloResumen(da) - soloResumen(db) ||
        nivel(a) - nivel(b) ||
        esReto(db) - esReto(da) ||
        fuentesDistintas(db) - fuentesDistintas(da) ||
        Number(dims.get(a)!.capa !== "base") - Number(dims.get(b)!.capa !== "base") ||
        dims.get(a)!.orden - dims.get(b)!.orden
      );
    })
    .slice(0, MAX_LINEAS_DE_DIMENSIONES)
    .map((id) => linea(porTema.get(id)!));
  const deCasillas = ORDEN_DE_LAS_CASILLAS.filter((c) => (porTema.get(c) ?? []).length > 0).map((c) => linea(porTema.get(c)!));
  return [...deDimensiones, ...deCasillas].slice(0, MAX_LINEAS_DE_LO_QUE_SABEMOS);
}

/** «Lo que ya sabemos» en texto, para el pedido al agente: hasta 2 datos por tema, con su fuente. */
export function saberParaElPedido(saber: SaberDelCliente, nombreDe: (para: string) => string, max = 16): string[] {
  const out: string[] = [];
  for (const [para, datos] of saber.porTema) {
    for (const d of datos.slice(0, 2)) out.push(`${para} («${nombreDe(para)}»): «${d.texto}» — ${d.de}`);
  }
  return out.slice(0, max);
}
