/**
 * scripts/cargar-cuenta-desde-mercury.ts
 *
 * Carga en Nexus una empresa con lo que Mercury ya le facturó: le abre la cuenta de cobro si no tiene, le empareja sus
 * clientes de Mercury y carga un cobro por cada factura del año. El gemelo de scripts/cargar-cuenta-desde-odoo.ts. Qué
 * entra lo decide lib/cobranza/carga-desde-mercury.ts (puro, con pruebas); este archivo lee, muestra y, con permiso,
 * escribe por los chokepoints de siempre: `createCuenta`, `confirmarClienteMercury` (que anota la sociedad de Mercury
 * de la cuenta y deja su bitácora) y `cambiarEstadoCobroTx` (que firma lo facturado, el número, la sociedad y lo
 * cobrado).
 *
 * Nació el 2026-10-12 para Patagonia Camp, el Ministerio de Economía e Intercert, que tenían facturas en Mercury y
 * ninguna cuenta en Nexus, y para emparejar MSC Payroll y ALFA+, que tenían cuenta pero no su cliente de Mercury.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura y se imprime el plan sin escribir nada. Para escribir
 * hacen falta `--apply`, `--firma=<correo del equipo>` y `ALLOW_PROD_WRITE=1`.
 * ⛔ Nada de esto escribe en Mercury: se lee la copia que ya está en la base.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/cargar-cuenta-desde-mercury.ts "--empresa=Patagonia Camp" --clientes=017f8df6 --anio=2026 --firma=<correo> --cobrar-con-firma=<correo>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-cuenta-desde-mercury.ts <lo mismo> --apply
 *
 * `--clientes`: los ids de los clientes de Mercury, o su comienzo (al menos 6 letras), separados por coma. El
 * simulacro sin `--clientes` lista los clientes de Mercury sin cuenta, con su id.
 * `--cobrar-con-firma`: las facturas que Mercury da pagadas entran COBRADAS, confirmadas por esa persona (INV3). Sin
 * esa bandera entran por cobrar.
 *
 * El respaldo propio, además del de pg_dump: antes de escribir guarda en JSON los clientes de Mercury que se van a
 * emparejar, y al terminar los ids de lo que se creó con cómo deshacerlo, en
 * `backups/<AAAA-MM-DD>-cargar-cuenta-desde-mercury/` (fuera de git).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { createCuenta, cambiarEstadoCobroTx, CobranzaError } from "@/lib/cobranza/mutations";
import { cuentaCreateSchema } from "@/lib/cobranza/schema";
import { cargarEstadoMercury, confirmarClienteMercury, MercuryServicioError } from "@/lib/cobranza/mercury/servicio";
import { entradasDeFacturas } from "@/lib/cobranza/mercury/diferencias";
import { numeroDeMercury } from "@/lib/cobranza/mercury/espejo";
import { planDeCargaDesdeMercury, textoDeCargaDesdeMercury, type CobroDesdeMercury, type PlanDeCargaDesdeMercury } from "@/lib/cobranza/carga-desde-mercury";
import { describirDestino, resolverApply } from "./lib/guard";

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
/* ⚠ Antes de la primera consulta: `pg` lee PGOPTIONS al abrir cada conexión. Sin --apply la base no se puede escribir
   ni por error. */
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=30000"]
    .filter(Boolean)
    .join(" ");
}

