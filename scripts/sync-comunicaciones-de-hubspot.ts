/**
 * scripts/sync-comunicaciones-de-hubspot.ts
 *
 * Trae los correos, las notas y las llamadas de HubSpot de las empresas de Nexus (clientes y prospectos) y de sus
 * contactos a `ComunicacionDeHubspot` (iniciativa B; plan en docs/correos-en-el-contexto-plan.md). Es la carga inicial:
 * de ahí en adelante lo mantiene el job `comunicaciones-hubspot` cada hora. Solo LEE HubSpot.
 *
 * Simulacro por defecto: lee los 120 días, arma el plan y lo cuenta por cliente (sin Wherex), sin escribir nada. Dice
 * cuántos correos enviados pasarían el filtro de compromisos y cuánto costaría leerlos al mes. Escribe la base solo con
 * `--apply` + ALLOW_PROD_WRITE=1.
 *
 * Requisito para `--apply`: scripts/sql/2026-10-18-comunicaciones-de-hubspot.sql aplicado. El simulacro no lo necesita
 * (si falta la tabla, cuenta todo como nuevo).
 *
 * Uso (PowerShell):
 *   npx tsx scripts/sync-comunicaciones-de-hubspot.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-comunicaciones-de-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { copiarComunicaciones, type ResultadoDelTipo } from "@/lib/comunicaciones/copia-server";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";

/** Haiku 4.5: US$1 por millón de tokens de entrada y US$5 de salida (lib/ai/precios.ts). Por correo, lo medido al armar el pedido. */
const TOKENS_POR_CORREO = { entrada: 1_500, salida: 300 };
const USD_POR_CORREO = (TOKENS_POR_CORREO.entrada * 1 + TOKENS_POR_CORREO.salida * 5) / 1_000_000;

function linea(nombre: string, m: ResultadoDelTipo) {
  if (m.sinPermiso) return `  ${nombre}: SIN PERMISO en HubSpot (falta sales-email-read): no se guarda ninguno`;
  return (
    `  ${nombre}: ${m.leidos} leídos · ${m.creados} nuevos · ${m.actualizados} con cambios · ${m.sinCambio} sin cambio` +
    ` · ${m.deNadie} de nadie de Nexus · ${m.sinTexto} sin texto` +
    (m.ambiguas ? ` · ⚠ ${m.ambiguas} de dos clientes (no se guardan)` : "") +
    (m.ilegibles ? ` · ⚠ ${m.ilegibles} sin asociaciones legibles` : "") +
    (m.completa ? "" : " · (búsqueda incompleta: la sigue la corrida siguiente)")
  );
}

async function main() {
  const apply = resolverApply({ tablas: ["ComunicacionDeHubspot", "CronJobState"] });
  console.log(`\nComunicaciones de HubSpot${apply ? "" : "  (simulacro: solo lee)"}\n`);
  let r: Awaited<ReturnType<typeof copiarComunicaciones>>;
  try {
    r = await copiarComunicaciones({ escribir: apply, desdeElPrincipio: !apply });
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      console.log("Falta la tabla ComunicacionDeHubspot: aplica scripts/sql/2026-10-18-comunicaciones-de-hubspot.sql primero.");
      return;
    }
    throw e;
  }
  if (r.locked) {
    console.log("Otra corrida tiene el candado (el job o la otra PC). No se hizo nada.");
    return;
  }
  console.log(`  empresas de Nexus con su empresa de HubSpot: ${r.empresas}`);
  console.log(linea("correos", r.porTipo.correo));
  console.log(linea("notas", r.porTipo.nota));
  console.log(linea("llamadas", r.porTipo.llamada));

  const ids = [...r.porCliente.keys()];
  const nombres = new Map((await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, kind: true } })).map((c) => [c.id, c]));
  const filas = [...r.porCliente.entries()]
    .map(([id, n]) => ({ id, nombre: nombres.get(id)?.name ?? id, kind: nombres.get(id)?.kind ?? "?", ...n, total: n.correo + n.nota + n.llamada }))
    .filter((f) => !/wherex/i.test(f.nombre))
    .sort((a, b) => b.total - a.total);
  console.log(`\n  Por cliente (sin Wherex), ${filas.length} con algo:`);
  console.log(`  ${"Cliente".padEnd(40)} ${"tipo".padEnd(10)} correos  notas  llamadas`);
  for (const f of filas) console.log(`  ${f.nombre.slice(0, 40).padEnd(40)} ${f.kind.padEnd(10)} ${String(f.correo).padStart(7)} ${String(f.nota).padStart(6)} ${String(f.llamada).padStart(9)}`);

  const porMes = Math.round((r.correosConFechaOCompromiso / 120) * 30);
  console.log(`\n  Correos enviados con una fecha o un compromiso en los 120 días: ${r.correosConFechaOCompromiso} (~${porMes} al mes)`);
  console.log(`  De los últimos 14 días (los que se leerían ya): ${r.correosParaLeer}`);
  console.log(`  Costo estimado de leer sus compromisos: ~US$${(porMes * USD_POR_CORREO).toFixed(2)} al mes (US$${USD_POR_CORREO.toFixed(4)} por correo, Haiku 4.5)`);
  for (const e of r.errores) console.log(`  ⚠ ${e}`);
  if (!apply) console.log("\n(simulacro: no se escribió nada. Con --apply se guarda y se fija el punto de partida.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
