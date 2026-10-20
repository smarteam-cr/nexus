/**
 * lib/sessions/lectura-salida.ts — la SALIDA ESTÁNDAR de la lectura de seguimiento de una reunión (memoria de la cuenta,
 * etapa 2). PURO: la herramienta que se le pide al modelo, la lectura de lo que devolvió y la verificación de las citas.
 *
 * ── POR QUÉ UNA HERRAMIENTA Y NO UN JSON EN EL TEXTO ─────────────────────────────────────────
 * El post-proceso leía la respuesta con una regex (`rawText.match(/\{[\s\S]*\}/)`): un texto antes o después del JSON,
 * una llave de más, y la lectura entera se perdía. Con `tool_choice` forzado, la respuesta ES el objeto. El prompt que
 * vive en la base (agent-post-session) sigue pidiendo su JSON: `adendaDeLaHerramienta` le dice que la herramienta lo
 * reemplaza, sin volver a sembrarlo (KNOWN-ERRORS: sembrar puede borrar una edición humana).
 *
 * ── POR QUÉ SE VERIFICAN LAS CITAS ───────────────────────────────────────────────────────────
 * Una cita inventada en una tarea de seguimiento le haría reclamar al cliente algo que no prometió. Cada compromiso y
 * cada pedido trae la frase que lo respalda; si no aparece TAL CUAL en lo que se le mandó al modelo (la transcripción
 * cortada y el resumen de Gemini), se descarta. No se guarda «sin cita». Es la regla de la fecha del diagnóstico y de
 * los límites del cronograma (`citaEstaEnLasFuentes`, lib/timeline/limites.ts), generalizada.
 *
 * Se dejó de pedir `stageProgress`: nadie lo leía (la etapa la propone lib/projects/etapa-desde-reunion*).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { leerCompromisos, leerPedidosFueraDeAlcance, type CompromisoDetectado, type PedidoDetectado } from "./compromisos-y-alcance";

export const HERRAMIENTA_DE_LA_LECTURA = "registrar_lectura";

/** Cuánto de la transcripción se le manda al modelo (protección contra transcripciones gigantes). */
export const TOPE_DE_LA_TRANSCRIPCION = 60_000;

/** Cuántos compromisos se aceptan por reunión: cada uno puede ser una propuesta para alguien. */
export const MAX_COMPROMISOS = 8;

export interface PedidoDeLaHerramienta {
  /** Solo en una reunión de un CLIENTE con proyecto principal: hay algo vendido contra qué comparar. */
  pideFueraDeAlcance: boolean;
  /** Solo si el proyecto tiene un diagnóstico sin presentar (lib/canvas/presentacion-del-diagnostico.ts). */
  pidePresentacion: boolean;
  /** Los correos del equipo activo: `ownerEmail` solo puede ser uno de estos. */
  emailsDelEquipo: readonly string[];
}

const TEXTO = { type: "string" } as const;
const conTexto = (description: string) => ({ type: "string", description }) as const;

/**
 * El esquema de los COMPROMISOS, el mismo para una reunión y para un correo (iniciativa B: lo que Smarteam promete por
 * correo va por la misma salida estándar, lib/tareas/seguimiento.ts). Solo cambia de dónde sale la fecha y la cita.
 */
