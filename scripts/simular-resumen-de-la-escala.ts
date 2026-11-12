/**
 * scripts/simular-resumen-de-la-escala.ts — el Resumen de la escala que ve el cliente, SIN escribir nada (2026-11-09;
 * resumen ejecutivo desde el 10 nov; lib/exploraciones/resumen-de-la-escala.ts). SOLO LECTURA: la conexión va con
 * `default_transaction_read_only`.
 *
 *   - «Qué hicimos» (las reuniones de las sesiones, con su duración real) y lo que leería el agente.
 *   - Con --llamar: lo que escribiría el agente, parte por parte, con la CITA de cada pieza para revisarla a mano, lo que
 *     se descartó y por qué, el tiempo y el costo. No lo guarda: ese gasto NO aparece en «Gasto de la IA».
 *   - Con --modelo <id>: otro modelo, para comparar (por ejemplo claude-haiku-4-5).
 *   - Con --guardar-crudo <archivo>: deja la respuesta del agente en ese archivo; con --desde <archivo>, la relee de ahí
 *     sin llamar (para revisar la verificación sin volver a gastar).
 *   - Con --pagina <archivo>: lo que vería el cliente, lo que se ve adentro y el Resumen como se guardaría (formato 2).
 *   - Con --auditar: relee el Resumen GUARDADO pieza por pieza contra las transcripciones (`auditarElResumen`), sin IA.
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

type Cita = { fecha: string; turno: number; hablante: string; texto: string; confirmo?: { hablante: string; texto: string } };
const NL = "\n";
const citas = (cs: readonly Cita[]) =>
  cs.map((c) => `${NL}      ${c.fecha.slice(0, 10)} t${c.turno} ${c.hablante}: «${c.texto}»${c.confirmo ? `  → lo confirmó ${c.confirmo.hablante}: «${c.confirmo.texto}»` : ""}`).join("");

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
  console.log(`${NL}Leer las reuniones: ${Math.round((Date.now() - t0) / 100) / 10} s`);
  console.log(`${NL}── Qué hicimos`);
  for (const s of le.hicimos.sesiones) console.log(`  ${s.fecha.slice(0, 10)} · ${s.equipo ?? "sin equipo"} · ${s.minutos ?? "?"} min · ${s.quienes?.join(", ") || "-"}`);
  console.log(`  ${loQueHicimos(le.hicimos)?.texto}`);
  console.log(`${NL}── Reuniones que lee: ${le.ctx.reuniones.map((r) => `${r.clave} ${r.fecha.slice(0, 10)} ${r.equipo ?? ""} (${r.turnos.length} turnos; del cliente: ${r.delCliente.join(", ") || "?"})`).join(" · ")}`);
  // Con --auditar: lo que está GUARDADO, pieza por pieza contra las transcripciones, con las reglas de hoy (no llama a la IA).
  if (process.argv.includes("--auditar")) {
    const { auditarElResumen } = await import("@/lib/exploraciones/resumen-de-la-escala");
    const guardado = l.estado.contenido.resumenDeLaEscala;
    if (!guardado) console.log(`${NL}── Auditoría: no hay Resumen guardado.`);
    else {
      // Con las transcripciones completas: el recorte del medio de una reunión larga no hace pasar por inventada una cita.
      const completas = await loQueLeeElResumen(l, new Date(), { completas: true });
      const problemas = auditarElResumen(guardado, completas.ctx.reuniones, l.escala.areas.map((a) => ({ id: a.id, nombre: a.nombre })));
      console.log(`${NL}── Auditoría de lo guardado (v${guardado.v}, ${guardado.at}): ${problemas.length} problemas`);
      for (const x of problemas) console.log(`  - ${x.donde}: ${x.problema}`);
    }
  }
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
    const t = Date.now();
    const r = await getAnthropic().messages.create(modelo ? { ...p, model: modelo } : p);
    crudos.push(r);
    console.log(`  (llamada: ${Math.round((Date.now() - t) / 1000)} s · ${r.usage.output_tokens} tokens de salida · ${r.stop_reason})`);
    // Cada respuesta se guarda apenas llega: si la corrida se corta, lo pagado no se pierde.
    if (arg("--guardar-crudo")) fs.writeFileSync(arg("--guardar-crudo")!, JSON.stringify(crudos, null, 1));
    return r;
  });
  const guardarEn = arg("--guardar-crudo");
  if (guardarEn) fs.writeFileSync(guardarEn, JSON.stringify(crudos, null, 1));
  const seg = Math.round((Date.now() - t1) / 1000);
  const uso = escrito.usos.reduce((a, u) => ({ inputTokens: a.inputTokens + u.input_tokens, outputTokens: a.outputTokens + u.output_tokens }), { inputTokens: 0, outputTokens: 0 });
  const costo = costoDeLlamada(modelo ?? "claude-sonnet-4-6", uso);
  console.log(`${NL}── El agente (${modelo ?? "claude-sonnet-4-6"}): ${seg} s · ${uso.inputTokens} tokens de entrada, ${uso.outputTokens} de salida · ${costo === null ? "?" : `${costo.toFixed(3)} USD`}${escrito.usos.length > 1 ? ` · ${escrito.usos.length} llamadas` : ""}${escrito.cortado ? " · ⚠ CORTADO (no se guardaría)" : ""}`);
  const nombreDeArea = (a: string) => l.deLasAreas.find((x) => x.resultado.areaId === a)?.resultado.areaNombre ?? a;

  console.log(`${NL}── 1 · El negocio`);
  for (const [tipo, ps] of Object.entries(escrito.negocio)) for (const p of ps ?? []) console.log(`  [${tipo}] ${p.texto}${citas(p.citas)}`);
  console.log(`${NL}── 3 · El recorrido`);
  for (const e of escrito.recorrido) console.log(`  ${e.nombre} (${e.quien ?? "-"}): ${e.texto}${e.friccion ? `${NL}      ⚠ ${e.friccion}` : ""}${citas(e.citas)}`);
  for (const op of escrito.operativas) {
    console.log(`${NL}── 4 · ${op.nombre} (${nombreDeArea(op.areaId)})`);
    for (const [k, xs] of [
      ["organización", op.organizacion],
      ["bien", op.bien],
      ["frena", op.frena],
      ["reto", op.retos],
    ] as const)
      for (const p of xs) console.log(`  · ${k}: ${p.texto}${citas(p.citas)}`);
    for (const c of op.cifras) console.log(`  # ${c.cifra} [${c.estado}] ${c.texto}${c.nota ? ` — nota: ${c.nota}` : ""}${citas(c.citas)}`);
    if (op.falta) console.log(`  falta: ${op.falta}`);
  }
  console.log(`${NL}── Por qué`);
  for (const [a, x] of Object.entries(escrito.areas)) console.log(`  ${nombreDeArea(a)}: ${x.porque?.texto ?? "(sin)"}`);
  console.log(`${NL}── 5 · Pendientes`);
  for (const p of escrito.pendientes) console.log(`  [${p.tipo}] ${p.texto}${citas(p.citas)}`);
  console.log(`── Qué falta confirmar${NL}${Object.entries(escrito.confirmar).map(([d, t]) => `  • ${d}: ${t}`).join(NL)}`);
  console.log(`── Avisos${NL}${escrito.avisos.map((a) => `  ⚠ ${a}`).join(NL) || "  (ninguno)"}`);
  console.log(`${NL}── Descartado (${escrito.descartados.length})${NL}${escrito.descartados.map((d) => `  - ${d}`).join(NL)}`);

  const guardado = {
    v: 2 as const,
    at: new Date().toISOString(),
    por: null,
    modelo: modelo ?? "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: le.hicimos,
    datosRojos: [],
    areas: escrito.areas,
    entendimos: escrito.entendimos,
    falta: [],
    negocio: escrito.negocio,
    recorrido: escrito.recorrido,
    operativas: escrito.operativas,
    pendientes: escrito.pendientes,
    firmas: le.firmas,
    confirmar: escrito.confirmar,
    avisos: escrito.avisos,
  };
  const entorno = { edicion: l.fila.edicion, perfilCierre: l.fila.perfilCierre, perfilDespues: l.fila.perfilDespues, escalaVersion: l.escala.version };
  const porExplorar = Object.fromEntries(l.deLasAreas.map((x) => [x.resultado.areaId, x.porExplorar]));
  const resultados = l.deLasAreas.map((x) => x.resultado);
  const adentro = resumenParaLaPagina(guardado, resultados, l.estado.contenido.chequeo, entorno, { conCitas: true, porExplorar });
  const afuera = resumenParaLaPagina(guardado, resultados, l.estado.contenido.chequeo, entorno, { conCitas: false, porExplorar });
  // Con --pagina <archivo>: lo que vería el cliente y lo que se ve adentro, para pintarlo; y el guardado, para cargarlo.
  const paginaEn = arg("--pagina");
  if (paginaEn)
    fs.writeFileSync(paginaEn, JSON.stringify({ empresa: l.fila.client.name, afuera, adentro, guardado, areas: l.deLasAreas.map((x) => ({ id: x.resultado.areaId, nombre: x.resultado.areaNombre })) }, null, 1));
  console.log(`${NL}── Lo que ve el cliente: niveles y lo que falta validar`);
  for (const a of afuera.areas) console.log(`  ${a.nombre}: ${a.nivelNombre ?? "En medición"} — ${a.porque ?? "(sin)"} [${a.origenDelPorque}]`);
  for (const p of afuera.pendientes) console.log(`  [${p.tipo}] ${p.texto}`);
  console.log(`  Qué hicimos: ${afuera.hicimos?.texto}`);
  console.log(`  Sin explorar: ${afuera.sinExplorar.join(", ") || "ninguno"}`);
  console.log(`  Cifras que salen al cliente: ${afuera.tarjetas.flatMap((t) => t.subequipos.flatMap((x) => x.cifras.map((c) => `${x.nombre}: ${c.cifra} [${c.estado}]`))).join(" · ") || "ninguna"}`);
  for (const p of adentro.avisos ?? []) console.log(`  ⚠ ${p}`);
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
