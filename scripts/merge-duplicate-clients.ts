import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client as HubspotClient } from "@hubspot/api-client";
import type { Prisma } from "@prisma/client";
import { describirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { refreshAccessToken } from "@/lib/hubspot/client";
import { detectarFusion, type VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";
import { crDateParts } from "@/lib/jobs/time";
import {
  destinoUnoAUno,
  idDeHubspotFinal,
  plegarCuenta,
  plegarFicha,
  textoDeFusionDeCuenta,
  type CuentaParaFusionar,
  type FichaParaFusionar,
} from "@/lib/clients/fusion-de-empresas";

/**
 * scripts/merge-duplicate-clients.ts
 *
 * Fusiona dos `Client` que son la MISMA empresa: a la ficha que sigue (el canónico) le pasa TODO lo que cuelga de la
 * otra y después borra la otra, ya vacía. Qué datos quedan lo decide lib/clients/fusion-de-empresas.ts (puro, con
 * pruebas); este archivo mide, muestra y, con permiso, mueve las filas en UNA transacción.
 *
 * Reasigna (absorbida → canónico):
 *   · Todo lo que apunta a la ficha: proyectos, handoffs, documentos, tarjetas de contexto, conocimiento, auditorías,
 *     corridas de agentes, business cases, exploraciones de venta, usuarios externos, tareas, sugerencias, alertas de
 *     CS, ingresos variables, comisiones, ventas ganadas, filas de importación, comentarios de la escala, y los
 *     punteros sin relación (sesiones —automático y manual—, eventos, llamadas a la IA, uso de partners).
 *   · StageNote y ClientAssignment sin chocar con sus únicos: lo que choca se queda el del canónico.
 *   · Lo uno a uno (cuenta de HubSpot, señales de CS, snapshot de CS360, brief): se muda si el canónico no lo tiene.
 *   · ⭐ La CUENTA DE COBRO (2026-10-01). Si solo la absorbida tiene, se muda entera. Si las dos, la del canónico
 *     recibe servicios, cobros, alertas, bitácora, facturas soltadas, clientes de Odoo y sus facturas, toma de la otra
 *     los datos que le faltan, anota la fusión en su bitácora, y la otra se borra ya vacía. Hasta ese día el script se
 *     negaba: borrar la ficha se llevaba la cuenta en cascada con su plata (caso real: Librería Internacional).
 *
 * Y en la ficha que sigue: suma los dominios de correo (las reuniones siguen llegando: INV2), junta las notas, toma lo
 * que le falta y apunta a la empresa de HubSpot VIVA. Si las dos empresas se fusionaron en HubSpot en una tercera
 * —Librería: seis fichas dentro de 58805575479—, la que sigue apunta a esa, y los business cases y ventas que guardaban
 * un id viejo también. HubSpot se lee con un token renovado en memoria: el simulacro no escribe ni el token.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura y se imprime el plan. Para escribir hacen falta
 * `--apply`, `--firma=<correo del equipo>` y `ALLOW_PROD_WRITE=1`. Antes de la primera escritura deja un respaldo JSON
 * propio en `backups/<fecha>-merge-duplicate-clients/` (las dos fichas y las dos cuentas enteras, lo que se borra
 * entero, y el id de cada fila que se muda), además del pg_dump del guard cuando la PC lo tiene.
 *
 *   npx tsx scripts/merge-duplicate-clients.ts --canonico <id> --dup <id> [--nombre "Nombre final"]
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/merge-duplicate-clients.ts <lo mismo> --firma <correo> --apply
 *
 * Sin `--canonico`/`--dup` revisa los pares del incidente de julio (ya fusionados: salen como saltados).
 *
 * VERIFICAR después: `npm run check:invariants` (INV1, INV2, INV13) y `npx tsx scripts/backfill-resolved-client.ts`
 * (simulacro → changed=0).
 */

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
/* ⚠ Antes de la primera consulta: `pg` lee PGOPTIONS al abrir cada conexión. Sin --apply la base no se puede escribir
   ni por error. */
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=30000"]
    .filter(Boolean)
    .join(" ");
}

/** Las relaciones que se mudan cambiando UNA columna: [modelo de Prisma, columna que apunta a la ficha]. */
const SE_MUDAN = [
  ["project", "clientId"],
  ["handoff", "clientId"],
  ["clientDocument", "clientId"],
  ["clientContextCard", "clientId"],
  ["knowledge", "clientId"],
  ["audit", "clientId"],
  ["agentRun", "clientId"],
  ["businessCase", "clientId"],
  ["exploracionDeVenta", "clientId"],
  ["appUser", "clientId"],
  ["actionItem", "clientId"],
  ["canvasSuggestion", "clientId"],
  ["csAlert", "clientId"],
  ["ingresoVariable", "clientId"],
  ["comisionPartner", "clientId"],
  ["reglaComisionVendedor", "clientId"],
  ["ventaGanada", "clientId"],
  ["importacionFila", "aplicadoClientId"],
  ["escalaComentario", "clienteId"],
  /* Sin relación en el esquema: la base no las cascadea ni las protege (lib/db/punteros-al-borrar.test.ts). */
  ["firefliesSession", "resolvedClientId"],
  ["firefliesSession", "manualClientId"],
  ["timelineEvent", "clientId"],
  ["llmCall", "clientId"],
  ["partnerUsageSnapshot", "clientId"],
] as const;

/** Lo uno a uno que cuelga de la ficha: se muda si el canónico no lo tiene. */
const UNO_A_UNO = ["hubspotAccount", "clientCsSignals", "clientPartnerSnapshot", "csAccountBrief"] as const;

/** Lo que cuelga de la cuenta de cobro: se muda a la del canónico cuando las dos tienen. */
const DE_LA_CUENTA = ["servicioContratado", "cobro", "alertaCobro", "bitacoraCobro", "facturaLiberada", "facturaOdoo", "odooPartnerVinculo"] as const;

/** Las tablas que puede escribir una corrida con --apply: el guard las respalda con pg_dump antes de empezar. */
const TABLAS = [
  "Client",
  "Project",
  "Handoff",
  "ClientDocument",
  "ClientContextCard",
  "Knowledge",
  "Audit",
  "AgentRun",
  "BusinessCase",
  "ExploracionDeVenta",
  "AppUser",
  "ActionItem",
  "CanvasSuggestion",
  "CsAlert",
  "IngresoVariable",
  "ComisionPartner",
  "ReglaComisionVendedor",
  "VentaGanada",
  "ImportacionFila",
  "EscalaComentario",
  "FirefliesSession",
  "TimelineEvent",
  "LlmCall",
  "PartnerUsageSnapshot",
  "StageNote",
  "ClientAssignment",
  "HubspotAccount",
  "ClientCsSignals",
  "ClientPartnerSnapshot",
  "CsAccountBrief",
  "CuentaFinanciera",
  "ServicioContratado",
  "Cobro",
  "AlertaCobro",
  "BitacoraCobro",
  "FacturaLiberada",
  "FacturaOdoo",
  "OdooPartnerVinculo",
];

/* La forma común de los delegados de Prisma que se usan por nombre. `as unknown as`: TypeScript no puede seguir un
   índice dinámico sobre el cliente, y cada uno de estos modelos tiene `id` de texto (verificado en el esquema). */
type Delegado = {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findMany(args: { where: Record<string, unknown>; select: { id: true } }): Promise<Array<{ id: string }>>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
};
type Db = typeof prisma | Prisma.TransactionClient;
const delegado = (db: Db, modelo: string) => (db as unknown as Record<string, Delegado>)[modelo]!;

// Pares {canónico, dup} del incidente de julio, por id. Quedan como registro: un par nuevo va por argumento.
const PAIRS: { label: string; canonicalId: string; dupId: string }[] = [
  { label: "Bluesat", canonicalId: "cmpc0e02z008bxgij4ksityv4", dupId: "cmpc0dyr5007kxgijyjan7j2c" },
  { label: "Cicadex", canonicalId: "cmoi1jte2000rl8ijeh2d4jx9", dupId: "cmpc0dr1k003txgijkhh2jwrg" },
  { label: "Construtecho", canonicalId: "cmpc0edm200ftxgij3bi1vsmp", dupId: "cmpc0ec8k00f2xgijtd7a2c5o" },
  { label: "Ministerio de Economía", canonicalId: "cmpc0du6h005bxgij30eodfxe", dupId: "cmpc0e44900akxgijla2vd9ah" },
];

const CUENTA_SELECT = {
  id: true,
  tipo: true,
  viaCobro: true,
  moneda: true,
  terminosPago: true,
  estadoCuenta: true,
  excluidaOperacion: true,
  diaCobroAncla: true,
  creditoDias: true,
  responsableCobroTerceros: true,
  notas: true,
  correoCobro: true,
  razonSocial: true,
  cedulaJuridica: true,
} as const;

async function cargarFicha(id: string) {
  const c = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      industry: true,
      notes: true,
      hubspotCompanyId: true,
      emailDomains: true,
      logoUrl: true,
      logoDarkUrl: true,
      logoScale: true,
      kind: true,
      isProspect: true,
      ignoredHubspotServiceIds: true,
      canvas: true,
      canvasConfidence: true,
      ficha: true,
      tamUsd: true,
      cuentaFinanciera: { select: CUENTA_SELECT },
    },
  });
  if (!c) return null;
  const ficha: FichaParaFusionar = { ...c, tamUsd: c.tamUsd === null ? null : Number(c.tamUsd) };
  return { ficha, cuenta: c.cuentaFinanciera as CuentaParaFusionar | null, hubspotCompanyId: c.hubspotCompanyId };
}

