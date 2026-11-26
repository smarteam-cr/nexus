/**
 * scripts/quitar-nota-que-era-pregunta.ts — quita de «Lo que sabes del cliente» una nota que en realidad es una PREGUNTA que
 * «Guardarlo como nota» guardó (25 nov, TEC · AE; DECISIONS «Guardarlo como nota guarda solo lo que la persona cuenta»).
 *
 * Lo que pasó: en la preventa del AE alguien preguntó «cuales son los retos principales del AE?», Nexus respondió y apretó
 * «Guardarlo como nota»: quedó la nota `sabido:mwwnm8fs1ij` con el texto de la pregunta, como si el equipo lo supiera. Desde
 * ese día «Ubicar» lee esas notas y una nota puede fijar el nivel de una parte: es ruido. El código ya no lo permite; este
 * script limpia la que quedó.
 *
 * Qué hace, con la MISMA operación que «Quitar» en la Preparación (`nota` con texto vacío, por `aplicarCambios`, que también
 * retira los hechos que dejó la nota):
 *   1. Lee la nota y comprueba que sigue ahí y que es una pregunta (`esAlgoQueSeCuenta` dice que no). Si alguien la editó y
 *      ahora cuenta algo, no la toca.
 *   2. Avisa si la nota pudo cambiar La escala: lo que dijo la revisión de impacto al guardarla y si el Resumen se rehízo
 *      después (eso lo revisa una persona en la pantalla: el script no lo toca).
 *   3. Quita la nota (y su autor) y sus hechos (cuántos había antes y cuántos quedan).
 *   4. Cierra la conversación de «Hablar con Nexus» donde se guardó (como «Nueva conversación»), SOLO si su última vuelta es
 *      la que guardó la nota: si no, al volver a la preventa diría «Guardado…» de una nota que ya no está. Si la persona
 *      siguió conversando después, no se toca (cerrarla le borraría lo que no guardó). Relee la vuelta para comprobarlo.
 * Sin `--apply` dice qué haría, con una conexión de solo lectura. Con `--apply` y ALLOW_PROD_WRITE=1 lo hace, con respaldo de
 * ExploracionDeVenta, AgentRun y HechoDeReunion, y pide `--por <correo>` (lo imprime: quitar una nota no deja autor en la
 * preventa). Antes de escribir en producción comprueba que esta copia trae el commit que corre allá (/api/health): con
 * código más viejo, guardar la preventa podría perder lo que el nuevo escribe. Si alguien cambia la preventa entre la
 * lectura y el cambio, no la pisa (conflicto: volver a correrlo). Idempotente: si la nota ya no está, solo cierra la
 * conversación que haya quedado abierta en ella.
 *
 *   npx tsx scripts/quitar-nota-que-era-pregunta.ts
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/quitar-nota-que-era-pregunta.ts --por <correo> --apply
 *   (otra: --exploracion <id> --clave sabido:<…>)
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

/** La preventa de TEC · AE y la nota que guardó una pregunta (25 nov). */
const EXPLORACION_DEL_AE = "cmvil2i8v04rt06pg12clzis4";
const NOTA_QUE_ERA_PREGUNTA = "sabido:mwwnm8fs1ij";

