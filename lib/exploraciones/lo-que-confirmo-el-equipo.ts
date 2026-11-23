/**
 * lib/exploraciones/lo-que-confirmo-el-equipo.ts — «LO QUE CONFIRMÓ EL EQUIPO» de una empresa (etapa 1 del plan maestro de
 * «Hablar con Nexus», 23 nov). PURO y client-safe.
 *
 * Las notas de «Lo que sabes del cliente» (`sabido:<id>`) de TODAS las preventas de la empresa —abiertas o archivadas—,
 * con quién las escribió, cuándo, y los hechos que Nexus sacó de cada una (verificados contra su texto). Es lo que
 * contó el equipo con su clic: el escalón 3 de la escalera de peso (lib/impacto/escalera.ts), por encima de lo dicho en
 * una reunión. Hasta acá no salía de la preventa donde se contó.
 *
 * ⛔ EL CORTE PARA EL CLIENTE LO HACE EL CÓDIGO, ACÁ (`paraElAlcance`): una nota es texto libre y puede traer el
 * presupuesto, quién decide, una objeción o lo que se piensa de una persona. Por eso, a lo que lee un documento del
 * cliente (y al handoff, que escribe lo que el cliente lee) llegan SOLO los hechos de los tipos que describen a la
 * empresa (`TIPOS_PARA_EL_CLIENTE`), sin los que traen un monto o hablan de negociación, sin el texto de la nota y sin
 * quién la escribió. Lo interno recibe todo, rotulado.
 *
 * La lectura vive en ./lo-que-confirmo-el-equipo-server.ts (por la cuenta, no por la sesión del navegador: la usan la
 * memoria de la cuenta, los casos de uso y, después, el conector de Claude).
 */
import { traeNegociacion, traeUnMonto } from "@/lib/contexto/frontera-del-cronograma";
import { ROTULO_DEL_TEMA, ROTULO_DEL_TIPO } from "@/lib/seguimiento/hechos/tipos";

/** Para quién se corta: lo mismo que el alcance de la memoria (lib/memoria/tipos.ts › AlcanceDeMemoria). */
export type AlcanceDelEquipo = "cliente" | "sin-lo-interno" | "interno";

/**
 * Los tipos de hecho que pueden llegar a lo que ve el cliente: describen a la empresa (cuántos clientes, qué sistema,
 * qué acordaron, qué resultado buscan, cómo trabajan hoy). Afuera, a propósito: `persona` (quién decide, posturas),
 * `queja` y `riesgo` (opiniones internas) y las señales.
 */
export const TIPOS_PARA_EL_CLIENTE: readonly string[] = ["cuenta", "acuerdo", "resultado", "proceso_hoy"];

export interface HechoConfirmado {
  tipo: string;
  tema: string | null;
  frase: string;
}

export interface NotaConfirmada {
  clave: string;
  /** El texto de la nota. "" en lo que va al cliente: nunca viaja. */
  texto: string;
  /** El nombre de quien la escribió. null en lo que va al cliente, o si no se sabe. */
  autor: string | null;
  /** ISO: cuándo se escribió. */
  en: string;
  /** La preventa donde se contó. */
  preventa: { id: string; archivada: boolean };
  hechos: HechoConfirmado[];
}

/** Cuántas notas se leen como mucho (las más nuevas) y cuánto de cada una en lo interno. */
export const MAX_NOTAS_CONFIRMADAS = 12;
export const LARGO_DE_LA_NOTA_CONFIRMADA = 400;
/** Cuántos hechos llegan a lo que ve el cliente, como mucho. */
export const MAX_HECHOS_PARA_EL_CLIENTE = 14;

/**
 * La guarda propia de las notas (revisión del 23 nov): en una nota del equipo es justo donde se escribe la compra —el
 * presupuesto, quién firma, lo que se piensa de alguien, la competencia—, y `traeUnMonto` solo reconoce un número pegado
 * a la moneda. Un hecho que nombra algo de esto, o trae una cifra con «mil», «k» o «millones» o un pago mensual, no
 * llega al cliente aunque su tipo lo permita. Es estricta a propósito: perder un dato vale menos que mostrar un
 * presupuesto («4 mil clientes» se queda afuera; «4.800 clientes» pasa).
 */
const LO_DE_LA_COMPRA =
  /\b(presupuest\w*|inversi[oó]n|inviert\w*|precio\w*|cost(?:o|os|ar[aá]|ar[ií]a)\b|cotiz\w*|descuent\w*|tarifa\w*|licencia\w*|mensualidad\w*|mensual(?:es)?\b|anual(?:es)?\b|pag(?:a|an|ar|ar[aá]n?|amos|o|os)\b|cobr(?:a|an|ar)\s+(?:smarteam|la consultor[ií]a)|factur\w*|contrat(?:o|os|ar)\b|firm(?:a|an|ar|ar[aá]|[oó])\b|decid\w*|decisi[oó]n\w*|aprob\w*|autoriz\w*|compr(?:a|an|ar|ar[aá]n?)\b|proveedor\w*|competen(?:cia|ci[oó]n)|competidor\w*|confi(?:a|an|anza)\b|desconf\w*|objeci[oó]n\w*|postura\w*|gerente|director\w*|due[nñ]o\w*|jefe\w*|CFO|CEO|COO)\b/i;