/** Sesiones + proyectos: con cuál quedarse si nadie lo dice. Se exige que el canónico no tenga MENOS. */
async function puntaje(clientId: string) {
  const [sesiones, manuales, proyectos] = await Promise.all([
    prisma.firefliesSession.count({ where: { resolvedClientId: clientId } }),
    prisma.firefliesSession.count({ where: { manualClientId: clientId } }),
    prisma.project.count({ where: { clientId } }),
  ]);
  return { sesiones, manuales, proyectos, total: sesiones + manuales + proyectos };
}

/** HubSpot, para saber en qué empresa quedó cada id. El token se renueva EN MEMORIA: nada se escribe en la base. */
async function veredictosDeHubspot(ids: string[]): Promise<Map<string, VeredictoDeFusion>> {
  const out = new Map<string, VeredictoDeFusion>();
  if (!ids.length) return out;
  try {
    const cuenta = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { refreshToken: true } });
    if (!cuenta) throw new Error("no hay cuenta de HubSpot del sistema");
    const token = await refreshAccessToken(cuenta.refreshToken);
    const hs = new HubspotClient({ accessToken: token.access_token });
    for (const id of ids) out.set(id, await detectarFusion(hs, id));
  } catch (e) {
    console.warn(`  ⚠ No se pudo consultar HubSpot (${e instanceof Error ? e.message : e}): los ids se toman tal cual.`);
  }
  return out;
}

