/**
 * scripts/ver-guia-por-equipo.ts — qué cambia en una preventa (o en la exploración de un proyecto) con la sesión por
 * equipo del cliente (2026-10-23, docs/preventa-por-area-plan.md). NO ESCRIBE y NO LLAMA A CLAUDE.
 *
 * Para la próxima sesión muestra la guía de hoy (el plan de la empresa, ya en el orden de la conversación) y, en memoria,
 * cómo quedaría si fuera con cada equipo que se pide (`--equipos marketing,tecnologia`). Además, el panel de la derecha:
 * el estado de cada tarjeta (completa, a medias, sugerida, falta, con lo nuevo), lo que «Para proponer» cuenta y «Por
 * equipo». ⚠ Imprime palabras de clientes: no sale de la PC.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/ver-guia-por-equipo.ts --cliente "Cicadex"
 *   npx tsx scripts/ver-guia-por-equipo.ts --cliente "Cemaco" --equipos marketing,operaciones,tecnologia
 *   npx tsx scripts/ver-guia-por-equipo.ts --id <exploracionId>
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptPool } from "./lib/db";

process.env.DB_POOL_MAX ??= "2";
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}

async function elegir(): Promise<{ id: string; empresa: string; proyecto: string | null }[]> {
  const { pool, close } = createScriptPool();
  try {
    const c = await pool.connect();
    try {
      await c.query("SET default_transaction_read_only = on");
      const r = await c.query<{ id: string; empresa: string; proyecto: string | null }>(
        `select e.id, cl.name as empresa, p.name as proyecto
           from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId" left join "Project" p on p.id = e."projectId"
          where e."archivadaEn" is null and ($1::text is null or e.id = $1) and ($2::text is null or cl.name ilike '%' || $2 || '%')
            and jsonb_array_length(coalesce(e.contenido->'sesiones', '[]'::jsonb)) > 0
          order by e."updatedAt" desc limit 5`,
        [arg("--id"), arg("--cliente")],
      );
      return r.rows;
    } finally {
      c.release();
    }
  } finally {
    await close();
  }
}

async function main() {
  const { contextoParaLaGuia, planDeLaGuiaDeLaSesion } = await import("@/lib/exploraciones/agente");
  const { preguntasDeLaProxima } = await import("@/lib/exploraciones/guia-ajustes-server");
  const { QUE_BUSCA_CADA_PASO, yaPreguntadoEnLaExploracion } = await import("@/lib/exploraciones/plan-de-la-guia");
  const { ordenDeLaConversacion, preguntasParaMostrar, pestanasDeSesiones } = await import("@/lib/exploraciones/guia");
  const { EQUIPOS, esEquipo, sugerirEquipoDeLaSesion, nombreDelTemaDeEquipo } = await import("@/lib/exploraciones/equipos");
  const { estadoDeLaTarjeta } = await import("@/lib/exploraciones/estado-de-las-tarjetas");
  const { listaParaProponer } = await import("@/lib/exploraciones/calidad");
  const { chequeoDe } = await import("@/lib/exploraciones/servidor");
  const { resumenPorEquipo } = await import("@/lib/exploraciones/por-equipo");
  const { hoyEnCostaRica } = await import("@/lib/exploraciones/fechas");
  const equipos = (arg("--equipos") ?? "").split(",").map((x) => x.trim()).filter(esEquipo);

  for (const x of await elegir()) {
    const base = await contextoParaLaGuia(x.id);
    const { estado, escala, marco, ctx, loLeido } = base;
    const nombre = (para: string) =>
      nombreDelTemaDeEquipo(para) ?? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.nombre ?? para;
    console.log(`\n══ ${x.empresa}${x.proyecto ? ` · ${x.proyecto}` : " · preventa"} (${x.id}) · marco ${marco.clave} · áreas ${estado.areas.join(",") || "-"}`);

    // ── El panel ──
    const pendientes = base.pendientes;
    console.log("\nEl panel (tarjeta: estado · lo nuevo):");
    for (const clave of marco.tarjetas) {
      const propuestas = pendientes.filter((it) => it.destino.tipo === "casilla" && it.destino.clave === clave).length;
      const e = estadoDeLaTarjeta(clave, estado.contenido.casillas[clave], propuestas);
      console.log(`  · ${clave}: ${e.estado}${e.motivo ? ` (${e.motivo})` : ""}${e.nuevo ? ` · ${propuestas} nuevas para revisar` : ""}`);
    }
    if (marco.clave === "venta") {
      const chequeo = chequeoDe(escala, estado);
      const puntos = listaParaProponer(estado, chequeo);
      console.log(`Para proponer: ${puntos.filter((p) => p.cumplido).length} de ${puntos.length} (${puntos.map((p) => `${p.corto}${p.cumplido ? " ✓" : ""}`).join(" · ")})`);
    }
    const ya = yaPreguntadoEnLaExploracion(estado);
    const pestanas = pestanasDeSesiones(estado.contenido.sesiones, [], hoyEnCostaRica());
    const porEquipo = resumenPorEquipo(pestanas, ya, (area) => escala.areas.find((a) => a.id === area)?.dimensiones.map((d) => d.id) ?? []);
    console.log(`Por equipo: ${porEquipo.filas.map((f) => `${f.nombre} ${f.respondidos}/${f.temas.length}`).join(" · ") || "(ninguna sesión con equipo)"} · sin equipo: ${porEquipo.sinEquipo}`);
    console.log(`Respondido según las lecturas o lo marcado: ${[...ya.entries()].map(([k, v]) => `${k}(${[...v].join("+")})`).join(" ") || "nada"}`);

    // ── Las sesiones y su equipo sugerido ──
    console.log("\nLas sesiones (equipo guardado · sugerido por Nexus):");
    for (const s of estado.contenido.sesiones) {
      const sugerido = sugerirEquipoDeLaSesion({ sesion: s })?.equipo;
      console.log(`  · ${s.id} ${s.fecha ?? "sin fecha"} «${s.titulo ?? s.evento?.titulo ?? ""}» · ${s.equipo ?? "-"} · ${sugerido ?? "-"}`);
    }

    // ── La guía de la próxima, hoy ──
    const sesionId = ctx.proxima.sesionId ?? null;
    console.log(`\nLa próxima: la ${ctx.proxima.numero}${sesionId ? ` (${sesionId})` : " (todavía no es sesión)"}.`);
    console.log("La guía de hoy (en el orden de la conversación):");
    for (const p of ordenDeLaConversacion(preguntasDeLaProxima(base).preguntas)) {
      console.log(`  · [${p.tipo}] ${nombre(p.apunta?.para ?? p.para)}${p.paso ? ` · ${QUE_BUSCA_CADA_PASO[p.paso]}` : ""} — ${p.pregunta}`);
    }
    if (ctx.faltanAlCerrar?.length) console.log(`  Al cerrar pide: ${ctx.faltanAlCerrar.join(", ")}`);

    // ── La misma sesión con cada equipo, en memoria ──
    for (const equipo of equipos) {
      const id = sesionId ?? "s-simulada";
      const sesiones = sesionId ? estado.contenido.sesiones.map((s) => (s.id === id ? { ...s, equipo } : s)) : [...estado.contenido.sesiones, { id, equipo }];
      const area = EQUIPOS[equipo].area;
      const areas = area && !estado.areas.includes(area) && escala.areas.some((a) => a.id === area) ? [...estado.areas, area] : estado.areas;
      const simulado = { ...estado, areas, contenido: { ...estado.contenido, sesiones } };
      const conPlan = planDeLaGuiaDeLaSesion(simulado, loLeido.tests, escala, base.posiciones, id, marco);
      const preguntas = preguntasParaMostrar(null, [], [], escala, undefined, marco, conPlan ?? undefined);
      console.log(`\nCon ${EQUIPOS[equipo].nombre}${areas !== estado.areas ? ` (suma el área ${area} a las áreas en juego)` : ""}: la guía de base, antes de «Armar la guía»`);
      for (const p of ordenDeLaConversacion(preguntas)) console.log(`  · ${nombre(p.para)}${p.paso ? ` · ${QUE_BUSCA_CADA_PASO[p.paso]}` : ""} — ${p.pregunta}`);
      console.log(`  Cierre: «${EQUIPOS[equipo].cierre}»`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect().catch(() => undefined);
    process.exit();
  });
