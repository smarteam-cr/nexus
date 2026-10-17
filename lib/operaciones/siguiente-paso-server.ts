/**
 * lib/operaciones/siguiente-paso-server.ts — el siguiente paso de cada equipo (fase 0.4). SERVER-ONLY.
 *
 * El siguiente paso es una tarea (fase 0.2): leerlo es leer la próxima tarea con fecha de cada sprint en la cuenta
 * (lib/siguiente-paso/lectura-server.ts), y fijarlo crea o cambia esa tarea por el escritor del siguiente paso
 * (lib/siguiente-paso/escritura-server.ts › fijarSiguientePaso), que después lo escribe en HubSpot. Darlo por hecho es
 * terminar su tarea: `tarea.cambiar-estado` con «hecha».
 */
import "server-only";
import { z } from "zod";
import { equiposQueLidera } from "@/lib/tareas/equipos";
import { pasosDeLaCuenta } from "@/lib/siguiente-paso/lectura-server";
import { fijarSiguientePaso, resolverObjeto } from "@/lib/siguiente-paso/escritura-server";
import { NOMBRE_DEL_EQUIPO, equiposQueEscribe } from "@/lib/siguiente-paso/reglas";
import { NuevoPasoSchema, type NuevoPasoDeLaApi } from "@/lib/siguiente-paso/schema";
import { fmtDia } from "@/lib/cs/formato";
import { exigirCliente, type ContextoDeNexus } from "./contexto-server";
import type { OperacionQueLee, OperacionQuePropone } from "./tipos";

export const LEER_SIGUIENTES_PASOS: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "cuenta.siguientes-pasos",
  paraQue:
    "Lee el siguiente paso de cada equipo (Ventas, Customer Success y Desarrollo) en una empresa que puedes ver: en la empresa, en sus negocios abiertos y en sus proyectos.",
  clase: "lee",
  pide: z.object({ clientId: z.string().min(1).max(60) }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const r = await pasosDeLaCuenta(e.clientId);
    if (!r) return { objetos: [] };
    const nombreDe = new Map(r.objetos.map((o) => [`${o.objeto}:${o.objetoId}`, o.nombre]));
    return {
      objetos: r.objetos.map((o) => ({ objeto: o.objeto, objetoId: o.objetoId, nombre: o.nombre, detalle: o.detalle })),
      pasos: r.pasos.map((p) => ({
        objeto: p.objeto,
        objetoId: p.objetoId,
        de: nombreDe.get(`${p.objeto}:${p.objetoId}`) ?? null,
        equipo: NOMBRE_DEL_EQUIPO[p.equipo],
        que: p.que,
        fecha: p.fecha,
        lleva: p.responsableNombre ?? p.responsableEmail,
        tarea: p.tareaNumero ? `T-${p.tareaNumero}` : null,
      })),
    };
  },
};

export const FIJAR_SIGUIENTE_PASO: OperacionQuePropone<NuevoPasoDeLaApi, NuevoPasoDeLaApi, { numero: number; hubspotEstado: string }, ContextoDeNexus> = {
  nombre: "siguiente-paso.fijar",
  paraQue:
    "Fija el siguiente paso de un equipo (ventas, cs o dev) en una empresa, un negocio o un proyecto: qué sigue, para cuándo y quién lo lleva. Si el equipo ya tenía uno ahí, lo cambia. Queda como tarea y en HubSpot.",
  clase: "propone",
  pide: NuevoPasoSchema,
  async preparar(ctx, e) {
    const p = ctx.persona;
    if (!equiposQueEscribe(p.roleEnum, equiposQueLidera(p)).includes(e.equipo)) {
      return { ok: false, motivo: "Solo puedes escribir el siguiente paso de tu equipo o de uno que lideras." };
    }
    const o = await resolverObjeto(e.objeto, e.objetoId);
    if (o.clientId) await exigirCliente(ctx, o.clientId);
    const t = await ctx.extras.tareas();
    const lleva = e.responsableEmail ? (t.miembros.find((m) => m.email === e.responsableEmail!.toLowerCase())?.nombre ?? e.responsableEmail) : null;
    return {
      ok: true,
      datos: e,
      linea: `Siguiente paso de ${NOMBRE_DEL_EQUIPO[e.equipo]} en ${o.nombre}: «${e.que.trim()}»${e.fecha ? `, para el ${fmtDia(e.fecha)}` : ""}${lleva ? ` · lo lleva ${lleva}` : ""}`,
    };
  },
  async aplicar(ctx, d) {
    const r = await fijarSiguientePaso(ctx.persona, {
      objeto: d.objeto,
      objetoId: d.objetoId,
      equipo: d.equipo,
      que: d.que,
      fecha: d.fecha ?? null,
      responsableEmail: d.responsableEmail ?? null,
    });
    return { numero: r.numero, hubspotEstado: r.hubspotEstado };
  },
};
