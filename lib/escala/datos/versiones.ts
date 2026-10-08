/**
 * lib/escala/datos/versiones.ts — las versiones de la escala en la base (`EscalaVersion`) y la
 * bitácora de su borrador (`EscalaCambio`).
 *
 * Recibe el cliente de la base como parámetro: lo usan el script (`scripts/escala-datos.ts`,
 * `scripts/publicar-escala.ts`) y, más adelante, la pantalla. Por eso no es `server-only`.
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 * · Una versión publicada no cambia nunca: todo lo que escribe acá filtra `estado: "borrador"`.
 * · Hay un solo borrador a la vez (índice único parcial en el SQL): sale de la última publicada y
 *   lleva la versión que va a ser.
 * · Cada cambio al borrador pasa por `guardarEnElBorrador`: sube la `revision` (si alguien lo
 *   cambió mientras tanto, frena en vez de pisarlo) y anota cada cambio en la bitácora.
 * · Lo que entra al borrador tiene que formar una escala que el lector entiende y decir en su
 *   encabezado la versión del borrador.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { huellaDe } from "@/lib/escala/documento/huella";
import type { Escala } from "@/lib/escala/documento/tipos";
import { cambiosEntre, type CambioDeLaEscala } from "./diferencias";
import { escalaDeLosDatos, generarMarkdown, versionDeLosDatos } from "./generar";
import { importarEscala } from "./importar";
import { compararVersiones, FORMA_DE_VERSION, type OrigenDelCambio } from "./reglas";
import { FORMATO_DE_LOS_DATOS, type EscalaDatos } from "./tipos";

type Db = PrismaClient | Prisma.TransactionClient;

/** Algo que no se puede hacer con el borrador, dicho para quien lo pidió. */
export class ErrorDelBorrador extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorDelBorrador";
  }
}

const SIN_LOS_DATOS = { id: true, version: true, estado: true, formato: true, huella: true, basadaEn: true, revision: true, publicadaEn: true } as const;

export type ResumenDeVersion = Prisma.EscalaVersionGetPayload<{ select: typeof SIN_LOS_DATOS }>;
export type VersionConDatos = ResumenDeVersion & { datos: EscalaDatos };

// ── Los datos ─────────────────────────────────────────────────────────────────

/** Los datos de una fila, si este código sabe leer su formato. */
export function datosDeLaFila(fila: { version: string; formato: number; datos: unknown }): EscalaDatos {
  if (fila.formato !== FORMATO_DE_LOS_DATOS) {
    throw new ErrorDelBorrador(`La ${fila.version} se guardó con el formato ${fila.formato} y este Nexus lee el ${FORMATO_DE_LOS_DATOS}: hace falta un deploy.`);
  }
  return fila.datos as EscalaDatos;
}

export function huellaDeLosDatos(datos: EscalaDatos): string {
  return huellaDe(generarMarkdown(datos));
}

/** Los mismos datos con otra versión en el encabezado. */
export function conVersion(datos: EscalaDatos, version: string): EscalaDatos {
  if (!datos.encabezado.some((c) => c.clave === "version")) throw new ErrorDelBorrador("Los datos no tienen el campo `version` en el encabezado.");
  return { ...datos, encabezado: datos.encabezado.map((c) => (c.clave === "version" ? { ...c, valor: version } : c)) };
}

/**
 * Que unos datos formen una escala que el lector entiende y digan la versión esperada. Devuelve la
 * escala leída (lo que van a ver las pantallas).
 */
export function revisarDatos(datos: EscalaDatos, version: string): Escala {
  const dice = versionDeLosDatos(datos);
  if (dice !== version) throw new ErrorDelBorrador(`El encabezado dice la versión ${dice ?? "(ninguna)"} y el borrador es la ${version}.`);
  return escalaDeLosDatos(datos);
}

// ── Leer ──────────────────────────────────────────────────────────────────────

export async function leerBorrador(db: Db): Promise<VersionConDatos | null> {
  const fila = await db.escalaVersion.findFirst({ where: { estado: "borrador" }, select: { ...SIN_LOS_DATOS, datos: true } });
  return fila ? { ...fila, datos: datosDeLaFila(fila) } : null;
}

