/**
 * lib/analizador-venta/reuniones-de-venta-server.ts — las reuniones de venta de cada empresa, para la vista por prospecto
 * (S2, 2026-10-25). SERVIDOR. Solo lectura, sin IA.
 *
 * Una consulta sin traer los textos (la clase sale de `sqlClaseDeTexto`, el predicado único) por las reuniones del
 * periodo con empresa, y la regla de «de venta» (reglas.ts) en memoria; más la expansión de un cliente que alguien
 * analizó a mano. Por cada una: la fecha, quién la vendió (por la
 * invitación del calendario), si tiene transcripción o por qué no (el motivo de T4), y su análisis si lo tiene. No arma
 * contexto para ningún agente: el análisis trae su reunión por el chokepoint (analizar-server.ts).
 * Las canceladas sin nada no entran (`noEsCanceladaSinTextoSql`).
 *
 * Con `completo` (la pieza «Análisis» de la preventa y la tendencia, S5 y S7, 2026-10-27) trae además quién habló (el del
 * análisis o, sin él, calculado), el análisis entero con su confirmación (S4), y atribuye cada reunión
 * por el calendario y por quién habló (lib/analizador-venta/tendencia.ts › `atribuirLaReunion`), nunca por la asistencia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { noEsCanceladaSinTextoSql } from "@/lib/sessions/canceladas";
import { DE_QUIEN_ES } from "@/lib/google/por-que-falta";
import { motivoParaMostrar } from "@/lib/sessions/motivo-sin-texto";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { sqlClaseDeTexto, type ClaseDeTexto } from "@/lib/sessions/tiene-texto";
import { equipoEnLasReuniones } from "@/lib/google/equipo-en-la-reunion";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { reunionesDeLasSesionesDeLaPreventa } from "@/lib/exploraciones/fuentes";

import { leerResultadoGuardado, type Juicio, type ResultadoDelAnalisis } from "./analisis";
import type { QuienHablo } from "./quien-hablo";
import { empresasConPreventaAbierta, quienHabloEnLasReuniones } from "./analizar-server";
import { atribuirLaReunion, delEquipoQueHablo } from "./tendencia";
import { DIAS_PARA_ANALIZAR_SOLA, delEquipoEnLaReunion, porQueNoEsDeVenta, seAnalizaAMano, vendedoresDeLaReunion } from "./reglas";

const DIA_MS = 86_400_000;

export interface ReunionDeVentaVista {
  id: string;
  titulo: string;
  fecha: string;
  vendedores: string[];
  texto: ClaseDeTexto;
  /** Por qué no dejó texto (solo sin texto). */
  motivo: string | null;
  analisis: {
    estado: "PROPUESTO" | "ERROR";
    resumen: string | null;
    quienHablo: QuienHablo | null;
    exploradas: string[];
    sinExplorar: string[];
    error: string | null;
  } | null;
  referencia: boolean;
  /** Solo con `completo`: los correos de los vendedores atribuidos. */
  correos?: string[];
  /** Solo con `completo`: quién habló (el del análisis o calculado); null = sin transcripción. */
  quienHablo?: QuienHablo | null;
  /** Solo con `completo`: el análisis vigente entero, con la revisión de S4. */
  detalle?: DetalleDelAnalisis | null;
}

/** El análisis de una reunión, con lo que le sumó la revisión (S4). */
export interface DetalleDelAnalisis {
  estado: "PROPUESTO" | "ERROR";
  resultado: ResultadoDelAnalisis | null;
  descartados: number;
  error: string | null;
  analizadoAt: string;
  confirmado: { por: string; en: string; nota: string | null } | null;
}

export interface EmpresaConReunionesDeVenta {
  id: string;
  nombre: string;
  kind: string;
  reuniones: ReunionDeVentaVista[];
  conTranscripcion: number;
  analizadas: number;
}

