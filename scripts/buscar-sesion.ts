/**
 * scripts/buscar-sesion.ts  (READ-ONLY)
 *
 * Busca reuniones por TÍTULO en toda la base, sin importar a qué cliente quedaron atribuidas, y
 * muestra lo que decide su dueño: participantes (y sus dominios), organizador, cliente resuelto,
 * dueño manual, vínculos a proyectos y si tiene contenido.
 *
 * Sirve para contestar «¿por qué esta reunión no aparece en el cliente?»: si la reunión existe pero
 * `resolvedClientId` apunta a otro lado (o a nadie), el problema es la atribución, no el proyecto.
 *
 * Uso:
 *   npx tsx scripts/buscar-sesion.ts "handoff] CAV"
 */
import { createScriptDb } from "./lib/db";

const TEXTO = process.argv[2] ?? "";

const dia = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
const dominio = (email: string): string => (email.split("@")[1] ?? email).toLowerCase();

async function main() {
  if (!TEXTO.trim()) {
    console.error('Uso: npx tsx scripts/buscar-sesion.ts "<parte del título>"');
    process.exit(1);
  }
  const { prisma, close } = createScriptDb();
  try {
    const sesiones = await prisma.firefliesSession.findMany({
      where: { title: { contains: TEXTO, mode: "insensitive" } },
      orderBy: { date: "desc" },
      take: 20,
      select: {
        id: true, title: true, date: true, source: true, organizerEmail: true, participants: true,
        resolvedClientId: true, manualClientId: true, enrichedAt: true, googleDocId: true,
        projects: {
          select: {
            isPrimary: true, source: true, included: true, handoffOverride: true, confidence: true,
            project: { select: { name: true, clientId: true } },
          },
        },
      },
    });
    console.log(`Reuniones con «${TEXTO}» en el título: ${sesiones.length}`);
    if (sesiones.length === 0) return;

    const idsClientes = [
      ...new Set(sesiones.flatMap((s) => [s.resolvedClientId, s.manualClientId]).filter((x): x is string => !!x)),
    ];
    const clientes = await prisma.client.findMany({
      where: { id: { in: idsClientes } },
      select: { id: true, name: true },
    });
    const nombre = new Map(clientes.map((c) => [c.id, c.name]));
    const conContenido = new Set(
      (
        await prisma.firefliesSession.findMany({
          where: { id: { in: sesiones.map((s) => s.id) }, transcript: { not: null } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );

    for (const s of sesiones) {
      const porDominio = new Map<string, number>();
      for (const p of s.participants) porDominio.set(dominio(p), (porDominio.get(dominio(p)) ?? 0) + 1);
      console.log("\n────────────────────────────────────────────────────────────");
      console.log(`«${s.title}»  [${s.id}]`);
      console.log(`  fecha: ${dia(s.date)} UTC · fuente: ${s.source} · organizador: ${s.organizerEmail ?? "—"}`);
      console.log(`  participantes: ${s.participants.length} · por dominio: ${[...porDominio.entries()].map(([d, n]) => `${d}×${n}`).join(", ") || "—"}`);
      console.log(`  cliente resuelto: ${s.resolvedClientId ? `${nombre.get(s.resolvedClientId) ?? "?"} [${s.resolvedClientId}]` : "NINGUNO (sin dueño)"}`);
      console.log(`  dueño manual: ${s.manualClientId ? `${nombre.get(s.manualClientId) ?? "?"} [${s.manualClientId}]` : "—"}`);
      console.log(`  contenido: transcript ${conContenido.has(s.id) ? "sí" : "no"} · doc de Meet ${s.googleDocId ? "sí" : "no"} · enriquecida ${dia(s.enrichedAt)}`);
      if (s.projects.length === 0) console.log("  vínculos a proyectos: ninguno");
      for (const l of s.projects) {
        console.log(
          `  vínculo: «${l.project.name}» · ${l.isPrimary ? "primario" : `secundario${l.confidence != null ? ` ${l.confidence.toFixed(2)}` : ""}`}` +
            ` · ${l.source}${l.included ? "" : " · excluido (tombstone)"}${l.handoffOverride === false ? " · excluido del handoff" : l.handoffOverride === true ? " · forzado al handoff" : ""}`,
        );
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
