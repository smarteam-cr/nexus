/**
 * /api/business-cases/modulos — la biblioteca de módulos de las propuestas.
 *
 *   GET  → los módulos vivos (no archivados), los usados hace poco primero.
 *   POST { businessCaseId, sectionId, nombre, descripcion?, confirmarAvisos? }
 *        → guarda una sección PERSONALIZADA como módulo. Si sus textos nombran a la empresa de esa
 *          propuesta (o traen correos, teléfonos, montos) y no viene `confirmarAvisos`, responde 409
 *          con lo encontrado: un módulo no lleva datos del cliente original sin avisar.
 *
 * Gate: el área de Ventas (`guardSalesAccess`), el mismo que crear secciones en una propuesta.
 * Ver DECISIONS «La biblioteca de módulos de las propuestas».
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { tipoCreable } from "@/lib/landing/catalogo-de-secciones";
import {
  dataParaCopiar,
  hallazgosDelCliente,
  leerHallazgos,
  moduloVacio,
  resumenDeHallazgos,
  textosDelModulo,
  tipoGuardable,
} from "@/lib/landing/modulos-biblioteca";

const SIN_TABLA = "La biblioteca de módulos todavía no está en la base: falta correr scripts/sql/2026-10-18-biblioteca-de-modulos.sql.";

export async function GET() {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  try {
    const filas = await prisma.moduloDePropuesta.findMany({
      where: { archivadoAt: null },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipo: true,
        origenClienteNombre: true,
        avisos: true,
        usos: true,
        creadoPorEmail: true,
        createdAt: true,
      },
    });
    const modulos = filas.map((m) => {
      const avisos = leerHallazgos(m.avisos);
      return {
        ...m,
        avisos,
        resumenDeAvisos: resumenDeHallazgos(avisos),
        tipoNombre: tipoCreable(m.tipo)?.nombre ?? m.tipo,
      };
    });
    return NextResponse.json({ modulos });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ modulos: [], aviso: SIN_TABLA });
    throw e;
  }
}

const guardarSchema = z.object({
  businessCaseId: z.string().min(1),
  sectionId: z.string().min(1),
  nombre: z.string().trim().min(1).max(80),
  descripcion: z.string().trim().max(400).optional(),
  confirmarAvisos: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = guardarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta el nombre del módulo (1 a 80 caracteres)." }, { status: 400 });
  }
  const { businessCaseId, sectionId, nombre, descripcion, confirmarAvisos } = parsed.data;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      key: true,
      canvas: {
        select: {
          businessCaseId: true,
          businessCase: { select: { client: { select: { name: true, emailDomains: true } } } },
        },
      },
      blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, take: 1, select: { data: true } },
    },
  });
  if (!section || section.canvas.businessCaseId !== businessCaseId) {
    return NextResponse.json({ error: "No se encontró esa sección en esta propuesta." }, { status: 404 });
  }
  const tipo = tipoGuardable(section.key);
  if (!tipo) {
    return NextResponse.json(
      { error: "Solo se guardan como módulo las secciones que creaste. Las de la plantilla ya vienen en toda propuesta." },
      { status: 400 },
    );
  }
  const data = dataParaCopiar(section.blocks[0]?.data);
  if (moduloVacio(tipo, data)) {
    return NextResponse.json({ error: "La sección está vacía: no hay nada que guardar." }, { status: 400 });
  }

  const cliente = section.canvas.businessCase?.client;
  const hallazgos = hallazgosDelCliente(textosDelModulo(tipo, data), {
    nombre: cliente?.name,
    dominios: cliente?.emailDomains,
  });
  if (hallazgos.length > 0 && !confirmarAvisos) {
    return NextResponse.json(
      { error: "El módulo trae datos de esta empresa.", hallazgos, resumen: resumenDeHallazgos(hallazgos) },
      { status: 409 },
    );
  }

  try {
    const modulo = await prisma.moduloDePropuesta.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        tipo,
        data: data as Prisma.InputJsonValue,
        origenBusinessCaseId: businessCaseId,
        origenClienteNombre: cliente?.name ?? null,
        avisos: hallazgos as unknown as Prisma.InputJsonValue,
        creadoPorEmail: guard.user.email.toLowerCase(),
      },
      select: { id: true, nombre: true },
    });
    return NextResponse.json({ modulo, avisos: hallazgos }, { status: 201 });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_TABLA }, { status: 503 });
    throw e;
  }
}
