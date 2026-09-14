/**
 * scripts/aplicar-excel-de-alexander.ts
 *
 * Deja Nexus igual al Excel de cobranza de Alexander, en una corrida, con las mismas funciones que usan las
 * pantallas de Cobranza › Importar: nada de lógica paralela. Qué se hace y en qué orden lo decide
 * lib/cobranza/libro-alex-carga-completa.ts (puro, con pruebas); este archivo lee, muestra y, con permiso,
 * escribe.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: lee el Excel en memoria y la base en solo lectura, imprime el plan y no
 * escribe NADA, ni siquiera el lote. Para escribir hacen falta las cuatro cosas en el mismo comando:
 * `--apply`, `--firma=<correo>`, `--respaldo=<carpeta fuera del repo>` y `ALLOW_PROD_WRITE=1`. Además pasa por
 * el guard de siempre (scripts/lib/guard.ts), que respalda las tablas con pg_dump antes de la primera escritura.
 *
 * Con --apply, en este orden y releyendo la base antes de cada paso:
 *   0. guarda el lote del Excel (Cobranza › Importar), o usa el que ya está con las mismas filas;
 *   1. devuelve a por cobrar las tres facturas que decidió Alex, con motivo    → cambiarEstadoCobro («Sacar de Cobrado»);
 *   2. anota los números de factura que dice el Excel                           → cambiarEstadoCobro («Es esta»);
 *   3. carga por cobrar las facturas que faltan y escribe las anotaciones       → aplicarLote («Aplicar»);
 *   4. registra las promesas de pago con fecha                                   → cambiarEstadoCobro («Registrar promesa»);
 *   5. solo con --cobrar-con-firma: registra cobradas las que el Excel da pagadas → cambiarEstadoCobroTx + bitácora.
 * Antes de cada paso guarda en --respaldo un JSON con las filas que ese paso va a tocar.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/aplicar-excel-de-alexander.ts "C:\ruta\Asientos Contables Mercury Bank & Odoo Oficial.xlsx"
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/aplicar-excel-de-alexander.ts "<ruta>.xlsx" --apply --firma=<correo> --respaldo="C:\respaldos\excel-alex"
 * Detalle en docs/RUNBOOK.md › Cobranza.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { fmtMontoLibro } from "@/lib/cobranza/libro-alex";
import { hojasDelXlsx } from "@/lib/cobranza/libro-alex-xlsx";
import { FUENTE_LIBRO_ALEX, leerLibro, type FilaLibro } from "@/lib/cobranza/libro-alex-lectura";
import { cargarContextoLibro, crearLoteDelLibro, leerLoteDelLibro } from "@/lib/cobranza/libro-alex-server";
import { descripcionDelServicioDelLibro, INICIO_DE_ANOTACION } from "@/lib/cobranza/libro-alex-aplicar";
import { aplicarLote } from "@/lib/cobranza/libro-alex-aplicar-server";
import { cambiarEstadoCobro, cambiarEstadoCobroTx, CobranzaError } from "@/lib/cobranza/mutations";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import {
  ETIQUETA_PARA_UNA_PERSONA,
  huellaDelLibro,
  leerArgumentos,
  planDeCargaCompleta,
  PREFIJO_COBRO_NUEVO,
  resumenDelPlan,
  textoDeCobradoDelExcel,
  USO_DEL_SCRIPT,
  type ArgumentosDeCarga,
  type OpcionesDelPlan,
  type PlanDeCargaCompleta,
} from "@/lib/cobranza/libro-alex-carga-completa";
import { describirDestino, resolverApply } from "./lib/guard";

/** Las tablas que puede escribir una corrida con --apply: el guard las respalda con pg_dump antes de empezar. */
const TABLAS = ["Cobro", "BitacoraCobro", "ServicioContratado", "ImportacionCobranza", "ImportacionFila", "OdooPartnerVinculo", "AlertaCobro"];

const hoyCR = () => crDateParts(new Date()).dateKey;
const monto = (n: number | null, moneda: string | null) => (n === null ? "sin monto" : fmtMontoLibro(n, moneda));

/* ── Leer ───────────────────────────────────────────────────────────────────────── */

