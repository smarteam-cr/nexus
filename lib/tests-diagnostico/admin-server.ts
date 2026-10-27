/**
 * lib/tests-diagnostico/admin-server.ts — LA PANTALLA INTERNA del test (`/escala/tests`, área O, 2026-10-26). SERVIDOR.
 *
 *   · Generar los borradores de las preguntas desde la escala vigente: cada área × versión, para la escala general y
 *     cada edición. Los que ya existen no se tocan (lo editado no se pisa).
 *   · Guardar un borrador y APROBARLO. Aprobar revisa las reglas del banco (./banco.ts › `problemasDelBanco`) contra la
 *     escala vista por la edición del banco, y solo aprueba lo que se revisó: si alguien lo cambió en el medio, no.
 *   · Lo que muestra la pantalla: los bancos con su estado y sus problemas, los intentos de los últimos 90 días y, para
 *     la medición (O6 etapa 3), las visitas a cada test y cuántos cuestionarios de la escala (la versión completa) se
 *     armaron, mandaron, contestaron y cerraron en el mismo período. Solo cuentas: la versión completa es de proyectos
 *     de clientes y de ella no sale ningún nombre.
 * Quién: aprobar y editar, los super admin (`puedeEditarLaEscala`); mirar, lo decide cada ruta.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { borradoresDeLaEscala, escalaDelBanco, problemasDelBanco } from "./banco";
import { MINUTOS_PARA_ABANDONO } from "./hubspot-server";
import { dominioDelCorreo } from "./servicio-server";
import {
  diaEnCostaRica,
  estadoDelBanco,
  type EstadoDelBancoEnPantalla,
  type IntentoEnPantalla,
  type MedicionDeLaCompleta,
  type VisitasEnPantalla,
} from "./pantalla";
import {
  aprobarBanco,
  crearBorradores,
  ErrorSinTablas,
  guardarBorrador,
  intentosRecientes,
  leerBanco,
  listarBancos,
  visitasDesde,
  type BancoGuardado,
} from "./repositorio-server";
import { leerPreguntasDelBanco, type PreguntaDelBanco } from "./tipos";

async function escalaVigente(): Promise<Escala | null> {
  const v = await leerEscalaVigente();
  return "escala" in v ? v.escala : null;
}

/** Crea los borradores que falten. Devuelve cuántos creó, o null si no hay escala publicada. */
export async function generarBorradores(por: string): Promise<number | null> {
  const escala = await escalaVigente();
  if (!escala) return null;
  const filas = borradoresDeLaEscala(escala).map((f) => ({ ...f, escalaVersion: escala.version }));
  return crearBorradores(filas, por);
}

export type ResultadoDeGuardar = { estado: "ok"; preguntas: PreguntaDelBanco[]; problemas: string[] } | { estado: "no-existe" };

/**
 * Guarda el borrador y dice qué le falta para poder aprobarlo (guardar con problemas se puede; aprobar, no). Devuelve las
 * preguntas TAL COMO QUEDARON (textos recortados): la pantalla sigue desde ahí, y eso es lo que manda al aprobar.
 */
export async function guardarElBorrador(id: string, preguntas: PreguntaDelBanco[], por: string): Promise<ResultadoDeGuardar> {
  if (!(await leerBanco(id))) return { estado: "no-existe" };
  await guardarBorrador(id, preguntas, por);
  const banco = await leerBanco(id);
  if (!banco) return { estado: "no-existe" };
  const escala = await escalaVigente();
  return {
    estado: "ok",
    preguntas: banco.preguntas,
    problemas: escala ? problemasDelBanco(escalaDelBanco(escala, banco.edicion), banco.area, banco.version, banco.preguntas) : [],
  };
}

const firmaDe = (p: readonly PreguntaDelBanco[]) => JSON.stringify(leerPreguntasDelBanco(p));

export type ResultadoDeAprobar =
  | { estado: "aprobado" }
  | { estado: "no-existe" }
  | { estado: "sin-escala" }
  | { estado: "con-problemas"; problemas: string[] }
  | { estado: "cambio-en-el-medio" };

/**
 * Aprueba el borrador que la persona tenía EN PANTALLA (`revisadas`): si el guardado ya no es ese (otro super admin lo
 * cambió), no aprueba nada.
 */
export async function aprobarElBorrador(id: string, revisadas: readonly PreguntaDelBanco[], por: string): Promise<ResultadoDeAprobar> {
  const banco = await leerBanco(id);
  if (!banco) return { estado: "no-existe" };
  if (firmaDe(revisadas) !== firmaDe(banco.preguntas)) return { estado: "cambio-en-el-medio" };
  const escala = await escalaVigente();
  if (!escala) return { estado: "sin-escala" };
  const problemas = problemasDelBanco(escalaDelBanco(escala, banco.edicion), banco.area, banco.version, banco.preguntas);
  if (problemas.length) return { estado: "con-problemas", problemas };
  return (await aprobarBanco(id, banco.preguntas, escala.version, por)) ? { estado: "aprobado" } : { estado: "cambio-en-el-medio" };
}

