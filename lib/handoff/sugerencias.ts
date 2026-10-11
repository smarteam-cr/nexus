/**
 * lib/handoff/sugerencias.ts — «BUSCAR LO NUEVO» SOBRE UN HANDOFF CONGELADO (etapa 3b). PURO.
 *
 * Con el handoff congelado, la IA ya no lo reescribe: lee las reuniones posteriores al congelado y deja
 * SUGERENCIAS, una por cosa nueva, en la sección que corresponde. Cada una dice qué cambia y de qué reunión
 * sale, con una frase copiada TAL CUAL; el código la busca en lo que leyó el modelo y, si no aparece, la
 * sugerencia no entra. Quedan como bloques en borrador (con la marca `sugerenciaDelHandoff`) que alguien usa
 * o descarta en el documento.
 *
 * ── LO QUE NO HACEN, A PROPÓSITO ────────────────────────────────────────────────────────────────────────
 * No proponen fases ni fechas del cronograma, no tocan las etiquetas, el resumen, los resultados ni la ficha
 * (eso lo hace la generación completa, que con el handoff congelado ya no corre). Un pedido nuevo del cliente
 * no se suma como alcance: se dice como «Pedido nuevo, fuera de lo vendido» y va a fuera de alcance por la
 * vía que ya existe (la lectura de cada reunión). «Resultados que el cliente necesita alcanzar» no recibe
 * sugerencias: un resultado va a los documentos (diagnóstico y kickoff), nunca al handoff.
 *
 * Lo que escribe la base y llama al modelo vive en lib/handoff/sugerencias-server.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { MARCA_DE_SUGERENCIA, fechaCorta } from "./congelado";

export const MODELO_DE_SUGERENCIAS = "claude-sonnet-4-6";
export const MAX_TOKENS_DE_SUGERENCIAS = 4000;
/** Las secciones que nunca reciben sugerencias (ver el encabezado). */
export const SECCIONES_SIN_SUGERENCIAS: ReadonlySet<string> = new Set(["resultados_cliente"]);
/** Como mucho, en una corrida. */
export const TOPE_DE_SUGERENCIAS = 15;
/** Las reuniones que se leen (las más recientes) y cuánto de cada una. */
export const MAX_REUNIONES = 8;
export const TOPE_DE_LAS_FUENTES = 60_000;
export const TOPE_POR_FUENTE = 20_000;
/** Lo que ya dice el handoff congelado. */
export const TOPE_DEL_HANDOFF = 24_000;
const MAX_TEXTO = 600;
const MAX_CITA = 400;

export const NOMBRE_DE_LA_HERRAMIENTA = "registrar_lo_nuevo";

export interface SeccionDelHandoff {
  key: string;
  label: string;
}

/** Una reunión (R1, R2…) o una fuente manual (M1…) posterior al congelado, con el texto que lee el modelo. */
export interface FuenteNueva {
  codigo: string;
  tipo: "reunion" | "manual";
  id: string;
  titulo: string;
  /** ISO: la fecha de la reunión, o cuándo se cargó la fuente manual. */
  fecha: string;
  /** El rótulo de sala («[CON EL CLIENTE] »), o "". */
  sala: string;
  texto: string;
}

/** Lo que ya se propuso en corridas anteriores y alguien descartó: no se vuelve a proponer. */
export interface SugerenciaDescartada {
  seccion: string;
  texto: string;
  cita: string;
}

/** Las secciones donde se puede sugerir: las del canvas, menos las que nunca reciben sugerencias. */
export function seccionesConSugerencias(secciones: readonly SeccionDelHandoff[]): SeccionDelHandoff[] {
  return secciones.filter((s) => !SECCIONES_SIN_SUGERENCIAS.has(s.key));
}

/** Reparte el tope entre las fuentes: ninguna se come todo el espacio. */
export function topePorFuente(cuantas: number): number {
  if (cuantas <= 0) return TOPE_POR_FUENTE;
  return Math.max(2_000, Math.min(TOPE_POR_FUENTE, Math.floor(TOPE_DE_LAS_FUENTES / cuantas)));
}

