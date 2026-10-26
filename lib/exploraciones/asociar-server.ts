/**
 * lib/exploraciones/asociar-server.ts — las sesiones que se asocian solas y las que se preguntan (K5 del roadmap,
 * 2026-10-27). SERVIDOR. La regla vive en ./asociar.ts (pura, con test).
 *
 * Dos lectores y un escritor:
 *   · `asociacionesDeLaFila`: lo que pregunta el lienzo arriba («¿Es la sesión 2 con Marketing?») y la huella para ponerse
 *     al día solo. Solo lee.
 *   · `asociarSinDuda` / `asociarEnLasExploraciones`: el job `exploraciones-asociar` (cada 10 minutos) une a su sesión las
 *     reuniones SIN duda, con la fila bloqueada (servidor.ts › aplicarCambios, la misma puerta de la pantalla), y deja la
 *     marca `asociadaSola` para que la pantalla diga «Nexus la unió». Nunca adopta una reunión ni le cambia el dueño.
 *
 * ⛔ Las reuniones salen SOLO del chokepoint (`getClientSessions`, por `resolvedClientId`): una de otro cliente no puede
 * llegar acá. INV61 lo vigila en la base (lib/invariantes/exploraciones.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { dominioDelSitio } from "@/lib/clients/datos-de-la-empresa";
import { getClientSessions } from "@/lib/sessions/project-sources";
import type { Escala } from "@/lib/escala/documento/tipos";
import { huellaDelLienzo, sugerirAsociaciones, type SugerenciaDeAsociacion } from "./asociar";
import { aFecha, hoyEnCostaRica } from "./fechas";
import { reunionesDeLaExploracion } from "./fuentes";
import { opcionesDeLasPestanas, pestanasDeSesiones } from "./guia";
import { leerLoLeido } from "./lo-leido";
import { aplicarCambios, escalaParaExplorar, estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Cuántas reuniones recientes de la empresa se miran. */
const REUNIONES_QUE_SE_MIRAN = 40;

export interface AsociacionesDelLienzo {
  sugerencias: SugerenciaDeAsociacion[];
  /** Si cambia, el lienzo se vuelve a leer solo. */
  huella: string;
}

/** Los correos del equipo de Customer Success (CSE y CSL activos). */
async function correosDeCustomerSuccess(): Promise<Set<string>> {
  const filas = await prisma.teamMember.findMany({ where: { roleEnum: { in: ["CSE", "CSL"] }, deactivatedAt: null }, select: { email: true } }).catch(() => []);
  return new Set(filas.map((f) => f.email.trim().toLowerCase()));
}

/** Las reuniones de Meet que ya son la sesión de OTRA exploración viva de la misma empresa. */
async function reunionesDeOtrasExploraciones(fila: Pick<FilaDeExploracion, "id" | "clientId">): Promise<Set<string>> {
  const otras = await prisma.exploracionDeVenta
    .findMany({ where: { clientId: fila.clientId, id: { not: fila.id }, archivadaEn: null }, select: { id: true, clientId: true, contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true } })
    .catch(() => []);
  const ids = new Set<string>();
  for (const o of otras) for (const s of estadoDesdeFila(o).contenido.sesiones) if (s.reunion?.origen === "meet") ids.add(s.reunion.id);
  return ids;
}

/** Lo que pregunta el lienzo y su huella. Si algo falla, sin preguntas (el lienzo sigue igual). */
export async function asociacionesDeLaFila(fila: FilaDeExploracion, ahora = new Date()): Promise<AsociacionesDelLienzo> {
  const estado = estadoDesdeFila(fila);
  const c = estado.contenido;
  const automaticas = !fila.projectId && fila.client.kind === "PROSPECTO";
  const [reuniones, recientes, categorias, cliente, customerSuccess, enOtra] = await Promise.all([
    reunionesDeLaExploracion(
      {
        exploracionId: fila.id,
        clientId: fila.clientId,
        projectId: fila.projectId,
        creadaEn: fila.createdAt,
        propuesta: estado.propuesta,
        leido: leerLoLeido(fila.test),
        sesiones: c.sesiones,
        fuera: c.fuera,
        elegidas: c.reunionesElegidas,
      },
      ahora,
    ),
    getClientSessions(fila.clientId, { take: REUNIONES_QUE_SE_MIRAN }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }).catch(() => []),
    prisma.client.findUnique({ where: { id: fila.clientId }, select: { emailDomains: true, sitioWeb: true } }),
    correosDeCustomerSuccess(),
    reunionesDeOtrasExploraciones(fila),
  ]);
  const huella = huellaDelLienzo({ version: fila.version, actualizadaEn: fila.updatedAt.toISOString(), reuniones });
  if (fila.archivadaEn) return { sugerencias: [], huella };
  const pestanas = pestanasDeSesiones(c.sesiones, reuniones, hoyEnCostaRica(ahora), opcionesDeLasPestanas(automaticas, c.fuera));
  const sugerencias = sugerirAsociaciones({
    pestanas,
    candidatas: recientes.map((s) => ({ id: s.id, titulo: s.title, fecha: new Date(s.date).toISOString(), participantes: s.participants })),
    fuera: new Set(c.fuera),
    descartadas: new Set(c.asociacionesDescartadas ?? []),
    internos: buildInternalDomainsSet(categorias),
    // Los dominios de la empresa como los lee el resto de Nexus: los registrados y el de su sitio (personas-de-la-empresa).
    dominiosDeLaEmpresa: [...(cliente?.emailDomains ?? []), ...(cliente?.sitioWeb ? [dominioDelSitio(cliente.sitioWeb)] : [])].filter(Boolean),
    /* También en la exploración de un proyecto (la lleva Customer Success): sus sesiones ya no cuentan (`usadas`), pero
       una reunión de seguimiento de CS con la empresa hace dudar. Con duda, se pregunta. */
    customerSuccess,
    enOtraExploracion: enOtra,
    ahora: ahora.getTime(),
  });
  return { sugerencias, huella };
}

