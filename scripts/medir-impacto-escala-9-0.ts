/**
 * scripts/medir-impacto-escala-9-0.ts — qué cambia en las exploraciones (preventa y proyecto) si se publica la 9.0.0.
 * SOLO LEE producción. Para cada exploración recalcula, con la escala publicada y con la 9.0.0, el nivel confirmado de
 * cada área (el de «Dónde está hoy» y la foto) y cuenta las que cambian. Además cuenta las marcas de «Lo que pide
 * Funcional» (`contenido.falta`) que quedan sobre un criterio que la 9.0.0 ya no tiene, y las fotos guardadas.
 *
 * La 9.0.0 sale del borrador si está cerrado; si no, del archivo del repo (docs/escala/escala_rendimiento_smarteam.md,
 * que es la 9.0.0 cerrada).
 *
 *   npx tsx scripts/medir-impacto-escala-9-0.ts [--detalle]
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import fs from "node:fs";
import path from "node:path";
import { createScriptDb } from "./lib/db";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import type { Escala } from "@/lib/escala/documento/tipos";
import { generarMarkdown } from "@/lib/escala/datos/generar";
import { leerBorrador } from "@/lib/escala/datos/versiones";
import { tieneLoQueFaltaDecidir } from "@/lib/escala/datos/reglas";
import { escalaDeLaExploracion, estadoDesdeFila } from "@/lib/exploraciones/servidor";
import { chequeoConfirmado } from "@/lib/exploraciones/mapa";
import { fotoDeLaExploracion } from "@/lib/exploraciones/foto-de-la-escala";

const DETALLE = process.argv.includes("--detalle");
const AREAS: Record<string, string> = { "1": "Ventas", "2": "Marketing", "3": "Servicio" };

type Niveles = Record<string, string | null>;

function niveles(general: Escala, fila: Parameters<typeof estadoDesdeFila>[0]): { confirmado: Niveles; foto: Niveles } {
  const estado = estadoDesdeFila(fila);
  const lienzo = escalaDeLaExploracion(general, estado);
  const ch = chequeoConfirmado(lienzo, estado);
  const foto = fotoDeLaExploracion(lienzo, estado);
  return {
    confirmado: Object.fromEntries(ch.areas.map((a) => [a.id, a.nivel ?? null])),
    foto: Object.fromEntries(foto.areas.map((a) => [a.id, (a as { nivel?: string | null }).nivel ?? null])),
  };
}

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    const publicada = await prisma.escalaDocumento.findFirst({ where: { documento: "escala" }, orderBy: { publicadaEn: "desc" }, select: { version: true, texto: true } });
    if (!publicada) throw new Error("No hay escala publicada.");
    const antes = parsearEscala(publicada.texto);
    const borrador = await leerBorrador(prisma);
    const mdBorrador = borrador ? generarMarkdown(borrador.datos) : null;
    const md = mdBorrador && !tieneLoQueFaltaDecidir(mdBorrador) ? mdBorrador : fs.readFileSync(path.join(process.cwd(), "docs/escala/escala_rendimiento_smarteam.md"), "utf8");
    const despues = parsearEscala(md);
    console.log(`Publicada: ${antes.version} · Nueva: ${despues.version} (${mdBorrador && md === mdBorrador ? "del borrador cerrado" : "del archivo del repo"})\n`);

    const idsNuevos = new Set([
      ...despues.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.map((c) => c.id)))),
      ...despues.ediciones.flatMap((e) => e.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.propios.map((c) => c.id)))),
    ]);

    const filas = await prisma.exploracionDeVenta.findMany({
      select: { id: true, clientId: true, projectId: true, contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true, client: { select: { name: true } } },
    });

    const cuenta = { exploraciones: 0, conNivel: 0, cambian: 0, archivadas: 0 };
    const porArea: Record<string, { con: number; cambia: number; suben: number; bajan: number }> = {};
    const porTipo = { preventa: 0, proyecto: 0 };
    let marcasHuerfanas = 0;
    let exploracionesConHuerfanas = 0;
    const orden = "DIFEO";
    for (const f of filas) {
      if (f.archivadaEn) {
        cuenta.archivadas++;
        continue;
      }
      cuenta.exploraciones++;
      const a = niveles(antes, f);
      const d = niveles(despues, f);
      const ids = new Set([...Object.keys(a.foto), ...Object.keys(d.foto), ...Object.keys(a.confirmado), ...Object.keys(d.confirmado)]);
      let algo = false;
      let cambia = false;
      for (const id of ids) {
        const va = a.foto[id] ?? a.confirmado[id] ?? null;
        const vd = d.foto[id] ?? d.confirmado[id] ?? null;
        if (va || vd) algo = true;
        porArea[id] ??= { con: 0, cambia: 0, suben: 0, bajan: 0 };
        if (va || vd) porArea[id].con++;
        if (va !== vd) {
          cambia = true;
          porArea[id].cambia++;
          if (va && vd) porArea[id][orden.indexOf(vd) > orden.indexOf(va) ? "suben" : "bajan"]++;
          if (DETALLE) console.log(`  ${f.client.name} · ${f.projectId ? "proyecto" : "preventa"} · ${AREAS[id] ?? id}: ${va ?? "—"} → ${vd ?? "—"}`);
        }
      }
      if (algo) cuenta.conNivel++;
      if (cambia) {
        cuenta.cambian++;
        porTipo[f.projectId ? "proyecto" : "preventa"]++;
      }
      const falta = ((f.contenido as { falta?: Record<string, unknown> } | null)?.falta ?? {}) as Record<string, unknown>;
      const huerfanas = Object.keys(falta).filter((id) => !idsNuevos.has(id));
      marcasHuerfanas += huerfanas.length;
      if (huerfanas.length) exploracionesConHuerfanas++;
    }

    console.log(`Exploraciones vivas: ${cuenta.exploraciones} (archivadas, sin contar: ${cuenta.archivadas}) · con algún nivel: ${cuenta.conNivel}`);
    console.log(`Cambian de nivel en algún área: ${cuenta.cambian} (preventa ${porTipo.preventa} · proyecto ${porTipo.proyecto})`);
    for (const [id, x] of Object.entries(porArea).sort()) {
      console.log(`  ${AREAS[id] ?? id}: ${x.con} con nivel · cambian ${x.cambia} (suben ${x.suben}, bajan ${x.bajan})`);
    }
    console.log(`Marcas de «Lo que pide Funcional» sobre un criterio que la ${despues.version} no tiene: ${marcasHuerfanas}, en ${exploracionesConHuerfanas} exploraciones.`);

    const fotos = await prisma.versionDeLaEscala.groupBy({ by: ["escalaVersion"], _count: { _all: true } });
    console.log(`\nFotos guardadas (VersionDeLaEscala, congeladas con su versión): ${fotos.map((x) => `${x.escalaVersion ?? "sin versión"} ${x._count._all}`).join(" · ") || "ninguna"}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
