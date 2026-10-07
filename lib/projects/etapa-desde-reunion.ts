/**
 * lib/projects/etapa-desde-reunion.ts — el PEDIDO a Claude que lee una reunión y dice si el proyecto
 * ya pasó a otra etapa, y la LECTURA de su respuesta. Puro (sin base, sin red, sin `server-only`):
 * lo usa `etapa-desde-reunion-server.ts` y lo prueban los tests sin cargar módulos de Next.
 *
 * ── QUÉ CUENTA COMO EVIDENCIA ────────────────────────────────────────────────
 * Lo que la reunión muestra que YA pasó o está pasando («presentamos el diagnóstico», «ya estamos
 * configurando los pipelines»), nunca lo que se planea («la semana que viene presentamos»). Y la
 * prueba es una frase copiada TAL CUAL de la reunión: si no aparece en el texto, la sugerencia se
 * cae. Es la regla de la preventa para un nivel de la escala: una cita inventada engañaría a quien
 * aprueba, y mover la etapa lo ve todo el equipo en el tablero.
 *
 * ⛔ No lee el avance del cronograma (la circularidad de `etapa-hubspot.ts`): la etapa es el ancla
 * del avance, y proponerla desde el avance haría que el sistema se confirme a sí mismo.
 * ⛔ Solo hacia ADELANTE y nunca una etapa de cierre: las opciones que ve el modelo salen de
 * `etapasQueSePuedenDetectar`, y la lectura vuelve a exigirlo (el modelo puede devolver cualquier id).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { buscarEtapa, lineaDeAvance, type PipelineDef, type PipelineStage } from "./kind";
import { etapasProponibles } from "./etapa-hubspot";

/** Corre con cada reunión de un proyecto: el modelo barato. */
export const MODELO_ETAPA_REUNION = "claude-haiku-4-5-20251001";
/** Una reunión más vieja que esto no sugiere nada: la etapa pudo moverse después y no lo sabríamos. */
export const VENTANA_DE_LA_REUNION_DIAS = 21;
/** Lo que se lee de la reunión. */
export const MAX_TEXTO_REUNION = 30_000;
const MIN_CITA = 12;
const MAX_CITA = 300;
const MAX_MOTIVO = 280;

/**
 * Qué quiere decir que el proyecto ESTÉ en cada etapa, por id. Le dice al modelo qué buscar en la
 * reunión. Una etapa sin descripción se presenta solo con su nombre.
 */
const QUE_SIGNIFICA: Record<string, string> = {
  // Implementación de HubSpot (Customer Success)
  "1225193551": "Ventas traspasó el proyecto; todavía no hubo kickoff con el cliente.",
  "1410223916": "Ya hubo kickoff; el equipo está entendiendo el negocio y los procesos del cliente en sesiones.",
  "1410223917": "El entendimiento está cerrado; se arma o se presenta el diagnóstico al cliente.",
  "1410223918": "El diagnóstico ya se presentó; se define con el cliente el plan, la arquitectura en HubSpot y el cronograma.",
  "1225193541": "El plan está acordado; se está configurando HubSpot (propiedades, pipelines, automatizaciones, integraciones o migración).",
  "1225193553": "La configuración está aprobada; se capacita al equipo del cliente y empieza a usar HubSpot.",
  "1410223919": "El equipo del cliente ya usa HubSpot; se mide y se ajusta ese uso.",
  "1241442148": "El uso está validado; se hace la entrega formal y el cierre con el cliente.",
  // Desarrollo e integración
  "1409898886": "Ventas traspasó el desarrollo; todavía no arrancó con el cliente.",
  "1409897653": "Se están entendiendo los sistemas y lo que hay que conectar o construir.",
  "1409897655": "Se escriben y acuerdan los requerimientos con el cliente.",
  "1409932561": "Se está construyendo el desarrollo o la integración.",
  "1409932562": "El desarrollo está construido y se prueba con el cliente.",
  "1409932563": "Las pruebas están aprobadas; se entrega y se pone en producción.",
  // Sitios web
  "1409897123": "Ventas traspasó el sitio; todavía no arrancó con el cliente.",
  "1409897124": "Se está entendiendo qué necesita el sitio (referencias, contenido, funcionalidad).",
  "1409897125": "Se está diseñando el mockup del sitio.",
  "1409897127": "El mockup se presentó y se está acordando con el cliente.",
  "1409897126": "El diseño está aprobado; se está construyendo el sitio.",
  "1409897128": "El sitio está construido; se entrega y se publica.",
};