function systemDeSugerencias(): string {
  return `Eres el agente de handoff de Smarteam, una consultora que implementa HubSpot. El handoff de este proyecto ya está CONGELADO: es la foto fija de lo que se vendió y no se reescribe. Lees las reuniones que pasaron DESPUÉS del congelado y avisas SOLO lo nuevo: lo que cambia o se suma respecto de lo que ya dice el handoff.

Reglas estrictas:
1. Solo lo nuevo. Si algo ya está en el handoff, no lo repitas. Si nada cambió, registra una lista vacía: es la respuesta más común y está bien.
2. Cada sugerencia es UNA cosa, en una o dos frases cortas, y dice qué cambia: «Antes decía X; en la reunión se acordó Y» o «Se suma: …».
3. Cada sugerencia dice de qué reunión sale (su código: R1, R2… o M1… para una fuente manual) y copia una frase de ESA fuente TAL CUAL, sin cambiar ni una palabra, de 12 caracteres o más. Si no puedes copiar una frase que lo muestre, no la registres.
4. No propongas fases, semanas ni fechas del cronograma: eso se decide en el cronograma.
5. Si el cliente pide algo que no está en lo vendido, no lo sumes al alcance: regístralo en la sección «¿Qué vendimos?» (o la de alcance que haya) empezando con «Pedido nuevo, fuera de lo vendido:».
6. Lo que se habló puertas adentro, sin el cliente, no es un acuerdo con el cliente: dilo así si lo registras.
7. Respeta las EXCLUSIONES y las INSTRUCCIONES ADICIONALES si las hay: ganan sobre cualquier reunión.
8. No vuelvas a proponer lo que aparece en «YA SE DESCARTÓ».
9. Español neutro con tuteo; nunca voseo.`;
}

function herramientaDeSugerencias(secciones: readonly SeccionDelHandoff[], codigos: readonly string[]): Anthropic.Messages.Tool {
  return {
    name: NOMBRE_DE_LA_HERRAMIENTA,
    description: "Registra lo nuevo de las reuniones posteriores al congelado. Llámala una sola vez; con nada nuevo, una lista vacía.",
    input_schema: {
      type: "object",
      properties: {
        sugerencias: {
          type: "array",
          description: "Una entrada por cada cosa nueva. Vacía si nada cambió.",
          items: {
            type: "object",
            properties: {
              seccion: { type: "string", enum: secciones.map((s) => s.key), description: "La sección del handoff a la que suma." },
              texto: { type: "string", description: "Qué cambia o qué se suma, en una o dos frases cortas." },
              fuente: { type: "string", enum: [...codigos], description: "El código de la reunión o fuente manual de donde sale (R1, M1…)." },
              cita: { type: "string", description: "Una frase de esa fuente, copiada TAL CUAL, que lo muestra." },
            },
            required: ["seccion", "texto", "fuente", "cita"],
          },
        },
      },
      required: ["sugerencias"],
    },
  };
}