export function esquemaDeLosCompromisos(emailsDelEquipo: readonly string[], fuente: "reunion" | "correo" = "reunion"): Record<string, unknown> {
  const emails = [...new Set(emailsDelEquipo.map((e) => e.toLowerCase()))];
  const ownerEmail = emails.length
    ? { type: ["string", "null"], enum: [...emails, null], description: "Solo si quien es SMARTEAM: el correo de quien se comprometió, de la lista del equipo interno. Si no estás seguro, null." }
    : { type: "null" };
  const de = fuente === "correo" ? "del correo" : "de la reunión";
  const textoFuente = fuente === "correo" ? "del texto del correo" : "de la transcripción o del resumen de Gemini";
  return {
    type: "array",
    description: `Cada compromiso EXPLÍCITO ${de}, de cualquiera de los dos lados, con fecha o sin ella. Pocos y esenciales: como mucho ${MAX_COMPROMISOS}, lo que importa primero; la lista vacía es correcta.`,
    items: {
      type: "object",
      properties: {
        quien: {
          type: "string",
          enum: ["CLIENTE", "SMARTEAM"],
          description: "Quién tiene que HACERLO, no quién lo dijo. «Quedamos atentos a que nos envíes el reporte», dicho por el cliente, es SMARTEAM.",
        },
        responsable: conTexto("El nombre de la persona que se comprometió, si se dijo."),
        ownerEmail,
        que: conTexto("Qué se comprometió, en una frase concreta."),
        titulo: {
          type: ["string", "null"],
          description: "Solo si quien es SMARTEAM: el título de la tarea, en infinitivo y tuteo, «Verbo + qué + a quién o la cuenta», como mucho 80 caracteres: «Enviar el reporte a CEMACO», «Preparar la propuesta de renovación para kölbi». Sin fechas ni explicaciones. Si quien es CLIENTE, null.",
        },
        esencial: {
          type: "boolean",
          description: "true solo si es un entregable, un envío, una fecha comprometida con el cliente o algo que el cliente espera de Smarteam. false si es menor: coordinación interna, estar disponible, un ajuste chico de configuración, algo que se resolvió en la misma reunión o que ya se había acordado antes.",
        },
        tituloDeSeguimiento: {
          type: ["string", "null"],
          description: "Solo si quien es CLIENTE: lo que tiene que hacer el CSE para que se cumpla, en imperativo y en tuteo, nombrando a la persona («Recordarle a Ana que envíe la base de datos»). Si quien es SMARTEAM, null.",
        },
        fecha: { type: ["string", "null"], description: `AAAA-MM-DD calculada con el calendario desde la fecha ${de}; null si no se dijo.` },
        tipo: { type: "string", enum: ["PLAN", "INSUMO", "ACCION"] },
        frenaElPlan: { type: "boolean", description: "true solo si, sin esto, el proyecto no puede avanzar." },
        cita: conTexto(`La frase que lo respalda, copiada TEXTUAL ${textoFuente}: 12 caracteres o más, sin puntos suspensivos y sin cambiarle una palabra.`),
      },
      required: ["quien", "que", "tipo", "frenaElPlan", "esencial", "cita"],
    },
  };
}

/** La herramienta, con solo lo que se pide en esta reunión (sin fuera de alcance en un prospecto, por ejemplo). */
export function herramientaDeLaLectura(p: PedidoDeLaHerramienta): Anthropic.Messages.Tool {
  const propiedades: Record<string, unknown> = {
    minuta: {
      type: "object",
      properties: {
        summary: conTexto("Resumen ejecutivo en 2 o 3 frases: qué se logró y dónde quedó el proyecto."),
        agreements: { type: "array", items: { type: "object", properties: { text: TEXTO }, required: ["text"] } },
        decisions: { type: "array", items: { type: "object", properties: { text: TEXTO, rationale: TEXTO }, required: ["text"] } },
        risks: {
          type: "array",
          items: { type: "object", properties: { text: TEXTO, severity: { type: "string", enum: ["low", "med", "high"] } }, required: ["text"] },
        },
        topics: { type: "array", items: TEXTO },
      },
      required: ["summary"],
    },
    compromisos: esquemaDeLosCompromisos(p.emailsDelEquipo),
    detectedTopics: { type: "array", items: TEXTO, description: "De 1 a 5 temas del vocabulario del prompt, en minúsculas y con guiones." },
  };
  if (p.pideFueraDeAlcance) {
    propiedades.fueraDeAlcance = {
      type: "array",
      description: "Cada pedido del cliente que NO está en lo que se vendió.",
      items: {
        type: "object",
        properties: {
          huella: conTexto("Identificador estable del pedido, en minúsculas y con guiones. El mismo pedido en otra reunión lleva la MISMA huella."),
          pedido: conTexto("Qué pidió, en una frase."),
          quienLoPidio: conTexto("Nombre y rol, si se dijo."),
          monto: { type: ["string", "null"], description: "El monto o las horas, si se dijeron." },
          cita: conTexto("La frase que lo respalda, copiada TEXTUAL, con la misma regla que la de un compromiso."),
        },
        required: ["huella", "pedido", "cita"],
      },
    };
  }
  if (p.pidePresentacion) {
    propiedades.presentacionDiagnostico = {
      type: ["object", "null"],
      description: "Solo si en la reunión se dijo cuándo se presenta el diagnóstico.",
      properties: { fecha: conTexto("AAAA-MM-DD"), cita: conTexto("La frase TEXTUAL de la reunión que lo dice.") },
    };
  }
  return {
    name: HERRAMIENTA_DE_LA_LECTURA,
    description: "Registra la lectura de la reunión: la minuta, los compromisos de los dos lados con su cita textual y los temas.",
    input_schema: { type: "object", properties: propiedades, required: ["minuta", "compromisos"] } as Anthropic.Messages.Tool.InputSchema,
  };
}

/**
 * Lo que se suma al prompt guardado en la base: la herramienta reemplaza su formato JSON. Vive en código a propósito:
 * funciona sin volver a sembrar el agente.
 */
