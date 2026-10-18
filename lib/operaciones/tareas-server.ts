/**
 * lib/operaciones/tareas-server.ts — las operaciones de Tareas (fase 0.4). SERVER-ONLY.
 *
 * Leen por la puerta de Tareas para la capa (lib/tareas/para-operaciones.ts: sin la cita, el contexto ni las notas) y
 * escriben por el escritor único (lib/tareas/mutaciones.ts), que hace cumplir quién puede asignar, a qué semana va y la
 * versión. `preparar` solo valida lo que se puede validar sin escribir y arma la línea.
 */
import "server-only";
import { z } from "zod";
import { cambiarEstado, crearTarea, moverDeSemana } from "@/lib/tareas/mutaciones";
import { tareaVisiblePorNumero, tareasAbiertasDeLaCuenta } from "@/lib/tareas/para-operaciones";
import { NOMBRE_DEL_ESTADO, PRIORIDADES, type EstadoDeTarea, type Prioridad } from "@/lib/tareas/estados";
import { lunesDeFecha } from "@/lib/tareas/semana";
import { fmtDia } from "@/lib/cs/formato";
import { exigirCliente, type ContextoDeNexus } from "./contexto-server";
import type { OperacionQueLee, OperacionQuePropone } from "./tipos";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");
const idDeCliente = z.string().min(1).max(60);
const numeroDeTarea = z.number().int().positive();

const nombreDelEstado = (e: string) => NOMBRE_DEL_ESTADO[e as EstadoDeTarea] ?? e;

/** El nombre de una persona del equipo por su correo, o el correo. */
async function nombreDe(ctx: ContextoDeNexus, email: string): Promise<string> {
  const t = await ctx.extras.tareas();
  return t.miembros.find((m) => m.email === email.toLowerCase())?.nombre ?? email;
}

export const LEER_TAREAS_DE_LA_CUENTA: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "cuenta.tareas",
  paraQue: "Lee las tareas abiertas de una empresa que puedes ver: número (T-12), título, estado, semana, vencimiento, quién la lleva y de qué lado es (Smarteam o el cliente).",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const t = await ctx.extras.tareas();
    const filas = await tareasAbiertasDeLaCuenta(t, e.clientId);
    return filas.map((f) => ({
      numero: f.numero,
      titulo: f.titulo,
      estado: nombreDelEstado(f.estado),
      semana: f.semana,
      vence: f.venceEl,
      responsable: f.responsableEmail ? (t.miembros.find((m) => m.email === f.responsableEmail)?.nombre ?? f.responsableEmail) : null,
      lado: f.lado,
    }));
  },
};

interface DatosDeCrear {
  titulo: string;
  para: string | null;
  vence: string | null;
  cuando: string;
  clientId: string | null;
  prioridad: Prioridad | null;
  lado: "cliente" | "smarteam" | null;
  /** Lo pone quien aplica, no el modelo: la clave para no crearla dos veces y de dónde viene (lib/nexus-chat/aplicar-server.ts). */
  origenId?: string;
  origen?: "chat";
}

export const CREAR_TAREA: OperacionQuePropone<
  {
    titulo: string;
    clientId?: string | null;
    para?: string | null;
    vence?: string | null;
    cuando?: "esta_semana" | "proxima_semana" | "sin_semana";
    prioridad?: Prioridad;
    lado?: "cliente" | "smarteam";
  },
  DatosDeCrear,
  { numero: number; estado: string },
  ContextoDeNexus
