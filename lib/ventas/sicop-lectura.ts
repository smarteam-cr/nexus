/**
 * lib/ventas/sicop-lectura.ts — LEER EL TICKET COMO LO LEERÍA UNA PERSONA.
 *
 * El pipeline «Gobiernos» se alimenta de un scraper de SICOP: cada licitación entra como un
 * ticket cuyo TÍTULO es el objeto de la contratación y cuyas NOTAS son donde de verdad está
 * la información — el resumen del cartel que escribió alguien del equipo (requisitos de
 * admisibilidad, forma de cotizar, garantías, tecnología obligatoria), las dudas sueltas
 * ("hay un requisito financiero que no comprendo") y el veredicto automático del propio
 * scraper. Nada de eso vive en una propiedad: vive en prosa, y por eso hasta hoy solo servía
 * si alguien la leía entera, ticket por ticket, en HubSpot.
 *
 * Este módulo la lee y la convierte en los cinco datos con los que se prioriza:
 *   1. de qué es (objeto + institución + categorías),
 *   2. si es para nosotros (encaje),
 *   3. si lo podemos ganar (probabilidad + qué nos bloquea),
 *   4. cómo se evalúa y qué hay que entregar,
 *   5. cuándo cierra.
 *
 * ── DOS DECISIONES QUE NO SON DETALLES ───────────────────────────────────────
 *
 * ⛔ FUERA ES DESTRUCTIVO. La pantalla esconde por default lo que se marca FUERA, así que un
 * falso "fuera" no se lee como un error: se lee como que la licitación nunca existió. Por eso
 * el prompt empuja a DUDOSO ante cualquier duda y reserva FUERA para lo que no tiene nada que
 * ver con software ni comunicación (obra civil, vehículos, alimentos, limpieza).
 *
 * ⚠ NO SE LE CREE AL SCRAPER. Sus notas de "Análisis de filtro" entran como INSUMO, no como
 * conclusión — el 2026-08-23 se encontró la misma nota de análisis escrita en dos tickets
 * distintos (el veredicto de una consultoría de marca terminó pegado a un ticket de hosting).
 * Un veredicto que puede aterrizar en el ticket equivocado no puede ser la respuesta final.
 */
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import {
  CATEGORIAS_SICOP,
  CATEGORIAS_VALIDAS,
  type BloqueanteSicop,
  type EncajeSicop,
  type LecturaSicop,
  type PlazoSicop,
} from "./sicop-orden";

/** Tarifado en `lib/ai/precios.ts` — cambiarlo por uno que no lo esté deja el gasto en null. */
export const MODELO_SICOP = "claude-sonnet-4-6";

/** Tope de la fuente que entra al prompt. La nota más larga de hoy son ~2.400 caracteres. */
const MAX_FUENTE = 24_000;

// ── La fuente: título + descripción + TODAS las notas ──────────────────────────

export interface NotaDeTicket {
  id: string;
  /** ISO. Ordena la prosa como se escribió: la última nota suele ser la que manda. */
  creadaEl: string | null;
  cuerpo: string;
}

export interface TicketParaLeer {
  id: string;
  asunto: string;
  contenido: string | null;
  procedimiento: string | null;
  tipoContratacion: string | null;
  formatoEvaluacion: string | null;
  fechaAclaraciones: string | null;
  presupuestoCrm: number | null;
  notas: NotaDeTicket[];
}

export interface FuenteDeLicitacion {
  texto: string;
  /** Huella de lo leído. Si cambia, el análisis guardado quedó viejo. */
  sha: string;
  /** Cuántas notas entraron — la pantalla lo muestra: 0 notas = poco que interpretar. */
  notas: number;
  /** true = se recortó por tamaño; el prompt lo dice para que el modelo no invente el resto. */
  truncada: boolean;
}

