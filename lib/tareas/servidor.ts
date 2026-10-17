/**
 * lib/tareas/servidor.ts — piezas compartidas del lado del servidor de Tareas internas. SERVIDOR.
 *
 * - `tareasDisponible()`: sin el SQL (o con el cliente Prisma de antes), la página muestra un Alert que nombra el
 *   archivo y las rutas responden 503. Nada revienta con un 500. ⚠ Mira las DOS puntas: que el cliente conozca los
 *   modelos Y que la base tenga las tablas. Hasta el 2026-10-09 miraba solo el cliente, y el `dev:prod` (cliente
 *   regenerado contra la base de producción, todavía sin el SQL) reventaba con P2021 en vez de mostrar el aviso.
 * - `contextoDeTareas(...)`: QUIÉN pide, armado una vez por pedido: su equipo de casa, los equipos que lidera, si es
 *   Super Admin y el equipo entero (activo, sin la cuenta de prueba).
 */
import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { SQL_DE_TAREAS } from "./estados";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { Prisma, type TeamMember } from "@prisma/client";
import { claveDeEquipo, equiposQueLidera, type MiembroDelEquipo } from "./equipos";
import type { Quien } from "./estados";
import type { CuentasQueVe } from "./visibilidad";
import { cuentasParaVerTareas } from "./clientes";

export { SQL_DE_TAREAS };

/** Las 13 tablas que crea el SQL de Tareas (los nombres son los de los modelos: el esquema no usa `@@map`). */
export const TABLAS_DE_TAREAS = [
  "EspacioDeTareas",
  "MiembroDeEspacio",
  "ProyectoDeTareas",
  "PlantillaDeTareas",
  "Tarea",
  "TareaRelacion",
  "TareaComentario",
  "TareaVinculo",
  "TareaEvento",
  "ResultadoDeSemana",
  "CierreDeSemana",
  "LecturaDeReunion",
  "FuenteDeTareas",
] as const;

/** Cuántas de estas tablas existen en `public` (una consulta al catálogo; una que falta no lanza, cuenta 0). */
export async function cuantasTablasHay(nombres: readonly string[]): Promise<number> {
  const filas = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM unnest(${[...nombres]}::text[]) AS t(nombre)
    WHERE to_regclass(format('public.%I', t.nombre)) IS NOT NULL`;
  return Number(filas[0]?.n ?? 0);
}

/** Las columnas que se sumaron a las tablas de Tareas después del primer SQL: [tabla, columna]. */
export const COLUMNAS_POSTERIORES = [["Tarea", "contexto"]] as const;

/** Cuántas de estas columnas existen (una que falta, o cuya tabla falta, cuenta 0). */
export async function cuantasColumnasHay(columnas: readonly (readonly [string, string])[]): Promise<number> {
  const filas = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM unnest(${columnas.map(([t]) => t)}::text[], ${columnas.map(([, c]) => c)}::text[]) AS x(tabla, columna)
    JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = x.tabla AND c.column_name = x.columna`;
  return Number(filas[0]?.n ?? 0);
}

/** Sin las tablas, se vuelve a mirar como mucho cada 30 s: correr el SQL lo pone en verde solo, sin reiniciar. */
const REMIRAR_SIN_TABLAS_MS = 30_000;
let tablasMiradas: { ok: boolean; en: number } | null = null;
let mirandoTablas: Promise<boolean> | null = null;

/**
 * ¿La base tiene las 13 tablas y las columnas que se sumaron después? Dos consultas al catálogo, guardadas: en verde no se vuelve a preguntar en toda la vida
 * del proceso (el esquema solo crece), y nunca hay dos en vuelo. Si la consulta falla (red, pooler) NO se afirma que
 * falte nada y no se guarda: la consulta de la pantalla dirá lo suyo, y `siFaltaElSql` atrapa la tabla que falta.
 */
async function tablasEnLaBase(): Promise<boolean> {
  if (tablasMiradas?.ok) return true;
  if (tablasMiradas && performance.now() - tablasMiradas.en < REMIRAR_SIN_TABLAS_MS) return false;
  mirandoTablas ??= (async () => {
    try {
      const ok =
        (await cuantasTablasHay(TABLAS_DE_TAREAS)) === TABLAS_DE_TAREAS.length &&
        (await cuantasColumnasHay(COLUMNAS_POSTERIORES)) === COLUMNAS_POSTERIORES.length;
      tablasMiradas = { ok, en: performance.now() };
      return ok;
    } catch {
      return true;
    } finally {
      mirandoTablas = null;
    }
  })();
  return mirandoTablas;
}

