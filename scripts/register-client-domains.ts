import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

/**
 * Registra dominios corporativos ÚNICOS (confirmados a mano) en `Client.emailDomains`, así
 * esas sesiones resuelven por DOMINIO (señal fuerte, paso 3) en vez de por título.
 *
 * SOLO dominios únicos por empresa (confirmados). Targetea cada dominio al cliente que ya
 * tiene MÁS sesiones con ese dominio (data-driven; robusto ante duplicados y substrings de
 * nombre), excluyendo el bucket de la agencia "Smarteam". Flaguea ⚠ DUP si el dominio aparece
 * en >1 registro de cliente (duplicados de la misma empresa, para mergear aparte). Idempotente.
 *
 * Dry-run por default:
 *   npx tsx scripts/register-client-domains.ts            # muestra el plan
 *   npx tsx scripts/register-client-domains.ts --apply    # escribe (PROD)
 */
const APPLY = process.argv.includes("--apply");

const DOMAINS = [
  "grupoinve.com", "selvatura.com", "teamnet.com.mx", "stratospherecorp.com", "ferreterianoelito.com",
  "ecoquintas.com", "iberorutas.com", "wherex.com", "sferalegal.com", "distelsanic.com", "globalsupply.co.cr",
  "economia.gob.sv", "apptividad.com", "stla.net", "cicadex.com", "alfa.com.ni", "mscpayroll.com", "realst.mx",
  "tecnofood.com.mx", "thealtahotel.com", "spectrum.com.gt", "gruposervica.com", "almoteccr.com", "heyprimo.com",
  "plastimexsa.com", "plant.gt", "multiquimica.com", "amc.com.gt", "tec.ac.cr", "intercertlatam.com",
  "intercert.com.pe", "hondafaco.com", "revify.cr",
];

async function main() {
  console.log(APPLY ? "⚠ APLICANDO registración de dominios…\n" : "DRY-RUN — plan de registración (usá --apply)\n");
  const clients = await prisma.client.findMany({ select: { id: true, name: true, emailDomains: true } });
  const byId = new Map(clients.map((c) => [c.id, c]));
  const sessions = await prisma.firefliesSession.findMany({ select: { participants: true, resolvedClientId: true } });

  const want = new Set(DOMAINS);
  const tally = new Map<string, Map<string, number>>(); // domain -> clientId -> count
  for (const s of sessions) {
    if (!s.resolvedClientId) continue;
    const doms = new Set(
      (s.participants ?? []).map((p) => (p || "").toLowerCase().split("@")[1]).filter(Boolean) as string[],
    );
    for (const d of doms) {
      if (!want.has(d)) continue;
      if (!tally.has(d)) tally.set(d, new Map());
      const m = tally.get(d)!;
      m.set(s.resolvedClientId, (m.get(s.resolvedClientId) ?? 0) + 1);
    }
  }

  let add = 0, already = 0, skip = 0;
  for (const d of DOMAINS) {
    const m = tally.get(d);
    if (!m || m.size === 0) { skip++; console.log(`SKIP  ${d.padEnd(24)} sin sesiones con ese dominio`); continue; }
    const ranked = [...m.entries()]
      .map(([id, n]) => ({ id, n, name: byId.get(id)?.name ?? id }))
      .filter((c) => c.name.toLowerCase() !== "smarteam") // nunca el bucket de la agencia
      .sort((a, b) => b.n - a.n);
    if (ranked.length === 0) { skip++; console.log(`SKIP  ${d.padEnd(24)} solo bucket agencia Smarteam`); continue; }
    const top = ranked[0];
    const dup = ranked.length > 1 ? `  ⚠ DUP: ${ranked.slice(1).map((r) => `${r.name}(${r.n})`).join(", ")}` : "";
    const c = byId.get(top.id)!;
    const have = new Set((c.emailDomains ?? []).map((x) => x.toLowerCase()));
    if (have.has(d)) { already++; console.log(` ==   ${d.padEnd(24)} → ${top.name} (ya estaba)${dup}`); continue; }
    add++;
    console.log(`ADD   ${d.padEnd(24)} → ${top.name} (${top.n})${dup}`);
    if (APPLY) await prisma.client.update({ where: { id: c.id }, data: { emailDomains: [...(c.emailDomains ?? []), d] } });
  }
  console.log(`\nADD: ${add} · ya estaba: ${already} · SKIP: ${skip}`);
  if (!APPLY) console.log("(DRY-RUN) Nada escrito. Revisá el mapeo y los ⚠ DUP, después --apply.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
