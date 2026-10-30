/**
 * scripts/propietario-como-encargado.ts — qué cambia cuando el «Propietario» de HubSpot pasa a ser el encargado de cada
 * proyecto (2026-10-29, lib/hubspot/encargados.ts).
 *
 * Simulacro por defecto (solo lee la base y HubSpot): compara, en cada proyecto activo con registro en HubSpot, a quién
 * lee el espejo con la regla de antes («CSE Encargado», luego «CSL Encargado», luego el propietario) y con la de ahora
 * (el propietario primero; en un proyecto de CS, alguien del equipo técnico no cuenta). Dice qué cuentas cambian de
 * encargado (lib/cuentas/encargado.ts) y a quién se le abre o se
 * le cierra una cuenta (lib/auth/access.ts: el dueño de un proyecto de Customer Success abre la cuenta, si no ve toda la
 * cartera). Un propietario archivado en HubSpot no tiene correo, igual que en el espejo, y cae al respaldo.
 *
 * Con --apply sincroniza, con la sincronización de la ficha (`syncProjectsForClient`), las cuentas donde cambia algún
 * proyecto: es lo que haría la copia diaria al día siguiente, ya. Si cambia quién lleva la cuenta, el pase mueve lo
 * abierto (lib/cuentas/pase-server.ts), firmado por el sistema. ⚠ Correrlo DESPUÉS del deploy: con el código de antes en
 * producción, la próxima sincronización de cada ficha lo devolvería (docs/KNOWN-ERRORS.md, el backfill que no pega).
 *
 *   npx tsx scripts/propietario-como-encargado.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propietario-como-encargado.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Deshacer: el guard respalda antes `Project` y lo que mueve el pase en la base (tareas con su evento, avisos, alertas).
 * NO cubre lo que se escribe en HubSpot (el siguiente paso de la cuenta) ni lo que nacería si la corrida trae un proyecto
 * nuevo (canvases, ficha, reclasificación de reuniones, ~US$1): eso no sale en este simulacro. Cambiar el propietario en
 * HubSpot de vuelta NO deshace el pase: movería al anterior también lo que el nuevo ya llevaba.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { candidatosDelProyecto, ownerQueSeGuarda, PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO, PROP_PROPIETARIO, type PropiedadesDelEncargado } from "@/lib/hubspot/encargados";
import { correosDelEquipoTecnico } from "@/lib/hubspot/equipo-tecnico";
import { esPipelineIdDeCs, esProyectoDePipelineCS } from "@/lib/projects/scope";
import { encargadoDeLaCuenta, proyectoQueLleva } from "@/lib/cuentas/encargado";
import { nombresDelEquipo, SELECT_PARA_EL_ENCARGADO } from "@/lib/cuentas/encargado-server";
import { veTodaLaCartera } from "@/lib/auth/access";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

// Las del espejo y las del pase de cuenta (lo abierto que se mueve: tareas con su evento, avisos y alertas).
const APPLY = resolverApply({ tablas: ["Project", "Tarea", "TareaEvento", "Aviso", "CsAlert"] });

/** La regla de antes del 2026-10-29: «CSE Encargado» → «CSL Encargado» → propietario, y el correo cae al propietario. */
function duenoDeAntes(p: PropiedadesDelEncargado): { principal: string | null; respaldo: string | null } {
  const v = (x: string | null | undefined) => (x ?? "").trim() || null;
  const cse = v(p.cse_encargado) ?? v(p.csl_encargado);
  const prop = v(p.hubspot_owner_id);
  return { principal: cse ?? prop, respaldo: cse && prop !== cse ? prop : null };
}

