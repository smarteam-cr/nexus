/**
 * lib/tareas/ia/pedido.ts — el pedido a Haiku para leer una reunión (nivel 1, docs/tareas-plan.md §7.2). PURO.
 *
 * Una sola llamada por reunión, con herramienta forzada `leer_reunion` y ENUMS armados para ese pedido: el modelo
 * elige de listas cerradas (líneas L#, personas M#, candidatas T#, proyectos R#, clientes C#). No escribe texto libre
 * salvo el nombre de un grupo. La cita es el id de una línea: el texto literal lo pone el código. Las fechas también.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CLAVES_DE_VENCIMIENTO } from "../fechas";
import { MAX_TOKENS_DE_LA_LECTURA } from "../reglas";

export const MODELO_DE_LA_LECTURA = "claude-haiku-4-5";
export const HERRAMIENTA = "leer_reunion";

export interface LineaParaElModelo {
  ref: string; // L1
  texto: string;
  /** La persona del corchete ya resuelta (M#), si es segura. */
  dueno: string | null;
  /** Las candidatas de esa línea (T#). */
  candidatas: string[];
  /** Los clientes candidatos de esa línea (C#). */
  clientes: string[];
}

export interface PedidoDeLectura {
  titulo: string;
  fecha: string;
  rol: "planning" | "cierre" | "ambos";
  lineas: LineaParaElModelo[];
  /** «M1 Alejandra Ortega (Marketing)». */
  personas: { ref: string; nombre: string; equipo: string }[];
  /** «T7 «título» · M2 · pasó 1». */
  candidatas: { ref: string; titulo: string; dueno: string | null; pases: number; estado: string }[];
  /** «R3 «Campaña de SAP»» (activos, propuestos y descartados recientes). */
  proyectos: { ref: string; nombre: string; estado: string }[];
  clientes: { ref: string; nombre: string }[];
  /** Si se buscan grupos (proyectos): el resumen de la reunión. */
  resumen: string | null;
  buscarGrupos: boolean;
  /** Solo en una reunión de cierre: las tareas abiertas de la semana que cierra (T#) y los párrafos de Detalles (D#). */
  tareasDeLaSemana: { ref: string; titulo: string; dueno: string | null }[];
  detalles: { ref: string; texto: string }[];
}

const SYSTEM = `Eres el asistente de tareas internas de Smarteam. Lees las notas de una reunión interna del equipo y ayudas a ordenar las tareas que salieron. Una persona revisa todo lo que propones: nada entra solo.

Reglas:
- Usa SOLO los ids que te dan (L#, M#, T#, R#, C#, D#). Nunca inventes uno.
- El dueño de una línea es el que dice el corchete. Un nombre dentro del detalle («coordinar con Alexander», «consultar con Marco», «explicar a…») es una mención, no el dueño. Si la línea ya trae su dueño (M#), devuélvelo igual.
- «misma»: la tarea candidata (T#) que es ESA MISMA tarea dicha con otras palabras (Gemini reescribe los títulos cada semana). Solo si es claramente la misma; si dudas, null. Nunca una tarea de otro cliente.
- «proyecto»: un proyecto existente (R#) al que la línea claramente pertenece; si no, null.
- «grupo»: si 3 o más líneas forman algo nuevo y concreto (una campaña, un evento, un lanzamiento), dales el mismo G# y nombra el grupo en «grupos» (máximo 40 caracteres, en español, con tuteo si hace falta, sin la palabra «proyecto»). Si el grupo es un proyecto que ya existe, pon «mismoQue». Si no hay un grupo claro, no inventes uno.
- «cliente»: el cliente (C#) para quien es esa línea, solo de los que te dan para esa línea; si no se sabe, null.
- «vence»: solo si la línea dice cuándo (hoy, mañana, un día de la semana, esta semana, la próxima semana); si no, null.
- «resultados» (solo en un cierre): para cada tarea de la semana (T#) que la reunión dice que se terminó o que no se terminó, el resultado y el id de la línea o del párrafo (L# o D#) que lo dice. Si no se habló de una tarea, no la pongas.`;

const enumONulo = (valores: string[]) => (valores.length ? { type: ["string", "null"], enum: [...valores, null] } : { type: "null" });

export function maxTokensDeLaLectura(lineas: number, tareasDeLaSemana: number): number {
  return Math.min(MAX_TOKENS_DE_LA_LECTURA, 200 + 70 * lineas + 25 * tareasDeLaSemana);
}