/** Las anotaciones del libro que ya están en la bitácora: con esto el plan no las escribe dos veces. */
async function anotacionesEscritas(): Promise<OpcionesDelPlan["bitacora"]> {
  return prisma.bitacoraCobro.findMany({
    where: { contenido: { startsWith: INICIO_DE_ANOTACION } },
    select: { cuentaId: true, cobroId: true, contenido: true },
  });
}

/** El plan sobre lo que Nexus tiene AHORA. Se vuelve a pedir antes de cada paso al aplicar. */
async function planear(filas: readonly FilaLibro[], referenciaISO: string, args: ArgumentosDeCarga) {
  const [{ ctx, faltaSqlNumeros, espejoAl }, bitacora] = await Promise.all([cargarContextoLibro(), anotacionesEscritas()]);
  if (faltaSqlNumeros) {
    throw new Error("La base no tiene las columnas del número de factura (scripts/sql/2026-09-12-7-numero-de-factura.sql): no se puede planear.");
  }
  const opciones: OpcionesDelPlan = {
    hoyISO: hoyCR(),
    referenciaISO,
    firma: args.firma ?? "quien aplique",
    cobrarConFirma: args.cobrarConFirma,
    bitacora,
  };
  return { plan: planDeCargaCompleta(filas, ctx, opciones), opciones, espejoAl };
}

/** Una firma tiene que ser de alguien del equipo: la bitácora la lee Alex, no un programador. */
async function validarFirma(correo: string | null, bandera: string, obligatoria: boolean): Promise<void> {
  if (!correo) return;
  const persona = await prisma.teamMember.findUnique({ where: { email: correo }, select: { name: true } });
  if (persona) {
    console.log(`${bandera}: ${correo} (${persona.name})`);
    return;
  }
  if (obligatoria) throw new Error(`${bandera}=${correo} no es de nadie del equipo: una firma tiene que ser de una persona.`);
  console.log(`⚠ ${bandera}=${correo} no es de nadie del equipo: con --apply se rechaza.`);
}

/* ── Mostrar ────────────────────────────────────────────────────────────────────── */

function lista(titulo: string, lineas: readonly string[]) {
  if (!lineas.length) return;
  console.log(`\n  ${titulo}:`);
  for (const l of lineas) console.log(`    - ${l}`);
}

function imprimirPlan(plan: PlanDeCargaCompleta, cobrarConFirma: string | null) {
  console.log("\n══ Qué cambia en Nexus y qué queda para una persona ══");
  for (const g of resumenDelPlan(plan, cobrarConFirma)) {
    console.log(`\n· ${g.titulo}: ${g.cantidad}${g.montos.length ? ` · ${textoDeMontos(g.montos)}` : ""}`);
    if (g.cantidad) for (const n of g.notas) console.log(`    ${n}`);
  }

  console.log("\n══ Detalle ══");
  lista(
    "Vuelven a por cobrar",
    plan.reversiones.map((r) => `${r.cuentaNombre} · ${r.numero} · ${r.periodo} · ${monto(r.monto, r.moneda)} · la había confirmado ${r.confirmadoPor ?? "nadie"}`),
  );
  lista(
    "Números que se anotan",
    plan.numeros.map((n) => `${n.cuentaNombre} · ${n.periodo} · ${monto(n.monto, n.moneda)} · ${n.numero}${n.cambiaFechaEmision ? ` · fecha de emisión → ${n.patch.fechaEmision}` : ""}`),
  );
  lista(
    "Facturas que se cargan por cobrar",
    plan.cargas.map((c) => `${c.cuentaNombre} · ${c.numero} · ${c.fechaFactura} · ${monto(c.monto, c.moneda)}${c.pagadaSegunLibro ? " · pagada según el Excel" : ""}`),
  );
  lista(
    "Anotaciones sobre cobros que ya existen",
    plan.anotaciones.map((a) => `${a.cuentaNombre} · ${a.numero ?? a.cliente} · «${a.anotacion}»`),
  );
  lista(
    "Promesas de pago",
    plan.promesas.map((p) => `${p.cuentaNombre} · ${p.numero ?? "sin número"} · ${p.promesa}${p.antes ? ` (antes ${p.antes})` : ""}${p.cobroId.startsWith(PREFIJO_COBRO_NUEVO) ? " · factura que se carga en esta corrida" : ""}`),
  );
  lista(
    cobrarConFirma ? `Se registran cobradas con la firma de ${cobrarConFirma}` : "Pagadas según el Excel (no se tocan sin --cobrar-con-firma)",
    plan.pagadas.map((p) => `${p.cuentaNombre} · ${p.numero ?? "sin número"} · ${p.periodo} · ${monto(p.monto, p.moneda)} · pagada el ${p.fechaPago} · ${p.fuente}`),
  );
  const motivos = [...new Set(plan.paraUnaPersona.map((x) => x.motivo))];
  for (const motivo of motivos) {
    lista(
      `Para una persona · ${ETIQUETA_PARA_UNA_PERSONA[motivo]}`,
      plan.paraUnaPersona
        .filter((x) => x.motivo === motivo)
        .map((x) => `${x.cliente} · ${x.numero ?? "sin número"} · ${monto(x.monto, x.moneda)} — ${x.detalle}`),
    );
  }
  lista("No se carga", plan.noSeCarga.map((x) => `${x.cliente} · ${x.numero ?? "sin número"} · ${monto(x.monto, x.moneda)} — ${x.motivo}`));
}