async function main() {
  const hs = await getSystemHubspotClient();
  // Los owners vivos: lo mismo que devuelve `/crm/v3/owners/{id}` (un owner archivado no trae correo).
  const correos = new Map<string, string>();
  const r = await hs.apiRequest({ method: "GET", path: "/crm/v3/owners?limit=500" });
  // Sin esta lista todos los correos dan «nadie» por igual y el simulacro diría «ninguna cuenta cambia»: mejor no decir nada.
  if (!r.ok) throw new Error(`No se pudo leer la lista de owners de HubSpot (${r.status}). No se mide ni se escribe nada.`);
  for (const o of ((await r.json()) as { results?: { id: string; email?: string }[] }).results ?? []) {
    if (o.email) correos.set(o.id, o.email.trim().toLowerCase());
  }
  if (correos.size === 0) throw new Error("HubSpot devolvió la lista de owners vacía. No se mide ni se escribe nada.");
  const correoDe = (d: { principal: string | null; respaldo: string | null }) =>
    (d.principal ? correos.get(d.principal) : undefined) ?? (d.respaldo ? correos.get(d.respaldo) : undefined) ?? null;
  const tecnicos = await correosDelEquipoTecnico();
  /** El correo con la regla de hoy, con la misma función que el espejo. */
  const correoDeHoy = (pr: PropiedadesDelEncargado, deCs: boolean) =>
    ownerQueSeGuarda(candidatosDelProyecto(pr).map((id) => ({ id, name: null, email: correos.get(id) ?? null })), { deCs, tecnicos })?.email ?? null;

  const todos = await prisma.project.findMany({
    where: { hubspotServiceId: { not: null } },
    select: { id: true, name: true, clientId: true, ...SELECT_PARA_EL_ENCARGADO, client: { select: { name: true } } },
  });
  const activos = todos.filter((p) => p.status === "active");
  const props = new Map<string, Record<string, string | null>>();
  const ids = activos.map((p) => p.hubspotServiceId!);
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${OBJETO_PROYECTOS}/batch/read`,
      body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })), properties: [PROP_PROPIETARIO, PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO] },
    });
    if (!res.ok) throw new Error(`No se pudieron leer los proyectos de HubSpot (${res.status}). No se mide ni se escribe nada.`);
    for (const x of ((await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] }).results ?? []) props.set(x.id, x.properties);
  }

  // ── Por proyecto ──
  const antes = new Map<string, string | null>();
  const ahora = new Map<string, string | null>();
  let distintoEnHubspot = 0;
  let sinPropietario = 0;
  const cambios: string[] = [];
  for (const p of activos) {
    const pr = props.get(p.hubspotServiceId!);
    if (!pr) continue;
    const prop = (pr[PROP_PROPIETARIO] ?? "").trim() || null;
    const cse = (pr[PROP_CSE_ENCARGADO] ?? "").trim() || (pr[PROP_CSL_ENCARGADO] ?? "").trim() || null;
    if (!prop) sinPropietario++;
    else if (prop !== cse) distintoEnHubspot++;
    const a = correoDe(duenoDeAntes(pr));
    const b = correoDeHoy(pr, esPipelineIdDeCs(p.hubspotPipelineId));
    antes.set(p.id, a);
    ahora.set(p.id, b);
    if (a !== b) cambios.push(`  ${esProyectoDePipelineCS(p) ? "CS  " : "otro"} · ${p.client.name} · «${p.name}»: ${a ?? "(nadie)"} → ${b ?? "(nadie)"}`);
  }
  console.log(`Proyectos activos con registro en HubSpot: ${activos.length} (leídos: ${props.size}).`);
  console.log(`  Propietario distinto de «CSE Encargado» en HubSpot: ${distintoEnHubspot} · sin propietario (manda el CSE Encargado): ${sinPropietario}.`);
  console.log(`\nProyectos que cambian de encargado en Nexus (${cambios.length}):`);
  console.log(cambios.sort().join("\n") || "  ninguno");

  // ── Por cuenta ──
  const equipo = await nombresDelEquipo();
  const conCorreo = (ps: typeof todos, m: Map<string, string | null>) =>
    ps.filter((p) => p.status === "active").map((p) => proyectoQueLleva({ ...p, hubspotOwnerEmail: m.has(p.id) ? m.get(p.id)! : p.hubspotOwnerEmail }));
  const clientes = [...new Set(activos.map((p) => p.clientId))];
  const afectados = clientes.filter((c) => activos.some((p) => p.clientId === c && antes.get(p.id) !== ahora.get(p.id)));
  const cuentas: string[] = [];
  for (const c of clientes) {
    const ps = todos.filter((p) => p.clientId === c);
    const a = encargadoDeLaCuenta(conCorreo(ps, antes), equipo.deBaja, equipo.nombres);
    const b = encargadoDeLaCuenta(conCorreo(ps, ahora), equipo.deBaja, equipo.nombres);
    if (a.email !== b.email) cuentas.push(`  ${ps[0].client.name}: ${a.nombre ?? a.deBaja ?? "sin encargado"} → ${b.nombre ?? (b.deBaja ? `sin encargado (era de ${b.deBaja}, de baja)` : "sin encargado")}`);
  }
  console.log(`\nCuentas que cambian de encargado (${cuentas.length}):`);
  console.log(cuentas.sort().join("\n") || "  ninguna");

  // ── Acceso: solo quien no ve toda la cartera depende de ser dueño de un proyecto ──
  const personas = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { id: true, email: true, name: true, roleEnum: true, permissionOverrides: true, canViewAllClients: true, canViewAllExpiresAt: true },
  });
  const asignaciones = await prisma.clientAssignment.findMany({ select: { clientId: true, kind: true, teamMemberId: true, targetRole: true } });
  const accesos: string[] = [];
  for (const tm of personas) {
    if (await veTodaLaCartera(tm)) continue;
    const e = tm.email.toLowerCase();
    const abre = (c: string, m: Map<string, string | null>) => {
      const a = asignaciones.filter((x) => x.clientId === c && (x.teamMemberId === tm.id || x.targetRole === tm.roleEnum));
      if (a.some((x) => x.kind === "REVOKE")) return false;
      if (a.some((x) => x.kind === "GRANT")) return true;
      return todos.some((p) => p.clientId === c && esProyectoDePipelineCS(p) && ((m.has(p.id) ? m.get(p.id) : p.hubspotOwnerEmail) ?? "").toLowerCase() === e);
    };
    const nombre = (c: string) => todos.find((p) => p.clientId === c)!.client.name;
    const seAbre = afectados.filter((c) => !abre(c, antes) && abre(c, ahora)).map(nombre);
    const seCierra = afectados.filter((c) => abre(c, antes) && !abre(c, ahora)).map(nombre);
    if (seAbre.length || seCierra.length) accesos.push(`  ${tm.name} (${tm.roleEnum}): se le abre ${seAbre.join(", ") || "—"} · se le cierra ${seCierra.join(", ") || "—"}`);
  }
  console.log(`\nAcceso que cambia (solo cuenta quien no ve toda la cartera):`);
  console.log(accesos.join("\n") || "  nadie");

  if (!APPLY) {
    console.log(`\nSimulacro: no se escribió nada. Con --apply se sincronizan ${afectados.length} cuenta(s) (después del deploy).`);
    return;
  }
  for (const c of afectados) {
    const s = await syncProjectsForClient(c, { force: true });
    console.log(`  ${todos.find((p) => p.clientId === c)!.client.name}: ${s.errors[0] ?? `${s.updated} actualizados${s.omitido ? ` (${s.omitido})` : ""}`}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
