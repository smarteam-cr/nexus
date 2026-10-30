/**
 * scripts/propietarios-por-migrar.ts — la lista para migrar «CSE Encargado» al propietario (2026-10-30). SOLO LEE: no
 * escribe datos en HubSpot ni en la base (lo único que puede tocar es renovar el token de HubSpot, como toda lectura) y
 * no tiene --apply: la migración la decide Elías.
 *
 * Saca cada proyecto de Customer Success activo con registro en HubSpot cuyo «Propietario» falta, está archivado o es
 * del equipo técnico (lib/hubspot/encargados.ts › `propietarioPorMigrar`), con quién debería quedar según «CSE
 * Encargado». Sin nadie claro, lo dice: esa la decide una persona. Los de un pipeline que Nexus no declara van aparte:
 * no se sabe si son de CS (el 924878469, «Acompañamiento técnico», tiene dos integraciones con su dueño técnico).
 *
 * Mientras esta lista no esté en cero y con todos los proyectos leídos, no se borra la propiedad: lo que siga acá caería
 * a «CSL Encargado», que es la CSL.
 *
 *   npx tsx scripts/propietarios-por-migrar.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO, PROP_PROPIETARIO, propietarioPorMigrar, type PorQueMigrar } from "@/lib/hubspot/encargados";
import { correosDelEquipoTecnico } from "@/lib/hubspot/equipo-tecnico";
import { nombresDelEquipo } from "@/lib/cuentas/encargado-server";
import { resolvePipeline } from "@/lib/projects/kind";
import { esPipelineIdDeCs } from "@/lib/projects/scope";

const MOTIVO: Record<PorQueMigrar, string> = { falta: "Sin propietario", archivado: "Propietario archivado", tecnico: "Propietario técnico" };

async function main() {
  const hs = await getSystemHubspotClient();
  // Los owners vivos, con su nombre. Sin esta lista todos parecerían archivados: mejor no decir nada.
  const r = await hs.apiRequest({ method: "GET", path: "/crm/v3/owners?limit=500" });
  if (!r.ok) throw new Error(`No se pudo leer la lista de owners de HubSpot (${r.status}).`);
  const owners = new Map<string, { email: string; nombre: string }>();
  for (const o of ((await r.json()) as { results?: { id: string; email?: string; firstName?: string; lastName?: string }[] }).results ?? []) {
    if (o.email) owners.set(o.id, { email: o.email.trim().toLowerCase(), nombre: [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email });
  }
  if (owners.size === 0) throw new Error("HubSpot devolvió la lista de owners vacía.");
  // Los archivados, solo para nombrarlos: quien lee la lista necesita saber quién era.
  const archivados = new Map<string, string>();
  const ra = await hs.apiRequest({ method: "GET", path: "/crm/v3/owners?limit=500&archived=true" });
  if (ra.ok) {
    for (const o of ((await ra.json()) as { results?: { id: string; email?: string; firstName?: string; lastName?: string }[] }).results ?? []) {
      archivados.set(o.id, [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || o.id);
    }
  }
  const equipo = await nombresDelEquipo();
  const quien = (id: string | null | undefined) => {
    if (!id) return "—";
    const o = owners.get(id);
    return o ? (equipo.nombres.get(o.email) ?? o.nombre) : `${archivados.get(id) ?? id} (archivado)`;
  };

  const tecnicos = await correosDelEquipoTecnico();
  const proyectos = (
    await prisma.project.findMany({
      where: { status: "active", hubspotServiceId: { not: null } },
      select: { name: true, hubspotServiceId: true, hubspotPipelineId: true, client: { select: { name: true } } },
    })
  ).filter((p) => esPipelineIdDeCs(p.hubspotPipelineId));

  const props = new Map<string, Record<string, string | null>>();
  const ids = proyectos.map((p) => p.hubspotServiceId!);
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${OBJETO_PROYECTOS}/batch/read`,
      body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })), properties: [PROP_PROPIETARIO, PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO] },
    });
    if (!res.ok) throw new Error(`No se pudieron leer los proyectos de HubSpot (${res.status}).`);
    for (const x of ((await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] }).results ?? []) props.set(x.id, x.properties);
  }

  const todas = proyectos.flatMap((p) => {
    const pr = props.get(p.hubspotServiceId!);
    const m = pr ? propietarioPorMigrar(pr, (id) => owners.get(id)?.email ?? null, tecnicos) : null;
    return m && pr ? [{ p, pr, ...m }] : [];
  });
  todas.sort((a, b) => a.p.client.name.localeCompare(b.p.client.name, "es"));
  const filas = todas.filter((f) => resolvePipeline(f.p.hubspotPipelineId));
  const sinDeclarar = todas.filter((f) => !resolvePipeline(f.p.hubspotPipelineId));
  const linea = (f: (typeof todas)[number]) =>
    `  ${f.p.client.name} · «${f.p.name}» (${resolvePipeline(f.p.hubspotPipelineId)?.label ?? `pipeline ${f.p.hubspotPipelineId ?? "vacío"}`}): propietario ${quien(f.pr[PROP_PROPIETARIO])} · CSE Encargado ${quien(f.pr[PROP_CSE_ENCARGADO])} · CSL Encargado ${quien(f.pr[PROP_CSL_ENCARGADO])}`;

  console.log(`Proyectos de Customer Success activos: ${proyectos.length} (leídos: ${props.size}).`);
  if (props.size < proyectos.length) console.log(`⚠ ${proyectos.length - props.size} no se pudieron leer: no cuentan abajo. Revísalos antes de dar la lista por buena.`);
  console.log(`Por migrar: ${filas.length}, y ${filas.filter((f) => !f.deberiaQuedar).length} de ellos sin nadie claro. Aparte, en un pipeline sin declarar: ${sinDeclarar.length}.`);
  for (const porQue of Object.keys(MOTIVO) as PorQueMigrar[]) {
    const deEste = filas.filter((f) => f.porQue === porQue);
    console.log(`\n${MOTIVO[porQue]} (${deEste.length}):`);
    for (const f of deEste) console.log(`${linea(f)} ${f.deberiaQuedar ? `→ ${quien(f.deberiaQuedar)}` : "→ sin nadie claro: lo decide una persona"}`);
  }
  console.log(`\nEn un pipeline que Nexus no declara, no se migran hasta decidir de quién es ese pipeline (${sinDeclarar.length}):`);
  for (const f of sinDeclarar) console.log(linea(f));
  console.log("\nSolo lectura: no se escribió nada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