export async function leerVersion(db: Db, version: string): Promise<VersionConDatos | null> {
  const fila = await db.escalaVersion.findUnique({ where: { version }, select: { ...SIN_LOS_DATOS, datos: true } });
  return fila ? { ...fila, datos: datosDeLaFila(fila) } : null;
}

/** La última versión publicada (la vigente), con sus datos. */
export async function ultimaPublicada(db: Db): Promise<VersionConDatos | null> {
  const fila = await db.escalaVersion.findFirst({
    where: { estado: "publicada" },
    orderBy: { publicadaEn: "desc" },
    select: { ...SIN_LOS_DATOS, datos: true },
  });
  return fila ? { ...fila, datos: datosDeLaFila(fila) } : null;
}

export async function listarVersiones(db: Db): Promise<(ResumenDeVersion & { cambios: number })[]> {
  const filas = await db.escalaVersion.findMany({ select: { ...SIN_LOS_DATOS, _count: { select: { cambios: true } } } });
  return filas
    .map(({ _count, ...f }) => ({ ...f, cambios: _count.cambios }))
    .sort((a, b) => compararVersiones(b.version, a.version));
}

// ── El borrador ───────────────────────────────────────────────────────────────

/** Abre el borrador de la versión `version`, desde la última publicada (o desde `desde`). */
export async function crearBorrador(db: PrismaClient, opts: { version: string; desde?: string | null; por: string | null }): Promise<VersionConDatos> {
  const { version, por } = opts;
  if (!FORMA_DE_VERSION.test(version)) throw new ErrorDelBorrador(`«${version}» no es una versión (tres números: 8.8.0).`);
  const actual = await db.escalaVersion.findFirst({ where: { estado: "borrador" }, select: { version: true } });
  if (actual) throw new ErrorDelBorrador(`Ya hay un borrador abierto: la ${actual.version}. Publícalo o descártalo antes de abrir otro.`);
  const base = opts.desde ? await leerVersion(db, opts.desde) : await ultimaPublicada(db);
  if (!base) throw new ErrorDelBorrador(opts.desde ? `No existe la ${opts.desde}.` : "Todavía no hay ninguna versión publicada como datos: corre primero `migrar`.");
  if (base.estado !== "publicada") throw new ErrorDelBorrador(`La ${base.version} no está publicada.`);
  if (compararVersiones(version, base.version) <= 0) throw new ErrorDelBorrador(`La ${version} tiene que ser posterior a la ${base.version}.`);
  if (await db.escalaVersion.findUnique({ where: { version }, select: { id: true } })) throw new ErrorDelBorrador(`La ${version} ya existe.`);

  const datos = conVersion(base.datos, version);
  revisarDatos(datos, version);
  try {
    const fila = await db.escalaVersion.create({
      data: {
        version,
        estado: "borrador",
        formato: FORMATO_DE_LOS_DATOS,
        datos: datos as unknown as Prisma.InputJsonValue,
        huella: huellaDeLosDatos(datos),
        basadaEn: base.version,
        creadaPorEmail: por,
        actualizadaPorEmail: por,
      },
      select: SIN_LOS_DATOS,
    });
    return { ...fila, datos };
  } catch (e) {
    // Dos aperturas a la vez: el índice único parcial deja pasar una sola.
    if ((e as { code?: string }).code === "P2002") throw new ErrorDelBorrador("Alguien abrió un borrador al mismo tiempo. Vuelve a mirar el estado.");
    throw e;
  }
}

/** Lo que pasaría al importar un `.md` al borrador, sin escribir nada. */
export function prepararImportacion(borrador: VersionConDatos, texto: string): { datos: EscalaDatos; escala: Escala; cambios: CambioDeLaEscala[] } {
  const datos = importarEscala(texto);
  const escala = revisarDatos(datos, borrador.version);
  return { datos, escala, cambios: cambiosEntre(borrador.datos, datos) };
}

