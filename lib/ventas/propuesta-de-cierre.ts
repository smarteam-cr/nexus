/**
 * lib/ventas/propuesta-de-cierre.ts — el PEDIDO a Claude que propone la fecha de cierre y el monto de un negocio, y la
 * LECTURA de su respuesta (2026-10-14, decisión 1 de docs/mi-dia-plan.md). PURO: lo prueban los tests sin red.
 *
 * Elías: «que Nexus pueda preguntar la fecha de cierre o el monto, basado en la interacción con nuestro CRM o las
 * sesiones con el cliente». Nexus PROPONE; el vendedor lo usa o no, y recién ahí se escribe en HubSpot.
 *
 * ── QUÉ CUENTA ───────────────────────────────────────────────────────────────
 * Solo lo que alguien DIJO o ESCRIBIÓ: una fecha o un plazo («firmamos antes de fin de mes»), un precio o un
 * presupuesto para ESTE negocio. La prueba es una frase copiada TAL CUAL de la fuente: si no aparece en el texto, la
 * propuesta se cae (la misma regla de la etapa sugerida y de la escala en la preventa). Una cita inventada le haría
 * escribir en HubSpot algo que nadie dijo.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { PropuestaDeCierre } from "./negocios";

export const MODELO_PROPUESTA_DE_CIERRE = "claude-haiku-4-5-20251001";
const TOOL = "registrar_cierre";
const MIN_CITA = 8;
const MAX_CITA = 300;
/** Una propuesta sirve este tiempo, salvo que el negocio tenga actividad nueva. */
export const VIDA_DE_LA_PROPUESTA_MS = 24 * 3_600_000;

export interface FuenteDeCierre {
  /** «Reunión «Revisión de la propuesta» del 12 oct», «HubSpot · nota del 3 oct», «Siguiente paso en HubSpot». */
  rotulo: string;
  texto: string;
}

export function pedidoDeCierre(opts: {
  negocio: string;
  empresa: string;
  etapa: string;
  moneda: string;
  falta: { fecha: boolean; monto: boolean };
  hoyISO: string;
  fuentes: FuenteDeCierre[];
}): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const falta = [opts.falta.fecha ? "la fecha de cierre" : null, opts.falta.monto ? "el monto" : null].filter(Boolean).join(" y ");
  const cuerpo = [
    `Hoy es ${opts.hoyISO}.`,
    `Negocio: «${opts.negocio}», de la empresa ${opts.empresa}, en la etapa «${opts.etapa}». La moneda del negocio es ${opts.moneda}.`,
    `Le falta ${falta}.`,
    "",
    "Lo que se habló y se escribió con la empresa:",
    ...opts.fuentes.map((f, i) => `\n[F${i + 1}] ${f.rotulo}\n${f.texto}`),
  ].join("\n");
  return {
    model: MODELO_PROPUESTA_DE_CIERRE,
    max_tokens: 800,
    temperature: 0,
    system: [
      "Lees lo que el equipo de Smarteam habló y escribió con una empresa, y propones la fecha de cierre y el monto de UN negocio, SOLO si alguien lo dijo.",
      "Reglas:",
      "- La fecha: solo si una fuente dice cuándo piensan decidir, firmar o arrancar. Un plazo se pasa a su último día («a fin de noviembre» = el 30 de noviembre; «antes de diciembre» = el 30 de noviembre). Nunca una fecha anterior a hoy. Si nadie lo dijo, no la propongas.",
      "- El monto: solo si una fuente dice el precio, la propuesta o el presupuesto de ESTE negocio, en una sola cifra. Si hay varias cifras y no se sabe cuál es la de este negocio, no lo propongas. Nunca sumes ni conviertas monedas.",
      "- La cita es una frase copiada TAL CUAL de la fuente, sin cambiar una palabra. La fuente es el rótulo de esa fuente, tal como aparece entre corchetes.",
      "- Si no hay nada que proponer, llama la herramienta sin campos.",
    ].join("\n"),
    tools: [
      {
        name: TOOL,
        description: "Registra la fecha de cierre y el monto que dice alguna fuente.",
        input_schema: {
          type: "object",
          properties: {
            fechaCierre: {
              type: "object",
              properties: {
                valor: { type: "string", description: "AAAA-MM-DD" },
                cita: { type: "string" },
                fuente: { type: "string", description: "El rótulo de la fuente, sin los corchetes." },
              },
              required: ["valor", "cita", "fuente"],
            },
            monto: {
              type: "object",
              properties: {
                valor: { type: "number" },
                moneda: { type: "string", description: "USD, CRC…" },
                cita: { type: "string" },
                fuente: { type: "string" },
              },
              required: ["valor", "moneda", "cita", "fuente"],
            },
          },
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Para comparar una cita con el texto: sin mayúsculas, sin tildes, con comillas y espacios iguales. */
export function normal(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[«»"“”'‘’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function citaValida(cita: unknown, fuentes: FuenteDeCierre[]): string | null {
  if (typeof cita !== "string") return null;
  const c = cita.trim();
  if (c.length < MIN_CITA || c.length > MAX_CITA) return null;
  const n = normal(c);
  return fuentes.some((f) => normal(f.texto).includes(n)) ? c : null;
}

function rotuloValido(fuente: unknown, fuentes: FuenteDeCierre[]): string {
  const f = typeof fuente === "string" ? fuente.replace(/^\[?F\d+\]?\s*/, "").trim() : "";
  return fuentes.find((x) => x.rotulo === f)?.rotulo ?? fuentes.find((x) => f && x.rotulo.includes(f))?.rotulo ?? "lo que se habló";
}

/**
 * Lee la respuesta y deja solo lo que se sostiene: la cita está en una fuente, la fecha es válida y no pasó, el monto
 * es positivo y en la moneda del negocio. Lo que no pasa se descarta (no se arregla).
 */
export function leerPropuestaDeCierre(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  ctx: { fuentes: FuenteDeCierre[]; hoyISO: string; moneda: string; falta: { fecha: boolean; monto: boolean }; ahora: Date },
): PropuestaDeCierre {
  const out: PropuestaDeCierre = { calculadaAt: ctx.ahora.toISOString() };
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === TOOL);
  if (!bloque || bloque.type !== "tool_use") return out;
  const input = bloque.input as { fechaCierre?: Record<string, unknown>; monto?: Record<string, unknown> };

  const f = input.fechaCierre;
  if (ctx.falta.fecha && f && typeof f.valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.valor)) {
    const valida = Number.isFinite(Date.parse(`${f.valor}T00:00:00Z`)) && f.valor >= ctx.hoyISO;
    const cita = citaValida(f.cita, ctx.fuentes);
    if (valida && cita) out.fechaCierre = { valor: f.valor, cita, fuente: rotuloValido(f.fuente, ctx.fuentes) };
  }

  const m = input.monto;
  if (ctx.falta.monto && m && typeof m.valor === "number" && Number.isFinite(m.valor) && m.valor > 0) {
    const moneda = typeof m.moneda === "string" ? m.moneda.trim().toUpperCase() : "";
    const cita = citaValida(m.cita, ctx.fuentes);
    // En otra moneda no se propone: escribirla en el negocio la convertiría sin decirlo.
    if (moneda === ctx.moneda && cita) {
      out.monto = { valor: Math.round(m.valor * 100) / 100, moneda, cita, fuente: rotuloValido(m.fuente, ctx.fuentes) };
    }
  }
  return out;
}
