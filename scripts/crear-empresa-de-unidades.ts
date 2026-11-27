/**
 * scripts/crear-empresa-de-unidades.ts — LA EMPRESA ARRIBA DE SUS UNIDADES, con simulacro (2026-11-26).
 *
 * Elías, 26 nov: la empresa existe como registro propio, dueña del dominio compartido y de la empresa de HubSpot, con
 * todas sus unidades iguales debajo. DECISIONS «La empresa arriba de sus unidades»; las empresas, en
 * scripts/lib/empresas-arriba.ts; el plan puro, en lib/clients/crear-empresa.ts.
 *
 * Lo que hace:
 *   1. Crea la ficha de tipo EMPRESA con lo compartido (dominios y empresa de HubSpot), se lo quita a la vieja principal
 *      y cuelga a todas las unidades de ella. Lo de una sola unidad se queda en ella.
 *   2. Simula, con el resolver único, cada reunión de la empresa antes y después: TIENE que dar el mismo dueño. Si alguna
 *      cambia, el `--apply` no corre y la lista dice cuáles.
 *   3. Simula a qué unidad iría cada fila copiada de HubSpot (contactos, correos y notas, tickets, negocios). No las mueve:
 *      las reparte sola la copia de cada hora (lib/sessions/reparto-de-la-empresa-server.ts).
 *
 * Simulacro por defecto, en SOLO LECTURA (la conexión nace read-only).
 *
 * ⚠ ORDEN: el SQL 2026-11-26-ficha-de-tipo-empresa.sql → el deploy de este código → ESTE con `--apply`. Con el código
 * viejo, una ficha de tipo EMPRESA revienta las lecturas de Client.
 *
 *   npx tsx scripts/crear-empresa-de-unidades.ts --empresa tec                                        (simulacro)
 *   ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/crear-empresa-de-unidades.ts --empresa tec --apply  (respaldo JSON)
 *   … --empresa cemaco --apply --con-ok-de-elias      (Cemaco espera el OK explícito de Elías)
 *   … --empresa tec --deshacer [--apply]               (vuelve atrás: todo lo de la empresa y lo que se repartió a sus
 *                                                       unidades sin empresa propia regresa a la vieja principal)
 * Se puede correr dos veces: la segunda dice que ya está.
 */
import "dotenv/config";
import "./lib/permitir-server-only";

const PIDE_APPLY = process.argv.includes("--apply");
/* ⛔ El simulacro no escribe ni por error: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
if (!PIDE_APPLY) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
}

import { imprimirDestino, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { EMPRESAS_ARRIBA } from "./lib/empresas-arriba";
import { prisma } from "@/lib/db/prisma";
import { effectiveDomainsForClient } from "@/lib/sessions/categorize";
import { buildCategorizeCtx, reResolverReunionesDe, type ReunionQueCambia } from "@/lib/sessions/resolve-client";
import { repartoCon } from "@/lib/sessions/reparto-de-la-empresa-server";
import { comunicacionesParaRepartir, cuantasComunicacionesVigentes } from "@/lib/comunicaciones/de-la-empresa-server";
import { ID_DE_LA_EMPRESA_NUEVA, fichasConLaEmpresa, planDeLaEmpresa, type FichaParaLaEmpresa } from "@/lib/clients/crear-empresa";
import { aplicarLaEmpresa, deshacerLaEmpresa } from "@/lib/clients/crear-empresa-server";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function abortar(msg: string): never {
  console.error(`\n⛔ ${msg}`);
  process.exit(1);
}

const SELECT = { id: true, name: true, kind: true, company: true, emailDomains: true, hubspotCompanyId: true, comparteDominioConId: true } as const;

/** Lo que se apaga en la vieja principal cuando pierde la empresa de HubSpot (decisión 4 del 26 nov), para el simulacro. */
const LO_QUE_SE_APAGA = [
  "el siguiente paso, el encargado, la ficha y las notas hacia HubSpot (como en AE desde el 29 oct)",
  "las señales de Éxito del cliente que se leen de la empresa de HubSpot (negocios, actividad, tickets): quedan congeladas",
  "el dueño de HubSpot de la ficha: queda el que tenía hoy",
];

/**
 * Deshacer una empresa: lo que tiene la empresa y lo que se repartió a sus unidades sin empresa de HubSpot propia vuelve a
 * la vieja principal (`desde`), con sus dominios y su empresa de HubSpot; las unidades vuelven a colgar de ella y la ficha
 * de la empresa se borra al final, vacía. Nada se borra con ella.
 */
