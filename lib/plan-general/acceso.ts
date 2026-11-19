/**
 * lib/plan-general/acceso.ts — el «Acceso» y el «Publicar» del plan general de la cuenta (2026-11-19). SERVIDOR.
 *
 * Mismo modelo que La escala (lib/exploraciones/acceso-a-la-escala.ts): la URL es el secreto (256 bits), sin
 * contraseña; revocar deja de abrirla y crear otro da un enlace NUEVO. El cliente ve la FOTO publicada, nunca lo vivo:
 * crear el primer acceso publica (crearlo es querer compartirlo); después, solo «Publicar». Revocar no borra la foto.
 * Pide el permiso quien llama.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { fotoDelPlan, hayCambiosSinPublicar, leerFoto, type FotoDelPlan } from "./foto";
import { leerPlanGeneral } from "./leer";

export interface EstadoDelAccesoAlPlan {
  estado: "sin-generar" | "activo" | "revocado";
  enlace: string | null;
  creadoEn: string | null;
  ultimaVista: string | null;
  /** Cuándo y quién publicó lo que ve el cliente. null: nunca (o la foto es de otro formato). */
  publicadoEn: string | null;
  publicadoPor: string | null;
  /** Lo de hoy es distinto de lo publicado. */
  sinPublicar: boolean;
}

export class ErrorDelAccesoAlPlan extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** El enlace público de un token (la página la sirve app/external/plan/[token]). */
export function enlaceDelPlan(token: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/external/plan/${token}`;
}

async function fotoDeHoy(clientId: string): Promise<FotoDelPlan> {
  return fotoDelPlan(await leerPlanGeneral(clientId, { paraElCliente: true }));
}

export async function estadoDelAccesoAlPlan(clientId: string): Promise<EstadoDelAccesoAlPlan> {
  const [a, hoy] = await Promise.all([
    prisma.accesoAlPlanGeneral.findUnique({
      where: { clientId },
      select: { accessToken: true, enabledAt: true, revokedAt: true, lastUsedAt: true, publicado: true, publicadoEn: true, publicadoPor: true },
    }),
    fotoDeHoy(clientId),
  ]);
  const vivo = !!a && !a.revokedAt;
  const foto = a ? leerFoto(a.publicado) : null;
  return {
    estado: !a ? "sin-generar" : vivo ? "activo" : "revocado",
    enlace: vivo ? enlaceDelPlan(a.accessToken) : null,
    creadoEn: vivo ? a.enabledAt.toISOString() : null,
    ultimaVista: vivo ? (a.lastUsedAt?.toISOString() ?? null) : null,
    publicadoEn: foto ? (a?.publicadoEn?.toISOString() ?? null) : null,
    publicadoPor: foto ? (a?.publicadoPor ?? null) : null,
    sinPublicar: hayCambiosSinPublicar(hoy, foto),
  };
}

/**
 * Publica lo de hoy. Sin acceso no hay dónde (409); un plan sin actividades se publica solo si ya había una foto (es
 * la forma de retirarle el plan al cliente sin revocar). `siSigue: null` publica solo si nunca se publicó (el primer
 * acceso, y dos personas que lo crean a la vez no publican dos veces). Devuelve si publicó.
 */
export async function publicarElPlan(clientId: string, porEmail: string | null, o: { siSigue?: null } = {}): Promise<boolean> {
  const foto = await fotoDeHoy(clientId);
  if (!foto.grupos.length) {
    const antes = await prisma.accesoAlPlanGeneral.findUnique({ where: { clientId }, select: { publicadoEn: true } });
    if (!antes?.publicadoEn) throw new ErrorDelAccesoAlPlan(409, "Todavía no hay actividades en los loops: no hay nada que mostrarle al cliente.");
  }
  const { count } = await prisma.accesoAlPlanGeneral.updateMany({
    where: { clientId, ...(o.siSigue !== undefined ? { publicadoEn: o.siSigue } : {}) },
    data: { publicado: foto as unknown as Prisma.InputJsonValue, publicadoEn: new Date(), publicadoPor: porEmail },
  });
  if (!count && o.siSigue === undefined) throw new ErrorDelAccesoAlPlan(409, "Primero crea el acceso del cliente: el plan se publica en su enlace.");
  return count > 0;
}

/** Crea el enlace (o devuelve el vivo; uno revocado se renueva con un token nuevo). */
export async function crearAccesoAlPlan(clientId: string, porEmail: string | null): Promise<EstadoDelAccesoAlPlan> {
  if (!(await fotoDeHoy(clientId)).grupos.length) {
    throw new ErrorDelAccesoAlPlan(409, "Todavía no hay actividades en los loops: el plan saldría vacío.");
  }
  const token = randomBytes(32).toString("hex");
  await prisma.accesoAlPlanGeneral.createMany({ data: [{ clientId, accessToken: token, creadoPor: porEmail }], skipDuplicates: true });
  await prisma.accesoAlPlanGeneral.updateMany({
    where: { clientId, revokedAt: { not: null } },
    data: { accessToken: token, revokedAt: null, enabledAt: new Date(), lastUsedAt: null, creadoPor: porEmail },
  });
  await publicarElPlan(clientId, porEmail, { siSigue: null });
  return estadoDelAccesoAlPlan(clientId);
}

export async function revocarAccesoAlPlan(clientId: string): Promise<EstadoDelAccesoAlPlan> {
  await prisma.accesoAlPlanGeneral.updateMany({ where: { clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  return estadoDelAccesoAlPlan(clientId);
}