export function pedidoDeLectura(p: PedidoDeLectura): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const refsL = p.lineas.map((l) => l.ref);
  const refsM = p.personas.map((m) => m.ref);
  const refsT = [...new Set([...p.candidatas.map((t) => t.ref), ...p.tareasDeLaSemana.map((t) => t.ref)])];
  const refsR = p.proyectos.map((r) => r.ref);
  const refsC = p.clientes.map((c) => c.ref);
  const refsFuente = [...refsL, ...p.detalles.map((d) => d.ref)];

  const partes: string[] = [];
  partes.push(`Reunión: «${p.titulo}» · ${p.fecha} · ${p.rol === "planning" ? "planificación" : p.rol === "cierre" ? "cierre de semana" : "cierre y planificación"}`);
  partes.push(`\nPERSONAS\n${p.personas.map((m) => `${m.ref} ${m.nombre} (${m.equipo})`).join("\n") || "(ninguna)"}`);
  partes.push(
    `\nLÍNEAS DE «PRÓXIMOS PASOS»\n${p.lineas
      .map((l) => `${l.ref} ${l.texto}${l.dueno ? ` [dueño: ${l.dueno}]` : ""}${l.candidatas.length ? ` [candidatas: ${l.candidatas.join(", ")}]` : ""}${l.clientes.length ? ` [clientes: ${l.clientes.join(", ")}]` : ""}`)
      .join("\n")}`,
  );
  if (p.candidatas.length) {
    partes.push(`\nTAREAS QUE YA EXISTEN (candidatas)\n${p.candidatas.map((t) => `${t.ref} «${t.titulo}»${t.dueno ? ` · ${t.dueno}` : ""} · ${t.estado}${t.pases ? ` · pasó ${t.pases}` : ""}`).join("\n")}`);
  }
  if (p.proyectos.length) partes.push(`\nPROYECTOS\n${p.proyectos.map((r) => `${r.ref} «${r.nombre}» (${r.estado})`).join("\n")}`);
  if (p.clientes.length) partes.push(`\nCLIENTES\n${p.clientes.map((c) => `${c.ref} ${c.nombre}`).join("\n")}`);
  if (p.buscarGrupos && p.resumen) partes.push(`\nRESUMEN DE LA REUNIÓN\n${p.resumen.slice(0, 2_000)}`);
  if (p.tareasDeLaSemana.length) {
    partes.push(`\nTAREAS DE LA SEMANA QUE CIERRA\n${p.tareasDeLaSemana.map((t) => `${t.ref} «${t.titulo}»${t.dueno ? ` · ${t.dueno}` : ""}`).join("\n")}`);
    if (p.detalles.length) partes.push(`\nDETALLES DE LA REUNIÓN\n${p.detalles.map((d) => `${d.ref} ${d.texto}`).join("\n").slice(0, 3_000)}`);
  }

  const herramienta: Anthropic.Messages.Tool = {
    name: HERRAMIENTA,
    description: "Devuelve, para cada línea, su dueño, si es una tarea que ya existe, su proyecto, su grupo, su cliente y cuándo vence; los grupos nuevos; y en un cierre, qué tareas de la semana se terminaron.",
    input_schema: {
      type: "object",
      properties: {
        lineas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              L: { type: "string", enum: refsL },
              dueno: enumONulo(refsM),
              misma: enumONulo(refsT),
              proyecto: enumONulo(refsR),
              grupo: { type: ["string", "null"] },
              cliente: enumONulo(refsC),
              vence: enumONulo([...CLAVES_DE_VENCIMIENTO]),
            },
            required: ["L"],
          },
        },
        grupos: {
          type: "array",
          items: {
            type: "object",
            properties: { G: { type: "string" }, nombre: { type: "string" }, mismoQue: enumONulo(refsR) },
            required: ["G", "nombre"],
          },
        },
        resultados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              T: { type: "string", enum: refsT.length ? refsT : ["T0"] },
              resultado: { type: "string", enum: ["hecha", "no_hecha"] },
              fuente: { type: "string", enum: refsFuente.length ? refsFuente : ["L0"] },
            },
            required: ["T", "resultado", "fuente"],
          },
        },
      },
      required: ["lineas"],
    } as Anthropic.Messages.Tool.InputSchema,
  };

  return {
    model: MODELO_DE_LA_LECTURA,
    max_tokens: maxTokensDeLaLectura(p.lineas.length, p.tareasDeLaSemana.length),
    temperature: 0,
    system: SYSTEM,
    tools: [herramienta],
    tool_choice: { type: "tool", name: HERRAMIENTA },
    messages: [{ role: "user", content: partes.join("\n") }],
  };
}