async function deshacer(cfg: (typeof EMPRESAS_ARRIBA)[string], fichas: FichaParaLaEmpresa[], aplicar: boolean): Promise<void> {
  const unidades = fichas.filter((f) => cfg.unidades.includes(f.id));
  const empresa = fichas.find((f) => f.id === unidades[0]?.comparteDominioConId && f.kind === "EMPRESA");
  if (!empresa || unidades.some((u) => u.comparteDominioConId !== empresa.id)) abortar("Esta empresa no está armada: no hay nada que deshacer.");
  const principal = cfg.desde ?? null;
  const traen = principal ? [empresa.id, ...unidades.filter((u) => u.id !== principal && !u.hubspotCompanyId).map((u) => u.id)] : [];
  const cuenta = {
    proyectos: await prisma.project.count({ where: { clientId: empresa.id } }),
    contactos: await prisma.contactoDeHubspot.count({ where: { clientId: { in: traen } } }),
    comunicaciones: (await Promise.all(traen.map((id) => cuantasComunicacionesVigentes(id)))).reduce((a, b) => a + b, 0),
    tickets: await prisma.ticketDeHubspot.count({ where: { clientId: { in: traen } } }),
    negocios: await prisma.negocioAbierto.count({ where: { clientId: empresa.id } }),
    ventas: await prisma.ventaGanada.count({ where: { clientId: empresa.id } }),
  };
  const destino = principal ? `vuelve a ${fichas.find((f) => f.id === principal)?.name}` : "las unidades vuelven a no colgar de nadie, como antes";
  console.log(`\nDeshacer «${empresa.name}»: ${destino}:`, cuenta);
  console.log("  (Los contactos, correos y tickets que se repartieron a las otras unidades también vuelven: así estaban antes.)");
  if (!aplicar) {
    console.log("Simulacro: no se escribió nada. Con --apply se deshace.");
    return;
  }
  resolverApply({ tablas: ["Client"] });
  console.log(`Respaldo: ${guardarRespaldoJson({ deshacer: cfg.clave, empresa, unidades })}`);
  const vuelve = await deshacerLaEmpresa({ empresaId: empresa.id, principal: cfg.desde ?? null, unidades: unidades.map((u) => u.id) });
  console.log("Volvió:", vuelve);
  console.log(`✓ Deshecha «${empresa.name}». Corre check:invariants.`);
}