/**
 * Las etapas a las que la reunión puede mover el proyecto: las movibles que van DESPUÉS de la de hoy
 * en la línea. Vacío si la de hoy es de cierre o está fuera de la línea (Bloqueado, Continuidad):
 * desde ahí, salir es una decisión que no se lee de una reunión.
 */
export function etapasQueSePuedenDetectar(def: PipelineDef, actualStageId: string | null | undefined): PipelineStage[] {
  const linea = lineaDeAvance(def);
  const proponibles = new Set(etapasProponibles(def).map((e) => e.id));
  if (!actualStageId) return linea.filter((s) => proponibles.has(s.id));
  if (def.closedStageIds.includes(actualStageId)) return [];
  const i = linea.findIndex((s) => s.id === buscarEtapa(def, actualStageId)?.id);
  if (i < 0) return [];
  return linea.slice(i + 1).filter((s) => proponibles.has(s.id));
}

const TOOL_NAME = "decidir_etapa";

function herramienta(opciones: readonly PipelineStage[]): Anthropic.Messages.Tool {
  return {
    name: TOOL_NAME,
    description:
      "Dice si la reunión muestra que el proyecto ya está en una etapa posterior a la de HubSpot. Llámala una sola vez.",
    input_schema: {
      type: "object",
      properties: {
        mover: {
          type: "boolean",
          description: "true SOLO si la reunión muestra con hechos que el proyecto ya está en una etapa posterior.",
        },
        etapa: {
          type: "string",
          enum: opciones.map((o) => o.id),
          description: "El id de la etapa en la que ya está el proyecto. Solo si mover es true.",
        },
        cita: {
          type: "string",
          description: "Una frase de la reunión, copiada TAL CUAL (sin cambiar palabras), que lo muestra. Solo si mover es true.",
        },
        motivo: {
          type: "string",
          description: "Por qué, en una frase corta en español, para el CSE que va a aprobarlo. Solo si mover es true.",
        },
      },
      required: ["mover"],
    },
  };
}

function system(): string {
  return `Eres el analista de proyectos de Smarteam, una consultora que implementa HubSpot. Cada proyecto tiene una ETAPA en el tablero de HubSpot, y a veces nadie la actualiza. Lees UNA reunión del proyecto y dices si muestra que el proyecto YA está en una etapa posterior a la que dice HubSpot.

Reglas estrictas:
- Solo hechos: algo que ya se hizo o que está pasando («presentamos el diagnóstico», «ya estamos configurando los pipelines»). Un plan no cuenta («la próxima semana presentamos el diagnóstico» NO mueve a Diagnóstico).
- Elige la etapa MÁS AVANZADA que la reunión demuestra, entre las opciones. Si dudas entre dos, elige la menos avanzada.
- La cita es una frase copiada TAL CUAL de la reunión, sin cambiar ni una palabra. Si no puedes copiar una frase que lo muestre, no muevas.
- Ante la duda, no muevas: la etapa la ve todo el equipo en el tablero, y un movimiento de más confunde más que uno de menos.
- Lo normal es que una reunión NO mueva la etapa. Responde mover: false cuando la reunión trata de la misma etapa, de temas sueltos o no deja claro en qué punto está el proyecto.
- El motivo va en español neutro, con tuteo si le hablas a alguien, en una frase corta.`;
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
}

