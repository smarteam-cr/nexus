/**
 * lib/rentabilidad/foto-server.ts — EL ÚNICO ESCRITOR de la foto del margen (FotoMargenMes y FotoMargenCuenta).
 * SERVER-ONLY, solo dirección.
 *
 * Toma la foto de un mes cerrado con el MISMO cálculo de la pantalla (`cargarRentabilidadDelRango` para ese mes) y la
 * guarda tal cual la arma `armarFoto` (lib/rentabilidad/foto.ts). Volver a escribir un mes reemplaza el mes entero en
 * una transacción: correrlo dos veces deja las mismas filas.
 *
 *  · El job (`rentabilidad-foto-mensual`, el día 3 desde las 7:00 CR) y el script sin `--rehacer` NO pisan una foto que
 *    ya está: si el mes la tiene, no hacen nada.
 *  · Volver a tomarla (desde Rentabilidad o con `--rehacer`) pide un motivo, que queda en la fila.
 *
 * Lo vigila lib/rentabilidad/foto.test.ts: nadie más escribe estas dos tablas.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { rangoDelMes } from "./margen";
import { armarFoto, esMesCerrado, type FotoDeCuenta, type FotoDelMes } from "./foto";
import { cargarRentabilidadDelRango } from "./queries";

export class TablaDeFotosFaltante extends Error {
  constructor() {
    super("Falta el SQL de la foto del margen (scripts/sql/2026-10-17-foto-del-margen.sql): la foto no se puede guardar.");
    this.name = "TablaDeFotosFaltante";
  }
}

export class FotoNoValida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FotoNoValida";
  }
}

export type ResultadoDeLaFoto =
  | { estado: "tomada" | "reemplazada"; mes: string; cuentas: number; foto: { mes: FotoDelMes; cuentas: FotoDeCuenta[] } }
  | { estado: "ya-estaba"; mes: string; tomadaAt: Date; tomadaPor: string };

export interface OpcionesDeLaFoto {
  /** Correo de quien la toma, o «sistema». */
  por: string;
  /** Volver a tomarla si el mes ya la tiene. Pide `motivo`. */
  reemplazar?: boolean;
  motivo?: string | null;
  ahora?: Date;
  /** Solo arma la foto, sin escribir (el simulacro del script). */
  enSeco?: boolean;
}

/** Arma la foto de un mes cerrado y, salvo `enSeco`, la guarda. */
export async function tomarFotoDelMes(mes: string, o: OpcionesDeLaFoto): Promise<ResultadoDeLaFoto> {
  const ahora = o.ahora ?? new Date();
  if (!esMesCerrado(mes, ahora)) throw new FotoNoValida(`${mes} no es un mes cerrado: solo un mes que ya terminó tiene foto.`);
  const motivo = o.motivo?.trim() || null;
  if (o.reemplazar && !motivo) throw new FotoNoValida("Para volver a tomar la foto de un mes, escribe por qué.");
  if (!modeloDisponible(prisma.fotoMargenMes)) throw new TablaDeFotosFaltante();

  let previa: { id: string; tomadaAt: Date; tomadaPor: string } | null;
  try {
    previa = await prisma.fotoMargenMes.findUnique({ where: { mes }, select: { id: true, tomadaAt: true, tomadaPor: true } });
  } catch (e) {
    if (esquemaDesactualizado(e)) throw new TablaDeFotosFaltante();
    throw e;
  }
  if (previa && !o.reemplazar) return { estado: "ya-estaba", mes, tomadaAt: previa.tomadaAt, tomadaPor: previa.tomadaPor };

  const datos = await cargarRentabilidadDelRango(rangoDelMes(mes), ahora);
  const foto = armarFoto(mes, datos);
  if (o.enSeco) return { estado: previa ? "reemplazada" : "tomada", mes, cuentas: foto.cuentas.length, foto };

  const m = foto.mes;
  const delMes = {
    version: m.version,
    tomadaPor: o.por,
    tomadaAt: ahora,
    motivo: previa ? motivo : null,
    planilla: m.planilla,
    ingreso: m.ingreso,
    horasPagadas: m.horasPagadas,
    horasConClientes: m.horasConClientes,
    horasCalendario: m.horasCalendario,
    horasRespondidas: m.horasRespondidas,
    horasEstimadas: m.horasEstimadas,
    horasSinMeet: m.horasSinMeet,
    horasTareas: m.horasTareas,
    horasTareasEstimadas: m.horasTareasEstimadas,
    horasPorSesion: m.horasPorSesion,
    costoHoraDirecto: m.costoHoraDirecto,
    costoHoraCargado: m.costoHoraCargado,
    preparacionMin: m.preparacionMin,
    supuestos: m.supuestos,
    tasa: m.tasa ?? Prisma.DbNull,
    costos: m.costos as object,
    personas: m.personas as object,
    avisos: m.avisos,
  };
  await prisma.$transaction(async (tx) => {
    const fila = await tx.fotoMargenMes.upsert({ where: { mes }, create: { mes, ...delMes }, update: delMes, select: { id: true } });
    await tx.fotoMargenCuenta.deleteMany({ where: { mes } });
    if (foto.cuentas.length) {
      await tx.fotoMargenCuenta.createMany({
        data: foto.cuentas.map((c) => ({ ...c, fotoId: fila.id, porPersona: c.porPersona as object })),
      });
    }
  });
  return { estado: previa ? "reemplazada" : "tomada", mes, cuentas: foto.cuentas.length, foto };
}
