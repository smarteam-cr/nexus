/**
 * scripts/corregir-nomina-agosto-2026.ts
 *
 * Pone la nómina al día con lo que Elías confirmó el 2026-08-18, después de que el
 * cruce contra el Excel mostrara que el punto de equilibrio se estaba calculando sobre
 * una planilla incompleta.
 *
 * POR QUÉ IMPORTA: el piso mensual sale de estos números. Cada dólar de salario mal
 * cargado es un dólar que la empresa cree que no necesita facturar.
 *
 * LOS CUATRO CAMBIOS, con la fecha en que ocurrieron DE VERDAD (no la de hoy — para eso
 * se arregló `updateCosto`, que hasta ahora estampaba la fecha de tecleo en todo cambio
 * de monto y le habría sumado el mes entero de agosto al aumento del día 31):
 *
 *   1. Lorena Osorio  · baja el 2026-08-15
 *   2. Alexander Vanegas · alta el 2026-08-01, USD 3.000
 *   3. Alejandra Ortega · 1.000 → 1.200 el 2026-08-31 (todavía no ocurre)
 *   4. Lidia Flores · ya está en 1.200; se verifica y se informa, no se toca
 *
 * Lo que NO hace, a propósito: bajar a Breiner Salas de ₡650.000 a ₡500.000. El Excel
 * lo pide y el importador lo venía reteniendo; Elías confirmó que el Excel está
 * desactualizado, igual que lo estaba en los cobros.
 *
 * Uso:
 *   npx tsx scripts/corregir-nomina-agosto-2026.ts                    (dry-run)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/corregir-nomina-agosto-2026.ts --apply
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import { createCosto, updateCosto } from "../lib/cobranza/mutations";

const { prisma, close } = createScriptDb();
const APPLY = resolverApply();
const POR = "script:corregir-nomina-2026-08";
const TC = 500; // solo para el total informativo; la base guarda en moneda nativa

/** Los cuatro cambios, declarados como datos para poder imprimirlos antes de aplicarlos. */
const CAMBIOS = [
  {
    clase: "BAJA" as const,
    buscar: "Lorena Osorio",
    fecha: "2026-08-15",
    motivo: "Dejó de trabajar el 15 de agosto de 2026 (confirmado por Elías).",
    detalle: "sale de la planilla",
  },
  {
    clase: "ALTA" as const,
    nombre: "Alexander Vanegas · Desarrollo",
    monto: 3000,
    moneda: "USD" as const,
    fecha: "2026-08-01",
    motivo: "Contratación: entró el 1 de agosto de 2026 (confirmado por Elías).",
    detalle: "$3.000/mes",
  },
  {
    clase: "CAMBIO_MONTO" as const,
    buscar: "Alejandra Ortega",
    monto: 1200,
    fecha: "2026-08-31",
    motivo: "Aumento vigente desde el 31 de agosto de 2026 (confirmado por Elías).",
    detalle: "$1.000 → $1.200",
  },
  {
    clase: "VERIFICAR" as const,
    buscar: "Lidia Flores",
    monto: 1200,
    detalle: "debería estar ya en $1.200 (aumento del 1 de agosto)",
  },
];

const money = (n: number, m: string) =>
  (m === "USD" ? "$" : "₡") + n.toLocaleString("es-CR", { maximumFractionDigits: 2 });

async function vigentes() {
  return prisma.costoRecurrente.findMany({
    where: { categoria: "SALARIO", activo: true, finalizadoEl: null },
    select: { id: true, nombre: true, monto: true, moneda: true },
    orderBy: { nombre: "asc" },
  });
}

function totalDe(filas: Array<{ monto: unknown; moneda: string }>) {
  let usd = 0;
  let crc = 0;
  for (const f of filas) {
    const n = Number(f.monto);
    if (f.moneda === "USD") usd += n;
    else crc += n;
  }
  return { usd, crc, enUsd: Math.round((usd + crc / TC) * 100) / 100 };
}

