/**
 * lib/nexus-chat/alcance.ts — ⛔ EL CHAT DE UNA CUENTA NO TOCA OTRA (invariante 1). PURO.
 *
 * El chat de Nexus conversa sobre UNA empresa. Sus herramientas son las operaciones de la capa (lib/operaciones) más las
 * lecturas propias del chat (./lecturas-server.ts), y varias reciben un `clientId`. El modelo NUNCA lo elige:
 *
 *   · al modelo le llega la herramienta SIN el campo `clientId` (`herramientaDeLaCuenta`);
 *   · el servidor se lo pone, siempre el de la cuenta del hilo (`acotarALaCuenta`), aunque el modelo haya mandado otro;
 *   · lo que no lleva `clientId` se verifica contra la cuenta: una tarea por su número tiene que ser de esta cuenta, y el
 *     negocio o el proyecto del siguiente paso, también (`verificarLaCuenta`, con lo que lee el servidor por parámetro).
 *
 * ⛔ Cada operación del registro tiene que estar en `COMO_SE_ACOTA`. Una operación nueva que nadie declaró acá NO llega al
 * chat (`seOfrece`): sin saber cómo se acota a la cuenta, se podría usar sobre otra empresa. El test de al lado lo
 * vigila contra el registro de verdad.
 */

/**
 * Cómo se acota cada operación a la cuenta del hilo:
 *   · `cuenta`: lleva `clientId`, y el servidor pone el de la cuenta;
 *   · `tarea`: nombra una tarea por su número, y esa tarea tiene que ser de esta cuenta;
 *   · `objeto`: nombra una empresa, un negocio o un proyecto, y tiene que ser de esta cuenta.
 */
export type ComoSeAcota = "cuenta" | "tarea" | "objeto";

export const COMO_SE_ACOTA: Readonly<Record<string, ComoSeAcota>> = {
  // Las del registro (lib/operaciones/registro-server.ts).
  "cuenta.tareas": "cuenta",
  "cuenta.notas": "cuenta",
  "cuenta.siguientes-pasos": "cuenta",
  "tarea.crear": "cuenta",
  "tarea.cambiar-estado": "tarea",
  "tarea.mover-semana": "tarea",
  "nota.crear": "cuenta",
  "siguiente-paso.fijar": "objeto",
  // Lleva `clientId` y el proyecto se verifica contra él al preparar y al aplicar (lib/operaciones/documentos-server.ts).
  "documento.generar": "cuenta",
  // La guía de la próxima sesión: llevan `clientId` y la exploración se verifica contra él (lib/operaciones/guia-server.ts).
  "guia.leer": "cuenta",
  "guia.pregunta.agregar": "cuenta",
  "guia.pregunta.cambiar": "cuenta",
  "guia.pregunta.quitar": "cuenta",
  "guia.repregunta.cambiar": "cuenta",
  // Las lecturas propias del chat (./lecturas-server.ts).
  "cuenta.memoria": "cuenta",
  "proyecto.memoria": "cuenta",
  "reuniones.recientes": "cuenta",
  "reuniones.buscar": "cuenta",
  "reunion.leer": "cuenta",
  "cuenta.negocios": "cuenta",
  "cuenta.personas": "cuenta",
  "comunicaciones.recientes": "cuenta",
};

/** ¿Llega esta operación al chat? Solo si alguien declaró cómo se acota a la cuenta. */
export function seOfrece(nombre: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMO_SE_ACOTA, nombre);
}

interface HerramientaConEsquema {
  name: string;
  description: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
}

/** La herramienta sin el campo `clientId`: el modelo no puede ni nombrar otra empresa. */
export function herramientaDeLaCuenta<H extends HerramientaConEsquema>(h: H): H {
  const props = { ...(h.input_schema.properties ?? {}) };
  if (!("clientId" in props)) return h;
  delete props.clientId;
  const required = (h.input_schema.required ?? []).filter((r) => r !== "clientId");
  const schema = { ...h.input_schema, properties: props };
  if (required.length) schema.required = required;
  else delete schema.required;
  return { ...h, input_schema: schema };
}

/** La entrada con la cuenta del hilo, pase lo que pase, en las que la acotan por `clientId`; en las demás, sin `clientId`. */
export function acotarALaCuenta(nombre: string, entrada: unknown, clientId: string): unknown {
  const base = entrada && typeof entrada === "object" && !Array.isArray(entrada) ? (entrada as Record<string, unknown>) : {};
  if (COMO_SE_ACOTA[nombre] === "cuenta") return { ...base, clientId };
  // Las que no llevan la empresa: un `clientId` que el modelo agregó por su cuenta se saca (el zod estricto lo rechazaría).
  if ("clientId" in base) {
    const { clientId: _fuera, ...resto } = base;
    void _fuera;
    return resto;
  }
  return entrada;
}

/** Lo que el servidor sabe leer para verificar una operación que no lleva `clientId`. */
export interface LectorDeLaCuenta {
  /** La empresa de una tarea que la persona ve, por su número; null si no tiene, undefined si no la ve o no existe. */
  clienteDeLaTarea(numero: number): Promise<string | null | undefined>;
  /** La empresa de una empresa, un negocio o un proyecto (lo que nombra el siguiente paso); null si no se sabe. */
  clienteDelObjeto(objeto: string, objetoId: string): Promise<string | null>;
}

export type Verificacion = { ok: true } | { ok: false; motivo: string };

const FUERA = "Eso es de otra empresa: en este chat solo se cambia lo de esta cuenta.";

/** ¿La entrada (ya acotada) es de esta cuenta? */
export async function verificarLaCuenta(nombre: string, entrada: unknown, clientId: string, lector: LectorDeLaCuenta): Promise<Verificacion> {
  const como = COMO_SE_ACOTA[nombre];
  if (!como) return { ok: false, motivo: `«${nombre}» no está disponible en el chat de la cuenta.` };
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  if (como === "cuenta") return e.clientId === clientId ? { ok: true } : { ok: false, motivo: FUERA };
  if (como === "tarea") {
    const numero = typeof e.numero === "number" ? e.numero : NaN;
    if (!Number.isInteger(numero)) return { ok: true }; // lo rechaza el zod de la operación, con su motivo
    const c = await lector.clienteDeLaTarea(numero);
    if (c === undefined) return { ok: false, motivo: `No ves la T-${numero} o no existe.` };
    return c === clientId ? { ok: true } : { ok: false, motivo: `La T-${numero} no es de esta cuenta: en este chat solo se cambian sus tareas.` };
  }
  // objeto
  if (typeof e.objeto !== "string" || typeof e.objetoId !== "string") return { ok: true };
  if (e.objeto === "empresa") return e.objetoId === clientId ? { ok: true } : { ok: false, motivo: FUERA };
  const c = await lector.clienteDelObjeto(e.objeto, e.objetoId);
  return c === clientId ? { ok: true } : { ok: false, motivo: FUERA };
}