/**
 * Guarda datos nuevos en el borrador y anota los cambios en la bitácora, en una transacción. Frena
 * si el borrador cambió desde que se leyó (`revision`), en vez de pisar lo de otro.
 */
export async function guardarEnElBorrador(
  db: PrismaClient,
  opts: {
    borrador: VersionConDatos;
    datos: EscalaDatos;
    cambios: CambioDeLaEscala[];
    origen: OrigenDelCambio;
    por: string;
    nota?: string | null;
    feedbackId?: string | null;
  },
): Promise<{ revision: number; lote: string }> {
  const { borrador, datos, cambios, origen, por } = opts;
  revisarDatos(datos, borrador.version);
  const lote = randomUUID();
  return db.$transaction(async (tx) => {
    const { count } = await tx.escalaVersion.updateMany({
      where: { id: borrador.id, estado: "borrador", revision: borrador.revision },
      data: {
        datos: datos as unknown as Prisma.InputJsonValue,
        huella: huellaDeLosDatos(datos),
        revision: { increment: 1 },
        actualizadaEn: new Date(),
        actualizadaPorEmail: por,
      },
    });
    if (count !== 1) throw new ErrorDelBorrador("El borrador cambió mientras tanto (o ya se publicó). Vuelve a leerlo y repite el cambio.");
    if (cambios.length) {
      await tx.escalaCambio.createMany({
        data: cambios.map((c) => ({
          versionId: borrador.id,
          ...c,
          origen,
          lote: origen === "importacion" ? lote : null,
          nota: opts.nota ?? null,
          feedbackId: opts.feedbackId ?? null,
          autorEmail: por,
        })),
      });
    }
    return { revision: borrador.revision + 1, lote };
  }, { timeout: 30_000 });
}

/** Borra el borrador y su bitácora. Una versión publicada no se borra nunca. */
export async function descartarBorrador(db: Db): Promise<string | null> {
  const borrador = await db.escalaVersion.findFirst({ where: { estado: "borrador" }, select: { id: true, version: true } });
  if (!borrador) return null;
  await db.escalaVersion.deleteMany({ where: { id: borrador.id, estado: "borrador" } });
  return borrador.version;
}

// ── Publicar ──────────────────────────────────────────────────────────────────

/** Congela el borrador como publicada. Dentro de la transacción que publica su `.md`. */
export async function congelarBorrador(tx: Prisma.TransactionClient, opts: { borrador: VersionConDatos; por: string | null; en: Date }): Promise<void> {
  const { count } = await tx.escalaVersion.updateMany({
    where: { id: opts.borrador.id, estado: "borrador", revision: opts.borrador.revision },
    data: { estado: "publicada", publicadaEn: opts.en, publicadaPorEmail: opts.por, actualizadaEn: opts.en },
  });
  if (count !== 1) throw new ErrorDelBorrador("El borrador cambió mientras se publicaba. No se publicó nada: vuelve a correrlo.");
}

/**
 * Guarda como datos una versión que se publicó desde un `.md` (la migración de la 8.7.0, o una
 * publicación sin borrador). La versión no puede existir.
 */
export async function guardarPublicada(
  db: Db,
  opts: { datos: EscalaDatos; por: string | null; en: Date; basadaEn?: string | null },
): Promise<void> {
  const version = versionDeLosDatos(opts.datos);
  if (!version) throw new ErrorDelBorrador("Los datos no dicen su versión.");
  revisarDatos(opts.datos, version);
  await db.escalaVersion.create({
    data: {
      version,
      estado: "publicada",
      formato: FORMATO_DE_LOS_DATOS,
      datos: opts.datos as unknown as Prisma.InputJsonValue,
      huella: huellaDeLosDatos(opts.datos),
      basadaEn: opts.basadaEn ?? null,
      creadaPorEmail: opts.por,
      actualizadaPorEmail: opts.por,
      creadaEn: opts.en,
      actualizadaEn: opts.en,
      publicadaEn: opts.en,
      publicadaPorEmail: opts.por,
    },
  });
}