export interface BancoEnPantalla extends BancoGuardado {
  estado: EstadoDelBancoEnPantalla;
  problemas: string[];
}

export interface DatosDeLaPantalla {
  sinTablas: boolean;
  escala: {
    version: string;
    niveles: { letra: Letra; nombre: string }[];
    ediciones: { slug: string; nombre: string }[];
    /** El nombre de cada dimensión (`1.3` → «…»), de la escala general. */
    dimensiones: Record<string, string>;
  } | null;
  bancos: BancoEnPantalla[];
  intentos: IntentoEnPantalla[];
  /** Null = falta el SQL de las visitas (todavía no se cuentan). */
  visitas: VisitasEnPantalla[] | null;
  /** Null = no se pudo contar. */
  completa: MedicionDeLaCompleta | null;
  /** Desde qué día cuenta la medición (AAAA-MM-DD, Costa Rica). */
  desde: string;
}

/** Los cuestionarios de la escala (la versión completa del test) armados desde `desde`: solo cuántos. */
async function medicionDeLaCompleta(desde: Date): Promise<MedicionDeLaCompleta | null> {
  try {
    const filas = await prisma.cuestionario.findMany({
      where: { tipo: "escala", createdAt: { gte: desde } },
      select: { publicadoAt: true, cerradoAt: true, pestanas: { select: { enviadaAt: true } } },
    });
    return {
      armados: filas.length,
      enviadosAlCliente: filas.filter((f) => f.publicadoAt).length,
      contestados: filas.filter((f) => f.pestanas.some((p) => p.enviadaAt)).length,
      cerrados: filas.filter((f) => f.cerradoAt).length,
    };
  } catch (e) {
    console.error("[tests-diagnostico] no se pudo contar la versión completa", e);
    return null;
  }
}

export async function datosDeLaPantalla(ahora: Date = new Date()): Promise<DatosDeLaPantalla> {
  const escala = await escalaVigente();
  const datosDeLaEscala = escala
    ? {
        version: escala.version,
        niveles: escala.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
        ediciones: escala.ediciones.map((e) => ({ slug: e.slug, nombre: e.nombre })),
        dimensiones: Object.fromEntries(escala.areas.flatMap((a) => a.dimensiones.map((d) => [d.id, d.nombre]))),
      }
    : null;
  const desde = new Date(ahora.getTime() - 90 * 86_400_000);
  const diaDesde = diaEnCostaRica(desde.toISOString());
  try {
    const [bancos, intentos, visitas, completa] = await Promise.all([
      listarBancos(),
      intentosRecientes(desde),
      visitasDesde(diaDesde),
      medicionDeLaCompleta(desde),
    ]);
    const dejadoAntes = ahora.getTime() - MINUTOS_PARA_ABANDONO * 60_000;
    return {
      sinTablas: false,
      escala: datosDeLaEscala,
      visitas,
      completa,
      desde: diaDesde,
      bancos: bancos.map((b) => ({
        ...b,
        estado: estadoDelBanco(b),
        problemas: escala ? problemasDelBanco(escalaDelBanco(escala, b.edicion), b.area, b.version, b.preguntas) : [],
      })),
      intentos: intentos.map((i) => ({
        id: i.id,
        area: i.area,
        version: i.version,
        // Un intento quieto hace más de una hora ya se dejó, aunque el job (apagado o atrasado) no lo haya marcado.
        estado: i.estado === "en_curso" && Date.parse(i.updatedAt) < dejadoAntes ? "abandonado" : i.estado,
        paso: i.paso,
        totalDePreguntas: i.preguntas.length,
        nombre: i.nombre,
        email: i.email,
        puesto: i.puesto,
        empresa: i.empresa,
        // Para agrupar por empresa: el dominio del correo (el sitio lo escribe cualquiera); con un correo genérico, el sitio.
        dominio: dominioDelCorreo(i.email) ?? i.dominio,
        clientId: i.clientId,
        nivel: i.resultado?.nivel ?? null,
        nivelNombre: i.resultado?.nivelNombre ?? null,
        url: i.url,
        hubspotFormAt: i.hubspotFormAt,
        hubspotNotaAt: i.hubspotNotaAt,
        hubspotIntentos: i.hubspotIntentos,
        hubspotError: i.hubspotError,
        createdAt: i.createdAt,
        terminadoAt: i.terminadoAt,
      })),
    };
  } catch (e) {
    if (e instanceof ErrorSinTablas) return { sinTablas: true, escala: datosDeLaEscala, bancos: [], intentos: [], visitas: null, completa: null, desde: diaDesde };
    throw e;
  }
}
