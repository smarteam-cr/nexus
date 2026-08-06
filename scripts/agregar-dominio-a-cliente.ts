/**
 * scripts/agregar-dominio-a-cliente.ts — SUMARLE UN DOMINIO A UN CLIENTE, MIDIENDO ANTES.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Los dominios de un cliente deciden **de quién son sus reuniones**. Un dominio que falta no da
 * error: el clasificador cae al título, y ahí gana cualquier palabra que suene. El caso que lo
 * destapó: el TEC tenía `tec.ac.cr` pero su gente escribe desde `itcr.ac.cr`, así que 34
 * reuniones del TEC quedaron archivadas como NUESTRAS —el título decía «SMARTEAM»— y otras 39
 * sin dueño. Una de ellas rompía INV1: sesión de Smarteam vinculada a un proyecto del TEC.
 *
 * ── LO QUE HACE QUE ESTO NO SEA UN `UPDATE` A MANO ──────────────────────────
 * 1. SIMULA primero, con la función real que decide el dueño de las ~7.000 sesiones, y dice
 *    cuántas gana y —lo que importa— **a quién se las saca**. Un dominio demasiado amplio
 *    (`gmail.com`, el dominio de un grupo empresarial) le robaría reuniones a otro cliente, y
 *    eso no se ve mirando la ficha.
 * 2. Re-resuelve DESPUÉS de escribir. Por la pantalla ese refresco sale solo (el PATCH lo
 *    dispara); por SQL a mano no, y sin él el cambio parece que no funcionó.
 *
 * Uso:
 *   npx tsx scripts/agregar-dominio-a-cliente.ts --client TEC --dominio itcr.ac.cr
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/agregar-dominio-a-cliente.ts --client TEC --dominio itcr.ac.cr --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import {
  categorizeSession,
  computeAmbiguousNameTokens,
  buildInternalDomainsSet,
} from "@/lib/sessions/categorize";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const APPLY = resolverApply();
const CLIENTE = argValue("--client");
const DOMINIO = (argValue("--dominio") ?? "").trim().toLowerCase().replace(/^@/, "");

async function main() {
  if (!CLIENTE || !DOMINIO) throw new Error("Usá --client <id|nombre> --dominio <dominio>");

  const [clients, categories, sesiones] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
    prisma.firefliesSession.findMany({
      select: { id: true, title: true, date: true, participants: true, manualClientId: true },
    }),
  ]);

  const destino =
    clients.find((c) => c.id === CLIENTE) ??
    clients.find((c) => c.name.toLowerCase() === CLIENTE.toLowerCase()) ??
    clients.find((c) => c.name.toLowerCase().includes(CLIENTE.toLowerCase()));
  if (!destino) throw new Error(`Ningún cliente matchea "${CLIENTE}"`);
  if (destino.emailDomains.includes(DOMINIO)) {
    console.log(`✓ «${destino.name}» ya tiene ${DOMINIO}. Nada que hacer.`);
    return;
  }

  /* ⚠ Un dominio que YA es de otro cliente no se agrega y punto: dos fichas reclamando el mismo
     dominio hacen que quién gana dependa del orden de la lista, o sea del azar. */
  const enOtro = clients.filter((c) => c.id !== destino.id && c.emailDomains.includes(DOMINIO));
  if (enOtro.length > 0) {
    throw new Error(
      `${DOMINIO} ya está en ${enOtro.map((c) => `«${c.name}»`).join(", ")}. ` +
        `Dos clientes con el mismo dominio hacen que el dueño dependa del orden de la lista.`,
    );
  }

  const porHs = new Map(clients.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, c]));
  function correr(cs: typeof clients) {
    const ctx = {
      clients: cs,
      categories,
      hubspotCompaniesByDomain: new Map(),
      internalDomains: buildInternalDomainsSet(categories),
      clientsByHubspotCompanyId: porHs,
      ambiguousNameTokens: computeAmbiguousNameTokens(cs),
    };
    const out = new Map<string, string | null>();
    for (const s of sesiones) {
      const g = categorizeSession(
        { title: s.title, participants: s.participants, manualClientId: s.manualClientId },
        ctx,
      );
      out.set(s.id, g.kind === "client" ? g.id : null);
    }
    return out;
  }

  const antes = correr(clients);
  const despues = correr(
    clients.map((c) => (c.id === destino.id ? { ...c, emailDomains: [...c.emailDomains, DOMINIO] } : c)),
  );

  const nombre = new Map(clients.map((c) => [c.id, c.name]));
  const gana: string[] = [];
  const deQuien = new Map<string, number>();
  const colaterales: string[] = [];
  for (const s of sesiones) {
    const a = antes.get(s.id) ?? null;
    const d = despues.get(s.id) ?? null;
    if (a === d) continue;
    if (d === destino.id) {
      gana.push(`${s.date.toISOString().slice(0, 10)} "${s.title}"`);
      const k = a ? nombre.get(a) ?? a : "sin dueño";
      deQuien.set(k, (deQuien.get(k) ?? 0) + 1);
    } else {
      colaterales.push(`"${s.title}": ${a ? nombre.get(a) : "sin dueño"} → ${d ? nombre.get(d) : "sin dueño"}`);
    }
  }

  console.log(`\nCliente : «${destino.name}» (${destino.id})`);
  console.log(`Dominios: ${JSON.stringify(destino.emailDomains)}  +  ${DOMINIO}`);
  console.log(`Sesiones evaluadas: ${sesiones.length}\n`);
  console.log(`Gana ${gana.length} sesión(es):`);
  for (const [k, v] of [...deQuien].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ← ${k}`);
  for (const g of gana.slice(0, 15)) console.log(`   · ${g}`);
  if (gana.length > 15) console.log(`   … y ${gana.length - 15} más`);

  /* Los colaterales son la señal de alarma: si agregar un dominio mueve sesiones ENTRE OTROS
     clientes, el dominio está compartido y el cambio no es el que uno cree. */
  if (colaterales.length > 0) {
    console.log(`\n⚠ ${colaterales.length} sesión(es) cambian de dueño SIN ir a «${destino.name}»:`);
    for (const c of colaterales.slice(0, 15)) console.log(`   ${c}`);
    console.log("   Revisá esto con los ojos antes de aplicar.");
  } else {
    console.log(`\n✓ Ningún otro cliente cambia.`);
  }

  if (!APPLY) {
    console.log(`\nDry-run. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/agregar-dominio-a-cliente.ts --client "${CLIENTE}" --dominio ${DOMINIO} --apply`);
    return;
  }

  await prisma.client.update({
    where: { id: destino.id },
    data: { emailDomains: [...destino.emailDomains, DOMINIO] },
  });
  console.log(`\n✓ Dominio agregado. Re-resolviendo la atribución…`);
  /* ⚠ Se ESPERA. Por la pantalla este refresco sale solo (lo dispara el PATCH) y puede ir en
     background; por script hay que esperarlo, o el proceso muere antes y el cambio queda escrito
     sin efecto — que se ve exactamente igual que «no funcionó». */
  const r = await resolveAllSessions();
  console.log(`✓ Re-resuelto: ${JSON.stringify(r)}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
