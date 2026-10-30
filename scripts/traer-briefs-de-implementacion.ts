/**
 * scripts/traer-briefs-de-implementacion.ts — trae en lote los Briefs de implementación ya llenos a la Planificación de
 * cada cliente (2026-10-29, pregunta 32 del roadmap; lib/planificacion/brief-importado.ts).
 *
 * Quedan en la sección SOLO INTERNA «El Brief de implementación (la hoja)»: el cliente no la ve y la IA la lee al generar.
 * Nexus no sabe qué hoja es de qué proyecto, así que son dos pasos:
 *
 *   1. BUSCAR (solo lee Drive y la base). Lista las hojas con «brief» en el nombre que ve esa cuenta y propone el proyecto
 *      por el nombre del cliente. Deja un CSV para revisar A MANO: una línea por hoja, `projectId,enlace,correo`. Lo que
 *      no calzó va comentado con `#`. Una hoja atribuida al cliente equivocado le pone el Brief de otro: se revisa.
 *
 *        npx tsx scripts/traer-briefs-de-implementacion.ts --buscar --como persona@smarteamcr.com --salida briefs.csv
 *
 *   2. TRAER. Simulacro por defecto: lee cada hoja y dice qué haría, sin escribir. Con --apply escribe. Un proyecto que ya
 *      tiene Brief no se toca salvo con --reemplazar. El `correo` es la cuenta con que se lee la hoja (sin él, la de --como).
 *
 *        npx tsx scripts/traer-briefs-de-implementacion.ts --archivo briefs.csv --como persona@smarteamcr.com
 *        $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/traer-briefs-de-implementacion.ts --archivo briefs.csv --como persona@smarteamcr.com --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Deshacer: en la Planificación, «Quitar» en la sección, o el respaldo que deja el --apply.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import fs from "node:fs";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { buscarHojasPorNombre } from "@/lib/google/drive-files";
import { estadoDelBriefEnLaPlanificacion, guardarBriefEnLaPlanificacion, leerBriefDeGoogle } from "@/lib/planificacion/brief-importado-server";
import { filasConAlgo } from "@/lib/planificacion/brief-importado";
import { filaDelArchivoDeBriefs, proyectoParaLaHoja } from "@/lib/planificacion/brief-en-lote";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";

const valor = (n: string): string | null => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const COMO = valor("--como");
const REEMPLAZAR = process.argv.includes("--reemplazar");

async function buscar(salida: string) {
  if (!COMO) throw new Error("Falta --como <correo>: la cuenta de Smarteam con que se busca en Drive.");
  const { hojas, incompleta } = await buscarHojasPorNombre(COMO, "brief");
  if (incompleta) console.log("⚠ Drive avisa que la búsqueda quedó incompleta: puede faltar alguna hoja.");
  // Sin los contenedores («Información del cliente»): un Brief va en la Planificación de un proyecto de verdad.
  const proyectos = await prisma.project.findMany({
    where: { AND: [{ status: "active", client: { kind: "CLIENTE" } }, NO_ES_CONTENEDOR_WHERE] },
    select: { id: true, name: true, client: { select: { name: true, company: true } } },
  });
  const lista = proyectos.map((p) => ({ id: p.id, nombre: p.name, cliente: p.client?.name ?? p.client?.company ?? "" }));
  const lineas = ["# projectId,enlace,correo  (revisa cada línea: quita las que no van; lo comentado no se trae)"];
  let calzaron = 0;
  for (const h of hojas) {
    const r = proyectoParaLaHoja(h.nombre, lista);
    const nota = `«${h.nombre}» (${h.modificada?.slice(0, 10) ?? "sin fecha"})`;
    if (r.tipo === "uno") {
      calzaron++;
      lineas.push(`# ${r.cliente} · ${r.nombre} ← ${nota}`, `${r.id},${h.url},${COMO}`);
    } else {
      const motivo = r.tipo === "varios" ? `varios proyectos: ${r.candidatos.join(" / ")}` : "sin cliente que calce";
      lineas.push(`# SIN ASIGNAR (${motivo}) ← ${nota}`, `# ,${h.url},${COMO}`);
    }
  }
  fs.writeFileSync(salida, lineas.join("\n") + "\n", "utf8");
  console.log(`Hojas con «brief» en el nombre: ${hojas.length}. Con un proyecto propuesto: ${calzaron}. Revisa ${salida} antes de traer.`);
}

async function traer(archivo: string, apply: boolean) {
  const filas = fs.readFileSync(archivo, "utf8").split(/\r?\n/).flatMap((l) => filaDelArchivoDeBriefs(l, COMO));
  const cuenta = { traidos: 0, yaTenian: 0, fallaron: 0 };
  for (const f of filas) {
    const p = await prisma.project.findUnique({ where: { id: f.projectId }, select: { name: true, client: { select: { name: true } } } });
    const quien = p ? `${p.client?.name ?? "?"} · ${p.name}` : f.projectId;
    if (!p) {
      console.log(`✗ ${quien}: el proyecto no existe.`);
      cuenta.fallaron++;
      continue;
    }
    if (!f.correo) {
      console.log(`✗ ${quien}: falta el correo con que leer la hoja (--como).`);
      cuenta.fallaron++;
      continue;
    }
    const estado = await estadoDelBriefEnLaPlanificacion(f.projectId);
    if (estado.yaTieneBrief && !REEMPLAZAR) {
      console.log(`· ${quien}: ya tiene «${estado.titulo}». No se toca (--reemplazar lo pisa).`);
      cuenta.yaTenian++;
      continue;
    }
    try {
      const brief = await leerBriefDeGoogle(f.correo, f.url, { importadoPor: "script" });
      const accion = estado.hayPlanificacion ? "" : " (se crea la Planificación)";
      console.log(`${apply ? "✓" : "→"} ${quien}: «${brief.titulo}», ${brief.pestanas.length} pestañas, ${filasConAlgo(brief)} filas${accion}.`);
      if (apply) await guardarBriefEnLaPlanificacion(f.projectId, brief, { actor: "script" });
      cuenta.traidos++;
    } catch (e) {
      console.log(`✗ ${quien}: ${e instanceof Error ? e.message : String(e)}`);
      cuenta.fallaron++;
    }
  }
  console.log(`\n${apply ? "Traídos" : "Se traerían"}: ${cuenta.traidos} · ya tenían: ${cuenta.yaTenian} · fallaron: ${cuenta.fallaron}${apply ? "" : " (simulacro: nada escrito)"}`);
}

async function main() {
  if (process.argv.includes("--buscar")) return buscar(valor("--salida") ?? "briefs.csv");
  const archivo = valor("--archivo");
  if (!archivo) throw new Error("Usa --buscar, o --archivo <csv> para traer. Ver el encabezado del script.");
  const apply = resolverApply({ tablas: ["ProjectCanvas", "CanvasSection", "CanvasBlock"] });
  await traer(archivo, apply);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
