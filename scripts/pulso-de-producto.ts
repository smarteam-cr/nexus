/**
 * scripts/pulso-de-producto.ts — SOLO LECTURA. Lo que el socio de producto (skill `socio`) lee antes de conversar
 * la North Star con Elías y que los otros dos scripts no cubren:
 *
 *   1. Feedback: los reportes de los últimos N días por tipo, estado y pantalla; los temas por columna; y el texto de
 *      los que siguen sin revisar (son internos: los escribe el equipo).
 *   2. Las reuniones de Elías donde se habló de Nexus: fecha, título, de qué cuenta, y cada mención con un poco de
 *      contexto. De ahí salen mejoras que nadie cargó como feedback.
 *
 * Complementa (no repite) scripts/validar-uso.ts (quién entra y a qué, el costo de la IA) y scripts/uso-de-nexus.ts
 * (cuánto de lo que propuso Nexus se usó). La skill corre los tres.
 *
 * ⛔ La base se abre en solo lectura (PGOPTIONS), como los otros dos.
 *
 *   npx tsx scripts/pulso-de-producto.ts               # 30 días de feedback, 14 de reuniones
 *   npx tsx scripts/pulso-de-producto.ts --dias 60 --dias-reuniones 30 --persona egonzalez@smarteamcr.com
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIAS = Number(arg("--dias") ?? 30) || 30;
const DIAS_REUNIONES = Number(arg("--dias-reuniones") ?? 14) || 14;
const PERSONA = (arg("--persona") ?? "egonzalez@smarteamcr.com").toLowerCase();
/** Cuántas menciones por reunión y cuántos caracteres de contexto a cada lado. */
const MENCIONES_POR_REUNION = 4;
const CONTEXTO = 180;

const dia = (d: Date) => d.toISOString().slice(0, 10);
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const enUnaLinea = (s: string) => s.replace(/\s+/g, " ").trim();

function contar<T>(filas: T[], clave: (f: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Las menciones de «Nexus» con su contexto, sin solaparse. */
export function menciones(texto: string, max = MENCIONES_POR_REUNION, contexto = CONTEXTO): string[] {
  const salida: string[] = [];
  const re = /nexus/gi;
  let hasta = -1;
  for (let m = re.exec(texto); m && salida.length < max; m = re.exec(texto)) {
    if (m.index < hasta) continue;
    const ini = Math.max(0, m.index - contexto);
    const fin = Math.min(texto.length, m.index + contexto);
    salida.push(`${ini > 0 ? "…" : ""}${enUnaLinea(texto.slice(ini, fin))}${fin < texto.length ? "…" : ""}`);
    hasta = fin;
  }
  return salida;
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const ahora = Date.now();
  const desde = new Date(ahora - DIAS * 86_400_000);
  const antes = new Date(ahora - 2 * DIAS * 86_400_000);
  const desdeReuniones = new Date(ahora - DIAS_REUNIONES * 86_400_000);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · feedback desde ${dia(desde)} · reuniones desde ${dia(desdeReuniones)}\n`);

  // ── 1. Feedback ────────────────────────────────────────────────────────────────────────────────────────────────
  const reportes = await prisma.feedbackReporte.findMany({
    where: { createdAt: { gte: antes } },
    select: { numero: true, autorEmail: true, tipo: true, meFrena: true, pantalla: true, cuerpo: true, estado: true, createdAt: true, tema: { select: { titulo: true } } },
    orderBy: { createdAt: "desc" },
  });
  const recientes = reportes.filter((r) => r.createdAt >= desde);
  const previos = reportes.length - recientes.length;
  console.log(`## Feedback (${DIAS} días)\n`);
  console.log(`Reportes: ${recientes.length} (los ${DIAS} días anteriores: ${previos}) · de ${new Set(recientes.map((r) => r.autorEmail)).size} personas`);
  console.log(`Por tipo: ${contar(recientes, (r) => r.tipo).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
  console.log(`Por estado: ${contar(recientes, (r) => r.estado).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
  console.log(`Le frena el trabajo: ${recientes.filter((r) => r.meFrena).length}`);
  console.log(`Pantallas con más reportes: ${contar(recientes, (r) => r.pantalla).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(" · ") || "—"}`);

  const temas = await prisma.feedbackTema.findMany({
    select: { titulo: true, columna: true, pantalla: true, updatedAt: true, _count: { select: { reportes: true } } },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`\nTemas por columna: ${contar(temas, (t) => t.columna).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
  const vivos = temas.filter((t) => t.columna !== "listo").sort((a, b) => b._count.reportes - a._count.reportes).slice(0, 10);
  for (const t of vivos) console.log(`  - [${t.columna}] ${t.titulo}${t.pantalla ? ` · ${t.pantalla}` : ""} · ${t._count.reportes} reportes`);

  const sinRevisar = recientes.filter((r) => r.estado === "sin_revisar");
  if (sinRevisar.length) {
    console.log(`\nSin revisar (${sinRevisar.length}):`);
    for (const r of sinRevisar.slice(0, 25)) {
      console.log(`  - F-${r.numero} · ${dia(r.createdAt)} · ${r.tipo}${r.meFrena ? " · ME FRENA" : ""} · ${r.pantalla} · ${r.autorEmail.split("@")[0]}: ${recortar(enUnaLinea(r.cuerpo), 240)}`);
    }
  }

  // ── 2. Reuniones de la persona donde se habló de Nexus ──────────────────────────────────────────────────────
  const reuniones = await prisma.firefliesSession.findMany({
    where: {
      date: { gte: desdeReuniones, lte: new Date(ahora) },
      OR: [{ participants: { has: PERSONA } }, { organizerEmail: { equals: PERSONA, mode: "insensitive" } }],
      AND: [{ OR: [{ title: { contains: "nexus", mode: "insensitive" } }, { transcript: { contains: "nexus", mode: "insensitive" } }] }],
    },
    select: { id: true, title: true, date: true, transcript: true, resolvedClient: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 40,
  });
  console.log(`\n## Reuniones de ${PERSONA} donde se habló de Nexus (${DIAS_REUNIONES} días): ${reuniones.length}\n`);
  for (const s of reuniones) {
    const lista = menciones(s.transcript ?? "");
    console.log(`### ${dia(s.date)} · ${s.title} · ${s.resolvedClient?.name ?? "sin cuenta"} · ${lista.length} menciones`);
    for (const m of lista) console.log(`  > ${m}`);
  }
  if (!reuniones.length) console.log("(ninguna: o no hubo, o la persona no figura entre los participantes)");
}

if (process.argv[1]?.includes("pulso-de-producto")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.$disconnect();
    });
}
