/**
 * scripts/procesos-quitar-nodos-de-prueba.ts
 *
 * Quita de los mapas de procesos de UN cliente los nodos que quedaron de probar el editor: sueltos
 * (o unidos solo entre ellos), sin subtítulo ni detalle, y con la etiqueta por defecto que pone el editor
 * al crearlos («Nota», «Punto de dolor», «No avanza»…) o con texto de teclado («asdasdasd»).
 * Caso que lo motivó (2026-10-05): el mapa de migración de Wherex tenía 15 y se veían en la ficha.
 *
 * Simulacro por defecto (solo lee). Con --apply escribe el bloque y deja lo anterior en
 * `previousData` (el «deshacer» del bloque) y en un JSON de respaldo.
 *
 *   npx tsx scripts/procesos-quitar-nodos-de-prueba.ts --cliente "Wherex"
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/procesos-quitar-nodos-de-prueba.ts --cliente "Wherex" --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

// Las etiquetas con que el editor crea cada tipo de nodo (DEFAULT_LABELS de FlowchartViewer).
const ETIQUETA_POR_DEFECTO: Record<string, string> = {
  start: "Inicio", end: "Fin", process: "Nuevo proceso", decision: "¿Decisión?", pain: "Punto de dolor",
  annotation: "Nota", text: "Texto", pipeline_stage: "Nueva etapa", trigger: "Trigger", action: "Acción",
  follow_up: "Seguimiento", outcome_positive: "Avanza", outcome_negative: "No avanza",
  lifecycle_change: "Cambio lifecycle", lead_status: "Estado del lead", system: "Nuevo sistema",
};

type Nodo = { id: string; type?: string; label?: string; sublabel?: string; detail?: string; data?: { label?: string; sublabel?: string; detail?: string } };
type Flecha = { source: string; target: string };

function pareceDePrueba(n: Nodo): boolean {
  const label = (n.data?.label ?? n.label ?? "").trim();
  const extra = `${n.data?.sublabel ?? n.sublabel ?? ""}${n.data?.detail ?? n.detail ?? ""}`.trim();
  if (extra) return false;
  if (/asdasd/i.test(label)) return true;
  return !!n.type && label === ETIQUETA_POR_DEFECTO[n.type];
}

/**
 * Los de prueba: los que parecen de prueba y solo se conectan con otros que también lo parecen
 * (en Wherex había pares de «Nota» unidos entre sí). Uno unido a un paso real se queda: alguien
 * lo puso en el flujo, aunque no le haya cambiado el texto.
 */
function deLosDePrueba(nodos: Nodo[], flechas: Flecha[]): Set<string> {
  const candidatos = new Set(nodos.filter(pareceDePrueba).map((n) => n.id));
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const f of flechas) {
      const a = candidatos.has(f.source), b = candidatos.has(f.target);
      if (a && !b) { candidatos.delete(f.source); cambio = true; }
      if (b && !a) { candidatos.delete(f.target); cambio = true; }
    }
  }
  return candidatos;
}

async function main() {
  const i = process.argv.indexOf("--cliente");
  const nombre = i > 0 ? process.argv[i + 1] : "";
  if (!nombre) {
    console.error('Falta --cliente "Nombre".');
    process.exit(1);
  }
  const APPLY = resolverApply({ tablas: ["CanvasBlock"] });
  const { prisma, close } = createScriptDb();
  try {
    const clientes = await prisma.client.findMany({ where: { name: { contains: nombre, mode: "insensitive" } }, select: { id: true, name: true } });
    if (clientes.length !== 1) {
      console.error(`«${nombre}» coincide con ${clientes.length} clientes: ${clientes.map((c) => c.name).join(", ") || "ninguno"}. Usa el nombre exacto.`);
      process.exit(1);
    }
    const cliente = clientes[0];
    const bloques = await prisma.canvasBlock.findMany({
      where: { blockType: "FLOWCHART", section: { key: "procesos", canvas: { slug: "client-info", project: { clientId: cliente.id } } } },
      select: { id: true, content: true, data: true },
    });
    const cambios: { id: string; titulo: string; antes: unknown; despues: unknown; quitados: string[] }[] = [];
    for (const b of bloques) {
      const d = (b.data ?? {}) as { nodes?: Nodo[]; edges?: Flecha[] };
      const nodos = d.nodes ?? [];
      const flechas = d.edges ?? [];
      const ids = deLosDePrueba(nodos, flechas);
      const quitar = nodos.filter((n) => ids.has(n.id));
      if (!quitar.length) continue;
      cambios.push({
        id: b.id,
        titulo: b.content ?? "(sin título)",
        antes: b.data,
        despues: { ...d, nodes: nodos.filter((n) => !ids.has(n.id)), edges: flechas.filter((f) => !ids.has(f.source) && !ids.has(f.target)) },
        quitados: quitar.map((n) => `${n.type}: ${JSON.stringify((n.data?.label ?? n.label ?? "").replace(/\n/g, " "))}`),
      });
    }
    console.log(`${cliente.name}: ${bloques.length} mapas de procesos, ${cambios.length} con nodos de prueba.`);
    for (const c of cambios) {
      console.log(`\n• ${c.titulo} — se quitan ${c.quitados.length}:`);
      c.quitados.forEach((q) => console.log(`    ${q}`));
    }
    if (!APPLY) {
      console.log("\nSimulacro: no se escribió nada. Para aplicar: ALLOW_PROD_WRITE=1 … --apply");
      return;
    }
    const dir = join(process.cwd(), "backups", `${new Date().toISOString().slice(0, 10)}-procesos-quitar-nodos-de-prueba`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${cliente.name.replace(/[^a-z0-9]+/gi, "-")}.json`), JSON.stringify(cambios.map(({ id, titulo, antes }) => ({ id, titulo, antes })), null, 1));
    for (const c of cambios) {
      await prisma.canvasBlock.update({
        where: { id: c.id },
        data: { data: c.despues as Prisma.InputJsonValue, previousData: c.antes as Prisma.InputJsonValue },
      });
    }
    console.log(`\n✓ Aplicado en ${cambios.length} mapa(s). Respaldo en ${dir}. El «deshacer» del bloque lo devuelve.`);
  } finally {
    await close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
