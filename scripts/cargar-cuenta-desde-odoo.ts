/**
 * scripts/cargar-cuenta-desde-odoo.ts
 *
 * Carga en Nexus una empresa con lo que Odoo ya le facturó: le abre la cuenta de cobro si no tiene, le vincula sus
 * clientes de Odoo y carga un cobro por cada factura viva del año. Qué entra lo decide lib/cobranza/carga-desde-odoo.ts
 * (puro, con pruebas); este archivo lee, muestra y, con permiso, escribe por los chokepoints de siempre:
 * `createCuenta`, `confirmarVinculo` (que atribuye las facturas del cliente en la misma transacción) y
 * `cambiarEstadoCobroTx` (que firma lo facturado, el número, la sociedad y lo cobrado, y deja su bitácora).
 *
 * Nació para kölbi (2026-09-30): le factura a Smarteam a través de Publimark y McCann, y no tenía cuenta en Nexus.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura, Odoo se lee (siempre es solo lectura) y se imprime
 * el plan sin escribir nada. Para escribir hacen falta `--apply`, `--firma=<correo del equipo>` y `ALLOW_PROD_WRITE=1`;
 * el guard respalda con pg_dump las tablas que se tocan antes de la primera escritura.
 * ⛔ Nada de esto escribe en Odoo.
 *
 * Uso (PowerShell, en la carpeta del proyecto):
 *   npx tsx scripts/cargar-cuenta-desde-odoo.ts --empresa=kölbi --fichas=75,168,44 --anio=2026 --firma=<correo> --cobrar-con-firma=<correo>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-cuenta-desde-odoo.ts <lo mismo> --apply
 *
 * `--cobrar-con-firma`: las facturas que Odoo da pagadas entran COBRADAS, con el día en que la plata entró al banco
 * según la conciliación de Odoo, y confirmadas por esa persona (INV3). Sin esa bandera entran por cobrar.
 *
 * El respaldo propio, además del de pg_dump: antes de escribir guarda en JSON lo único que ya existía y se modifica
 * —los vínculos de esos clientes de Odoo y la cuenta de sus facturas— y, al terminar, los ids de lo que se creó con
 * cómo deshacerlo, en `backups/<AAAA-MM-DD>-cargar-cuenta-desde-odoo/` (fuera de git). Todo lo demás se CREA: con esos
 * dos archivos la carga se deshace entera aunque en la PC no haya pg_dump y se corra con `SIN_RESPALDO=1`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { createCuenta, cambiarEstadoCobroTx, CobranzaError } from "@/lib/cobranza/mutations";
import { cuentaCreateSchema } from "@/lib/cobranza/schema";
import { confirmarVinculo, EmparejadoError } from "@/lib/cobranza/odoo/servicio";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import { planDeCargaDesdeOdoo, textoDeCargaDesdeOdoo, type CobroDesdeOdoo, type PlanDeCargaDesdeOdoo } from "@/lib/cobranza/carga-desde-odoo";
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
const TABLAS = [
  "CuentaFinanciera",
  "OdooPartnerVinculo",
  "FacturaOdoo",
  "FacturaOdooCambio",
  "ServicioContratado",
  "Cobro",
  "BitacoraCobro",
  "AlertaCobro",
];

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const descripcionDelServicio = (moneda: string) => `Facturación importada de Odoo (${moneda})`;
const monto = (n: number, moneda: string) => `${moneda === "USD" ? "US$" : "₡"}${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

/* ── Argumentos ─────────────────────────────────────────────────────────────────── */

function arg(nombre: string): string | null {
  const x = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return x ? x.slice(nombre.length + 3).trim() || null : null;
}