export const ADENDA_DE_LA_HERRAMIENTA = `

CÓMO DEVUELVES LA LECTURA (esto reemplaza el formato JSON de arriba):
- No escribas el JSON en el texto: llama UNA vez a la herramienta ${HERRAMIENTA_DE_LA_LECTURA}, con todo junto.
- Lo que arriba se llama "minute" va en "minuta", con los mismos campos.
- Lo que arriba se llama "actionItems" va en "compromisos", junto con los compromisos que tienen fecha. Un compromiso sigue siendo EXPLÍCITO: alguien dijo QUÉ va a hacer y QUIÉN lo hace. La fecha puede faltar: si no se dijo, va null. Como mucho ${MAX_COMPROMISOS}, y la lista vacía es un resultado correcto.
- No hay "stageProgress": no lo devuelvas.
- POCOS Y ESENCIALES. Devuelve lo que alguien de verdad tiene que hacer después de la reunión: un entregable, un envío, una fecha comprometida, una decisión que se espera, lo que el cliente espera de Smarteam. No devuelvas lo que se resolvió en la misma reunión, la coordinación interna de Smarteam («reunirse internamente», «estar disponible», «invitar a alguien a la próxima sesión»), los pasos chicos de configuración que son parte de algo más grande (devuelve el entregable, no cada paso) ni lo que ya se había acordado en una reunión anterior. Si dudas, marca "esencial": false: lo menor no se propone.
- "quien": quién tiene que HACERLO, no quién habló. CLIENTE si lo tiene que hacer alguien del cliente; SMARTEAM si lo tiene que hacer alguien del equipo interno. Lo que el cliente espera de Smarteam es de SMARTEAM: si el cliente dice «quedamos atentos a que nos envíes el reporte», es un compromiso de SMARTEAM (título «Enviar el reporte a CEMACO»), no un seguimiento del cliente.
- "titulo": solo si quien es SMARTEAM. En infinitivo y en tuteo, «Verbo + qué + a quién o la cuenta», como mucho 80 caracteres: «Enviar el reporte a CEMACO», «Configurar los informes de activaciones para Honda». Sin la fecha (va en "fecha"), sin el nombre de quien lo hace y sin explicar por qué. Si quien es CLIENTE, null.
- "esencial": true para un entregable, un envío, una fecha comprometida o lo que el cliente espera de Smarteam; false para lo menor.
- "ownerEmail": solo si quien es SMARTEAM, el correo de quien se comprometió, de la lista del equipo interno. Si no estás seguro, null.
- "tituloDeSeguimiento": solo si quien es CLIENTE. Es lo que tiene que hacer el CSE para que se cumpla, en imperativo y en tuteo, nombrando a la persona: «Recordarle a Ana que envíe la base de datos». Si quien es SMARTEAM, null.
- "frenaElPlan": true solo si, sin eso, el proyecto no puede avanzar (un insumo del que depende una entrega, una aprobación). Si no, false.
- "fecha": AAAA-MM-DD calculada con el calendario. Si la reunión fue el jueves 1 de octubre y dicen «el miércoles», es el miércoles 7 de octubre.
- "tipo": PLAN = mueve o fija una fecha del proyecto; INSUMO = algo que el cliente tiene que entregar; ACCION = una tarea de cualquiera de los dos.
- "cita": la frase que lo respalda, copiada TEXTUAL de la transcripción o del resumen de Gemini, de 12 caracteres o más, sin cortarla con puntos suspensivos y sin cambiarle una palabra. Lo que tenga una cita que no aparece tal cual en lo que recibiste se descarta.
- Lo que ya es una tarea (la lista «YA SON TAREAS» del mensaje) no lo repitas como compromiso.`;

/** La parte de los pedidos fuera de alcance: solo en una reunión de un cliente con proyecto principal. */
export const ADENDA_DEL_FUERA_DE_ALCANCE = `
- "fueraDeAlcance": cada PEDIDO del cliente que NO está en lo que se vendió (tienes el alcance contratado en el mensaje). Señales: «eso no estaba incluido», una cotización, una propuesta aparte, la bolsa de horas, un monto nuevo, una integración o un módulo que no figura en lo vendido. Si el mismo pedido ya se habló antes, usa la MISMA huella. Una decisión de no hacerlo no es un atraso. Lleva su cita, con la misma regla. No inventes: solo lo que la reunión respalde.`;

/** Sin proyecto (o en un prospecto) no se piden: no hay nada vendido contra qué comparar. */
export const ADENDA_SIN_FUERA_DE_ALCANCE = `
- En esta reunión no se piden pedidos fuera de alcance: no hay nada vendido contra qué comparar. No los devuelvas.`;

export function adendaDeLaHerramienta(p: { pideFueraDeAlcance: boolean }): string {
  return ADENDA_DE_LA_HERRAMIENTA + (p.pideFueraDeAlcance ? ADENDA_DEL_FUERA_DE_ALCANCE : ADENDA_SIN_FUERA_DE_ALCANCE);
}

