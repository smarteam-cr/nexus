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
 *
 * `paginaParaElCse` (La escala interna editable, 8 nov; Elías: «la página de resultados debe verse igual externo que
 * interno»): la MISMA página, armada por el MISMO cálculo (`armarLaPagina`), para la pantalla interna. Cambian dos cosas,
 * y ninguna le llega al cliente: trae TODAS las áreas de la escala (con `alCliente` diciendo cuáles ve) para poder
 * editarlas antes de mostrarlas, y no se frena por archivada ni por ser la de un proyecto (quien llama ya pasó la
 * guardia de la exploración). La regla de la empresa (el proyecto de la exploración es de su empresa) vale igual.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { detallesDelResultado, dimensionDeCadaRiesgo, type DetalleDeLaDimension } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { areasDeLaPagina, partesDeLaPagina, resultadosDeLaEscala } from "./escala-para-el-cliente";
import { resumenParaLaPagina, type ResumenDeLaPagina } from "./resumen-de-la-escala";
import type { EstadoDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
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
  /**
   * La portada «Resumen» (9 nov, ./resumen-de-la-escala.ts): de las áreas que ve el cliente. En la página pública, SIN las
   * citas (`conCitas: false`); en la interna, con ellas, para verificar de dónde sale cada cifra.
   */
  resumen: ResumenDeLaPagina;
}

/** La página como la ve la pantalla interna: todas las áreas, y cuáles ve el cliente. */
export interface PaginaParaElCse extends EscalaParaElCliente {
  alCliente: string[];
}

type Areas = (lienzo: EscalaDelLienzo, estado: EstadoDeExploracion) => readonly string[];

/** El cálculo de la página, uno solo para las dos puertas. null: no hay exploración, empresa o proyecto que cuadre. */
async function armarLaPagina(
  exploracionId: string,
  o: { publica: boolean; areas?: Areas },
): Promise<{
  pagina: EscalaParaElCliente;
  lienzo: EscalaDelLienzo | null;
  estado: EstadoDeExploracion;
} | null> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return null;
  const fila = lectura.fila;
  if (o.publica && fila.archivadaEn) return null;
  if (fila.projectId) {
    const p = await prisma.project.findUnique({
      where: { id: fila.projectId },
      select: { clientId: true, serviceType: true },
    });
    if (p?.clientId !== fila.clientId) return null;
    if (o.publica && p.serviceType !== SENTINEL_SERVICE_TYPE) return null;
  }
  const cliente = await prisma.client.findUnique({
    where: { id: fila.clientId },
    select: { name: true, emailDomains: true },
  });
  if (!cliente) return null;

  const estado = estadoDesdeFila(fila);
  const vacio: EscalaParaElCliente = {
    empresa: cliente.name,
    dominio: cliente.emailDomains[0] ?? null,
    fecha: null,
    areas: [],
    resultados: [],
    porExplorar: {},
    partesEnJuego: 0,
    detalles: {},
    dimensionDelRiesgo: {},
    resumen: resumenParaLaPagina(null, [], {}, {}, { conCitas: false }),
  };
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { pagina: vacio, lienzo: null, estado };
  const escala = aplicarEdicion(general.general, estado.edicion);
  const lienzo = escalaDeLaExploracion(general.general, estado);
  const deLasAreas = resultadosDeLaEscala(escala, lienzo, estado, o.areas?.(lienzo, estado));
  if (!deLasAreas.length) return { pagina: vacio, lienzo, estado };
  const resultados = deLasAreas.map((x) => x.resultado);
  // El Resumen va con las áreas que VE el cliente, también en la pantalla interna (que trae todas para editarlas).
  const alCliente = new Set(o.publica ? resultados.map((r) => r.areaId) : areasDeLaPagina(lienzo, estado));
  const entorno = { edicion: estado.edicion, perfilCierre: estado.perfilCierre, perfilDespues: estado.perfilDespues, escalaVersion: escala.version };
  const medida = (await ultimaMedicionDe([fila.id])).get(fila.id) ?? fila.updatedAt;
  return {
    lienzo,
    estado,
    pagina: {
      ...vacio,
      fecha: medida.toISOString(),
      areas: resultados.map((r) => ({ id: r.areaId, nombre: r.areaNombre })),
      resultados,
      porExplorar: Object.fromEntries(deLasAreas.map((x) => [x.resultado.areaId, x.porExplorar])),
      partesEnJuego: partesDeLaPagina(lienzo, estado),
      detalles: Object.assign({}, ...resultados.map((r) => detallesDelResultado(escala, r))),
      dimensionDelRiesgo: Object.assign({}, ...resultados.map((r) => dimensionDeCadaRiesgo(escala, r))),
      resumen: resumenParaLaPagina(estado.contenido.resumenDeLaEscala, resultados.filter((r) => alCliente.has(r.areaId)), estado.contenido.chequeo, entorno, {
        conCitas: !o.publica,
        areasFuera: lienzo.areas.filter((a) => !alCliente.has(a.id)).map((a) => a.nombre),
      }),
    },
  };
}

export async function escalaParaElCliente(exploracionId: string): Promise<EscalaParaElCliente | null> {
  return (await armarLaPagina(exploracionId, { publica: true }))?.pagina ?? null;
}

/** La misma página para la pantalla interna: todas las áreas de la escala, y cuáles ve el cliente. Sin guardia propia. */
export async function paginaParaElCse(exploracionId: string): Promise<PaginaParaElCse | null> {
  const r = await armarLaPagina(exploracionId, {
    publica: false,
    areas: (lienzo) => lienzo.areas.map((a) => a.id),
  });
  if (!r) return null;
  return {
    ...r.pagina,
    alCliente: r.lienzo ? areasDeLaPagina(r.lienzo, r.estado) : [],
  };
}
