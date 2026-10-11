/**
 * lib/exploraciones/para-la-memoria.ts — lo aprendido en la preventa, para la memoria INTERNA de la cuenta. SERVIDOR.
 *
 * La única puerta de lib/memoria a una exploración de venta (el censo de lib/exploraciones/lectores.test.ts la declara
 * como destino «memoria-interna»). Toma la preventa más reciente de la empresa —abierta o archivada— y devuelve:
 *   · lo mismo que recibe el handoff (`bloqueParaElHandoff`: la escala estimada y lo que dijo el cliente), sin su
 *     encabezado largo;
 *   · más lo INTERNO (`internoParaElCse`: presupuesto, quién decide, objeciones, lo que nadie exploró…), rotulado.
 *
 * ⛔ Solo para el alcance interno de la memoria (implementación, avance, resumen del proyecto, exploración del proyecto):
 * el handoff ya la recibe sin lo interno por `exploracionParaElHandoff`, y ningún documento del cliente la lee.
 * Lo que la preventa propuso a la ficha llega por la ficha, con su origen.
 */
import "server-only";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { DE_LA_PREVENTA } from "./marco";
import { bloqueParaElHandoff, internoParaElCse } from "./para-el-handoff";
import { exploracionParaLaPropuesta } from "./servidor";

/** El tope de lo aprendido en la preventa (la memoria puede pedir menos). */
export const TOPE_DE_LA_PREVENTA_EN_LA_MEMORIA = 3000;

export interface LoAprendidoEnLaPreventa {
  /** ISO: la última actividad de la preventa. */
  fecha: string;
  archivada: boolean;
  texto: string;
}

/**
 * PURO: junta lo que ve el handoff y lo interno, sin pasar del tope. Al bloque del handoff se le saca su encabezado
 * (el rótulo «=== EXPLORACIÓN DE VENTA… ===» y su explicación): la memoria pone el suyo. Lo interno va primero y con la
 * mitad del espacio como mucho: es lo que el handoff no recibe.
 */
export function textoDeLoAprendido(bloque: string, interno: readonly { etiqueta: string; lineas: string[] }[], tope: number): string {
  const lineas = bloque.split("\n");
  if (lineas[0]?.startsWith("=== ")) lineas.splice(0, 2);
  const visible = lineas.join("\n").trim();
  const deAdentro = interno
    .filter((x) => x.lineas.length)
    .map((x) => `### ${x.etiqueta} (INTERNO — nunca se cita al cliente)\n${x.lineas.map((l) => `- ${l}`).join("\n")}`)
    .join("\n");
  const recortar = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, Math.max(0, n - 14)).trimEnd()}\n(…recortado)`);
  const internoTexto = deAdentro ? recortar(deAdentro, Math.floor(tope / 2)) : "";
  const queda = tope - internoTexto.length - (internoTexto && visible ? 2 : 0);
  const visibleTexto = visible && queda > 120 ? recortar(visible, queda) : "";
  return [internoTexto, visibleTexto].filter(Boolean).join("\n\n");
}

/**
 * Si la empresa tuvo una preventa (la más reciente, abierta o archivada), sin leer su contenido: para los conteos de «Lo
 * que la IA ya sabe» (lib/memoria › `queSabeLaIA`). null si no hay ninguna.
 */
export async function ultimaPreventa(clientId: string): Promise<{ fecha: string; archivada: boolean } | null> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return null;
  const fila = await prisma.exploracionDeVenta.findFirst({
    where: { clientId, ...DE_LA_PREVENTA },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true, archivadaEn: true },
  });
  return fila ? { fecha: fila.updatedAt.toISOString(), archivada: !!fila.archivadaEn } : null;
}

/** Lo aprendido en la preventa más reciente de la empresa, o null si no hay ninguna (o la escala no está publicada). */
export async function loAprendidoEnLaPreventa(
  clientId: string,
  opts: { tope?: number } = {},
): Promise<LoAprendidoEnLaPreventa | null> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return null;
  const fila = await prisma.exploracionDeVenta.findFirst({
    where: { clientId, ...DE_LA_PREVENTA },
    orderBy: { updatedAt: "desc" },
    select: { id: true, updatedAt: true, archivadaEn: true },
  });
  if (!fila) return null;
  const datos = await exploracionParaLaPropuesta(fila.id);
  if (!datos) return null;
  const texto = textoDeLoAprendido(
    bloqueParaElHandoff(datos),
    internoParaElCse(datos.estado, datos.escala),
    Math.min(opts.tope ?? TOPE_DE_LA_PREVENTA_EN_LA_MEMORIA, TOPE_DE_LA_PREVENTA_EN_LA_MEMORIA),
  );
  if (!texto.trim()) return null;
  return { fecha: fila.updatedAt.toISOString(), archivada: !!fila.archivadaEn, texto };
}