/** El pedido al modelo, armado sin tocar la base. */
export function pedidoDeSugerencias(opts: {
  empresa: string;
  proyecto: string;
  congeladoAt: string;
  handoff: string;
  secciones: readonly SeccionDelHandoff[];
  fuentes: readonly FuenteNueva[];
  exclusiones?: string | null;
  instrucciones?: string | null;
  descartadas?: readonly SugerenciaDescartada[];
}): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const secciones = seccionesConSugerencias(opts.secciones);
  const instrucciones = opts.instrucciones?.trim() ?? "";
  const exclusiones = opts.exclusiones?.trim() ?? "";
  const partes: string[] = [];
  if (instrucciones) partes.push(instrucciones);
  if (exclusiones) {
    partes.push(`=== EXCLUSIONES DEL CSE (reglas duras: ganan sobre cualquier reunión) ===\n${exclusiones}`);
  }
  partes.push(`Empresa: ${opts.empresa}\nProyecto: ${opts.proyecto}\nEl handoff se congeló el ${fechaCorta(opts.congeladoAt) ?? opts.congeladoAt}.`);
  partes.push(
    `=== LO QUE YA DICE EL HANDOFF CONGELADO (lo vendido: no lo repitas) ===\n${opts.handoff.trim().slice(0, TOPE_DEL_HANDOFF) || "(sin contenido)"}`,
  );
  partes.push(`=== LAS SECCIONES DONDE PUEDES SUMAR ===\n${secciones.map((s) => `- ${s.key}: ${s.label}`).join("\n")}`);
  if (opts.descartadas?.length) {
    partes.push(
      `=== YA SE DESCARTÓ (no lo vuelvas a proponer, ni con otras palabras) ===\n${opts.descartadas
        .slice(0, 30)
        .map((d) => `- [${d.seccion}] ${d.texto}`)
        .join("\n")}`,
    );
  }
  const reuniones = opts.fuentes.filter((f) => f.tipo === "reunion");
  const manuales = opts.fuentes.filter((f) => f.tipo === "manual");
  if (reuniones.length) {
    partes.push(
      `=== REUNIONES POSTERIORES AL CONGELADO ===\n${reuniones
        .map((f) => `[${f.codigo}] ${f.sala}«${f.titulo}» · ${fechaCorta(f.fecha) ?? ""}\n${f.texto}`)
        .join("\n\n---\n\n")}`,
    );
  }
  if (manuales.length) {
    partes.push(
      `=== FUENTES MANUALES CARGADAS DESPUÉS DEL CONGELADO (pegadas a mano: atribuye lo que salga de acá) ===\n${manuales
        .map((f) => `[${f.codigo}] «${f.titulo}» · cargada el ${fechaCorta(f.fecha) ?? ""}\n${f.texto}`)
        .join("\n\n---\n\n")}`,
    );
  }
  if (exclusiones) {
    partes.push("RECORDATORIO (regla dura): antes de registrar cada sugerencia, verifica que no toque los temas de las EXCLUSIONES DEL CSE.");
  }
  partes.push(`Registra con ${NOMBRE_DE_LA_HERRAMIENTA} solo lo nuevo. Si nada cambió, una lista vacía.`);

  return {
    model: MODELO_DE_SUGERENCIAS,
    max_tokens: MAX_TOKENS_DE_SUGERENCIAS,
    temperature: 0,
    system: systemDeSugerencias(),
    tools: [herramientaDeSugerencias(secciones, opts.fuentes.map((f) => f.codigo))],
    tool_choice: { type: "tool", name: NOMBRE_DE_LA_HERRAMIENTA },
    messages: [{ role: "user", content: partes.join("\n\n") }],
  };
}

export interface SugerenciaVerificada {
  seccion: string;
  texto: string;
  cita: string;
  fuente: FuenteNueva;
}

export interface LecturaDeSugerencias {
  verificadas: SugerenciaVerificada[];
  /** La frase no aparece tal cual en la fuente que nombró: no entra. */
  sinCita: number;
  /** Sección o fuente que no existe, texto vacío, repetida o ya descartada. */
  fuera: number;
}

const huella = (s: string) => normalizarParaCita(s).replace(/[.…]+$/, "").trim();

/** La misma huella con que se reconoce una sugerencia descartada: la usa «Uso de Nexus» (lib/lo-propuesto). */
export const huellaDeLaSugerencia = huella;

/**
 * Lo que devolvió el modelo, validado: sección permitida, fuente conocida, texto con algo, la cita tal cual en
 * esa fuente, sin repetir y sin lo que ya se descartó (por la cita o por el mismo texto). Tope de 15.
 */
export function leerSugerencias(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  ctx: { secciones: readonly SeccionDelHandoff[]; fuentes: readonly FuenteNueva[]; descartadas?: readonly SugerenciaDescartada[] },
): LecturaDeSugerencias {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA);
  const crudas =
    bloque && bloque.type === "tool_use" ? (bloque.input as { sugerencias?: unknown } | null)?.sugerencias : undefined;
  const lista = Array.isArray(crudas) ? crudas : [];
  const permitidas = new Set(seccionesConSugerencias(ctx.secciones).map((s) => s.key));
  const porCodigo = new Map(ctx.fuentes.map((f) => [f.codigo, f]));
  const textoNormal = new Map(ctx.fuentes.map((f) => [f.codigo, normalizarParaCita(f.texto)]));
  const descartadasCita = new Set((ctx.descartadas ?? []).map((d) => huella(d.cita)).filter(Boolean));
  const descartadasTexto = new Set((ctx.descartadas ?? []).map((d) => huella(d.texto)).filter(Boolean));
  const vistas = new Set<string>();

  const verificadas: SugerenciaVerificada[] = [];
  let sinCita = 0;
  let fuera = 0;
  for (const cruda of lista) {
    const o = (cruda && typeof cruda === "object" ? cruda : {}) as Record<string, unknown>;
    const seccion = typeof o.seccion === "string" ? o.seccion.trim() : "";
    const texto = typeof o.texto === "string" ? o.texto.trim().slice(0, MAX_TEXTO) : "";
    const codigo = typeof o.fuente === "string" ? o.fuente.trim().toUpperCase() : "";
    const cita = typeof o.cita === "string" ? o.cita.trim().replace(/^[«"“]+|[»"”]+$/g, "").trim().slice(0, MAX_CITA) : "";
    const fuente = porCodigo.get(codigo);
    if (!permitidas.has(seccion) || !texto || !fuente) {
      fuera++;
      continue;
    }
    if (!cita || !citaEstaEnLasFuentes(cita, textoNormal.get(codigo) ?? "")) {
      sinCita++;
      continue;
    }
    const clave = `${seccion}|${huella(cita)}`;
    if (vistas.has(clave) || descartadasCita.has(huella(cita)) || descartadasTexto.has(huella(texto))) {
      fuera++;
      continue;
    }
    vistas.add(clave);
    verificadas.push({ seccion, texto, cita, fuente });
    if (verificadas.length >= TOPE_DE_SUGERENCIAS) break;
  }
  return { verificadas, sinCita, fuera };
}

