/**
 * scripts/migrar-guia-de-exploracion.ts — pasa el plan de sesiones de la guía VIEJA de exploración
 * (`GuiaDeExploracion`, lib/guia-exploracion) a la exploración nueva del proyecto (el lienzo de la
 * preventa con las preguntas de Customer Success, 2026-10-07).
 *
 * Por cada proyecto con una guía vieja que tiene sesiones y cuya exploración nueva todavía no tiene
 * ninguna: abre la exploración nueva (con lo que dejó la preventa, igual que al abrirla en la ficha) y
 * le copia las sesiones — el título, el objetivo y las preguntas que no se hicieron (van como «lo que
 * te llevas» a esa sesión). Lo que el CSE ya averiguó queda como nota de la sesión: el agente lo lee
 * como su contexto. La guía vieja no se toca (sigue como «Informe anterior» si tenía informe).
 *
 * SIMULACRO por defecto (solo lee). Con --apply escribe, y además exige ALLOW_PROD_WRITE=1 (el guard).
 *
 *   npx tsx scripts/migrar-guia-de-exploracion.ts
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-guia-de-exploracion.ts --apply --firma tu@correo
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { leerContenido as leerGuiaVieja, tituloSinNumero } from "@/lib/guia-exploracion/contenido";
import { asegurarExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { leerContenido } from "@/lib/exploraciones/esquemas";
import type { Operacion } from "@/lib/exploraciones/contenido";
import type { SesionPlaneada } from "@/lib/exploraciones/guia";
import { claveDeNotaDeSesion, MAX_NOTA_DE_SESION } from "@/lib/exploraciones/notas-de-sesion";
import { aplicarCambios, escalaParaExplorar, leerExploracion } from "@/lib/exploraciones/servidor";
import { describirDestino, resolverApply } from "./lib/guard";

const MAX_PARA_EXPLORAR = 10;

function idDeSesion(i: number): string {
  return `s-mig${i}${Math.random().toString(36).slice(2, 8)}`;
}

/** Las sesiones viejas, en el formato nuevo, con su nota (lo que el CSE ya averiguó). */
function convertir(sesiones: ReturnType<typeof leerGuiaVieja>["sesiones"]): { sesiones: SesionPlaneada[]; notas: { id: string; texto: string }[] } {
  const out: SesionPlaneada[] = [];
  const notas: { id: string; texto: string }[] = [];
  sesiones.slice(0, 12).forEach((s, i) => {
    const id = idDeSesion(i + 1);
    const pendientes = s.preguntas.filter((q) => !q.hecha && q.texto.trim()).map((q) => `Qué preguntar: ${q.texto.trim()}`.slice(0, 600));
    const averiguado = s.preguntas.filter((q) => q.respuesta?.trim()).map((q) => `${q.texto.trim()}\n→ ${q.respuesta!.trim()}`);
    out.push({
      id,
      ...(s.titulo.trim() ? { titulo: tituloSinNumero(s.titulo).slice(0, 120) } : {}),
      ...(s.objetivo.trim() ? { objetivo: s.objetivo.trim().slice(0, 400) } : {}),
      ...(pendientes.length ? { explorar: [...new Set(pendientes)].slice(0, MAX_PARA_EXPLORAR) } : {}),
      ...(s.preguntas.length && s.preguntas.every((q) => q.hecha) ? { hecha: true } : {}),
    });
    const conQuien = s.conQuien.trim() ? `Con quién: ${s.conQuien.trim()}\n\n` : "";
    if (averiguado.length || conQuien) notas.push({ id, texto: `${conQuien}${averiguado.join("\n\n")}`.slice(0, MAX_NOTA_DE_SESION) });
  });
  return { sesiones: out, notas };
}

async function main() {
  const apply = resolverApply({ tablas: ["ExploracionDeVenta"] });
  const i = process.argv.indexOf("--firma");
  const firma = i >= 0 ? process.argv[i + 1] : null;
  if (apply && !firma?.includes("@")) {
    console.error("⛔ Con --apply hace falta --firma <tu correo>: la exploración nueva queda a tu nombre.");
    process.exit(1);
  }
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${apply ? `APLICAR, a nombre de ${firma}` : "SIMULACRO (solo lee)"}\n`);

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") throw new Error("La escala no está publicada: sin ella no se valida el cambio.");

  const guias = await prisma.guiaDeExploracion.findMany({ select: { projectId: true, contenido: true, project: { select: { name: true } } } });
  let migradas = 0;
  for (const g of guias) {
    const vieja = leerGuiaVieja(g.contenido);
    if (!vieja.sesiones.length) continue;
    const viva = await prisma.exploracionDeVenta.findFirst({ where: { projectId: g.projectId, archivadaEn: null }, select: { id: true, contenido: true } });
    if (viva && leerContenido(viva.contenido).sesiones.length) {
      console.log(`· ${g.project.name}: la exploración nueva ya tiene sesiones — no se toca.`);
      continue;
    }
    const { sesiones, notas } = convertir(vieja.sesiones);
    console.log(
      `· ${g.project.name}: ${vieja.sesiones.length} sesión(es) vieja(s) → ${sesiones.length} sesión(es) nueva(s), ` +
        `${sesiones.reduce((n, s) => n + (s.explorar?.length ?? 0), 0)} pregunta(s) pendiente(s), ${notas.length} nota(s).`,
    );
    if (!apply) continue;

    const r = await asegurarExploracionDelProyecto(g.projectId, firma!);
    if (!r.ok) {
      console.error(`  ✗ no se pudo abrir la exploración: ${r.error}`);
      continue;
    }
    const lectura = await leerExploracion(r.id);
    if (lectura.estado !== "ok") continue;
    const ops: Operacion[] = [{ op: "sesiones", sesiones }, ...notas.map((n) => ({ op: "nota" as const, paso: claveDeNotaDeSesion(n.id), texto: n.texto }))];
    const c = await aplicarCambios(r.id, lectura.fila.version, ops, escala.general);
    if (c.estado !== "ok") console.error(`  ✗ ${c.estado === "invalido" ? c.error : c.estado}`);
    else migradas++;
  }
  console.log(apply ? `\n✓ ${migradas} exploración(es) con sus sesiones.` : "\n(simulacro: nada escrito; con --apply se aplica)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
