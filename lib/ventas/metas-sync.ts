/**
 * lib/ventas/metas-sync.ts — copia las metas comerciales de HubSpot a `MetaComercial`. SERVIDOR.
 *
 * Solo lee de HubSpot (`/crm/v3/objects/goal_targets`, permiso `crm.objects.goals.read`). Cada tramo
 * se guarda con su monto y el avance que calcula HubSpot (`hs_kpi_value`), y con la persona de Nexus
 * que le corresponde (por el correo del dueño). Lo corre el job `ventas-ganadas-daily`.
 *
 * Reglas:
 *  · Sin el permiso, HubSpot responde 403: se devuelve `sinPermiso` y no se toca nada. Se arregla
 *    reconectando HubSpot desde Integraciones (el permiso ya se pide en app/api/auth/hubspot).
 *  · Nunca se borra una fila: un tramo que HubSpot dejó de devolver queda con `vigente=false`, y solo
 *    si la lectura terminó entera (una lectura cortada no puede dar de baja metas).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { aTramo, PROPIEDADES_DE_META, type TramoDeMeta } from "./metas-reglas";

export interface SyncMetasResult {
  sinPermiso?: boolean;
  traidas: number;
  guardadas: number;
  sinPersona: number;
  dadasDeBaja: number;
  errores: string[];
}

export async function syncMetasComerciales(opciones: { dryRun?: boolean } = {}): Promise<SyncMetasResult> {
  const res: SyncMetasResult = { traidas: 0, guardadas: 0, sinPersona: 0, dadasDeBaja: 0, errores: [] };
  const now = new Date();
  const hs = await getSystemHubspotClient();

  // ── 1. Los tramos ──
  const tramos: TramoDeMeta[] = [];
  let despues: string | undefined;
  let completa = true;
  do {
    const r = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/goal_targets?limit=100&properties=${PROPIEDADES_DE_META.join(",")}${despues ? `&after=${encodeURIComponent(despues)}` : ""}`,
    });
    if (r.status === 403) return { ...res, sinPermiso: true };
    if (!r.ok) {
      res.errores.push(`metas: HTTP ${r.status}`);
      completa = false;
      break;
    }
    const data = (await r.json()) as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    };
    for (const x of data.results ?? []) {
      res.traidas++;
      const t = aTramo(x.id, x.properties);
      if (t) tramos.push(t);
      else res.errores.push(`meta ${x.id}: sin monto o sin fechas — no se guarda.`);
    }
    despues = data.paging?.next?.after;
  } while (despues);

  // ── 2. A quién es cada tramo ──
  const { porOwner, porUsuario } = await leerDuenos(hs);
  const equipo = await prisma.teamMember.findMany({ select: { id: true, email: true } });
  const porCorreo = new Map(equipo.map((m) => [m.email.trim().toLowerCase(), m.id]));
  const personaDe = (t: TramoDeMeta): string | null => {
    const dueno = (t.hubspotOwnerId && porOwner.get(t.hubspotOwnerId)) || (t.hubspotUserId && porUsuario.get(t.hubspotUserId)) || null;
    return dueno?.email ? (porCorreo.get(dueno.email) ?? null) : null;
  };

  // ── 3. Guardar ──
  for (const t of tramos) {
    const teamMemberId = personaDe(t);
    if (!teamMemberId) res.sinPersona++;
    if (opciones.dryRun) continue;
    const datos = {
      hubspotGoalId: t.hubspotGoalId,
      nombre: t.nombre,
      tipo: t.tipo,
      hubspotOwnerId: t.hubspotOwnerId,
      hubspotUserId: t.hubspotUserId,
      teamMemberId,
      desde: t.desde,
      hasta: t.hasta,
      monto: new Prisma.Decimal(t.monto),
      avance: t.avance === null ? null : new Prisma.Decimal(t.avance),
      moneda: t.moneda,
      estado: t.estado,
      vigente: true,
      sincronizadoEn: now,
    };
    await prisma.metaComercial.upsert({
      where: { hubspotGoalTargetId: t.hubspotGoalTargetId },
      create: { hubspotGoalTargetId: t.hubspotGoalTargetId, ...datos },
      update: datos,
    });
    res.guardadas++;
  }

  // ── 4. Las que ya no vinieron ──
  if (completa && !opciones.dryRun) {
    const vistas = tramos.map((t) => t.hubspotGoalTargetId);
    const r = await prisma.metaComercial.updateMany({
      where: { vigente: true, hubspotGoalTargetId: { notIn: vistas } },
      data: { vigente: false, sincronizadoEn: now },
    });
    res.dadasDeBaja = r.count;
  }
  return res;
}