/** Las tablas que puede escribir una corrida con --apply: el guard las respalda con pg_dump antes de empezar. */
const TABLAS = ["CuentaFinanciera", "OdooPartnerVinculo", "ClienteMercury", "ServicioContratado", "Cobro", "BitacoraCobro", "AlertaCobro"];

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const descripcionDelServicio = (moneda: string) => `Facturación importada de Mercury (${moneda})`;
const monto = (n: number, moneda: string) => `${moneda === "USD" ? "US$" : "₡"}${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

/* ── Argumentos ─────────────────────────────────────────────────────────────────── */

function arg(nombre: string): string | null {
  const x = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return x ? x.slice(nombre.length + 3).trim() || null : null;
}

function leerArgumentos() {
  const empresa = arg("empresa");
  const clientes = (arg("clientes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const anio = Number(arg("anio") ?? crDateParts(new Date()).dateKey.slice(0, 4));
  const tipo = (arg("tipo") ?? "INTERNACIONAL").toUpperCase();
  const moneda = (arg("moneda") ?? "USD").toUpperCase();
  if (clientes.some((c) => c.length < 6)) throw new Error("Cada id de --clientes necesita al menos 6 letras: con menos puede ser de dos clientes.");
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("--anio tiene que ser un año, como 2026.");
  if (tipo !== "NACIONAL" && tipo !== "INTERNACIONAL") throw new Error("--tipo es NACIONAL o INTERNACIONAL.");
  if (moneda !== "USD" && moneda !== "CRC") throw new Error("--moneda es USD o CRC.");
  const respaldo = join("backups", `${crDateParts(new Date()).dateKey}-cargar-cuenta-desde-mercury`);
  return { empresa, clientes, anio, tipo, moneda, firma: arg("firma"), firmaDeCobro: arg("cobrar-con-firma"), respaldo } as const;
}

/** Escribe un JSON en la carpeta de respaldo y dice dónde quedó. */
function guardarRespaldo(carpeta: string, nombre: string, datos: unknown): void {
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${new Date().toISOString().replace(/[:.]/g, "-")}-${nombre}.json`);
  writeFileSync(ruta, JSON.stringify(datos, null, 2));
  console.log(`   respaldo: ${ruta}`);
}

/** Una firma tiene que ser de alguien del equipo: la bitácora la lee Alex, no un programador. */
async function validarFirma(correo: string | null, bandera: string, obligatoria: boolean): Promise<void> {
  if (!correo) {
    if (obligatoria) throw new Error(`${bandera} es obligatoria con --apply: todo lo que se escribe queda firmado.`);
    return;
  }
  const persona = await prisma.teamMember.findUnique({ where: { email: correo }, select: { name: true } });
  if (!persona) throw new Error(`${bandera}=${correo} no es de nadie del equipo: una firma tiene que ser de una persona.`);
  console.log(`${bandera}: ${correo} (${persona.name})`);
}

/** La empresa por id o por nombre. ⛔ Ante dos que coinciden, aborta: adivinar sería cargar la plata a la equivocada. */
async function resolverEmpresa(texto: string) {
  const sel = { id: true, name: true, kind: true, cuentaFinanciera: { select: { id: true, tipo: true, viaCobro: true } } } as const;
  const porId = await prisma.client.findUnique({ where: { id: texto }, select: sel });
  if (porId) return porId;
  const exactas = await prisma.client.findMany({ where: { name: { equals: texto, mode: "insensitive" } }, select: sel });
  if (exactas.length === 1) return exactas[0]!;
  if (exactas.length > 1) throw new Error(`«${texto}» es el nombre de ${exactas.length} empresas: pasa el id.`);
  const parecidas = await prisma.client.findMany({ where: { name: { contains: texto, mode: "insensitive" } }, select: sel });
  if (parecidas.length === 1) return parecidas[0]!;
  if (!parecidas.length) throw new Error(`Ninguna empresa de Nexus se llama «${texto}».`);
  throw new Error(`«${texto}» coincide con ${parecidas.length} empresas (${parecidas.map((c) => c.name).join(", ")}): pasa el id.`);
}

