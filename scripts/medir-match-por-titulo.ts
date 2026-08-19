/**
 * scripts/medir-match-por-titulo.ts — SOLO LECTURA. No escribe nada, nunca.
 *
 * Corre las DOS reglas del match por título sobre el corpus real y reporta la diferencia:
 * cuántas reuniones cambian de dueño, cuáles ganan uno, cuáles lo pierden, y —lo que decide— a
 * cuántas de las que lo pierden les está alimentando hoy algún proyecto.
 *
 * La población afectada NO son las 7.168 reuniones: el título solo decide cuando la reunión es
 * 100 % del equipo (sin nadie de afuera). Con gente externa manda el dominio y esta regla ni
 * se consulta.
 *
 *   npx tsx scripts/medir-match-por-titulo.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import {
  normalize,
  computeAmbiguousNameTokens,
  extractParticipantDomains,
  buildInternalDomainsSet,
  TITLE_MATCH_STOPWORDS,
  isTestClient,
} from "@/lib/sessions/categorize";
import { clientePorTitulo, type ClienteParaMatch } from "@/lib/sessions/match-por-titulo";

async function main() {
  const [clientes, categorias, sesiones] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true, company: true, emailDomains: true } }),
    prisma.sessionCategory.findMany(),
    prisma.firefliesSession.findMany({
      select: {
        id: true, title: true, date: true, participants: true,
        resolvedClientId: true, manualClientId: true,
        _count: { select: { projects: true } },
      },
    }),
  ]);

  const nombre = new Map(clientes.map((c) => [c.id, c.name]));
  const ambiguos = computeAmbiguousNameTokens(clientes as never);
  const internos = buildInternalDomainsSet(categorias as never);
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || ambiguos.has(w);
  const paraMatch: ClienteParaMatch[] = clientes.map((c) => ({ id: c.id, name: c.name, company: c.company }));

  // Solo las que el título decide: con participantes y sin NADIE de afuera.
  const afectadas = sesiones.filter((s) => {
    const dom = extractParticipantDomains(s.participants ?? []);
    if (dom.size === 0) return false;
    for (const d of dom) if (!internos.has(d)) return false;
    return true;
  });

  const propio = "smarteamcr.com";
  const esLaCasa = (c: { name: string; company: string | null }) =>
    normalize(c.name) === "smarteam" || (c.company ?? "").toLowerCase() === propio;
  const opts = { skip, normalize, esClienteDePrueba: isTestClient, esLaCasa };
  // El modo a comparar contra el vivo. Por defecto el que la medicion del 2026-08-19 propuso
  // como reemplazo; "dos-palabras" queda para reproducir la medicion que lo descarto.
  const MODO = (process.argv.includes("--dos-palabras") ? "dos-palabras" : "mejor-fraccion") as
    "dos-palabras" | "mejor-fraccion";
  console.log(`modo comparado contra el vivo: ${MODO}
`);
  let iguales = 0;
  const pierden: typeof afectadas = [];
  const ganan: typeof afectadas = [];
  const cambian: { s: (typeof afectadas)[number]; de: string; a: string }[] = [];
  const empates: typeof afectadas = [];

  for (const s of afectadas) {
    const viejo = clientePorTitulo(s.title, paraMatch, { ...opts, modo: "una-palabra" });
    const nuevo = clientePorTitulo(s.title, paraMatch, { ...opts, modo: MODO });
    const a = viejo.cliente?.id ?? null;
    const b = nuevo.cliente?.id ?? null;
    if (a === b) { iguales++; continue; }
    if (a && !b) { pierden.push(s); if (nuevo.motivo === "empate") empates.push(s); continue; }
    if (!a && b) { ganan.push(s); continue; }
    cambian.push({ s, de: nombre.get(a!) ?? "?", a: nombre.get(b!) ?? "?" });
  }

  const conVinculo = pierden.filter((s) => s._count.projects > 0);
  const conDuenioManual = pierden.filter((s) => s.manualClientId);

  console.log("═══ MEDICIÓN DEL MATCH POR TÍTULO ═══\n");
  console.log(`reuniones totales:                       ${sesiones.length}`);
  console.log(`  las que el TÍTULO decide (100% equipo): ${afectadas.length}   <<< la población real\n`);
  console.log(`  sin cambio:                            ${iguales}`);
  console.log(`  PIERDEN dueño:                         ${pierden.length}   ⚠ el costo`);
  console.log(`     de ésas, por EMPATE (2 candidatos): ${empates.length}   (correcto: antes adivinaba)`);
  console.log(`     de ésas, alimentando un proyecto:   ${conVinculo.length}   ⚠⚠ el costo REAL`);
  console.log(`     de ésas, con dueño puesto A MANO:   ${conDuenioManual.length}   (el manual manda: NO se pierden)`);
  console.log(`  GANAN dueño:                           ${ganan.length}`);
  console.log(`  CAMBIAN de dueño:                      ${cambian.length}   <<< las mal adjudicadas\n`);

  if (cambian.length > 0) {
    console.log("── LAS QUE CAMBIAN DE DUEÑO (todas) ──");
    for (const c of cambian) {
      console.log(`  [${c.s.date.toISOString().slice(0, 10)}] "${c.s.title}"`);
      console.log(`       ${c.de}  →  ${c.a}${c.s._count.projects > 0 ? `   · alimenta ${c.s._count.projects}` : ""}`);
    }
    console.log("");
  }

  if (conVinculo.length > 0) {
    console.log("── LAS QUE PIERDEN DUEÑO Y HOY ALIMENTAN UN PROYECTO ──");
    console.log("   (son las que hay que mirar: dejarían de estar en el material de ese cliente)");
    for (const s of conVinculo.slice(0, 30)) {
      console.log(`  [${s.date.toISOString().slice(0, 10)}] "${s.title}"  → era de ${nombre.get(s.resolvedClientId ?? "") ?? "?"}`);
    }
    if (conVinculo.length > 30) console.log(`  … y ${conVinculo.length - 30} más`);
    console.log("");
  }

  const porCliente = new Map<string, number>();
  for (const s of pierden) {
    const n = nombre.get(s.resolvedClientId ?? "") ?? "(sin nombre)";
    porCliente.set(n, (porCliente.get(n) ?? 0) + 1);
  }
  if (porCliente.size > 0) {
    console.log("── A QUIÉN LE SACA REUNIONES (top 15) ──");
    for (const [n, c] of [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`   ${String(c).padStart(4)}  ${n}`);
    }
  }
  console.log("\n⛔ Esto NO escribió nada. La decisión de cambiar la regla es de Elías.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
