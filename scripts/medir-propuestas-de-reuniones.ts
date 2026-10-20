/**
 * scripts/medir-propuestas-de-reuniones.ts — qué propuestas de Tarea dejaron las reuniones con clientes y prospectos
 * (2026-10-19; DECISIONS «Pocos pendientes y esenciales de las reuniones con clientes»).
 *
 * Por reunión de los últimos N días (14 por defecto) que dejó propuestas desde la lectura de seguimiento: cuántas, para
 * quién, de qué lado (Smarteam o cliente) y cómo quedaron (propuesta, usada, descartada, vencida). Al final, el total y
 * cuántas propuestas repiten un TEMA que una persona ya descartó en la misma cuenta (lib/tareas/tema.ts).
 *
 * ⛔ SOLO LECTURA: la base se abre en solo lectura. Imprime los títulos de las propuestas (interno) y nada de las citas.
 *
 *   npx tsx scripts/medir-propuestas-de-reuniones.ts
 *   npx tsx scripts/medir-propuestas-de-reuniones.ts --dias 14 --cuenta "Cemaco,Honda,Total Finco" --titulos
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIAS = Number(arg("--dias") ?? 14);
const CUENTAS = (arg("--cuenta") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const TITULOS = process.argv.includes("--titulos");

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const desde = new Date(Date.now() - DIAS * 86_400_000);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · reuniones desde ${desde.toISOString().slice(0, 10)}\n`);

  const filas = await prisma.tarea.findMany({
    where: { origen: "reunion", creadaPorEmail: null, session: { date: { gte: desde } }, origenId: { contains: ":seg-" } },
    select: {
      id: true,
      numero: true,
      titulo: true,
      estado: true,
      decision: true,
      decididaPorEmail: true,
      lado: true,
      responsableEmail: true,
      equipo: true,
      origenId: true,
      clientId: true,
      client: { select: { name: true, kind: true } },
      session: { select: { id: true, title: true, date: true } },
    },
    orderBy: [{ session: { date: "asc" } }, { numero: "asc" }],
  });
  const enCuenta = (n: string | null | undefined) => !CUENTAS.length || CUENTAS.some((c) => (n ?? "").toLowerCase().includes(c));
  const tareas = filas.filter((f) => enCuenta(f.client?.name));

  const estadoDe = (t: (typeof tareas)[number]) => {
    if (t.estado === "propuesta") return "por decidir";
    // «Por asignar» nace abierta (pendiente) sin que nadie la haya usado todavía.
    if (!t.responsableEmail && t.estado === "pendiente") return "por asignar";
    if (t.estado === "vencida") return "vencida";
    if (t.estado === "rechazada" || t.estado === "fusionada") return t.decididaPorEmail && t.decididaPorEmail !== "sistema" ? "descartada" : "retirada";
    return "usada";
  };

  const porReunion = new Map<string, typeof tareas>();
  for (const t of tareas) {
    const k = t.session?.id ?? "?";
    porReunion.set(k, [...(porReunion.get(k) ?? []), t]);
  }
  const totales = { reuniones: 0, propuestas: 0, smarteam: 0, cliente: 0, porAsignar: 0, usada: 0, descartada: 0, vencida: 0, "por decidir": 0, "por asignar": 0, retirada: 0 } as Record<string, number>;
  const porPersonaReunion: number[] = [];
  for (const [, ts] of porReunion) {
    const s = ts[0]!.session!;
    totales.reuniones++;
    const dia = s.date.toISOString().slice(0, 10);
    const estados = new Map<string, number>();
    const personas = new Map<string, number>();
    for (const t of ts) {
      totales.propuestas++;
      totales[t.lado === "cliente" ? "cliente" : "smarteam"]++;
      if (!t.responsableEmail) totales.porAsignar++;
      const e = estadoDe(t);
      totales[e] = (totales[e] ?? 0) + 1;
      estados.set(e, (estados.get(e) ?? 0) + 1);
      const p = t.responsableEmail ?? `por asignar (${t.equipo})`;
      personas.set(p, (personas.get(p) ?? 0) + 1);
    }
    for (const [p, n] of personas) if (!p.startsWith("por asignar")) porPersonaReunion.push(n);
    console.log(`${dia} · ${ts[0]!.client?.name ?? "?"} (${ts[0]!.client?.kind ?? "?"}) · «${s.title}» · ${ts.length} propuestas`);
    console.log(`   para: ${[...personas].map(([p, n]) => `${p} ${n}`).join(" · ")}`);
    console.log(`   estado: ${[...estados].map(([e, n]) => `${e} ${n}`).join(" · ")}`);
    if (TITULOS) for (const t of ts) console.log(`     T-${t.numero} [${t.lado === "cliente" ? "cliente" : "smarteam"} · ${estadoDe(t)}] ${t.titulo}`);
  }
  porPersonaReunion.sort((a, b) => a - b);
  const p = (q: number) => porPersonaReunion[Math.min(porPersonaReunion.length - 1, Math.floor(q * porPersonaReunion.length))] ?? 0;
  console.log(`\nTotal: ${totales.reuniones} reuniones · ${totales.propuestas} propuestas (${totales.smarteam} de Smarteam, ${totales.cliente} del cliente; ${totales.porAsignar} por asignar)`);
  console.log(`Cómo quedaron: usadas ${totales.usada} · descartadas ${totales.descartada} · vencidas ${totales.vencida} · por decidir ${totales["por decidir"]} · por asignar sin tomar ${totales["por asignar"]} · retiradas por el sistema ${totales.retirada}`);
  console.log(`Por persona y reunión: mediana ${p(0.5)} · p90 ${p(0.9)} · máximo ${porPersonaReunion.at(-1) ?? 0} · con más de 3: ${porPersonaReunion.filter((n) => n > 3).length} de ${porPersonaReunion.length}`);

  // ¿Cuántas repiten un tema que alguien ya descartó en la misma cuenta?
  const { temasDeLaTarea, compartenTema } = await import("@/lib/tareas/tema");
  const descartadas = await prisma.tarea.findMany({
    where: { estado: { in: ["rechazada", "fusionada"] }, decision: { in: ["rechazada", "misma"] }, NOT: { decididaPorEmail: "sistema" }, clientId: { not: null } },
    select: { titulo: true, contexto: true, clientId: true, decididaAt: true, responsableEmail: true, client: { select: { name: true } } },
  });
  let repiten = 0;
  for (const t of tareas) {
    const tema = temasDeLaTarea({ titulo: t.titulo, contexto: null }, t.client?.name);
    if (descartadas.some((d) => d.clientId === t.clientId && d.decididaAt && t.session && d.decididaAt < t.session.date && compartenTema(temasDeLaTarea(d, d.client?.name), tema))) repiten++;
  }
  console.log(`Repiten un tema ya descartado en la misma cuenta (antes de la reunión): ${repiten}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
