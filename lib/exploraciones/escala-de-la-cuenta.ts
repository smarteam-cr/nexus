import "server-only";

/**
 * lib/exploraciones/escala-de-la-cuenta.ts — LA ESCALA DE LA CUENTA: la de un cliente, la misma pieza que la de la
 * preventa (escala única, 2026-10-28, pedido de Elías). SERVIDOR.
 *
 * Es la exploración del contenedor «Información del cliente» (la que ya ubicaba «Actualizar escala» con «La cuenta
 * entera»): una fila de `ExploracionDeVenta` con `marco = "cs"`, sin tabla nueva. La ficha la pinta con el lienzo de la
 * preventa en modo `cuenta` (LienzoDeExploracion) y la cambia por el PATCH de siempre.
 *   · `laEscalaDeLaCuenta` — la exploración tal como la pinta el lienzo, sin crear nada.
 *   · `abrirLaEscalaDeLaCuenta` — la crea si no está y, si no tiene ningún nivel, le trae lo medido en la preventa
 *     (lib/exploraciones/punto-de-partida.ts) por el escritor de siempre, que deja la versión del día.
 *   · `proyectoDeContextoDeLaEmpresa` — el proyecto de contexto de «Actualizar escala», solo si es de la empresa.
 *   · `reunionesElegidasDeLaEmpresa` — las reuniones que alguien unió a una sesión de cualquier exploración de la empresa:
 *     «Actualizar escala» las lee primero.
 * ⛔ Lee las exploraciones de la empresa a propósito, la preventa y las de cada proyecto (lib/exploraciones/marco.test.ts
 * lo sabe): todas son de la misma empresa (`clientId`).
 */
import { ensureClientInfoProject } from "@/lib/canvas/strategy-project";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { asegurarExploracionDelProyecto } from "./del-proyecto";
import { idsDeLaEscala, type EscalaDelLienzo } from "./escala-del-lienzo";
import { leerContenido } from "./esquemas";
import { DE_LA_PREVENTA } from "./marco";
import { reunionesElegidas } from "./posicionar";
import { escalaDeLaPreventa, hayQueTraer, medidoDeLaPreventa, midioAlgo } from "./punto-de-partida";
import { aplicarCambios, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion, paraLaPantalla, type ExploracionParaLaPantalla } from "./servidor";
import { anotarVersionDelCambio, tieneVersiones } from "./versiones-de-la-escala";

export interface EscalaDeLaCuenta {
  exploracion: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  /** El proyecto «Información del cliente» donde vive. */
  contenedorId: string;
}

/** El contenedor de la empresa, sin crearlo (el más viejo, como `ensureClientInfoProject`). */
async function contenedorDe(clientId: string): Promise<string | null> {
  const p = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL_SERVICE_TYPE },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return p?.id ?? null;
}

/** La exploración viva del contenedor (la de la cuenta), o null. */
async function laViva(contenedorId: string): Promise<string | null> {
  const f = await prisma.exploracionDeVenta.findFirst({ where: { projectId: contenedorId, archivadaEn: null }, select: { id: true } });
  return f?.id ?? null;
}

/** La preventa más reciente de la empresa que midió algo (viva o archivada: lo medido no se pierde al archivarla). */
async function preventaQueMidio(clientId: string) {
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { clientId, ...DE_LA_PREVENTA },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true },
  });
  for (const f of filas) {
    const estado = estadoDesdeFila(f);
    if (midioAlgo(estado)) return { id: f.id, estado };
  }
  return null;
}

async function paraElLienzo(id: string, contenedorId: string): Promise<EscalaDeLaCuenta | null> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return null;
  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return null;
  // La liviana: la pieza La escala no usa las reuniones sin leer ni las sesiones (la cuenta no tiene).
  const exploracion = paraLaPantalla(lectura.fila);
  return { exploracion, escala: escalaDeLaExploracion(general.general, exploracion.estado), contenedorId };
}

/**
 * La escala de la cuenta como la pinta el lienzo, sin crear nada. `faltaAbrir`: hay algo de la preventa que traer (la
 * preventa midió algo y la cuenta nunca midió nada: no existe, o no tiene niveles ni versiones). Solo entonces la
 * pantalla la abre sola; sin preventa, la abre una persona con un botón (abrirla escribe: crea la exploración y, si
 * falta, el contenedor).
 */
export async function laEscalaDeLaCuenta(clientId: string): Promise<{ cuenta: EscalaDeLaCuenta | null; faltaAbrir: boolean }> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return { cuenta: null, faltaAbrir: false };
  try {
    const contenedorId = await contenedorDe(clientId);
    const id = contenedorId ? await laViva(contenedorId) : null;
    if (!contenedorId || !id) return { cuenta: null, faltaAbrir: !!(await preventaQueMidio(clientId)) };
    const cuenta = await paraElLienzo(id, contenedorId);
    const faltaAbrir = !!cuenta && !midioAlgo(cuenta.exploracion.estado) && !(await tieneVersiones(id)) && !!(await preventaQueMidio(clientId));
    return { cuenta, faltaAbrir };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { cuenta: null, faltaAbrir: false };
    throw e;
  }
}

