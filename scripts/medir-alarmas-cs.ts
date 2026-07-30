/**
 * scripts/medir-alarmas-cs.ts  (SOLO LECTURA)
 *
 * Radiografía de las alarmas de ATRASO de la cartera: qué proyectos alarman hoy y por qué.
 *
 * ── DE DÓNDE SALE ESTE SCRIPT ────────────────────────────────────────────────
 * Nació como el gate humano de O5, para medir un cambio de criterio antes de soltarlo:
 *
 *   ANTES     `scheduleAlarmsActive` = el handoff corrió Y la etapa ≥ Configuración técnica
 *   DESDE O5  `scheduleAlarmsActive` = el cronograma tiene LÍNEA BASE publicada
 *
 * Lo medido el 2026-07-30, sobre 57 proyectos de cartera:
 *   **4 se encienden · 0 se apagan · 53 igual.**
 * Los 4 (Metzger Supplies, Wherex, Spectrum, JUDESUR) ya tenían línea base publicada, así
 * que alarmar es lo correcto: alguien se comprometió con esas fechas. Nadie perdió avisos.
 *
 * Esa comparación ya no se puede reproducir —el criterio viejo necesitaba la etapa inferida,
 * y una implementación ya no la calcula—, así que el script quedó apuntando a lo que sí
 * sirve de acá en adelante: ver la cartera y entender por qué cada proyecto alarma o calla.
 *
 * Uso: npx tsx scripts/medir-alarmas-cs.ts
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";
import { proyectoDeCarteraWhere } from "@/lib/projects/scope";
import { loadLifecycleBatch } from "@/lib/lifecycle";

const { prisma, close } = createScriptDb();

async function main() {
  const proyectos = await prisma.project.findMany({
    where: proyectoDeCarteraWhere(),
    select: {
      id: true,
      name: true,
      hubspotOwnerName: true,
      hubspotPipelineStageLabel: true,
      client: { select: { name: true } },
      timeline: {
        select: {
          baselines: { where: { isActive: true }, take: 1, select: { id: true } },
          phases: { take: 1, select: { id: true } },
        },
      },
    },
  });
  const lifecycles = await loadLifecycleBatch(proyectos.map((p) => p.id));
  console.log(`Proyectos de CARTERA: ${proyectos.length}\n`);

  const alarman: string[] = [];
  const tentativos: string[] = [];
  const sinPlan: string[] = [];

  for (const p of proyectos) {
    const lc = lifecycles.get(p.id);
    const etapa =
      lc?.fuente === "pipeline" ? lc.label : lc?.fuente === "customer-success" ? lc.label : "—";
    const linea =
      `    ${p.client.name} · "${p.name}"\n` +
      `        etapa: ${etapa}   ·   CSE: ${p.hubspotOwnerName ?? "—"}`;

    if ((p.timeline?.phases.length ?? 0) === 0) sinPlan.push(linea);
    else if ((p.timeline?.baselines.length ?? 0) > 0) alarman.push(linea);
    else tentativos.push(linea);
  }

  console.log(`══ CON LÍNEA BASE — las alarmas de atraso APLICAN: ${alarman.length} ══\n`);
  for (const l of alarman) console.log(l);

  console.log(`\n══ CRONOGRAMA SIN SUBIR — fechas tentativas, NO alarman: ${tentativos.length} ══`);
  console.log(`   Nadie se comprometió con esas fechas todavía.\n`);
  for (const l of tentativos) console.log(l);

  console.log(`\n══ SIN CRONOGRAMA ARMADO: ${sinPlan.length} ══`);
  console.log(`   No hay atraso que medir.\n`);
  for (const l of sinPlan) console.log(l);

  console.log(
    `\n── RESUMEN: ${alarman.length} alarman · ${tentativos.length} tentativos · ${sinPlan.length} sin cronograma`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(close);
