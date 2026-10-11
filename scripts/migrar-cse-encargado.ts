/**
 * scripts/migrar-cse-encargado.ts — «CSE Encargado» pasa a ser el CSE de la cuenta y «CSL Encargado», la CSL
 * (2026-10-09, entrega 5 de docs/exito-del-cliente-cartera-plan.md; decisión de Elías del 2026-10-07).
 *
 * Hasta hoy «CSL Encargado» (`csl_encargado`) guardaba al CSE en los proyectos y «CSE Encargado» (`cse_encargado`)
 * estaba vacío. El espejo YA lee primero `cse_encargado` y, si está vacío, `csl_encargado`
 * (lib/hubspot/encargados.ts): por eso este script no le cambia a nadie las cuentas que ve. En orden:
 *
 *   1. Proyectos de IMPLEMENTACIÓN con «CSE Encargado» vacío: copia «CSL Encargado» → «CSE Encargado».
 *   2. Esos mismos proyectos: «CSL Encargado» = la CSL del equipo (rol CSL en Nexus).
 *      ⛔ Desarrollo y Sitios web NO se tocan: ahí «CSL Encargado» es el encargado técnico.
 *   3. La EMPRESA de cada uno y sus CONTACTOS: «CSE Encargado» = el CSE (el que más proyectos lleva en ella) y
 *      «CSL Encargado» = la CSL.
 *   4. Verifica, antes de escribir, que el encargado que lee el espejo de cada proyecto sea el mismo antes y
 *      después. Si alguno cambiaría, NO escribe nada.
 *
 * ⚠ ANTES de correrlo con --apply: el deploy que lee «CSE Encargado» tiene que estar en producción, y alguien con
 *   acceso de administrador tiene que revisar en HubSpot si algún workflow, reporte o vista usa «CSL Encargado» de
 *   los proyectos (después del paso 2 dice la CSL, no el CSE).
 *
 * En seco por defecto (solo lee HubSpot). Escribir:
 *   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-cse-encargado.ts --apply
 * Solo escribe en HubSpot; la base de Nexus se pone al día con el sync de proyectos de cada cliente.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { encargadoDelProyecto, PROP_CSE_ENCARGADO, PROP_CSL_ENCARGADO } from "@/lib/hubspot/encargados";
import { contactosDeLaEmpresa, escribirEncargadosEnLaEmpresa, laCsl } from "@/lib/hubspot/encargados-de-la-cuenta";
import { resolverOwnerIdPorEmail } from "@/lib/hubspot/project-record";
import { pipelineByKey } from "@/lib/projects/kind";

// Escribe solo en HubSpot: no hay tabla de la base que respaldar (el guard lo dice al correr).
const APPLY = resolverApply({ tablas: [] });

type Hs = Awaited<ReturnType<typeof getSystemHubspotClient>>;
interface Proyecto {
  id: string;
  nombre: string;
  pipeline: string | null;
  cse: string | null;
  csl: string | null;
}

async function pedir<T>(hs: Hs, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await hs.apiRequest({ method, path, ...(body ? { body } : {}) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function todosLosProyectos(hs: Hs): Promise<Proyecto[]> {
  const out: Proyecto[] = [];
  let after: string | undefined;
  for (let pagina = 0; pagina < 30; pagina++) {
    const qs = new URLSearchParams({ limit: "100", properties: `hs_name,hs_pipeline,${PROP_CSE_ENCARGADO},${PROP_CSL_ENCARGADO}`, ...(after ? { after } : {}) });
    const data = await pedir<{ results?: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after?: string } } }>(
      hs,
      "GET",
      `/crm/v3/objects/${OBJETO_PROYECTOS}?${qs.toString()}`,
    );
    for (const r of data.results ?? []) {
      out.push({
        id: r.id,
        nombre: r.properties.hs_name ?? r.id,
        pipeline: r.properties.hs_pipeline ?? null,
        cse: (r.properties[PROP_CSE_ENCARGADO] ?? "").trim() || null,
        csl: (r.properties[PROP_CSL_ENCARGADO] ?? "").trim() || null,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

async function empresasDe(hs: Hs, proyectoIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < proyectoIds.length; i += 100) {
    const lote = proyectoIds.slice(i, i + 100);
    const data = await pedir<{ results?: { from: { id: string }; to?: { toObjectId: string | number }[] }[] }>(
      hs,
      "POST",
      `/crm/v4/associations/${OBJETO_PROYECTOS}/companies/batch/read`,
      { inputs: lote.map((id) => ({ id })) },
    );
    for (const r of data.results ?? []) out.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)));
  }
  return out;
}

async function main() {
  console.log(APPLY ? "APLICANDO en HubSpot…\n" : "EN SECO (no escribe nada). Para escribir: --apply con ALLOW_PROD_WRITE=1\n");
  const hs = await getSystemHubspotClient();
  const impl = pipelineByKey("customer-success").hubspotPipelineId;

  const csl = await laCsl();
  if (!csl) throw new Error("No hay una CSL activa en el equipo de Nexus: no se sabe a quién poner en «CSL Encargado».");
  const cslId = await resolverOwnerIdPorEmail(hs, csl.email);
  if (!cslId) throw new Error(`${csl.nombre} (${csl.email}) no tiene usuario en HubSpot.`);
  console.log(`La CSL: ${csl.nombre} (owner ${cslId}).`);

  const proyectos = await todosLosProyectos(hs);
  const deImpl = proyectos.filter((p) => p.pipeline === impl);
  console.log(`Proyectos en HubSpot: ${proyectos.length} · de implementación: ${deImpl.length}.`);

  // 1 y 2: lo que quedaría en cada proyecto de implementación.
  const plan = deImpl.map((p) => {
    const cse = p.cse ?? p.csl; // «CSE Encargado» vacío → lo que tenía «CSL Encargado» (el CSE de hoy)
    return { p, despues: { cse, csl: cse ? cslId : p.csl } };
  });

  // 4: el encargado que lee el espejo no puede cambiar.
  const cambiarian = plan.filter(({ p, despues }) => encargadoDelProyecto({ cse_encargado: p.cse, csl_encargado: p.csl }) !== encargadoDelProyecto({ cse_encargado: despues.cse, csl_encargado: despues.csl }));
  if (cambiarian.length > 0) {
    console.error(`⛔ ${cambiarian.length} proyecto(s) cambiarían de encargado. No se escribe nada:`);
    for (const { p } of cambiarian) console.error(`   · ${p.nombre} (${p.id})`);
    process.exit(1);
  }

  const aEscribir = plan.filter(({ p, despues }) => despues.cse && (p.cse !== despues.cse || p.csl !== despues.csl));
  const sinEncargado = plan.filter(({ despues }) => !despues.cse);
  console.log(`\n1-2 · Proyectos de implementación a escribir: ${aEscribir.length}. Sin ningún encargado (no se tocan): ${sinEncargado.length}.`);
  for (const { p, despues } of aEscribir.slice(0, 200)) {
    console.log(`   · ${p.nombre}: CSE ${p.cse ?? "(vacío)"} → ${despues.cse} · CSL ${p.csl ?? "(vacío)"} → ${despues.csl}`);
  }

  // 3: la empresa de cada proyecto, con el CSE que más proyectos lleva en ella.
  const empresas = await empresasDe(hs, plan.filter(({ despues }) => despues.cse).map(({ p }) => p.id));
  const csePorEmpresa = new Map<string, Map<string, number>>();
  for (const { p, despues } of plan) {
    if (!despues.cse) continue;
    for (const emp of empresas.get(p.id) ?? []) {
      const m = csePorEmpresa.get(emp) ?? new Map<string, number>();
      m.set(despues.cse, (m.get(despues.cse) ?? 0) + 1);
      csePorEmpresa.set(emp, m);
    }
  }
  const porEmpresa = [...csePorEmpresa.entries()].map(([emp, m]) => [emp, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]] as const);
  let contactosEnTotal = 0;
  for (const [emp] of porEmpresa) contactosEnTotal += (await contactosDeLaEmpresa(hs, emp).catch(() => [])).length;
  console.log(`\n3 · Empresas a escribir: ${porEmpresa.length} (con ${contactosEnTotal} contactos).`);

  // Cómo queda en Nexus: los clientes de esas empresas (para el sync de después).
  const clientes = await prisma.client.findMany({ where: { hubspotCompanyId: { in: porEmpresa.map(([e]) => e) } }, select: { id: true, name: true } });
  console.log(`   Clientes de Nexus de esas empresas: ${clientes.length}.`);

  if (!APPLY) {
    console.log("\nEn seco: nada se escribió. Revisa la lista y corre con --apply.");
    return;
  }

  // Escribir: proyectos en lotes de 100, después empresas y contactos.
  for (let i = 0; i < aEscribir.length; i += 100) {
    const lote = aEscribir.slice(i, i + 100);
    await pedir(hs, "POST", `/crm/v3/objects/${OBJETO_PROYECTOS}/batch/update`, {
      inputs: lote.map(({ p, despues }) => ({
        id: p.id,
        properties: { [PROP_CSE_ENCARGADO]: despues.cse!, [PROP_CSL_ENCARGADO]: despues.csl ?? "" },
      })),
    });
    console.log(`   ✓ proyectos ${i + 1}–${i + lote.length}`);
  }
  let fallidas = 0;
  for (const [emp, cse] of porEmpresa) {
    const r = await escribirEncargadosEnLaEmpresa(hs, emp, { cse, csl: cslId });
    if (!r.empresa || r.contactosFallidos > 0) {
      fallidas++;
      console.error(`   ⚠ empresa ${emp}: ${r.error ?? "no se pudo"} (${r.contactos} contactos escritos, ${r.contactosFallidos} fallidos)`);
    }
  }
  console.log(`\n✓ Listo. Empresas con algo que no entró: ${fallidas}. Corre el sync de proyectos (o espera el automático) para que Nexus lo lea.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
