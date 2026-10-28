/**
 * lib/tests-diagnostico/repositorio-server.ts — el ÚNICO que lee y escribe "PreguntasDelTest" e "IntentoDelTest" (área O,
 * 2026-10-26). SERVIDOR.
 *
 * Va por SQL y no por el cliente de Prisma a propósito: el test es una página pública que no puede caerse por un cliente
 * generado antes de las tablas, y sin el SQL (scripts/sql/2026-10-26-tests-diagnostico.sql) tiene que decir «todavía no
 * está abierto» (`ErrorSinTablas`) en vez de un 500. Los Json se leen SIEMPRE con los lectores tolerantes de ./tipos.ts.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { EDICION_GENERAL, leerPreguntasDelBanco, leerRespuestasDelTest, SLUG_POR_AREA, type PreguntaDelBanco, type RespuestasDelTest, type VersionDelTest } from "./tipos";
import type { ResultadoDelTest } from "./resultado";

export const SQL_DE_LOS_TESTS = "scripts/sql/2026-10-26-tests-diagnostico.sql";

export class ErrorSinTablas extends Error {
  constructor() {
    super(`Falta aplicar ${SQL_DE_LOS_TESTS}.`);
  }
}

/** ¿El error es que las tablas todavía no existen? */
export function faltanLasTablas(e: unknown): boolean {
  if (esquemaDesactualizado(e)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /42P01|relation "(PreguntasDelTest|IntentoDelTest)" does not exist/i.test(msg);
}

async function conTablas<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (faltanLasTablas(e)) throw new ErrorSinTablas();
    throw e;
  }
}

const nuevoId = () => `c${randomBytes(12).toString("hex")}`;
/** El token público: 256 bits, en base64url. */
export const nuevoToken = () => randomBytes(32).toString("base64url");
const json = (v: unknown) => JSON.stringify(v ?? null);

// ── El banco ──────────────────────────────────────────────────────────────────

export interface BancoGuardado {
  id: string;
  area: string;
  version: VersionDelTest;
  edicion: string;
  escalaVersion: string;
  preguntas: PreguntaDelBanco[];
  aprobadas: PreguntaDelBanco[] | null;
  editadoPor: string | null;
  aprobadoPor: string | null;
  aprobadoAt: string | null;
  updatedAt: string;
}

type FilaDelBanco = {
  id: string;
  area: string;
  version: string;
  edicion: string;
  escalaVersion: string;
  preguntas: unknown;
  aprobadas: unknown;
  editadoPor: string | null;
  aprobadoPor: string | null;
  aprobadoAt: Date | null;
  updatedAt: Date;
};

const aBanco = (f: FilaDelBanco): BancoGuardado => ({
  id: f.id,
  area: f.area,
  version: f.version as VersionDelTest,
  edicion: f.edicion,
  escalaVersion: f.escalaVersion,
  preguntas: leerPreguntasDelBanco(f.preguntas),
  aprobadas: f.aprobadas == null ? null : leerPreguntasDelBanco(f.aprobadas),
  editadoPor: f.editadoPor,
  aprobadoPor: f.aprobadoPor,
  aprobadoAt: f.aprobadoAt ? f.aprobadoAt.toISOString() : null,
  updatedAt: f.updatedAt.toISOString(),
});

export function listarBancos(): Promise<BancoGuardado[]> {
  return conTablas(async () =>
    (
      await prisma.$queryRaw<FilaDelBanco[]>`
        SELECT * FROM "PreguntasDelTest" ORDER BY "area", "version", ("edicion" <> ${EDICION_GENERAL}), "edicion"`
    ).map(aBanco),
  );
}

export function leerBanco(id: string): Promise<BancoGuardado | null> {
  return conTablas(async () => {
    const [f] = await prisma.$queryRaw<FilaDelBanco[]>`SELECT * FROM "PreguntasDelTest" WHERE "id" = ${id}`;
    return f ? aBanco(f) : null;
  });
}

/** Crea los borradores que falten (los que ya existen no se tocan). Devuelve cuántos creó. */
export function crearBorradores(
  filas: readonly { area: string; version: VersionDelTest; edicion: string; escalaVersion: string; preguntas: PreguntaDelBanco[] }[],
  por: string | null,
): Promise<number> {
  return conTablas(async () => {
    let n = 0;
    for (const f of filas) {
      n += await prisma.$executeRaw`
        INSERT INTO "PreguntasDelTest" ("id", "area", "version", "edicion", "escalaVersion", "preguntas", "editadoPor")
        VALUES (${nuevoId()}, ${f.area}, ${f.version}, ${f.edicion}, ${f.escalaVersion}, ${json(leerPreguntasDelBanco(f.preguntas))}::jsonb, ${por})
        ON CONFLICT ("area", "version", "edicion") DO NOTHING`;
    }
    return n;
  });
}

