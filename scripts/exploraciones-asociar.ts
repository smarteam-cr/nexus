/**
 * scripts/exploraciones-asociar.ts — K5 (2026-10-27): qué sesiones de las exploraciones uniría SOLA Nexus a su reunión, y
 * qué preguntaría arriba del lienzo. Es el simulacro que se revisa con Elías ANTES de prender el job
 * `exploraciones-asociar` (EXPLORACIONES_ASOCIAR_ENABLED=1, apagado por defecto).
 *
 * La regla es la del job (lib/exploraciones/asociar.ts): las reuniones salen del chokepoint, nunca de otra empresa.
 *
 * Uso:
 *   npx tsx scripts/exploraciones-asociar.ts                                # en seco: lista lo que uniría y lo que preguntaría
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/exploraciones-asociar.ts --apply     # une las que no tienen duda (una vuelta del job)
 *
 * Respaldo: la tabla ExploracionDeVenta (B-06). Deshacer una: en el lienzo, «Nexus la unió sola» › «Deshacer».
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";

async function main() {
  const escribir = resolverApply({ tablas: ["ExploracionDeVenta"] });
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco, solo lectura"})\n`);
  const { asociacionesDeLaFila, asociarEnLasExploraciones, exploracionesConSesionesLibres } = await import("@/lib/exploraciones/asociar-server");
  const { leerExploracion } = await import("@/lib/exploraciones/servidor");
  const { prisma } = await import("@/lib/db/prisma");
  try {
    const ahora = new Date();
    const ids = await exploracionesConSesionesLibres(ahora);
    console.log(`Exploraciones vivas con alguna sesión que espera su reunión: ${ids.length}\n`);
    let solas = 0;
    let preguntas = 0;
    for (const id of ids) {
      const l = await leerExploracion(id);
      if (l.estado !== "ok") continue;
      const { sugerencias } = await asociacionesDeLaFila(l.fila, ahora);
      if (!sugerencias.length) continue;
      console.log(`· ${l.fila.client.name} (${l.fila.projectId ? "proyecto" : "preventa"}, ${id})`);
      for (const s of sugerencias) {
        if (s.sola && s.sesion) solas++;
        else preguntas++;
        console.log(`    ${s.sola && s.sesion ? "UNE SOLA" : "pregunta"} ${s.pregunta} «${s.reunion.titulo}» (${s.reunion.fecha.slice(0, 10)}) — ${s.porque}${s.dudas.length ? ` Duda: ${s.dudas.join(" ")}` : ""}`);
      }
    }
    console.log(`\nUniría solas: ${solas} · Preguntaría: ${preguntas}`);
    if (!escribir) {
      console.log("\nEn seco: no se escribió nada. Para unir las que no tienen duda: ALLOW_PROD_WRITE=1 … --apply");
      return;
    }
    const r = await asociarEnLasExploraciones(ahora);
    console.log(`\nEscrito: ${r.asociadas} sesiones unidas solas en ${r.miradas} exploraciones miradas${r.errores.length ? `; ${r.errores.length} con error: ${r.errores.slice(0, 5).join(" · ")}` : ""}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
