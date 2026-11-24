/**
 * scripts/escala-con-lo-que-sabemos.ts — arma el BORRADOR de La escala de un cliente con lo que ya sabemos (24 nov; DECISIONS
 * «La escala de un cliente con lo que ya sabemos»): lo mismo que hacen los botones de la preventa, sin publicar nada.
 *
 *   - `--sugeridas`: las reuniones de trabajo que sugiere Nexus (las mismas de «+ Agregar sesión › Reuniones de trabajo
 *     sugeridas»), con cuánto habló el cliente. Solo lee.
 *   - `--sesiones gmeet_a:ventas,gmeet_b:marketing,gmeet_c`: suma esas reuniones como REUNIONES DE TRABAJO, cada una con su
 *     equipo si se da (y, como en la pantalla, el área de ese equipo entra a las áreas en juego). Solo reuniones de esta
 *     empresa, por el chokepoint (invariante #1); las que ya son sesión se saltan.
 *   - `--ubicar [--proyecto <id>]`: «Ubicar con lo que ya sabemos», la misma corrida del botón (queda en «Gasto de la IA»),
 *     y espera a que termine. Lo propuesto queda sugerido: nada se confirma solo.
 * Sin `--apply` dice qué haría, sin escribir ni llamar a la IA (conexión de solo lectura). Con `--apply` y ALLOW_PROD_WRITE=1
 * lo hace, con respaldo de ExploracionDeVenta. `--por <correo>` queda como quien lo pidió.
 * Lo que sigue lo decide una persona en la pantalla: usar lo propuesto, elegir los equipos en «Acceso» y armar el Resumen
 * (o `scripts/simular-resumen-de-la-escala.ts --guardar --apply`). Publicar no lo hace ningún script.
 *
 *   npx tsx scripts/escala-con-lo-que-sabemos.ts --exploracion cmvil2i8v04rt06pg12clzis4 --sugeridas
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/escala-con-lo-que-sabemos.ts --exploracion <id> --sesiones gmeet_x:ventas --ubicar --proyecto <id> --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";

const APLICA = process.argv.includes("--apply");
if (!APLICA) process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const id = arg("--exploracion");
  if (!id) throw new Error("Falta --exploracion <id>");
  const { imprimirDestino, resolverApply } = await import("./lib/guard");
  imprimirDestino("escala-con-lo-que-sabemos");
  const aplicar = resolverApply({ tablas: ["ExploracionDeVenta"] });
  const por = arg("--por") ?? null;

  const { prisma } = await import("@/lib/db/prisma");
  const { leerExploracion, estadoDesdeFila, escalaParaExplorar, escalaDeLaExploracion, aplicarCambios } = await import("@/lib/exploraciones/servidor");
  const { partirDeLoQueYaSabemos } = await import("@/lib/exploraciones/posicionar");
  const { getClientSessions } = await import("@/lib/sessions/project-sources");
  const { nuevoIdDeSesion } = await import("@/lib/exploraciones/guia");
  const { EQUIPOS, EQUIPOS_DEL_CLIENTE, areaQueSuma } = await import("@/lib/exploraciones/equipos");
  const { hoyEnCostaRica } = await import("@/lib/exploraciones/fechas");

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") throw new Error(`La exploración no se puede leer: ${lectura.estado}`);
  const fila = lectura.fila;
  if (fila.projectId) throw new Error("Es la exploración de un proyecto: esto es para la preventa de un cliente.");
  if (!partirDeLoQueYaSabemos(fila.client.kind)) throw new Error(`${fila.client.name} es ${fila.client.kind}: lo que ya sabemos es para la preventa de un cliente.`);
  if (fila.archivadaEn) throw new Error("La preventa está archivada.");
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new Error("La escala no está publicada.");
  console.log(`═══ ${fila.client.name} · preventa ${id} · ${aplicar ? "APLICA" : "simulacro (no escribe)"}`);

  if (process.argv.includes("--sugeridas")) {
    const { reunionesDeLaEmpresaParaElegir } = await import("@/lib/exploraciones/fuentes");
    const { quienHabloEnLasReuniones } = await import("@/lib/analizador-venta/analizar-server");
    const { sugerirReunionesDeTrabajo } = await import("@/lib/exploraciones/reuniones-de-trabajo");
    const { PARTE_MINIMA_DEL_CLIENTE } = await import("@/lib/exploraciones/resumen-de-la-escala");
    const conTexto = (await reunionesDeLaEmpresaParaElegir(fila.clientId)).filter((r) => r.texto === "transcripcion").slice(0, 40);
    const quien = await quienHabloEnLasReuniones(conTexto.map((r) => r.sessionId));
    const parte = new Map(conTexto.map((r) => [r.sessionId, quien.get(r.sessionId)?.fuente === "nada" ? null : (quien.get(r.sessionId)?.cliente.porcentaje ?? null)] as const));
    console.log("\n── Reuniones de trabajo sugeridas");
    for (const s of sugerirReunionesDeTrabajo(conTexto, parte, { minimo: PARTE_MINIMA_DEL_CLIENTE })) {
      console.log(`  ${s.fecha.slice(0, 10)}  ${String(s.delCliente).padStart(3)} %  ${(s.equipo ?? "-").padEnd(10)} ${s.sessionId}  ${s.titulo}${s.pocoDelCliente ? "  (la empresa habló poco)" : ""}`);
    }
  }

  // ── Sumar las reuniones de trabajo ──────────────────────────────────────────
  const pedidas = (arg("--sesiones") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [reunion, equipo] = x.split(":");
      if (equipo && !(EQUIPOS_DEL_CLIENTE as readonly string[]).includes(equipo)) throw new Error(`Equipo desconocido «${equipo}»: ${EQUIPOS_DEL_CLIENTE.join(", ")}`);
      return { reunion, equipo: (equipo || null) as (typeof EQUIPOS_DEL_CLIENTE)[number] | null };
    });
  if (pedidas.length) {
    const estado = estadoDesdeFila(fila);
    const escala = escalaDeLaExploracion(escalaVig.general, estado);
    // ⛔ Invariante 1: solo reuniones de ESTA empresa, por el chokepoint.
    const deLaEmpresa = new Map((await getClientSessions(fila.clientId, { ids: pedidas.map((p) => p.reunion) })).map((s) => [s.id, s]));
    const yaSonSesion = new Set(estado.contenido.sesiones.flatMap((s) => (s.reunion?.origen === "meet" ? [s.reunion.id] : [])));
    let areas = [...estado.areas];
    const sesiones = [];
    console.log("\n── Reuniones de trabajo que se suman");
    for (const p of pedidas) {
      const s = deLaEmpresa.get(p.reunion);
      if (!s) {
        console.log(`  ✗ ${p.reunion}: no es de ${fila.client.name} (o no existe): no se suma`);
        continue;
      }
      if (yaSonSesion.has(p.reunion)) {
        console.log(`  · ${p.reunion}: ya es una sesión, se salta`);
        continue;
      }
      const area = p.equipo ? areaQueSuma(p.equipo, areas, escala.areas) : null;
      if (area) areas = [...areas, area];
      sesiones.push({ id: nuevoIdDeSesion(), reunion: { id: p.reunion, origen: "meet" as const }, fecha: hoyEnCostaRica(new Date(s.date)), deLoQueYaSabemos: true, ...(p.equipo ? { equipo: p.equipo } : {}) });
      console.log(`  + ${new Date(s.date).toISOString().slice(0, 10)} ${s.title}${p.equipo ? ` · con ${EQUIPOS[p.equipo].nombre}` : ""}${area ? ` (suma el área ${area})` : ""}`);
      await espera(5); // ids distintos aunque se armen en el mismo milisegundo
    }
    if (sesiones.length && aplicar) {
      const fuera = new Set(estado.contenido.fuera);
      const claves = sesiones.map((x) => `meet:${x.reunion.id}`).filter((k) => fuera.has(k));
      const ops = [
        ...sesiones.map((sesion) => ({ op: "agregarSesion" as const, sesion })),
        ...(claves.length ? [{ op: "fuera" as const, claves, fuera: false }] : []),
        ...(areas.length !== estado.areas.length ? [{ op: "areas" as const, areas }] : []),
      ];
      const r = await aplicarCambios(id, fila.version, ops, escalaVig.general, { quienPide: por });
      if (r.estado !== "ok") throw new Error(`No se sumaron las sesiones: ${r.estado}${"error" in r ? ` (${r.error})` : ""}. Vuelve a correrlo.`);
      console.log(`  ✓ ${sesiones.length} sumadas`);
    }
  }

  // ── Ubicar con lo que ya sabemos ────────────────────────────────────────────
  if (process.argv.includes("--ubicar")) {
    const proyecto = arg("--proyecto") ?? null;
    if (proyecto) {
      const p = await prisma.project.findFirst({ where: { id: proyecto, clientId: fila.clientId }, select: { name: true } });
      if (!p) throw new Error("Ese proyecto no es de esta empresa.");
      console.log(`\n── Ubicar con lo que ya sabemos, con el contexto de «${p.name}»`);
    } else console.log("\n── Ubicar con lo que ya sabemos, sin un proyecto de contexto");
    if (!aplicar) {
      console.log("  (simulacro: no se lanza. Para ver qué propondría sin guardar: scripts/simular-ubicar-la-escala.ts --llamar)");
      return;
    }
    const { lanzarCorrida } = await import("@/lib/exploraciones/agente");
    const r = await lanzarCorrida(id, "posicionar", { triggeredByEmail: por, proyectoDeContexto: proyecto });
    if (!r.ok) throw new Error(r.error);
    if (r.yaCorria) throw new Error("El agente ya estaba trabajando en esta preventa: espera a que termine y vuelve a correrlo.");
    for (let i = 0; i < 120; i++) {
      await espera(3000);
      const c = await prisma.agentRun.findUnique({ where: { id: r.runId }, select: { status: true, currentPhase: true, output: true } });
      if (c && c.status !== "RUNNING") {
        console.log(`  ${c.status}: ${c.output}`);
        return;
      }
      if (i % 10 === 0) console.log(`  … ${c?.currentPhase ?? "trabajando"}`);
    }
    console.log("  Sigue corriendo después de 6 minutos: mira la preventa en un rato.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
