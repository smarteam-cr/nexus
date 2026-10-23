/**
 * scripts/medir-contexto-del-diagnostico.ts — SOLO LECTURA. Qué sabe Nexus de una empresa y qué le llega de eso al
 * agente del DIAGNÓSTICO (2026-10-23, docs/diagnostico-plantillas-plan.md).
 *
 * Por cada proyecto de la empresa:
 *   · el diagnóstico: si existe, su plantilla, sus secciones (visibles y ocultas) y cuántas tienen contenido;
 *   · la exploración del proyecto: sus sesiones, cuáles tienen una reunión unida, lo que leyó el agente, lo confirmado
 *     (tarjetas y niveles) y lo que Nexus propuso y nadie decidió todavía;
 *   · la ficha (confirmada o no, y si tiene una propuesta pendiente) y los resultados medibles del handoff;
 *   · las reuniones elegidas en el «Contexto» del diagnóstico;
 *   · el MENSAJE que armaría hoy `fuentesDelDiagnostico`, por bloque, con su largo, y si las reuniones de las sesiones
 *     de la exploración entran enteras.
 *
 * ⛔ No escribe nada: la base se abre en solo lectura (`default_transaction_read_only`). No llama a ninguna API de IA.
 * Imprime nombres de reuniones y de la empresa elegida (es interno), nunca transcripciones.
 *
 *   npx tsx scripts/medir-contexto-del-diagnostico.ts --cliente "CEMACO"
 *   npx tsx scripts/medir-contexto-del-diagnostico.ts --cliente "CEMACO" --mensaje   (imprime el mensaje entero)
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import Module from "node:module";

/* `unstable_cache` (las categorías de reuniones) necesita el servidor de Next: fuera de él se llama directo, sin caché. */
const cargarModulo: unknown = Reflect.get(Module, "_load");
if (typeof cargarModulo === "function") {
  Reflect.set(Module, "_load", function (this: unknown, pedido: unknown, ...resto: unknown[]) {
    const real = (cargarModulo as (...a: unknown[]) => unknown).call(this, pedido, ...resto);
    if (pedido !== "next/cache") return real;
    return { ...(real as object), unstable_cache: <F>(fn: F) => fn, revalidateTag: () => {} };
  });
}

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=120000"].filter(Boolean).join(" ");

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const CLIENTE = arg("--cliente");
const MENSAJE = process.argv.includes("--mensaje");

