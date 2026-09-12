/**
 * scripts/inspect-project-sessions.ts  (READ-ONLY)
 *
 * Para los clientes cuyo nombre contiene <término>: a qué proyecto quedó vinculada cada
 * reunión reciente, con qué fuerza (primaria / secundaria con su confianza / forzada o
 * excluida a mano / tombstone), y si HOY alimenta el handoff — con la MISMA regla que pinta
 * la columna «Google Meet» del Contexto del proyecto
 * (app/api/projects/[projectId]/session-candidates: included && linkFeedsHandoff(classifyHandoffSession)).
 *
 * Sirve para contestar «¿por qué esta reunión no aparece en el proyecto?» sin adivinar:
 * o no está vinculada a ese proyecto, o está vinculada pero la regla del handoff la deja fuera.
 *
 * Uso:
 *   npx tsx scripts/inspect-project-sessions.ts "honda"
 *   npx tsx scripts/inspect-project-sessions.ts "honda" --dias 180
 */
import { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { classifyHandoffSession, linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import { PRESALES_EMAILS } from "@/lib/handoff/sales-presence";
import { belongsToClient, whereBelongsToClient } from "@/lib/sessions/project-sources";

const TERM = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";

function argValue(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dia = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  if (!TERM) {
    console.error('Uso: npx tsx scripts/inspect-project-sessions.ts "<término del cliente>" [--dias 120]');
    process.exit(1);
  }
  const dias = Number(argValue("--dias") ?? 120);
  const desde = new Date(Date.now() - dias * 86_400_000);
  const ahora = new Date();

  const { prisma, close } = createScriptDb();
  try {
    const clients = await prisma.client.findMany({
      where: { name: { contains: TERM, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (clients.length === 0) {
      console.log(`Sin clientes cuyo nombre contenga «${TERM}».`);
      return;
    }

    // Mismo criterio que lib/handoff/sales-presence.ts (área de ventas ∪ preventa técnica),
    // leído con el pool acotado del script en vez del cliente de runtime.
    const ventas = await prisma.teamMember.findMany({
      where: { area: { in: ["Sales", "Ventas"] } },
      select: { email: true },
    });
    const salesEmails = new Set(ventas.map((v) => v.email.toLowerCase()));
    for (const e of PRESALES_EMAILS) salesEmails.add(e);

    for (const client of clients) {
      const projects = await prisma.project.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, name: true, status: true, tags: true, createdAt: true, hubspotCreatedAt: true,
          hubspotServiceId: true, hubspotPipelineStageLabel: true, altaEstado: true, altaReclasificadoAt: true,
        },
      });
      const etiqueta = new Map(projects.map((p, i) => [p.id, `P${i + 1}`]));

      console.log(`\n══ ${client.name} [${client.id}] · ${projects.length} proyecto(s) ══`);
      for (const p of projects) {
        console.log(
          `  ${etiqueta.get(p.id)} «${p.name}» [${p.id}] · ${p.status}` +
            ` · HubSpot ${p.hubspotServiceId ?? "—"} etapa «${p.hubspotPipelineStageLabel ?? "—"}»` +
            ` · creado Nexus ${dia(p.createdAt)} / HubSpot ${dia(p.hubspotCreatedAt)}` +
            ` · alta ${p.altaEstado ?? "—"} reclasificado ${dia(p.altaReclasificadoAt)}` +
            ` · tags [${p.tags.join(", ")}]`,
        );
      }

      const links = await prisma.sessionProject.findMany({
        where: { projectId: { in: projects.map((p) => p.id) } },
        select: {
          projectId: true, isPrimary: true, source: true, confidence: true, handoffOverride: true,
          included: true, reviewedAt: true, createdAt: true, rationale: true,
          session: {
            select: {
              id: true, title: true, date: true, participants: true, organizerEmail: true,
              resolvedClientId: true, manualClientId: true,
            },
          },
        },
      });

      const alimenta = (l: (typeof links)[number]): boolean =>
        l.included &&
        belongsToClient(l.session, client.id) &&
        linkFeedsHandoff(
          { isPrimary: l.isPrimary, confidence: l.confidence, handoffOverride: l.handoffOverride },
          classifyHandoffSession(l.session.title, l.session.participants, l.session.organizerEmail, salesEmails).include,
        );

      console.log("\n  Resumen por proyecto (todos los vínculos, sin corte de fecha):");
      for (const p of projects) {
        const propios = links.filter((l) => l.projectId === p.id);
        const cruzados = propios.filter((l) => !belongsToClient(l.session, client.id)).length;
        console.log(
          `    ${etiqueta.get(p.id)}: ${propios.length} vínculo(s) · primarios ${propios.filter((l) => l.isPrimary).length}` +
            ` · alimentan la columna «Google Meet» ${propios.filter(alimenta).length}` +
            ` · excluidos a mano ${propios.filter((l) => l.handoffOverride === false).length}` +
            ` · tombstone ${propios.filter((l) => !l.included).length}` +
            (cruzados ? ` · ⚠ ${cruzados} de OTRO cliente` : ""),
        );
      }

      const recientes = await prisma.firefliesSession.findMany({
        where: { ...whereBelongsToClient(client.id), date: { gte: desde } },
        orderBy: { date: "desc" },
        select: { id: true, title: true, date: true, participants: true, organizerEmail: true },
      });
      const conContenido = new Set(
        (
          await prisma.firefliesSession.findMany({
            where: {
              id: { in: recientes.map((s) => s.id) },
              OR: [{ transcript: { not: null } }, { summary: { not: Prisma.DbNull } }],
            },
            select: { id: true },
          })
        ).map((s) => s.id),
      );

      console.log(
        `\n  Reuniones del cliente en los últimos ${dias} días: ${recientes.length}` +
          `\n  Leyenda: prim/sec(confianza) · ✅ alimenta la columna · · no alimenta · + forzada a mano · ✗ excluida a mano · ⊘ tombstone`,
      );
      for (const s of recientes) {
        const propios = links.filter((l) => l.session.id === s.id);
        const celdas = propios.length
          ? propios
              .map((l) => {
                const fuerza = l.isPrimary ? "prim" : `sec${l.confidence != null ? `(${l.confidence.toFixed(2)})` : ""}`;
                const marca = !l.included ? "⊘" : l.handoffOverride === false ? "✗" : alimenta(l) ? "✅" : "·";
                const forzada = l.handoffOverride === true ? "+" : "";
                return `${etiqueta.get(l.projectId)}:${fuerza}${forzada}${marca}[${l.source}${l.reviewedAt ? ",revisado" : ""},vinc ${dia(l.createdAt)}]`;
              })
              .join(" ")
          : "SIN VÍNCULO";
        const regla = classifyHandoffSession(s.title, s.participants, s.organizerEmail, salesEmails);
        console.log(
          `    ${dia(s.date)}${s.date > ahora ? " (futura)" : ""} ${conContenido.has(s.id) ? "   " : "∅  "}` +
            `${celdas.padEnd(60)} «${s.title}» — regla: ${regla.include ? "entra" : "no entra"} (${regla.reason})`,
        );
      }
      console.log("  (∅ = sin transcript ni resumen)");
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
