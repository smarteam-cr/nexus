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
 *
 * Décima vuelta (2026-11-08, lib/casos-de-uso/orden.ts y mejorar.ts):
 *   --desde-cero   sugiere como si no hubiera nada elegido ni sugerido (para comparar los títulos de los mismos casos).
 *   --orden        además, el orden de la lista entera que propondría el agente, con el título claro de los de la escala.
 *   --mejorar "…"  además, «Mejorar con IA» con esa instrucción sobre el primer caso elegido.
 *
 * 2026-11-09 (Marco; lib/casos-de-uso/capas.ts y lectura-del-consultor.ts):
 *   --lectura "…"  la lectura del consultor, solo en memoria: la leen los agentes y se mide la llamada que la ordena por
 *                  departamento y busca en las transcripciones lo que se le pasó.
 *   Con --llamar, al final la lista en su orden (la casa, la capa de cada caso y sus conexiones), como la vería el vendedor.
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
  /* --lectura "texto" (2026-11-09, lib/casos-de-uso/lectura-del-consultor.ts): como si el consultor la hubiera escrito
     (solo en memoria): la leen los agentes y, con --llamar, se mide la llamada que la ordena y busca lo que se le pasó. */
  // En Windows, npx corta un argumento en el primer salto de línea: los renglones van separados por «\n» escrito.
  const lecturaDada = arg("--lectura")?.replace(/\\n/g, "\n");
  if (lecturaDada !== undefined) {
    const { claveDeInstrucciones } = await import("@/lib/exploraciones/notas-de-sesion");
    estado.contenido.notas = { ...estado.contenido.notas, [claveDeInstrucciones("casos")]: lecturaDada };
  }
  // --desde-cero (2026-11-09): como una preventa sin casos, también para el orden y la lista final (solo en memoria).
  if (process.argv.includes("--desde-cero")) {
    estado.contenido.casosDeUso = {};
    estado.contenido.casosDescartados = [];
    estado.propuesta.items = estado.propuesta.items.filter((it) => it.destino.tipo !== "casoDeUso");
    estado.propuesta.ordenDeLosCasos = null;
  }
  const ctx = contextoDeLosCasos({ fila, estado, escala, general: vig.general }, { revisar });
  const pedido = pedidoDeCasos(ctx);
  console.log(`\nEl pedido de «${revisar ? "Revisar" : "Sugerir"}»: ~${Math.round(JSON.stringify(pedido).length / 4 / 1000)} mil tokens de entrada (estimado), ${ctx.revisar?.length ?? 0} casos para revisar.`);
  if (!process.argv.includes("--llamar")) {
    console.log("Sin --llamar no se consulta al modelo.");
    return;
  }
  const costoDe = (u: { input_tokens: number; output_tokens: number }) => (u.input_tokens * PRECIO_POR_MTOK.entrada + u.output_tokens * PRECIO_POR_MTOK.salida) / 1e6;
  // La lectura del consultor va en paralelo con la sugerencia, como en agente.ts › proponerCasos.
  const { textoDeLaLectura } = await import("@/lib/exploraciones/notas-de-sesion");
  const textoLectura = textoDeLaLectura(estado.contenido.notas);
  const medirLaLectura = async () => {
    if (!textoLectura) return null;
    const { transcripcionesDeLaExploracion } = await import("@/lib/exploraciones/fuentes");
    const { leerLoLeido } = await import("@/lib/exploraciones/lo-leido");
    const { pedidoDeLaLectura, leerLaLectura, SESIONES_DE_LA_LECTURA, CARACTERES_DE_LA_LECTURA } = await import("@/lib/exploraciones/lectura-del-consultor-pedido");
    const c = estado.contenido;
    const { fuentes } = await transcripcionesDeLaExploracion(
      {
        exploracionId: fila.id,
        clientId: fila.clientId,
        projectId: fila.projectId,
        creadaEn: fila.createdAt,
        propuesta: estado.propuesta,
        leido: leerLoLeido(fila.test),
        sesiones: c.sesiones,
        fuera: c.fuera,
        elegidas: c.reunionesElegidas,
      },
      { cuantas: SESIONES_DE_LA_LECTURA, caracteres: CARACTERES_DE_LA_LECTURA },
    );
    const cl = { empresa: fila.client.name, texto: textoLectura, areas: escala.areas.filter((a) => estado.areas.includes(a.id)).map((a) => ({ id: a.id, nombre: a.nombre })), fuentes };
    const t = Date.now();
    const rl = await getAnthropic().messages.create(pedidoDeLaLectura(cl));
    const crudoDeLaLectura = arg("--crudo");
    if (crudoDeLaLectura) (await import("node:fs")).writeFileSync(`${crudoDeLaLectura}.lectura.json`, JSON.stringify(rl.content, null, 2));
    return { lectura: leerLaLectura(rl, cl, "simulacro"), uso: rl.usage, seg: Math.round((Date.now() - t) / 1000), stop: rl.stop_reason, reuniones: fuentes.map((f) => f.etiqueta) };
  };
  const t0 = Date.now();
  const [respuesta, medida] = await Promise.all([getAnthropic().messages.create(pedido), medirLaLectura()]);
  const segSugerir = Math.round((Date.now() - t0) / 1000);
  if (medida) {
    const nombreDe = (id: string | null) => (id ? (escala.areas.find((a) => a.id === id)?.nombre ?? id) : "Sin área");
    console.log(`\n=== LA LECTURA DEL CONSULTOR (no se guardó) · ${medida.reuniones.length} reuniones leídas ===`);
    for (const r of medida.reuniones) console.log(`  · ${r}`);
    for (const a of medida.lectura?.porArea ?? []) console.log(`  ${nombreDe(a.areaId)}: ${a.casos.join(" · ")}`);
    for (const s of medida.lectura?.seLePaso ?? []) console.log(`  ! Se te pasó: ${s.que} (${nombreDe(s.areaId)})\n      «${s.cita}» — ${s.reunion}`);
    console.log(`  Costo de la lectura: ${medida.uso.input_tokens} + ${medida.uso.output_tokens} tokens = US$ ${costoDe(medida.uso).toFixed(3)} · ${medida.seg} s · stop: ${medida.stop}`);
  }
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

  /* --orden: el orden de la lista entera (décima vuelta), con los sugeridos de esta vuelta como «nuevos». */
  let ordenDelAgente: string[] | null = null;
  let titulosClaros = new Map<string, string>();
  if (process.argv.includes("--orden")) {
    const { contextoDelOrden } = await import("@/lib/exploraciones/orden-de-los-casos");
    const { leerElOrden, pedidoDelOrden } = await import("@/lib/exploraciones/orden-pedido");
    const { pendientesVigentes } = await import("@/lib/exploraciones/agente");
    const co = await contextoDelOrden({ fila, estado, escala, pendientes: pendientesVigentes(estado, vig.general, escala), nuevos: r.items });
    const t2 = Date.now();
    const ro = await getAnthropic().messages.create(pedidoDelOrden(co));
    const seg = Math.round((Date.now() - t2) / 1000);
    const orden = leerElOrden(ro, co, "simulacro");
    const minutas = co.reuniones ? co.reuniones.split(/\r?\n/).length : 0;
    console.log(`\n=== ORDEN de la lista entera (no se guardó) · ${co.candidatos.length} casos, ${minutas} minutas leídas ===`);
    for (const [i, c] of (orden?.casos ?? []).entries()) {
      const cand = co.candidatos.find((x) => x.id === c.id)!;
      console.log(`  ${i + 1}. [${cand.origen}] ${c.titulo ?? cand.titulo}${c.titulo ? `  (catálogo: «${cand.titulo}»)` : ""}`);
      if (c.porQue) console.log(`      > ${c.porQue}`);
    }
    console.log(`  Costo del orden: ${ro.usage.input_tokens} + ${ro.usage.output_tokens} tokens = US$ ${costoDe(ro.usage).toFixed(3)} · ${seg} s · stop: ${ro.stop_reason}`);
    ordenDelAgente = orden?.casos.map((c) => c.id) ?? null;
    titulosClaros = new Map((orden?.casos ?? []).flatMap((c) => (c.titulo ? [[c.id, c.titulo] as const] : [])));
  }

  /* 2026-11-09 (lib/casos-de-uso/capas.ts): la lista como la vería el vendedor, con la casa, las capas y las conexiones. */
  {
    const { casaConLoPendiente, candidatosAlOrden } = await import("@/lib/exploraciones/casos-de-uso");
    const { pendientesVigentes } = await import("@/lib/exploraciones/agente");
    const { planDeLosCasos, explicacionDelOrden, NOMBRE_DE_LA_CAPA, VERBO_DE_LA_CONEXION } = await import("@/lib/casos-de-uso/capas");
    const pend = pendientesVigentes(estado, vig.general, escala);
    const { hubspot, casa } = casaConLoPendiente(estado, escala, pend);
    const nombreDeNivel = (l: string) => escala.niveles.find((x) => x.letra === l)?.nombre ?? l;
    const lista = candidatosAlOrden(estado, escala, pend, r.items);
    const plan = planDeLosCasos(lista, (c) => ({ id: c.id, capa: c.capa ?? "proceso", areaId: escala.areas.find((a) => a.nombre === c.area)?.id ?? null, conexiones: c.conexiones ?? [] }), {
      casa,
      ordenDelAgente: ordenDelAgente ?? r.items.map((it) => (it.destino as { useCaseId: string }).useCaseId),
    });
    const numero = new Map(plan.filas.map((c, i) => [c.id, i + 1]));
    const titulo = (c: (typeof lista)[number]) => titulosClaros.get(c.id) ?? c.titulo;
    console.log(`\n=== LA LISTA EN SU ORDEN (lo que vería el vendedor) · ${hubspot.porQue} ===`);
    console.log(`  ${explicacionDelOrden(fila.client.name, casa, hubspot, nombreDeNivel as never)}`);
    for (const [i, c] of plan.filas.entries()) {
      console.log(`  ${i + 1}. [${NOMBRE_DE_LA_CAPA[c.capa ?? "proceso"]} · ${c.origen} · ${c.area ?? "sin área"}] ${titulo(c)}`);
      const propias = r.items.find((it) => (it.destino as { useCaseId: string }).useCaseId === c.id)?.valor as Caso | undefined;
      for (const x of c.conexiones ?? []) {
        const otro = lista.find((o) => o.id === x.con);
        const porQue = propias?.conexiones?.find((p) => p.con === x.con)?.porQue;
        console.log(`      ↳ ${VERBO_DE_LA_CONEXION[x.tipo]} n.º ${numero.get(x.con)} «${otro ? titulo(otro) : x.con}»${porQue ? `: ${porQue}` : ""}`);
      }
    }
  }

  /* --mejorar "instrucción": «Mejorar con IA» sobre el primer caso elegido (décima vuelta). */
  const instruccion = arg("--mejorar");
  const primero = Object.entries(estado.contenido.casosDeUso)[0];
  if (instruccion && primero) {
    const { pedidoDeMejorar, leerLaMejora } = await import("@/lib/exploraciones/mejorar-pedido");
    const { diferenciaDeActividades } = await import("@/lib/casos-de-uso/mejorar");
    const [id, caso] = primero;
    const base = await contextoDePersonalizar({
      fila,
      empresa: fila.client.name,
      estado,
      exploracion: ctx.exploracion,
      useCaseId: id,
      caso,
      nombreDelArea: escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? null,
    });
    const cm = { ...base, actuales: actividadesDelElegido(caso, base.ficha?.actividades), instruccion };
    const t3 = Date.now();
    const rm = await getAnthropic().messages.create(pedidoDeMejorar(cm));
    const seg = Math.round((Date.now() - t3) / 1000);
    const m = leerLaMejora(rm, cm);
    console.log(`\n=== MEJORAR «${caso.titulo}» con «${instruccion}» (no se guardó) ===`);
    for (const c of m.cambios) console.log(`  * ${c}`);
    for (const f of diferenciaDeActividades(cm.actuales, m.actividades)) if (f.estado !== "igual") console.log(`  ${f.estado === "nueva" ? "+" : f.estado === "quitada" ? "-" : "~"} ${f.actividad.nombre}${f.antes ? ` (antes ${f.antes.veces}×, ahora ${f.actividad.veces}×)` : ""}`);
    for (const sg of m.sugeridas) console.log(`  ? sugiere ${sg.actividadId ? `[${sg.actividadId}]` : "[nueva]"} ${sg.nombre}: ${sg.porQue}`);
    console.log(`  Costo de mejorar: ${rm.usage.input_tokens} + ${rm.usage.output_tokens} tokens = US$ ${costoDe(rm.usage).toFixed(3)} · ${seg} s · stop: ${rm.stop_reason}`);
  }

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