/** HTML de HubSpot → texto plano. Las notas vienen como `<div><p>…</p></div>`. */
export function aTextoPlano(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Arma el texto que lee el modelo y su huella. PURO — es lo que prueba el test.
 *
 * ⚠ La huella se calcula sobre el TEXTO FINAL, no sobre el ticket: así una nota nueva, una
 * nota editada o un título corregido invalidan el análisis, y un cambio que no toca nada de
 * lo que se leyó (mover de etapa, cambiar el responsable) NO lo invalida. Lo segundo importa
 * tanto como lo primero: re-analizar 45 licitaciones porque alguien arrastró una tarjeta es
 * plata quemada.
 */
export function construirFuente(t: TicketParaLeer): FuenteDeLicitacion {
  const partes: string[] = [`TÍTULO: ${t.asunto.trim()}`];
  if (t.contenido?.trim()) partes.push(`DESCRIPCIÓN: ${t.contenido.trim()}`);

  const datos = [
    t.procedimiento && `Nro de procedimiento: ${t.procedimiento}`,
    t.tipoContratacion && `Tipo de contratación: ${t.tipoContratacion}`,
    t.formatoEvaluacion && `Formato de evaluación declarado: ${t.formatoEvaluacion}`,
    t.fechaAclaraciones && `Recepción de aclaraciones: ${t.fechaAclaraciones}`,
    t.presupuestoCrm != null && `Presupuesto cargado en el CRM: ${t.presupuestoCrm}`,
  ].filter(Boolean) as string[];
  if (datos.length) partes.push(`DATOS DEL CRM:\n${datos.join("\n")}`);

  const notas = [...t.notas]
    .sort((a, b) => (a.creadaEl ?? "").localeCompare(b.creadaEl ?? ""))
    .map((n) => aTextoPlano(n.cuerpo))
    .filter((c) => c.length > 0);

  if (notas.length) {
    partes.push(
      `NOTAS DEL TICKET (${notas.length}, de la más vieja a la más nueva):\n` +
        notas.map((c, i) => `--- nota ${i + 1} ---\n${c}`).join("\n\n"),
    );
  } else {
    partes.push("NOTAS DEL TICKET: ninguna.");
  }

  let texto = partes.join("\n\n");
  const truncada = texto.length > MAX_FUENTE;
  if (truncada) {
    texto =
      texto.slice(0, MAX_FUENTE) +
      "\n\n[…RECORTADO POR LONGITUD. Lo que sigue no lo estás viendo: no concluyas sobre lo que falta.]";
  }

  return {
    texto,
    sha: createHash("sha256").update(texto).digest("hex").slice(0, 32),
    notas: notas.length,
    truncada,
  };
}

// ── El criterio de negocio ─────────────────────────────────────────────────────

/**
 * QUÉ VENDE SMARTEAM, para que el modelo pueda decir si una licitación es nuestra.
 *
 * ⚠ ESTE ES EL PUNTO DE CALIBRACIÓN de todo el módulo: si la pantalla empieza a esconder
 * cosas que sí eran para nosotros, o a marcar DENTRO cosas que no, se toca acá y no en la
 * mecánica. Vive en código y no en la tabla `Agent` a propósito para esta primera versión —
 * cuando haya que ajustarlo desde pantalla, se mueve ahí con el resto de los agentes.
 *
 * ⛔ El ICP de Marketing (`lib/marketing/seed-data.ts`) NO sirve para esto y no se importa:
 * describe empresas privadas de más de USD 10M en retail, real estate y servicios
 * financieros. Aplicado a compras públicas diría "fuera de ICP" para el pipeline entero.
 */
export const CRITERIO_SMARTEAM = `SMARTEAM es una agencia y consultora de Costa Rica, partner de HubSpot e Insider. Lo que vende:

- Sitios web: diseño, desarrollo, rediseño, migración y e-commerce. También CMS de HubSpot.
- Hosting, dominios, certificados y mantenimiento de sitios ya publicados.
- CRM: implementación de HubSpot, refresh de un CRM existente, capacitación y adopción.
- Integraciones: API, conexión de CRM con ERP u otros sistemas, interoperabilidad de datos.
- Marketing digital: pauta y publicidad en medios digitales, campañas, redes, contenido, marca.
- Estrategia y consultoría: procesos comerciales, RevOps, transformación digital, analítica.
- Reventa de licencias de software cuando la contratación lo permite (ha ofertado Zoom y Adobe).
- Soporte y mesa de ayuda ACOTADOS a las plataformas que implementa.

Lo que NO hace: obra civil, vehículos, mobiliario, alimentos, limpieza, seguridad física,
suministro de hardware, auditoría de seguridad informática, ni desarrollo de software a la
medida en stacks que no domina cuando el cartel lo impone como requisito rígido.`;

// ── La herramienta ─────────────────────────────────────────────────────────────

const TOOL_LECTURA: Anthropic.Messages.Tool = {
  name: "registrar_lectura",
  description:
    "Registra lo que entendiste de la licitación. Llámala UNA sola vez. Si un dato no está " +
    "en el texto, omitilo o mandá null: inventarlo es peor que no tenerlo.",
  input_schema: {
    type: "object",
    properties: {
      objeto: {
        type: "string",
        description:
          "Qué se contrata, en una o dos frases y en castellano llano. No copies el título: " +
          "explicá qué hay que hacer.",
      },
      institucion: {
        type: "string",
        description: "Qué institución pública contrata, si se puede saber.",
      },
      categorias: {
        type: "array",
        items: { type: "string", enum: [...CATEGORIAS_VALIDAS] },
        description:
          "Una o más de la lista cerrada. Usá 'otro' SOLO si de verdad no encaja en ninguna.",
      },
      encaje: {
        type: "string",
        enum: ["DENTRO", "DUDOSO", "FUERA"],
        description:
          "DENTRO = es claramente algo que Smarteam vende. FUERA = no tiene NADA que ver con " +
          "software, web, datos ni comunicación (obra civil, vehículos, alimentos, limpieza, " +
          "hardware). DUDOSO = todo lo demás, incluido lo que suena parecido pero no se puede " +
          "confirmar sin el cartel. ⛔ Ante la duda va DUDOSO, nunca FUERA: lo marcado FUERA se " +
          "esconde de la pantalla y una licitación escondida por error es una venta perdida.",
      },
      encajeRazon: {
        type: "string",
        description: "Por qué. Una o dos frases, concretas, citando lo que leíste.",
      },
      puntajeEncaje: {
        type: "integer",
        description: "0 a 100. Cuánto se parece a lo que Smarteam vende.",
      },
      probabilidad: {
        type: "integer",
        description:
          "0 a 100. Cuán ganable se ve, MIRANDO REQUISITOS Y EVALUACIÓN — no cuán deseable es. " +
          "Baja si el cartel exige tecnología, experiencia, garantías o respaldo financiero que " +
          "una agencia mediana no cumple, o si adjudica 100% por precio. Si el texto no alcanza " +
          "para juzgarlo, omitila en vez de adivinar.",
      },
      probabilidadRazon: { type: "string", description: "Por qué ese número." },
      bloqueantes: {
        type: "array",
        description:
          "Lo que nos deja afuera o nos complica: tecnología obligatoria, garantías largas, " +
          "experiencia mínima, requisitos financieros o administrativos, plazos imposibles.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "El requisito, en pocas palabras." },
            detalle: { type: "string", description: "La exigencia concreta tal como la leíste." },
            severidad: {
              type: "string",
              enum: ["BLOQUEA", "RIESGO"],
              description:
                "BLOQUEA = no podemos ofertar sin resolverlo. RIESGO = se puede, pero cuesta.",
            },
          },
          required: ["titulo", "severidad"],
        },
      },
      evaluacion: {
        type: "string",
        description:
          "Cómo se adjudica: qué se puntúa, con qué peso, dónde se sacan puntos extra. Si el " +
          "texto no lo dice, omitilo.",
      },
      pesoPrecio: {
        type: "integer",
        description:
          "0 a 100: cuánto del puntaje se lleva el PRECIO. 100 = adjudica solo por precio. " +
          "Omitilo si el texto no lo dice — no lo estimes.",
      },
      entregables: {
        type: "string",
        description: "Qué hay que entregar, en dos o tres líneas.",
      },
      plazos: {
        type: "array",
        description:
          "Fechas del proceso: aclaraciones, apertura de ofertas, adjudicación, plazo de " +
          "ejecución, vigencia del contrato.",
        items: {
          type: "object",
          properties: {
            etiqueta: { type: "string", description: "Qué es esa fecha." },
            fecha: {
              type: "string",
              description:
                "AAAA-MM-DD. Omitila si el cartel da un plazo relativo ('30 días hábiles') y " +
                "poné eso en `nota`. ⛔ No calcules fechas: si no está escrita, no la hay.",
            },
            nota: { type: "string" },
          },
          required: ["etiqueta"],
        },
      },
      monto: {
        type: "number",
        description:
          "El presupuesto o valor estimado, como número, si aparece en el texto. Sin separadores.",
      },
      moneda: {
        type: "string",
        enum: ["CRC", "USD"],
        description:
          "La moneda de `monto`. ⛔ Solo si el texto la dice o es evidente por la magnitud y el " +
          "contexto; si no, omitila. El campo del CRM mezcla monedas y no sirve de pista.",
      },
      confianza: {
        type: "integer",
        description:
          "0 a 100: cuánta información REAL había para leer. Un ticket con solo el título va " +
          "bajo aunque el título sea clarísimo. No es cuán seguro estás de tu conclusión.",
      },
    },
    required: ["objeto", "categorias", "encaje", "encajeRazon", "confianza"],
  },
};