/** Lo que guarda el bloque en `data`: la marca, y de dónde salió (para no volver a proponer lo descartado). */
export interface DatosDeLaSugerencia {
  [MARCA_DE_SUGERENCIA]: {
    fuente: "reunion" | "manual";
    id: string;
    titulo: string;
    fecha: string;
    cita: string;
    texto: string;
  };
}

/** El bloque de texto de una sugerencia: qué cambia y de dónde sale, con la cita. */
export function bloqueDeSugerencia(s: SugerenciaVerificada): { content: string; data: DatosDeLaSugerencia } {
  const fecha = fechaCorta(s.fuente.fecha);
  const deDonde =
    s.fuente.tipo === "reunion"
      ? `De la reunión «${s.fuente.titulo}»${fecha ? ` del ${fecha}` : ""}`
      : `De la fuente manual «${s.fuente.titulo}»${fecha ? `, cargada el ${fecha}` : ""}`;
  return {
    content: `**Lo nuevo:** ${s.texto}\n\n${deDonde}: «${s.cita}»`,
    data: {
      [MARCA_DE_SUGERENCIA]: {
        fuente: s.fuente.tipo,
        id: s.fuente.id,
        titulo: s.fuente.titulo,
        fecha: s.fuente.fecha,
        cita: s.cita,
        texto: s.texto,
      },
    },
  };
}

/** Lo que dejó escrito una sugerencia en su bloque (para saber qué se descartó). `null` si no es una. */
export function sugerenciaDelBloque(data: unknown): { cita: string; texto: string } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const m = (data as Record<string, unknown>)[MARCA_DE_SUGERENCIA];
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  return typeof o.cita === "string" ? { cita: o.cita, texto: typeof o.texto === "string" ? o.texto : "" } : null;
}

/** Lo que guarda la corrida en su salida: cada sugerencia que propuso, para la próxima vez. */
export interface SalidaDeSugerencias {
  modo: "sugerir";
  sectionCount: number;
  sugerencias: Array<{ seccion: string; texto: string; cita: string; fuente: string }>;
  sinCita: number;
  fuentes: number;
}

/**
 * Lo que ya se propuso en corridas anteriores y hoy no está en el documento (ni pendiente ni usado): alguien
 * lo descartó. `vivas` son las citas de los bloques que hoy llevan la marca.
 */
export function descartadasDe(
  salidasAnteriores: readonly unknown[],
  vivas: readonly string[],
): SugerenciaDescartada[] {
  const enElDocumento = new Set(vivas.map(huella));
  const out: SugerenciaDescartada[] = [];
  const vistas = new Set<string>();
  for (const s of salidasAnteriores) {
    const lista = (s && typeof s === "object" ? (s as { sugerencias?: unknown }).sugerencias : null) ?? [];
    if (!Array.isArray(lista)) continue;
    for (const x of lista) {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const cita = typeof o.cita === "string" ? o.cita : "";
      const seccion = typeof o.seccion === "string" ? o.seccion : "";
      const texto = typeof o.texto === "string" ? o.texto : "";
      const h = huella(cita);
      if (!h || enElDocumento.has(h) || vistas.has(h)) continue;
      vistas.add(h);
      out.push({ seccion, texto, cita });
    }
  }
  return out;
}
