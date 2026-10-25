/**
 * lib/analizador-venta/guia-de-la-reunion-server.ts — lo que la preventa planeó preguntar en UNA reunión de venta y las
 * dimensiones de la escala del área en juego (S3, 2026-10-25). SERVIDOR. Solo lectura, sin IA.
 *
 * La misma regla que la lectura de la preventa (`planDeLaLectura`, lib/exploraciones/agente.ts): la guía de la sesión a
 * la que está unida la reunión, o la viva, SOLO si se armó antes de la reunión (`guiaDeAntesDeLaReunion`); si no, ninguna.
 * Comparar contra una guía armada después marcaría «no se preguntó» en preguntas que nadie llevó (pasó con CreditForce).
 * La preventa es la de la MISMA empresa dueña de la reunión (invariante 1): se busca por su `clientId`.
 * Si algo falla (la escala sin publicar, una preventa rara), el análisis sigue «sin guía»: nunca se cae por esto.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "@/lib/exploraciones/servidor";
import { guiaDeAntesDeLaReunion, ordenDeLaConversacion, preguntasParaMostrar, reunionDeLaSesion } from "@/lib/exploraciones/guia";
import { aplicarAjustes, apuntaDelTema } from "@/lib/exploraciones/ajustes-de-la-guia";
import { posicionesDelMapa } from "@/lib/exploraciones/mapa";
import { DE_LA_PREVENTA, marcoDe } from "@/lib/exploraciones/marco";
import { EQUIPOS } from "@/lib/exploraciones/equipos";

export interface GuiaDeLaReunion {
  /** Lo que se buscaba en la sesión, si se sabe. */
  objetivo: string | null;
  /** Las preguntas que se llevaron (máximo 16). */
  preguntas: string[];
  /** Las dimensiones de la escala del área en juego, con el nivel que se cree hoy. */
  dimensiones: { nombre: string; area: string; nivel: string | null }[];
}

/** Hasta cuántas preguntas de la guía se le pasan al agente. */
const MAX_PREGUNTAS = 16;

export async function guiaDeLaReunion(o: { clientId: string; sessionId: string; titulo: string; fecha: Date }): Promise<GuiaDeLaReunion | null> {
  try {
    const exp = await prisma.exploracionDeVenta.findFirst({
      where: { clientId: o.clientId, archivadaEn: null, ...DE_LA_PREVENTA },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!exp) return null;
    const [vigente, lectura] = await Promise.all([escalaParaExplorar(), leerExploracion(exp.id)]);
    if (vigente.estado !== "ok" || lectura.estado !== "ok") return null;
    const estado = estadoDesdeFila(lectura.fila);
    const escala = escalaDeLaExploracion(vigente.general, estado);
    const posiciones = posicionesDelMapa(estado, []);
    const marco = marcoDe(lectura.fila.marco);
    const fecha = o.fecha.toISOString();
    const comoReunion = { id: o.sessionId, titulo: o.titulo, fecha, origen: "meet" as const, leida: true };
    const sesion = estado.contenido.sesiones.find((s) => reunionDeLaSesion(s, [comoReunion]) !== null) ?? null;
    const guia = guiaDeAntesDeLaReunion(estado.propuesta, sesion?.id ?? null, fecha);
    const preguntas = ordenDeLaConversacion(
      aplicarAjustes(guia ? preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala, undefined, marco) : [], sesion?.ajustesDeLaGuia, apuntaDelTema(escala)),
    )
      .filter((p) => p.tipo !== "abierto")
      .slice(0, MAX_PREGUNTAS)
      .map((p) => (p.tema ? `${p.tema}: ${p.pregunta}` : p.pregunta).slice(0, 400));
    // El área en juego: la del equipo de la sesión; si no, las de la preventa.
    const areaDelEquipo = sesion?.equipo ? EQUIPOS[sesion.equipo]?.area : null;
    const areas = escala.areas.filter((a) => (areaDelEquipo ? a.id === areaDelEquipo : estado.areas.includes(a.id)));
    const dimensiones = areas.flatMap((a) =>
      a.dimensiones.filter((d) => d.aplica).map((d) => ({ nombre: d.nombre, area: a.nombre, nivel: posiciones[d.id]?.nivel ?? null })),
    );
    return { objetivo: sesion?.objetivo ?? guia?.objetivo ?? null, preguntas, dimensiones };
  } catch (e) {
    console.warn(`[analizador-venta] sin guía para ${o.sessionId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
