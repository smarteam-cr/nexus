/**
 * lib/cobranza/produccion-acceso-server.ts — la guarda de la tabla del paso a producción (2026-11-13). SERVER-ONLY.
 * La regla es pura y vive en ./produccion-acceso.ts.
 */
import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { elegiblesParaProduccion, puedeSerResponsable, puedeVerProduccion, type CampoResponsable, type QuienMira } from "./produccion-acceso";

/** Quien mira, o la respuesta 401/403. Primera línea de cada handler de /api/cobranza/produccion. */
export async function guardProduccion(): Promise<QuienMira | NextResponse> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const [veCobranza, editaCobranza] = await Promise.all([can(guard.teamMember, "cobranza", "read"), can(guard.teamMember, "cobranza", "write")]);
  const q: QuienMira = { rol: guard.role, email: guard.user.email.toLowerCase(), veCobranza, editaCobranza };
  if (!puedeVerProduccion(q)) {
    return NextResponse.json({ error: "Tu rol no tiene acceso al paso a producción." }, { status: 403 });
  }
  return q;
}

type Miembro = { email: string; name: string; roleEnum: Parameters<typeof can>[0]["roleEnum"]; permissionOverrides: unknown };

async function comoQuienMira(m: Miembro): Promise<QuienMira & { nombre: string }> {
  const [veCobranza, editaCobranza] = await Promise.all([can(m, "cobranza", "read"), can(m, "cobranza", "write")]);
  return { rol: m.roleEnum, email: m.email.toLowerCase(), veCobranza, editaCobranza, nombre: m.name };
}

/** A quién ofrecer en cada selector de la tabla: solo a quien puede hacer lo que se le pide (produccion-acceso.ts). */
export async function equipoParaProduccion(): Promise<Record<CampoResponsable, Array<{ email: string; nombre: string }>>> {
  const filas = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { email: true, name: true, roleEnum: true, permissionOverrides: true },
    orderBy: { name: "asc" },
  });
  const equipo = await Promise.all(filas.map(comoQuienMira));
  const e = elegiblesParaProduccion(equipo);
  const corto = (p: { email: string; nombre: string }) => ({ email: p.email, nombre: p.nombre });
  return { confirma: e.confirma.map(corto), cobra: e.cobra.map(corto) };
}

/**
 * ¿Se le puede poner a este correo ese papel? null (el por defecto) siempre se puede. Un correo de alguien que no está
 * en el equipo activo lo rechaza después `guardarResponsablesDelProyecto`.
 */
export async function responsableValido(email: string | null | undefined, campo: CampoResponsable): Promise<boolean> {
  if (!email) return true;
  const m = await prisma.teamMember.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, deactivatedAt: null },
    select: { email: true, name: true, roleEnum: true, permissionOverrides: true },
  });
  if (!m) return true;
  return puedeSerResponsable(await comoQuienMira(m), campo);
}