/** El pedido, armado sin tocar la base. `null` si no hay ninguna etapa a la que se pueda avanzar. */
export function pedidoDeEtapa(opts: {
  proyecto: string;
  cliente: string;
  def: PipelineDef;
  actualStageId: string | null | undefined;
  reunion: { titulo: string; fecha: string; texto: string };
  modelo?: string;
}): Anthropic.Messages.MessageCreateParamsNonStreaming | null {
  const opciones = etapasQueSePuedenDetectar(opts.def, opts.actualStageId);
  if (!opciones.length) return null;
  const actual = buscarEtapa(opts.def, opts.actualStageId);
  const describe = (s: PipelineStage) => `- ${s.id} · ${s.label}${QUE_SIGNIFICA[s.id] ? `: ${QUE_SIGNIFICA[s.id]}` : ""}`;
  const cuerpo =
    `Proyecto: «${opts.proyecto}» del cliente ${opts.cliente} · tablero «${opts.def.label}»\n` +
    `Etapa en HubSpot hoy: ${actual ? `${actual.label}${QUE_SIGNIFICA[actual.id] ? ` (${QUE_SIGNIFICA[actual.id]})` : ""}` : "sin etapa"}\n\n` +
    `=== ETAPAS A LAS QUE PODRÍA HABER AVANZADO (en orden) ===\n${opciones.map(describe).join("\n")}\n\n` +
    `=== REUNIÓN «${opts.reunion.titulo}» del ${fechaLarga(opts.reunion.fecha)} ===\n${opts.reunion.texto.slice(0, MAX_TEXTO_REUNION)}`;
  return {
    model: opts.modelo ?? MODELO_ETAPA_REUNION,
    max_tokens: 600,
    temperature: 0,
    system: system(),
    tools: [herramienta(opciones)],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Para comparar una cita con el texto: sin mayúsculas, sin tildes, comillas y espacios iguales. */
function normal(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[«»“”"'‘’`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ¿La cita aparece TAL CUAL en el texto de la reunión? (sin contar mayúsculas, tildes, comillas ni espacios). */
export function citaEstaEnElTexto(cita: string, texto: string): boolean {
  const c = normal(cita).replace(/[.…,;:]+$/, "");
  if (c.length < MIN_CITA) return false;
  return normal(texto).includes(c);
}

export interface EtapaDetectada {
  stageId: string;
  motivo: string;
  cita: string;
}

/**
 * Lo que devolvió el modelo, validado. `null` = no se sugiere nada: no movió, eligió una etapa que no
 * es de avance, la cita no está en la reunión o no explicó por qué.
 */
export function leerRespuestaDeEtapa(
  respuesta: Pick<Anthropic.Messages.Message, "content">,
  ctx: { def: PipelineDef; actualStageId: string | null | undefined; texto: string },
): EtapaDetectada | null {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!bloque || bloque.type !== "tool_use") return null;
  const input = bloque.input as { mover?: unknown; etapa?: unknown; cita?: unknown; motivo?: unknown };
  if (input.mover !== true) return null;
  if (typeof input.etapa !== "string" || typeof input.cita !== "string" || typeof input.motivo !== "string") return null;
  const etapa = etapasQueSePuedenDetectar(ctx.def, ctx.actualStageId).find((s) => s.id === input.etapa);
  if (!etapa) return null;
  const cita = input.cita.replace(/\s+/g, " ").trim();
  const motivo = input.motivo.replace(/\s+/g, " ").trim();
  if (!motivo || cita.length > MAX_CITA || !citaEstaEnElTexto(cita, ctx.texto)) return null;
  return {
    stageId: etapa.id,
    cita,
    motivo: motivo.length <= MAX_MOTIVO ? motivo : `${motivo.slice(0, MAX_MOTIVO - 1).trimEnd()}…`,
  };
}
