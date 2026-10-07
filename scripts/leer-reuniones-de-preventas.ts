/**
 * scripts/leer-reuniones-de-preventas.ts — pone al día las sesiones de las preventas vivas con el
 * rediseño del 2026-10-07 (cada reunión con «Lo que leyó el agente»). Dos pasos por preventa:
 *
 *  1. Las reuniones grabadas que el agente NUNCA leyó (con conversación) y lo sumado a mano sin leer:
 *     la lectura de siempre, como si el vendedor apretara «Leer». Propone lo que salga de ellas, que el
 *     vendedor usa o descarta, y rearma la guía. Cada lectura toma las dos más recientes: hasta 4 vueltas.
 *  2. Las que el agente leyó ANTES del rediseño y no tienen resumen: SOLO el resumen (no propone nada,
 *     no marca nada como leído ni toca la guía). Incluye las reuniones de HubSpot: con su resumen
 *     aparecen en Exploración aunque no hayan estado en la agenda (la del 28 sep de CreditForce).
 *
 * En seco solo LEE la base: no llama a HubSpot ni a la IA. Con --apply corre el agente de verdad (cobra
 * contra el presupuesto de quien firma) y lee HubSpot como lo hace la app. Antes de escribir guarda lo
 * que había (la propuesta y la foto de HubSpot de cada preventa) en backups/<fecha>-leer-reuniones-de-preventas/.
 *
 * Uso (En tu PC):
 *   npx tsx scripts/leer-reuniones-de-preventas.ts
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/leer-reuniones-de-preventas.ts --apply --firma tu@smarteamcr.com; Remove-Item Env:ALLOW_PROD_WRITE; Remove-Item Env:SIN_RESPALDO
 *   … --preventa <id>   ← una sola
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { lanzarCorrida } from "@/lib/exploraciones/agente";
import { leerContenido, leerPropuesta } from "@/lib/exploraciones/esquemas";
import { reunionesDeLaExploracion, type LoQueSeRelee } from "@/lib/exploraciones/fuentes";
import type { ReunionDeLaExploracion } from "@/lib/exploraciones/guia";
import { hayQueLeerAlPreparar } from "@/lib/exploraciones/lectura";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { describirDestino, resolverApply } from "./lib/guard";

const TABLAS = ["ExploracionDeVenta"];
const VUELTAS_DE_LECTURA = 4;
const ESPERA_MAXIMA_MS = 10 * 60_000;

function argumento(nombre: string): string | null {
  const i = process.argv.findIndex((a) => a === nombre || a.startsWith(`${nombre}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : (process.argv[i + 1] ?? null);
}

const SELECT = {
  id: true,
  clientId: true,
  createdAt: true,
  propuesta: true,
  contenido: true,
  test: true,
  client: { select: { name: true, kind: true } },
} as const;

type Fila = NonNullable<Awaited<ReturnType<typeof leerFila>>>;

function leerFila(id: string) {
  return prisma.exploracionDeVenta.findUnique({ where: { id }, select: SELECT });
}

const dia = (iso: string) => iso.slice(0, 10);
const nombre = (r: ReunionDeLaExploracion) => `${dia(r.fecha)} · ${r.titulo}`;

/** Qué le falta a una preventa, mirando solo la base. */
async function planDe(fila: Fila) {
  const propuesta = leerPropuesta(fila.propuesta);
  const reuniones = await reunionesDeLaExploracion({
    exploracionId: fila.id,
    clientId: fila.clientId,
    creadaEn: fila.createdAt,
    propuesta,
    leido: leerLoLeido(fila.test),
    elegidas: leerContenido(fila.contenido).reunionesElegidas,
  });
  const sinLeer = reuniones.filter((r) => !r.leida && ((r.origen === "meet" && !r.corta) || r.origen === "documento"));
  const conResumen = (origen: string, id: string) => !!propuesta.lecturas[`${origen}:${id}`];
  const meet = reuniones.filter((r) => r.origen === "meet" && r.leida && !r.corta && !conResumen("meet", r.id));
  const documentos = reuniones.filter((r) => r.origen === "documento" && r.leida && !conResumen("documento", r.id));
  /* Cuáles de lo leído en HubSpot fueron reuniones no se sabe sin preguntarle a HubSpot: lo dicen las
     etiquetas que guardaron las lecturas. Las que ya tienen resumen (por su etiqueta) no cuentan. */
  const etiquetasConResumen = new Set(Object.values(propuesta.lecturas).map((l) => l.etiqueta.slice(0, 200)));
  const deHubspot = [
    ...new Set(
      propuesta.corridas
        .filter((c) => c.modo === "leer")
        .flatMap((c) => c.leyo)
        .filter((e) => e.startsWith("Reunión en HubSpot") && !/no ocurrió|no se presentó/.test(e)),
    ),
  ].filter((e) => !etiquetasConResumen.has(e.slice(0, 200)));
  const releer: LoQueSeRelee = {
    sesiones: meet.map((r) => r.id),
    documentos: documentos.map((r) => r.id),
    hubspot: deHubspot.length ? propuesta.leidas.hubspot.filter((id) => !conResumen("hubspot", id)) : [],
  };
  return { propuesta, reuniones, sinLeer, meet, documentos, deHubspot, releer };
}

