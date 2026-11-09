/**
 * lib/exploraciones/objetivos-de-la-primera-server.ts — pedir y guardar los tres objetivos sugeridos de la PRIMERA sesión
 * (2026-11-08, objetivos-de-la-primera.ts). SERVER-ONLY.
 *
 * Una llamada chica, una vez por preventa: queda en `propuesta.objetivosDeLaPrimera` y no se vuelve a pedir. Lo que lee de
 * la empresa sale de `borradorDelContexto` (las reuniones, por el chokepoint de sesiones: nada de otro cliente) y de su ficha.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { leerPropuesta } from "./esquemas";
import { marcoDe } from "./marco";
import { objetivoDeSmarteam } from "./objetivo-y-hallazgos";
import { NOMBRE_DE_LA_TARJETA, porAveriguar } from "./contexto-de-la-exploracion";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { bloquearFila, estadoDesdeFila, leerExploracion } from "./servidor";
import { borradorDelContexto, empresaEnLaFicha } from "./contexto-server";
import { leerLosObjetivos, ORIGEN_DE_LOS_OBJETIVOS, pedidoDeLosObjetivos, type EntradaDeLosObjetivos } from "./objetivos-de-la-primera";

export class ErrorDeLosObjetivos extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Los objetivos de la primera sesión: los guardados o, si nunca se pidieron, los pide y los guarda. Vacío si el agente no
 * devolvió ninguno que sirva (queda guardado igual: no se vuelve a gastar en cada visita).
 */
export async function objetivosDeLaPrimera(exploracionId: string, quienPide: string | null): Promise<string[]> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") throw new ErrorDeLosObjetivos(404, "Esa preventa no existe.");
  const fila = lectura.fila;
  if (fila.archivadaEn) throw new ErrorDeLosObjetivos(409, "La preventa está archivada.");
  const estado = estadoDesdeFila(fila);
  const ya = estado.propuesta.objetivosDeLaPrimera;
  if (ya) return ya.objetivos;

  const marco = marcoDe(fila.marco).clave;
  /* Si no se puede leer lo que se sabe de la empresa (revisión del 8 nov), falla sin guardar: unos objetivos genéricos
     quedarían para siempre, aunque después el contexto exista. La ficha sí es opcional. */
  const [borrador, ficha] = await Promise.all([borradorDelContexto(exploracionId), empresaEnLaFicha(fila.clientId).catch(() => null)]);
  const contexto = estado.contenido.contexto;
  const industria = estado.contenido.casillas.industria;
  const entrada: EntradaDeLosObjetivos = {
    empresa: fila.client.name,
    industria: fila.client.industry ?? null,
    marco,
    objetivoDeLaExploracion: [objetivoDeSmarteam(marco), contexto?.objetivo ? `Ajuste para esta empresa: ${contexto.objetivo}` : null].filter(Boolean).join("\n"),
    ficha: { desafio: ficha?.desafio?.texto ?? null, resultado: ficha?.resultado?.texto ?? null },
    suIndustria: typeof industria === "string" && industria.trim() ? industria : null,
    // La sesión anterior es la que da los objetivos de las demás: acá no hay, y lo de las sesiones leídas tampoco.
    piezas: (borrador?.piezas ?? []).map((p) => ({ ...p, texto: p.texto.slice(0, 2500) })),
    porAveriguar: contexto?.tarjetas ? porAveriguar(contexto.tarjetas).map((k) => NOMBRE_DE_LA_TARJETA[k]) : [],
  };
  const r = await conContextoDeIA(
    { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: fila.clientId, triggeredByEmail: quienPide, origen: ORIGEN_DE_LOS_OBJETIVOS },
    () => getAnthropic().messages.create(pedidoDeLosObjetivos(entrada), { timeout: 45_000, maxRetries: 1 }),
  );
  const objetivos = leerLosObjetivos(r);

  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const actual = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!actual) return objetivos;
    const p = leerPropuesta(actual.propuesta);
    // Si otra pestaña los guardó mientras tanto, quedan esos.
    if (p.objetivosDeLaPrimera) return p.objetivosDeLaPrimera.objetivos;
    const propuesta = { ...p, objetivosDeLaPrimera: { en: new Date().toISOString(), objetivos } };
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { propuesta: propuesta as unknown as Prisma.InputJsonValue } });
    return objetivos;
  });
}
