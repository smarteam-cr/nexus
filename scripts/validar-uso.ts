/**
 * scripts/validar-uso.ts — SOLO LECTURA. ¿Quién usa Nexus y para qué? (pasada de validación del 2026-10-19,
 * docs/validacion-2026-10-19.md › área 7). Complementa scripts/uso-de-nexus.ts (lo propuesto) con el latido de uso.
 *
 * De las últimas N semanas: por equipo y por persona, cuántos días entró, cuántas aperturas y las secciones que más usa
 * (`UsoDeNexus`, una fila por persona, sección y día); quién del equipo activo no entró; cuántos abrieron «Preparar una
 * reunión»; y los números base de los indicadores de éxito (adopción, uso de «Para ti», decisiones sobre lo que propone
 * Nexus, el costo de la IA). Imprime nombres del equipo (es interno), ninguno de un cliente.
 *
 *   npx tsx scripts/validar-uso.ts            # 14 días
 *   npx tsx scripts/validar-uso.ts --dias 7
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const iDias = process.argv.indexOf("--dias");
const DIAS = iDias > -1 ? Number(process.argv[iDias + 1]) || 14 : 14;

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { crDateParts } = await import("@/lib/jobs/time");
  const desde = new Date(Date.now() - DIAS * 86_400_000);
  const desdeDia = crDateParts(desde).dateKey;
  const filas = await prisma.usoDeNexus.findMany({ where: { dia: { gte: desdeDia } }, select: { personaEmail: true, seccion: true, dia: true, aperturas: true } });
  const equipo = await prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true, roleEnum: true, area: true } });
  const deEquipo = new Map(equipo.map((m) => [m.email.toLowerCase(), m]));
  const primerDia = filas.reduce<string | null>((a, f) => (!a || f.dia < a ? f.dia : a), null);
  console.log(`══ Uso desde ${desdeDia} (${DIAS} días) · primer día con latido en la ventana: ${primerDia ?? "ninguno"} · ${filas.length} filas`);

  const porPersona = new Map<string, { dias: Set<string>; aperturas: number; secciones: Map<string, number> }>();
  for (const f of filas) {
    const k = f.personaEmail.toLowerCase();
    const p = porPersona.get(k) ?? { dias: new Set(), aperturas: 0, secciones: new Map() };
    p.dias.add(f.dia);
    p.aperturas += f.aperturas;
    p.secciones.set(f.seccion, (p.secciones.get(f.seccion) ?? 0) + f.aperturas);
    porPersona.set(k, p);
  }
  const diasHabiles = new Set(filas.map((f) => f.dia)).size;
  const porRol = new Map<string, string[]>();
  for (const m of equipo) porRol.set(m.roleEnum, [...(porRol.get(m.roleEnum) ?? []), m.email.toLowerCase()]);
  for (const [rol, correos] of [...porRol].sort()) {
    console.log(`\n── ${rol} (${correos.length} personas)`);
    for (const c of correos.sort((a, b) => (deEquipo.get(a)!.name).localeCompare(deEquipo.get(b)!.name))) {
      const p = porPersona.get(c);
      const top = p ? [...p.secciones].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} ${n}`).join(", ") : "";
      console.log(`   ${deEquipo.get(c)!.name}: ${p ? `${p.dias.size} de ${diasHabiles} días · ${p.aperturas} aperturas · ${top}` : "NO ENTRÓ"}`);
    }
  }
  const fuera = [...porPersona.keys()].filter((k) => !deEquipo.has(k));
  if (fuera.length) console.log(`\n   (También entraron ${fuera.length} correos que no son del equipo activo)`);

  console.log("\n══ Por sección (aperturas · personas)");
  const porSeccion = new Map<string, { n: number; personas: Set<string> }>();
  for (const f of filas) {
    const s = porSeccion.get(f.seccion) ?? { n: 0, personas: new Set() };
    s.n += f.aperturas;
    s.personas.add(f.personaEmail.toLowerCase());
    porSeccion.set(f.seccion, s);
  }
  for (const [s, v] of [...porSeccion].sort((a, b) => b[1].n - a[1].n)) console.log(`   ${s}: ${v.n} · ${v.personas.size} personas`);

  // Indicadores base.
  const operativos = equipo.filter((m) => ["CSE", "CSL", "VENTAS", "DEV", "MARKETING"].includes(m.roleEnum)).map((m) => m.email.toLowerCase());
  const activosSemana = (dias: number) => {
    const d = crDateParts(new Date(Date.now() - dias * 86_400_000)).dateKey;
    return new Set(filas.filter((f) => f.dia >= d).map((f) => f.personaEmail.toLowerCase()));
  };
  const sem = activosSemana(7);
  const conParaTi = new Set(filas.filter((f) => f.seccion === "para-ti").map((f) => f.personaEmail.toLowerCase()));
  console.log("\n══ Indicadores base");
  console.log(`   Equipo operativo (CSE, CSL, Ventas, Dev, Marketing): ${operativos.length}; entraron los últimos 7 días: ${operativos.filter((c) => sem.has(c)).length}`);
  const diasPorOp = operativos.map((c) => porPersona.get(c)?.dias.size ?? 0);
  console.log(`   Días con uso por persona operativa (${DIAS} días): ${diasPorOp.sort((a, b) => a - b).join(", ")}`);
  console.log(`   Abrieron «Para ti»: ${operativos.filter((c) => conParaTi.has(c)).length} de ${operativos.length}`);
  const llm = await prisma.llmCall.aggregate({ where: { at: { gte: desde } }, _sum: { costUsd: true }, _count: true });
  console.log(`   Gasto de IA (${DIAS} días): US$${(llm._sum.costUsd ?? 0).toFixed(2)} en ${llm._count} llamadas`);
  const ai = await prisma.actionItem.aggregate({ _max: { createdAt: true }, where: { createdAt: { gte: desde } }, _count: true });
  console.log(`   ActionItem creados en la ventana: ${ai._count} (el último ${ai._max.createdAt?.toISOString() ?? "—"})`);
  const tareasDecididas = await prisma.tarea.groupBy({ by: ["decision"], where: { createdAt: { gte: desde }, sessionId: { not: null } }, _count: true });
  console.log(`   Tareas de reuniones por decisión: ${tareasDecididas.map((t) => `${t.decision ?? "—"} ${t._count}`).join(" · ")}`);
  const hechas = await prisma.tarea.count({ where: { completadaAt: { gte: desde } } });
  console.log(`   Tareas terminadas en la ventana: ${hechas}`);
  const minutasRevisadas = await prisma.sessionMinute.groupBy({ by: ["status"], where: { createdAt: { gte: desde } }, _count: true }).catch(() => []);
  console.log(`   Minutas por estado: ${minutasRevisadas.map((m) => `${m.status} ${m._count}`).join(" · ")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