export async function reunionesDeVenta(o: { dias: number; ahora?: Date; clientId?: string | null; completo?: boolean }): Promise<EmpresaConReunionesDeVenta[]> {
  const ahora = o.ahora ?? new Date();
  const desde = new Date(+ahora - o.dias * DIA_MS);
  const [filas, propios, ventas, equipo] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        title: string;
        date: Date;
        duration: number | null;
        participants: string[];
        organizerEmail: string | null;
        empresaId: string;
        empresa: string;
        kind: string;
        clase: ClaseDeTexto;
        enrichedAt: Date | null;
        enrichAttempts: number;
        enrichError: string | null;
        googleDocId: string | null;
        canceladaEn: Date | null;
        motivoSinTexto: string | null;
        tieneNotas: boolean;
      }[]
    >`
      SELECT s."id", s."title", s."date", s."duration", s."participants", s."organizerEmail",
        c."id" AS "empresaId", c."name" AS "empresa", c."kind"::text AS "kind",
        ${sqlClaseDeTexto("s")} AS "clase",
        s."enrichedAt", s."enrichAttempts", s."enrichError", s."googleDocId", s."canceladaEn", s."motivoSinTexto",
        coalesce(jsonb_typeof(s."summary") = 'object' AND coalesce(btrim(s."summary"->>'overview'), '') <> '', false) AS "tieneNotas"
      FROM "FirefliesSession" s
      JOIN "Client" c ON c."id" = coalesce(s."resolvedClientId", s."manualClientId")
      WHERE s."date" >= ${desde} AND s."date" <= ${ahora}
        AND c."kind" IN ('PROSPECTO', 'CLIENTE')
        AND (${o.clientId ?? null}::text IS NULL OR c."id" = ${o.clientId ?? null})
        AND ${noEsCanceladaSinTextoSql("s")}
      ORDER BY s."date" DESC`,
    dominiosDeLaCasa(),
    salesPresenceEmails(),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
  ]);
  const nombreDe = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  const conPreventa = await empresasConPreventaAbierta(filas.filter((f) => f.kind === "CLIENTE").map((f) => f.empresaId));

  const candidatas = filas
    .map((f) => {
      const delEquipo = delEquipoEnLaReunion({ organizador: f.organizerEmail, participantes: f.participants ?? [] }, propios);
      const puertasAdentro = esReunionDePuertasAdentro({ participants: f.participants ?? [], organizerEmail: f.organizerEmail }, propios);
      return { f, delEquipo, porQueNo: porQueNoEsDeVenta({ kind: f.kind, puertasAdentro, conVentas: delEquipo.some((e) => ventas.has(e)), conPreventa: conPreventa.has(f.empresaId) }) };
    })
    .filter((x) => seAnalizaAMano(x.porQueNo));
  if (!candidatas.length) return [];

  // Las de venta, más la expansión de un cliente que alguien analizó a mano.
  const aMano = candidatas.filter((x) => x.porQueNo).map((x) => x.f.id);
  const conAnalisis = new Set(
    (aMano.length ? await prisma.analisisDeVenta.findMany({ where: { sessionId: { in: aMano } }, select: { sessionId: true } }).catch(() => []) : []).map((a) => a.sessionId),
  );
  const deVenta = candidatas.filter((x) => !x.porQueNo || conAnalisis.has(x.f.id));
  if (!deVenta.length) return [];

  const ids = deVenta.map((x) => x.f.id);
  const [analisis, referencias] = await Promise.all([
    prisma.analisisDeVenta
      .findMany({
        where: { sessionId: { in: ids } },
        select: {
          sessionId: true,
          clientId: true,
          estado: true,
          resultado: true,
          quienHablo: true,
          error: true,
          ...(o.completo ? { descartados: true, analizadoAt: true, confirmadoPor: true, confirmadoAt: true, notaDeConfirmacion: true } : {}),
        },
      })
      .catch((e: unknown) => {
        // La pantalla (completo) dice «falta el SQL» en vez de mostrar todo «sin analizar» y ofrecer gastar IA de más.
        if (o.completo && esquemaDesactualizado(e)) throw e;
        return [];
      }),
    prisma.reunionDeReferenciaDeVenta.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true } }).catch(() => []),
  ]);
  const analisisDe = new Map(analisis.map((a) => [a.sessionId, a]));
  const esReferencia = new Set(referencias.map((r) => r.sessionId));

  // Con `completo`: quién habló donde no lo guardó un análisis, y quién de la invitación la rechazó (T7, del calendario).
  const vigenteDe = (id: string, empresaId: string) => {
    const a = analisisDe.get(id);
    return a && a.clientId === empresaId ? a : null;
  };
  const sinQuien = o.completo ? deVenta.filter((x) => x.f.clase === "transcripcion" && !vigenteDe(x.f.id, x.f.empresaId)?.quienHablo).map((x) => x.f.id) : [];
  const [calculado, equipoT7] = o.completo
    ? await Promise.all([quienHabloEnLasReuniones(sinQuien), equipoEnLasReuniones(ids, (c) => propios.has(c.split("@")[1] ?? ""))])
    : [new Map<string, QuienHablo>(), new Map<string, { correo: string; respuesta: string | null }[]>()];

  const porEmpresa = new Map<string, EmpresaConReunionesDeVenta>();
  for (const { f, delEquipo } of deVenta) {
    // Un análisis hecho cuando la reunión era de otra empresa no se muestra (INV57 lo reclama).
    const vigente = vigenteDe(f.id, f.empresaId);
    const resultado = vigente ? leerResultadoGuardado(vigente.resultado) : null;
    const exploracion = (resultado?.juicios ?? []).filter((j: Juicio) => j.punto === "exploracion" && j.dimension);
    const motivo =
      f.clase === "nada"
        ? DE_QUIEN_ES[
            motivoParaMostrar(
              f.motivoSinTexto,
              { date: f.date, duration: f.duration, enrichedAt: f.enrichedAt, enrichAttempts: f.enrichAttempts, enrichError: f.enrichError, googleDocId: f.googleDocId, organizerEmail: f.organizerEmail, participants: f.participants ?? [], tieneNotas: f.tieneNotas, canceladaEn: f.canceladaEn },
              ahora,
            )
          ].texto
        : null;
    const quien = o.completo ? ((vigente?.quienHablo as unknown as QuienHablo | null) ?? calculado.get(f.id) ?? null) : undefined;
    const correos = o.completo
      ? vendedoresDeLaReunion(
          atribuirLaReunion({
            calendario: delEquipo,
            rechazaron: new Set((equipoT7.get(f.id) ?? []).filter((x) => x.respuesta === "RECHAZO").map((x) => x.correo)),
            hablaron: delEquipoQueHablo(quien ?? null),
          }),
          ventas,
        )
      : vendedoresDeLaReunion(delEquipo, ventas);
    const vista: ReunionDeVentaVista = {
      id: f.id,
      titulo: f.title,
      fecha: f.date.toISOString(),
      vendedores: correos.map((e) => nombreDe.get(e) ?? e),
      texto: f.clase,
      motivo,
      analisis: vigente
        ? {
            estado: vigente.estado,
            resumen: resultado?.resumen ?? null,
            quienHablo: (vigente.quienHablo as unknown as QuienHablo | null) ?? null,
            exploradas: exploracion.filter((j) => j.valor !== "sin_explorar").map((j) => j.dimension!),
            sinExplorar: exploracion.filter((j) => j.valor === "sin_explorar").map((j) => j.dimension!),
            error: vigente.error,
          }
        : null,
      referencia: esReferencia.has(f.id),
      ...(o.completo ? { correos, quienHablo: quien ?? null, detalle: vigente ? detalleDe(vigente, resultado) : null } : {}),
    };
    const g = porEmpresa.get(f.empresaId) ?? { id: f.empresaId, nombre: f.empresa, kind: f.kind, reuniones: [], conTranscripcion: 0, analizadas: 0 };
    g.reuniones.push(vista);
    if (f.clase === "transcripcion") g.conTranscripcion++;
    if (vista.analisis?.estado === "PROPUESTO") g.analizadas++;
    porEmpresa.set(f.empresaId, g);
  }
  // Primero la empresa con la reunión más reciente.
  return [...porEmpresa.values()].sort((a, b) => b.reuniones[0].fecha.localeCompare(a.reuniones[0].fecha));
}