/** Guarda el borrador. No toca lo aprobado: el público sigue viendo la versión aprobada hasta que se apruebe la nueva. */
export function guardarBorrador(id: string, preguntas: PreguntaDelBanco[], por: string | null): Promise<boolean> {
  return conTablas(async () => {
    // Se guarda tal como se lee (textos recortados, topes): así lo aprobado es exactamente lo que se revisó.
    const n = await prisma.$executeRaw`
      UPDATE "PreguntasDelTest" SET "preguntas" = ${json(leerPreguntasDelBanco(preguntas))}::jsonb, "editadoPor" = ${por}, "updatedAt" = NOW()
      WHERE "id" = ${id}`;
    return n > 0;
  });
}

/**
 * Reemplaza el borrador SOLO si sigue siendo `antes` (el que se leyó): si una persona lo editó en el medio, no lo pisa
 * (false). Lo usa el script que rearma los bancos de una escala nueva.
 */
export function reemplazarBorrador(id: string, antes: readonly PreguntaDelBanco[], nuevas: readonly PreguntaDelBanco[], por: string): Promise<boolean> {
  return conTablas(async () => {
    const n = await prisma.$executeRaw`
      UPDATE "PreguntasDelTest" SET "preguntas" = ${json(leerPreguntasDelBanco(nuevas))}::jsonb, "editadoPor" = ${por}, "updatedAt" = NOW()
      WHERE "id" = ${id} AND "preguntas" = ${json(antes)}::jsonb`;
    return n > 0;
  });
}

/**
 * Aprueba el borrador que se revisó: pasa a ser lo que ve el público. Solo si el borrador sigue siendo ese (si alguien lo
 * editó entre la revisión y la aprobación, no se aprueba nada: false).
 */
export function aprobarBanco(id: string, revisadas: readonly PreguntaDelBanco[], escalaVersion: string, por: string): Promise<boolean> {
  return conTablas(async () => {
    const n = await prisma.$executeRaw`
      UPDATE "PreguntasDelTest"
      SET "aprobadas" = "preguntas", "escalaVersion" = ${escalaVersion}, "aprobadoPor" = ${por}, "aprobadoAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${id} AND "preguntas" = ${json(revisadas)}::jsonb`;
    return n > 0;
  });
}

/**
 * Las preguntas APROBADAS de una (área, versión) para la edición de la industria; si esa edición no tiene aprobadas, las
 * de la escala general. null = ninguna aprobada: el test de esa área todavía no se abre.
 */
export function aprobadasPara(area: string, version: VersionDelTest, edicion: string | null): Promise<{ banco: BancoGuardado; preguntas: PreguntaDelBanco[] } | null> {
  return conTablas(async () => {
    const filas = await prisma.$queryRaw<FilaDelBanco[]>`
      SELECT * FROM "PreguntasDelTest"
      WHERE "area" = ${area} AND "version" = ${version} AND "aprobadas" IS NOT NULL
        AND "edicion" IN (${edicion ?? EDICION_GENERAL}, ${EDICION_GENERAL})`;
    const bancos = filas.map(aBanco).filter((b) => (b.aprobadas?.length ?? 0) > 0);
    const elegido = bancos.find((b) => b.edicion === (edicion ?? EDICION_GENERAL)) ?? bancos.find((b) => b.edicion === EDICION_GENERAL);
    return elegido ? { banco: elegido, preguntas: elegido.aprobadas! } : null;
  });
}

/** Los slugs de las áreas con preguntas aprobadas de la general para esta versión: las que la portada deja elegir. */
export async function areasAbiertas(version: VersionDelTest): Promise<string[]> {
  const ids = Object.keys(SLUG_POR_AREA);
  const abiertas = await Promise.all(ids.map((id) => aprobadasPara(id, version, null).catch(() => null)));
  return ids.filter((_, i) => abiertas[i]).map((id) => SLUG_POR_AREA[id]);
}

// ── Los intentos ──────────────────────────────────────────────────────────────

