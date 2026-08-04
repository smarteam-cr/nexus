/**
 * scripts/renombrar-cliente.ts
 *
 * Cambia el NOMBRE de un cliente y re-resuelve las sesiones. Suena cosmético y no lo es: el
 * nombre es una de las señales con las que Nexus decide **de quién es una reunión**.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * `findClientByTitleMatch` (lib/sessions/categorize.ts) parte el TÍTULO de la reunión por espacios
 * y también por puntos, pero el NOMBRE del cliente **solo por espacios**. Un cliente llamado
 * "smartagrocr.com" produce entonces un único token literal —`smartagrocr.com`— que ningún título
 * puede generar jamás: ese cliente no matchea por título en absoluto. Llamarlo "SmartAgro" produce
 * el token `smartagro`, y ahí sí cruza con "WEB I SMARTAGRO", "Hand off 🌱 Smartagro", etc.
 *
 * Eso importa sobre todo para las reuniones **100% internas** (todos @smarteamcr.com), porque para
 * ésas el título es el ÚNICO camino a tener dueño: los pasos que miran dominios recorren los
 * dominios externos, que ahí están vacíos.
 *
 * ── LO QUE NO TOCA, Y ES LA MITAD DEL PUNTO ──────────────────────────────────
 * Solo `name`. Ni `company` ni `emailDomains`: ésos son los que traen las reuniones CON gente de
 * afuera, por dominio. Cambiarlos las tiraría — el rename suma, no reemplaza.
 *
 * DRY-RUN por defecto: dice cuántas sesiones ganaría o perdería ANTES de escribir, simulando con
 * la misma función que corre en producción. Con `--apply` escribe y re-resuelve.
 *
 *   npx tsx scripts/renombrar-cliente.ts --cliente "smartagrocr.com" --nombre "SmartAgro"
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/renombrar-cliente.ts --cliente "…" --nombre "…" --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { categorizeSession, buildInternalDomainsSet, computeAmbiguousNameTokens } from "@/lib/sessions/categorize";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

function bandera(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const apply = resolverApply();
  const busca = bandera("cliente")?.trim();
  const nuevo = bandera("nombre")?.trim();
  if (!busca || !nuevo) {
    console.error('Uso: --cliente "nombre actual" --nombre "nombre nuevo" [--apply]');
    process.exit(1);
  }

  const cliente = await prisma.client.findFirst({
    where: { name: busca },
    select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true },
  });
  if (!cliente) {
    console.error(`No existe un cliente llamado exactamente "${busca}".`);
    process.exit(1);
  }
  if (cliente.name === nuevo) {
    console.log("Ya se llama así. Nada que hacer.");
    return;
  }

  console.log(`\n${cliente.name}  →  ${nuevo}`);
  console.log(`  company     : ${cliente.company ?? "(vacío)"}   ← NO se toca`);
  console.log(`  emailDomains: ${JSON.stringify(cliente.emailDomains)}   ← NO se toca`);
  console.log(`  empresa HS  : ${cliente.hubspotCompanyId ?? "(ninguna)"}`);

  /* ── La simulación ─────────────────────────────────────────────────────────
     Se corre `categorizeSession` —la misma de producción— sobre TODAS las sesiones, dos veces:
     con el nombre viejo y con el nuevo. Sin esto el rename es un salto de fe: el efecto depende
     de cómo se tokeniza el nombre contra cientos de títulos, y de si el token nuevo choca con
     otro cliente (ahí `computeAmbiguousNameTokens` lo anula y el rename no sirve de nada). */
  const [clientes, categorias, sesiones] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true } }),
    prisma.sessionCategory.findMany({ select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
    prisma.firefliesSession.findMany({ select: { id: true, title: true, participants: true, manualClientId: true, resolvedClientId: true } }),
  ]);
  const porId = new Map(clientes.map((c) => [c.id, c.name]));
  const internos = buildInternalDomainsSet(categorias);

  const contar = (nombreDelCliente: string) => {
    const lista = clientes.map((c) => (c.id === cliente.id ? { ...c, name: nombreDelCliente } : c));
    const ctx = {
      clients: lista,
      categories: categorias,
      hubspotCompaniesByDomain: new Map(),
      internalDomains: internos,
      clientsByHubspotCompanyId: new Map(
        lista.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, { id: c.id, name: c.name, company: c.company }]),
      ),
      ambiguousNameTokens: computeAmbiguousNameTokens(lista),
    };
    const out = new Map<string, number>();
    for (const s of sesiones) {
      const g = categorizeSession(s, ctx);
      const clave = g.kind === "client" ? g.id : "(sin cliente)";
      out.set(clave, (out.get(clave) ?? 0) + 1);
    }
    return out;
  };

  const antes = contar(cliente.name);
  const despues = contar(nuevo);
  const claves = new Set([...antes.keys(), ...despues.keys()]);
  const deltas: { quien: string; delta: number }[] = [];
  for (const k of claves) {
    const d = (despues.get(k) ?? 0) - (antes.get(k) ?? 0);
    if (d !== 0) deltas.push({ quien: k === "(sin cliente)" ? k : (porId.get(k) ?? k), delta: d });
  }

  console.log(`\n── Simulación sobre ${sesiones.length} sesiones (misma función que producción)`);
  console.log(`   ${cliente.name}: ${antes.get(cliente.id) ?? 0}  →  ${despues.get(cliente.id) ?? 0}`);
  if (deltas.length === 0) {
    console.log("   Sin cambios. El rename NO sirve: revisá si el token nuevo choca con otro cliente.");
  } else {
    for (const d of deltas.sort((a, b) => b.delta - a.delta)) {
      console.log(`   ${d.delta > 0 ? "+" : ""}${d.delta}  ${d.quien}`);
    }
  }
  const perjudicados = deltas.filter((d) => d.delta < 0 && d.quien !== "(sin cliente)");
  if (perjudicados.length > 0) {
    console.log(`\n   ⚠ ${perjudicados.length} cliente(s) PIERDEN sesiones. Revisá antes de aplicar.`);
  }

  if (!apply) {
    console.log("\n(dry-run) Nada escrito. Repetí con --apply para aplicarlo.");
    return;
  }

  await prisma.client.update({ where: { id: cliente.id }, data: { name: nuevo } });
  console.log(`\n✓ Renombrado.`);

  /* Re-materializar es OBLIGATORIO, no un extra: `resolvedClientId` está guardado en cada fila.
     Sin esto el rename no cambia nada visible y encima INV2 queda rojo. */
  console.log("Re-resolviendo las sesiones…");
  const r = await resolveAllSessions();
  console.log(`✓ ${r.changed} sesiones cambiaron de dueño.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