/**
 * El cliente de Prisma conoce los modelos Y las columnas que se sumaron después (un dev server con el cliente de antes
 * no las tiene: sin esto, la columna nueva da un PrismaClientValidationError —sin código— y la pantalla un 500).
 */
function modelosEnElCliente(): boolean {
  const campos = Prisma as unknown as Record<string, Record<string, string> | undefined>;
  return (
    modeloDisponible(prisma.tarea) &&
    modeloDisponible(prisma.espacioDeTareas) &&
    modeloDisponible(prisma.lecturaDeReunion) &&
    modeloDisponible(prisma.resultadoDeSemana) &&
    COLUMNAS_POSTERIORES.every(([tabla, columna]) => columna in (campos[`${tabla}ScalarFieldEnum`] ?? {}))
  );
}

export async function tareasDisponible(): Promise<boolean> {
  return modelosEnElCliente() && (await tablasEnLaBase());
}

/** Para los tests: olvida lo mirado. */
export function olvidarTablasMiradas(): void {
  tablasMiradas = null;
  mirandoTablas = null;
}

export class ErrorDeTareas extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** El equipo activo de Smarteam, sin bajas ni la cuenta de prueba. Una lectura por pedido. */
export const miembrosActivos = cache(async (): Promise<MiembroDelEquipo[]> => {
  const filas = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { email: true, name: true, area: true, roleEnum: true, lideraEquipos: true },
    orderBy: { name: "asc" },
  });
  return filas
    .filter((m) => !esCuentaDePrueba(m.name))
    .map((m) => ({ email: m.email.toLowerCase(), nombre: m.name, area: m.area, roleEnum: m.roleEnum, lideraEquipos: m.lideraEquipos }));
});

export interface ContextoDeTareas extends Quien {
  nombre: string;
  rol: string;
  /** El sprint de casa de quien pide. */
  equipo: string;
  miembros: MiembroDelEquipo[];
  /** Los miembros de su propio sprint (incluida la persona). */
  companeros: MiembroDelEquipo[];
  /** Las cuentas cuyas tareas ve, de cualquier equipo (la regla de las cuentas de visibilidad.ts). */
  cuentas: CuentasQueVe;
}

/** Quién pide, con su sprint de casa, lo que lidera y el equipo entero. */
export async function contextoDeTareas(
  user: AppUserWithTeamMember | { teamMember: TeamMember | null; email?: string },
): Promise<ContextoDeTareas> {
  const tm = user.teamMember;
  if (!tm) throw new ErrorDeTareas(403, "Tu cuenta no tiene un miembro del equipo.");
  const email = tm.email.toLowerCase();
  const [todos, cuentas] = await Promise.all([miembrosActivos(), cuentasParaVerTareas(tm)]);
  const yo: MiembroDelEquipo = { email, nombre: tm.name, area: tm.area, roleEnum: tm.roleEnum, lideraEquipos: tm.lideraEquipos };
  const miembros = todos.some((m) => m.email === email) ? todos : [...todos, yo];
  const equipo = claveDeEquipo(tm.area, email);
  return {
    email,
    nombre: tm.name,
    rol: tm.roleEnum,
    esSuperAdmin: tm.roleEnum === "SUPER_ADMIN",
    lidera: equiposQueLidera(yo),
    equipo,
    miembros,
    companeros: miembros.filter((m) => claveDeEquipo(m.area, m.email) === equipo),
    cuentas,
  };
}

/** El sprint de casa de una persona por su correo (null si no es del equipo activo). */
export function equipoDe(email: string, miembros: readonly MiembroDelEquipo[]): string | null {
  const m = miembros.find((x) => x.email === email.toLowerCase());
  return m ? claveDeEquipo(m.area, m.email) : null;
}

/** Los líderes de un sprint: quienes lo tienen en `lideraEquipos` (pueden no ser de esa área). */
export function lideresDe(equipo: string, miembros: readonly MiembroDelEquipo[]): MiembroDelEquipo[] {
  return miembros.filter((m) => equiposQueLidera(m).includes(equipo));
}

export function nombreDe(email: string | null | undefined, miembros: readonly MiembroDelEquipo[]): string | null {
  if (!email) return null;
  return miembros.find((m) => m.email === email.toLowerCase())?.nombre ?? email;
}