export type ResultadoDeAsociar = { asociadas: number; preguntas: number } | { error: string };

/**
 * Une SOLAS las reuniones sin duda de una exploración. Lo vuelve a calcular con la fila de AHORA (otra persona pudo unir
 * una a mano entretanto) y escribe con la fila bloqueada; si chocó, vuelve a intentar una vez sobre lo último.
 */
export async function asociarSinDuda(exploracionId: string, general: Escala, ahora = new Date()): Promise<ResultadoDeAsociar> {
  for (let intento = 0; intento < 2; intento++) {
    const l = await leerExploracion(exploracionId);
    if (l.estado !== "ok") return { error: l.estado };
    if (l.fila.archivadaEn) return { asociadas: 0, preguntas: 0 };
    const { sugerencias } = await asociacionesDeLaFila(l.fila, ahora);
    const solas = sugerencias.filter((s) => s.sola && s.sesion);
    if (!solas.length) return { asociadas: 0, preguntas: sugerencias.length };
    /* Una operación por sesión, que se vuelve a mirar con la fila BLOQUEADA y la de ahora (contenido.ts › asociarSola):
       si alguien dijo «No», la unió a mano o la sacó mientras esto calculaba, no hace nada. Nunca la lista entera. */
    const ops = solas.map((a) => ({
      op: "asociarSola" as const,
      sesionId: a.sesion!.id,
      reunionId: a.reunion.id,
      fecha: hoyEnCostaRica(aFecha(a.reunion.fecha)),
      en: ahora.toISOString(),
    }));
    const r = await aplicarCambios(exploracionId, l.fila.version, ops, general, { eventosDeConfianza: true });
    if (r.estado === "ok") {
      const unidas = solas.filter((a) => r.fila && estadoDesdeFila(r.fila).contenido.sesiones.some((s) => s.id === a.sesion!.id && s.reunion?.id === a.reunion.id && s.asociadaSola)).length;
      return { asociadas: unidas, preguntas: sugerencias.length - solas.length };
    }
    if (r.estado !== "conflicto") return { error: r.estado === "invalido" ? r.error : r.estado };
  }
  return { error: "La exploración cambió mientras tanto." };
}

/** Las exploraciones vivas que se tocaron en los últimos días: las demás no esperan una reunión nueva. */
const DIAS_DE_ACTIVIDAD = 60;
const MAX_EXPLORACIONES_POR_CORRIDA = 150;

/** Las exploraciones vivas, tocadas hace poco, con alguna sesión que espera su reunión (las que mira el job y el script). */
export async function exploracionesConSesionesLibres(ahora = new Date()): Promise<string[]> {
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { archivadaEn: null, updatedAt: { gte: new Date(ahora.getTime() - DIAS_DE_ACTIVIDAD * 24 * 60 * 60 * 1000) } },
    orderBy: { updatedAt: "desc" },
    take: MAX_EXPLORACIONES_POR_CORRIDA,
    select: { id: true, contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true },
  });
  // Solo las que tienen una sesión planeada sin reunión: las demás no tienen qué asociar.
  return filas
    .filter((f) => estadoDesdeFila(f).contenido.sesiones.some((s) => !s.reunion && !s.resultado && !s.hecha && !(s.evento && !s.evento.cancelada)))
    .map((f) => f.id);
}

/** El job: une solas las reuniones sin duda en todas las exploraciones vivas con alguna sesión que espera su reunión. */
export async function asociarEnLasExploraciones(ahora = new Date()): Promise<{ miradas: number; asociadas: number; errores: string[] }> {
  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") return { miradas: 0, asociadas: 0, errores: [] };
  const conLibres = await exploracionesConSesionesLibres(ahora);
  let asociadas = 0;
  const errores: string[] = [];
  for (const id of conLibres) {
    try {
      const r = await asociarSinDuda(id, escala.general, ahora);
      if ("error" in r) errores.push(`${id}: ${r.error}`);
      else asociadas += r.asociadas;
    } catch (e) {
      errores.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { miradas: conLibres.length, asociadas, errores };
}