export type ResultadoDeAbrir =
  | {
      ok: true;
      cuenta: EscalaDeLaCuenta;
      /** Cuántas dimensiones trajo de la preventa. */
      traidas: number;
      /** Lo medido en la preventa que no existe en la escala de la cuenta (otra edición, una dimensión retirada). */
      afuera: number;
      /** Había algo que traer y no se pudo (otra persona la cambió entretanto, o el escritor lo rechazó). */
      noSeTrajo: boolean;
    }
  | { ok: false; status: number; error: string };

/**
 * Abre la escala de la cuenta (la crea si no está) y, si nunca midió nada, le trae lo medido en la preventa. Dos
 * tandas por el escritor de siempre (lib/exploraciones/punto-de-partida.ts): primero la edición y el perfil, después lo
 * medido que existe en la escala con que queda la cuenta. Si otra persona la cambió entretanto, no se pisa: queda como
 * está y se avisa. Pide el permiso quien llama (la celda de generar la exploración).
 */
export async function abrirLaEscalaDeLaCuenta(clientId: string, email: string): Promise<ResultadoDeAbrir> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus." };
  const { projectId } = await ensureClientInfoProject(clientId);
  const r = await asegurarExploracionDelProyecto(projectId, email);
  if (!r.ok) return r;

  let traidas = 0;
  let afuera = 0;
  let noSeTrajo = false;
  // Una que ya midió algo alguna vez (tiene versiones) no se vuelve a llenar sola, aunque hoy no tenga niveles.
  const preventa = (await tieneVersiones(r.id)) ? null : await preventaQueMidio(clientId).catch(() => null);
  const lectura = preventa ? await leerExploracion(r.id) : null;
  if (preventa && lectura?.estado === "ok" && hayQueTraer(preventa.estado, estadoDesdeFila(lectura.fila))) {
    let fila = lectura.fila;
    const ediciones = new Set(general.general.ediciones.map((e) => e.slug));
    const escala = escalaDeLaPreventa(preventa.estado, estadoDesdeFila(fila), ediciones);
    if (escala.length) {
      const a = await aplicarCambios(r.id, fila.version, escala, general.general, { quienPide: email });
      if (a.estado === "ok") fila = a.fila;
      else {
        noSeTrajo = true;
        console.error(`[exploraciones/escala-de-la-cuenta] no se trajo la edición de la preventa ${preventa.id}: ${a.estado}`);
      }
    }
    if (!noSeTrajo) {
      // Lo medido, contra la escala con que quedó la cuenta (la edición de la tanda 1).
      const cuenta = estadoDesdeFila(fila);
      const lienzo = escalaDeLaExploracion(general.general, cuenta);
      const ids = idsDeLaEscala(lienzo);
      const medido = medidoDeLaPreventa(preventa.estado, cuenta, { dimensiones: ids.dimensiones, criterios: ids.criterios, areas: new Set(lienzo.areas.map((x) => x.id)) });
      afuera = medido.afuera;
      if (medido.ops.length) {
        const m = await aplicarCambios(r.id, fila.version, medido.ops, general.general, { quienPide: email });
        if (m.estado === "ok") {
          traidas = medido.dimensiones;
          // La versión del día: la historia empieza en lo medido en la preventa.
          if (m.confirmado) anotarVersionDelCambio(r.id, email);
        } else {
          noSeTrajo = true;
          console.error(`[exploraciones/escala-de-la-cuenta] no se trajo lo medido en la preventa ${preventa.id}: ${m.estado}`);
        }
      }
    }
  }
  const cuenta = await paraElLienzo(r.id, projectId);
  if (!cuenta) return { ok: false, status: 404, error: "No se pudo abrir la escala de la cuenta." };
  return { ok: true, cuenta, traidas, afuera, noSeTrajo };
}

/**
 * El proyecto de contexto de «Actualizar escala» sobre la cuenta, solo si es de ESTA empresa (invariante #1: el handoff,
 * los cuestionarios y el cronograma de otra empresa nunca entran a lo que lee el agente). null si no.
 */
export async function proyectoDeContextoDeLaEmpresa(clientId: string, projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  const p = await prisma.project.findFirst({ where: { id: projectId, clientId }, select: { id: true } });
  return p?.id ?? null;
}

/**
 * Las reuniones de Meet que alguien eligió en las exploraciones vivas de la empresa (unidas a una sesión, o elegidas en
 * el buscador viejo). Solo ids: quien las lee pasa por el chokepoint, que descarta las que no son de la empresa.
 */
export async function reunionesElegidasDeLaEmpresa(clientId: string): Promise<string[]> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return [];
  try {
    const filas = await prisma.exploracionDeVenta.findMany({
      where: { clientId, archivadaEn: null },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { contenido: true },
    });
    return reunionesElegidas(filas.map((f) => leerContenido(f.contenido)));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}
