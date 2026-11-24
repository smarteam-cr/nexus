/**
 * lib/exploraciones/escala-para-el-cliente-server.ts — LA PUERTA de la escala hacia el cliente (Elías, 30 oct). SERVIDOR.
 *
 * `escalaParaElCliente` es lo único que puede leer de una exploración lo que llega a una página pública
 * (lib/exploraciones/lectores.test.ts lo hace cumplir). Devuelve lo que deja pasar ./escala-para-el-cliente.ts: lo que el
 * vendedor usó (con evidencia, o por explorar si es una hipótesis), de las áreas que eligió, sin citas, porqués, fuentes
 * ni quién la lleva. Arma lo medido HOY: lo que ve el cliente es la foto que se PUBLICÓ con esto (16 nov,
 * ./escala-publicada.ts); la página pública solo pregunta acá si todavía se puede mostrar (`seMuestraAlCliente`).
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
import { areasDeLaPagina, logoQueSeSirve, partesDeLaPagina, resultadosDeLaEscala } from "./escala-para-el-cliente";
import { perdidaDeLaEscala } from "./perdida-de-la-escala";
import { resumenParaLaPagina, type ResumenDeLaPagina, type ResumenGuardado } from "./resumen-de-la-escala";
import type { EstadoDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";
import { ultimaMedicionDe } from "./versiones-de-la-escala";

export interface EscalaParaElCliente {
  empresa: string;
  dominio: string | null;
  /**
   * El logo de la ficha del cliente (`Client.logoUrl`, el bucket público que ya sirven el kickoff y el cronograma), o null:
   * la página muestra el círculo con la inicial (12 nov). Solo una dirección https: nada que no se sirva hoy.
   */
  logo: string | null;
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
  /** Los textos fijos de la página cambiados para esta empresa (lib/external/textos-de-la-pagina.ts): la vista los pone en su lugar. */
  textos: Record<string, string>;
}

/** La página como la ve la pantalla interna: todas las áreas, y cuáles ve el cliente. */
export interface PaginaParaElCse extends EscalaParaElCliente {
  alCliente: string[];
}

type Areas = (lienzo: EscalaDelLienzo, estado: EstadoDeExploracion) => readonly string[];

/**
 * La exploración y su empresa, si la página se puede mostrar. null: no hay exploración, empresa o proyecto que cuadre (y,
 * para la pública: archivada o la de un proyecto). La misma regla para armar la página y para servir la foto publicada.
 */
async function contenedorDeLaPagina(exploracionId: string, publica: boolean) {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return null;
  const fila = lectura.fila;
  if (publica && fila.archivadaEn) return null;
  if (fila.projectId) {
    const p = await prisma.project.findUnique({
      where: { id: fila.projectId },
      select: { clientId: true, serviceType: true },
    });
    if (p?.clientId !== fila.clientId) return null;
    if (publica && p.serviceType !== SENTINEL_SERVICE_TYPE) return null;
  }
  const cliente = await prisma.client.findUnique({
    where: { id: fila.clientId },
    select: { name: true, emailDomains: true, logoUrl: true },
  });
  if (!cliente) return null;
  return { fila, cliente };
}

/**
 * Si la página de esta exploración todavía se puede mostrar afuera (16 nov): la foto publicada se sirve solo si lo de hoy
 * lo permite. Archivar la exploración, pasarla a otra empresa o borrar la empresa la apagan aunque haya una foto.
 */
export async function seMuestraAlCliente(exploracionId: string): Promise<boolean> {
  return !!(await contenedorDeLaPagina(exploracionId, true));
}

/** La página de la foto publicada (./escala-publicada.ts), por esta puerta: la página pública no lee otra cosa de acá. */
export { paginaDeLaFoto } from "./escala-publicada";

/** El cálculo de la página, uno solo para las dos puertas. null: no hay exploración, empresa o proyecto que cuadre. */
async function armarLaPagina(
  exploracionId: string,
  o: { publica: boolean; areas?: Areas; resumen?: ResumenGuardado | null; textosDelResumen?: Readonly<Record<string, string>> },
): Promise<{
  pagina: EscalaParaElCliente;
  lienzo: EscalaDelLienzo | null;
  estado: EstadoDeExploracion;
} | null> {
  const c = await contenedorDeLaPagina(exploracionId, o.publica);
  if (!c) return null;
  const { fila, cliente } = c;
  const deLaFila = estadoDesdeFila(fila);
  // `o.resumen`: la vista previa de una versión del historial (21 nov), armada con la misma página.
  const estado: EstadoDeExploracion =
    o.resumen !== undefined ? { ...deLaFila, contenido: { ...deLaFila.contenido, resumenDeLaEscala: o.resumen ?? undefined } } : deLaFila;
  const vacio: EscalaParaElCliente = {
    empresa: cliente.name,
    dominio: cliente.emailDomains[0] ?? null,
    logo: logoQueSeSirve(cliente.logoUrl),
    fecha: null,
    areas: [],
    resultados: [],
    porExplorar: {},
    partesEnJuego: 0,
    detalles: {},
    dimensionDelRiesgo: {},
    resumen: resumenParaLaPagina(null, [], {}, {}, { conCitas: false }),
    // Una versión del historial guarda los textos fijos del Resumen (23 nov): la vista previa los usa en lugar de los de hoy.
    textos: o.textosDelResumen
      ? { ...Object.fromEntries(Object.entries(estado.contenido.textosDeLaPagina ?? {}).filter(([k]) => !k.startsWith("resumen."))), ...o.textosDelResumen }
      : (estado.contenido.textosDeLaPagina ?? {}),
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
        porExplorar: Object.fromEntries(deLasAreas.map((x) => [x.resultado.areaId, x.porExplorar])),
        // La pérdida que la empresa validó en la preventa (20 nov): el costo de la primera fila de Ventas.
        perdida: perdidaDeLaEscala(fila.contenido),
      }),
    },
  };
}

export async function escalaParaElCliente(exploracionId: string): Promise<EscalaParaElCliente | null> {
  return (await armarLaPagina(exploracionId, { publica: true }))?.pagina ?? null;
}

/**
 * La misma página para la pantalla interna: todas las áreas de la escala, y cuáles ve el cliente. Sin guardia propia.
 * `resumen`: otro Resumen en lugar del de hoy (la vista previa de una versión del historial, 21 nov).
 */
export async function paginaParaElCse(
  exploracionId: string,
  o: { resumen?: ResumenGuardado | null; textosDelResumen?: Readonly<Record<string, string>> } = {},
): Promise<PaginaParaElCse | null> {
  const r = await armarLaPagina(exploracionId, {
    publica: false,
    areas: (lienzo) => lienzo.areas.map((a) => a.id),
    ...(o.resumen !== undefined ? { resumen: o.resumen } : {}),
    ...(o.textosDelResumen ? { textosDelResumen: o.textosDelResumen } : {}),
  });
  if (!r) return null;
  return {
    ...r.pagina,
    alCliente: r.lienzo ? areasDeLaPagina(r.lienzo, r.estado) : [],
  };
}