async function main() {
  const antes = await vigentes();
  const tAntes = totalDe(antes);
  console.log(`\n╔══ NÓMINA ANTES ══╗  ${antes.length} salarios vigentes`);
  for (const s of antes) console.log(`  ${s.nombre.padEnd(46)} ${money(Number(s.monto), s.moneda).padStart(14)}`);
  console.log(
    `  TOTAL: $${tAntes.usd.toLocaleString("es-CR")} + ₡${tAntes.crc.toLocaleString("es-CR")} = $${tAntes.enUsd.toLocaleString("es-CR")}/mes (TC ${TC})`,
  );

  // ── Resolver cada cambio contra lo que hay ──────────────────────────────────
  const plan: Array<{ texto: string; ejecutar?: () => Promise<unknown>; problema?: string }> = [];

  for (const c of CAMBIOS) {
    if (c.clase === "ALTA") {
      const yaEsta = antes.find((s) => s.nombre.toLowerCase().includes("vanegas"));
      if (yaEsta) {
        plan.push({ texto: `= ${c.nombre} ya existe (${money(Number(yaEsta.monto), yaEsta.moneda)}) — no se duplica` });
        continue;
      }
      plan.push({
        texto: `+ ALTA  ${c.nombre.padEnd(44)} ${money(c.monto, c.moneda).padStart(12)}  efectiva ${c.fecha}`,
        ejecutar: () =>
          createCosto(
            {
              categoria: "SALARIO",
              nombre: c.nombre,
              monto: c.monto,
              moneda: c.moneda,
              frecuencia: "MENSUAL",
              fechaEfectiva: c.fecha,
              motivoMovimiento: c.motivo,
            },
            POR,
          ),
      });
      continue;
    }

    const fila = antes.find((s) => s.nombre.toLowerCase().includes(c.buscar!.toLowerCase().split(" ")[0]!));
    if (!fila) {
      plan.push({ texto: `? ${c.buscar}`, problema: "no aparece entre los salarios vigentes" });
      continue;
    }

    if (c.clase === "BAJA") {
      plan.push({
        texto: `− BAJA  ${fila.nombre.padEnd(44)} ${money(Number(fila.monto), fila.moneda).padStart(12)}  efectiva ${c.fecha}`,
        ejecutar: () => updateCosto(fila.id, { finalizadoEl: c.fecha, motivoMovimiento: c.motivo }, POR),
      });
      continue;
    }

    if (c.clase === "CAMBIO_MONTO") {
      const actual = Number(fila.monto);
      if (actual === c.monto) {
        plan.push({ texto: `= ${fila.nombre.padEnd(44)} ya está en ${money(c.monto!, fila.moneda)}` });
        continue;
      }
      plan.push({
        texto: `~ MONTO ${fila.nombre.padEnd(44)} ${money(actual, fila.moneda)} → ${money(c.monto!, fila.moneda)}  efectiva ${c.fecha}`,
        // ⚠ `fechaEfectiva` es lo que hace que el movimiento quede fechado el 31 y no
        // hoy. Antes del arreglo de updateCosto, esta línea no servía de nada.
        ejecutar: () => updateCosto(fila.id, { monto: c.monto, fechaEfectiva: c.fecha, motivoMovimiento: c.motivo }, POR),
      });
      continue;
    }

    // VERIFICAR: no toca nada, solo confirma que el dato ya está como debe.
    const actual = Number(fila.monto);
    plan.push({
      texto:
        actual === c.monto
          ? `✓ ${fila.nombre.padEnd(44)} ${money(actual, fila.moneda).padStart(12)}  — ${c.detalle}, correcto`
          : `! ${fila.nombre.padEnd(44)} ${money(actual, fila.moneda).padStart(12)}  — se esperaba ${money(c.monto!, fila.moneda)}`,
      problema: actual === c.monto ? undefined : "el monto no coincide con lo confirmado",
    });
  }

  console.log(`\n╔══ CAMBIOS ══╗`);
  for (const p of plan) console.log(`  ${p.texto}${p.problema ? `   ⚠ ${p.problema}` : ""}`);

  const aplicables = plan.filter((p) => p.ejecutar);
  const problemas = plan.filter((p) => p.problema);

  // Proyección del resultado, para poder compararlo ANTES de escribir.
  const proyectado = { usd: tAntes.usd, crc: tAntes.crc, n: antes.length };
  for (const c of CAMBIOS) {
    if (c.clase === "ALTA" && !antes.some((s) => s.nombre.toLowerCase().includes("vanegas"))) {
      proyectado.usd += c.monto;
      proyectado.n += 1;
    }
    if (c.clase === "BAJA") {
      const f = antes.find((s) => s.nombre.toLowerCase().includes("lorena"));
      if (f) {
        if (f.moneda === "USD") proyectado.usd -= Number(f.monto);
        else proyectado.crc -= Number(f.monto);
        proyectado.n -= 1;
      }
    }
    if (c.clase === "CAMBIO_MONTO") {
      const f = antes.find((s) => s.nombre.toLowerCase().includes("alejandra"));
      if (f && Number(f.monto) !== c.monto) proyectado.usd += c.monto! - Number(f.monto);
    }
  }
  const enUsd = Math.round((proyectado.usd + proyectado.crc / TC) * 100) / 100;
  console.log(`\n╔══ NÓMINA DESPUÉS (proyectado) ══╗  ${proyectado.n} salarios vigentes`);
  console.log(
    `  $${proyectado.usd.toLocaleString("es-CR")} + ₡${proyectado.crc.toLocaleString("es-CR")} = $${enUsd.toLocaleString("es-CR")}/mes (TC ${TC})`,
  );
  console.log(`  Diferencia contra hoy: $${(enUsd - tAntes.enUsd).toLocaleString("es-CR")}/mes`);

  if (problemas.length > 0) {
    console.log(`\n⚠ ${problemas.length} punto(s) a revisar antes de confiar en el resultado.`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — no se escribió nada. Agregá --apply para aplicar los ${aplicables.length} cambios.)`);
    return;
  }

  for (const p of aplicables) await p.ejecutar!();
  const despues = await vigentes();
  const tDespues = totalDe(despues);
  console.log(`\n✓ ${aplicables.length} cambio(s) aplicados.`);
  console.log(`╔══ NÓMINA REAL AHORA ══╗  ${despues.length} salarios vigentes`);
  for (const s of despues) console.log(`  ${s.nombre.padEnd(46)} ${money(Number(s.monto), s.moneda).padStart(14)}`);
  console.log(
    `  TOTAL: $${tDespues.usd.toLocaleString("es-CR")} + ₡${tDespues.crc.toLocaleString("es-CR")} = $${tDespues.enUsd.toLocaleString("es-CR")}/mes (TC ${TC})`,
  );
  console.log(`\n  El punto de equilibrio de /finanzas/equilibrio se recalcula solo al recargar la página.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(close);
