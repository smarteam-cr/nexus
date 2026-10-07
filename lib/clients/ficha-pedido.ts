/**
 * lib/clients/ficha-pedido.ts — el PEDIDO a Claude de la ficha del cliente: el prompt, la herramienta
 * y la lectura de la respuesta. Puro (sin base, sin red, sin `server-only`): lo usan
 * `ficha-propuesta.ts` y una prueba en seco con datos reales, que no puede cargar módulos de Next.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  CAMPOS_DE_LA_FICHA,
  CAMPOS_QUE_PROPONE_LA_IA,
  OPCIONES_DE_APERTURA,
  etiquetaDeApertura,
  valorVigente,
  type FichaGuardada,
} from "./ficha";

/** Por sesión: barato, corre solo con cada reunión. */
export const MODELO_FICHA_SESION = "claude-haiku-4-5-20251001";
/** Handoff y el botón: leen más y vale la pena el modelo mejor. */
export const MODELO_FICHA_AMPLIO = "claude-sonnet-4-6";

export interface Fuente {
  /** Id corto que el modelo cita: H1, S3, E1. */
  id: string;
  /** Cómo la ve el CSE: «Sesión «Revisión de pipeline» del 12 sept». */
  etiqueta: string;
  texto: string;
}

const TOOL: Anthropic.Messages.Tool = {
  name: "proponer_cambios",
  description:
    "Propone los campos de la ficha que las fuentes permiten completar o mejorar. Llámala una sola vez. " +
    "Si las fuentes no agregan nada nuevo, mándala con la lista vacía.",
  input_schema: {
    type: "object",
    properties: {
      campos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            clave: { type: "string", enum: CAMPOS_QUE_PROPONE_LA_IA.map((c) => c.clave) },
            valor: {
              type: "string",
              description:
                "El texto COMPLETO que debería quedar en el campo: lo que ya había más lo nuevo, integrado y sin repetir. Para aperturaAsesoria, solo el valor de la lista.",
            },
            fuentes: {
              type: "array",
              items: { type: "string" },
              description: "Los ids de las fuentes que sostienen lo NUEVO de este campo (H1, S2, E1…).",
            },
          },
          required: ["clave", "valor", "fuentes"],
        },
      },
    },
    required: ["campos"],
  },
};

function system(): string {
  // Los resultados no se proponen acá: salen de la lista medible de cada proyecto (ficha.ts › deLosResultados).
  const campos = CAMPOS_QUE_PROPONE_LA_IA.map(
    (c) => `- ${c.clave} («${c.etiqueta}»${c.alCliente ? "" : ", interno"}): ${c.ayuda}`,
  ).join("\n");
  const aperturas = OPCIONES_DE_APERTURA.map((o) => `${o.valor} (${o.etiqueta})`).join(", ");
  return `Eres el analista de cuentas de Smarteam, una consultora que implementa HubSpot. Mantienes la FICHA de un cliente: lo que sabemos de su negocio, lo que busca y quién es quién. La ficha la leen todos los agentes de Smarteam y un CSE la revisa antes de guardarla.

Tu tarea: leer las fuentes nuevas y proponer SOLO los campos donde aportan algo que la ficha actual no tiene, o que la corrigen.

Campos de la ficha:
${campos}

Reglas estrictas:
- Solo lo que las fuentes dicen de forma explícita. No deduzcas, no completes, no inventes cifras ni nombres. Ante la duda, no lo propongas.
- Devuelve el texto COMPLETO del campo: conserva lo que ya había, suma lo nuevo y quita repeticiones. Si una fuente contradice lo que había, reemplázalo por lo más reciente.
- Formato: viñetas con «- », una idea por viñeta, frases cortas. **Negrita** solo para cifras o nombres clave. Sin títulos.
- Datos duros tal cual aparecen (números, porcentajes, plazos, herramientas). Fechas absolutas, nunca «la semana pasada».
- stakeholders: SOLO personas del CLIENTE. Nunca incluyas al equipo de Smarteam (consultores, CSE, ventas, desarrolladores, ni a nadie con correo de Smarteam), aunque participen en todas las reuniones. Una viñeta por persona con el formato «Nombre — cargo — papel en el proyecto — postura». Si falta un dato, omítelo; no lo adivines.
- aperturaAsesoria: solo uno de ${aperturas}, y solo si hay evidencia clara; la evidencia va en porQueApertura.
- motivacionCompra: por qué nos eligieron y por qué ahora, si la fuente lo dice.
- La ficha es ESTRATÉGICA, no una minuta. No anotes pedidos operativos de una reunión (un reporte, un filtro, una vista, un error puntual, una tarea de configuración): eso vive en la minuta y el cronograma. Solo entra lo que cambia cómo entendemos al cliente: su negocio, sus metas, sus dolores de fondo, su gente, sus herramientas.
- La ficha describe AL CLIENTE: su negocio, su gente, lo que busca. Lo que hace o piensa Smarteam solo entra si dice algo del cliente (p. ej. en porQueApertura).
- Español neutro, en tercera persona sobre el cliente.
- Si nada es nuevo, devuelve la lista vacía. Es la respuesta correcta la mayoría de las veces con una sola reunión.`;
}

