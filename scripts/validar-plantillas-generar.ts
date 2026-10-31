/**
 * scripts/validar-plantillas-generar.ts — GENERA cada plantilla de «Nuevo artefacto» por el camino real (crearCopia +
 * generarCopia, con el modelo de producción) contra la base LOCAL y deja lo escrito en una carpeta para leerlo. Gasta API
 * de Anthropic: una corrida por fila de la matriz. El destino es SIEMPRE localhost.
 *
 *   DATABASE_URL=<nexus_local> npx tsx scripts/validar-plantillas-generar.ts --matriz <archivo.json> --salida <carpeta> [--solo id,id] [--tandas 4]
 *
 * La matriz: [{ "id": "cemaco-planificacion", "tipo": "planning", "plantilla": "planificacion", "projectId": "…" }].
 * Cada corrida deja <id>.json (secciones con lo escrito, y lo que costó) y una línea en resumen.jsonl.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";
import { assertLocalWriteOnly } from "./lib/guard";

/* `unstable_cache` (las categorías de reuniones) necesita el servidor de Next: fuera de él se llama directo, sin caché. */
const cargarModulo: unknown = Reflect.get(Module, "_load");
if (typeof cargarModulo === "function") {
  Reflect.set(Module, "_load", function (this: unknown, pedido: unknown, ...resto: unknown[]) {
    const real: unknown = Reflect.apply(cargarModulo, this, [pedido, ...resto]);
    if (pedido !== "next/cache") return real;
    return { ...(real as object), unstable_cache: <F>(fn: F) => fn, revalidateTag: () => {} };
  });
}

const url = process.env.DATABASE_URL ?? "";
assertLocalWriteOnly(url, "validar-plantillas-generar");
if (!/@(localhost|127\.0\.0\.1):5433\/nexus_local/.test(url)) {
  console.error("⛔ Este script solo corre contra nexus_local (localhost:5433).");
  process.exit(1);
}

interface Fila {
  id: string;
  tipo: string;
  plantilla: string;
  projectId: string;
}

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { crearCopia } = await import("@/lib/artefactos/copias-server");
  const { generarCopia } = await import("@/lib/artefactos/generar-server");
  const { conContextoDeIA } = await import("@/lib/ai/contexto-de-corrida");
  const { asegurarExploracionDelProyecto } = await import("@/lib/exploraciones/del-proyecto");
  const { lanzarCorrida } = await import("@/lib/exploraciones/agente");

  const salida = arg("salida");
  const matriz = arg("matriz");
  if (!salida || !matriz) throw new Error("Faltan --matriz y --salida.");
  mkdirSync(salida, { recursive: true });
  const solo = arg("solo")?.split(",") ?? null;
  const filas = (JSON.parse(readFileSync(matriz, "utf8")) as Fila[]).filter((f) => !solo || solo.includes(f.id));
  console.log(`${filas.length} generaciones`);

  const una = async (f: Fila) => {
    const inicio = Date.now();
    const proyecto = await prisma.project.findUniqueOrThrow({ where: { id: f.projectId }, select: { clientId: true, name: true, client: { select: { name: true } } } });
    const { canvasId } = await crearCopia({ projectId: f.projectId, tipo: f.tipo, plantillaId: f.plantilla, nombre: `Validación ${f.plantilla}`, porEmail: "validacion@local" });
    const agentSlug = `artefacto:${f.tipo}`;
    const run = await prisma.agentRun.create({
      data: { agentId: null, agentSlug, clientId: proyecto.clientId, projectId: f.projectId, status: "RUNNING", stepLabel: f.id, sectionLabel: canvasId, output: "{}", triggeredByEmail: "validacion@local" },
      select: { id: true },
    });
    let error: string | null = null;
    let sectionCount = 0;
    /* La exploración no se escribe en el canvas: su camino real es abrir el lienzo de la copia y que el agente lea. */
    if (f.tipo === "exploration") {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
      const abierta = await asegurarExploracionDelProyecto(f.projectId, "validacion@local", canvasId);
      if (!abierta.ok) throw new Error(abierta.error);
      const lanzada = await lanzarCorrida(abierta.id, "leer", { triggeredByEmail: "validacion@local" });
      if (!lanzada.ok) throw new Error(lanzada.error);
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        const c = await prisma.agentRun.findUniqueOrThrow({ where: { id: lanzada.runId }, select: { status: true, output: true } });
        if (c.status === "RUNNING") continue;
        if (c.status === "ERROR") error = c.output;
        break;
      }
      const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: abierta.id }, select: { contenido: true, propuesta: true } });
      const llamadas = await prisma.llmCall.findMany({ where: { agentRunId: lanzada.runId } });
      writeFileSync(join(salida, `${f.id}.json`), JSON.stringify({ ...f, cuenta: proyecto.client?.name, canvasId, error, llamadas, exploracion: fila }, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 1));
      console.log(`${error ? "✗" : "✓"} ${f.id} · ${Math.round((Date.now() - inicio) / 1000)}s`);
      return;
    }
    try {
      const r = await conContextoDeIA(
        { agentSlug, agentRunId: run.id, clientId: proyecto.clientId, projectId: f.projectId, triggeredByEmail: "validacion@local", origen: "artefactos/generar" },
        () => generarCopia({ projectId: f.projectId, canvasId, agentRunId: run.id }),
      );
      sectionCount = r.sectionCount;
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error }) } });
    }
    const secciones = await prisma.canvasSection.findMany({
      where: { canvasId },
      orderBy: { order: "asc" },
      select: { key: true, label: true, blocks: { select: { data: true, source: true } } },
    });
    const llamadas = await prisma.llmCall.findMany({ where: { agentRunId: run.id } });
    const resultado = {
      ...f,
      cuenta: proyecto.client?.name,
      proyecto: proyecto.name,
      canvasId,
      runId: run.id,
      segundos: Math.round((Date.now() - inicio) / 1000),
      error,
      sectionCount,
      llamadas,
      secciones: secciones.map((s) => ({ key: s.key, label: s.label, fuente: s.blocks[0]?.source ?? null, data: s.blocks[0]?.data ?? null })),
    };
    writeFileSync(join(salida, `${f.id}.json`), JSON.stringify(resultado, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 1));
    appendFileSync(join(salida, "resumen.jsonl"), `${JSON.stringify({ id: f.id, error, sectionCount, segundos: resultado.segundos })}\n`);
    console.log(`${error ? "✗" : "✓"} ${f.id} · ${sectionCount} secciones · ${resultado.segundos}s${error ? ` · ${error.slice(0, 160)}` : ""}`);
  };

  const tandas = Number(arg("tandas") ?? 4);
  const cola = [...filas];
  await Promise.all(
    Array.from({ length: tandas }, async () => {
      for (let f = cola.shift(); f; f = cola.shift()) await una(f);
    }),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