/** Una pregunta tal como la vio la persona: la del banco, con ids opacos para ella. */
export interface PreguntaDelIntento extends PreguntaDelBanco {
  /** El id opaco que vio la persona (el `id` del banco nunca sale). */
  publico: string;
  opcionesPublicas: Record<string, string>;
  /** El nombre del paso y de su capa en la barra de avance (desde el 2026-10-28; los de antes no lo traen). */
  paso?: string;
  capa?: string | null;
}

export interface Persona {
  nombre: string;
  email: string;
  telefono: string | null;
  puesto: string | null;
  empresa: string | null;
  dominio: string | null;
  industria: string | null;
}

export interface Intento extends Persona {
  id: string;
  token: string;
  area: string;
  version: VersionDelTest;
  edicion: string | null;
  escalaVersion: string;
  preguntas: PreguntaDelIntento[];
  respuestas: RespuestasDelTest;
  paso: number;
  estado: "en_curso" | "terminado" | "abandonado";
  clientId: string | null;
  resultado: ResultadoDelTest | null;
  url: string | null;
  origen: Record<string, string> | null;
  hubspotFormAt: string | null;
  hubspotNotaAt: string | null;
  hubspotIntentos: number;
  hubspotError: string | null;
  createdAt: string;
  /** La última vez que se movió (cada pregunta guardada lo toca). */
  updatedAt: string;
  terminadoAt: string | null;
}

type FilaDelIntento = Omit<Intento, "preguntas" | "respuestas" | "resultado" | "origen" | "createdAt" | "updatedAt" | "terminadoAt" | "hubspotFormAt" | "hubspotNotaAt" | "version" | "estado"> & {
  version: string;
  estado: string;
  preguntas: unknown;
  respuestas: unknown;
  resultado: unknown;
  origen: unknown;
  hubspotFormAt: Date | null;
  hubspotNotaAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  terminadoAt: Date | null;
};