/** Escribe un JSON en la carpeta de respaldo y dice dónde quedó. */
function guardarRespaldo(nombre: string, datos: unknown): string {
  const carpeta = join("backups", `${crDateParts(new Date()).dateKey}-merge-duplicate-clients`);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${new Date().toISOString().replace(/[:.]/g, "-")}-${nombre}.json`);
  writeFileSync(ruta, JSON.stringify(datos, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return ruta;
}

async function processPair(p: (typeof PAIRS)[number], opciones: { nombre: string | null; firma: string | null; apply: boolean }) {
  const [canon, dup] = await Promise.all([cargarFicha(p.canonicalId), cargarFicha(p.dupId)]);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`PAR: ${p.label}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  if (!canon || !dup) {
    console.log(`  ⚠ SALTADO: ${!canon ? `el canónico ${p.canonicalId} no existe` : ""}${!dup ? ` la absorbida ${p.dupId} no existe` : ""} (¿ya se fusionaron?)`);
    return { applied: false };
  }
  const [sc, sd] = await Promise.all([puntaje(canon.ficha.id), puntaje(dup.ficha.id)]);
  console.log(`  sigue:     «${canon.ficha.name}» (${canon.ficha.id}) · sesiones ${sc.sesiones}+${sc.manuales} · proyectos ${sc.proyectos}`);
  console.log(`  absorbida: «${dup.ficha.name}» (${dup.ficha.id}) · sesiones ${sd.sesiones}+${sd.manuales} · proyectos ${sd.proyectos}`);
  if (sd.total > sc.total) {
    console.log(`  ⛔ NO SE TOCA: la absorbida tiene más sesiones y proyectos (${sd.total} > ${sc.total}). Pásalas al revés.`);
    return { applied: false };
  }

  /* ── Lo que se muda ──────────────────────────────────────────────────────────── */
  const mueven: Record<string, string[]> = {};
  for (const [modelo, columna] of SE_MUDAN) {
    const filas = await delegado(prisma, modelo).findMany({ where: { [columna]: dup.ficha.id }, select: { id: true } });
    if (filas.length) mueven[`${modelo}.${columna}`] = filas.map((f) => f.id);
  }
  /* ⛔ Una sola exploración VIVA por empresa (índice único parcial): si las dos tienen, decide una persona. */
  const vivas = await prisma.exploracionDeVenta.count({ where: { clientId: { in: [canon.ficha.id, dup.ficha.id] }, archivadaEn: null } });
  const vivasDeLaAbsorbida = await prisma.exploracionDeVenta.count({ where: { clientId: dup.ficha.id, archivadaEn: null } });
  if (vivasDeLaAbsorbida > 0 && vivas > vivasDeLaAbsorbida) {
    console.log("  ⛔ NO SE TOCA: las dos tienen una exploración de venta abierta. Archiva una y vuelve.");
    return { applied: false };
  }
  /* StageNote y ClientAssignment: lo que choca con un único del canónico se queda el del canónico. */
  const [notasDup, notasCanon, asignDup, asignCanon] = await Promise.all([
    prisma.stageNote.findMany({ where: { clientId: dup.ficha.id } }),
    prisma.stageNote.findMany({ where: { clientId: canon.ficha.id }, select: { stage: true, step: true } }),
    prisma.clientAssignment.findMany({ where: { clientId: dup.ficha.id } }),
    prisma.clientAssignment.findMany({ where: { clientId: canon.ficha.id }, select: { teamMemberId: true, targetRole: true } }),
  ]);
  const claveNota = (n: { stage: unknown; step: unknown }) => `${String(n.stage)}:${String(n.step)}`;
  const claveAsig = (a: { teamMemberId: string | null; targetRole: unknown }) => `${String(a.teamMemberId)}:${String(a.targetRole)}`;
  const notasCanonSet = new Set(notasCanon.map(claveNota));
  const asignCanonSet = new Set(asignCanon.map(claveAsig));
  const notasMueven = notasDup.filter((n) => !notasCanonSet.has(claveNota(n)));
  const notasSeVan = notasDup.filter((n) => notasCanonSet.has(claveNota(n)));
  const asignMueven = asignDup.filter((a) => !asignCanonSet.has(claveAsig(a)));
  const asignSeVan = asignDup.filter((a) => asignCanonSet.has(claveAsig(a)));

  const unoAUno: Record<string, { destino: ReturnType<typeof destinoUnoAUno>; filaDeLaAbsorbida: Record<string, unknown> | null }> = {};
  for (const modelo of UNO_A_UNO) {
    const [deCanon, deDup] = await Promise.all([
      delegado(prisma, modelo).findUnique({ where: { clientId: canon.ficha.id } }),
      delegado(prisma, modelo).findUnique({ where: { clientId: dup.ficha.id } }),
    ]);
    unoAUno[modelo] = { destino: destinoUnoAUno(!!deCanon, !!deDup), filaDeLaAbsorbida: deDup };
  }

  /* ── La cuenta de cobro ──────────────────────────────────────────────────────── */
  const fecha = crDateParts(new Date()).dateKey;
  const deLaCuenta: Record<string, string[]> = {};
  if (canon.cuenta && dup.cuenta) {
    for (const modelo of DE_LA_CUENTA) {
      const filas = await delegado(prisma, modelo).findMany({ where: { cuentaId: dup.cuenta.id }, select: { id: true } });
      if (filas.length) deLaCuenta[modelo] = filas.map((f) => f.id);
    }
  }
  const pliegueCuenta = canon.cuenta && dup.cuenta ? plegarCuenta(canon.cuenta, dup.cuenta, dup.ficha.name, fecha) : null;

  /* ── La ficha y su empresa de HubSpot ────────────────────────────────────────── */
  const pliegue = plegarFicha(canon.ficha, dup.ficha, fecha);
  const ids = [canon.hubspotCompanyId, dup.hubspotCompanyId].filter((x): x is string => !!x);
  const hub = idDeHubspotFinal(canon.hubspotCompanyId, dup.hubspotCompanyId, await veredictosDeHubspot(ids));
  const copiasDelIdViejo = hub.id && hub.reemplaza.length
    ? {
        businessCases: await prisma.businessCase.count({ where: { hubspotCompanyId: { in: hub.reemplaza } } }),
        ventas: await prisma.ventaGanada.count({ where: { hubspotCompanyId: { in: hub.reemplaza } } }),
      }
    : { businessCases: 0, ventas: 0 };

  /* ── El plan, en palabras ────────────────────────────────────────────────────── */
  console.log("\n  Pasa a la ficha que sigue:");
  const etiquetas = Object.entries(mueven).map(([k, v]) => `${k.replace(/\.(clientId|clienteId)$/, "")} ${v.length}`);
  console.log(`    ${etiquetas.join(" · ") || "nada"}`);
  if (notasDup.length) console.log(`    notas de etapa: ${notasMueven.length} pasan, ${notasSeVan.length} chocan y queda la del canónico`);
  if (asignDup.length) console.log(`    asignaciones: ${asignMueven.length} pasan, ${asignSeVan.length} chocan y queda la del canónico`);
  for (const [modelo, u] of Object.entries(unoAUno)) {
    if (u.destino === "mover") console.log(`    ${modelo}: se muda`);
    if (u.destino === "queda-el-de-la-que-sigue") console.log(`    ${modelo}: las dos tienen; queda el del canónico y el otro se va`);
  }
  console.log("\n  Cuenta de cobro:");
  if (!dup.cuenta) console.log("    la absorbida no tiene: nada que mover");
  else if (!canon.cuenta) console.log(`    solo la absorbida tiene (${dup.cuenta.id}): se muda entera a la ficha que sigue`);
  else {
    console.log(`    las dos tienen: a ${canon.cuenta.id} pasan ${Object.entries(deLaCuenta).map(([k, v]) => `${k} ${v.length}`).join(" · ") || "nada"}`);
    if (Object.keys(pliegueCuenta!.cambios).length) console.log(`    toma de la otra: ${Object.keys(pliegueCuenta!.cambios).join(", ")}`);
    for (const d of pliegueCuenta!.diferencias) console.log(`    ⚠ ${d}`);
    console.log(`    después se borra la cuenta ${dup.cuenta.id}, ya vacía, y queda la fusión anotada en la bitácora`);
  }
  console.log("\n  Ficha que sigue:");
  if (opciones.nombre) console.log(`    nombre: «${canon.ficha.name}» → «${opciones.nombre}»`);
  if (pliegue.dominiosNuevos.length) console.log(`    dominios: + ${pliegue.dominiosNuevos.join(", ")}`);
  const otros = Object.keys(pliegue.cambios).filter((k) => k !== "emailDomains");
  if (otros.length) console.log(`    toma de la otra: ${otros.join(", ")}`);
  console.log(`    HubSpot: ${canon.hubspotCompanyId ?? "—"} → ${hub.id ?? "—"} · ${hub.motivo}`);
  if (copiasDelIdViejo.businessCases || copiasDelIdViejo.ventas) {
    console.log(`    y el id viejo se cambia en ${copiasDelIdViejo.businessCases} business case(s) y ${copiasDelIdViejo.ventas} venta(s)`);
  }
  console.log(`\n  → Se BORRA «${dup.ficha.name}» (${dup.ficha.id}), ya vacía.`);

  if (!opciones.apply) return { applied: false };

  /* ── Aplicar ─────────────────────────────────────────────────────────────────── */
  const [fichaCanonEntera, fichaDupEntera, cuentaCanonEntera, cuentaDupEntera] = await Promise.all([
    prisma.client.findUnique({ where: { id: canon.ficha.id } }),
    prisma.client.findUnique({ where: { id: dup.ficha.id } }),
    canon.cuenta ? prisma.cuentaFinanciera.findUnique({ where: { id: canon.cuenta.id } }) : null,
    dup.cuenta ? prisma.cuentaFinanciera.findUnique({ where: { id: dup.cuenta.id } }) : null,
  ]);
  const antes = guardarRespaldo("antes", {
    par: p,
    firma: opciones.firma,
    fichas: { sigue: fichaCanonEntera, absorbida: fichaDupEntera },
    cuentas: { sigue: cuentaCanonEntera, absorbida: cuentaDupEntera },
    mueven,
    deLaCuenta,
    seBorranEnteras: {
      notasDeEtapa: notasSeVan,
      asignaciones: asignSeVan,
      unoAUno: Object.fromEntries(Object.entries(unoAUno).filter(([, u]) => u.destino === "queda-el-de-la-que-sigue").map(([m, u]) => [m, u.filaDeLaAbsorbida])),
    },
    hubspot: hub,
  });
  console.log(`\n  respaldo: ${antes}`);

  await prisma.$transaction(
    async (tx) => {
      const a = { canon: canon.ficha.id, dup: dup.ficha.id };
      for (const [modelo, columna] of SE_MUDAN) {
        await delegado(tx, modelo).updateMany({ where: { [columna]: a.dup }, data: { [columna]: a.canon } });
      }
      if (notasMueven.length) await tx.stageNote.updateMany({ where: { id: { in: notasMueven.map((n) => n.id) } }, data: { clientId: a.canon } });
      if (notasSeVan.length) await tx.stageNote.deleteMany({ where: { id: { in: notasSeVan.map((n) => n.id) } } });
      if (asignMueven.length) await tx.clientAssignment.updateMany({ where: { id: { in: asignMueven.map((x) => x.id) } }, data: { clientId: a.canon } });
      if (asignSeVan.length) await tx.clientAssignment.deleteMany({ where: { id: { in: asignSeVan.map((x) => x.id) } } });
      for (const [modelo, u] of Object.entries(unoAUno)) {
        if (u.destino === "mover") await delegado(tx, modelo).updateMany({ where: { clientId: a.dup }, data: { clientId: a.canon } });
      }

      /* La cuenta de cobro, ANTES de borrar la ficha: borrarla se la llevaría en cascada con sus cobros. */
      if (dup.cuenta && !canon.cuenta) {
        await tx.cuentaFinanciera.update({ where: { id: dup.cuenta.id }, data: { clientId: a.canon } });
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: dup.cuenta.id,
            tipo: "NOTA",
            contenido: `${opciones.firma} fusionó «${dup.ficha.name}» en «${opciones.nombre ?? canon.ficha.name}», que era la misma empresa: la cuenta pasó entera a esa ficha.`,
            usuarioEmail: opciones.firma!,
          },
        });
      } else if (dup.cuenta && canon.cuenta) {
        for (const modelo of DE_LA_CUENTA) {
          await delegado(tx, modelo).updateMany({ where: { cuentaId: dup.cuenta.id }, data: { cuentaId: canon.cuenta.id } });
        }
        if (Object.keys(pliegueCuenta!.cambios).length) {
          await tx.cuentaFinanciera.update({ where: { id: canon.cuenta.id }, data: pliegueCuenta!.cambios as Prisma.CuentaFinancieraUpdateInput });
        }
        const n = (m: string) => deLaCuenta[m]?.length ?? 0;
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: canon.cuenta.id,
            tipo: "NOTA",
            contenido: textoDeFusionDeCuenta(
              opciones.firma!,
              dup.ficha.name,
              {
                servicios: n("servicioContratado"),
                cobros: n("cobro"),
                alertas: n("alertaCobro"),
                bitacora: n("bitacoraCobro"),
                facturasSoltadas: n("facturaLiberada"),
                clientesDeOdoo: n("odooPartnerVinculo"),
                facturasDeOdoo: n("facturaOdoo"),
              },
              pliegueCuenta!.diferencias,
            ),
            usuarioEmail: opciones.firma!,
          },
        });
        await tx.cuentaFinanciera.delete({ where: { id: dup.cuenta.id } });
      }

      if (hub.id && hub.reemplaza.length) {
        await tx.businessCase.updateMany({ where: { hubspotCompanyId: { in: hub.reemplaza } }, data: { hubspotCompanyId: hub.id } });
        await tx.ventaGanada.updateMany({ where: { hubspotCompanyId: { in: hub.reemplaza } }, data: { hubspotCompanyId: hub.id } });
      }
      /* Borrar la absorbida, ya vacía, y DESPUÉS dejar la ficha que sigue con su nombre final: así nunca hay dos
         empresas con el mismo nombre, ni siquiera dentro de la transacción. */
      await tx.client.delete({ where: { id: a.dup } });
      await tx.client.update({
        where: { id: a.canon },
        data: {
          ...(pliegue.cambios as Prisma.ClientUpdateInput),
          hubspotCompanyId: hub.id,
          ...(opciones.nombre ? { name: opciones.nombre } : {}),
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  const despues = guardarRespaldo("despues", {
    sigue: canon.ficha.id,
    absorbidaBorrada: dup.ficha.id,
    cuentaQueSigue: canon.cuenta?.id ?? dup.cuenta?.id ?? null,
    cuentaBorrada: canon.cuenta && dup.cuenta ? dup.cuenta.id : null,
    hubspotCompanyId: hub.id,
    comoDeshacer:
      "Recrear la ficha absorbida (y su cuenta, si se borró) con los datos y los ids del respaldo «antes»; devolver a la " +
      "absorbida cada id de «mueven» y de «deLaCuenta»; recrear lo de «seBorranEnteras»; y dejar la ficha que sigue con " +
      "los dominios, notas, nombre e id de HubSpot de «antes».",
  });
  console.log(`  ✓ Fusionada: «${dup.ficha.name}» → «${opciones.nombre ?? canon.ficha.name}». Respaldo de lo hecho: ${despues}`);
  return { applied: true };
}

function argValue(flag: string): string | null {
  const conIgual = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (conIgual) return conIgual.slice(flag.length + 1).trim() || null;
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--") ? process.argv[i + 1]! : null;
}

/** Resuelve una ficha por id o por nombre. Aborta ante la ambigüedad en vez de elegir. */
async function resolverFicha(arg: string): Promise<{ id: string; name: string }> {
  const porId = await prisma.client.findUnique({ where: { id: arg }, select: { id: true, name: true } });
  if (porId) return porId;
  const exactos = await prisma.client.findMany({
    where: { name: { equals: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) throw new Error(`"${arg}" coincide con ${exactos.length} fichas con ese nombre exacto. Pasa el id.`);
  const parciales = await prisma.client.findMany({
    where: { name: { contains: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length === 0) throw new Error(`Ninguna ficha coincide con "${arg}".`);
  throw new Error(`"${arg}" coincide con ${parciales.length} fichas (${parciales.map((c) => c.name).join(", ")}). Pasa el id.`);
}

async function main() {
  const firma = argValue("--firma");
  const nombre = argValue("--nombre");
  /* ⛔ El guard de siempre: con --apply exige ALLOW_PROD_WRITE=1 contra producción y respalda las tablas con pg_dump
     antes de devolver. */
  const APPLY = resolverApply({ tablas: TABLAS });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"}`);
  if (APPLY) {
    if (!firma) throw new Error("--firma=<correo del equipo> es obligatoria con --apply: la fusión queda firmada.");
    const persona = await prisma.teamMember.findUnique({ where: { email: firma }, select: { name: true } });
    if (!persona) throw new Error(`--firma=${firma} no es de nadie del equipo.`);
  }

  const argCanon = argValue("--canonico");
  const argDup = argValue("--dup");
  if ((argCanon === null) !== (argDup === null)) throw new Error("--canonico y --dup van juntos.");
  let pares = PAIRS;
  if (argCanon && argDup) {
    const [c, d] = await Promise.all([resolverFicha(argCanon), resolverFicha(argDup)]);
    if (c.id === d.id) throw new Error("El canónico y la absorbida son la misma ficha.");
    pares = [{ label: `${c.name} ← ${d.name}`, canonicalId: c.id, dupId: d.id }];
  } else if (nombre) {
    throw new Error("--nombre va con un par (--canonico y --dup).");
  }

  let aplicados = 0;
  for (const p of pares) {
    const r = await processPair(p, { nombre, firma, apply: APPLY });
    if (r.applied) aplicados++;
  }

  console.log(`\n───────────────────────────────────────────────────────────────`);
  if (!APPLY) {
    console.log("Simulacro: no se escribió nada. Revisa el plan y los ⚠; para aplicar, el mismo comando con --firma y --apply.");
  } else {
    console.log(`✓ ${aplicados}/${pares.length} pares fusionados.`);
    console.log("VERIFICAR ahora:");
    console.log("  npm run check:invariants                         # INV1, INV2 e INV13");
    console.log("  npx tsx scripts/backfill-resolved-client.ts      # simulacro → changed=0");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
