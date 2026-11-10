/**
 * scripts/simular-resumen-de-la-escala.ts — el Resumen de la escala que ve el cliente, SIN escribir nada (2026-11-09;
 * lib/exploraciones/resumen-de-la-escala.ts). SOLO LECTURA: la conexión va con `default_transaction_read_only`.
 *
 *   - «Lo que hicimos» (las reuniones de las sesiones, con su duración real) y lo que leería el agente.
 *   - Con --llamar: lo que escribiría el agente, con la CITA de cada dato rojo y cada hallazgo para revisarla a mano, lo que
 *     se descartó y por qué, el tiempo y el costo. No lo guarda: ese gasto NO aparece en «Gasto de la IA».
 *   - Con --modelo <id>: otro modelo, para comparar (por ejemplo claude-haiku-4-5).
 *   - Con --guardar-crudo <archivo>: deja la respuesta del agente en ese archivo; con --desde <archivo>, la relee de ahí
 *     sin llamar (para revisar la verificación sin volver a gastar).
 *
 *   npx tsx scripts/simular-resumen-de-la-escala.ts --exploracion cmw3wmh7w0sl108ppdf5mujjt --llamar
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const id = arg("--exploracion");
  if (!id) throw new Error("Falta --exploracion <id>");

  const { leerParaElResumen, loQueLeeElResumen } = await import("@/lib/exploraciones/resumen-de-la-escala-server");
  const { escribirElResumen, loQueHicimos, resumenParaLaPagina } = await import("@/lib/exploraciones/resumen-de-la-escala");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { costoDeLlamada } = await import("@/lib/ai/precios");

  const l = await leerParaElResumen(id);
  if (!l.ok) throw new Error(l.error);
  console.log(`═══ ${l.fila.client.name} · ${l.deLasAreas.map((x) => `${x.resultado.areaNombre} (${x.resultado.nivelNombre ?? "En medición"})`).join(" · ")}`);
  const t0 = Date.now();
  const le = await loQueLeeElResumen(l);
  console.log(`\nLeer las reuniones: ${Math.round((Date.now() - t0) / 100) / 10} s`);
  console.log("\n── Lo que hicimos");
  for (const s of le.hicimos.sesiones) console.log(`  ${s.fecha.slice(0, 10)} · ${s.equipo ?? "sin equipo"} · ${s.minutos ?? "?"} min`);
  console.log(`  ${loQueHicimos(le.hicimos)?.texto}`);
  console.log(`\n── Reuniones que lee: ${le.ctx.reuniones.map((r) => `${r.clave} ${r.fecha.slice(0, 10)} ${r.equipo ?? ""} (${r.turnos.length} turnos; del cliente: ${r.delCliente.join(", ") || "?"})`).join(" · ")}`);
  if (!process.argv.includes("--llamar")) return;

  const modelo = arg("--modelo");
  const fs = await import("node:fs");
  const desde = arg("--desde");
  const crudos: unknown[] = [];
  const guardados = desde ? JSON.parse(fs.readFileSync(desde, "utf8")) : [];
  const t1 = Date.now();
  const escrito = await escribirElResumen(le, async (p) => {
    // Con --desde, las respuestas guardadas en el mismo orden en que se pidieron (el Resumen, y el arreglo si lo hubo).
    if (desde) return guardados.shift();
    const r = await getAnthropic().messages.create(modelo ? { ...p, model: modelo } : p);
    crudos.push(r);
    return r;
  });
  const guardarEn = arg("--guardar-crudo");
  if (guardarEn) fs.writeFileSync(guardarEn, JSON.stringify(crudos, null, 1));
  const seg = Math.round((Date.now() - t1) / 1000);
  const uso = escrito.usos.reduce((a, u) => ({ inputTokens: a.inputTokens + u.input_tokens, outputTokens: a.outputTokens + u.output_tokens }), { inputTokens: 0, outputTokens: 0 });
  const costo = costoDeLlamada(modelo ?? "claude-sonnet-4-6", uso);
  console.log(`\n── El agente (${modelo ?? "claude-sonnet-4-6"}): ${seg} s · ${uso.inputTokens} tokens de entrada, ${uso.outputTokens} de salida · ${costo === null ? "?" : `${costo.toFixed(3)} USD`}${escrito.usos.length > 1 ? ` · ${escrito.usos.length} llamadas` : ""}`);
  const nombreDeArea = (a: string) => l.deLasAreas.find((x) => x.resultado.areaId === a)?.resultado.areaNombre ?? a;
  console.log("\n── Datos rojos");
  for (const d of escrito.datosRojos) {
    console.log(`  [${nombreDeArea(d.areaId)} · ${d.dimensionId ?? "-"}] ${d.cifra} — ${d.texto}`);
    for (const c of d.citas) console.log(`      ${c.fecha.slice(0, 10)} t${c.turno} ${c.hablante}: «${c.texto}»${c.confirmo ? `  → lo confirmó ${c.confirmo.hablante}: «${c.confirmo.texto}»` : ""}`);
  }
  for (const [a, x] of Object.entries(escrito.areas)) {
    console.log(`\n── ${nombreDeArea(a)}`);
    for (const h of x.hallazgos) console.log(`  • [${h.dimensionId ?? "-"}] ${h.texto}${h.citas.map((c) => `\n      ${c.fecha.slice(0, 10)} t${c.turno} ${c.hablante}: «${c.texto}»`).join("")}`);
    console.log(`  Por qué: ${x.porque?.texto ?? "(sin)"}`);
  }
  console.log(`\n── ¿Entendimos bien?\n${escrito.entendimos.map((p) => `  • ${p.texto}`).join("\n")}`);
  console.log(`── ¿Falta algo?\n${escrito.falta.map((p) => `  • ${p.texto}`).join("\n")}`);
  console.log(`\n── Descartado (${escrito.descartados.length})\n${escrito.descartados.map((d) => `  - ${d}`).join("\n")}`);
  const conCitas = resumenParaLaPagina(
    { v: 1, at: new Date().toISOString(), por: null, modelo: "", agentRunId: null, hicimos: le.hicimos, datosRojos: escrito.datosRojos, areas: escrito.areas, entendimos: escrito.entendimos, falta: escrito.falta },
    l.deLasAreas.map((x) => x.resultado),
    l.estado.contenido.chequeo,
    { edicion: l.fila.edicion, perfilCierre: l.fila.perfilCierre, perfilDespues: l.fila.perfilDespues, escalaVersion: l.escala.version },
    { conCitas: true },
  );
  const pagina = resumenParaLaPagina(
    { v: 1, at: conCitas.at ?? "", por: null, modelo: "", agentRunId: null, hicimos: le.hicimos, datosRojos: escrito.datosRojos, areas: escrito.areas, entendimos: escrito.entendimos, falta: escrito.falta },
    l.deLasAreas.map((x) => x.resultado),
    l.estado.contenido.chequeo,
    { edicion: l.fila.edicion, perfilCierre: l.fila.perfilCierre, perfilDespues: l.fila.perfilDespues, escalaVersion: l.escala.version },
    { conCitas: false },
  );
  // Con --pagina <archivo>: lo que vería el cliente y lo que se ve adentro, para pintarlo.
  const paginaEn = arg("--pagina");
  if (paginaEn) fs.writeFileSync(paginaEn, JSON.stringify({ empresa: l.fila.client.name, afuera: pagina, adentro: conCitas, areas: l.deLasAreas.map((x) => ({ id: x.resultado.areaId, nombre: x.resultado.areaNombre })) }, null, 1));
  console.log("\n── Dónde quedan (lo que ve el cliente)");
  for (const a of pagina.areas) console.log(`  ${a.nombre}: ${a.nivelNombre ?? "En medición"} — ${a.porque ?? "(sin)"} [${a.origenDelPorque}]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
