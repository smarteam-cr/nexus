/**
 * lib/comunicaciones/lectura-server.ts — la ÚNICA puerta de lectura de las comunicaciones de HubSpot (correos, notas y
 * llamadas) para la memoria interna de la cuenta y el chat de Nexus. SERVER-ONLY, solo lectura.
 *
 *   · Solo de UN cliente (el que se pide) y solo las vigentes.
 *   · Sin las notas que escribió Nexus (`NotaDeLaCuenta.hubspotNotaId`): ya están en «Notas del equipo».
 *   · Sin destinatarios ni HTML (la tabla no los guarda).
 *   · Quién la escribió: el nombre de la persona del equipo si es de Smarteam; si no, su correo.
 * Sin la tabla (el SQL sin aplicar), vacío: nunca se cae.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { rotuloDeLaComunicacion, type DireccionDelCorreo, type TipoDeComunicacion } from "./reglas";

/** De cuántos días se leen para la memoria. */
export const DIAS_PARA_LA_MEMORIA = 60;
const TOPE_PARA_LA_MEMORIA = 12;

/** Lo que recibe la memoria (la misma forma que `ComunicacionDeLaMemoria`, lib/memoria/tipos.ts). */
export interface ComunicacionParaLaMemoria {
  rotulo: string;
  fecha: string;
  autor: string | null;
  asunto: string | null;
  texto: string;
}

export interface ComunicacionVista {
  id: string;
  tipo: TipoDeComunicacion;
  rotulo: string;
  /** ISO. */
  ocurrioAt: string;
  autor: string | null;
  asunto: string | null;
  texto: string;
}

const diaCR = (d: Date) => new Date(+d - 6 * 3_600_000).toISOString().slice(0, 10);

async function leer(clientId: string, o: { desde?: Date; tope: number; tipo?: TipoDeComunicacion; id?: string }): Promise<ComunicacionVista[]> {
  try {
    const [filas, notasDeNexus, equipo] = await Promise.all([
      prisma.comunicacionDeHubspot.findMany({
        where: { clientId, vigente: true, ...(o.id ? { id: o.id } : {}), ...(o.desde ? { ocurrioAt: { gte: o.desde } } : {}), ...(o.tipo ? { tipo: o.tipo } : {}) },
        orderBy: { ocurrioAt: "desc" },
        take: o.tope + 10,
        select: { id: true, tipo: true, hubspotId: true, direccion: true, ocurrioAt: true, asunto: true, texto: true, autorEmail: true, deEmail: true },
      }),
      prisma.notaDeLaCuenta.findMany({ where: { clientId, hubspotNotaId: { not: null } }, select: { hubspotNotaId: true } }),
      prisma.teamMember.findMany({ select: { email: true, name: true } }),
    ]);
    const deNexus = new Set(notasDeNexus.map((n) => n.hubspotNotaId));
    const nombre = new Map(equipo.flatMap((m) => (m.email ? [[m.email.toLowerCase(), m.name] as const] : [])));
    return filas
      .filter((f) => !(f.tipo === "nota" && deNexus.has(f.hubspotId)))
      .filter((f) => (f.texto ?? "").trim() || (f.asunto ?? "").trim())
      .slice(0, o.tope)
      .map((f) => {
        const correo = f.autorEmail ?? f.deEmail;
        return {
          id: f.id,
          tipo: f.tipo as TipoDeComunicacion,
          rotulo: rotuloDeLaComunicacion(f.tipo as TipoDeComunicacion, f.direccion as DireccionDelCorreo | null),
          ocurrioAt: f.ocurrioAt.toISOString(),
          autor: correo ? (nombre.get(correo.toLowerCase()) ?? correo) : null,
          asunto: f.asunto,
          texto: f.texto ?? "",
        };
      });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Para la memoria interna de la cuenta (lib/memoria/cargar.ts): las de los últimos 60 días, las más nuevas primero. */
export async function comunicacionesParaLaMemoria(clientId: string, ahora = new Date()): Promise<ComunicacionParaLaMemoria[]> {
  const lista = await leer(clientId, { desde: new Date(+ahora - DIAS_PARA_LA_MEMORIA * 86_400_000), tope: TOPE_PARA_LA_MEMORIA });
  return lista.map((c) => ({ rotulo: c.rotulo, fecha: diaCR(new Date(c.ocurrioAt)), autor: c.autor, asunto: c.asunto, texto: c.texto }));
}

/** Para el chat de Nexus: las más recientes de la cuenta (o una sola, por su id). */
export async function comunicacionesDeLaCuenta(clientId: string, o: { tope?: number; tipo?: TipoDeComunicacion } = {}): Promise<ComunicacionVista[]> {
  return leer(clientId, { tope: Math.min(Math.max(1, o.tope ?? 15), 30), tipo: o.tipo });
}

export async function unaComunicacion(clientId: string, id: string): Promise<ComunicacionVista | null> {
  const [c] = await leer(clientId, { tope: 1, id });
  return c ?? null;
}
