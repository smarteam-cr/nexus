/**
 * scripts/simular-casos-de-uso.ts — el antes y el después del agente de casos de uso de una preventa, SIN escribir nada
 * (2026-11-08; lib/casos-de-uso/armado.ts). SOLO LECTURA: la conexión va con `default_transaction_read_only`.
 *
 *   - Antes: los casos elegidos y los sugeridos que tiene hoy la preventa, con sus actividades (las suyas o las de la
 *     ficha del catálogo), sus horas y su precio mínimo.
 *   - Después (con --llamar): lo que propondría «Regenerar» hoy, con el mismo pedido que arma el agente, sus actividades,
 *     su precio mínimo y su argumento de valor, y lo que costó la llamada. No guarda nada: es una llamada suelta.
 *
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions"
 *   npx tsx scripts/simular-casos-de-uso.ts --empresa "Centauro Solutions" --llamar
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
  const { getAnthropic } = await import("@/lib/anthropic");
  const { armadoParaLaPreventa } = await import("@/lib/casos-de-uso/armado-server");
  const { actividadesDelElegido, horasDelCaso, horasDeLaVenta, precioMinimo } = await import("@/lib/casos-de-uso/armado");
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
    console.log(`  · [${origen}] ${c.titulo} — ${precio}`);
    for (const a of acts) console.log(`      - ${a.nombre}${a.veces > 1 ? ` ×${a.veces}` : ""}${a.sobreQue ? ` (${a.sobreQue})` : ""}`);
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

  const ctx = contextoDeLosCasos({ fila, estado, escala, general: vig.general }, true);
  const pedido = pedidoDeCasos(ctx);
  const largo = JSON.stringify(pedido).length;
  console.log(`\nEl pedido de «Regenerar»: ~${Math.round(largo / 4 / 1000)} mil tokens de entrada (estimado), ${ctx.rearmar?.length ?? 0} elegidos para rearmar.`);
  if (!process.argv.includes("--llamar")) {
    console.log("Sin --llamar no se consulta al modelo.");
    return;
  }
  const t0 = Date.now();
  const respuesta = await getAnthropic().messages.create(pedido);
  const r = leerLosCasos(respuesta, ctx, "simulacro");
  const u = respuesta.usage;
  const costo = (u.input_tokens * PRECIO_POR_MTOK.entrada + u.output_tokens * PRECIO_POR_MTOK.salida) / 1e6;
  console.log("\n=== DESPUÉS: lo que propondría «Regenerar» (no se guardó) ===");
  const despues = r.items.map((it) => {
    const id = (it.destino as { useCaseId: string }).useCaseId;
    return linea(id, it.valor as Caso, id in estado.contenido.casosDeUso ? "rearma un elegido" : "nuevo");
  });
  const h = horasDeLaVenta(despues, porId);
  console.log(`  Todos juntos: ${formatoHoras(h)} · desde ${formatoUsd(precioMinimo(h, tarifa))}`);
  console.log(
    `\nCosto: ${u.input_tokens} tokens de entrada + ${u.output_tokens} de salida = US$ ${costo.toFixed(3)} · ${Math.round((Date.now() - t0) / 1000)} s · ${r.descartadas} descartadas por el código · stop: ${respuesta.stop_reason}`,
  );
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
