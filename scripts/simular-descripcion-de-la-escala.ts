/**
 * scripts/simular-descripcion-de-la-escala.ts — la descripción de cada equipo bajo «Resultado general» de la escala que ve
 * el cliente, SIN escribir nada (2026-11-08; lib/exploraciones/descripcion-de-la-escala.ts). SOLO LECTURA: la conexión va
 * con `default_transaction_read_only`.
 *
 *   - Lo que sale hoy en la página (la guardada vigente o la de respaldo), por equipo.
 *   - Con --llamar: lo que escribiría el agente, con el motivo de lo que no pasó las reglas (y un segundo intento, como en
 *     la app). No lo guarda, y por eso ese gasto NO aparece en «Gasto de la IA» (el medidor no escribe en esta conexión).
 *
 *   npx tsx scripts/simular-descripcion-de-la-escala.ts --empresa "Centauro Solutions"
 *   npx tsx scripts/simular-descripcion-de-la-escala.ts --empresa "Centauro Solutions" --llamar
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
  const empresa = arg("--empresa");
  if (!empresa) throw new Error('Falta --empresa "Nombre"');
  const { prisma } = await import("@/lib/db/prisma");
  const { leerParaLaDescripcion, loQueLeeElAgente } = await import("@/lib/exploraciones/descripcion-de-la-escala-server");
  const { escribirConUnReintento } = await import("@/lib/exploraciones/descripcion-de-la-escala");
  const { getAnthropic } = await import("@/lib/anthropic");

  const clientes = await prisma.client.findMany({ where: { name: { contains: empresa, mode: "insensitive" } }, select: { id: true, name: true } });
  if (clientes.length !== 1) throw new Error(`«${empresa}» da ${clientes.length} empresas: ${clientes.map((c) => c.name).join(", ")}`);
  // Las que se comparten con el cliente: la preventa y la de la cuenta (la del proyecto `__strategy__`).
  const exps = await prisma.exploracionDeVenta.findMany({
    where: { clientId: clientes[0].id, archivadaEn: null, OR: [{ projectId: null }, { project: { serviceType: "__strategy__" } }] },
    select: { id: true, projectId: true },
  });
  for (const e of exps) {
    const l = await leerParaLaDescripcion(e.id);
    if (!l.ok) {
      console.log(`\n${e.id}: ${l.error}`);
      continue;
    }
    console.log(`\n═══ ${clientes[0].name} · exploración ${e.id} (${e.projectId ? "de la cuenta" : "preventa"})`);
    for (const x of l.deLasAreas) {
      console.log(`\n— ${x.resultado.areaNombre} · ${x.resultado.nivelNombre ?? "En medición"} · sale: ${x.descripcion.origen}${x.descripcion.guardada && !x.descripcion.vigente ? " (la guardada quedó vieja)" : ""}`);
      console.log(`  ${x.descripcion.texto}`);
    }
    if (!process.argv.includes("--llamar")) continue;
    const aEscribir = l.deLasAreas.filter((x) => x.resultado.preguntadas > 0);
    const { ctx, reglas } = await loQueLeeElAgente(l.fila, l.escala, aEscribir);
    const t0 = Date.now();
    // El mismo reintento que la app (`escribirConUnReintento`), sin el medidor: esta conexión no escribe.
    const escrito = await escribirConUnReintento(ctx, reglas, (pedido) => getAnthropic().messages.create(pedido));
    const uso = escrito.usos.reduce((a, u) => ({ input_tokens: a.input_tokens + u.input_tokens, output_tokens: a.output_tokens + u.output_tokens }), { input_tokens: 0, output_tokens: 0 });
    if (escrito.usos.length > 1) console.log("\n  (hubo un segundo intento con lo que no pasó las reglas)");
    console.log(`\n  ── Lo que escribiría el agente (${Math.round((Date.now() - t0) / 1000)} s · ${uso.input_tokens} tokens de entrada, ${uso.output_tokens} de salida · ~${((uso.input_tokens * 3 + uso.output_tokens * 15) / 1e6).toFixed(3)} USD):`);
    for (const x of aEscribir) {
      const a = x.resultado.areaId;
      console.log(`\n— ${x.resultado.areaNombre}: ${escrito.validas[a] ?? `(descartada: ${escrito.descartadas[a]?.join("; ")})`}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
