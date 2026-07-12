/**
 * scripts/seed-costos-demo.ts — FASE 4: siembra COSTOS RECURRENTES demo para
 * probar el tab Costos y la Caja neta con datos desde el día 1.
 *
 * Qué siembra (8 costos, todos marcados "[demo cobranza]" en notas):
 *   SALARIOS (CRC, SIN vincular a personas reales — son cifras inventadas y los
 *   salarios son el dato más sensible del sistema; el picker se prueba a mano):
 *     · CSE Senior — modo BASE+FACTOR (1.400.000 × 1.35 = 1.890.000/mes):
 *       al editarlo, el form debe reabrir en ese modo con el preview vivo.
 *     · Admin Finanzas — all-in 950.000/mes.
 *     · Dev (contratación en curso) — all-in 1.200.000/mes, sin persona.
 *   HERRAMIENTAS:
 *     · HubSpot Partner — USD 450/mes.
 *     · Google Workspace — USD 1.440/AÑO → el panel debe mostrar "$120/mes"
 *       y la caja $60 por quincena (mensualización ANUAL/12 + mitad y mitad).
 *     · Herramienta legacy — USD 89/mes PAUSADA (activo=false): fuera del
 *       burn y de la caja, chip "Pausado" en la lista.
 *   FIJOS DE OPERACIÓN:
 *     · Alquiler oficina — CRC 650.000/mes.
 *     · Contabilidad externa — CRC 1.800.000/AÑO → 150.000/mes (ANUAL en CRC).
 *
 * Burn mensual esperado con esto: CRC 4.840.000 · USD 570 (la pausada no suma).
 * CRC y USD jamás se suman — verificalo en los tiles.
 *
 * Idempotente: si ya hay costos con la marca, no siembra (correr el cleanup
 * primero para re-sembrar). DRY-RUN por default; escribe SOLO con --apply
 * (local == PROD — el usuario revisa y aprueba).
 * LIMPIEZA: scripts/cleanup-cobranza-demo.ts (borra también estos costos).
 *
 *   npx tsx scripts/seed-costos-demo.ts            # dry-run
 *   npx tsx scripts/seed-costos-demo.ts --apply    # aplica
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

const APPLY = process.argv.includes("--apply");
const MARK = "[demo cobranza]";

const round2 = (n: number) => Math.round(n * 100) / 100;

type CostoSeed = {
  categoria: "SALARIO" | "HERRAMIENTA" | "FIJO_OPERACION";
  nombre: string;
  monto: number;
  moneda: "CRC" | "USD";
  frecuencia: "MENSUAL" | "ANUAL";
  montoBase?: number;
  factorCargas?: number;
  activo?: boolean;
  nota: string;
};

const COSTOS: CostoSeed[] = [
  {
    categoria: "SALARIO",
    nombre: "Salario CSE Senior (demo)",
    montoBase: 1_400_000,
    factorCargas: 1.35,
    monto: round2(1_400_000 * 1.35), // 1.890.000 — el all-in canónico
    moneda: "CRC",
    frecuencia: "MENSUAL",
    nota: "Sembrado en modo base+factor: al editar debe reabrir con 1.400.000 × 1.35.",
  },
  {
    categoria: "SALARIO",
    nombre: "Salario Admin Finanzas (demo)",
    monto: 950_000,
    moneda: "CRC",
    frecuencia: "MENSUAL",
    nota: "All-in directo, sin base+factor.",
  },
  {
    categoria: "SALARIO",
    nombre: "Salario Dev — contratación en curso (demo)",
    monto: 1_200_000,
    moneda: "CRC",
    frecuencia: "MENSUAL",
    nota: "Salario sin persona vinculada (la vacante todavía no se llenó).",
  },
  {
    categoria: "HERRAMIENTA",
    nombre: "HubSpot Partner (demo)",
    monto: 450,
    moneda: "USD",
    frecuencia: "MENSUAL",
    nota: "Herramienta mensual en USD.",
  },
  {
    categoria: "HERRAMIENTA",
    nombre: "Google Workspace (demo)",
    monto: 1_440,
    moneda: "USD",
    frecuencia: "ANUAL",
    nota: "ANUAL: el panel debe mostrar $120 por mes y la caja $60 por quincena.",
  },
  {
    categoria: "HERRAMIENTA",
    nombre: "Herramienta legacy (demo)",
    monto: 89,
    moneda: "USD",
    frecuencia: "MENSUAL",
    activo: false,
    nota: "PAUSADA: fuera del burn y de la caja neta, con chip Pausado.",
  },
  {
    categoria: "FIJO_OPERACION",
    nombre: "Alquiler oficina (demo)",
    monto: 650_000,
    moneda: "CRC",
    frecuencia: "MENSUAL",
    nota: "Fijo mensual en CRC.",
  },
  {
    categoria: "FIJO_OPERACION",
    nombre: "Contabilidad externa (demo)",
    monto: 1_800_000,
    moneda: "CRC",
    frecuencia: "ANUAL",
    nota: "ANUAL en CRC: 150.000 por mes.",
  },
];

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}\n`);

  const existentes = await prisma.costoRecurrente.count({
    where: { notas: { contains: MARK } },
  });
  if (existentes > 0) {
    console.log(
      `Ya hay ${existentes} costo(s) demo sembrados — no se re-siembra.\n` +
        "Para empezar de cero: npx tsx scripts/cleanup-cobranza-demo.ts --apply",
    );
    return;
  }

  // Resumen del burn esperado (solo activos, ANUAL/12) para cotejar en la UI.
  const burn = { CRC: 0, USD: 0 };
  for (const c of COSTOS) {
    if (c.activo === false) continue;
    burn[c.moneda] = round2(burn[c.moneda] + (c.frecuencia === "ANUAL" ? round2(c.monto / 12) : c.monto));
  }

  for (const c of COSTOS) {
    const mensual = c.frecuencia === "ANUAL" ? `${round2(c.monto / 12)}/mes` : "mensual";
    console.log(
      `  + [${c.categoria}] ${c.nombre} — ${c.moneda} ${c.monto} ${c.frecuencia} (${mensual})` +
        `${c.montoBase ? ` · base ${c.montoBase} × ${c.factorCargas}` : ""}` +
        `${c.activo === false ? " · PAUSADO" : ""}`,
    );
  }
  console.log(`\nBurn mensual esperado en la UI → CRC ${burn.CRC} · USD ${burn.USD}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: nada escrito. Pasá --apply para sembrar.");
    return;
  }

  await prisma.costoRecurrente.createMany({
    data: COSTOS.map((c) => ({
      categoria: c.categoria,
      nombre: c.nombre,
      monto: c.monto,
      moneda: c.moneda,
      frecuencia: c.frecuencia,
      teamMemberId: null,
      montoBase: c.montoBase ?? null,
      factorCargas: c.factorCargas ?? null,
      activo: c.activo ?? true,
      notas: `${c.nota} ${MARK}`,
    })),
  });
  const total = await prisma.costoRecurrente.count({ where: { notas: { contains: MARK } } });
  console.log(`\n✓ Sembrados ${total} costos demo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
