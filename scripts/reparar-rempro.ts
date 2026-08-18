/**
 * scripts/reparar-rempro.ts — la reparación de datos del incidente REMPRO (2026-08-18).
 *
 * ── QUÉ PASÓ ─────────────────────────────────────────────────────────────────
 * REMPRO nació PROSPECTO (entró por un caso de negocio) y nada la ascendió al venderle. El listado
 * de clientes abre en la pestaña «Clientes» y su buscador solo mira la pestaña abierta, así que
 * buscar "REMPRO" daba cero. Elías concluyó —razonablemente— que el proyecto no se había asociado,
 * y lo creó de nuevo. Quedaron DOS proyectos sobre el mismo trato: el primero muerto en
 * `pendiente_espejo`, el segundo `listo`.
 *
 * ⚠ El primero NO murió por chocar con el segundo: cuando falló (19:27:02) el handoff del segundo
 * todavía no existía (19:34:39, 7 min después) y hoy es el único con ese trato. Se rompió solo, y
 * la causa de ESE fallo sigue sin explicar. Este script limpia las consecuencias, no la causa.
 *
 * ── ORDEN OBLIGATORIO, Y POR QUÉ ─────────────────────────────────────────────
 * ⛔ Los vínculos de sesión se mudan ANTES de borrar. Las 3 reuniones que el CSE enganchó a mano
 * cuelgan del proyecto MUERTO; `SessionProject` cascadea al borrarlo. Borrar primero destruye el
 * único trabajo humano que hay en ese proyecto, y no se puede deshacer.
 *
 * Dry-run por defecto. `--apply` exige ALLOW_PROD_WRITE=1 (INV12).
 *   npx tsx --env-file=.env scripts/reparar-rempro.ts
 *   ALLOW_PROD_WRITE=1 npx tsx --env-file=.env scripts/reparar-rempro.ts --apply
 */
import { resolverApply } from "./lib/guard";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, mkdirSync } from "node:fs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }),
});

const CLIENTE = "cmsqdfqie001807pgl27goq22"; // REMPRO
const MUERTO = "cmsz1xpoc00lt07qql2g4ywgs"; // el que quedó en pendiente_espejo
const BUENO = "cmsz2afyp00o807qqh01jk1ml"; // el que quedó listo, con handoff
const SESION_HANDOFF = "gmeet_3qh2querqilsuod6rpdi7pnrlr_20260818T160000Z";

