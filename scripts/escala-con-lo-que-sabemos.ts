/**
 * scripts/escala-con-lo-que-sabemos.ts — arma el BORRADOR de La escala de un cliente con lo que ya sabemos (24 nov; DECISIONS
 * «La escala de un cliente con lo que ya sabemos»): lo mismo que hacen los botones de la preventa, sin publicar nada.
 *
 *   - `--sugeridas`: las reuniones de trabajo que sugiere Nexus (la misma cuenta de «+ Agregar sesión › Reuniones de trabajo
 *     sugeridas», lib/exploraciones/reuniones-de-trabajo-server.ts), con cuánto habló el cliente y cuál ya es sesión.
 *   - `--sesiones gmeet_a:ventas,gmeet_b:marketing,gmeet_c`: suma esas reuniones como REUNIONES DE TRABAJO, cada una con su
 *     equipo si se da (y, como en la pantalla, el área de ese equipo entra a las áreas en juego). Solo reuniones de esta
 *     empresa que ya pasaron, por el chokepoint (invariante #1); las que ya son sesión (también las unidas por su evento o
 *     por fecha, como las cuenta la pantalla) se saltan, y nunca más de 20 sesiones.
 *   - `--ubicar [--proyecto <id>]`: «Ubicar con lo que ya sabemos», la misma corrida del botón (queda en «Gasto de la IA»).
 *     Lo propuesto queda sugerido: nada se confirma solo.
 * Sin `--apply` dice qué haría, sin escribir ni llamar a la IA (conexión de solo lectura). Con `--apply` y ALLOW_PROD_WRITE=1
 * lo hace, con respaldo de ExploracionDeVenta, y pide `--por <correo>`: la corrida queda a nombre de quien la pide (no en el
 * presupuesto automático).
 * ⛔ Contra producción, `--apply` solo DESPUÉS del deploy: el código de antes del 24 nov descarta la marca de reunión de
 * trabajo la próxima vez que alguien guarda la preventa. El script lo comprueba en /api/health (el commit que corre tiene que
 * traer este cambio) y, si no, no escribe. «Ubicar» corre en este mismo proceso: el script espera a que termine (cerrarlo
 * antes la cortaría a medias).
 * Lo que sigue lo decide una persona en la pantalla: usar lo propuesto, elegir los equipos en «Acceso» y armar el Resumen
 * (o `scripts/simular-resumen-de-la-escala.ts --guardar --apply`). Publicar no lo hace ningún script.
 *
 *   npx tsx scripts/escala-con-lo-que-sabemos.ts --exploracion cmvil2i8v04rt06pg12clzis4 --sugeridas
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/escala-con-lo-que-sabemos.ts --exploracion <id> --sesiones gmeet_x:ventas --ubicar --proyecto <id> --por <correo> --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";

const APLICA = process.argv.includes("--apply");
if (!APLICA) process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

const NL = "\n";
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El commit que trae la marca de reunión de trabajo (24 nov): producción tiene que tenerlo antes de escribirla. */
const COMMIT_DE_LA_MARCA = "14c9f72d";