/** El análisis guardado, con su revisión, leído tolerante (sin las columnas de S4, como si no tuviera revisión). */
function detalleDe(
  a: {
    estado: "PROPUESTO" | "ERROR";
    error: string | null;
    descartados?: number;
    analizadoAt?: Date;
    confirmadoPor?: string | null;
    confirmadoAt?: Date | null;
    notaDeConfirmacion?: string | null;
  },
  resultado: ResultadoDelAnalisis | null,
): DetalleDelAnalisis {
  return {
    estado: a.estado,
    resultado,
    descartados: a.descartados ?? 0,
    error: a.error,
    analizadoAt: (a.analizadoAt ?? new Date(0)).toISOString(),
    confirmado: a.confirmadoPor && a.confirmadoAt ? { por: a.confirmadoPor, en: a.confirmadoAt.toISOString(), nota: a.notaDeConfirmacion ?? null } : null,
  };
}

/**
 * Las reuniones de venta de los últimos `DIAS_PARA_ANALIZAR_SOLA` días con transcripción y sin análisis que son la sesión
 * de una exploración abierta de la preventa, de la más vieja a la más nueva: las que el job `analizador-venta` analiza
 * solo. Una reunión de venta que no está en ninguna exploración no se analiza sola (Elías, 2026-10-27): se analiza a
 * mano. Una que terminó en error no se reintenta sola (se reintenta a mano).
 */
export async function reunionesPorAnalizar(ahora: Date, limite: number): Promise<string[]> {
  const empresas = (await reunionesDeVenta({ dias: DIAS_PARA_ANALIZAR_SOLA, ahora }))
    .map((e) => ({ id: e.id, reuniones: e.reuniones.filter((r) => r.texto === "transcripcion" && !r.analisis) }))
    .filter((e) => e.reuniones.length);
  if (!empresas.length) return [];
  // Cada reunión, contra las exploraciones de SU empresa.
  const deLaPreventa = new Set<string>();
  for (const e of empresas) {
    for (const id of await reunionesDeLasSesionesDeLaPreventa(e.id, e.reuniones.map((r) => r.id), ahora)) deLaPreventa.add(id);
  }
  return empresas
    .flatMap((e) => e.reuniones)
    .filter((r) => deLaPreventa.has(r.id))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, limite)
    .map((r) => r.id);
}