async function main() {
  imprimirDestino("crear-empresa-de-unidades");
  const clave = arg("--empresa") ?? abortar(`Falta --empresa (${Object.keys(EMPRESAS_ARRIBA).join(" | ")}).`);
  const cfg = EMPRESAS_ARRIBA[clave] ?? abortar(`No conozco la empresa «${clave}» (${Object.keys(EMPRESAS_ARRIBA).join(" | ")}).`);

  const fichas = (await prisma.client.findMany({ select: SELECT })) as FichaParaLaEmpresa[];
  if (process.argv.includes("--deshacer")) return deshacer(cfg, fichas, PIDE_APPLY);
  const r = planDeLaEmpresa(cfg, fichas);
  if (!r.ok) abortar(`El plan no vale:\n   · ${r.errores.join("\n   · ")}`);
  const plan = r.plan;
  if (plan.yaEsta) {
    console.log(`\n✓ «${cfg.nombre}» ya está arriba de sus unidades (${plan.yaEsta.id}). Nada que hacer.`);
    return;
  }
  const nombre = new Map(fichas.map((f) => [f.id, f.name]));
  nombre.set(ID_DE_LA_EMPRESA_NUEVA, `${cfg.nombre} (la empresa, sin unidad)`);
  const nombreDe = (id: string | null) => (id ? (nombre.get(id) ?? id) : "Por decidir");

  console.log(`\n═══ ${cfg.nombre}: la empresa arriba de sus unidades ═══`);
  console.log(`Ficha nueva «${plan.crear.name}» (tipo Empresa): dominios ${plan.crear.emailDomains.join(", ") || "ninguno"} · empresa de HubSpot ${plan.crear.hubspotCompanyId ?? "ninguna"}`);
  for (const c of plan.cambios) {
    const partes = Object.entries(c.data)
      .filter(([k]) => k !== "comparteDominioConId")
      .map(([k, v]) => `${k}: ${JSON.stringify((c.antes as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`);
    console.log(`  · ${nombreDe(c.id)}: cuelga de la empresa${partes.length ? ` · ${partes.join(" · ")}` : ""}`);
  }

  // ── 1. Las reuniones: el mismo dueño antes y después ─────────────────────────────────────────────────────────────────
  const dominios = [...new Set([...plan.crear.emailDomains, ...cfg.unidades.flatMap((id) => effectiveDomainsForClient(fichas.find((f) => f.id === id)!))])];
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM "FirefliesSession" s
    WHERE s."resolvedClientId" = ANY(${[...cfg.unidades]}) OR s."manualClientId" = ANY(${[...cfg.unidades]})
       OR EXISTS (SELECT 1 FROM unnest(s.participants) p WHERE split_part(lower(p), '@', 2) = ANY(${dominios}))`;
  const ids = filas.map((f) => f.id);
  const comoHoy = await reResolverReunionesDe([], { aplicar: false, tambienEstasReuniones: ids, tambienLasDeLasFichas: [...cfg.unidades] });
  const conLaEmpresa = await reResolverReunionesDe([], {
    aplicar: false,
    tambienEstasReuniones: ids,
    tambienLasDeLasFichas: [...cfg.unidades],
    ajustarFichas: (clients) => fichasConLaEmpresa(plan, clients),
    hubspot: comoHoy.hubspot,
  });
  const indice = (l: readonly ReunionQueCambia[]) => new Map(l.map((c) => [c.sessionId, c]));
  const a = indice(comoHoy.cambian);
  const b = indice(conLaEmpresa.cambian);
  const diferencias: { sessionId: string; title: string; hoy: string | null; con: string | null; porQue: string }[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const ca = a.get(id);
    const cb = b.get(id);
    const de = (ca ?? cb)!.de;
    const hoy = ca ? ca.a : de;
    const con = cb ? cb.a : de;
    const traza = (cb ?? ca)!.porQue;
    if (hoy !== con) diferencias.push({ sessionId: id, title: (ca ?? cb)!.title, hoy, con, porQue: [traza?.paso, traza?.entre].filter(Boolean).join(" · ") });
  }
  const aLaEmpresa = conLaEmpresa.cambian.filter((c) => c.a === ID_DE_LA_EMPRESA_NUEVA);
  console.log(`\n── Reuniones: ${ids.length} mirada(s) (de sus fichas, de sus dominios y las que las nombran) ──`);
  if (comoHoy.cambian.length) console.log(`  (hoy ya hay ${comoHoy.cambian.length} con el dueño atrasado, sin relación con esto: no cuentan)`);
  if (aLaEmpresa.length) abortar(`${aLaEmpresa.length} reunión(es) quedarían en la empresa: el resolver tiene un error. No sigas.`);
  if (!diferencias.length) console.log("  ✓ Ninguna reunión cambia de dueño.");
  else {
    console.log(`  ⚠ ${diferencias.length} reunión(es) cambiarían de dueño:`);
    for (const d of diferencias.slice(0, 40)) console.log(`    · «${d.title}» (${d.sessionId}): ${nombreDe(d.hoy)} → ${nombreDe(d.con)}${d.porQue ? ` (${d.porQue})` : ""}`);
    if (diferencias.length > 40) console.log(`    … y ${diferencias.length - 40} más`);
  }

  // ── 2. Lo copiado de HubSpot: a qué unidad iría cada fila (lo reparte la copia de cada hora) ───────────────────────
  if (cfg.empresaDeHubspot && cfg.desde) {
    const ctx = await buildCategorizeCtx((clients) => fichasConLaEmpresa(plan, clients));
    const reparto = repartoCon(ctx);
    const desde = cfg.desde;
    const destino = (fila: { titulo: string | null; correos: (string | null)[] }) => reparto.destino(ID_DE_LA_EMPRESA_NUEVA, fila);
    const [contactos, comunicaciones, tickets, negocios] = await Promise.all([
      prisma.contactoDeHubspot.findMany({ where: { clientId: desde, vigente: true }, select: { email: true } }),
      comunicacionesParaRepartir(desde),
      prisma.ticketDeHubspot.findMany({ where: { clientId: desde, vigente: true }, select: { asunto: true } }),
      prisma.negocioAbierto.findMany({ where: { clientId: desde, abierto: true }, select: { nombre: true } }),
    ]);
    const tabla = (titulo: string, destinos: string[]) => {
      const cuenta = new Map<string, number>();
      for (const d of destinos) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
      console.log(`  ${titulo} (${destinos.length}): ${[...cuenta].map(([id, n]) => `${nombreDe(id)} ${n}`).join(" · ") || "ninguno"}`);
    };
    console.log(`\n── Lo copiado de HubSpot que hoy está en ${nombreDe(desde)}: adónde iría ──`);
    tabla("Contactos", contactos.map((c) => destino({ titulo: null, correos: [c.email] })));
    tabla("Correos, notas y llamadas", comunicaciones.map((c) => destino({ titulo: c.asunto, correos: [c.deEmail] })));
    tabla("Tickets", tickets.map((t) => destino({ titulo: t.asunto, correos: [] })));
    tabla("Negocios abiertos", negocios.map((n) => destino({ titulo: n.nombre, correos: [] })));
    const ventas = await prisma.ventaGanada.count({ where: { clientId: desde } });
    console.log(`  Ventas ganadas (${ventas}): se quedan en ${nombreDe(desde)}. Una venta que ya es de una ficha de la empresa no se mueve sola (Cobranza y comisiones la leen ahí); solo las nuevas se reparten.`);
    console.log("  (Los correos y tickets se cuentan con su asunto y su remitente; la copia usa además sus contactos asociados en HubSpot: quedan menos en la empresa.)");
  }
  if (cfg.empresaDeHubspot && cfg.desde) {
    console.log(`\n── Lo que se apaga en ${nombreDe(cfg.desde)} al quedarse sin empresa de HubSpot ──`);
    for (const x of LO_QUE_SE_APAGA) console.log(`  · ${x}`);
  }
  if (cfg.propiasDeHubspot) {
    for (const [u, hs] of Object.entries(cfg.propiasDeHubspot)) console.log(`\n  ${nombreDe(u)} toma su empresa de HubSpot propia (${hs}): sus contactos y correos llegan en la copia siguiente.`);
  }

  if (!PIDE_APPLY) {
    console.log("\nSimulacro: no se escribió nada.");
    if (cfg.esperaOk) console.log(`⛔ ${cfg.esperaOk} Con el OK: --apply --con-ok-de-elias.`);
    return;
  }

  // ── 3. Aplicar ────────────────────────────────────────────────────────────────────────────────────────────────────
  if (diferencias.length) {
    abortar(
      cfg.soloSinMoverReuniones
        ? `Elías pidió esta empresa solo si no mueve reuniones, y mueve ${diferencias.length}. No se aplica.`
        : `${diferencias.length} reunión(es) cambiarían de dueño: revísalas (asígnalas en /sessions) y vuelve a correr el simulacro.`,
    );
  }
  if (cfg.esperaOk && !process.argv.includes("--con-ok-de-elias")) abortar(`${cfg.esperaOk} Falta --con-ok-de-elias.`);
  resolverApply({ tablas: ["Client"] });
  const ruta = guardarRespaldoJson({ empresa: cfg.clave, fichas: fichas.filter((f) => cfg.unidades.includes(f.id)) });
  console.log(`Respaldo: ${ruta}`);

  const creada = { id: await aplicarLaEmpresa(plan) };
  console.log(`\n✓ Creada «${cfg.nombre}» (${creada.id}) con ${plan.cambios.length} unidades.`);

  /* La prueba de que la base quedó como el simulacro: las mismas reuniones atrasadas que antes, ninguna más. */
  const despues = await reResolverReunionesDe([], { aplicar: false, tambienEstasReuniones: ids, tambienLasDeLasFichas: [...cfg.unidades], hubspot: comoHoy.hubspot });
  const nuevas = despues.cambian.filter((c) => (a.get(c.sessionId)?.a ?? c.de) !== c.a);
  console.log(nuevas.length ? `⚠ ${nuevas.length} reunión(es) cambian después de escribir: revisa con check:invariants.` : "✓ Después de escribir, ninguna reunión cambia de dueño.");
  console.log("Lo de HubSpot se reparte en la copia siguiente (cada hora): contactos y tickets enteros, y los correos y notas de los últimos 120 días se revisan en cada corrida. Para no esperar: scripts/sync-contactos-y-tickets.ts, scripts/sync-comunicaciones-de-hubspot.ts y scripts/sync-negocios-abiertos.ts con --apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
