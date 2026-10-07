/**
 * lib/tiempos/servidor.ts — piezas compartidas del lado del servidor de Tiempos. SERVIDOR.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { frentesDe } from "@/lib/para-ti/frentes";
import { RESPONSABLES_DE_LA_ESCALA } from "@/lib/escala/responsable";
import {
  calibracionPorTipo,
  definicionDe,
  formatoMinutos,
  leerConfig,
  minutosDeLaCarga,
  nombreDeDocumento,
  textoDeEstimacion,
  tipoDeFase,
  type CalibracionDeTipo,
  type ConfigDeEncuesta,
  type Documento,
  type Momento,
  type PersonaQueResponde,
} from "./reglas";

export const SQL_DE_TIEMPOS = "scripts/sql/2026-10-05-preguntas-de-tiempo.sql";

/** Sin las tablas (falta el SQL o reiniciar con el cliente nuevo) nada pregunta y Feedback › Encuestas lo dice. */
export function tiemposDisponible(): boolean {
  return modeloDisponible(prisma.encuestaDeTiempo) && modeloDisponible(prisma.preguntaDeTiempo);
}

export class ErrorDeTiempos extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface EncuestaCargada {
  id: string | null;
  momento: Momento;
  activa: boolean;
  config: ConfigDeEncuesta;
}

/** La encuesta de un momento. Sin fila: apagada, con la configuración por defecto. Un momento no disponible, siempre apagado. */
export async function encuestaDe(momento: Momento): Promise<EncuestaCargada> {
  const fila = await prisma.encuestaDeTiempo.findUnique({ where: { momento }, select: { id: true, activa: true, config: true } });
  return {
    id: fila?.id ?? null,
    momento,
    activa: !!fila?.activa && definicionDe(momento).disponible,
    config: leerConfig(fila?.config, momento),
  };
}

/** Quién responde: una persona activa del equipo, con su rol y sus frentes. null si el correo no es del equipo. */
export async function personaQueResponde(email: string): Promise<PersonaQueResponde | null> {
  const m = await prisma.teamMember.findUnique({
    where: { email: email.toLowerCase() },
    select: { email: true, roleEnum: true, frentes: true, frentesEditadosAt: true, vistaFinanzas: true, deactivatedAt: true },
  });
  if (!m || m.deactivatedAt) return null;
  return {
    email: m.email.toLowerCase(),
    rol: m.roleEnum,
    frentes: frentesDe({ ...m, esResponsableDeLaEscala: RESPONSABLES_DE_LA_ESCALA.includes(m.email.toLowerCase()) }),
  };
}

/** Las respuestas de tareas que ya hay, por tipo de fase: deciden el muestreo y lo que supone la carga. */
export async function calibracionActual(encuestaId: string | null): Promise<CalibracionDeTipo[]> {
  if (!encuestaId) return calibracionPorTipo([]);
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: { encuestaId, estado: "respondida", minutos: { not: null } },
    select: { tipoFase: true, minutos: true },
  });
  return calibracionPorTipo(filas.map((f) => ({ tipo: f.tipoFase, minutos: f.minutos ?? 0 })));
}

/** Lo que supone la carga para una tarea de este tipo, con su texto. */
export function estimacionDeTarea(cal: readonly CalibracionDeTipo[], tipo: string | null): { minutos: number; texto: string | null } {
  const t = tipoDeFase(tipo);
  const c = cal.find((x) => x.tipo === t)!;
  const minutos = minutosDeLaCarga(c);
  return { minutos, texto: textoDeEstimacion(t, minutos, c.calibra) };
}

/** Un documento no tiene supuesto en la carga: solo hay con qué comparar cuando ya calibró con respuestas. */
export function estimacionDeDocumento(mediana: number | null, documento: Documento): string | null {
  if (mediana === null) return null;
  return `Lo que suele tomar ${documento === "entrega" ? "una" : "un"} ${nombreDeDocumento(documento).toLowerCase()}, según lo que anotó el equipo: ${formatoMinutos(mediana)}.`;
}

/**
 * Cuántas tiene sin anotar: lo que cuenta la fuente de «Para ti». Vive acá y no en preguntas.ts porque esa importa
 * la medición de «Para ti», y la fuente vive dentro de esa medición: sería un ciclo.
 */
export async function cuantasPendientes(email: string, ahora = new Date()): Promise<{ total: number; venceAntes: Date | null }> {
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: { personaEmail: email.toLowerCase(), estado: "pendiente", venceAt: { gt: ahora } },
    select: { venceAt: true },
    orderBy: { venceAt: "asc" },
    take: 50,
  });
  return { total: filas.length, venceAntes: filas[0]?.venceAt ?? null };
}
