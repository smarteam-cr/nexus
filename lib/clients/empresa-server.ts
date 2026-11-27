/**
 * lib/clients/empresa-server.ts — la guarda de los que CREAN trabajo en una ficha (2026-11-26).
 *
 * La empresa arriba de sus unidades (`Client.kind` EMPRESA) nunca tiene trabajo: un proyecto, una preventa, una propuesta,
 * un handoff o una cuenta de cobro se crean en una unidad. La regla pura está en lib/clients/empresa.ts; esto solo lee el
 * tipo de la ficha. DECISIONS «La empresa arriba de sus unidades».
 */
import { prisma } from "@/lib/db/prisma";
import { esEmpresa, rechazarSiEsEmpresa, NO_SE_TRABAJA_EN_LA_EMPRESA, type RechazoDeLaEmpresa } from "./empresa";

/** Null si se puede crear trabajo en esta ficha; el 409 si es una empresa. */
export async function rechazoSiLaFichaEsEmpresa(clientId: string, db: Pick<typeof prisma, "client"> = prisma): Promise<RechazoDeLaEmpresa> {
  const ficha = await db.client.findUnique({ where: { id: clientId }, select: { kind: true } });
  return rechazarSiEsEmpresa(ficha);
}

/**
 * Para las rutas que CAMBIAN la ficha (nombre, dominios, empresa de HubSpot, categoría, datos, encargado, logo): null si
 * se puede; si la ficha es una empresa, solo la cambia el Super Admin o quien abre TODAS sus unidades (revisión del 26 nov:
 * una CSE que lleva solo AE cambiaba los dominios del TEC y movía reuniones de TAE sin abrir TAE). En «Unidades de
 * negocio» el mismo cambio pide abrir cada ficha que gana o pierde algo.
 */
export async function rechazoDeEscrituraEnLaEmpresa(clientId: string): Promise<{ status: 403; error: string } | null> {
  const ficha = await prisma.client.findUnique({ where: { id: clientId }, select: { kind: true, entidadesDelDominio: { select: { id: true } } } });
  if (!esEmpresa(ficha)) return null;
  const { requireInternalUser } = await import("@/lib/auth/supabase");
  const { clientesQueNoAbre } = await import("@/lib/auth/access");
  const yo = await requireInternalUser();
  if (yo.teamMember.roleEnum === "SUPER_ADMIN") return null;
  const noAbre = await clientesQueNoAbre(yo.teamMember.id, (ficha?.entidadesDelDominio ?? []).map((u) => u.id));
  return noAbre.size ? { status: 403, error: "Para cambiar la empresa tienes que abrir todas sus unidades. Pídeselo a la CSL." } : null;
}

/** Para los escritores sin respuesta HTTP propia: lanza si la ficha es una empresa. */
export class TrabajoEnLaEmpresa extends Error {
  readonly status = 409;
  constructor() {
    super(NO_SE_TRABAJA_EN_LA_EMPRESA);
  }
}

export async function exigirQueNoSeaEmpresa(clientId: string, db: Pick<typeof prisma, "client"> = prisma): Promise<void> {
  if (await rechazoSiLaFichaEsEmpresa(clientId, db)) throw new TrabajoEnLaEmpresa();
}
