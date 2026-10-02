/**
 * lib/exploraciones/servidor.ts — leer, listar y cambiar exploraciones de venta. SERVIDOR.
 *
 * ⚠ DOS escritores sobre la misma fila: el vendedor (lo confirmado, y usar o descartar lo propuesto)
 * y el agente (que suma propuestas). Los dos escriben dentro de una transacción que primero BLOQUEA
 * la fila (`FOR UPDATE`) y la vuelve a leer: si no, una corrida que leyó antes de un «Descartar»
 * podía volver a escribir lo descartado. Además, lo confirmado lleva su versión: si dos personas
 * cambian lo mismo a la vez, la segunda recibe un 409 en vez de pisar a la primera.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { Cierre, Despues, Escala } from "@/lib/escala/documento/tipos";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { listaParaProponer, queSigue, type PuntoDeCalidad } from "./calidad";
import { aplicarOperaciones, cambioLoConfirmado, type EstadoDeExploracion, type Operacion, type Validez } from "./contenido";
import { leerContenido, leerPropuesta, VALIDADOR_ESTRICTO } from "./esquemas";
import { escalaParaElLienzo, idsDeLaEscala, type EscalaDelLienzo } from "./escala-del-lienzo";
import type { DocumentoDeLaLista } from "./documentos";
import type { ReunionSinLeer } from "./lectura";
import { chequeoConfirmado } from "./mapa";
import { leerLoLeido, type LoLeidoDeHubspot } from "./lo-leido";
import { bloqueParaLaPropuesta, posicionDesdeElChequeo } from "./para-la-propuesta";
import type { PosicionEnLaEscala } from "@/lib/escala/posicion";

export const SQL_DE_EXPLORACIONES = "scripts/sql/2026-10-01-exploracion-de-venta.sql";

const SELECT_FILA = {
  id: true,
  clientId: true,
  edicion: true,
  perfilCierre: true,
  perfilDespues: true,
  areas: true,
  contenido: true,
  propuesta: true,
  test: true,
  responsableEmail: true,
  creadaPor: true,
  version: true,
  archivadaEn: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true, hubspotCompanyId: true, industry: true, kind: true } },
} satisfies Prisma.ExploracionDeVentaSelect;

export type FilaDeExploracion = Prisma.ExploracionDeVentaGetPayload<{ select: typeof SELECT_FILA }>;

const CIERRES = new Set<string>(["con equipo", "transaccional", "mixta"]);
const DESPUES = new Set<string>(["única", "recompra", "continua"]);

export function estadoDesdeFila(fila: Pick<FilaDeExploracion, "contenido" | "propuesta" | "areas" | "edicion" | "perfilCierre" | "perfilDespues" | "responsableEmail" | "archivadaEn">): EstadoDeExploracion {
  return {
    contenido: leerContenido(fila.contenido),
    propuesta: leerPropuesta(fila.propuesta),
    areas: fila.areas,
    edicion: fila.edicion,
    perfilCierre: fila.perfilCierre && CIERRES.has(fila.perfilCierre) ? (fila.perfilCierre as Cierre) : null,
    perfilDespues: fila.perfilDespues && DESPUES.has(fila.perfilDespues) ? (fila.perfilDespues as Despues) : null,
    responsableEmail: fila.responsableEmail,
    archivada: fila.archivadaEn !== null,
  };
}

// ── La escala ────────────────────────────────────────────────────────────────

export type EscalaParaExplorar =
  | { estado: "ok"; general: Escala; aviso: string | null }
  | { estado: "sin-publicar" }
  | { estado: "sin-tablas" };

export async function escalaParaExplorar(): Promise<EscalaParaExplorar> {
  const v = await leerEscalaVigente();
  if (v.estado !== "ok") return v;
  return { estado: "ok", general: v.escala, aviso: v.aviso };
}

export function escalaDeLaExploracion(general: Escala, estado: EstadoDeExploracion): EscalaDelLienzo {
  return escalaParaElLienzo(general, estado.edicion, { cierre: estado.perfilCierre, despues: estado.perfilDespues });
}

/** El chequeo de lo confirmado con evidencia (mapa.ts › `chequeoConfirmado`). */
export function chequeoDe(escala: EscalaDelLienzo, estado: EstadoDeExploracion): ResultadoDelChequeo {
  return chequeoConfirmado(escala, estado);
}

export function validezPara(general: Escala, escala: EscalaDelLienzo): Validez {
  const ids = idsDeLaEscala(escala);
  return {
    dimensiones: ids.dimensiones,
    criterios: ids.criterios,
    areas: new Set(general.areas.map((a) => a.id)),
    ediciones: new Set(general.ediciones.map((e) => e.slug)),
    perfilesHabituales: Object.fromEntries(general.ediciones.map((e) => [e.slug, e.perfilHabitual])),
    escalaVersion: general.version,
  };
}

