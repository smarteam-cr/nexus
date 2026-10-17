/**
 * scripts/guardar-primera-version-de-la-escala.ts — la PRIMERA versión de la escala de cada exploración que ya tiene
 * niveles confirmados (ficha B, 2026-10-17).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Desde la ficha B, la escala de la empresa se guarda en el tiempo (`VersionDeLaEscala`): una versión al confirmar un
 * nivel, al presentar el diagnóstico de un ciclo o con «Guardar esta versión». Lo que ya estaba confirmado ANTES del
 * deploy no tiene versión: sin esto, «Qué cambió» y «La escala en el tiempo» arrancan vacíos hasta el primer cambio.
 * Este script deja, por cada exploración viva con algún nivel, una foto de cómo está hoy.
 *
 * Solo escribe `VersionDeLaEscala`, por su único escritor (lib/exploraciones/versiones-de-la-escala.ts): una foto igual
 * a la última de esa exploración no se guarda, así que correrlo dos veces no duplica nada.
 *
 * Uso (después del SQL scripts/sql/2026-10-17-ficha-b-versiones-de-la-escala.sql y del deploy):
 *   npx tsx scripts/guardar-primera-version-de-la-escala.ts            (simulacro: solo lee y cuenta)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/guardar-primera-version-de-la-escala.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { fotoDeLaExploracion } from "@/lib/exploraciones/foto-de-la-escala";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "@/lib/exploraciones/servidor";
import { guardarVersionDeLaEscala } from "@/lib/exploraciones/versiones-de-la-escala";

const APPLY = resolverApply({ tablas: ["VersionDeLaEscala"] });

async function main() {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") throw new Error("La escala no está publicada en Nexus.");
  // Las dos clases a propósito: la preventa y la de cada proyecto posicionan a la empresa.
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { archivadaEn: null },
    select: {
      id: true,
      projectId: true,
      edicion: true,
      perfilCierre: true,
      perfilDespues: true,
      areas: true,
      contenido: true,
      propuesta: true,
      responsableEmail: true,
      archivadaEn: true,
      client: { select: { name: true } },
    },
  });
  let conNiveles = 0;
  let guardadas = 0;
  let iguales = 0;
  for (const f of filas) {
    const estado = estadoDesdeFila(f);
    const foto = fotoDeLaExploracion(escalaDeLaExploracion(general.general, estado), estado);
    if (!foto.areas.length) continue;
    conNiveles++;
    const resumen = foto.areas.map((a) => `${a.nombre} ${a.nivel ?? "sin ubicar"} (${a.conNivel}/${a.aplican}, ${a.conEvidencia} con evidencia)`).join(" · ");
    console.log(`${f.client.name} · ${f.projectId ? "proyecto" : "preventa"} · ${resumen}`);
    if (!APPLY) continue;
    const r = await guardarVersionDeLaEscala(f.id, { origen: "manual", email: "sistema", nota: "Primera versión: lo que ya estaba confirmado antes de guardar la escala en el tiempo." });
    if (r.estado === "guardada") guardadas++;
    else if (r.estado === "igual") iguales++;
    else console.log(`   ⚠ no se guardó: ${r.estado}`);
  }
  console.log(`\n${filas.length} exploraciones vivas · ${conNiveles} con algún nivel confirmado.`);
  console.log(APPLY ? `Guardadas: ${guardadas} · ya estaban: ${iguales}.` : "Simulacro: no se escribió nada. Con --apply se guarda una versión por cada una.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