/** Los clientes de Mercury pedidos, por id o por su comienzo. ⛔ Uno que coincide con dos aborta. */
async function resolverClientes(pedidos: readonly string[]) {
  const todos = await prisma.clienteMercury.findMany({
    where: { estadoEspejo: "VIGENTE" },
    select: { mercuryCustomerId: true, nombre: true, cuentaId: true, ignorado: true, cuenta: { select: { client: { select: { name: true } } } } },
  });
  return pedidos.map((p) => {
    const encontrados = todos.filter((c) => c.mercuryCustomerId.toLowerCase().startsWith(p.toLowerCase()));
    if (!encontrados.length) throw new Error(`Ningún cliente de Mercury tiene el id «${p}»: aprieta «Actualizar desde Mercury» y vuelve a correr.`);
    if (encontrados.length > 1) throw new Error(`«${p}» es el comienzo de ${encontrados.length} clientes de Mercury: pasa más letras del id.`);
    return encontrados[0]!;
  });
}

/** Los clientes de Mercury que no son de ninguna cuenta, con sus facturas del año: lo que el simulacro sin --clientes lista. */
async function listarSinCuenta(anio: number) {
  const sinCuenta = await prisma.clienteMercury.findMany({
    where: { estadoEspejo: "VIGENTE", cuentaId: null, ignorado: false },
    select: { mercuryCustomerId: true, nombre: true, pais: true },
    orderBy: { nombre: "asc" },
  });
  const facturas = await prisma.facturaMercury.findMany({
    where: { mercuryCustomerId: { in: sinCuenta.map((c) => c.mercuryCustomerId) }, estadoEspejo: "VIGENTE", invoiceDate: { gte: dia(`${anio}-01-01`) } },
    select: { mercuryCustomerId: true, numero: true, monto: true, moneda: true, estado: true },
  });
  console.log(`\nClientes de Mercury sin cuenta en Nexus (${sinCuenta.length}):`);
  for (const c of sinCuenta) {
    const suyas = facturas.filter((f) => f.mercuryCustomerId === c.mercuryCustomerId);
    console.log(`  ${c.mercuryCustomerId} · ${c.nombre}${c.pais ? ` (${c.pais})` : ""} · ${suyas.length ? suyas.map((f) => `${f.numero} ${monto(Number(f.monto), f.moneda)} ${f.estado}`).join(", ") : `sin facturas de ${anio}`}`);
  }
}

/* ── El plan ────────────────────────────────────────────────────────────────────── */

async function armarPlan(a: ReturnType<typeof leerArgumentos>, ids: readonly string[], cuentaId: string | null, cobrarConFirma: boolean) {
  const estado = await cargarEstadoMercury();
  const facturas = estado.facturas.filter((f) => ids.includes(f.mercuryCustomerId));
  /* La entrada de plata de cada factura pagada, cruzando TODAS las facturas: la misma que ve «Lo que no cuadra». */
  const pago = entradasDeFacturas(estado.facturas, estado.entradas);
  const cuotas = cuentaId ? estado.cobros.filter((c) => c.cuentaId === cuentaId) : [];
  const plan = planDeCargaDesdeMercury(facturas, {
    anio: a.anio,
    numerosEnCobros: new Set(estado.cobros.flatMap((c) => [numeroDeMercury(c.numeroFactura)].filter((n): n is string => !!n))),
    cuotasDeLaCuenta: cuotas.map((c) => ({ periodo: c.periodo, monto: c.monto, moneda: c.moneda, estado: c.estado, numeroFactura: c.numeroFactura })),
    entradas: new Map(facturas.flatMap((f) => (pago.has(f.id) ? [[f.id, pago.get(f.id)!.fecha] as const] : []))),
    cobrarConFirma,
  });
  return plan;
}