async function main() {
  if (!CLIENTE) throw new Error('Falta --cliente "Nombre"');
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { canvasOf } = await import("@/lib/pieces/canvas-query");
  const { leerContenido, leerPropuesta } = await import("@/lib/exploraciones/esquemas");
  const { leerFicha } = await import("@/lib/clients/ficha");
  const { resultadosDelProyecto } = await import("@/lib/handoff/resultados");
  const { fuentesDelDiagnostico } = await import("@/lib/canvas/diagnostico-fuentes");
  const { hiddenKeysFrom } = await import("@/lib/business-cases/section-briefs");
  const { plantillaDelDocumento } = await import("@/lib/entregables/registro");
  const { loConfirmadoDelProyecto } = await import("@/lib/canvas/diagnostico-confirmado-server");

  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA\n`);
  const clientes = await prisma.client.findMany({
    where: { OR: [{ name: { contains: CLIENTE, mode: "insensitive" } }, { company: { contains: CLIENTE, mode: "insensitive" } }] },
    select: { id: true, name: true, ficha: true, projects: { select: { id: true, name: true, tags: true, status: true } } },
  });
  if (!clientes.length) throw new Error(`Ninguna empresa con «${CLIENTE}».`);

  for (const c of clientes) {
    const ficha = leerFicha(c.ficha);
    console.log(`══ ${c.name} (${c.id}) · ${c.projects.length} proyecto(s)`);
    console.log(
      `   Ficha: ${ficha.confirmadaAt ? `confirmada el ${ficha.confirmadaAt.slice(0, 10)}` : "SIN confirmar"}` +
        `${ficha.propuesta ? ` · con propuesta pendiente (${Object.keys(ficha.propuesta.valores ?? {}).length} campos)` : ""}`,
    );
    for (const p of c.projects) {
      console.log(`\n── Proyecto «${p.name}» (${p.id}) · ${p.status} · ${p.tags.join(", ") || "sin etiquetas"}`);

      const diag = await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("diagnosis") }, select: { id: true, sections: true } });
      if (diag) {
        const ocultas = hiddenKeysFrom(diag.sections);
        const secs = await prisma.canvasSection.findMany({
          where: { canvasId: diag.id },
          orderBy: { order: "asc" },
          select: { key: true, _count: { select: { blocks: true } } },
        });
        const pl = plantillaDelDocumento("diagnosis", diag.sections);
        console.log(`   Diagnóstico: plantilla ${pl?.plantilla.id}${pl?.guardada ? "" : " (de siempre)"} · ${secs.length} secciones`);
        console.log(`     visibles: ${secs.filter((s) => !ocultas.has(s.key)).map((s) => `${s.key}${s._count.blocks ? "" : "∅"}`).join(", ")}`);
        console.log(`     ocultas:  ${secs.filter((s) => ocultas.has(s.key)).map((s) => s.key).join(", ") || "—"}`);
      } else {
        console.log("   Diagnóstico: no está activado");
      }

      const exp = await prisma.exploracionDeVenta
        .findFirst({ where: { projectId: p.id, archivadaEn: null }, select: { id: true, contenido: true, propuesta: true } })
        .catch(() => null);
      if (exp) {
        const cont = leerContenido(exp.contenido);
        const prop = leerPropuesta(exp.propuesta);
        console.log(`   Exploración ${exp.id}: ${cont.sesiones.length} sesiones · ${Object.keys(prop.lecturas).length} lecturas del agente`);
        for (const s of cont.sesiones) {
          console.log(
            `     · ${s.fecha ?? "sin fecha"} «${s.titulo ?? "(sin título)"}»` +
              `${s.reunion ? ` → reunión ${s.reunion.origen}:${s.reunion.id}` : s.evento ? ` → evento ${s.evento.id}` : " → sin reunión"}`,
          );
        }
        const casillas = Object.fromEntries(Object.entries(cont.casillas).map(([k, v]) => [k, Array.isArray(v) ? v.length : v ? 1 : 0]));
        const niveles = Object.values(cont.chequeo).reduce<Record<string, number>>((a, e) => ((a[e.fuente] = (a[e.fuente] ?? 0) + 1), a), {});
        const propuestos = prop.items.reduce<Record<string, number>>((a, it) => ((a[it.destino.tipo + (it.destino.tipo === "casilla" ? `:${it.destino.clave}` : "")] = (a[it.destino.tipo + (it.destino.tipo === "casilla" ? `:${it.destino.clave}` : "")] ?? 0) + 1), a), {});
        console.log(`   Confirmado · casillas: ${JSON.stringify(casillas)} · niveles por fuente: ${JSON.stringify(niveles)}`);
        console.log(`   Propuesto sin decidir: ${JSON.stringify(propuestos)} · descartadas: ${cont.descartadas.length}`);
        const res = (await resultadosDelProyecto(p.id).catch(() => null))?.resultados ?? [];
        console.log(`   Resultados del handoff: ${res.length} · confirmados ${res.filter((x) => x.confirmadoAt).length}`);
        const lc = await loConfirmadoDelProyecto(p.id);
        console.log(`   Lo confirmado (lo que ve «Antes de generar»): ${lc.conAlgoConfirmado} de ${lc.conAlgo} · casi nada: ${lc.casiNada ? "SÍ" : "no"}`);
        for (const pz of lc.piezas) console.log(`     · ${pz.nombre}: ${pz.estado} — ${pz.texto}`);
      } else {
        console.log("   Exploración: no tiene");
      }

      const elegidas = await prisma.sessionProject.findMany({
        where: { projectId: p.id, diagnosisOverride: true },
        select: { session: { select: { id: true, title: true, date: true } } },
      });
      console.log(`   Elegidas en el Contexto del diagnóstico: ${elegidas.length}`);
      for (const e of elegidas) console.log(`     · ${e.session.date.toISOString().slice(0, 10)} «${e.session.title}»`);

      if (diag || exp) {
        const texto = await fuentesDelDiagnostico(p.id);
        const bloques = texto.split(/\n(?====)/);
        console.log(`   Mensaje del diagnóstico: ${texto.length.toLocaleString("es-CR")} caracteres`);
        for (const b of bloques) {
          const titulo = b.split("\n")[0].slice(0, 110);
          console.log(`     ${String(b.length).padStart(7)} · ${titulo}`);
        }
        if (MENSAJE) console.log(`\n${texto}\n`);
      }
    }
    console.log("");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