const SYSTEM_SICOP = `Sos el analista de contratación pública de Smarteam. Leés licitaciones de SICOP (Costa Rica) tal como llegan al CRM —un título, a veces una descripción, y las notas que el equipo fue dejando— y las convertís en una ficha con la que Ventas decide a cuáles dedicarles tiempo.

${CRITERIO_SMARTEAM}

CÓMO LEER:
- Las NOTAS son la fuente más rica y la razón de ser de tu trabajo: ahí están los requisitos de admisibilidad, la forma de cotizar, las garantías exigidas, la tecnología obligatoria y las dudas del equipo. Leelas enteras antes de concluir.
- Si una nota es un "Análisis de filtro" automático, tratala como OPINIÓN DE OTRO, no como respuesta. Se ha comprobado que ese análisis a veces quedó pegado al ticket equivocado: si su razón no habla de lo mismo que el título, ignorala y decilo en tu razón.
- Distinguí lo que el texto DICE de lo que vos inferís. No completes un cartel que no leíste.
- Escribí en castellano llano, tuteando, sin adjetivos de venta.

⛔ REGLA DURA: ante la duda, DUDOSO. Marcar FUERA esconde la licitación de la pantalla.`;

// ── Normalización (PURA) ───────────────────────────────────────────────────────

function texto(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function entero0a100(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Los dos arrays de la ficha, saneados. EXPORTADOS porque los usan DOS lectores: la salida
 * cruda del modelo y las columnas JSON de la base. Un `as BloqueanteSicop[]` sobre lo que
 * vuelve de Postgres es una promesa que nadie verifica — y basta un `plazos` viejo de una
 * versión anterior del prompt para que la pantalla intente pintar `undefined.titulo`.
 */
export function normalizarBloqueantes(crudo: unknown): BloqueanteSicop[] {
  if (!Array.isArray(crudo)) return [];
  const out: BloqueanteSicop[] = [];
  for (const b of crudo) {
    const x = (b ?? {}) as Record<string, unknown>;
    const titulo = texto(x.titulo);
    if (!titulo) continue;
    out.push({
      titulo,
      detalle: texto(x.detalle),
      severidad: x.severidad === "BLOQUEA" ? "BLOQUEA" : "RIESGO",
    });
  }
  return out;
}

export function normalizarPlazos(crudo: unknown): PlazoSicop[] {
  if (!Array.isArray(crudo)) return [];
  const out: PlazoSicop[] = [];
  for (const p of crudo) {
    const x = (p ?? {}) as Record<string, unknown>;
    const etiqueta = texto(x.etiqueta);
    if (!etiqueta) continue;
    const f = texto(x.fecha);
    // Solo AAAA-MM-DD. Cualquier otra forma se descarta: una fecha que no ordena es ruido en
    // la pantalla y basura en el criterio de "lo que vence antes".
    out.push({
      etiqueta,
      fecha: f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null,
      nota: texto(x.nota),
    });
  }
  return out;
}

/**
 * Convierte la salida cruda de la herramienta en una `LecturaSicop` sana. PURA y probada.
 *
 * ⚠ Un enum que el modelo inventa NO se propaga: una categoría desconocida se descarta y un
 * `encaje` fuera de vocabulario cae a DUDOSO. La caída es a DUDOSO y no a FUERA porque el
 * default de un dato roto no puede ser el que esconde la fila.
 */
export function normalizarLectura(
  crudo: unknown,
  meta: { modelo: string; analizadoEl: string },
): LecturaSicop {
  const o = (crudo ?? {}) as Record<string, unknown>;

  const encajeCrudo = typeof o.encaje === "string" ? o.encaje.toUpperCase() : "";
  const encaje: EncajeSicop =
    encajeCrudo === "DENTRO" || encajeCrudo === "FUERA" ? encajeCrudo : "DUDOSO";

  const categorias = Array.isArray(o.categorias)
    ? [...new Set(o.categorias.filter((c): c is string => typeof c === "string"))].filter((c) =>
        CATEGORIAS_VALIDAS.includes(c),
      )
    : [];

  const bloqueantes = normalizarBloqueantes(o.bloqueantes);
  const plazos = normalizarPlazos(o.plazos);

  const montoCrudo = typeof o.monto === "number" ? o.monto : Number(o.monto);
  const monto = Number.isFinite(montoCrudo) && montoCrudo > 0 ? montoCrudo : null;

  return {
    objeto: texto(o.objeto),
    institucion: texto(o.institucion),
    categorias: categorias.length > 0 ? categorias : ["otro"],
    encaje,
    encajeRazon: texto(o.encajeRazon),
    puntajeEncaje: entero0a100(o.puntajeEncaje),
    probabilidad: entero0a100(o.probabilidad),
    probabilidadRazon: texto(o.probabilidadRazon),
    bloqueantes,
    evaluacion: texto(o.evaluacion),
    pesoPrecio: entero0a100(o.pesoPrecio),
    entregables: texto(o.entregables),
    plazos,
    // Sin moneda declarada queda null: el consumidor decide qué hacer con lo que no sabe.
    monto,
    moneda: o.moneda === "CRC" || o.moneda === "USD" ? o.moneda : null,
    confianza: entero0a100(o.confianza),
    analizadoEl: meta.analizadoEl,
    modelo: meta.modelo,
    error: null,
  };
}

/** Una lectura que falló — se guarda igual, con el motivo a la vista. */
export function lecturaConError(motivo: string, analizadoEl: string): LecturaSicop {
  return {
    objeto: null,
    institucion: null,
    categorias: [],
    encaje: "DUDOSO",
    encajeRazon: null,
    puntajeEncaje: null,
    probabilidad: null,
    probabilidadRazon: null,
    bloqueantes: [],
    evaluacion: null,
    pesoPrecio: null,
    entregables: null,
    plazos: [],
    monto: null,
    moneda: null,
    confianza: null,
    analizadoEl,
    modelo: null,
    error: motivo,
  };
}

// ── La llamada ─────────────────────────────────────────────────────────────────

/**
 * Lee UNA licitación con Claude. Nunca tira: un fallo vuelve como `LecturaSicop` con `error`,
 * porque una corrida de 45 tickets no se puede caer entera por uno que dio timeout.
 */
export async function leerLicitacionConIA(fuente: FuenteDeLicitacion): Promise<LecturaSicop> {
  const analizadoEl = new Date().toISOString();
  try {
    const respuesta = await getAnthropic().messages.create({
      model: MODELO_SICOP,
      max_tokens: 2500,
      system: SYSTEM_SICOP,
      tools: [TOOL_LECTURA],
      // `any` y no `auto`: la respuesta útil de esta llamada es la ficha, no un párrafo. Sin
      // forzarla, el modelo a veces contesta en prosa y hay que pagar un reintento entero.
      tool_choice: { type: "tool", name: TOOL_LECTURA.name },
      messages: [
        {
          role: "user",
          content:
            `Leé esta licitación del pipeline de Gobiernos y registrá la ficha.\n\n` +
            `Categorías disponibles: ${CATEGORIAS_SICOP.map((c) => `${c.key} (${c.label})`).join(", ")}.\n\n` +
            `====================\n${fuente.texto}\n====================`,
        },
      ],
    });

    for (const bloque of respuesta.content) {
      if (bloque.type === "tool_use" && bloque.name === TOOL_LECTURA.name) {
        return normalizarLectura(bloque.input, { modelo: MODELO_SICOP, analizadoEl });
      }
    }
    return lecturaConError("El modelo no devolvió la ficha", analizadoEl);
  } catch (e) {
    return lecturaConError(e instanceof Error ? e.message : "Falló la llamada a Claude", analizadoEl);
  }
}