function leerArgumentos() {
  const empresa = arg("empresa");
  const fichas = (arg("fichas") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const anio = Number(arg("anio") ?? crDateParts(new Date()).dateKey.slice(0, 4));
  const tipo = (arg("tipo") ?? "NACIONAL").toUpperCase();
  const moneda = (arg("moneda") ?? "USD").toUpperCase();
  if (!empresa) throw new Error("Falta --empresa=<id o nombre de la empresa en Nexus>.");
  if (!fichas.length) throw new Error("Falta --fichas=<ids de los clientes de Odoo, separados por coma>.");
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("--anio tiene que ser un año, como 2026.");
  if (tipo !== "NACIONAL" && tipo !== "INTERNACIONAL") throw new Error("--tipo es NACIONAL o INTERNACIONAL.");
  if (moneda !== "USD" && moneda !== "CRC") throw new Error("--moneda es USD o CRC.");
  const respaldo = join("backups", `${crDateParts(new Date()).dateKey}-cargar-cuenta-desde-odoo`);
  return { empresa, fichas, anio, tipo, moneda, firma: arg("firma"), firmaDeCobro: arg("cobrar-con-firma"), respaldo } as const;
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

/* ── Odoo: el día en que entró la plata ─────────────────────────────────────────── */

/**
 * Para cada factura pagada, el día del movimiento del banco con que Odoo la concilió. Solo lectura. Las conciliaciones
 * de diferencia de cambio (monto 0) no cuentan. null en el mapa = no se encontró: la factura entra por cobrar.
 */
async function fechasDePagoEnOdoo(facturas: ReadonlyArray<{ odooMoveId: number; numero: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!facturas.length) return out;
  const t = crearTransporteXmlRpc(configDesdeEntorno());
  for (const f of facturas) {
    const lineas = await t.buscarYLeer(
      "account.move.line",
      [["move_id", "=", f.odooMoveId], ["account_id.account_type", "=", "asset_receivable"]],
      ["id", "matched_credit_ids"],
      {},
    );
    const parciales = lineas.flatMap((l) => (Array.isArray(l.matched_credit_ids) ? (l.matched_credit_ids as number[]) : []));
    if (!parciales.length) continue;
    const recs = await t.buscarYLeer("account.partial.reconcile", [["id", "in", parciales]], ["id", "credit_amount_currency", "credit_move_id"], {});
    /* ⚠ Por el monto EN LA MONEDA DE LA FACTURA: la diferencia de cambio de una factura en dólares se concilia días
       después por 0 dólares y algunos colones, y tomarla corría el día del pago al asiento de fin de mes. */
    const conPlata = recs.filter((r) => Number(r.credit_amount_currency) > 0 && Array.isArray(r.credit_move_id));
    const contrapartes = conPlata.map((r) => Number((r.credit_move_id as unknown[])[0]));
    if (!contrapartes.length) continue;
    const pagos = await t.buscarYLeer("account.move.line", [["id", "in", contrapartes]], ["id", "date"], {});
    const fechas = pagos.map((p) => String(p.date).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (fechas.length) out.set(f.numero, fechas[fechas.length - 1]!);
  }
  return out;
}

/* ── El plan ────────────────────────────────────────────────────────────────────── */

async function armarPlan(a: ReturnType<typeof leerArgumentos>, fechasDePago: Map<string, string>) {
  const documentos = await prisma.facturaOdoo.findMany({
    where: { odooPartnerId: { in: [...a.fichas] }, estadoEspejo: "VIGENTE" },
    select: {
      odooMoveId: true,
      numero: true,
      odooPartnerId: true,
      odooPartnerNombre: true,
      invoiceDate: true,
      moveType: true,
      state: true,
      paymentState: true,
      montoNeto: true,
      montoTotal: true,
      montoResidual: true,
      moneda: true,
    },
  });
  const numeros = documentos.map((d) => d.numero);
  const enCobros = await prisma.cobro.findMany({ where: { numeroFactura: { in: numeros } }, select: { numeroFactura: true } });
  const plan = planDeCargaDesdeOdoo(
    documentos.map((d) => ({
      ...d,
      invoiceDate: d.invoiceDate.toISOString().slice(0, 10),
      montoNeto: Number(d.montoNeto),
      montoTotal: Number(d.montoTotal),
      montoResidual: Number(d.montoResidual),
    })),
    {
      anio: a.anio,
      numerosEnCobros: new Set(enCobros.flatMap((c) => (c.numeroFactura ? [c.numeroFactura] : []))),
      fechasDePago,
      cobrarConFirma: a.firmaDeCobro !== null,
    },
  );
  return { plan, documentos };
}

function imprimirPlan(plan: PlanDeCargaDesdeOdoo) {
  console.log(`\n══ Cobros que se cargan: ${plan.aCargar.length} · ${monto(plan.totales.USD, "USD")} + ${monto(plan.totales.CRC, "CRC")}, sin IVA ══`);
  for (const c of plan.aCargar) {
    console.log(
      `  ${c.numero} · ${c.fecha} · ${monto(c.monto, c.moneda)} · ${c.estado === "COBRADO" ? `cobrado el ${c.fechaCobro}` : "por cobrar"} · ${c.odooPartnerNombre.slice(0, 30)}${c.nota ? ` · ${c.nota}` : ""}`,
    );
  }
  if (plan.anuladasPorNota.length) {
    console.log("\n  No entran: parecen anuladas por una nota de crédito sin aplicar (hay que conciliarlas en Odoo):");
    for (const x of plan.anuladasPorNota) console.log(`  - ${x.numero} · ${x.fecha} · ${monto(x.monto, x.moneda)} · la nota ${x.nota}, del mismo día y el mismo total`);
  }
  if (plan.yaEstaban.length) console.log(`\n  Ya tienen su cobro en Nexus (no se tocan): ${plan.yaEstaban.join(", ")}`);
  if (plan.noEntran.length) {
    console.log("\n  No entran:");
    for (const x of plan.noEntran) console.log(`  - ${x.numero}: ${x.motivo}`);
  }
}

/* ── Aplicar ────────────────────────────────────────────────────────────────────── */

async function cargarCobro(c: CobroDesdeOdoo, cuentaId: string, sociedadId: string, firma: string, firmaDeCobro: string | null) {
  return prisma.$transaction(
    async (tx) => {
      /* Idempotencia adentro de la transacción: si alguien lo cargó recién, no se duplica. */
      const ya = await tx.cobro.findFirst({ where: { numeroFactura: c.numero }, select: { id: true } });
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
        { estado: "POR_COBRAR", fechaEmision: c.fecha, numeroFactura: c.numero, plataformaFactura: "ODOO", sociedadFacturadaId: sociedadId },
        firma,
      );
      /* Lo cobrado, con la firma de quien lo confirma (INV3) y el día en que entró la plata. */
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
        data: { cuentaId, cobroId: cobro.id, tipo: "NOTA", contenido: textoDeCargaDesdeOdoo(c, firma, firmaDeCobro), usuarioEmail: firma },
      });
      return "cargado" as const;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function aplicar(a: ReturnType<typeof leerArgumentos>, empresa: Awaited<ReturnType<typeof resolverEmpresa>>, fechasDePago: Map<string, string>) {
  const firma = a.firma!;
  const carpeta = a.respaldo;
  /* 0 · Lo único que ya existía y se va a modificar: los vínculos de esos clientes de Odoo y la cuenta de sus
     facturas. Lo demás se crea, y sus ids quedan en el respaldo del final. */
  const [vinculosAntes, facturasAntes] = await Promise.all([
    prisma.odooPartnerVinculo.findMany({ where: { odooPartnerId: { in: [...a.fichas] } } }),
    prisma.facturaOdoo.findMany({ where: { odooPartnerId: { in: [...a.fichas] } }, select: { id: true, numero: true, odooPartnerId: true, cuentaId: true } }),
  ]);
  guardarRespaldo(carpeta, "antes", { empresa, fichas: a.fichas, vinculos: vinculosAntes, facturas: facturasAntes });

  /* 1 · La cuenta de cobro. Si ya tiene, se usa la que tiene. */
  const { cuenta, created } = await createCuenta(cuentaCreateSchema.parse({ clientId: empresa.id, tipo: a.tipo, viaCobro: "ODOO", moneda: a.moneda }));
  console.log(created ? `1 · Cuenta de cobro creada: ${cuenta.id}` : `1 · Ya tenía cuenta de cobro: ${cuenta.id}`);

  /* 2 · Sus clientes de Odoo. ⚠ Sin aprender la cédula: son las agencias a las que se factura, no la empresa. */
  const fichas = await prisma.odooPartnerVinculo.findMany({ where: { odooPartnerId: { in: [...a.fichas] } }, select: { id: true, odooPartnerId: true, odooPartnerNombre: true, cuentaId: true } });
  for (const f of fichas) {
    if (f.cuentaId === cuenta.id) {
      console.log(`2 · «${f.odooPartnerNombre}» (#${f.odooPartnerId}) ya estaba vinculado.`);
      continue;
    }
    const r = await confirmarVinculo({ odooPartnerId: f.odooPartnerId!, cuentaId: cuenta.id, via: "MANUAL", aprenderCedula: false }, firma);
    console.log(`2 · «${f.odooPartnerNombre}» (#${f.odooPartnerId}) vinculado: ${r.facturasAtribuidas} documentos de Odoo pasaron a la cuenta.`);
  }

  /* 3 · Los cobros, uno por factura, cada uno en su transacción: uno que falla no se lleva a los demás. */
  const sociedadDe = new Map(
    (await prisma.odooPartnerVinculo.findMany({ where: { cuentaId: cuenta.id, odooPartnerId: { not: null } }, select: { id: true, odooPartnerId: true } })).map(
      (s) => [s.odooPartnerId!, s.id],
    ),
  );
  const { plan } = await armarPlan(a, fechasDePago);
  let cargados = 0;
  const rechazos: string[] = [];
  for (const c of plan.aCargar) {
    const sociedadId = sociedadDe.get(c.odooPartnerId);
    if (!sociedadId) {
      rechazos.push(`${c.numero}: su cliente de Odoo (#${c.odooPartnerId}) no quedó vinculado a la cuenta.`);
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

  /* Lo que se creó, con cómo deshacerlo: borrar la cuenta (si la creó esta corrida) se lleva sus servicios, cobros,
     alertas y bitácora; los vínculos y las facturas vuelven a lo que dice el respaldo «antes». */
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
      ? "Borrar la CuentaFinanciera cuentaId (arrastra servicios, cobros, alertas y bitácora) y devolver OdooPartnerVinculo y FacturaOdoo.cuentaId a lo que dice el respaldo «antes»."
      : "Borrar los cobros de la lista (y sus servicios si quedan vacíos) y devolver OdooPartnerVinculo y FacturaOdoo.cuentaId a lo que dice el respaldo «antes».",
  });

  /* La prueba de que otra corrida no haría nada. */
  const { plan: despues } = await armarPlan(a, fechasDePago);
  console.log(
    despues.aCargar.length === 0
      ? "\n✓ Aplicado. Correrlo de nuevo no cambia nada."
      : `\n⚠ Quedan ${despues.aCargar.length} facturas sin cargar (mira los rechazos): correrlo de nuevo las reintenta.`,
  );
}

/* ── Entrada ────────────────────────────────────────────────────────────────────── */

async function main() {
  const a = leerArgumentos();
  /* ⛔ El guard de siempre: con --apply exige ALLOW_PROD_WRITE=1 contra producción y respalda las tablas con pg_dump
     antes de devolver. Sin --apply devuelve false y no hace nada. */
  const APPLY = resolverApply({ tablas: TABLAS });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");

  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"} · año ${a.anio}`);
  await validarFirma(a.firma, "--firma", APPLY);
  await validarFirma(a.firmaDeCobro, "--cobrar-con-firma", false);

  const empresa = await resolverEmpresa(a.empresa);
  console.log(`Empresa: ${empresa.name} (${empresa.id}) · ${empresa.cuentaFinanciera ? `ya tiene cuenta de cobro (${empresa.cuentaFinanciera.tipo}, ${empresa.cuentaFinanciera.viaCobro})` : `sin cuenta de cobro: se crea ${a.tipo}, vía Odoo, en ${a.moneda}`}`);
  if (empresa.kind !== "CLIENTE") throw new Error(`«${empresa.name}» no es un cliente (es ${empresa.kind}): pásala a Cliente en su ficha primero.`);

  /* Los clientes de Odoo: tienen que estar en la lista, y no pueden ser de OTRA cuenta. */
  const fichas = await prisma.odooPartnerVinculo.findMany({
    where: { odooPartnerId: { in: [...a.fichas] } },
    select: { odooPartnerId: true, odooPartnerNombre: true, odooVat: true, cuentaId: true, cuenta: { select: { client: { select: { name: true } } } } },
  });
  for (const id of a.fichas) {
    const f = fichas.find((x) => x.odooPartnerId === id);
    if (!f) throw new Error(`El cliente de Odoo #${id} no está en la lista de Nexus: aprieta «Actualizar desde Odoo» y vuelve a correr.`);
    const deOtra = f.cuentaId && f.cuentaId !== empresa.cuentaFinanciera?.id;
    if (deOtra) throw new Error(`«${f.odooPartnerNombre}» (#${id}) ya es de la cuenta «${f.cuenta?.client.name}»: no se mueve desde acá.`);
    console.log(`Cliente de Odoo #${id}: ${f.odooPartnerNombre} · cédula ${f.odooVat ?? "—"} · ${f.cuentaId ? "ya vinculado" : "se vincula"}`);
  }

  /* El día del pago de las facturas pagadas, de Odoo. Solo lectura. */
  const { documentos } = await armarPlan(a, new Map());
  const pagadas = documentos.filter((d) => d.moveType === "out_invoice" && (d.paymentState === "paid" || d.paymentState === "in_payment"));
  const fechasDePago = await fechasDePagoEnOdoo(pagadas.map((d) => ({ odooMoveId: d.odooMoveId, numero: d.numero })));
  console.log(`Días de pago leídos de Odoo: ${fechasDePago.size} de ${pagadas.length} facturas pagadas.`);

  const { plan } = await armarPlan(a, fechasDePago);
  imprimirPlan(plan);

  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Para aplicar, el mismo comando con --apply y ALLOW_PROD_WRITE=1.");
    return;
  }
  try {
    await aplicar(a, empresa, fechasDePago);
  } catch (e) {
    if (e instanceof EmparejadoError || e instanceof CobranzaError) throw new Error(e.message);
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