> = {
  nombre: "tarea.crear",
  paraQue:
    "Crea una tarea: el título, de qué empresa es, para quién (su correo; sin él, para ti), cuándo vence o en qué semana va, y de qué lado es (`cliente` si lo tiene que hacer el cliente; sin él, Smarteam). Para otra persona le llega como sugerencia, salvo que la puedas asignar.",
  clase: "propone",
  pide: z
    .object({
      titulo: z.string().trim().min(1, "Escribe qué hay que hacer.").max(140, "Que sea corto: hasta 140 caracteres."),
      clientId: idDeCliente.nullable().optional(),
      para: z.string().email().max(200).nullable().optional(),
      vence: dia.nullable().optional(),
      cuando: z.enum(["esta_semana", "proxima_semana", "sin_semana"]).optional(),
      prioridad: z.enum(PRIORIDADES).optional(),
      lado: z.enum(["cliente", "smarteam"]).optional(),
    })
    .strict(),
  async preparar(ctx, e) {
    const empresa = e.clientId ? await exigirCliente(ctx, e.clientId) : null;
    const t = await ctx.extras.tareas();
    const para = e.para ? e.para.trim().toLowerCase() : null;
    if (para && !t.miembros.some((m) => m.email === para)) return { ok: false, motivo: `${e.para} no es del equipo de Smarteam.` };
    const cuando = e.vence ? lunesDeFecha(e.vence) : (e.cuando ?? "esta_semana");
    const paraOtra = para && para !== t.email ? ` para ${await nombreDe(ctx, para)}` : "";
    const vence = e.vence ? `, vence el ${fmtDia(e.vence)}` : e.cuando === "proxima_semana" ? ", la semana que viene" : e.cuando === "sin_semana" ? ", más adelante" : "";
    return {
      ok: true,
      datos: { titulo: e.titulo, para, vence: e.vence ?? null, cuando, clientId: e.clientId ?? null, prioridad: e.prioridad ?? null, lado: e.lado ?? null },
      linea: `Crear «${e.titulo}»${paraOtra}${vence}${e.lado === "cliente" ? " · lo hace el cliente" : ""}${empresa ? ` · ${empresa.nombre}` : ""}`,
    };
  },
  async aplicar(ctx, d) {
    const creada = await crearTarea(
      await ctx.extras.tareas(),
      await ctx.extras.clientes(),
      {
        titulo: d.titulo,
        para: d.para,
        cuando: d.cuando,
        venceEl: d.vence,
        clientId: d.clientId,
        ...(d.prioridad ? { prioridad: d.prioridad } : {}),
        ...(d.lado ? { lado: d.lado } : {}),
        ...(d.origenId ? { origenId: d.origenId } : {}),
        ...(d.origen ? { origen: d.origen } : {}),
      },
      ctx.ahora,
    );
    return { numero: creada.numero, estado: creada.estado };
  },
};

const ESTADOS_QUE_SE_CAMBIAN = ["pendiente", "en_curso", "hecha"] as const;

interface DatosDeEstado {
  id: string;
  numero: number;
  version: number;
  estado: (typeof ESTADOS_QUE_SE_CAMBIAN)[number];
}

export const CAMBIAR_ESTADO_DE_TAREA: OperacionQuePropone<
  { numero: number; estado: (typeof ESTADOS_QUE_SE_CAMBIAN)[number] },
  DatosDeEstado,
  { numero: number; estado: string },
  ContextoDeNexus
> = {
  nombre: "tarea.cambiar-estado",
  paraQue: "Cambia el estado de una tarea por su número: pendiente, en curso o hecha. Si es el siguiente paso de un equipo, «hecha» lo da por hecho.",
  clase: "propone",
  pide: z.object({ numero: numeroDeTarea, estado: z.enum(ESTADOS_QUE_SE_CAMBIAN) }).strict(),
  async preparar(ctx, e) {
    const t = await tareaVisiblePorNumero(await ctx.extras.tareas(), e.numero);
    if (!t) return { ok: false, motivo: `No ves la T-${e.numero} o no existe.` };
    if (t.estado === e.estado) return { ok: false, motivo: `La T-${e.numero} ya está «${nombreDelEstado(e.estado)}».` };
    return {
      ok: true,
      datos: { id: t.id, numero: t.numero, version: t.version, estado: e.estado },
      linea: `T-${t.numero} «${t.titulo}»: de «${nombreDelEstado(t.estado)}» a «${nombreDelEstado(e.estado)}»`,
    };
  },
  async aplicar(ctx, d) {
    await cambiarEstado(await ctx.extras.tareas(), d.id, d.version, d.estado, null, ctx.ahora);
    return { numero: d.numero, estado: d.estado };
  },
};

interface DatosDeSemana {
  id: string;
  version: number;
  lunes: string | null;
}

export const MOVER_TAREA_DE_SEMANA: OperacionQuePropone<{ numero: number; semana: string | null }, DatosDeSemana, { lunes: string | null }, ContextoDeNexus> = {
  nombre: "tarea.mover-semana",
  paraQue: "Pasa una tarea a otra semana (cualquier día de esa semana, AAAA-MM-DD) o a más adelante (null).",
  clase: "propone",
  pide: z.object({ numero: numeroDeTarea, semana: dia.nullable() }).strict(),
  async preparar(ctx, e) {
    const t = await tareaVisiblePorNumero(await ctx.extras.tareas(), e.numero);
    if (!t) return { ok: false, motivo: `No ves la T-${e.numero} o no existe.` };
    const lunes = e.semana ? lunesDeFecha(e.semana) : null;
    if (lunes === t.semana) return { ok: false, motivo: `La T-${e.numero} ya está en esa semana.` };
    return {
      ok: true,
      datos: { id: t.id, version: t.version, lunes },
      linea: `T-${t.numero} «${t.titulo}»: ${lunes ? `a la semana del ${fmtDia(lunes)}` : "a más adelante"}`,
    };
  },
  async aplicar(ctx, d) {
    await moverDeSemana(await ctx.extras.tareas(), d.id, d.version, d.lunes, ctx.ahora);
    return { lunes: d.lunes };
  },
};
