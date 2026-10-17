/**
 * lib/nexus-chat/herramientas-server.ts — las herramientas del chat de Nexus y quién las ejecuta, con lo de verdad.
 * SERVER-ONLY. La lógica es pura y vive en ./ejecutor.ts (acotar a la cuenta, verificar, leer y preparar).
 *
 * Las herramientas son las operaciones de la capa (lib/operaciones/registro-server.ts) que declaran cómo se acotan a la
 * cuenta (./alcance.ts), más las lecturas propias del chat (./lecturas-server.ts). Una operación nueva del registro que
 * nadie declaró en `COMO_SE_ACOTA` no llega al chat.
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { TeamMember } from "@prisma/client";
import { contextoDeOperacion } from "@/lib/operaciones/contexto-server";
import { OPERACIONES } from "@/lib/operaciones/registro-server";
import { herramientaDe } from "@/lib/operaciones/herramientas";
import type { Operacion } from "@/lib/operaciones/tipos";
import { tareaVisiblePorNumero } from "@/lib/tareas/para-operaciones";
import { resolverObjeto } from "@/lib/siguiente-paso/escritura-server";
import { herramientaDeLaCuenta, seOfrece, type LectorDeLaCuenta } from "./alcance";
import type { EjecutorDelChat } from "./bucle";
import { crearEjecutor, prepararCambio, type PiezasDelEjecutor } from "./ejecutor";
import { LECTURAS_DEL_CHAT, type ContextoDelChat } from "./lecturas-server";
import { TOOL_DESCARTAR } from "./prompt";

/** Las operaciones que llegan al chat, en orden: las del registro que se acotan a la cuenta y las lecturas del chat. */
export function operacionesDelChat(): Operacion<ContextoDelChat>[] {
  return [...(OPERACIONES as readonly Operacion<ContextoDelChat>[]).filter((o) => seOfrece(o.nombre)), ...(LECTURAS_DEL_CHAT as unknown as Operacion<ContextoDelChat>[])];
}

/** Lo que ve el modelo: cada operación sin el campo `clientId`, más la de soltar lo pendiente. Siempre en el mismo orden (la caché). */
export function herramientasDelChat(): Anthropic.Messages.Tool[] {
  return [...operacionesDelChat().map((o) => herramientaDeLaCuenta(herramientaDe(o)) as Anthropic.Messages.Tool), TOOL_DESCARTAR as Anthropic.Messages.Tool];
}

/** El contexto de una persona explícita en una cuenta. */
export function contextoDelChat(persona: TeamMember, veMontos: boolean, ahora = new Date()): ContextoDelChat {
  const base = contextoDeOperacion(persona, ahora);
  return { ...base, extras: { ...base.extras, veMontos } };
}

function lectorDeLaCuenta(ctx: ContextoDelChat): LectorDeLaCuenta {
  return {
    async clienteDeLaTarea(numero) {
      const t = await tareaVisiblePorNumero(await ctx.extras.tareas(), numero);
      return t ? t.clientId : undefined;
    },
    async clienteDelObjeto(objeto, objetoId) {
      try {
        return (await resolverObjeto(objeto as "empresa" | "negocio" | "proyecto", objetoId)).clientId ?? null;
      } catch {
        return null;
      }
    },
  };
}

function piezas(ctx: ContextoDelChat, clientId: string): PiezasDelEjecutor<ContextoDelChat> {
  return { operaciones: operacionesDelChat(), ctx, clientId, lector: lectorDeLaCuenta(ctx) };
}

export function prepararParaLaCuenta(ctx: ContextoDelChat, clientId: string, nombre: string, entrada: unknown) {
  return prepararCambio(piezas(ctx, clientId), nombre, entrada);
}

export function ejecutorDelChat(ctx: ContextoDelChat, clientId: string): EjecutorDelChat {
  return crearEjecutor(piezas(ctx, clientId));
}
