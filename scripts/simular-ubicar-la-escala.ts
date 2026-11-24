/**
 * scripts/simular-ubicar-la-escala.ts — «Ubicar» de la preventa (y «Ubicar con lo que ya sabemos» de la de un cliente,
 * 24 nov), SIN escribir nada. SOLO LECTURA: la conexión va con `default_transaction_read_only`. Lee lo mismo que la corrida
 * (`loQueLeeUbicar`, lib/exploraciones/agente.ts) y arma el mismo pedido.
 *
 *   - Lo que leería: cada fuente con su id, su rótulo y su largo, y si es palabra del cliente.
 *   - Con --llamar: lo que propondría el agente (niveles con su cita, hipótesis y cuántas tarjetas), lo descartado, el
 *     tiempo y el costo. No lo guarda: ese gasto NO aparece en «Gasto de la IA».
 *   - Con --proyecto <id>: el proyecto de contexto (su handoff, cuestionarios, cronograma y memoria), como el selector.
 *   - Con --sesiones <id,id>: suma esas reuniones de Meet como sesiones, solo en memoria (el camino de la etapa 0: «sumar
 *     reuniones de entrega como sesiones»). `--equipo <clave>` les pone el equipo; `--de-trabajo` las marca como reuniones
 *     de trabajo (lo que ya sabemos), como «Reuniones de trabajo sugeridas».
 *   - Con --como-prospecto: como si la ficha fuera un prospecto (lo de antes del 24 nov: solo las sesiones, sin la base).
 *   - Con --reuniones: las reuniones de la empresa con texto, por el chokepoint, con cuánto habló el cliente en cada una.
 *
 *   npx tsx scripts/simular-ubicar-la-escala.ts --exploracion cmvil2i8v04rt06pg12clzis4 --llamar
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const NL = "\n";

async function main() {
  const id = arg("--exploracion");
  if (!id) throw new Error("Falta --exploracion <id>");
  const { imprimirDestino } = await import("./lib/guard");
  imprimirDestino("simulacro, solo lectura");
  const { leerExploracion, estadoDesdeFila, escalaParaExplorar, escalaDeLaExploracion } = await import("@/lib/exploraciones/servidor");
  const { loQueLeeUbicar, leerLaRespuestaDeUbicar } = await import("@/lib/exploraciones/agente");
  const { pedidoDePosicionar } = await import("@/lib/exploraciones/agente-pedido");
  const { esFuenteDelCliente } = await import("@/lib/exploraciones/contenido");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { costoDeLlamada } = await import("@/lib/ai/precios");

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") throw new Error(`La exploración no se puede leer: ${lectura.estado}`);
  const fila = process.argv.includes("--como-prospecto") ? { ...lectura.fila, client: { ...lectura.fila.client, kind: "PROSPECTO" as typeof lectura.fila.client.kind } } : lectura.fila;
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new Error("La escala no está publicada.");
  const estado = estadoDesdeFila(lectura.fila);
  console.log(`═══ ${fila.client.name} (${lectura.fila.client.kind}) · ${fila.projectId ? "exploración de un proyecto" : "preventa"} ${id}`);
  console.log(`    áreas en juego: ${estado.areas.join(", ") || "ninguna"} · sesiones: ${estado.contenido.sesiones.length}`);

  if (process.argv.includes("--reuniones")) await listarReuniones(fila.clientId);

  const sumadas = (arg("--sesiones") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (sumadas.length) {
    const { getClientSessions } = await import("@/lib/sessions/project-sources");
    const deLaEmpresa = await getClientSessions(fila.clientId, { ids: sumadas });
    const equipo = arg("--equipo");
    const fuera = sumadas.filter((x) => !deLaEmpresa.some((s) => s.id === x));
    if (fuera.length) console.log(`  ⚠ no son de esta empresa (no se suman): ${fuera.join(", ")}`);
    estado.contenido.sesiones = [
      ...estado.contenido.sesiones,
      ...deLaEmpresa.map((s, i) => ({
        id: `s-simulada${i + 1}`,
        titulo: s.title,
        fecha: new Date(s.date).toISOString().slice(0, 10),
        hecha: true,
        reunion: { id: s.id, origen: "meet" as const },
        ...(equipo ? { equipo: equipo as never } : {}),
        ...(process.argv.includes("--de-trabajo") ? { deLoQueYaSabemos: true } : {}),
      })),
    ];
    console.log(`  + ${deLaEmpresa.length} sesiones sumadas solo en memoria`);
  }
  const escala = escalaDeLaExploracion(escalaVig.general, estado);

  const t0 = Date.now();
  const { ctx, leido, hayDelCliente, conLoQueYaSabemos } = await loQueLeeUbicar(id, { fila, estado, escala }, { proyectoDeContexto: arg("--proyecto") ?? null });
  console.log(`${NL}── Lo que lee (${Math.round((Date.now() - t0) / 100) / 10} s) · con lo que ya sabemos: ${conLoQueYaSabemos ? ctx.loQueYaSabemos : "no"} · objetivo: ${ctx.objetivo}`);
  for (const f of leido.fuentes) console.log(`  ${esFuenteDelCliente(f.id) ? "●" : "○"} ${f.id.padEnd(4)} ${String(f.texto.length).padStart(6)}  ${f.etiqueta.slice(0, 120)}`);
  const pedido = pedidoDePosicionar(ctx);
  const caracteres = JSON.stringify(pedido.messages).length + String(pedido.system).length;
  console.log(`  pedido: ~${caracteres.toLocaleString("es")} caracteres (~${Math.round(caracteres / 3.6).toLocaleString("es")} tokens) · ${hayDelCliente ? "hay palabra del cliente" : "SIN palabra del cliente: no se llamaría a la IA"}`);

  if (!process.argv.includes("--llamar") || !hayDelCliente) return;
  const t1 = Date.now();
  const respuesta = await getAnthropic().messages.create(pedido);
  const usd = costoDeLlamada(pedido.model, { inputTokens: respuesta.usage.input_tokens, outputTokens: respuesta.usage.output_tokens });
  console.log(`${NL}── La respuesta (${Math.round((Date.now() - t1) / 1000)} s · ${respuesta.usage.input_tokens} de entrada, ${respuesta.usage.output_tokens} de salida · US$ ${usd?.toFixed(3) ?? "?"} · ${respuesta.stop_reason})`);
  if (respuesta.stop_reason === "max_tokens") console.log("  ⚠ salió cortada: la corrida terminaría en error");
  const r = leerLaRespuestaDeUbicar(respuesta, ctx, "simulacro");
  const nombre = (dim: string) => escala.areas.flatMap((a) => a.dimensiones.map((d) => ({ a, d }))).find((x) => x.d.id === dim);
  const porArea = new Map<string, string[]>();
  const valor = (v: unknown) => (v && typeof v === "object" ? (v as { nivel?: string; fuente?: string; evidencia?: string; porQue?: string }) : {});
  for (const it of r.items) {
    if (it.destino.tipo !== "nivel") continue;
    const v = valor(it.valor);
    const x = nombre(it.destino.dimensionId);
    const cita = it.fuentes.map((f) => `${f.id}${f.cita ? ` «${f.cita.slice(0, 200)}»` : ""}`).join(" · ");
    const linea = `${it.destino.dimensionId} ${x?.d.nombre ?? ""} → ${v.nivel}${v.fuente === "hipotesis" ? " (por explorar)" : ""}${NL}        ${cita}${NL}        porque: ${(v.porQue ?? "").slice(0, 220)}`;
    porArea.set(x?.a.nombre ?? "?", [...(porArea.get(x?.a.nombre ?? "?") ?? []), linea]);
  }
  for (const [area, lineas] of porArea) {
    console.log(`${NL}  ${area}`);
    for (const l of lineas) console.log(`    ${l}`);
  }
  const conCita = r.items.filter((it) => it.destino.tipo === "nivel" && valor(it.valor).fuente !== "hipotesis").length;
  console.log(`${NL}  ${conCita} niveles con cita · ${r.items.length - conCita} por explorar · ${r.descartadas} descartados · ${r.tarjetas ? Object.keys(r.tarjetas.porDimension).length : 0} tarjetas`);
}

/** Las reuniones de la empresa con texto (por el chokepoint) y cuánto habló el cliente en cada una. */
async function listarReuniones(clientId: string) {
  const { reunionesDeLaEmpresaParaElegir } = await import("@/lib/exploraciones/fuentes");
  const { quienHabloEnLasReuniones } = await import("@/lib/analizador-venta/analizar-server");
  const todas = await reunionesDeLaEmpresaParaElegir(clientId);
  const conTexto = todas.filter((r) => r.texto === "transcripcion");
  const quien = await quienHabloEnLasReuniones(conTexto.map((r) => r.sessionId));
  console.log(`${NL}── Reuniones de la empresa: ${todas.length} (las 100 más nuevas) · con transcripción: ${conTexto.length}`);
  for (const r of conTexto) {
    const q = quien.get(r.sessionId);
    console.log(`  ${r.date.slice(0, 10)}  cliente ${String(q?.cliente.porcentaje ?? "?").padStart(3)} %  ${r.sessionId}  ${r.title.slice(0, 80)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
