/**
 * lib/analizador-venta/guia-de-la-reunion-server.ts — lo que la preventa planeó preguntar en UNA reunión de venta y las
 * dimensiones de la escala del área en juego (S3, 2026-10-25). SERVIDOR. Solo lectura, sin IA.
 *
 * La misma regla que la lectura de la preventa (`planDeLaLectura`, lib/exploraciones/agente.ts): la guía de la sesión a
 * la que está unida la reunión, o la viva, SOLO si se armó antes de la reunión (`guiaDeAntesDeLaReunion`); si no, ninguna.
 * Comparar contra una guía armada después marcaría «no se preguntó» en preguntas que nadie llevó (pasó con CreditForce).
 * La preventa es la de la MISMA empresa dueña de la reunión (invariante 1): se busca por su `clientId`.
 * Si algo falla (la escala sin publicar, una preventa rara), el análisis sigue «sin guía»: nunca se cae por esto.
 * Lo que se esperaba explorar se ACOTA al área de la sesión (2026-10-27, alcance.ts): el equipo de la sesión o la guía
 * enfocada, y solo como último recurso las áreas en juego de la preventa (antes eran siempre esas: hasta 24 dimensiones).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "@/lib/exploraciones/servidor";
import { guiaDeAntesDeLaReunion, ordenDeLaConversacion, preguntasParaMostrar, reunionDeLaSesion } from "@/lib/exploraciones/guia";
import { aplicarAjustes, apuntaDelTema } from "@/lib/exploraciones/ajustes-de-la-guia";
import { posicionesDelMapa } from "@/lib/exploraciones/mapa";
import { DE_LA_PREVENTA, marcoDe } from "@/lib/exploraciones/marco";
import { alcanceDeLaSesion, type AlcanceDeLaSesion } from "./alcance";

export interface GuiaDeLaReunion {
  /** Lo que se buscaba en la sesión, si se sabe. */
  objetivo: string | null;
  /** Las preguntas que se llevaron (máximo 16). */
  preguntas: string[];
  /** Lo que se esperaba explorar en la sesión, acotado a su área (alcance.ts), con el nivel que se cree hoy si es una dimensión. */
  dimensiones: { nombre: string; area: string; nivel: string | null }[];
  /** De dónde sale ese alcance, en una línea. */
  alcance: AlcanceDeLaSesion["descripcion"];
  /** La preventa tiene escala (aunque el alcance sean los temas de un equipo que la escala no mide). */
  conEscala: boolean;
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
    // Lo que se esperaba explorar, acotado al área de la sesión (alcance.ts).
    const alcance = alcanceDeLaSesion({ equipo: sesion?.equipo, enfoque: guia?.enfoque ?? [], areasEnJuego: estado.areas, areas: escala.areas });
    const dimensiones = alcance.dimensiones.map((d) => ({ nombre: d.nombre, area: d.area, nivel: d.id ? (posiciones[d.id]?.nivel ?? null) : null }));
    return { objetivo: sesion?.objetivo ?? guia?.objetivo ?? null, preguntas, dimensiones, alcance: alcance.descripcion, conEscala: escala.areas.length > 0 };
  } catch (e) {
    console.warn(`[analizador-venta] sin guía para ${o.sessionId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
