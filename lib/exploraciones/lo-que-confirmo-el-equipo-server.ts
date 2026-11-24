/**
 * lib/exploraciones/lo-que-confirmo-el-equipo-server.ts — la ÚNICA lectura de «Lo que confirmó el equipo» de una empresa
 * (etapa 1 del plan maestro de «Hablar con Nexus», 23 nov). SERVIDOR.
 *
 * Recibe la CUENTA y el ALCANCE, nunca la sesión del navegador: quien llama ya verificó que la persona ve esa empresa
 * (la memoria la piden agentes que ya pasaron su guardia; los casos de uso, la ruta de la preventa; el conector de Claude
 * la usará como herramienta de lectura, con su propia verificación de la cuenta). Devuelve lo ya cortado por el alcance
 * (./lo-que-confirmo-el-equipo.ts › `paraElAlcance`): lo interno nunca sale de acá hacia un documento del cliente ni
 * hacia el modelo que lo escribe. Desde el 24 nov, lo interno que la persona PIDE puede llegar a la página de La escala:
 * lo escribe el modelo con las palabras del pedido y el código lo verifica contra el alcance interno
 * (lib/pedirle-a-nexus/veracidad.ts), sin que el modelo lo lea de aquí.
 *
 * ⛔ Nunca mezcla empresas: las preventas se buscan por `clientId`, y los hechos piden la preventa Y la empresa (un hecho
 * que por error quedara con otra empresa no se lee; INV45 lo caza). Solo los hechos de una nota que sigue escrita.
 * Nunca tira: sin tablas o con un error, vacío.
 */
import "server-only";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { leerContenido } from "./esquemas";
import { loQueSabeElEquipo, cuandoSeAgrego } from "./lo-que-sabes";
import { DE_LA_PREVENTA } from "./marco";
import { confirmadoParaLosCasos, MAX_NOTAS_CONFIRMADAS, paraElAlcance, type AlcanceDelEquipo, type NotaConfirmada } from "./lo-que-confirmo-el-equipo";

/** Cuántas preventas de la empresa se leen como mucho (las de actividad más reciente). */
const MAX_PREVENTAS = 10;
/** Cuántos hechos por nota. */
const HECHOS_POR_NOTA = 12;

/**
 * Lo que confirmó el equipo de esta empresa, la nota más nueva primero, cortado para `alcance`. Vacío si no hay.
 * Incluye la preventa desde la que se lee: los casos de uso no leen sus notas por otro lado.
 */
export async function loQueConfirmoElEquipo(clientId: string, alcance: AlcanceDelEquipo): Promise<NotaConfirmada[]> {
  if (!clientId || !modeloDisponible(prisma.exploracionDeVenta)) return [];
  try {
    const filas = await prisma.exploracionDeVenta.findMany({
      where: { clientId, ...DE_LA_PREVENTA },
      orderBy: { updatedAt: "desc" },
      take: MAX_PREVENTAS,
      select: { id: true, clientId: true, contenido: true, archivadaEn: true },
    });
    const notas: (Omit<NotaConfirmada, "autor" | "hechos"> & { por: string | null })[] = [];
    for (const f of filas) {
      if (f.clientId !== clientId) continue;
      const contenido = leerContenido(f.contenido);
      for (const n of loQueSabeElEquipo(contenido.notas)) {
        const autor = contenido.autoresDeLasNotas?.[n.clave];
        const cuando = autor?.en ?? (cuandoSeAgrego(n.clave) !== null ? new Date(cuandoSeAgrego(n.clave)!).toISOString() : new Date(0).toISOString());
        notas.push({ clave: n.clave, texto: n.texto, en: cuando, por: autor?.por?.trim().toLowerCase() || null, preventa: { id: f.id, archivada: !!f.archivadaEn } });
      }
    }
    notas.sort((a, b) => b.en.localeCompare(a.en));
    const elegidas = notas.slice(0, MAX_NOTAS_CONFIRMADAS);
    if (!elegidas.length) return [];

    const [hechos, miembros] = await Promise.all([
      leerHechos(clientId, elegidas),
      (async () => {
        const correos = [...new Set(elegidas.map((n) => n.por).filter((c): c is string => !!c))];
        if (!correos.length || alcance !== "interno") return [];
        return prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } });
      })(),
    ]);
    const nombres = new Map(miembros.filter((m) => m.name?.trim()).map((m) => [m.email.toLowerCase(), m.name!.trim()]));
    const completas: NotaConfirmada[] = elegidas.map(({ por, ...n }) => ({
      ...n,
      autor: por ? (nombres.get(por) ?? null) : null,
      hechos: (hechos.get(`${n.preventa.id}|${n.clave}`) ?? []).slice(0, HECHOS_POR_NOTA),
    }));
    return paraElAlcance(completas, alcance);
  } catch (e) {
    if (!esquemaDesactualizado(e)) console.error("[lo que confirmó el equipo]", clientId, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Los hechos de esas notas, por «preventa|clave». Sin la tabla de hechos (o sin la columna de la nota), ninguno. */
async function leerHechos(clientId: string, notas: readonly { clave: string; preventa: { id: string } }[]): Promise<Map<string, NotaConfirmada["hechos"]>> {
  const out = new Map<string, NotaConfirmada["hechos"]>();
  if (!modeloDisponible(prisma.hechoDeReunion)) return out;
  try {
    const filas = await prisma.hechoDeReunion.findMany({
      where: {
        clientId,
        estado: { not: "desestimado" },
        OR: notas.map((n) => ({ exploracionId: n.preventa.id, notaClave: n.clave })),
      },
      orderBy: { createdAt: "asc" },
      take: notas.length * HECHOS_POR_NOTA,
      select: { exploracionId: true, notaClave: true, tipo: true, tema: true, frase: true },
    });
    for (const f of filas) {
      if (!f.exploracionId || !f.notaClave) continue;
      const k = `${f.exploracionId}|${f.notaClave}`;
      out.set(k, [...(out.get(k) ?? []), { tipo: f.tipo, tema: f.tema, frase: f.frase }]);
    }
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
  }
  return out;
}

/**
 * Lo que leen los agentes de casos de uso de esta preventa (sugerir, personalizar y «Mejorar con IA»): lo que confirmó
 * el equipo de la empresa, cortado para el cliente (lo que proponen llega a la propuesta), y lo que el cliente aceptó de
 * La escala de ESTA preventa, sin la nota que escribió el equipo al anotarlo. "" si no hay nada. Nunca tira.
 */
export async function loConfirmadoParaLosCasos(exploracionId: string, clientId: string): Promise<string> {
  try {
    const [{ estadoConElCliente }, { bloqueDeLoAceptado }] = await Promise.all([import("./hitos-de-la-escala-server"), import("@/lib/impacto/respuesta-del-cliente")]);
    const [notas, cliente] = await Promise.all([loQueConfirmoElEquipo(clientId, "cliente"), estadoConElCliente(exploracionId)]);
    return confirmadoParaLosCasos(notas, bloqueDeLoAceptado(cliente, "su escala", { conNota: false }));
  } catch (e) {
    console.error("[lo que confirmó el equipo] para los casos", exploracionId, e instanceof Error ? e.message : e);
    return "";
  }
}
