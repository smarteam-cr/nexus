/**
 * scripts/recalcular-lo-vendido.ts — vuelve a leer las propuestas GANADAS y dice qué cambiaría en los ingresos de
 * servicio y de licencia, mes a mes (2026-10-18, «La siguiente serie», iniciativa 3, paso 4).
 *
 * Lo vendido se calcula en vivo (lib/finanzas/lo-vendido.ts): el punto de equilibrio ya lee cada propuesta ganada
 * cada vez que se abre, así que este script NO hace falta para que el recálculo ocurra. Sirve para VERLO antes:
 *  1. Por propuesta: la versión que se leyó, la moneda y de dónde salió, cuánto es servicio y cuánto licencia, el
 *     margen de cada licencia, y si entra al equilibrio como contrato o por qué no.
 *  2. Por propuesta que entra: qué cambia mes a mes en lo facturado de esa cuenta (servicio antes → después, licencia
 *     antes → después), con la regla `SOLO_SERVICIO`. Cada fila en su moneda: no se convierte.
 *  3. La cobertura: cuántas ganadas, cuántas venden licencias, cuántas traen el precio de lista, cuántas entran.
 * Una propuesta vieja sin el precio de lista lo dice; no se inventa.
 *
 * Simulacro por defecto, con la conexión en solo lectura. Con `--apply` (más `--firma=<correo del equipo>` y
 * `ALLOW_PROD_WRITE=1`) lo ÚNICO que escribe es archivar los contratos cargados a mano que una propuesta reemplaza
 * ENTEROS (todos sus meses quedan cubiertos por la propuesta): así la lista de «Contratos» no muestra dos veces lo
 * mismo. Uno que sigue rigiendo fuera de los meses de la propuesta no se toca. Deshacer: devolver `archivadaEn` y
 * `archivadaPor` a null en las filas que lista el respaldo. Correrlo dos veces no cambia nada la segunda.
 *
 *   npx tsx scripts/recalcular-lo-vendido.ts
 *   npx tsx scripts/recalcular-lo-vendido.ts --anio=2026
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/recalcular-lo-vendido.ts --apply --firma=<correo>
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { tipoIngresoDeCobro } from "@/lib/finanzas/equilibrio";
import { cargarLicencias } from "@/lib/finanzas/licencias-server";
import { rigeEn, type LicenciaDeContrato } from "@/lib/finanzas/licencias";
import { cargarPropuestasGanadas } from "@/lib/finanzas/lo-vendido-server";
import {
  cambiosEnIngresos,
  combinarLicencias,
  contratosDeLasPropuestas,
  leerLoVendido,
  MESES_DEL_CONTRATO,
  type CobroImputado,
  type LoVendidoDePropuesta,
} from "@/lib/finanzas/lo-vendido";
import { describirDestino, resolverApply } from "./lib/guard";

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
/* ⚠ Antes de la primera consulta: `pg` lee PGOPTIONS al abrir cada conexión. Sin --apply la base no se puede escribir. */
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=30000"]
    .filter(Boolean)
    .join(" ");
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const dinero = (n: number, moneda: string | null) =>
  `${moneda ?? "¿?"} ${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ESTADO: Record<string, string> = {
  ok: "comparable",
  "sin-costo": "sin precio de lista",
  "costo-ilegible": "precio de lista ilegible",
  "sin-precio": "sin lo que se le cobra",
  "monedas-distintas": "costo en otra moneda",
  "periodicidad-distinta": "periodicidad distinta",
};
const FACTURA = { smarteam: "la factura Smarteam", proveedor: "el cliente le paga al proveedor" } as const;

function imprimirPropuesta(v: LoVendidoDePropuesta): void {
  console.log(`\n● ${v.clienteNombre} · «${v.nombre}» · ganada el ${v.fechaCierre} · trato ${v.hubspotDealId}`);
  console.log(`  Versión leída: ${v.versionLeida ?? "(ninguna)"} · moneda: ${v.moneda ?? "no se sabe"}${v.monedaDe === "hubspot" ? " (del trato de HubSpot: la propuesta no la dice)" : ""}`);
  if (v.cobertura.sinInversion) {
    console.log("  La Inversión está vacía.");
  } else {
    console.log(`  Servicio: ${dinero(v.servicios.unico, v.moneda)} una vez + ${dinero(v.servicios.mensual, v.moneda)} al mes`);
    for (const l of v.licencias) {
      const cobrado = l.cobrado ? (l.recurrente ? `${dinero(l.cobrado.mensual, v.moneda)} al mes` : `${dinero(l.cobrado.unico, v.moneda)} una vez`) : "sin monto legible";
      const costo = l.costo ? (l.recurrente ? `${dinero(l.costo.mensual, v.moneda)} al mes` : `${dinero(l.costo.unico, v.moneda)} una vez`) : null;
      const margen = l.margen ? (l.recurrente ? `${dinero(l.margen.mensual, v.moneda)} al mes` : `${dinero(l.margen.unico, v.moneda)}`) : null;
      console.log(
        `  Licencia «${l.concepto || "(sin concepto)"}»: se cobra ${cobrado} · ${l.quienFactura ? FACTURA[l.quienFactura] : "sin decir quién la factura"} · ${ESTADO[l.estado] ?? l.estado}` +
          (costo ? ` · costo ${costo}` : "") +
          (margen ? ` · margen ${margen}` : ""),
      );
    }
    if (v.cobertura.pendientes) console.log(`  ⚠ ${v.cobertura.pendientes} monto(s) no se pudieron leer.`);
    if (v.cobertura.conRango) console.log("  ⚠ Hay montos en rango: se tomó el piso.");
  }
  console.log(v.contrato ? `  → ENTRA al equilibrio: ${v.contrato.fuente}, ${MESES_DEL_CONTRATO} meses (${v.contrato.desde} a ${v.contrato.hasta}).` : `  → No entra: ${v.porQueNoEntra}`);
}

/** Un contrato a mano queda ENTERO bajo una propuesta de la misma cuenta y moneda (todos sus meses). */
function reemplazadoEntero(manual: LicenciaDeContrato, propuestas: readonly LicenciaDeContrato[]): LicenciaDeContrato | null {
  if (!manual.desde || !manual.hasta) return null;
  return (
    propuestas.find(
      (p) => p.cuentaId === manual.cuentaId && p.moneda === manual.moneda && rigeEn(p, manual.desde!.slice(0, 7)) && rigeEn(p, manual.hasta!.slice(0, 7)),
    ) ?? null
  );
}

async function main() {
  const APPLY = resolverApply({ tablas: ["LicenciaRevendida"] });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  const anio = arg("anio") ? Number(arg("anio")) : undefined;
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"}${anio ? ` · ganadas en ${anio}` : ""}`);

  const firma = arg("firma");
  if (APPLY) {
    if (!firma) throw new Error("--firma=<correo> es obligatoria con --apply: lo que se archiva queda firmado.");
    const persona = await prisma.teamMember.findFirst({ where: { email: { equals: firma, mode: "insensitive" } }, select: { id: true } });
    if (!persona) throw new Error(`--firma=${firma} no es de nadie del equipo.`);
  }

  const vendidas = (await cargarPropuestasGanadas({ anio })).map(leerLoVendido);
  const manuales = await cargarLicencias();
  const dePropuestas = contratosDeLasPropuestas(vendidas);
  const despues = combinarLicencias(manuales, dePropuestas);

  console.log("\n══ Las propuestas ganadas ══");
  if (!vendidas.length) console.log("Ninguna propuesta tiene su trato de HubSpot ganado.");
  for (const v of [...vendidas].sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre))) imprimirPropuesta(v);

  /* ── Qué cambia mes a mes ── */
  console.log("\n══ Qué cambia en los ingresos, mes a mes (lo facturado, regla SOLO_SERVICIO, cada moneda aparte) ══");
  const cuentas = [...new Set(dePropuestas.map((c) => c.cuentaId))];
  if (!cuentas.length) {
    console.log("Nada: ninguna propuesta ganada trae el dato completo, así que el equilibrio sigue exactamente igual.");
  } else {
    const hoyISO = crDateParts(new Date()).dateKey;
    const filas = await prisma.cobro.findMany({
      where: { cuentaId: { in: cuentas } },
      select: {
        cuentaId: true, periodo: true, monto: true, moneda: true, estado: true,
        fechaProgramada: true, fechaEmision: true, fechaCobro: true, cuenta: { select: { creditoDias: true } },
      },
    });
    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const cobros: CobroImputado[] = [];
    for (const c of filas) {
      const t = tipoIngresoDeCobro(
        {
          estado: c.estado,
          periodo: c.periodo,
          fechaProgramadaISO: c.fechaProgramada.toISOString().slice(0, 10),
          fechaEmisionISO: dia(c.fechaEmision),
          fechaCobroISO: dia(c.fechaCobro),
          creditoDias: c.cuenta.creditoDias,
        },
        hoyISO,
      );
      if (t.tipo === "PROGRAMADO") continue; // sin factura no es ingreso
      cobros.push({ cuentaId: c.cuentaId, moneda: c.moneda, periodoDelCobro: c.periodo, periodo: t.periodo, monto: Number(c.monto) });
    }
    const cambios = cambiosEnIngresos(cobros, manuales, despues);
    for (const contrato of dePropuestas) {
      const suyos = cambios.filter((f) => f.contratoDespues === contrato.id);
      console.log(`\n● ${contrato.cuentaNombre} · ${contrato.fuente}`);
      if (!suyos.length) {
        console.log("  Ningún mes cambia: todavía no hay cobros facturados de esa cuenta en esos meses.");
        continue;
      }
      for (const f of suyos) {
        console.log(
          `  ${f.periodo} · ${f.moneda} · facturado ${dinero(f.facturado, f.moneda)} · servicio ${dinero(f.servicioAntes, f.moneda)} → ${dinero(f.servicioDespues, f.moneda)}` +
            ` · licencia ${dinero(f.licenciaAntes, f.moneda)} → ${dinero(f.licenciaDespues, f.moneda)}`,
        );
      }
    }
  }

  /* ── La cobertura ── */
  const conLicencias = vendidas.filter((v) => v.cobertura.lineasDeLicencia > 0);
  const conCostoCompleto = conLicencias.filter((v) => v.licencias.every((l) => l.estado !== "sin-costo"));
  console.log("\n══ Cobertura ══");
  console.log(`Propuestas ganadas: ${vendidas.length} · venden licencias: ${conLicencias.length} · traen el precio de lista de todas: ${conCostoCompleto.length} · entran al equilibrio: ${dePropuestas.length}`);
  const sinCosto = conLicencias.filter((v) => v.licencias.some((l) => l.estado === "sin-costo"));
  if (sinCosto.length) {
    console.log(`Sin el precio de lista (no se inventa): ${sinCosto.map((v) => `${v.clienteNombre} · «${v.nombre}»`).join(" · ")}`);
  }
  console.log(`Contratos cargados a mano vivos: ${manuales.length}. Siguen rigiendo en todo mes que no cubra una propuesta con el dato.`);

  /* ── Lo que escribiría --apply ── */
  const aArchivar = manuales
    .map((m) => ({ m, por: reemplazadoEntero(m, dePropuestas) }))
    .filter((x): x is { m: LicenciaDeContrato; por: LicenciaDeContrato } => x.por !== null);
  console.log(`\n══ Lo que hace --apply ══`);
  if (!aArchivar.length) {
    console.log("Nada: ningún contrato a mano queda entero bajo una propuesta. Correrlo con --apply no cambia nada.");
  } else {
    for (const { m, por } of aArchivar) console.log(`Archiva «${m.cuentaNombre} · ${m.moneda}» (${m.fuente}): lo reemplaza ${por.fuente}.`);
  }
  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada.");
    return;
  }
  for (const { m, por } of aArchivar) {
    await prisma.licenciaRevendida.update({
      where: { id: m.id, archivadaEn: null },
      data: {
        archivadaEn: new Date(),
        archivadaPor: firma!,
        notas: [m.notas, `Archivado al reemplazarlo ${por.fuente} (scripts/recalcular-lo-vendido.ts).`].filter(Boolean).join("\n"),
        actualizadoPor: firma!,
      },
    });
  }
  console.log(`\n✓ Aplicado: ${aArchivar.length} contrato(s) archivado(s). Correrlo de nuevo no cambia nada.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
