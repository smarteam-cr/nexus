/**
 * scripts/partner-cambios-de-registro.ts — SIMULACRO del cambio de registro de Partner Clients.
 *
 * Dice qué clientes pasarían de un registro INACTIVO al ACTIVO que coincide con ellos en la
 * próxima corrida del sync (lib/cs/partner-cambio-de-registro.ts), cuáles se quedarían donde
 * están con un aviso (dos registros activos, varios candidatos, sin dato), y cuántas semanas de
 * historial de uso pasarían con cada uno. Sin `--apply` solo lee: la conexión nace de solo lectura y
 * Postgres rechaza cualquier escritura.
 *
 * El cambio lo hace el sync: el job diario `cs-partner-daily`, «Actualizar partner» en Éxito del
 * cliente, o este script con `--apply` (DESPUÉS del deploy), que corre el sync como el job diario
 * —refresca los registros y pasa a los clientes— sin crear fichas.
 *
 *   npx tsx scripts/partner-cambios-de-registro.ts                          simulacro
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/partner-cambios-de-registro.ts --apply
 *
 * ⚠ Lee HubSpot con el token del sistema. Si el token está por vencer, el cliente de HubSpot lo
 *   quiere renovar y guardar, y la conexión de solo lectura no lo deja: el simulacro dice que no
 *   trajo registros. Volver a correrlo un rato después (producción lo renueva sola).
 */
import "dotenv/config";
import "./lib/permitir-server-only";

/* ⛔ El simulacro no puede escribir ni por error. `pg` lee PGOPTIONS al abrir cada conexión, y la primera se
   abre con la primera consulta, más abajo. */
const APLICAR = process.argv.includes("--apply");
if (!APLICAR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=20000"]
    .filter(Boolean)
    .join(" ");
}

import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { fetchAllPartnerClients } from "@/lib/hubspot/partner-clients";
import {
  activoEnHubspot,
  matchPorEvidencia,
  mensajeSinElegir,
  planearCambiosDeRegistro,
} from "@/lib/cs/partner-cambio-de-registro";
import { PARTNER_CREATE_SKIP, syncPartnerClients } from "@/lib/cs/partner-sync";
import { describirDestino, resolverApply } from "./lib/guard";

const estado = (a: boolean | null) => (a === true ? "activo" : a === false ? "inactivo" : "sin dato");

