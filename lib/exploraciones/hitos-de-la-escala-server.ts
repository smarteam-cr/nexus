/**
 * lib/exploraciones/hitos-de-la-escala-server.ts — cuándo se PRESENTÓ La escala de la empresa y qué RESPONDIÓ el cliente
 * (Elías, 21 nov). SERVIDOR.
 *
 * Append-only en `HitoDeLaEscala` (SQL scripts/sql/2026-11-21-hitos-de-la-escala.sql): solo este archivo la escribe, y
 * nunca con update ni delete (lo vigila notas-del-equipo.test.ts). El estado sale de plegar las filas
 * (lib/impacto/respuesta-del-cliente.ts). Cada hito guarda lo que el cliente tenía publicado en ese momento
 * (`loQueSeVio`): la foto de `AccesoALaEscala` se pisa con cada «Publicar», y lo aceptado es el contexto de más peso para
 * el agente de impacto y el handoff.
 *
 * ⚠ Sin el SQL aplicado, leer devuelve «nada anotado» (el «Acceso» sigue andando) y anotar responde 503.
 */
import "server-only";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import {
  hoyEnCostaRica,
  plegarHitos,
  porQueNoSeAnota,
  TIPOS_DE_HITO,
  type EstadoConElCliente,
  type HitoGuardado,
  type NuevoHito,
  type TipoDeHito,
} from "@/lib/impacto/respuesta-del-cliente";
import { NuevoHitoSchema } from "@/lib/impacto/respuesta-del-cliente-esquema";
import { paginaDeLaFoto } from "./escala-publicada";
import { piezasDeLaPagina, textoDeLasPiezas } from "./impacto-en-la-escala";

export const SQL_DE_LOS_HITOS = "scripts/sql/2026-11-21-hitos-de-la-escala.sql";

export class ErrorDelHito extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const esTipo = (t: string): t is TipoDeHito => (TIPOS_DE_HITO as readonly string[]).includes(t);

/** Los hitos de una exploración, en orden. Sin la tabla (SQL sin aplicar), vacío. */
export async function hitosDeLaEscala(exploracionId: string): Promise<HitoGuardado[]> {
  try {
    const filas = await prisma.hitoDeLaEscala.findMany({ where: { exploracionId }, orderBy: { createdAt: "asc" }, take: 200 });
    return filas.flatMap((f) =>
      esTipo(f.tipo)
        ? [{ tipo: f.tipo, fecha: f.fecha, nota: f.nota, loQueSeVio: f.loQueSeVio, publicadaEn: f.publicadaEn?.toISOString() ?? null, porEmail: f.porEmail, en: f.createdAt.toISOString() }]
        : [],
    );
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** El estado con el cliente: cuándo se presentó, qué respondió y lo último que aceptó. */
export async function estadoConElCliente(exploracionId: string): Promise<EstadoConElCliente> {
  return plegarHitos(await hitosDeLaEscala(exploracionId));
}

/** Anota un hito con quién y cuándo. 400 si no es válido; 409 si no se puede (sin publicar, sin presentación). */
export async function anotarHito(exploracionId: string, crudo: unknown, porEmail: string | null, ahora = new Date()): Promise<EstadoConElCliente> {
  const r = NuevoHitoSchema.safeParse(crudo);
  if (!r.success) throw new ErrorDelHito(400, "Falta la fecha o la nota de lo que dijo el cliente.");
  const nuevo: NuevoHito = r.data;
  const acceso = await prisma.accesoALaEscala.findUnique({ where: { exploracionId }, select: { publicada: true, publicadaEn: true } });
  const foto = acceso ? paginaDeLaFoto(acceso.publicada) : null;
  const hitos = await hitosDeLaEscala(exploracionId);
  const antes = plegarHitos(hitos);
  const porque = porQueNoSeAnota(nuevo, antes, hoyEnCostaRica(ahora), { publicada: !!foto });
  if (porque) throw new ErrorDelHito(409, porque);
  /* Una presentación guarda lo publicado HOY; una respuesta, lo que se vio en SU presentación (revisión del 21 nov: entre
     presentar y responder se pudo republicar una versión que el cliente nunca vio). */
  const presentacion = [...hitos].reverse().find((h) => h.tipo === "presentada");
  const visto =
    nuevo.tipo === "presentada"
      ? { loQueSeVio: foto ? textoDeLasPiezas(piezasDeLaPagina(foto.resumen)) || null : null, publicadaEn: acceso?.publicadaEn ?? null }
      : { loQueSeVio: presentacion?.loQueSeVio ?? null, publicadaEn: presentacion?.publicadaEn ? new Date(presentacion.publicadaEn) : null };
  try {
    await prisma.hitoDeLaEscala.create({
      data: {
        exploracionId,
        tipo: nuevo.tipo,
        fecha: nuevo.tipo === "presentada" ? nuevo.fecha : null,
        nota: nuevo.tipo === "presentada" ? null : nuevo.nota?.trim() || null,
        ...visto,
        porEmail,
      },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) throw new ErrorDelHito(503, `Falta aplicar ${SQL_DE_LOS_HITOS} y reiniciar.`);
    throw e;
  }
  return estadoConElCliente(exploracionId);
}