const CIFRA_GRANDE = /\d[\d.,]*\s*(?:mil\b|k\b|m\b|mm\b|millon(?:es)?\b|mill[oó]n\b)/i;

export const traeAlgoDeLaCompra = (frase: string): boolean => LO_DE_LA_COMPRA.test(frase) || CIFRA_GRANDE.test(frase);

export const esHechoParaElCliente = (h: HechoConfirmado): boolean =>
  TIPOS_PARA_EL_CLIENTE.includes(h.tipo) && !traeUnMonto(h.frase) && !traeNegociacion(h.frase) && !traeAlgoDeLaCompra(h.frase);

/**
 * El corte por alcance. Interno: todo. Cliente y handoff: sin el texto, sin el autor, solo los hechos para el cliente;
 * una nota que se queda sin hechos no llega.
 */
export function paraElAlcance(notas: readonly NotaConfirmada[], alcance: AlcanceDelEquipo): NotaConfirmada[] {
  if (alcance === "interno") return notas.map((n) => ({ ...n, hechos: [...n.hechos] }));
  return notas
    .map((n) => ({ ...n, texto: "", autor: null, hechos: n.hechos.filter(esHechoParaElCliente) }))
    .filter((n) => n.hechos.length > 0);
}

const diaDe = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso.slice(0, 10) : new Date(ms - 6 * 3_600_000).toISOString().slice(0, 10);
};

const lineaDelHecho = (h: HechoConfirmado): string => {
  const tipo = ROTULO_DEL_TIPO[h.tipo as keyof typeof ROTULO_DEL_TIPO] ?? h.tipo;
  const tema = h.tema ? ` · ${ROTULO_DEL_TEMA[h.tema as keyof typeof ROTULO_DEL_TEMA] ?? h.tema}` : "";
  return `${tipo}${tema}: ${h.frase.replace(/\s+/g, " ").trim()}`;
};

/** La regla de peso, en una línea: va arriba del bloque. */
export const PESO_DE_LO_CONFIRMADO =
  "Lo contó alguien del equipo de Smarteam y lo guardó con su clic: pesa MÁS que lo dicho en una reunión (si chocan, gana " +
  "esto) y MENOS que lo que el cliente aceptó.";

/**
 * El bloque para un prompt, ya cortado por el alcance (se vuelve a cortar acá: lo estricto no le muestra nada a nadie).
 * Interno: cada nota con su día, quién, si su preventa está archivada, el texto recortado y sus hechos. Cliente y
 * handoff: solo los hechos, uno por línea, sin repetir. "" si no hay nada.
 */
export function bloqueDeLoQueConfirmoElEquipo(notas: readonly NotaConfirmada[], alcance: AlcanceDelEquipo): string {
  const cortadas = paraElAlcance(notas, alcance);
  if (!cortadas.length) return "";
  if (alcance !== "interno") {
    const vistas = new Set<string>();
    const lineas: string[] = [];
    for (const n of cortadas)
      for (const h of n.hechos) {
        const l = lineaDelHecho(h);
        const k = l.toLowerCase();
        if (vistas.has(k) || lineas.length >= MAX_HECHOS_PARA_EL_CLIENTE) continue;
        vistas.add(k);
        lineas.push(`- ${l}`);
      }
    return lineas.length ? `${PESO_DE_LO_CONFIRMADO}\n${lineas.join("\n")}` : "";
  }
  const cada = cortadas.slice(0, MAX_NOTAS_CONFIRMADAS).map((n) => {
    const texto = n.texto.replace(/\s+/g, " ").trim();
    const corto = texto.length > LARGO_DE_LA_NOTA_CONFIRMADA ? `${texto.slice(0, LARGO_DE_LA_NOTA_CONFIRMADA - 1).trimEnd()}…` : texto;
    const de = `[${diaDe(n.en)} · ${n.autor ?? "alguien del equipo"}${n.preventa.archivada ? " · preventa archivada" : ""}]`;
    const hechos = n.hechos.map((h) => `  · ${lineaDelHecho(h)}`);
    return [`- ${de} ${corto}`, ...hechos].join("\n");
  });
  return `${PESO_DE_LO_CONFIRMADO} INTERNO: nunca se cita al cliente tal cual.\n${cada.join("\n")}`;
}

/* ── Para los casos de uso (lo que proponen llega a la propuesta: el corte del cliente) ──────────────── */

export const ROTULO_PARA_LOS_CASOS =
  "=== LO QUE CONFIRMÓ EL EQUIPO Y LO QUE ACEPTÓ EL CLIENTE (pesa más que lo estimado: si choca con una hipótesis o con una reunión, gana esto) ===";

/**
 * Lo que leen los agentes de casos de uso además de la exploración: los hechos que confirmó el equipo (cortados para el
 * cliente) y lo que el cliente aceptó de su escala (`aceptado`, ya armado por `bloqueDeLoAceptado`, sin la nota del
 * equipo). "" si no hay nada: el bloque no se manda.
 */
export function confirmadoParaLosCasos(notas: readonly NotaConfirmada[], aceptado: string): string {
  return [bloqueDeLoQueConfirmoElEquipo(notas, "cliente"), aceptado.trim()].filter(Boolean).join("\n\n");
}
