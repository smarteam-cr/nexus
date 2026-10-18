/**
 * lib/limpieza/lista-server.ts — la lista de limpieza de HubSpot, armada con los datos de Nexus (fase 0.5). SERVER-ONLY.
 *
 * Solo lee. Los datos son los que copia el espejo de proyectos (encargado, etapa, desde cuándo, última actividad) y los
 * servicios recurrentes de Cobranza; la regla vive en ./reglas.ts. Nada de esto escribe en HubSpot: lo arregla una
 * persona allá, y la siguiente sincronización lo trae.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROYECTO_CLASIFICABLE_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotProjectUrl } from "@/lib/hubspot/urls";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { resolvePipeline } from "@/lib/projects/kind";
import { cuentasExcliente } from "@/lib/cs/exclientes-server";
import { arregloDelServicio, arregloDelServicioDeExcliente, arreglosDelProyecto, type ArregloDeLimpieza, type EquipoParaLimpiar } from "./reglas";

/** Quién está, quién se fue y quién lidera cada sprint. */
export async function equipoParaLimpiar(): Promise<EquipoParaLimpiar> {
  const miembros = await prisma.teamMember.findMany({ select: { email: true, name: true, deactivatedAt: true, lideraEquipos: true, roleEnum: true } });
  const activos = new Map<string, string>();
  const deBaja = new Map<string, string>();
  for (const m of miembros) {
    if (esCuentaDePrueba(m.name)) continue;
    (m.deactivatedAt ? deBaja : activos).set(m.email.toLowerCase(), m.name);
  }
  const vivos = miembros.filter((m) => !m.deactivatedAt && !esCuentaDePrueba(m.name));
  const quienLidera = (sprint: string) => vivos.find((m) => m.lideraEquipos.includes(sprint)) ?? null;
  const csl = vivos.find((m) => m.roleEnum === "CSL") ?? null;
  const cs = quienLidera("cs") ?? csl;
  const dev = quienLidera("desarrollo") ?? cs;
  return {
    activos,
    deBaja,
    lideres: {
      ...(cs ? { cs: { email: cs.email.toLowerCase(), nombre: cs.name } } : {}),
      ...(dev ? { desarrollo: { email: dev.email.toLowerCase(), nombre: dev.name } } : {}),
    },
  };
}

/** Todo lo que hay que poner al día en HubSpot. */
export async function cargarListaDeLimpieza(ahora = new Date()): Promise<ArregloDeLimpieza[]> {
  const deHubspot = { hubspotServiceId: { not: null } };
  const [proyectos, deCs, equipo, portal, cuentas, exclientes] = await Promise.all([
    prisma.project.findMany({
      where: { AND: [PROYECTO_CLASIFICABLE_WHERE, deHubspot] },
      select: {
        id: true,
        name: true,
        clientId: true,
        hubspotServiceId: true,
        hubspotPipelineId: true,
        hubspotPipelineStageLabel: true,
        hubspotOwnerEmail: true,
        hubspotOwnerName: true,
        hubspotEtapaDesde: true,
        hubspotUltimaActividad: true,
        hubspotCreatedAt: true,
        client: { select: { name: true } },
      },
    }),
    prisma.project.findMany({ where: { AND: [PROYECTO_CLASIFICABLE_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE, deHubspot] }, select: { id: true } }),
    equipoParaLimpiar(),
    portalDelSistema().catch(() => null),
    prisma.cuentaFinanciera.findMany({
      where: { servicios: { some: { modalidad: "RECURRENTE", estado: "ACTIVO" } } },
      select: {
        clientId: true,
        client: { select: { name: true } },
        _count: { select: { servicios: { where: { modalidad: "RECURRENTE", estado: "ACTIVO" } } } },
      },
    }),
    // Lo que sigue activo en una cuenta marcada excliente se pide cerrar (lib/cs/exclientes.ts).
    cuentasExcliente(),
  ]);
  const esDeCs = new Set(deCs.map((p) => p.id));
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  const out: ArregloDeLimpieza[] = [];
  for (const p of proyectos) {
    out.push(
      ...arreglosDelProyecto(
        {
          id: p.id,
          nombre: p.name,
          clientId: p.clientId,
          cliente: p.client.name,
          sprint: esDeCs.has(p.id) ? "cs" : "desarrollo",
          servicioRecurrente: !!resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente,
          excliente: exclientes.has(p.clientId),
          etapa: p.hubspotPipelineStageLabel,
          encargadoEmail: p.hubspotOwnerEmail,
          encargadoNombre: p.hubspotOwnerName,
          etapaDesde: iso(p.hubspotEtapaDesde),
          ultimaActividad: iso(p.hubspotUltimaActividad),
          creado: iso(p.hubspotCreatedAt),
          hubspotUrl: hubspotProjectUrl(portal, p.hubspotServiceId),
        },
        equipo,
        ahora,
      ),
    );
  }
  const conProyecto = new Set(proyectos.map((p) => p.clientId));
  for (const c of cuentas) {
    const s = { clientId: c.clientId, cliente: c.client.name, servicios: c._count.servicios };
    if (exclientes.has(c.clientId)) out.push(arregloDelServicioDeExcliente(s, equipo));
    else if (!conProyecto.has(c.clientId)) out.push(arregloDelServicio(s, equipo));
  }

  return out;
}