async function aplicar() {
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (ESCRIBE)`);
  const r = await syncPartnerClients({ createClients: false, cambiarRegistros: true });
  if (r.locked) return console.log("⛔ Otra corrida del sync tiene el lock: vuelve a correrlo en unos minutos.");
  if (!r.supported) return console.log("⛔ La app de HubSpot no tiene el permiso de Partner Clients (403).");
  console.log(`Registros: ${r.total} · asociaciones ${r.associationsOk ? "confiables" : "PARCIALES (no se cambió nada)"}`);
  console.log(`\n— Pasaron a su registro activo (${r.cambiosDeRegistro.length}) —`);
  for (const c of r.cambiosDeRegistro) {
    console.log(`  ${c.cliente ?? c.clientId} (${c.clientId}): ${c.desde} → ${c.hacia} (por ${c.via}) · ${c.semanasDeHistorial} semana(s) de historial`);
  }
  console.log(`\n— No se movieron, con aviso (${r.cambiosSinElegir.length}) —`);
  for (const c of r.cambiosSinElegir) console.log(`  ${mensajeSinElegir(c, c.cliente)}`);
  const fallidos = r.errors.filter((e) => e.startsWith("no se pudo pasar"));
  if (fallidos.length) console.log(`\n— No se pudieron pasar (${fallidos.length}) —`);
  for (const e of fallidos) console.log(`  ${e}`);
}

async function main() {
  // Las tablas que escribe el sync: con respaldo antes de tocarlas (B-06).
  if (resolverApply({ tablas: ["ClientPartnerSnapshot", "PartnerUsageSnapshot", "CsAccountBrief", "CronJobState"] })) return aplicar();
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (solo lectura)`);
  const fetched = await fetchAllPartnerClients();
  if (!fetched.supported) {
    console.log("⛔ La app de HubSpot no tiene el permiso de Partner Clients (403).");
    return;
  }
  if (fetched.records.length === 0) {
    console.log("⛔ HubSpot no devolvió registros (API caída o token por renovar). No se puede simular.");
    return;
  }
  console.log(`Registros en HubSpot: ${fetched.records.length} · asociaciones ${fetched.associationsOk ? "confiables" : "PARCIALES (el sync no cambiaría nada)"}`);

  const clients = await prisma.client.findMany({
    where: { ...CS_CLIENT_WHERE },
    select: { id: true, name: true, hubspotCompanyId: true, emailDomains: true },
  });
  // Como el sync: la company de cualquier ficha (prospectos y aliados incluidos).
  const duenoDeLaEmpresa = new Map(
    (await prisma.client.findMany({ where: { hubspotCompanyId: { not: null } }, select: { id: true, hubspotCompanyId: true } })).map(
      (c) => [c.hubspotCompanyId!, c.id] as const,
    ),
  );
  const porCompany = new Map<string, string>();
  const porDominio = new Map<string, string>();
  for (const c of clients) {
    if (c.hubspotCompanyId) porCompany.set(c.hubspotCompanyId, c.id);
    for (const d of c.emailDomains) porDominio.set(d.toLowerCase(), c.id);
  }
  const nombre = new Map(clients.map((c) => [c.id, c.name]));
  const snapshots = await prisma.clientPartnerSnapshot.findMany({ select: { hubspotPartnerClientId: true, clientId: true } });
  const vinculos = new Map<string, string>();
  for (const s of snapshots) if (s.clientId) vinculos.set(s.hubspotPartnerClientId, s.clientId);

  const registros = fetched.records.map((r) => ({
    id: r.id,
    activo: activoEnHubspot(r.properties),
    associatedCompanyIds: r.associatedCompanyIds,
    domain: (r.resolved.domain ?? r.resolved.domainFallback ?? "").toLowerCase() || null,
  }));
  const registroPorId = new Map(registros.map((r) => [r.id, r]));
  const plan = planearCambiosDeRegistro({ registros, vinculos, porCompany, porDominio, asociacionesConfiables: fetched.associationsOk, duenoDeLaEmpresa });

  console.log(`\n— Pasarían a su registro activo (${plan.cambios.length}) —`);
  for (const c of plan.cambios) {
    const [semanasNuevo, semanasViejo] = await Promise.all([
      prisma.partnerUsageSnapshot.count({ where: { hubspotPartnerClientId: c.hacia, clientId: null } }),
      prisma.partnerUsageSnapshot.count({ where: { hubspotPartnerClientId: c.desde, clientId: c.clientId } }),
    ]);
    const viejo = registroPorId.get(c.desde);
    const nuevo = registroPorId.get(c.hacia);
    const tieneSnapshot = snapshots.some((s) => s.hubspotPartnerClientId === c.hacia);
    console.log(`  ${nombre.get(c.clientId) ?? c.clientId} (${c.clientId})`);
    console.log(`    de ${c.desde} (${estado(viejo?.activo ?? null)}, dominio ${viejo?.domain ?? "—"}, companies ${viejo?.associatedCompanyIds.join(",") || "—"})`);
    console.log(`    a  ${c.hacia} (${estado(nuevo?.activo ?? null)}, dominio ${nuevo?.domain ?? "—"}, companies ${nuevo?.associatedCompanyIds.join(",") || "—"}) · coincide por ${c.via === "company" ? "company" : "dominio"}${tieneSnapshot ? "" : " · se crearía su snapshot"}`);
    console.log(`    historial: ${semanasNuevo} semana(s) del registro nuevo pasan al cliente; ${semanasViejo} del viejo dejan de ser suyas`);
    // El viejo, ya suelto: ¿sigue apuntando al cliente (queda en silencio) o a nada?
    const despues = viejo ? matchPorEvidencia(viejo, porCompany, porDominio) : null;
    console.log(
      `    el registro viejo, suelto: ${despues ? `coincide con ${despues.clientId === c.clientId ? "el mismo cliente (queda sin vincular, sin aviso)" : `OTRO cliente: ${nombre.get(despues.clientId) ?? despues.clientId}`}` : "no coincide con nadie (inactivo: no crea cliente)"}`,
    );
  }

  console.log(`\n— No se mueven, con aviso (${plan.sinElegir.length}) —`);
  for (const s of plan.sinElegir) console.log(`  ${mensajeSinElegir(s, nombre.get(s.clientId) ?? null)}`);

  // Efecto de la otra regla nueva: un registro INACTIVO sin cliente ya no crea uno.
  const conCambio = new Set(plan.cambios.flatMap((c) => [c.desde, c.hacia]));
  const nombreDelRegistro = (id: string) => {
    const rec = fetched.records.find((x) => x.id === id);
    return rec?.resolved.clientName?.trim() || rec?.resolved.accountName?.trim() || registroPorId.get(id)?.domain || `Partner ${id}`;
  };
  const inactivosQueCrearian = registros.filter(
    (r) =>
      r.activo === false &&
      !PARTNER_CREATE_SKIP.test(nombreDelRegistro(r.id)) &&
      !vinculos.has(r.id) &&
      !conCambio.has(r.id) &&
      (r.domain || r.associatedCompanyIds.length > 0) &&
      !matchPorEvidencia(r, porCompany, porDominio),
  );
  console.log(`\n— Registros inactivos sin cliente que antes podían crear uno y ya no (${inactivosQueCrearian.length}) —`);
  for (const r of inactivosQueCrearian) console.log(`  ${r.id} · ${nombreDelRegistro(r.id)} · dominio ${r.domain ?? "—"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