function leerPreguntasDelIntento(raw: unknown): PreguntaDelIntento[] {
  const base = leerPreguntasDelBanco(raw);
  const crudas = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  return base.flatMap((p) => {
    const c = crudas.find((x) => x && x.id === p.id);
    const publico = typeof c?.publico === "string" ? c.publico : null;
    const op = c?.opcionesPublicas && typeof c.opcionesPublicas === "object" ? (c.opcionesPublicas as Record<string, unknown>) : null;
    if (!publico || !op) return [];
    const opcionesPublicas = Object.fromEntries(Object.entries(op).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    const paso = typeof c?.paso === "string" ? c.paso.slice(0, 120) : undefined;
    const capa = typeof c?.capa === "string" ? c.capa.slice(0, 120) : undefined;
    return [{ ...p, publico, opcionesPublicas, ...(paso ? { paso, capa: capa ?? null } : {}) }];
  });
}

const aIntento = (f: FilaDelIntento): Intento => ({
  ...f,
  version: f.version as VersionDelTest,
  estado: (["en_curso", "terminado", "abandonado"].includes(f.estado) ? f.estado : "en_curso") as Intento["estado"],
  preguntas: leerPreguntasDelIntento(f.preguntas),
  respuestas: leerRespuestasDelTest(f.respuestas),
  resultado: f.resultado && typeof f.resultado === "object" && (f.resultado as { v?: unknown }).v === 1 ? (f.resultado as ResultadoDelTest) : null,
  origen: f.origen && typeof f.origen === "object" ? (f.origen as Record<string, string>) : null,
  hubspotFormAt: f.hubspotFormAt ? f.hubspotFormAt.toISOString() : null,
  hubspotNotaAt: f.hubspotNotaAt ? f.hubspotNotaAt.toISOString() : null,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
  terminadoAt: f.terminadoAt ? f.terminadoAt.toISOString() : null,
});

export function crearIntento(d: {
  area: string;
  version: VersionDelTest;
  edicion: string | null;
  escalaVersion: string;
  preguntas: PreguntaDelIntento[];
  persona: Persona;
  clientId: string | null;
  origen: Record<string, string> | null;
}): Promise<{ id: string; token: string }> {
  return conTablas(async () => {
    const id = nuevoId();
    const token = nuevoToken();
    const p = d.persona;
    await prisma.$executeRaw`
      INSERT INTO "IntentoDelTest" ("id", "token", "area", "version", "edicion", "escalaVersion", "preguntas",
        "nombre", "email", "telefono", "puesto", "empresa", "dominio", "industria", "clientId", "origen")
      VALUES (${id}, ${token}, ${d.area}, ${d.version}, ${d.edicion}, ${d.escalaVersion}, ${json(d.preguntas)}::jsonb,
        ${p.nombre}, ${p.email}, ${p.telefono}, ${p.puesto}, ${p.empresa}, ${p.dominio}, ${p.industria}, ${d.clientId},
        ${d.origen ? json(d.origen) : null}::jsonb)`;
    return { id, token };
  });
}

export function intentoPorToken(token: string): Promise<Intento | null> {
  return conTablas(async () => {
    const [f] = await prisma.$queryRaw<FilaDelIntento[]>`SELECT * FROM "IntentoDelTest" WHERE "token" = ${token}`;
    return f ? aIntento(f) : null;
  });
}

/** Guarda lo elegido hasta ahora y en qué pregunta va. Solo mientras el intento está en curso (o se retomó). */
export function guardarAvance(id: string, respuestas: RespuestasDelTest, paso: number): Promise<boolean> {
  return conTablas(async () => {
    const n = await prisma.$executeRaw`
      UPDATE "IntentoDelTest"
      SET "respuestas" = ${json(respuestas)}::jsonb, "paso" = ${paso}, "estado" = 'en_curso', "updatedAt" = NOW(),
          -- Retomado después de darse por dejado: la nota «SIN TERMINAR» ya no vale; la que sigue la manda al terminar.
          "hubspotNotaAt" = CASE WHEN "estado" = 'abandonado' THEN NULL ELSE "hubspotNotaAt" END
      WHERE "id" = ${id} AND "estado" <> 'terminado'`;
    return n > 0;
  });
}

export function terminarIntento(id: string, d: { respuestas: RespuestasDelTest; paso: number; resultado: ResultadoDelTest; url: string }): Promise<boolean> {
  return conTablas(async () => {
    const n = await prisma.$executeRaw`
      UPDATE "IntentoDelTest"
      SET "respuestas" = ${json(d.respuestas)}::jsonb, "paso" = ${d.paso}, "estado" = 'terminado', "resultado" = ${json(d.resultado)}::jsonb,
          "url" = ${d.url}, "terminadoAt" = NOW(), "updatedAt" = NOW(),
          -- La nota del resultado sale siempre al terminar, aunque antes haya salido la de «SIN TERMINAR».
          "hubspotNotaAt" = NULL, "hubspotIntentos" = 0, "hubspotError" = NULL
      WHERE "id" = ${id} AND "estado" <> 'terminado'`;
    return n > 0;
  });
}

/** Los intentos recientes, para la pantalla interna (los leads por empresa y la medición). */
export function intentosRecientes(desde: Date, limite = 1000): Promise<Intento[]> {
  return conTablas(async () =>
    (
      await prisma.$queryRaw<FilaDelIntento[]>`
        SELECT * FROM "IntentoDelTest" WHERE "createdAt" >= ${desde} ORDER BY "createdAt" DESC LIMIT ${limite}`
    ).map(aIntento),
  );
}

/**
 * Los intentos terminados SIN empresa cuyo correo es de alguno de estos dominios: un prospecto que hizo el test antes de
 * que su empresa llegara a Nexus. Quien llama decide qué dominios son solo de una empresa.
 */
export function intentosTerminadosSinEmpresaDeLosDominios(dominios: readonly string[]): Promise<Intento[]> {
  if (!dominios.length) return Promise.resolve([]);
  return conTablas(async () =>
    (
      await prisma.$queryRaw<FilaDelIntento[]>`
        SELECT * FROM "IntentoDelTest"
        WHERE "clientId" IS NULL AND "estado" = 'terminado' AND lower(split_part("email", '@', 2)) = ANY(${[...dominios]}::text[])
        ORDER BY "terminadoAt" DESC LIMIT 20`
    ).map(aIntento),
  );
}

/** Los intentos terminados de una empresa de Nexus (para la preventa). */
export function intentosTerminadosDeLaEmpresa(clientId: string): Promise<Intento[]> {
  return conTablas(async () =>
    (
      await prisma.$queryRaw<FilaDelIntento[]>`
        SELECT * FROM "IntentoDelTest" WHERE "clientId" = ${clientId} AND "estado" = 'terminado' ORDER BY "terminadoAt" DESC LIMIT 20`
    ).map(aIntento),
  );
}

/** En curso y sin moverse desde `antesDe`: se dejaron a medias. Devuelve cuántos. */
export function marcarAbandonados(antesDe: Date): Promise<number> {
  return conTablas(
    () => prisma.$executeRaw`UPDATE "IntentoDelTest" SET "estado" = 'abandonado' WHERE "estado" = 'en_curso' AND "updatedAt" < ${antesDe}`,
  );
}

/** Lo que falta mandar a HubSpot: el formulario de los que no lo tienen; la nota de los terminados y los abandonados. */
export function pendientesDeHubspot(maxIntentos: number, limite = 50): Promise<Intento[]> {
  return conTablas(async () =>
    (
      await prisma.$queryRaw<FilaDelIntento[]>`
        SELECT * FROM "IntentoDelTest"
        WHERE "hubspotIntentos" < ${maxIntentos}
          AND ("hubspotFormAt" IS NULL OR ("hubspotNotaAt" IS NULL AND "estado" IN ('terminado', 'abandonado')))
        ORDER BY "createdAt" ASC LIMIT ${limite}`
    ).map(aIntento),
  );
}

export function anotarHubspot(id: string, d: { formulario?: boolean; nota?: boolean; error?: string | null }): Promise<void> {
  return conTablas(async () => {
    await prisma.$executeRaw`
      UPDATE "IntentoDelTest"
      SET "hubspotFormAt" = CASE WHEN ${!!d.formulario} THEN COALESCE("hubspotFormAt", NOW()) ELSE "hubspotFormAt" END,
          "hubspotNotaAt" = CASE WHEN ${!!d.nota} THEN COALESCE("hubspotNotaAt", NOW()) ELSE "hubspotNotaAt" END,
          "hubspotIntentos" = "hubspotIntentos" + CASE WHEN ${d.error != null} THEN 1 ELSE 0 END,
          "hubspotError" = ${d.error ?? null}
      WHERE "id" = ${id}`;
  });
}

/** Reintentar desde cero lo de HubSpot (desde la pantalla interna, cuando una persona arregló la causa). */
export function reintentarHubspot(id: string): Promise<void> {
  return conTablas(async () => {
    await prisma.$executeRaw`UPDATE "IntentoDelTest" SET "hubspotIntentos" = 0, "hubspotError" = NULL WHERE "id" = ${id}`;
  });
}


// ── Las visitas (O6 etapa 3) ──────────────────────────────────────────────────
// Su propio SQL (scripts/sql/2026-10-26-visitas-del-test.sql): sin él, el test funciona igual y la medición dice que
// falta, en vez de tumbar la página o la pantalla interna.

const faltaLaTablaDeVisitas = (e: unknown) =>
  esquemaDesactualizado(e) || /42P01|relation "VisitaDelTest" does not exist/i.test(e instanceof Error ? e.message : String(e));

/** Suma una visita a la página del test, en el día de Costa Rica. Sin la tabla, no cuenta y no falla. */
export async function contarVisita(area: string, version: VersionDelTest): Promise<boolean> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "VisitaDelTest" ("dia", "area", "version", "visitas", "updatedAt")
      VALUES ((NOW() AT TIME ZONE 'America/Costa_Rica')::date, ${area}, ${version}, 1, NOW())
      ON CONFLICT ("dia", "area", "version") DO UPDATE SET "visitas" = "VisitaDelTest"."visitas" + 1, "updatedAt" = NOW()`;
    return true;
  } catch (e) {
    if (faltaLaTablaDeVisitas(e)) return false;
    throw e;
  }
}

export interface VisitasDelDia {
  /** AAAA-MM-DD, el día en Costa Rica. */
  dia: string;
  area: string;
  version: VersionDelTest;
  visitas: number;
}

/** Las visitas desde ese día (AAAA-MM-DD). Null si la tabla todavía no existe. */
export async function visitasDesde(dia: string): Promise<VisitasDelDia[] | null> {
  try {
    const filas = await prisma.$queryRaw<{ dia: string; area: string; version: string; visitas: number }[]>`
      SELECT to_char("dia", 'YYYY-MM-DD') AS "dia", "area", "version", "visitas" FROM "VisitaDelTest"
      WHERE "dia" >= ${dia}::date ORDER BY "dia" ASC`;
    return filas.map((f) => ({ dia: f.dia, area: f.area, version: f.version as VersionDelTest, visitas: Number(f.visitas) }));
  } catch (e) {
    if (faltaLaTablaDeVisitas(e)) return null;
    throw e;
  }
}
