/**
 * lib/cobranza/estado-de-cuenta-compartir.ts — el enlace del estado de cuenta (pedido 17, 2026-11-13): crearlo,
 * extenderlo y revocarlo desde la cuenta de Cobranza. SERVIDOR. Pide el permiso quien llama (`cobranza.write`).
 *
 * Mismo modelo que el «Acceso» de La escala y el documento de la empresa: la URL es el secreto (256 bits), sin
 * contraseña. Lo propio de este enlace es que CADUCA: la página muestra la deuda EN VIVO, así que un enlace olvidado
 * en un buzón seguiría mostrando la deuda de hoy a quien lo encuentre. A los `DIAS_DE_VIGENCIA` deja de abrir y dice
 * que venció; «Extender» lo corre sin cambiar la dirección (la persona de finanzas lo tiene guardado). Revocar sí
 * cierra para siempre: crear otro da una dirección NUEVA (la vieja pudo circular a quien ya no debía verla).
 * Ver DECISIONS «Cobranza — el estado de cuenta compartido».
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { DIAS_DE_VIGENCIA } from "./estado-de-cuenta";

export type EstadoDelEnlaceDeCuenta = "sin-generar" | "activo" | "vencido" | "revocado";

export interface EnlaceDelEstadoDeCuenta {
  estado: EstadoDelEnlaceDeCuenta;
  /** Solo si el enlace no está revocado (activo o vencido): un revocado no se vuelve a mostrar. */
  enlace: string | null;
  creadoEn: string | null;
  creadoPor: string | null;
  venceEn: string | null;
  ultimaVista: string | null;
  vistas: number;
}

export class ErrorDelEnlace extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** El enlace público de un token (la página la sirve app/external/estado-de-cuenta/[token]). */
export function enlaceDelEstadoDeCuenta(token: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/external/estado-de-cuenta/${token}`;
}

const dentroDe = (dias: number, desde = new Date()) => new Date(desde.getTime() + dias * 86_400_000);

export async function estadoDelEnlace(cuentaId: string, ahora = new Date()): Promise<EnlaceDelEstadoDeCuenta> {
  const a = await prisma.accesoAlEstadoDeCuenta.findUnique({
    where: { cuentaId },
    select: { accessToken: true, enabledAt: true, venceEn: true, revokedAt: true, lastUsedAt: true, vistas: true, creadoPor: true },
  });
  if (!a) return { estado: "sin-generar", enlace: null, creadoEn: null, creadoPor: null, venceEn: null, ultimaVista: null, vistas: 0 };
  if (a.revokedAt) return { estado: "revocado", enlace: null, creadoEn: null, creadoPor: null, venceEn: null, ultimaVista: null, vistas: 0 };
  return {
    estado: a.venceEn <= ahora ? "vencido" : "activo",
    enlace: enlaceDelEstadoDeCuenta(a.accessToken),
    creadoEn: a.enabledAt.toISOString(),
    creadoPor: a.creadoPor,
    venceEn: a.venceEn.toISOString(),
    ultimaVista: a.lastUsedAt?.toISOString() ?? null,
    vistas: a.vistas,
  };
}

async function exigirCuenta(cuentaId: string): Promise<void> {
  const c = await prisma.cuentaFinanciera.findUnique({ where: { id: cuentaId }, select: { id: true } });
  if (!c) throw new ErrorDelEnlace(404, "La cuenta no existe.");
}

/**
 * Crea el enlace, o devuelve el que ya abre. Uno vencido o revocado se reemplaza por una dirección NUEVA. Con dos
 * personas a la vez, una sola crea: la otra se queda con el mismo enlace (índice único por cuenta).
 */
export async function crearEnlace(cuentaId: string, porEmail: string | null): Promise<EnlaceDelEstadoDeCuenta> {
  await exigirCuenta(cuentaId);
  const ahora = new Date();
  const token = randomBytes(32).toString("hex");
  const venceEn = dentroDe(DIAS_DE_VIGENCIA, ahora);
  await prisma.accesoAlEstadoDeCuenta.createMany({ data: [{ cuentaId, accessToken: token, venceEn, creadoPor: porEmail }], skipDuplicates: true });
  await prisma.accesoAlEstadoDeCuenta.updateMany({
    where: { cuentaId, OR: [{ revokedAt: { not: null } }, { venceEn: { lte: ahora } }] },
    data: { accessToken: token, revokedAt: null, revocadoPor: null, enabledAt: ahora, venceEn, lastUsedAt: null, vistas: 0, creadoPor: porEmail },
  });
  return estadoDelEnlace(cuentaId);
}

/** Corre el vencimiento `DIAS_DE_VIGENCIA` desde hoy, con la MISMA dirección. Un revocado no se revive. */
export async function extenderEnlace(cuentaId: string): Promise<EnlaceDelEstadoDeCuenta> {
  const r = await prisma.accesoAlEstadoDeCuenta.updateMany({
    where: { cuentaId, revokedAt: null },
    data: { venceEn: dentroDe(DIAS_DE_VIGENCIA) },
  });
  if (r.count === 0) throw new ErrorDelEnlace(409, "No hay un enlace para extender: crea uno.");
  return estadoDelEnlace(cuentaId);
}

/** Revoca: el enlace deja de abrir para quien ya lo tiene. */
export async function revocarEnlace(cuentaId: string, porEmail: string | null): Promise<EnlaceDelEstadoDeCuenta> {
  await prisma.accesoAlEstadoDeCuenta.updateMany({ where: { cuentaId, revokedAt: null }, data: { revokedAt: new Date(), revocadoPor: porEmail } });
  return estadoDelEnlace(cuentaId);
}