function imprimirPlan(plan: PlanDeCargaDesdeMercury) {
  console.log(`\n══ Cobros que se cargan: ${plan.aCargar.length} · ${monto(plan.totales.USD, "USD")} + ${monto(plan.totales.CRC, "CRC")} ══`);
  for (const c of plan.aCargar) {
    console.log(
      `  ${c.numero} · ${c.fecha} · ${monto(c.monto, c.moneda)} · ${c.estado === "COBRADO" ? `cobrado el ${c.fechaCobro}${c.origenDelDia === "ENTRADA" ? " (entrada del banco)" : " (el día que la copia la vio pagada)"}` : "por cobrar"} · ${c.clienteNombre.slice(0, 40)}${c.nota ? ` · ${c.nota}` : ""}`,
    );
  }
  if (plan.enCuotasSinNumero.length) {
    console.log("\n  No se cargan: la cuenta ya tiene cuotas sin número de factura, y la factura es probablemente una de ellas.");
    console.log("  Hay que anotar el número en la cuota que corresponde (Cobranza → la cuenta → la cuota → número de factura):");
    for (const x of plan.enCuotasSinNumero) {
      console.log(`  - ${x.numero} · ${x.fecha} · ${monto(x.monto, x.moneda)} · ${x.estado}`);
      for (const q of x.cuotas) console.log(`      cuota ${q.periodo} · ${monto(q.monto, q.moneda)} · ${q.estado.toLowerCase()}`);
    }
  }
  if (plan.yaEstaban.length) console.log(`\n  Ya tienen su cobro en Nexus (no se tocan): ${plan.yaEstaban.join(", ")}`);
  if (plan.noEntran.length) {
    console.log("\n  No entran:");
    for (const x of plan.noEntran) console.log(`  - ${x.numero}: ${x.motivo}`);
  }
}

/* ── Aplicar ────────────────────────────────────────────────────────────────────── */

