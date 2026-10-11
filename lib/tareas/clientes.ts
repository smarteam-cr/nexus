/**
 * lib/tareas/clientes.ts — las empresas que una persona puede elegir en una tarea. SERVIDOR.
 *
 * Es el MISMO acceso de `requireAccessToClient` (lib/auth/access.ts), de cualquier tipo (cliente, prospecto, aliado),
 * más las empresas INTERNO (Smarteam): Ventas y Marketing trabajan con prospectos y aliados, y el trabajo interno se
 * pone a nombre de Smarteam. La usan las opciones, la lectura de reuniones, los vínculos y «Por cliente».
 *
 * ⚠ Excepción a «`kinds: all` es para una sola pantalla» (docs/DECISIONS.md › Tareas internas): acá no se lista la
 * cartera, se elige para quién es un trabajo. Un test la compara con `requireAccessToClient` cliente por cliente.
 *
 * Se calcula UNA vez por pedido (el serializador la recibe hecha).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { TeamMember } from "@prisma/client";
import { can } from "@/lib/auth/permissions/engine";
import { veTodaLaCartera, clientesRevocadosPara } from "@/lib/auth/access";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { isTestClient } from "@/lib/sessions/categorize";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";

export interface EmpresaElegible {
  id: string;
  nombre: string;
  /** `ClientKind`. */
  kind: string;
}

export interface ClientesQueVes {
  /** true = ve toda la cartera (y entonces `ids` las trae todas). */
  todos: boolean;
  ids: ReadonlySet<string>;
  /** `id → empresa`, para nombrar sin otra consulta. */
  porId: ReadonlyMap<string, EmpresaElegible>;
}

type TmParaAcceso = Pick<TeamMember, "id" | "email" | "roleEnum" | "permissionOverrides" | "canViewAllClients" | "canViewAllExpiresAt">;

export async function clientesQueVesParaTareas(tm: TmParaAcceso): Promise<ClientesQueVes> {
  const todas = (
    await prisma.client.findMany({ select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } })
  ).filter((c) => !isTestClient(c.name));
  const porIdTodas = new Map(todas.map((c) => [c.id, { id: c.id, nombre: c.name, kind: c.kind as string }]));

  if (await veTodaLaCartera(tm)) {
    return { todos: true, ids: new Set(porIdTodas.keys()), porId: porIdTodas };
  }

  const [grants, revocados, propias, enPreventa] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { kind: "GRANT", OR: [{ teamMemberId: tm.id }, { targetRole: tm.roleEnum }] },
      select: { clientId: true },
    }),
    clientesRevocadosPara(tm),
    prisma.project.findMany({
      where: { hubspotOwnerEmail: tm.email, ...PROYECTO_DE_PIPELINE_CS_WHERE },
      select: { clientId: true },
      distinct: ["clientId"],
    }),
    (async () =>
      (await can(tm, "preventa", "read"))
        ? prisma.exploracionDeVenta.findMany({
            // El paso 7 de requireAccessToClient: un prospecto con una preventa VIVA (no la exploración de un proyecto).
            where: { ...DE_LA_PREVENTA, archivadaEn: null, client: { kind: "PROSPECTO" } },
            select: { clientId: true },
            distinct: ["clientId"],
          })
        : [])(),
  ]);

  const ids = new Set<string>();
  for (const g of grants) ids.add(g.clientId);
  for (const p of propias) ids.add(p.clientId);
  for (const e of enPreventa) if (e.clientId) ids.add(e.clientId);
  // Un REVOKE corta todo lo demás (paso 5 de requireAccessToClient: lanza antes del dueño, el GRANT y la preventa).
  for (const r of revocados) ids.delete(r);
  // Más las de Smarteam: el trabajo interno se pone a su nombre.
  for (const c of todas) if (c.kind === "INTERNO") ids.add(c.id);

  const porId = new Map([...ids].flatMap((id) => (porIdTodas.has(id) ? [[id, porIdTodas.get(id)!] as const] : [])));
  return { todos: false, ids: new Set(porId.keys()), porId };
}