async function main() {
  const apply = resolverApply();

  // ── Preflight: nada se toca si el estado no es EXACTAMENTE el diagnosticado ────────────
  const [muerto, bueno, cliente] = await Promise.all([
    prisma.project.findUnique({
      where: { id: MUERTO },
      select: { id: true, name: true, altaEstado: true, hubspotServiceId: true, hermanoCsProjectId: true },
    }),
    prisma.project.findUnique({
      where: { id: BUENO },
      select: { id: true, name: true, altaEstado: true, hubspotServiceId: true },
    }),
    prisma.client.findUnique({
      where: { id: CLIENTE },
      select: { id: true, name: true, kind: true, ignoredHubspotServiceIds: true },
    }),
  ]);

  const problemas: string[] = [];
  if (!cliente) problemas.push("el cliente REMPRO no existe");
  if (!muerto) problemas.push("el proyecto a borrar no existe (¿ya se borró?)");
  if (!bueno) problemas.push("el proyecto bueno no existe");
  if (muerto && muerto.altaEstado !== "pendiente_espejo")
    problemas.push(`el proyecto a borrar YA NO está en pendiente_espejo (está en "${muerto.altaEstado}") — el estado cambió desde el diagnóstico`);
  if (bueno && bueno.altaEstado !== "listo")
    problemas.push(`el proyecto bueno YA NO está listo (está en "${bueno.altaEstado}")`);
  if (muerto?.hermanoCsProjectId)
    problemas.push("el proyecto a borrar tiene un hermano colgado — eso no estaba en el diagnóstico, revisar a mano");
  if (problemas.length) {
    console.error("\n⛔ ABORTADO — el estado no es el diagnosticado:");
    for (const p of problemas) console.error(`   · ${p}`);
    process.exit(1);
  }

  // Un hermano apuntando al muerto dejaría de facturar en silencio (el criterio de cobranza
  // exige `hermanoCsProjectId` vacío, y un puntero muerto no está vacío).
  const hermanosDelMuerto = await prisma.project.count({ where: { hermanoCsProjectId: MUERTO } });

  const links = await prisma.sessionProject.findMany({
    where: { projectId: MUERTO },
    select: { sessionId: true, included: true, session: { select: { title: true } } },
  });
  const yaEnBueno = new Set(
    (await prisma.sessionProject.findMany({ where: { projectId: BUENO }, select: { sessionId: true } })).map((l) => l.sessionId),
  );
  const aMudar = links.filter((l) => !yaEnBueno.has(l.sessionId));

  const sesion = await prisma.firefliesSession.findUnique({
    where: { id: SESION_HANDOFF },
    select: { id: true, title: true, resolvedClientId: true, manualClientId: true },
  });

  console.log(`\n═══ CLIENTE ${cliente!.name} ═══`);
  console.log(`  kind: ${cliente!.kind}${cliente!.kind === "PROSPECTO" ? "  → CLIENTE" : "  (ya está, no se toca)"}`);
  console.log(`\n═══ VÍNCULOS DE SESIÓN a mudar del muerto al bueno ═══`);
  if (aMudar.length === 0) console.log("  (ninguno)");
  for (const l of aMudar) console.log(`  · "${l.session.title}" (included: ${l.included})`);
  const yaEstaban = links.length - aMudar.length;
  if (yaEstaban > 0) console.log(`  (${yaEstaban} ya estaban también en el bueno — no se duplican)`);

  console.log(`\n═══ PROYECTO A BORRAR ═══`);
  console.log(`  ${muerto!.name} · ${muerto!.id}`);
  console.log(`  hubspotServiceId ${muerto!.hubspotServiceId} → se agrega a ignorados para que el sync NO lo recree`);
  console.log(`  hermanos colgando: ${hermanosDelMuerto} (se nulean; un puntero muerto los saca de cobranza en silencio)`);

  console.log(`\n═══ SESIÓN HUÉRFANA ═══`);
  if (!sesion) console.log("  ⚠ no encontrada");
  else if (sesion.manualClientId) console.log(`  "${sesion.title}" ya tiene dueño manual — no se toca`);
  else console.log(`  "${sesion.title}" → manualClientId = REMPRO`);

  if (!apply) {
    console.log("\n(dry-run — nada se escribió. Repetí con --apply y ALLOW_PROD_WRITE=1)");
    await prisma.$disconnect();
    return;
  }

  // ── Respaldo antes de lo irreversible ─────────────────────────────────────────────────
  const respaldo = {
    respaldadoEn: new Date().toISOString(),
    motivo: "reparar-rempro: antes de borrar el proyecto duplicado",
    cliente,
    proyectoBorrado: await prisma.project.findUnique({ where: { id: MUERTO } }),
    canvasesDelBorrado: await prisma.projectCanvas.findMany({ where: { projectId: MUERTO } }),
    vinculosDeSesion: links,
  };
  mkdirSync("backups", { recursive: true });
  const destino = "backups/2026-08-18-rempro-proyecto-duplicado.json";
  writeFileSync(destino, JSON.stringify(respaldo, null, 2), "utf8");
  console.log(`\n→ respaldo escrito: ${destino}`);

  await prisma.$transaction(async (tx) => {
    // 1. Los vínculos de sesión se MUDAN primero (el borrado los cascadearía).
    for (const l of aMudar) {
      await tx.sessionProject.updateMany({
        where: { sessionId: l.sessionId, projectId: MUERTO },
        data: { projectId: BUENO },
      });
    }
    // 2. El resto de los vínculos (los que ya estaban en el bueno) se van con el borrado.
    // 3. Suprimir el re-sync ANTES de borrar (el flag no puede vivir en el Project que se elimina).
    if (muerto!.hubspotServiceId && !cliente!.ignoredHubspotServiceIds.includes(muerto!.hubspotServiceId)) {
      await tx.client.update({
        where: { id: CLIENTE },
        data: { ignoredHubspotServiceIds: { push: muerto!.hubspotServiceId } },
      });
    }
    // 4. Liberar hermanos (plata: un puntero muerto los saca de cobranza sin avisar).
    await tx.project.updateMany({ where: { hermanoCsProjectId: MUERTO }, data: { hermanoCsProjectId: null } });
    // 5. Borrar.
    await tx.project.delete({ where: { id: MUERTO } });
    // 6. Ascender el prospecto. `updateMany` con el kind en el WHERE: es no-op si ya es CLIENTE,
    //    ALIADO o INTERNO. La regla «nunca al revés» vive en el where, no en un if.
    await tx.client.updateMany({ where: { id: CLIENTE, kind: "PROSPECTO" }, data: { kind: "CLIENTE" } });
  });

  /* 7. La reunión de handoff, que es 100% interna y por eso nadie pudo atribuir.
     ⚠ Va POR EL CHOKEPOINT y FUERA de la transacción. La primera versión de este script escribía
     `manualClientId` a mano adentro del `$transaction`, y la guarda de `duenio-manual.test.ts` la
     cazó: el sello quedaba sin procedencia (quién y cuándo), que es exactamente lo que esa columna
     vino a resolver. `asignarDuenioManual` escribe los cuatro campos juntos o ninguno. */
  if (sesion && !sesion.manualClientId) {
    await asignarDuenioManual(SESION_HANDOFF, CLIENTE, {
      origen: "humano",
      actorEmail: "egonzalez@smarteamcr.com",
    });
  }

  console.log("\n✓ aplicado. Estado final:");
  const final = await prisma.client.findUnique({
    where: { id: CLIENTE },
    select: { name: true, kind: true, ignoredHubspotServiceIds: true, projects: { select: { id: true, name: true, altaEstado: true } } },
  });
  console.log(JSON.stringify(final, null, 2));
  await prisma.$disconnect();
}

main();