async function esperar(runId: string): Promise<{ status: string; output: string | null }> {
  const hasta = Date.now() + ESPERA_MAXIMA_MS;
  let ultimaFase = "";
  while (Date.now() < hasta) {
    const r = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true, currentPhase: true, output: true } });
    if (!r) return { status: "NO_EXISTE", output: null };
    if (r.status !== "RUNNING") return r;
    if (r.currentPhase && r.currentPhase !== ultimaFase) {
      ultimaFase = r.currentPhase;
      console.log(`      … ${ultimaFase}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return { status: "SIN_TERMINAR", output: null };
}

/** Lanza una corrida y espera a que termine. Si ya corría otra, espera esa y lo intenta una vez más. */
async function correr(id: string, opts: Parameters<typeof lanzarCorrida>[2]): Promise<string> {
  for (let intento = 0; intento < 2; intento++) {
    const r = await lanzarCorrida(id, "leer", opts);
    if (!r.ok) return `no se pudo lanzar: ${r.error}`;
    const fin = await esperar(r.runId);
    if (r.yaCorria) {
      console.log("      (había otra corrida en curso: terminó, va de nuevo)");
      continue;
    }
    let salida: Record<string, unknown> = {};
    try {
      salida = fin.output ? (JSON.parse(fin.output) as Record<string, unknown>) : {};
    } catch {
      /* la salida no es JSON: se informa solo el estado */
    }
    if (fin.status !== "DONE") return `${fin.status}${typeof salida.error === "string" ? `: ${salida.error}` : ""}`;
    return typeof salida.resumidas === "number" ? `${salida.resumidas} resumen(es)` : `${salida.propuestos ?? 0} sugerencia(s) nuevas`;
  }
  return "no se pudo: siempre había otra corrida en curso";
}

async function main() {
  const APPLY = resolverApply({ tablas: TABLAS });
  const firma = argumento("--firma");
  const soloUna = argumento("--preventa");
  if (APPLY && !firma?.includes("@")) {
    console.error("⛔ Con --apply hace falta --firma <tu correo>: las lecturas quedan a tu nombre y cobran contra tu presupuesto.");
    process.exit(1);
  }
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? `APLICAR, a nombre de ${firma}` : "SIMULACRO (solo lee la base: ni HubSpot ni la IA)"}\n`);

  const ids = (
    await prisma.exploracionDeVenta.findMany({
      where: { archivadaEn: null, ...(soloUna ? { id: soloUna } : {}) },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })
  ).map((f) => f.id);

  const planes = [];
  for (const id of ids) {
    const fila = await leerFila(id);
    if (!fila) continue;
    planes.push({ fila, plan: await planDe(fila) });
  }

  let lecturas = 0;
  let resumenes = 0;
  for (const { fila, plan } of planes) {
    const hayAlgo = plan.sinLeer.length || plan.meet.length || plan.documentos.length || plan.deHubspot.length;
    console.log(`■ ${fila.client.name} (${fila.client.kind}) · ${fila.id}${hayAlgo ? "" : " · al día"}`);
    if (plan.sinLeer.length) {
      lecturas++;
      console.log(`  1. Leer (${plan.sinLeer.length} sin leer):`);
      for (const r of plan.sinLeer) console.log(`     · ${nombre(r)}${r.origen === "documento" ? " (sumado a mano)" : ""}`);
    }
    const aResumir = [...plan.meet.map(nombre), ...plan.documentos.map((r) => `${nombre(r)} (sumado a mano)`), ...plan.deHubspot];
    if (aResumir.length) {
      resumenes++;
      console.log(`  2. Solo el resumen (ya leídas, sin resumen):`);
      for (const r of aResumir) console.log(`     · ${r}`);
    }
    const cortas = plan.reuniones.filter((r) => r.corta);
    if (cortas.length) console.log(`  · Sin conversación (la sesión pregunta qué pasó, no se lee): ${cortas.map(nombre).join("; ")}`);
  }
  console.log(`\nEn total: ${lecturas} preventa(s) por leer y ${resumenes} con reuniones por resumir.`);
  console.log("Costo aproximado: una lectura con su guía, unos US$0,20–0,35; un resumen, unos centavos.");

  if (!APPLY) {
    console.log("\nNada escrito. Con --apply (y --firma) corre las lecturas y los resúmenes.");
    return;
  }

  // Lo que había, antes de escribir: la propuesta (la mitad del agente) y la foto de HubSpot.
  const tocar = planes.filter(({ plan }) => plan.sinLeer.length || plan.meet.length || plan.documentos.length || plan.deHubspot.length);
  const fecha = new Date().toISOString().slice(0, 10);
  const dir = join("backups", `${fecha}-leer-reuniones-de-preventas`);
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `antes-${Date.now()}.json`);
  writeFileSync(ruta, JSON.stringify(tocar.map(({ fila }) => ({ id: fila.id, empresa: fila.client.name, propuesta: fila.propuesta, test: fila.test })), null, 1));
  console.log(`\nRespaldo de lo que había: ${ruta}\n`);

  for (const { fila } of tocar) {
    console.log(`■ ${fila.client.name}`);
    // 1. Lo que nunca se leyó, de a dos reuniones por vuelta.
    let plan = await planDe((await leerFila(fila.id))!);
    for (let vuelta = 1; vuelta <= VUELTAS_DE_LECTURA && hayQueLeerAlPreparar(plan.sinLeer); vuelta++) {
      const antes = plan.sinLeer.map((r) => r.id).join();
      console.log(`  1. Leyendo (vuelta ${vuelta})…`);
      console.log(`     → ${await correr(fila.id, { triggeredByEmail: firma })}`);
      plan = await planDe((await leerFila(fila.id))!);
      if (plan.sinLeer.map((r) => r.id).join() === antes) {
        console.log("     (no avanzó: queda para el botón «Leer»)");
        break;
      }
    }
    // 2. Lo ya leído sin resumen, con lo que dejó el paso 1.
    const r = plan.releer;
    if (r.sesiones.length || r.documentos.length || r.hubspot.length) {
      console.log("  2. Resumiendo lo ya leído…");
      console.log(`     → ${await correr(fila.id, { triggeredByEmail: firma, releer: r })}`);
    }
  }
  console.log("\nListo. Recarga la preventa: cada reunión leída muestra «Lo que leyó el agente».");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