/* ── Simulacro ──────────────────────────────────────────────────────────────────── */

const contarLotes = () => prisma.importacionCobranza.count({ where: { fuente: FUENTE_LIBRO_ALEX } });

async function simulacro(filas: readonly FilaLibro[], args: ArgumentosDeCarga) {
  const lotesAntes = await contarLotes();
  const { plan, opciones, espejoAl } = await planear(filas, hoyCR(), args);
  console.log(`Copia de Odoo al: ${espejoAl ?? "nunca corrió bien"}`);
  imprimirPlan(plan, args.cobrarConFirma);

  /* La prueba de que aplicar dos veces no hace nada: el plan sobre cómo quedaría Nexus. */
  const segunda = planDeCargaCompleta(filas, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
  console.log(
    segunda.sinCambios
      ? "\n✓ Si se aplicara, una segunda corrida no cambiaría nada."
      : `\n⚠ Una segunda corrida todavía cambiaría algo: ${segunda.reversiones.length} reversiones, ${segunda.numeros.length} números, ${segunda.cargas.length} cargas, ${segunda.anotaciones.length} anotaciones, ${segunda.promesas.length} promesas.`,
  );
  const lotesDespues = await contarLotes();
  console.log(`Simulacro: no se escribió nada. Lotes del Excel en la base: ${lotesAntes} antes y ${lotesDespues} después.`);
  console.log("Para aplicar: ver docs/RUNBOOK.md › Cobranza › «Aplicar el Excel de Alexander».");
}

/* ── Aplicar ────────────────────────────────────────────────────────────────────── */

type Respaldo = (fase: string, cobroIds: readonly string[], extra?: Record<string, unknown>) => Promise<void>;

/** El lote de este mismo Excel si ya se subió (misma huella); si no, se guarda. */
async function loteDelExcel(filas: readonly FilaLibro[], nombre: string, datos: ArrayBuffer, firma: string) {
  const huella = huellaDelLibro(filas);
  const lotes = await prisma.importacionCobranza.findMany({
    where: { fuente: FUENTE_LIBRO_ALEX, estado: { not: "DESCARTADO" } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  for (const { id } of lotes) {
    const lote = await leerLoteDelLibro(id);
    if (lote && lote.filasIlegibles === 0 && huellaDelLibro(lote.filas) === huella) {
      console.log(`0 · El Excel ya está subido: lote ${lote.id}, de ${lote.creadoPor}, el ${lote.createdAt}. No se sube otra vez.`);
      return lote;
    }
  }
  const nuevo = await crearLoteDelLibro({ nombre, datos }, firma);
  console.log(`0 · Lote guardado: ${nuevo.id} (${nuevo.totalFilas} filas), a nombre de ${firma}.`);
  return nuevo;
}

async function aplicar(filas: readonly FilaLibro[], args: ArgumentosDeCarga, nombre: string, datos: ArrayBuffer) {
  const { firma, respaldo: carpeta } = args;
  if (!firma || !carpeta) throw new Error("--apply sin --firma o sin --respaldo: no se escribe nada.");
  mkdirSync(carpeta, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const respaldar: Respaldo = async (fase, cobroIds, extra = {}) => {
    const ids = cobroIds.filter((id) => !id.startsWith(PREFIJO_COBRO_NUEVO));
    const cobros = ids.length ? await prisma.cobro.findMany({ where: { id: { in: [...ids] } } }) : [];
    const ruta = join(carpeta, `${sello}-${fase}.json`);
    writeFileSync(ruta, JSON.stringify({ fase, archivo: nombre, firma, guardadoEn: new Date().toISOString(), cobros, ...extra }, null, 2));
    console.log(`   respaldo antes de escribir: ${ruta} (${cobros.length} cobros)`);
  };
  const rechazos: string[] = [];
  const intentar = async (que: string, hacer: () => Promise<unknown>) => {
    try {
      await hacer();
      return true;
    } catch (e) {
      if (!(e instanceof CobranzaError)) throw e;
      rechazos.push(`${que}: ${e.message}`);
      return false;
    }
  };

  const lote = await loteDelExcel(filas, nombre, datos, firma);
  /* «Este mes» de una anotación es el del día en que se subió el lote, igual que en la pantalla. */
  const referenciaISO = crDateParts(new Date(lote.createdAt)).dateKey;

  /* 1 · Las tres de Alex */
  let { plan } = await planear(filas, referenciaISO, args);
  console.log(`\n1 · Vuelven a por cobrar: ${plan.reversiones.length}`);
  if (plan.reversiones.length) {
    await respaldar("1-vuelven-a-por-cobrar", plan.reversiones.map((r) => r.cobroId));
    for (const r of plan.reversiones) await intentar(`${r.cuentaNombre} ${r.numero}`, () => cambiarEstadoCobro(r.cobroId, r.patch, firma));
  }

  /* 2 · Los números del Excel */
  ({ plan } = await planear(filas, referenciaISO, args));
  console.log(`2 · Números que se anotan: ${plan.numeros.length}`);
  if (plan.numeros.length) {
    await respaldar("2-numeros", plan.numeros.map((n) => n.cobroId));
    for (const n of plan.numeros) await intentar(`${n.cuentaNombre} ${n.numero}`, () => cambiarEstadoCobro(n.cobroId, n.patch, firma));
  }

  /* 3 · Las facturas que faltan y las anotaciones */
  ({ plan } = await planear(filas, referenciaISO, args));
  const facturas = plan.pedido.grupos.reduce((n, g) => n + g.facturas.length, 0);
  console.log(`3 · Facturas que se cargan: ${facturas} · anotaciones: ${plan.pedido.anotaciones.length}`);
  if (facturas || plan.pedido.anotaciones.length) {
    const cuentas = [...new Set(plan.pedido.grupos.map((g) => g.cuentaId))];
    const servicios = await prisma.servicioContratado.findMany({
      where: { cuentaId: { in: cuentas }, descripcion: { in: [descripcionDelServicioDelLibro("USD"), descripcionDelServicioDelLibro("CRC")] } },
    });
    const loteAntes = await prisma.importacionCobranza.findUnique({ where: { id: lote.id }, select: { id: true, aplicadoEn: true, aplicadoPor: true, resumen: true } });
    await respaldar("3-cargas", plan.anotaciones.flatMap((a) => (a.cobroId ? [a.cobroId] : [])), { servicios, lote: loteAntes, pedido: plan.pedido });
    const r = await aplicarLote(lote.id, plan.pedido, firma);
    if (!r) throw new Error(`El lote ${lote.id} desapareció en el medio: no se cargó nada.`);
    console.log(`   cargadas ${r.cargadas.length} · ya estaban ${r.yaEstaban.length} · anotaciones ${r.anotacionesEscritas} · rechazadas ${r.rechazos.length}`);
    for (const x of r.rechazos) rechazos.push(`${x.cliente} ${x.numero ?? ""}: ${x.motivo}`);
  }

  /* 4 · Las promesas con fecha */
  ({ plan } = await planear(filas, referenciaISO, args));
  const promesas = plan.promesas.filter((p) => !p.cobroId.startsWith(PREFIJO_COBRO_NUEVO));
  console.log(`4 · Promesas de pago: ${promesas.length}`);
  if (promesas.length) {
    await respaldar("4-promesas", promesas.map((p) => p.cobroId));
    for (const p of promesas) await intentar(`${p.cuentaNombre} ${p.numero ?? ""}`, () => cambiarEstadoCobro(p.cobroId, { promesaPago: p.promesa }, firma));
  }

  /* 5 · Solo con la firma de quien da la plata por entrada */
  const firmaDeCobro = args.cobrarConFirma;
  if (firmaDeCobro) {
    ({ plan } = await planear(filas, referenciaISO, args));
    const pagadas = plan.pagadas.filter((p) => !p.cobroId.startsWith(PREFIJO_COBRO_NUEVO));
    console.log(`5 · Se registran cobradas con la firma de ${firmaDeCobro}: ${pagadas.length}`);
    if (pagadas.length) {
      await respaldar("5-cobradas", pagadas.map((p) => p.cobroId));
      for (const p of pagadas) {
        await intentar(`${p.cuentaNombre} ${p.numero ?? ""}`, () =>
          prisma.$transaction(async (tx) => {
            /* El chokepoint firma confirmadoPor con esta firma (INV3) y cierra las alertas del cobro; la línea de la
               bitácora dice de dónde sale el pago, en la misma transacción. */
            await cambiarEstadoCobroTx(tx, p.cobroId, { estado: "COBRADO", fechaCobro: p.fechaPago }, firmaDeCobro);
            await tx.bitacoraCobro.create({
              data: { cuentaId: p.cuentaId, cobroId: p.cobroId, tipo: "NOTA", contenido: textoDeCobradoDelExcel(p, firmaDeCobro), usuarioEmail: firmaDeCobro },
            });
          }),
        );
      }
    }
  } else {
    console.log("5 · Pagadas según el Excel: no se tocan (sin --cobrar-con-firma).");
  }

  /* Lo que queda, y la prueba de que otra corrida no haría nada */
  ({ plan } = await planear(filas, referenciaISO, args));
  imprimirPlan(plan, args.cobrarConFirma);
  lista("Rechazos de esta corrida", rechazos);
  console.log(
    plan.sinCambios
      ? "\n✓ Aplicado. Correrlo de nuevo no cambia nada."
      : "\n⚠ Aplicado, pero todavía quedan cambios pendientes (mirá los rechazos): correrlo de nuevo los reintenta.",
  );
}

/* ── Entrada ────────────────────────────────────────────────────────────────────── */

async function main() {
  const leidos = leerArgumentos(process.argv.slice(2), process.env, process.cwd());
  if (!leidos.ok) {
    console.error(`\n✗ ${leidos.error}\n\n${USO_DEL_SCRIPT}`);
    process.exitCode = 1;
    return;
  }
  const args = leidos.args;
  /* ⛔ El guard de siempre, además de las cuatro llaves de leerArgumentos: con --apply exige ALLOW_PROD_WRITE=1
     contra producción y respalda las tablas con pg_dump antes de devolver. Sin --apply devuelve false y no hace nada. */
  const APPLY = resolverApply({ tablas: TABLAS });
  if (APPLY !== args.aplicar) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");

  const bytes = readFileSync(args.archivo);
  const datos = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(datos).set(bytes);
  const { filas } = leerLibro(await hojasDelXlsx(datos));
  if (!filas.length) throw new Error("No encontré ninguna pestaña del libro de cobranza en ese Excel.");

  console.log(`Excel: ${basename(args.archivo)} · ${filas.length} filas · sha256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${args.aplicar ? "APLICAR" : "SIMULACRO (no escribe)"} · hoy ${hoyCR()}`);
  await validarFirma(args.firma, "--firma", args.aplicar);
  await validarFirma(args.cobrarConFirma, "--cobrar-con-firma", args.aplicar);

  if (args.aplicar) await aplicar(filas, args, basename(args.archivo), datos);
  else await simulacro(filas, args);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
