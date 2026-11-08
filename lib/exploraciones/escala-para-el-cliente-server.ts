/**
 * lib/exploraciones/escala-para-el-cliente-server.ts — LA PUERTA de la escala hacia el cliente (Elías, 30 oct). SERVIDOR.
 *
 * `escalaParaElCliente` es lo único que puede leer de una exploración lo que llega a una página pública
 * (lib/exploraciones/lectores.test.ts lo hace cumplir). Devuelve lo que deja pasar ./escala-para-el-cliente.ts: lo que el
 * vendedor usó (con evidencia, o por explorar si es una hipótesis), de las áreas que eligió, sin citas, porqués, fuentes
 * ni quién la lleva. Sirve lo medido HOY: no hay foto.
 * null = no se muestra: la exploración está archivada, es la de un proyecto (solo la preventa y la de la cuenta se
 * comparten), o su contenedor hoy es de otra empresa (una fusión o una reasignación pueden dejarlos cruzados: invariante
 * #1). `resultados` vacío = no hay ningún equipo para mostrar (sin elegir y sin nada usado). Un equipo elegido sin nada
 * ubicado viene igual, «En medición» (8 nov).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { detallesDelResultado, dimensionDeCadaRiesgo, type DetalleDeLaDimension } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { partesDeLaPagina, resultadosDeLaEscala } from "./escala-para-el-cliente";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";
import { ultimaMedicionDe } from "./versiones-de-la-escala";

export interface EscalaParaElCliente {
  empresa: string;
  dominio: string | null;
  fecha: string | null;
  /** Las áreas con algo medido, en orden: si son varias, la página las pone como pestañas. */
  areas: { id: string; nombre: string }[];
  resultados: ResultadoDelTest[];
  /** Por área, las dimensiones con un nivel por explorar (una hipótesis que usó el vendedor). */
  porExplorar: Record<string, string[]>;
  /** Las partes de las áreas de la página, con algo o no: lo que dice el «Acceso». */
  partesEnJuego: number;
  detalles: Record<string, DetalleDeLaDimension>;
  dimensionDelRiesgo: Record<string, string>;
}

export async function escalaParaElCliente(exploracionId: string): Promise<EscalaParaElCliente | null> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return null;
  const fila = lectura.fila;
  if (fila.archivadaEn) return null;
  if (fila.projectId) {
    const p = await prisma.project.findUnique({ where: { id: fila.projectId }, select: { clientId: true, serviceType: true } });
    if (p?.clientId !== fila.clientId || p.serviceType !== SENTINEL_SERVICE_TYPE) return null;
  }
  const cliente = await prisma.client.findUnique({ where: { id: fila.clientId }, select: { name: true, emailDomains: true } });
  if (!cliente) return null;

  const vacio: EscalaParaElCliente = { empresa: cliente.name, dominio: cliente.emailDomains[0] ?? null, fecha: null, areas: [], resultados: [], porExplorar: {}, partesEnJuego: 0, detalles: {}, dimensionDelRiesgo: {} };
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return vacio;
  const estado = estadoDesdeFila(fila);
  const escala = aplicarEdicion(general.general, estado.edicion);
  const lienzo = escalaDeLaExploracion(general.general, estado);
  const deLasAreas = resultadosDeLaEscala(escala, lienzo, estado);
  if (!deLasAreas.length) return vacio;
  const resultados = deLasAreas.map((x) => x.resultado);
  const medida = (await ultimaMedicionDe([fila.id])).get(fila.id) ?? fila.updatedAt;
  return {
    ...vacio,
    fecha: medida.toISOString(),
    areas: resultados.map((r) => ({ id: r.areaId, nombre: r.areaNombre })),
    resultados,
    porExplorar: Object.fromEntries(deLasAreas.map((x) => [x.resultado.areaId, x.porExplorar])),
    partesEnJuego: partesDeLaPagina(lienzo, estado),
    detalles: Object.assign({}, ...resultados.map((r) => detallesDelResultado(escala, r))),
    dimensionDelRiesgo: Object.assign({}, ...resultados.map((r) => dimensionDeCadaRiesgo(escala, r))),
  };
}