async function main() {
  const id = arg("--exploracion") ?? EXPLORACION_DEL_AE;
  const clave = arg("--clave") ?? NOTA_QUE_ERA_PREGUNTA;
  const { imprimirDestino, resolverApply } = await import("./lib/guard");
  imprimirDestino("quitar-nota-que-era-pregunta");
  // Quién lo pide, ANTES del respaldo (que copia tablas grandes): sin eso no se escribe.
  const por = arg("--por") ?? null;
  if (APLICA && !por) throw new Error("Con --apply, di quién lo pide: --por <correo>.");
  // La versión, también ANTES del respaldo: con la copia atrasada no se escribe, y no se copia nada para nada.
  if (APLICA) await comprobarQueTraeProduccion();
  const aplicar = resolverApply({ tablas: ["ExploracionDeVenta", "AgentRun", "HechoDeReunion"] });

  const { prisma } = await import("@/lib/db/prisma");
  const { leerExploracion, estadoDesdeFila, escalaParaExplorar, aplicarCambios } = await import("@/lib/exploraciones/servidor");
  const { esClaveDeLoQueSabes } = await import("@/lib/exploraciones/lo-que-sabes");
  const { esAlgoQueSeCuenta } = await import("@/lib/chat-de-nexus/conversacion");

  if (!esClaveDeLoQueSabes(clave)) throw new Error(`«${clave}» no es una nota de «Lo que sabes del cliente».`);
  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") throw new Error(`La preventa no se puede leer: ${lectura.estado}`);
  const fila = lectura.fila;
  const estado = estadoDesdeFila(fila);
  const texto = (estado.contenido.notas[clave] ?? "").trim();
  const autor = estado.contenido.autoresDeLasNotas?.[clave];
  console.log(`═══ ${fila.client.name} · preventa ${id} · ${aplicar ? "APLICA" : "simulacro (no escribe)"}`);
  // Las conversaciones donde se guardó: se cierran también si la nota ya no está (una corrida anterior la quitó y no llegó
  // a cerrarlas), para que al volver no digan «Guardado…» de una nota que no existe.
  const ultimas = await conversacionesQueTerminanEnLaNota(fila.clientId, id, clave);
  if (!texto) {
    console.log(`  La nota ${clave} ya no está.`);
    // Si una corrida anterior la quitó y sus hechos quedaron (no debería: los retira la misma operación), se dice.
    const quedan = await prisma.hechoDeReunion.count({ where: { exploracionId: id, notaClave: clave } });
    if (quedan) console.log(`  ⚠ quedan ${quedan} hechos de esa nota: revísalos a mano (este script no los retira sin la nota).`);
    if (!ultimas.length) return console.log("  Ninguna conversación quedó abierta en ella. Nada que hacer.");
    if (!aplicar) return console.log(`\nSimulacro: con --apply ${ultimas.length === 1 ? "se cierra 1 conversación" : `se cierran ${ultimas.length} conversaciones`}.`);
    return cerrarLasConversaciones(ultimas);
  }
  console.log(`  Nota ${clave}: «${texto}»`);
  console.log(`  La guardó: ${autor?.por ?? "(sin autor)"} · ${autor?.en ?? "(sin fecha)"}`);
  if (esAlgoQueSeCuenta(texto)) {
    console.log("  ⛔ No parece una pregunta (cuenta algo): no la toco. Si igual hay que quitarla, se quita a mano en la Preparación.");
    return;
  }

  const hechos = await prisma.hechoDeReunion.count({ where: { exploracionId: id, notaClave: clave } });
  console.log(`  Hechos que dejó esa nota: ${hechos}`);
  // ¿Pudo cambiar La escala? Lo que dijo la revisión de impacto al guardarla, y si el Resumen se rehízo después.
  const guardadaEn = autor?.en ? new Date(autor.en) : null;
  // La revisión de impacto de ESA nota (lib/exploraciones/impacto-en-la-escala-server.ts la anota con su clave).
  const impactos = await prisma.agentRun.findMany({
    where: {
      clientId: fila.clientId,
      AND: [{ filters: { path: ["modo"], equals: "impacto-del-contexto" } }, { filters: { path: ["exploracion"], equals: id } }, { filters: { path: ["nota"], equals: clave } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, output: true, createdAt: true },
  });
  if (!impactos.length) console.log("  Ninguna revisión de impacto de esa nota.");
  for (const i of impactos.slice(0, 3)) {
    let dijo = "no se pudo leer";
    try {
      const o = JSON.parse(i.output ?? "null") as { cambia?: unknown; impacto?: { cambia?: unknown } } | null;
      const cambia = o?.cambia ?? o?.impacto?.cambia;
      dijo = cambia === true ? "CAMBIA La escala" : cambia === false ? "no cambia La escala" : "sin respuesta";
    } catch {
      // Una corrida que no se lee se dice así.
    }
    console.log(`  Revisión de impacto ${i.id} (${i.createdAt.toISOString()}, ${i.status}): ${dijo}`);
  }
  const resumenEn = estado.contenido.resumenDeLaEscala?.at ? new Date(estado.contenido.resumenDeLaEscala.at) : null;
  if (guardadaEn && resumenEn && resumenEn > guardadaEn)
    console.log(`  ⚠ El Resumen de La escala se rehízo después de la nota (${resumenEn.toISOString()}): una persona revisa si la tomó como algo sabido.`);
  else console.log("  El Resumen de La escala no se rehízo después de la nota.");
  // «Ubicar» lee las notas: si corrió después de guardarla, una persona mira si el nivel que dejó se apoyó en ella.
  if (guardadaEn) {
    const ubicaciones = await prisma.agentRun.count({
      where: { clientId: fila.clientId, createdAt: { gt: guardadaEn }, AND: [{ filters: { path: ["modo"], equals: "posicionar" } }, { filters: { path: ["exploracionId"], equals: id } }] },
    });
    console.log(ubicaciones ? `  ⚠ «Ubicar» corrió ${ubicaciones} vez(ces) después de la nota: una persona revisa si algún nivel se apoyó en ella.` : "  «Ubicar» no corrió después de la nota.");
  }

  if (!aplicar) {
    console.log(`\nSimulacro: con --apply se quita la nota, se ${hechos ? `retiran ${hechos} hechos` : "revisan sus hechos (ninguno)"} y ${ultimas.length === 1 ? "se cierra 1 conversación" : `se cierran ${ultimas.length} conversaciones`}.`);
    const otra = id !== EXPLORACION_DEL_AE || clave !== NOTA_QUE_ERA_PREGUNTA ? ` --exploracion ${id} --clave ${clave}` : "";
    console.log(`Para aplicarlo: ALLOW_PROD_WRITE=1 npx tsx scripts/quitar-nota-que-era-pregunta.ts${otra} --por <tu correo> --apply`);
    return;
  }

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") throw new Error("La escala no está publicada en Nexus: sin ella no se puede validar el cambio.");
  // `sinCambiosDesde`: si alguien tocó la preventa desde que se leyó (otra nota, un nivel), conflicto y no se pisa.
  const r = await aplicarCambios(id, fila.version, [{ op: "nota", paso: clave, texto: "" }], escala.general, { quienPide: por, sinCambiosDesde: fila.updatedAt });
  if (r.estado !== "ok") throw new Error(`No se quitó la nota: ${r.estado}${"error" in r ? ` (${r.error})` : ""}. Vuelve a correrlo.`);
  console.log(`  ✓ nota quitada (lo pidió ${por})`);
  // Los hechos de la nota los retira `aplicarCambios` al quitarla: acá solo se cuentan.
  const quedan = await prisma.hechoDeReunion.count({ where: { exploracionId: id, notaClave: clave } });
  console.log(`  ✓ hechos retirados: ${hechos - quedan}${quedan ? ` (⚠ quedan ${quedan})` : ""}`);
  await cerrarLasConversaciones(ultimas);
}

type Vuelta = { id: string; triggeredByEmail: string | null; createdAt: Date };

/**
 * Las conversaciones de «Hablar con Nexus» de esta preventa que guardaron esa nota (la vuelta del «listo», con `notaClave`) y
 * cuya ÚLTIMA vuelta terminada es esa: esas se cierran (como «Nueva conversación»). Si la persona siguió conversando, no.
 * Las ya cerradas no cuentan.
 */
async function conversacionesQueTerminanEnLaNota(clientId: string, id: string, clave: string): Promise<Vuelta[]> {
  const { prisma } = await import("@/lib/db/prisma");
  const { MODO_DEL_CHAT } = await import("@/lib/chat-de-nexus/conversacion-server");
  const vueltas = await prisma.agentRun.findMany({
    where: { clientId, status: "DONE", AND: [{ filters: { path: ["modo"], equals: MODO_DEL_CHAT } }, { filters: { path: ["exploracion"], equals: id } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, output: true, filters: true, triggeredByEmail: true, createdAt: true },
  });
  const salida = (v: (typeof vueltas)[number]) => {
    try {
      return (JSON.parse(v.output ?? "null") ?? {}) as { notaClave?: unknown; cerrada?: unknown };
    } catch {
      return {};
    }
  };
  const conversacion = (v: (typeof vueltas)[number]) => (v.filters as { conversacion?: string } | null)?.conversacion;
  const conLaNota = vueltas.filter((v) => salida(v).notaClave === clave);
  const conversaciones = [...new Set(conLaNota.map(conversacion).filter((c): c is string => !!c))];
  if (!conversaciones.length) console.log("  Ninguna conversación la nombra: no hay nada que cerrar.");
  const guardaron = new Set(conLaNota.map((v) => v.id));
  const ultimas: Vuelta[] = [];
  for (const c of conversaciones) {
    const deEsta = vueltas.filter((v) => conversacion(v) === c);
    const u = deEsta.at(-1)!;
    if (salida(u).cerrada === true) console.log(`  Conversación de ${u.triggeredByEmail ?? "?"}: ya está cerrada.`);
    else if (guardaron.has(u.id)) {
      ultimas.push(u);
      console.log(`  Conversación de ${u.triggeredByEmail ?? "?"} (última vuelta ${u.id}, ${u.createdAt.toISOString()}): termina en esa nota, se cierra.`);
    } else {
      const despues = deEsta.filter((v) => v.createdAt > conLaNota[0].createdAt).length;
      console.log(`  Conversación de ${u.triggeredByEmail ?? "?"}: siguió ${despues} vuelta(s) después de la nota; NO se cierra.`);
    }
  }
  return ultimas;
}

/** Cierra cada una y relee la vuelta: `anotarLaVuelta` no lanza si falla, así que se comprueba que quedó cerrada. */
async function cerrarLasConversaciones(ultimas: readonly Vuelta[]) {
  const { prisma } = await import("@/lib/db/prisma");
  const { anotarLaVuelta } = await import("@/lib/chat-de-nexus/conversacion-server");
  let cerradas = 0;
  for (const u of ultimas) {
    await anotarLaVuelta(u.id, { cerrada: true });
    const fila = await prisma.agentRun.findUnique({ where: { id: u.id }, select: { output: true } });
    let quedo = false;
    try {
      quedo = (JSON.parse(fila?.output ?? "null") as { cerrada?: unknown } | null)?.cerrada === true;
    } catch {
      // Si no se lee, no quedó.
    }
    if (quedo) cerradas++;
    else console.log(`  ⚠ la conversación de la vuelta ${u.id} no quedó cerrada: vuelve a correrlo.`);
  }
  console.log(`  ✓ conversaciones cerradas: ${cerradas} de ${ultimas.length}`);
}

/**
 * Con `--apply` contra producción: esta copia tiene que traer el commit que corre allá (/api/health). Con código más viejo,
 * guardar la preventa podría perder lo que el código nuevo escribe en ella. Contra la base local no hace falta.
 */
async function comprobarQueTraeProduccion() {
  const { esBaseLocal } = await import("./lib/guard");
  if (esBaseLocal(process.env.DATABASE_URL)) return;
  const base = process.env.NEXUS_URL || "https://nexus.smarteamcr.com";
  const sha = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json() as Promise<{ sha?: string }>)
    .then((j) => j.sha ?? "")
    .catch(() => "");
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`No se pudo leer qué commit corre en ${base}/api/health: sin eso no se escribe.`);
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
  } catch {
    throw new Error(`Producción corre ${sha.slice(0, 8)} y esta copia no lo trae: haz git pull (o git fetch) y vuelve a correrlo.`);
  }
  console.log(`  ✓ esta copia trae lo que corre en producción (${sha.slice(0, 8)})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("⛔", e instanceof Error ? e.message : e);
    process.exit(1);
  });
