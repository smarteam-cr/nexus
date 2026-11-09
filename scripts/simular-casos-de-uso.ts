/**
 * scripts/simular-casos-de-uso.ts — el antes y el después del agente de casos de uso de una preventa, SIN escribir nada
 * (2026-11-08; lib/casos-de-uso/armado.ts). SOLO LECTURA: la conexión va con `default_transaction_read_only`.
 *
 *   - Antes: los casos elegidos y los sugeridos que tiene hoy la preventa, con sus actividades (las suyas o las de la
 *     ficha del catálogo), sus horas y su precio mínimo.
 *   - Después (con --llamar, desde el 2026-11-08: lib/casos-de-uso/personalizar.ts): lo que SUGERIRÍA hoy (o, con
 *     --revisar, lo que diría «Revisar» de lo que ya está) y, con --personalizar N, lo que dejaría ACEPTAR los N primeros:
 *     sus actividades personalizadas, qué cambió frente a la ficha y cómo subir el ticket. Cada llamada dice su costo y su
 *     tiempo. No guarda nada, y por eso ese gasto NO aparece en «Gasto de la IA» (el medidor no escribe en esta conexión).
 *
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions"
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions" --llamar --personalizar 2
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions" --llamar --revisar
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions" --llamar --crudo salida.json   (y lo que devolvió el modelo)
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Sonnet 4.6, en dólares por millón de tokens (entrada, salida). */
const PRECIO_POR_MTOK = { entrada: 3, salida: 15 };

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { estadoDesdeFila, escalaParaExplorar, escalaDeLaExploracion } = await import("@/lib/exploraciones/servidor");
  const { contextoDeLosCasos } = await import("@/lib/exploraciones/agente");
  const { pedidoDeCasos, leerLosCasos } = await import("@/lib/exploraciones/agente-pedido");
  const { casoPersonalizado, leerLaPersonalizacion, leerLaRevision, pedidoDePersonalizar } = await import("@/lib/exploraciones/personalizar-pedido");
  const { contextoDePersonalizar } = await import("@/lib/exploraciones/personalizar-caso");
  const { revisionEnUnaFrase } = await import("@/lib/casos-de-uso/personalizar");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { armadoParaLaPreventa } = await import("@/lib/casos-de-uso/armado-server");
  const { actividadesDelElegido, cambiosRespectoDeLaFicha, horasDelCaso, horasDeLaVenta, lineaDeCambios, precioMinimo } = await import("@/lib/casos-de-uso/armado");
  const { nombreVisible } = await import("@/lib/casos-de-uso/actividades-puras");
  const { formatoHoras, formatoUsd } = await import("@/lib/casos-de-uso/actividades");
  const { propuestaVigente } = await import("@/lib/exploraciones/contenido");
  type Caso = import("@/lib/exploraciones/contenido").CasoDeUsoElegido;

  const empresa = arg("--empresa");
  if (!empresa) throw new Error('Falta --empresa "Nombre"');
  const fila = await prisma.exploracionDeVenta.findFirst({
    where: { projectId: null, client: { name: { contains: empresa, mode: "insensitive" } } },
    orderBy: { updatedAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!fila) throw new Error(`No hay preventa de «${empresa}».`);
  const estado = estadoDesdeFila(fila);
  const vig = await escalaParaExplorar();
  if (vig.estado !== "ok") throw new Error("La escala no está publicada.");
  const escala = escalaDeLaExploracion(vig.general, estado);
  const armado = await armadoParaLaPreventa(fila.clientId);
  const porId = new Map(armado.biblioteca.map((a) => [a.id, a]));
  const tarifa = armado.tarifa;

  const linea = (id: string, c: Caso, origen: string) => {
    const acts = actividadesDelElegido(c, id.startsWith("cat-") ? armado.porDefecto[id.slice(4)] : undefined);
    const h = horasDelCaso(acts, porId);
    const precio = acts.length ? `${formatoHoras(h.horas)} · desde ${formatoUsd(precioMinimo(h.horas, tarifa))}${h.sinTiempo.length ? ` + ${h.sinTiempo.join(" y ")}` : ""}` : "sin actividades: sin precio";
    console.log(`  · [${origen}]${c.plan ? ` paso ${c.plan.paso}` : ""} ${c.titulo} — ${precio}${c.tituloDelCatalogo ? `
      (del catálogo: «${c.tituloDelCatalogo}»)` : ""}`);
    if (c.plan?.despuesDe) console.log(`      > Va en el paso ${c.plan.paso}: ${c.plan.despuesDe}`);
    if (c.paraVentas?.porQue) console.log(`      > Por qué para esta empresa: ${c.paraVentas.porQue}`);
    if (c.paraVentas?.comoSeArma) console.log(`      > Cómo se arma: ${c.paraVentas.comoSeArma}`);
    const ficha = id.startsWith("cat-") ? armado.porDefecto[id.slice(4)] : undefined;
    const cambios = cambiosRespectoDeLaFicha(acts, ficha, (x) => porId.get(x)?.nombre);
    if (cambios) console.log(`      > ${lineaDeCambios(cambios)}`);
    for (const a of acts) console.log(`      - ${nombreVisible(a, porId.get(a.actividadId)?.nombre)}${a.veces > 1 ? ` ×${a.veces}` : ""}${a.sobreQue ? ` (${a.sobreQue})` : ""}`);
    if (c.sinActividad) console.log(`      ⚠ Falta en la biblioteca: ${c.sinActividad}`);
    if (c.valorDeVenta) {
      console.log(`      $ Para subir el ticket (${c.valorDeVenta.palanca}): ${c.valorDeVenta.argumento}`);
      for (const n of c.valorDeVenta.numeros) console.log(`        · ${n.dato} — ${n.fuente}`);
      for (const f of c.valorDeVenta.falta) console.log(`        ? ${f}`);
    }
    return acts;
  };

  console.log(`\n${fila.client.name} · tarifa ${tarifa.nombre} (${tarifa.usdPorHora} USD/h)${tarifa.supuesta ? " — la empresa no tiene segmento: se usa la Estándar" : ""}`);
  console.log("\n=== ANTES: lo que tiene hoy la preventa ===");
  const antes = Object.entries(estado.contenido.casosDeUso).map(([id, c]) => linea(id, c, "elegido"));
  for (const it of propuestaVigente(estado).filter((x) => x.destino.tipo === "casoDeUso")) linea((it.destino as { useCaseId: string }).useCaseId, it.valor as Caso, "sugerido");
  if (antes.length) {
    const h = horasDeLaVenta(antes, porId);
    console.log(`  Elegidos juntos: ${formatoHoras(h)} · desde ${formatoUsd(precioMinimo(h, tarifa))}`);
  }

  /* 2026-11-08 (lib/casos-de-uso/personalizar.ts): el paso va en tres tiempos, y cada uno se mide por su lado.
     Sugerir (o «Revisar», con --revisar) es UNA llamada por vuelta; personalizar es UNA llamada por caso aceptado. */
  const revisar = process.argv.includes("--revisar");
  const ctx = contextoDeLosCasos({ fila, estado, escala, general: vig.general }, { revisar });
  const pedido = pedidoDeCasos(ctx);
  console.log(`\nEl pedido de «${revisar ? "Revisar" : "Sugerir"}»: ~${Math.round(JSON.stringify(pedido).length / 4 / 1000)} mil tokens de entrada (estimado), ${ctx.revisar?.length ?? 0} casos para revisar.`);
  if (!process.argv.includes("--llamar")) {
    console.log("Sin --llamar no se consulta al modelo.");
    return;
  }
  const costoDe = (u: { input_tokens: number; output_tokens: number }) => (u.input_tokens * PRECIO_POR_MTOK.entrada + u.output_tokens * PRECIO_POR_MTOK.salida) / 1e6;
  const t0 = Date.now();
  const respuesta = await getAnthropic().messages.create(pedido);
  const segSugerir = Math.round((Date.now() - t0) / 1000);
  const r = leerLosCasos(respuesta, ctx, "simulacro");
  const cambios = leerLaRevision(respuesta, ctx);
  // --crudo <archivo>: lo que devolvió el modelo tal cual, para comparar lo que dice con lo que manda.
  const crudo = arg("--crudo");
  if (crudo) (await import("node:fs")).writeFileSync(crudo, JSON.stringify(respuesta.content, null, 2));
  const { enOrdenDelPlan } = await import("@/lib/casos-de-uso/armado");
  console.log(`\n=== ${revisar ? "REVISAR" : "SUGERIR"}: lo que sugeriría hoy (no se guardó) ===`);
  for (const it of enOrdenDelPlan(r.items, (x) => (x.valor as Caso).plan?.paso)) linea((it.destino as { useCaseId: string }).useCaseId, it.valor as Caso, "sugerido");
  if (revisar) {
    console.log(`\n  ${revisionEnUnaFrase({ nuevos: r.items.map((it) => (it.valor as Caso).titulo), cambios })}`);
    for (const c of cambios) console.log(`  ~ ${c.titulo} (${c.elegido ? "elegido" : "sugerido"}): ${c.veredicto === "cambia" ? "cambiaría" : "ya no hace falta"} — ${c.motivo}`);
  }
  const uS = respuesta.usage;
  console.log(`\nCosto de ${revisar ? "revisar" : "sugerir"}: ${uS.input_tokens} + ${uS.output_tokens} tokens = US$ ${costoDe(uS).toFixed(3)} · ${segSugerir} s · ${r.descartadas} descartadas · stop: ${respuesta.stop_reason}`);

  /* --personalizar N: acepta los N primeros sugeridos (o, sin sugeridos, los N primeros elegidos) y los personaliza, uno
     por uno, como al apretar «Aceptar». */
  const n = Number(arg("--personalizar") ?? 0);
  if (!n) return;
  const aAceptar: [string, Caso][] = (r.items.length
    ? enOrdenDelPlan(r.items, (x) => (x.valor as Caso).plan?.paso).map((it) => [(it.destino as { useCaseId: string }).useCaseId, it.valor as Caso] as [string, Caso])
    : Object.entries(estado.contenido.casosDeUso)
  ).slice(0, n);
  const exploracionTexto = ctx.exploracion;
  let total = 0;
  for (const [id, caso] of aAceptar) {
    const cp = await contextoDePersonalizar({
      fila,
      empresa: fila.client.name,
      estado,
      exploracion: exploracionTexto,
      useCaseId: id,
      caso,
      nombreDelArea: escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? null,
    });
    const t1 = Date.now();
    const rp = await getAnthropic().messages.create(pedidoDePersonalizar(cp));
    const seg = Math.round((Date.now() - t1) / 1000);
    const personalizado = casoPersonalizado(caso, leerLaPersonalizacion(rp, cp));
    console.log(`\n=== ACEPTAR «${caso.titulo}»: lo personalizado (no se guardó) ===`);
    for (const c of personalizado.personalizado?.cambios ?? []) console.log(`  * ${c}`);
    linea(id, personalizado, "personalizado");
    total += costoDe(rp.usage);
    console.log(`  Costo: ${rp.usage.input_tokens} + ${rp.usage.output_tokens} tokens = US$ ${costoDe(rp.usage).toFixed(3)} · ${seg} s · stop: ${rp.stop_reason} · ${cp.reuniones ? cp.reuniones.split("\n").length : 0} minutas leídas`);
  }
  console.log(`\nTotal: ${revisar ? "revisar" : "sugerir"} US$ ${costoDe(uS).toFixed(3)} + ${aAceptar.length} aceptados US$ ${total.toFixed(3)} = US$ ${(costoDe(uS) + total).toFixed(3)}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