function fichaActualComoTexto(ficha: FichaGuardada): string {
  return CAMPOS_DE_LA_FICHA.map((c) => {
    const v = valorVigente(ficha, c.clave).trim();
    const mostrado = c.destino.tipo === "lista" ? etiquetaDeApertura(v) : v;
    return `### ${c.clave}\n${mostrado || "(vacío)"}`;
  }).join("\n\n");
}

/** El pedido a Claude, armado sin tocar la base: lo usa el núcleo y la prueba en seco con datos reales. */
export function pedidoDeFicha(opts: {
  cliente: { name: string; industry: string | null };
  ficha: FichaGuardada;
  fuentes: readonly Fuente[];
  modelo: string;
  /** Los nombres del equipo de Smarteam (activos y de baja): nunca son stakeholders del cliente. */
  equipoSmarteam?: readonly string[];
}): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const { cliente, ficha, fuentes } = opts;
  const equipo = opts.equipoSmarteam?.length
    ? `=== EQUIPO DE SMARTEAM (NO son stakeholders del cliente) ===\n${opts.equipoSmarteam.join(", ")}\n\n`
    : "";
  const cuerpo =
    `Cliente: ${cliente.name}${cliente.industry ? ` · Industria: ${cliente.industry}` : ""}\n\n` +
    equipo +
    `=== FICHA ACTUAL ===\n${fichaActualComoTexto(ficha)}\n\n` +
    fuentes.map((f) => `=== FUENTE ${f.id}: ${f.etiqueta} ===\n${f.texto}`).join("\n\n");
  return {
    model: opts.modelo,
    max_tokens: 6000,
    system: system(),
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Lo que devolvió el modelo, con los ids de fuente traducidos a etiquetas que entiende el CSE. */
export function leerRespuesta(
  respuesta: Anthropic.Messages.Message,
  fuentes: readonly Fuente[],
  equipoSmarteam: readonly string[] = [],
): Array<{ clave: string; valor: string; fuentes: string[] }> {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  const crudos = bloque && bloque.type === "tool_use" ? (bloque.input as { campos?: unknown }).campos : null;
  if (!Array.isArray(crudos)) return [];
  const porId = new Map(fuentes.map((f) => [f.id, f.etiqueta]));
  return crudos
    .filter((c): c is { clave: string; valor: string; fuentes?: unknown } => !!c && typeof c.clave === "string" && typeof c.valor === "string")
    .map((c) => {
      const ids = Array.isArray(c.fuentes) ? c.fuentes.filter((x): x is string => typeof x === "string") : [];
      // Un id inventado no se muestra; si el modelo no citó ninguno válido, se atribuye a todas.
      const etiquetas = ids.map((id) => porId.get(id)).filter((x): x is string => !!x);
      const valor = c.clave === "stakeholders" ? sinGenteDeSmarteam(c.valor, equipoSmarteam) : c.valor;
      return { clave: c.clave, valor, fuentes: etiquetas.length ? etiquetas : fuentes.map((f) => f.etiqueta) };
    });
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-zñ ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Saca de la lista de stakeholders las viñetas que nombran a alguien del equipo de Smarteam.
 *
 * El prompt ya lo pide, y no alcanza: medido con Wherex (2026-09-27), el modelo metió a una
 * consultora de Smarteam (dada de baja) como «enlace operativo» del cliente. Quien está en todas
 * las reuniones parece del cliente. La lista del equipo es un dato: se filtra por código.
 * Una viñeta cuenta si trae el nombre y el apellido de alguien del equipo (sin tildes).
 */
export function sinGenteDeSmarteam(valor: string, equipo: readonly string[]): string {
  const personas = equipo
    .map((n) => normalizar(n).split(" ").filter(Boolean))
    .filter((t) => t.length >= 2)
    .map((t) => [t[0], t[t.length - 1]] as const);
  if (!personas.length) return valor;
  return valor
    .split("\n")
    .filter((linea) => {
      if (!/^\s*[-*•]\s/.test(linea)) return true;
      const palabras = new Set(normalizar(linea).split(" "));
      return !personas.some(([nombre, apellido]) => palabras.has(nombre) && palabras.has(apellido));
    })
    .join("\n");
}
