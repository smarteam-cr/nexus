/**
 * scripts/pase-de-cuenta.ts — lo abierto que cambia de manos cuando cambia quien lleva una cuenta (2026-10-19).
 *
 * Desde ese día el pase (la celda «CSE encargado») y la sincronización, cuando ve que el encargado cambió en HubSpot,
 * mueven al encargado nuevo lo que el anterior tenía POR LLEVAR la cuenta (lib/cuentas/pase-server.ts): las tareas de
 * seguimiento, el siguiente paso de CS y las rutinas del servicio (con su evento «pasó de X a Y»), los avisos sin leer
 * de la cuenta y las alertas que ya había visto. Este script lo mide hacia atrás y lo aplica a mano a UNA cuenta.
 *
 * MEDIR (simulacro, solo lee la base y HubSpot): las cuentas cuyo encargado cambió en los últimos N días (la historia
 * de «CSE Encargado» y «CSL Encargado» de sus proyectos de CS activos, en HubSpot) y cuánto se movería hoy en cada una.
 *   npx tsx scripts/pase-de-cuenta.ts [--dias 30]
 *
 * UNA CUENTA (simulacro, y con --apply escribe por los escritores de cada módulo):
 *   npx tsx scripts/pase-de-cuenta.ts --cliente <clientId> --de <correo> --a <correo> --firma <correo>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/pase-de-cuenta.ts --cliente … --de … --a … --firma … --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Deshacer: el respaldo de backups/<fecha>-pase-de-cuenta/ (el comando con --de y --a al revés no es exacto: también
 * movería lo que la persona nueva ya llevaba como encargada, y no devuelve la semana ni la agenda de antes).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { encargadoEnLaFecha, type ValorEnElTiempo } from "@/lib/hubspot/encargados";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { planDelPase, planExplicito, paresDelPase, type ProyectoDelPase } from "@/lib/cuentas/pase";
import { fotoParaElPase, pasarLoDeLaCuenta, quienesSiguen, type ResumenDelPase } from "@/lib/cuentas/pase-server";
import { nombresDelEquipo } from "@/lib/cuentas/encargado-server";

const APPLY = resolverApply({ tablas: ["Tarea", "TareaEvento", "Aviso", "CsAlert"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function contar(r: ResumenDelPase): string {
  const porQue = new Map<string, number>();
  for (const t of r.tareas) porQue.set(t.porQue, (porQue.get(t.porQue) ?? 0) + 1);
  const detalle = [...porQue].map(([k, n]) => `${n} ${k}`).join(", ");
  return `${r.tareas.length} tareas${detalle ? ` (${detalle})` : ""}${r.fusionadas ? `, ${r.fusionadas} juntadas` : ""} · ${r.avisos} avisos · ${r.alertas} alertas vistas`;
}

async function unaCuenta(clientId: string, de: string, a: string, firma: string) {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!cliente) throw new Error(`No existe el cliente ${clientId}.`);
  const destino = await prisma.teamMember.findUnique({ where: { email: a.toLowerCase() }, select: { name: true, deactivatedAt: true } });
  if (!destino || destino.deactivatedAt) throw new Error(`${a} no está en el equipo activo.`);
  const plan = planExplicito([de], a, await quienesSiguen(clientId));
  const simulado = await pasarLoDeLaCuenta({ clientId, plan, porEmail: firma, motivo: "pase", simular: true });
  console.log(`\n${cliente.name}: de ${de} a ${a}`);
  console.log(`  Se movería: ${contar(simulado)}`);
  for (const t of simulado.tareas) console.log(`   · T-${t.numero} «${t.titulo}» (${t.porQue})`);
  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Con --apply (y ALLOW_PROD_WRITE=1) se aplica.");
    return;
  }
  const r = await pasarLoDeLaCuenta({ clientId, plan, porEmail: firma, motivo: "pase" });
  console.log(`\n✓ Aplicado: ${contar(r)}${r.noSePudieron ? ` · ${r.noSePudieron} cambiaron mientras tanto y quedaron como estaban` : ""}.`);
}

async function medir(dias: number) {
  const hs = await getSystemHubspotClient();
  const { porOwner } = await leerDuenos(hs);
  const correoDe = (owner: string | null) => (owner ? (porOwner.get(owner)?.email ?? null) : null);
  const desde = new Date(Date.now() - dias * 86_400_000);
  const equipo = await nombresDelEquipo();

  const proyectos = await prisma.project.findMany({
    where: { status: "active", hubspotServiceId: { not: null }, ...PROYECTO_DE_PIPELINE_CS_WHERE },
    select: { id: true, clientId: true, hubspotServiceId: true, client: { select: { name: true } } },
  });
  const antesPorCliente = new Map<string, Map<string, string | null>>();
  let sinLeer = 0;
  for (const p of proyectos) {
    const res = await hs
      .apiRequest({ method: "GET", path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${p.hubspotServiceId}?propertiesWithHistory=cse_encargado,csl_encargado` })
      .catch(() => null);
    if (!res || !res.ok) {
      sinLeer++;
      continue;
    }
    const d = (await res.json()) as { propertiesWithHistory?: { cse_encargado?: ValorEnElTiempo[]; csl_encargado?: ValorEnElTiempo[] } };
    const owner = encargadoEnLaFecha({ cse: d.propertiesWithHistory?.cse_encargado, csl: d.propertiesWithHistory?.csl_encargado }, desde);
    const m = antesPorCliente.get(p.clientId) ?? new Map<string, string | null>();
    m.set(p.id, correoDe(owner));
    antesPorCliente.set(p.clientId, m);
  }
  if (sinLeer) console.log(`No se pudo leer la historia de ${sinLeer} proyecto(s) en HubSpot.`);

  const nombre = new Map(proyectos.map((p) => [p.clientId, p.client.name]));
  let cuentas = 0;
  const total: ResumenDelPase = { tareas: [], fusionadas: 0, noSePudieron: 0, avisos: 0, alertas: 0 };
  console.log(`\nCuentas cuyo encargado cambió en los últimos ${dias} días (según HubSpot), y lo que se movería hoy:`);
  for (const [clientId, antesDe] of antesPorCliente) {
    if (/wherex/i.test(nombre.get(clientId) ?? "")) continue; // el cliente de prueba de Nexus
    const despues = await fotoParaElPase(clientId);
    const antes: ProyectoDelPase[] = despues.map((p) => (antesDe.has(p.id) ? { ...p, email: antesDe.get(p.id) ?? null } : p));
    const plan = planDelPase(antes, despues, { deBaja: equipo.deBaja });
    const pares = paresDelPase(plan);
    if (pares.length === 0) continue;
    cuentas++;
    const r = await pasarLoDeLaCuenta({ clientId, plan, porEmail: null, motivo: "hubspot", simular: true });
    total.tareas.push(...r.tareas);
    total.avisos += r.avisos;
    total.alertas += r.alertas;
    console.log(`  · ${nombre.get(clientId)} (${clientId}): ${pares.map((x) => `${x.de} → ${x.a}`).join(", ")} — ${contar(r)}`);
  }
  console.log(`\nTotal: ${cuentas} cuentas · ${contar(total)}.`);
  console.log("Simulacro: no se escribió nada. Para aplicar a una cuenta: --cliente --de --a --firma (ver el encabezado).");
}

async function main() {
  const cliente = arg("cliente");
  if (cliente) {
    const de = arg("de");
    const a = arg("a");
    const firma = arg("firma");
    if (!de || !a || !firma) throw new Error("Faltan --de, --a o --firma.");
    await unaCuenta(cliente, de, a, firma);
    return;
  }
  if (APPLY) throw new Error("--apply solo vale con --cliente: la medición no escribe.");
  await medir(Number(arg("dias") ?? 30) || 30);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
