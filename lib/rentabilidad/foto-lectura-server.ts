/**
 * lib/rentabilidad/foto-lectura-server.ts — LEER la foto del margen de los meses cerrados. SERVER-ONLY, solo dirección.
 *
 * Aparte del escritor (foto-server.ts) porque el escritor usa el cálculo en vivo de queries.ts, y queries.ts lee las
 * fotos: así no hay un import circular.
 *
 * Sin las tablas (el SQL 2026-10-17-foto-del-margen.sql sin correr) devuelve un mapa vacío: todo sigue en vivo y no se
 * cae nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import type { FotoDeCuenta, FotoDelMes } from "./foto";

export interface FotoGuardada {
  mes: FotoDelMes;
  cuentas: FotoDeCuenta[];
  tomadaAt: Date;
  tomadaPor: string;
  motivo: string | null;
}

const n = (x: unknown) => Number(x ?? 0);
const nn = (x: unknown) => (x === null || x === undefined ? null : Number(x));

/** ¿Este servidor tiene las tablas de la foto? (El cliente de Prisma las conoce y la base las tiene.) */
export async function fotosDisponibles(): Promise<boolean> {
  if (!modeloDisponible(prisma.fotoMargenMes)) return false;
  try {
    await prisma.fotoMargenMes.findFirst({ select: { id: true } });
    return true;
  } catch (e) {
    if (esquemaDesactualizado(e)) return false;
    throw e;
  }
}

/** Las fotos de estos meses, por mes. Los que no tienen foto no están en el mapa. */
export async function leerFotos(meses: string[]): Promise<Map<string, FotoGuardada>> {
  const out = new Map<string, FotoGuardada>();
  if (!meses.length || !modeloDisponible(prisma.fotoMargenMes)) return out;
  let filas;
  try {
    filas = await prisma.fotoMargenMes.findMany({ where: { mes: { in: meses } }, include: { cuentas: true } });
  } catch (e) {
    if (esquemaDesactualizado(e)) return out;
    throw e;
  }
  for (const f of filas) {
    out.set(f.mes, {
      tomadaAt: f.tomadaAt,
      tomadaPor: f.tomadaPor,
      motivo: f.motivo,
      mes: {
        mes: f.mes,
        version: f.version,
        planilla: n(f.planilla),
        ingreso: n(f.ingreso),
        horasPagadas: n(f.horasPagadas),
        horasConClientes: n(f.horasConClientes),
        horasCalendario: n(f.horasCalendario),
        horasRespondidas: n(f.horasRespondidas),
        horasEstimadas: n(f.horasEstimadas),
        // v2 (2026-10-18): una foto v1 no tenía las reuniones fuera de Meet ni las tareas: se leen en cero.
        horasSinMeet: n(f.horasSinMeet),
        horasTareas: n(f.horasTareas),
        horasTareasEstimadas: n(f.horasTareasEstimadas),
        horasPorSesion: n(f.horasPorSesion),
        costoHoraDirecto: nn(f.costoHoraDirecto),
        costoHoraCargado: nn(f.costoHoraCargado),
        preparacionMin: f.preparacionMin,
        supuestos: f.supuestos as FotoDelMes["supuestos"],
        tasa: (f.tasa ?? null) as FotoDelMes["tasa"],
        costos: f.costos as unknown as FotoDelMes["costos"],
        personas: f.personas as unknown as FotoDelMes["personas"],
        avisos: (f.avisos as unknown as string[]) ?? [],
      },
      cuentas: f.cuentas
        .map((c) => ({
          mes: c.mes,
          clientId: c.clientId,
          nombre: c.nombre,
          cse: c.cse,
          ingreso: n(c.ingreso),
          fuenteIngreso: (c.fuenteIngreso === "Cobranza" || c.fuenteIngreso === "Odoo" ? c.fuenteIngreso : null) as FotoDeCuenta["fuenteIngreso"],
          horasCalendario: n(c.horasCalendario),
          horasPreparacion: n(c.horasPreparacion),
          horasEntrega: n(c.horasEntrega),
          horasRespondidas: n(c.horasRespondidas),
          horasEstimadas: n(c.horasEstimadas),
          horasSinMeet: n(c.horasSinMeet),
          horasTareas: n(c.horasTareas),
          horasTareasAgenda: n(c.horasTareasAgenda),
          reuniones: c.reuniones,
          planSesiones: nn(c.planSesiones),
          planHorasTareas: nn(c.planHorasTareas),
          costoPersona: n(c.costoPersona),
          costoEquipo: n(c.costoEquipo),
          costoCargado: n(c.costoCargado),
          margenPersona: n(c.margenPersona),
          margenEquipo: n(c.margenEquipo),
          margenCargado: n(c.margenCargado),
          factor: n(c.factor),
          porPersona: (c.porPersona as unknown as FotoDeCuenta["porPersona"]) ?? [],
        }))
        .sort((a, b) => a.clientId.localeCompare(b.clientId)),
    });
  }
  return out;
}