/** El texto contra el que se verifican las citas: EXACTAMENTE lo que se le mandó al modelo de la reunión. */
export function fuenteDeLasCitas(transcript: string | null | undefined, overview: string | null | undefined): string {
  return `${(transcript ?? "").slice(0, TOPE_DE_LA_TRANSCRIPCION)}\n${overview ?? ""}`;
}

/* ── Leer lo que devolvió ──────────────────────────────────────────────────────────── */

export interface MinutaLeida {
  summary: string;
  agreements: { text: string }[];
  decisions: { text: string; rationale?: string }[];
  risks: { text: string; severity: "low" | "med" | "high" }[];
  topics: string[];
}

export interface SalidaDeLaLectura {
  minuta: MinutaLeida;
  compromisos: CompromisoDetectado[];
  fueraDeAlcance: PedidoDetectado[];
  detectedTopics: string[];
  /** Crudo: lo lee `leerPresentacionDetectada` (lib/canvas/presentacion-del-diagnostico.ts), que valida la fecha. */
  presentacionDiagnostico: unknown;
}

export const SIN_RESUMEN = "(Sin resumen generado)";

const cadena = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function leerMinuta(raw: unknown): MinutaLeida {
  const m = objeto(raw);
  const conTextoDe = (x: unknown) => cadena(objeto(x).text, 1_000);
  return {
    summary: cadena(m.summary, 4_000) || SIN_RESUMEN,
    agreements: lista(m.agreements).map((x) => ({ text: conTextoDe(x) })).filter((x) => x.text).slice(0, 30),
    decisions: lista(m.decisions)
      .map((x) => {
        const rationale = cadena(objeto(x).rationale, 1_000);
        return { text: conTextoDe(x), ...(rationale ? { rationale } : {}) };
      })
      .filter((x) => x.text)
      .slice(0, 30),
    risks: lista(m.risks)
      .map((x): MinutaLeida["risks"][number] => {
        const s = objeto(x).severity;
        return { text: conTextoDe(x), severity: s === "low" || s === "high" ? s : "med" };
      })
      .filter((x) => x.text)
      .slice(0, 30),
    topics: lista(m.topics).map((t) => cadena(t, 200)).filter(Boolean).slice(0, 20),
  };
}

/**
 * Lee el bloque de la herramienta. Tolera un input parcial (lo que falta queda vacío); null solo si no llamó a la
 * herramienta. ⚠ No mira si la respuesta se cortó: eso lo decide quien llama (con `stop_reason`), porque reintenta.
 */
export function leerSalidaDeLaLectura(respuesta: Pick<Anthropic.Messages.Message, "content">): SalidaDeLaLectura | null {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_LECTURA);
  if (!bloque || bloque.type !== "tool_use") return null;
  const input = objeto(bloque.input);
  const compromisos = leerCompromisos(input.compromisos)
    .slice(0, MAX_COMPROMISOS)
    // Un título de seguimiento con voseo no se usa: se arma el de respaldo con el código (lib/tareas/seguimiento.ts).
    .map((c) => (c.tituloDeSeguimiento && voseoEnProsa(c.tituloDeSeguimiento).length ? { ...c, tituloDeSeguimiento: null } : c));
  return {
    minuta: leerMinuta(input.minuta),
    compromisos,
    fueraDeAlcance: leerPedidosFueraDeAlcance(input.fueraDeAlcance),
    detectedTopics: lista(input.detectedTopics).map((t) => cadena(t, 50).toLowerCase()).filter(Boolean).slice(0, 10),
    presentacionDiagnostico: input.presentacionDiagnostico ?? null,
  };
}

/* ── Verificar las citas ───────────────────────────────────────────────────────────── */

export interface CitasVerificadas {
  validos: SalidaDeLaLectura;
  descartadosPorCita: { compromisos: number; pedidos: number };
}

/**
 * Descarta los compromisos y los pedidos cuya cita no está TAL CUAL en `fuenteEnviada` (la de `fuenteDeLasCitas`):
 * normalizada con la misma regla que el resto de Nexus (sin tildes, comillas ni espacios dobles) y de 12 caracteres
 * útiles o más. Una cita que cae después del tope de la transcripción no estaba en lo que se mandó: se descarta.
 */
export function verificarCitas(salida: SalidaDeLaLectura, fuenteEnviada: string): CitasVerificadas {
  const fuente = normalizarParaCita(fuenteEnviada);
  const compromisos = salida.compromisos.filter((c) => citaEstaEnLasFuentes(c.cita, fuente));
  const fueraDeAlcance = salida.fueraDeAlcance.filter((p) => citaEstaEnLasFuentes(p.cita, fuente));
  return {
    validos: { ...salida, compromisos, fueraDeAlcance },
    descartadosPorCita: { compromisos: salida.compromisos.length - compromisos.length, pedidos: salida.fueraDeAlcance.length - fueraDeAlcance.length },
  };
}