// ── Leer y listar ─────────────────────────────────────────────────────────────

export type LecturaDeExploracion =
  | { estado: "ok"; fila: FilaDeExploracion }
  | { estado: "no-existe" }
  /** Falta correr el SQL (o reiniciar con el cliente de Prisma nuevo). */
  | { estado: "sin-tablas" };

export async function leerExploracion(id: string): Promise<LecturaDeExploracion> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return { estado: "sin-tablas" };
  try {
    const fila = await prisma.exploracionDeVenta.findUnique({ where: { id }, select: SELECT_FILA });
    return fila ? { estado: "ok", fila } : { estado: "no-existe" };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tablas" };
    throw e;
  }
}

export interface FilaDeLaLista {
  id: string;
  empresa: string;
  clientId: string;
  hubspotCompanyId: string | null;
  edicion: string | null;
  areas: string[];
  queSigue: string;
  cumplidos: number;
  total: number;
  responsableEmail: string | null;
  actualizadaEn: string;
}

export type ListaDeExploraciones = { estado: "ok"; filas: FilaDeLaLista[] } | { estado: "sin-tablas" };

export async function listarExploraciones(general: Escala | null): Promise<ListaDeExploraciones> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return { estado: "sin-tablas" };
  let filas: FilaDeExploracion[];
  try {
    filas = await prisma.exploracionDeVenta.findMany({
      where: { archivadaEn: null },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: SELECT_FILA,
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tablas" };
    throw e;
  }
  return {
    estado: "ok",
    filas: filas.map((f) => {
      const estado = estadoDesdeFila(f);
      const escala = general ? escalaDeLaExploracion(general, estado) : null;
      let puntos: PuntoDeCalidad[] = [];
      let sigue = "Falta publicar la escala en Nexus.";
      if (escala) {
        const chequeo = chequeoDe(escala, estado);
        puntos = listaParaProponer(estado, chequeo);
        sigue = queSigue(estado, chequeo);
      }
      return {
        id: f.id,
        empresa: f.client.name,
        clientId: f.clientId,
        hubspotCompanyId: f.client.hubspotCompanyId,
        edicion: escala?.edicion?.nombre ?? null,
        areas: estado.areas.map((id) => escala?.areas.find((a) => a.id === id)?.nombre ?? id),
        queSigue: sigue,
        cumplidos: puntos.filter((p) => p.cumplido).length,
        total: puntos.length,
        responsableEmail: f.responsableEmail,
        actualizadaEn: f.updatedAt.toISOString(),
      };
    }),
  };
}

// ── Cambiar ───────────────────────────────────────────────────────────────────

export type ResultadoDeCambios =
  | { estado: "ok"; fila: FilaDeExploracion; confirmado: boolean }
  | { estado: "no-existe" }
  | { estado: "invalido"; error: string }
  /** Otra persona cambió lo confirmado entretanto: la pantalla recarga en vez de pisar. */
  | { estado: "conflicto"; fila: FilaDeExploracion };

/** Bloquea la fila hasta el fin de la transacción (los dos escritores pasan por acá). */
export async function bloquearFila(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "ExploracionDeVenta" WHERE "id" = ${id} FOR UPDATE`;
}

export function datosParaGuardar(estado: EstadoDeExploracion): Prisma.ExploracionDeVentaUpdateInput {
  return {
    contenido: estado.contenido as unknown as Prisma.InputJsonValue,
    propuesta: estado.propuesta as unknown as Prisma.InputJsonValue,
    areas: estado.areas,
    edicion: estado.edicion,
    perfilCierre: estado.perfilCierre,
    perfilDespues: estado.perfilDespues,
    responsableEmail: estado.responsableEmail,
  };
}

export async function aplicarCambios(
  id: string,
  version: number,
  operaciones: readonly Operacion[],
  general: Escala,
): Promise<ResultadoDeCambios> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, id);
    const fila = await tx.exploracionDeVenta.findUnique({ where: { id }, select: SELECT_FILA });
    if (!fila) return { estado: "no-existe" } as const;
    // Archivada es de solo lectura: la pantalla ya no deja editar, y la API tampoco.
    if (fila.archivadaEn) return { estado: "invalido", error: "La exploración está archivada: ya no se puede cambiar." } as const;

    const antes = estadoDesdeFila(fila);
    // Los ids se validan contra la escala con la edición que la exploración tiene AHORA. Los ids de
    // las dimensiones son los mismos en todas las ediciones; lo único propio de una edición son
    // algunos criterios, y la pantalla cambia la edición sola, en un pedido aparte.
    const r = aplicarOperaciones(antes, operaciones, validezPara(general, escalaDeLaExploracion(general, antes)), VALIDADOR_ESTRICTO);
    if (!r.ok) return { estado: "invalido", error: r.error } as const;

    const confirmado = cambioLoConfirmado(antes, r.estado);
    if (confirmado && fila.version !== version) return { estado: "conflicto", fila } as const;

    const actualizada = await tx.exploracionDeVenta.update({
      where: { id },
      data: {
        ...datosParaGuardar(r.estado),
        ...(r.estado.archivada && !antes.archivada ? { archivadaEn: new Date() } : {}),
        ...(confirmado ? { version: { increment: 1 } } : {}),
      },
      select: SELECT_FILA,
    });
    return { estado: "ok", fila: actualizada, confirmado } as const;
  });
}

/**
 * La ÚNICA puerta de lo que ve el cliente (la propuesta y la regeneración de su sección de la
 * escala): devuelve el bloque de contexto —sin lo interno ni ids— y la posición en la escala desde el
 * chequeo. Nunca el estado: lib/exploraciones/lectores.test.ts no deja que un lector de un documento
 * del cliente lea otra cosa. `bloque` vacío = la exploración no tiene nada que aportar todavía.
 */
export async function paraLaPropuesta(
  exploracionId: string,
  conEscala: boolean,
): Promise<{ bloque: string; posicion: (lang: string | null | undefined) => PosicionEnLaEscala } | null> {
  const datos = await exploracionParaLaPropuesta(exploracionId);
  if (!datos) return null;
  return {
    bloque: bloqueParaLaPropuesta({ ...datos, conEscala }),
    posicion: (lang) => posicionDesdeElChequeo(datos.chequeo, datos.escala, lang),
  };
}

/** La foto es de la última lectura: lo que ya pasó desde entonces no es agenda (se avisa como «sin leer»). */
function loQueVieneDeLaAgenda(leido: LoLeidoDeHubspot, ahora = Date.now()): LoLeidoDeHubspot {
  return { ...leido, agenda: leido.agenda.filter((a) => Date.parse(a.inicio) > ahora) };
}

/** Lo que la pantalla del lienzo recibe: la fila ya leída, sin los objetos de Prisma. */
export interface ExploracionParaLaPantalla {
  id: string;
  version: number;
  empresa: { clientId: string; nombre: string; hubspotCompanyId: string | null; industria: string | null; kind: string };
  estado: EstadoDeExploracion;
  /** Lo que el agente leyó de HubSpot: el test, la agenda, los correos que no pudo leer. */
  leido: LoLeidoDeHubspot;
  /** Las reuniones que el agente todavía no leyó. Solo al abrir y al recargar (cuesta una consulta):
   *  la respuesta de un cambio no lo trae y la pantalla conserva lo que tenía. */
  sinLeer?: ReunionSinLeer[];
  /** Los proyectos cuyo handoff ya la recibe (lib/exploraciones/handoff.ts). Igual que `sinLeer`. */
  proyectos?: { id: string; nombre: string; clientId: string }[];
  /** Las sesiones y los documentos sumados a mano, sin el texto (lib/exploraciones/documentos.ts). Igual que `sinLeer`. */
  documentos?: DocumentoDeLaLista[];
  /** Las propuestas comerciales que nacieron de esta exploración. Igual que `sinLeer`. */
  propuestas?: { id: string; nombre: string; estado: string; creadaEn: string }[];
  creadaPor: string;
  creadaEn: string;
  actualizadaEn: string;
}

export function paraLaPantalla(fila: FilaDeExploracion): ExploracionParaLaPantalla {
  return {
    id: fila.id,
    version: fila.version,
    empresa: {
      clientId: fila.client.id,
      nombre: fila.client.name,
      hubspotCompanyId: fila.client.hubspotCompanyId,
      industria: fila.client.industry,
      kind: fila.client.kind,
    },
    estado: estadoDesdeFila(fila),
    leido: loQueVieneDeLaAgenda(leerLoLeido(fila.test)),
    creadaPor: fila.creadaPor,
    creadaEn: fila.createdAt.toISOString(),
    actualizadaEn: fila.updatedAt.toISOString(),
  };
}

/**
 * La exploración enlazada a una propuesta, como la usa la generación (y la regeneración de la
 * sección de la Escala): su estado, la escala con su edición y su perfil, y el chequeo. null si la
 * tabla no está, si la exploración ya no existe o si la escala no está publicada: la propuesta se
 * genera igual, sin ella.
 */
export async function exploracionParaLaPropuesta(
  exploracionId: string,
): Promise<{ estado: EstadoDeExploracion; escala: EscalaDelLienzo; chequeo: ResultadoDelChequeo } | null> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return null;
  const vigente = await escalaParaExplorar();
  if (vigente.estado !== "ok") return null;
  const estado = estadoDesdeFila(lectura.fila);
  const escala = escalaDeLaExploracion(vigente.general, estado);
  return { estado, escala, chequeo: chequeoDe(escala, estado) };
}