async function main() {
  const id = arg("--exploracion");
  if (!id) throw new Error("Falta --exploracion <id>");
  const { imprimirDestino, resolverApply } = await import("./lib/guard");
  imprimirDestino("escala-con-lo-que-sabemos");
  const aplicar = resolverApply({ tablas: ["ExploracionDeVenta"] });
  const por = arg("--por") ?? null;
  if (aplicar && !por) throw new Error("Con --apply, di quién lo pide: --por <correo>.");
  if (aplicar) await comprobarElDeploy();

  const { prisma } = await import("@/lib/db/prisma");
  const { leerExploracion, estadoDesdeFila, escalaParaExplorar, escalaDeLaExploracion, aplicarCambios } = await import("@/lib/exploraciones/servidor");
  const { partirDeLoQueYaSabemos } = await import("@/lib/exploraciones/posicionar");
  const { getClientSessions } = await import("@/lib/sessions/project-sources");
  const { MAX_SESIONES, nuevoIdDeSesion, pestanasDeSesiones } = await import("@/lib/exploraciones/guia");
  const { EQUIPOS, EQUIPOS_DEL_CLIENTE, areaQueSuma } = await import("@/lib/exploraciones/equipos");
  const { hoyEnCostaRica } = await import("@/lib/exploraciones/fechas");
  const { reunionesDeLaExploracion } = await import("@/lib/exploraciones/fuentes");
  const { leerLoLeido } = await import("@/lib/exploraciones/lo-leido");

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") throw new Error(`La exploración no se puede leer: ${lectura.estado}`);
  const fila = lectura.fila;
  if (fila.projectId) throw new Error("Es la exploración de un proyecto: esto es para la preventa de un cliente.");
  if (!partirDeLoQueYaSabemos(fila.client.kind)) throw new Error(`${fila.client.name} es ${fila.client.kind}: lo que ya sabemos es para la preventa de un cliente.`);
  if (fila.archivadaEn) throw new Error("La preventa está archivada.");
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new Error("La escala no está publicada.");
  console.log(`═══ ${fila.client.name} · preventa ${id} · ${aplicar ? "APLICA" : "simulacro (no escribe)"}`);

  // Qué reunión ya es la sesión N: la misma cuenta que la pantalla (también las unidas por su evento o por fecha).
  const estado = estadoDesdeFila(fila);
  const todas = await reunionesDeLaExploracion({
    exploracionId: id,
    clientId: fila.clientId,
    projectId: null,
    creadaEn: fila.createdAt,
    propuesta: estado.propuesta,
    leido: leerLoLeido(fila.test),
    sesiones: estado.contenido.sesiones,
    fuera: estado.contenido.fuera,
    elegidas: estado.contenido.reunionesElegidas,
  });
  const numeroDe = new Map(
    pestanasDeSesiones(estado.contenido.sesiones, todas, hoyEnCostaRica(), { automaticas: false, fuera: new Set(estado.contenido.fuera) }).flatMap((p) =>
      p.reunion && p.reunion.origen === "meet" && !p.noSeHizo ? [[p.reunion.id, p.numero] as const] : [],
    ),
  );

  if (process.argv.includes("--sugeridas")) {
    const { reunionesDeTrabajoSugeridas } = await import("@/lib/exploraciones/reuniones-de-trabajo-server");
    console.log(`${NL}── Reuniones de trabajo sugeridas`);
    for (const s of await reunionesDeTrabajoSugeridas(fila.clientId)) {
      const n = numeroDe.get(s.sessionId);
      console.log(
        `  ${s.fecha.slice(0, 10)}  ${String(s.delCliente).padStart(3)} %  ${(s.equipo ?? "-").padEnd(10)} ${s.sessionId}  ${s.titulo}${s.pocoDelCliente ? "  (la empresa habló poco)" : ""}${n ? `  (ya es la sesión ${n})` : ""}`,
      );
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
    const escala = escalaDeLaExploracion(escalaVig.general, estado);
    // ⛔ Invariante 1: solo reuniones de ESTA empresa que ya pasaron, por el chokepoint (que pone el techo de hoy).
    const deLaEmpresa = new Map((await getClientSessions(fila.clientId, { ids: pedidas.map((p) => p.reunion) })).map((s) => [s.id, s]));
    let areas = [...estado.areas];
    const sesiones = [];
    console.log(`${NL}── Reuniones de trabajo que se suman`);
    for (const p of pedidas) {
      const s = deLaEmpresa.get(p.reunion);
      if (!s) {
        console.log(`  ✗ ${p.reunion}: no es de ${fila.client.name}, no existe o todavía no pasó: no se suma`);
        continue;
      }
      if (numeroDe.has(p.reunion)) {
        console.log(`  · ${p.reunion}: ya es la sesión ${numeroDe.get(p.reunion)}, se salta`);
        continue;
      }
      if (estado.contenido.sesiones.length + sesiones.length >= MAX_SESIONES) {
        console.log(`  ✗ ${p.reunion}: ya hay ${MAX_SESIONES} sesiones, no entra`);
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
      console.log(`${NL}── Ubicar con lo que ya sabemos, con el contexto de «${p.name}»`);
    } else console.log(`${NL}── Ubicar con lo que ya sabemos, sin un proyecto de contexto`);
    if (!aplicar) {
      console.log("  (simulacro: no se lanza. Para ver qué propondría sin guardar: scripts/simular-ubicar-la-escala.ts --llamar)");
      return;
    }
    const { lanzarCorrida } = await import("@/lib/exploraciones/agente");
    const r = await lanzarCorrida(id, "posicionar", { triggeredByEmail: por, proyectoDeContexto: proyecto });
    if (!r.ok) throw new Error(r.error);
    if (r.yaCorria) throw new Error("El agente ya estaba trabajando en esta preventa: espera a que termine y vuelve a correrlo.");
    // La corrida vive en este proceso: no se cierra hasta que termine (cerrarlo la cortaría a medias).
    for (let i = 0; ; i++) {
      await espera(3000);
      const c = await prisma.agentRun.findUnique({ where: { id: r.runId }, select: { status: true, currentPhase: true, output: true } });
      if (c && c.status !== "RUNNING") {
        console.log(`  ${c.status}: ${c.output}`);
        return;
      }
      if (i % 10 === 0) console.log(`  … ${c?.currentPhase ?? "trabajando"} (${Math.round((i * 3) / 60)} min)`);
    }
  }
}

/**
 * Contra producción, el commit que corre tiene que traer la marca de reunión de trabajo (`COMMIT_DE_LA_MARCA`): el de antes
 * la descarta al guardar. Contra una base local no hace falta. Sin poder comprobarlo, no se escribe.
 */
async function comprobarElDeploy() {
  const url = process.env.DATABASE_URL ?? "";
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return;
  const base = process.env.NEXUS_URL || "https://nexus.smarteamcr.com";
  const sha = await fetch(`${base}/api/health`)
    .then((r) => r.json() as Promise<{ sha?: string }>)
    .then((j) => j.sha ?? "")
    .catch(() => "");
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`No se pudo leer qué commit corre en ${base}/api/health: sin eso no se escribe (puede ser antes del deploy).`);
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", COMMIT_DE_LA_MARCA, sha], { stdio: "ignore" });
  } catch {
    throw new Error(`Producción corre ${sha.slice(0, 8)}, que todavía no trae la marca de reunión de trabajo: despliega antes (o haz git fetch si ya está).`);
  }
  console.log(`  ✓ producción corre ${sha.slice(0, 8)}, con la marca de reunión de trabajo`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
