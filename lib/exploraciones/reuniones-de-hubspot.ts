import "server-only";

/**
 * lib/exploraciones/reuniones-de-hubspot.ts — las reuniones de HubSpot de una preventa, al día sin
 * esperar al agente (Elías, 2026-10-07: «debería ser como reunión de forma automática»). SERVIDOR.
 *
 * Las reuniones que se graban con HubSpot no avisan cuando llegan (las de Meet sí: post-process.ts lee
 * cada transcripción nueva). Por eso el lienzo, al abrirse, pide mirarlas: si la última mirada tiene más
 * de `MINUTOS_ENTRE_MIRADAS`, se lee la actividad de HubSpot y se suman a la foto las reuniones que ya se
 * hicieron y dejaron qué leer (lectura.ts › `reunionesHechasDeHubspot`). Si hay alguna reciente que nadie
 * leyó, el agente la lee solo, con las mismas reglas que una de Meet (mientras se vende, de hace a lo
 * sumo dos semanas) y la regla de la etapa A (2026-10-09): en un PROSPECTO, las que nadie sacó de la
 * exploración (`contenido.fuera`); en la preventa de un CLIENTE, solo la unida a una sesión (elegida o por
 * su evento; la del mismo día no cuenta). Solo la preventa: la exploración de un proyecto no lee HubSpot.
 * Solo lee HubSpot: nunca escribe allá.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { lanzarCorrida, seVendeTodavia } from "./agente";
import { leerPropuesta } from "./esquemas";
import { corteDeLaExploracion, reunionesDeLaExploracion } from "./fuentes";
import { hoyEnCostaRica } from "./fechas";
import { opcionesDeLasPestanas, pestanasDeSesiones } from "./guia";
import { leerActividad, leerContactos } from "./hubspot";
import { agendaRenovada, hechasParaLeerSolas, reunionesHechasDeHubspot } from "./lectura";
import { leerLoLeido, type LoLeidoDeHubspot } from "./lo-leido";
import type { ContenidoDeExploracion } from "./contenido";
import { bloquearFila, estadoDesdeFila, leerExploracion } from "./servidor";

/** Cada cuánto, como mucho, el lienzo vuelve a mirar las reuniones de HubSpot (cada mirada son ~15 pedidos a HubSpot). */
export const MINUTOS_ENTRE_MIRADAS = 30;

export interface ResultadoDeLaMirada {
  /** La lista de reuniones cambió: el lienzo recarga. */
  cambio: boolean;
  /** El agente salió a leer una reunión nueva: el lienzo la sigue. */
  lanzada: boolean;
}

const NADA: ResultadoDeLaMirada = { cambio: false, lanzada: false };

/** `forzar`: mira aunque la última mirada sea reciente (la puesta al día de scripts/leer-reuniones-de-preventas.ts). */
export async function mirarReunionesDeHubspot(exploracionId: string, ahora = new Date(), o: { forzar?: boolean } = {}): Promise<ResultadoDeLaMirada> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return NADA;
  const fila = lectura.fila;
  const companyId = fila.client.hubspotCompanyId;
  if (fila.projectId || fila.archivadaEn || !companyId) return NADA;
  const antes = leerLoLeido(fila.test);
  if (!o.forzar && antes.reunionesEn && ahora.getTime() - Date.parse(antes.reunionesEn) < MINUTOS_ENTRE_MIRADAS * 60_000) return NADA;

  // Si HubSpot no contesta, queda lo que había: el lienzo abre igual.
  const actividad = await leerContactos(companyId)
    .then((contactos) => leerActividad(companyId, contactos, ahora))
    .catch((e) => {
      console.error("[exploraciones/hubspot] no se pudieron mirar las reuniones", e);
      return null;
    });
  if (!actividad) return NADA;
  const corte = await corteDeLaExploracion({ clientId: fila.clientId, creadaEn: fila.createdAt });
  const hechas = reunionesHechasDeHubspot(actividad.material, { corte, ahora });

  // Con la fila bloqueada y releída, como el agente: una corrida que guardó entretanto no se pisa.
  const r = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const actual = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { test: true, propuesta: true } });
    if (!actual) return null;
    const foto = leerLoLeido(actual.test);
    const nueva = [...actividad.agenda, ...hechas.map(({ id, titulo, inicio }) => ({ id, titulo, inicio }))];
    const agenda = agendaRenovada({ anterior: foto.agenda, nueva, noOcurrieron: actividad.noOcurrieron, ahora });
    const cambio = JSON.stringify(agenda) !== JSON.stringify(foto.agenda);
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { test: { ...foto, agenda, reunionesEn: ahora.toISOString() } as unknown as Prisma.InputJsonValue },
    });
    return { cambio, leidas: leerPropuesta(actual.propuesta).leidas.hubspot, foto: { ...foto, agenda } };
  });
  if (!r) return NADA;

  /* Como una de Meet: la reunión nueva la lee el agente solo, mientras se vende. En un prospecto, las que
     nadie sacó de la exploración; en la preventa de un cliente, solo la unida a una sesión (etapa A: reemplaza
     al filtro de Ventas). */
  const contenido = estadoDesdeFila(fila).contenido;
  const esCliente = fila.client.kind === "CLIENTE";
  const ligadas = esCliente ? (hechas.length ? await hubspotUnidasALasSesiones(exploracionId, fila, contenido, r.foto, ahora) : new Set<string>()) : undefined;
  const paraLeer = hechasParaLeerSolas(hechas, {
    creadaEn: fila.createdAt,
    leidas: r.leidas,
    ahora,
    ...(esCliente ? { ligadas } : { fuera: new Set(contenido.fuera) }),
  });
  let lanzada = false;
  if (paraLeer.length && (await seVendeTodavia(fila, ahora))) {
    const corrida = await lanzarCorrida(exploracionId, "leer", { triggeredByEmail: null, automatica: true });
    lanzada = corrida.ok && !corrida.yaCorria;
  }
  return { cambio: r.cambio, lanzada };
}

/**
 * Las reuniones de HubSpot unidas a una sesión de forma explícita (elegidas, o por su evento del
 * calendario): las únicas que el agente lee solo en la preventa de un cliente. La del mismo día no cuenta.
 */
async function hubspotUnidasALasSesiones(
  exploracionId: string,
  fila: { clientId: string; projectId: string | null; createdAt: Date; propuesta: unknown },
  contenido: Pick<ContenidoDeExploracion, "sesiones" | "fuera" | "reunionesElegidas">,
  foto: LoLeidoDeHubspot,
  ahora: Date,
): Promise<Set<string>> {
  if (!contenido.sesiones.length) return new Set();
  const reuniones = await reunionesDeLaExploracion(
    {
      exploracionId,
      clientId: fila.clientId,
      projectId: fila.projectId,
      creadaEn: fila.createdAt,
      propuesta: leerPropuesta(fila.propuesta),
      leido: foto,
      sesiones: contenido.sesiones,
      fuera: contenido.fuera,
      elegidas: contenido.reunionesElegidas,
    },
    ahora,
  ).catch(() => []);
  return new Set(
    pestanasDeSesiones(contenido.sesiones, reuniones, hoyEnCostaRica(ahora), opcionesDeLasPestanas(false, contenido.fuera)).flatMap((p) =>
      p.reunion?.origen === "hubspot" && p.ligadaPor !== "fecha" ? [p.reunion.id] : [],
    ),
  );
}
