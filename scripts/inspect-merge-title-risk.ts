import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { normalize, computeAmbiguousNameTokens } from "@/lib/sessions/categorize";

/**
 * scripts/inspect-merge-title-risk.ts   (READ-ONLY)
 *
 * Borrar un dup cuyo NOMBRE comparte token con el canónico (Construtecho/Construtecho,
 * "Ministerio de Economía"/"…(MINEC)") cambia el set de tokens AMBIGUOS del title-match:
 * un token que hoy está en 2 clients (→ ambiguo, NO matchea) pasa a estar en 1 (→ matchea).
 * Eso puede ARRASTRAR sesiones ajenas al canónico tras el merge.
 *
 * Este script simula el set ambiguo POST-merge (dups quitados, dominios folded) y, para
 * cada token que se "des-ambigua", lista las sesiones DB-wide que el title-match podría
 * jalar al canónico (título contiene el token y hoy NO está resuelta al canónico), con sus
 * dominios de participantes, para juzgar si el pull-in es correcto o es pollution.
 *
 * No escribe nada.  npx tsx scripts/inspect-merge-title-risk.ts
 */

const PAIRS = [
  { label: "Bluesat", canonicalId: "cmpc0e02z008bxgij4ksityv4", dupId: "cmpc0dyr5007kxgijyjan7j2c" },
  { label: "Cicadex", canonicalId: "cmoi1jte2000rl8ijeh2d4jx9", dupId: "cmpc0dr1k003txgijkhh2jwrg" },
  { label: "Construtecho", canonicalId: "cmpc0edm200ftxgij3bi1vsmp", dupId: "cmpc0ec8k00f2xgijtd7a2c5o" },
  { label: "Ministerio de Economía", canonicalId: "cmpc0du6h005bxgij30eodfxe", dupId: "cmpc0e44900akxgijla2vd9ah" },
];

async function main() {
  console.log("READ-ONLY — riesgo de title-match tras el merge (des-ambiguación de tokens)\n");

  const clients = await prisma.client.findMany({ select: { id: true, name: true, company: true, emailDomains: true } });
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const dupIds = new Set(PAIRS.map((p) => p.dupId));

  // Set ambiguo ACTUAL.
  const ambiguousNow = computeAmbiguousNameTokens(clients.map((c) => ({ name: c.name, company: c.company })));

  // Set ambiguo POST-merge: quitar dups, foldear dominios del dup en el canónico (no cambia
  // tokens de nombre, pero sí refleja el universo de clients reducido).
  const postClients = clients
    .filter((c) => !dupIds.has(c.id))
    .map((c) => ({ name: c.name, company: c.company }));
  const ambiguousPost = computeAmbiguousNameTokens(postClients);

  // Tokens que pasan de ambiguo → NO ambiguo por el merge (los que "se activan").
  const activated = [...ambiguousNow].filter((t) => !ambiguousPost.has(t));
  console.log(`Tokens ambiguos hoy: ${ambiguousNow.size} (${JSON.stringify([...ambiguousNow])})  ·  post-merge: ${ambiguousPost.size} (${JSON.stringify([...ambiguousPost])})`);
  console.log(`Tokens que SE ACTIVAN para title-match tras el merge: ${JSON.stringify(activated)}`);
  console.log(`(computeAmbiguousNameTokens es subset-aware: los registros duplicados de la misma empresa`);
  console.log(` NO se marcan ambiguos, así que borrar el dup NO cambia el title-match → se espera [].)\n`);

  // Para cada token activado, ¿qué cliente(s) post-merge lo tienen en su nombre/company?
  const tokenOwners = (tok: string): { id: string; name: string }[] =>
    clients
      .filter((c) => !dupIds.has(c.id))
      .filter((c) => {
        const toks = new Set<string>();
        for (const p of normalize(c.name).split(/[\s.\-_]+/)) if (p.length >= 4) toks.add(p);
        if (c.company) for (const p of normalize(c.company).split(/[\s.\-_]+/)) if (p.length >= 4) toks.add(p);
        return toks.has(tok);
      })
      .map((c) => ({ id: c.id, name: c.name }));

  // Cargar todas las sesiones (id, title, participants, resolvedClientId) una vez.
  const sessions = await prisma.firefliesSession.findMany({
    select: { id: true, title: true, participants: true, resolvedClientId: true },
  });
  const titleTokens = (title: string) =>
    new Set(normalize(title).split(/[\s|&,.()\[\]!?*\-_]+/).filter((w) => w.length >= 4));
  const domainsOf = (participants: string[]) =>
    [...new Set(participants.map((p) => (p || "").toLowerCase().split("@")[1]).filter(Boolean))];

  for (const tok of activated) {
    const owners = tokenOwners(tok);
    console.log(`\n══ token "${tok}"  → dueño(s) post-merge: ${owners.map((o) => `"${o.name}"`).join(", ") || "(ninguno)"}`);
    if (owners.length !== 1) { console.log("   (no resuelve a un único cliente — title-match no lo usaría limpio)"); continue; }
    const owner = owners[0];
    // Sesiones que CONTIENEN el token y NO están resueltas al dueño hoy → candidatas a pull-in.
    const atRisk = sessions.filter((s) => titleTokens(s.title).has(tok) && s.resolvedClientId !== owner.id);
    console.log(`   sesiones con "${tok}" en título y NO resueltas a "${owner.name}" hoy: ${atRisk.length}`);
    const byCurrent = new Map<string, number>();
    for (const s of atRisk) {
      const key = s.resolvedClientId ? nameById.get(s.resolvedClientId) ?? s.resolvedClientId : "(null)";
      byCurrent.set(key, (byCurrent.get(key) ?? 0) + 1);
    }
    console.log(`   distribución actual: ${JSON.stringify(Object.fromEntries(byCurrent))}`);
    for (const s of atRisk.slice(0, 12)) {
      const cur = s.resolvedClientId ? nameById.get(s.resolvedClientId) ?? s.resolvedClientId : "(null)";
      console.log(`     • "${s.title}"  [hoy→${cur}]  dominios=${JSON.stringify(domainsOf(s.participants))}`);
    }
    if (atRisk.length > 12) console.log(`     … y ${atRisk.length - 12} más`);
  }

  // Distribución de dominios de las sesiones de cada dup (¿resuelven por dominio o por título?).
  console.log(`\n\n══ Dominios de las sesiones resueltas a cada DUP (¿por qué resuelven al dup?) ══`);
  for (const p of PAIRS) {
    const dupSessions = sessions.filter((s) => s.resolvedClientId === p.dupId);
    if (dupSessions.length === 0) { console.log(`\n  ${p.label} [dup]: 0 sesiones`); continue; }
    const dom = new Map<string, number>();
    for (const s of dupSessions) for (const d of domainsOf(s.participants)) dom.set(d, (dom.get(d) ?? 0) + 1);
    const top = [...dom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`\n  ${p.label} [dup ${p.dupId}]: ${dupSessions.length} sesiones`);
    console.log(`    dominios participantes (top): ${top.map(([d, n]) => `${d}(${n})`).join(", ")}`);
  }

  console.log("\n(READ-ONLY) Nada modificado.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