async function cargarCobro(c: CobroDesdeMercury, cuentaId: string, sociedadId: string, firma: string, firmaDeCobro: string | null) {
  return prisma.$transaction(
    async (tx) => {
      /* Idempotencia adentro de la transacción: si alguien lo cargó recién, no se duplica. */
      const ya = await tx.cobro.findFirst({ where: { numeroFactura: { equals: c.numero, mode: "insensitive" } }, select: { id: true } });
      if (ya) return "ya-estaba" as const;

      const descripcion = descripcionDelServicio(c.moneda);
      const servicio =
        (await tx.servicioContratado.findFirst({ where: { cuentaId, moneda: c.moneda, tipoServicio: "OTRO", descripcion }, select: { id: true } })) ??
        (await tx.servicioContratado.create({
          data: {
            cuentaId,
            tipoServicio: "OTRO",
            modalidad: "PROYECTO",
            montoTotal: c.monto,
            moneda: c.moneda,
            /* Con fecha de arranque: sin ella el motor la da por «pendiente de datos». */
            fechaInicioFacturacion: dia(c.fecha),
            estado: "ACTIVO",
            descripcion,
          },
          select: { id: true },
        }));
      const cobro = await tx.cobro.create({
        data: {
          servicioId: servicio.id,
          cuentaId,
          planId: null,
          numCuota: null,
          periodo: c.periodo,
          fechaProgramada: dia(c.fecha),
          monto: c.monto,
          moneda: c.moneda,
          origen: "IMPORTACION",
        },
        select: { id: true },
      });
      /* La factura, por el chokepoint: firma lo facturado y el número (INV5, INV34), valida la sociedad (INV36). */
      await cambiarEstadoCobroTx(
        tx,
        cobro.id,
        { estado: "POR_COBRAR", fechaEmision: c.fecha, numeroFactura: c.numero, plataformaFactura: "MERCURY", sociedadFacturadaId: sociedadId },
        firma,
      );
      /* Lo cobrado, con la firma de quien lo confirma (INV3). */
      if (c.estado === "COBRADO" && firmaDeCobro && c.fechaCobro) {
        await cambiarEstadoCobroTx(tx, cobro.id, { estado: "COBRADO", fechaCobro: c.fechaCobro }, firmaDeCobro);
      }
      /* El servicio vale lo que suman sus facturas y arranca con la primera. */
      const suma = await tx.cobro.aggregate({ where: { servicioId: servicio.id }, _sum: { monto: true }, _min: { fechaEmision: true } });
      await tx.servicioContratado.update({
        where: { id: servicio.id },
        data: { montoTotal: suma._sum.monto ?? c.monto, fechaInicioFacturacion: suma._min.fechaEmision ?? dia(c.fecha) },
      });
      await tx.bitacoraCobro.create({
        data: { cuentaId, cobroId: cobro.id, tipo: "NOTA", contenido: textoDeCargaDesdeMercury(c, firma, firmaDeCobro), usuarioEmail: firma },
      });
      return "cargado" as const;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function aplicar(
  a: ReturnType<typeof leerArgumentos>,
  empresa: Awaited<ReturnType<typeof resolverEmpresa>>,
  clientes: Awaited<ReturnType<typeof resolverClientes>>,
) {
  const firma = a.firma!;
  const carpeta = a.respaldo;
  const ids = clientes.map((c) => c.mercuryCustomerId);
  /* 0 · Lo único que ya existía y se va a modificar: los clientes de Mercury que se emparejan. Lo demás se crea, y sus
     ids quedan en el respaldo del final. */
  guardarRespaldo(carpeta, "antes", { empresa, clientes: await prisma.clienteMercury.findMany({ where: { mercuryCustomerId: { in: ids } } }) });

  /* 1 · La cuenta de cobro. Si ya tiene, se usa la que tiene. */
  const { cuenta, created } = await createCuenta(cuentaCreateSchema.parse({ clientId: empresa.id, tipo: a.tipo, viaCobro: "MERCURY", moneda: a.moneda }));
  console.log(created ? `1 · Cuenta de cobro creada: ${cuenta.id}` : `1 · Ya tenía cuenta de cobro: ${cuenta.id}`);

  /* 2 · Sus clientes de Mercury: cada uno queda como sociedad de Mercury de la cuenta. */
  for (const c of clientes) {
    if (c.cuentaId === cuenta.id) {
      console.log(`2 · «${c.nombre}» ya estaba emparejado.`);
      continue;
    }
    await confirmarClienteMercury({ mercuryCustomerId: c.mercuryCustomerId, cuentaId: cuenta.id, via: "MANUAL" }, firma);
    console.log(`2 · «${c.nombre}» emparejado: sus facturas de Mercury pasan a la cuenta.`);
  }

  /* 3 · Los cobros, uno por factura, cada uno en su transacción: uno que falla no se lleva a los demás. */
  const sociedadDe = new Map(
    (await prisma.clienteMercury.findMany({ where: { mercuryCustomerId: { in: ids } }, select: { mercuryCustomerId: true, sociedadId: true } })).map(
      (s) => [s.mercuryCustomerId, s.sociedadId],
    ),
  );
  const plan = await armarPlan(a, ids, created ? null : cuenta.id, a.firmaDeCobro !== null);
  let cargados = 0;
  const rechazos: string[] = [];
  for (const c of plan.aCargar) {
    const sociedadId = sociedadDe.get(c.mercuryCustomerId);
    if (!sociedadId) {
      rechazos.push(`${c.numero}: su cliente de Mercury no quedó emparejado con la cuenta.`);
      continue;
    }
    try {
      if ((await cargarCobro(c, cuenta.id, sociedadId, firma, a.firmaDeCobro)) === "cargado") cargados++;
    } catch (e) {
      if (!(e instanceof CobranzaError)) throw e;
      rechazos.push(`${c.numero}: ${e.message}`);
    }
  }
  console.log(`3 · Cobros cargados: ${cargados} de ${plan.aCargar.length}.`);
  for (const r of rechazos) console.log(`   ✗ ${r}`);

  /* Lo que se creó, con cómo deshacerlo. */
  const creados = await prisma.cobro.findMany({
    where: { cuentaId: cuenta.id, numeroFactura: { in: plan.aCargar.map((c) => c.numero) } },
    select: { id: true, numeroFactura: true, servicioId: true, estado: true },
  });
  guardarRespaldo(carpeta, "despues", {
    cuentaId: cuenta.id,
    cuentaCreadaEnEstaCorrida: created,
    cobros: creados,
    servicios: [...new Set(creados.map((c) => c.servicioId))],
    comoDeshacer: created
      ? "Borrar la CuentaFinanciera cuentaId (arrastra servicios, cobros, sociedades, alertas y bitácora) y devolver ClienteMercury a lo que dice el respaldo «antes»."
      : "Borrar los cobros de la lista (y sus servicios si quedan vacíos) y devolver ClienteMercury a lo que dice el respaldo «antes».",
  });

  /* La prueba de que otra corrida no haría nada. */
  const despues = await armarPlan(a, ids, cuenta.id, a.firmaDeCobro !== null);
  console.log(
    despues.aCargar.length === 0
      ? "\n✓ Aplicado. Correrlo de nuevo no cambia nada."
      : `\n⚠ Quedan ${despues.aCargar.length} facturas sin cargar (mira los rechazos): correrlo de nuevo las reintenta.`,
  );
  if (despues.enCuotasSinNumero.length) imprimirPlan({ ...despues, aCargar: [], yaEstaban: [], noEntran: [] });
}

/* ── Entrada ────────────────────────────────────────────────────────────────────── */

async function main() {
  const a = leerArgumentos();
  /* ⛔ El guard de siempre: con --apply exige ALLOW_PROD_WRITE=1 contra producción y respalda las tablas con pg_dump
     antes de devolver. Sin --apply devuelve false y no hace nada. */
  const APPLY = resolverApply({ tablas: TABLAS });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");

  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"} · año ${a.anio}`);
  if (!a.empresa || !a.clientes.length) {
    if (APPLY) throw new Error("Con --apply hacen falta --empresa y --clientes.");
    await listarSinCuenta(a.anio);
    console.log("\nPara armar una carga: --empresa=<id o nombre en Nexus> --clientes=<ids de Mercury, separados por coma>.");
    return;
  }
  await validarFirma(a.firma, "--firma", APPLY);
  await validarFirma(a.firmaDeCobro, "--cobrar-con-firma", false);

  const empresa = await resolverEmpresa(a.empresa);
  console.log(
    `Empresa: ${empresa.name} (${empresa.id}) · ${empresa.cuentaFinanciera ? `ya tiene cuenta de cobro (${empresa.cuentaFinanciera.tipo}, ${empresa.cuentaFinanciera.viaCobro})` : `sin cuenta de cobro: se crea ${a.tipo}, vía Mercury, en ${a.moneda}`}`,
  );
  if (empresa.kind !== "CLIENTE") throw new Error(`«${empresa.name}» no es un cliente (es ${empresa.kind}): pásala a Cliente en su ficha primero.`);

  /* Los clientes de Mercury: no pueden ser de OTRA cuenta ni estar marcados «no es cliente nuestro». */
  const clientes = await resolverClientes(a.clientes);
  for (const c of clientes) {
    if (c.cuentaId && c.cuentaId !== empresa.cuentaFinanciera?.id) throw new Error(`«${c.nombre}» ya es de la cuenta «${c.cuenta?.client.name}»: no se mueve desde acá.`);
    if (c.ignorado) throw new Error(`«${c.nombre}» está marcado «no es cliente nuestro» en Mercury: desmárcalo en Conciliación → Mercury → Emparejar.`);
    console.log(`Cliente de Mercury ${c.mercuryCustomerId}: ${c.nombre} · ${c.cuentaId ? "ya emparejado" : "se empareja"}`);
  }

  const plan = await armarPlan(a, clientes.map((c) => c.mercuryCustomerId), empresa.cuentaFinanciera?.id ?? null, a.firmaDeCobro !== null);
  imprimirPlan(plan);

  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Para aplicar, el mismo comando con --apply y ALLOW_PROD_WRITE=1.");
    return;
  }
  try {
    await aplicar(a, empresa, clientes);
  } catch (e) {
    if (e instanceof MercuryServicioError || e instanceof CobranzaError) throw new Error(e.message);
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
