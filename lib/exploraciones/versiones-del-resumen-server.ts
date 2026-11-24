/**
 * lib/exploraciones/versiones-del-resumen-server.ts — el HISTORIAL DE VERSIONES del Resumen de La escala (Elías, 21 nov;
 * DECISIONS «Historial de versiones»). SERVIDOR. Reemplaza a «Volver a la versión anterior» (./resumen-anterior.ts).
 *
 *   · Rehacer con IA guarda el de antes («Editado» si alguien lo cambió a mano después de la última versión) y el nuevo
 *     («Rehecho con IA»): lo hace `generarElResumenDeLaEscala` con `guardarAlRehacer`.
 *   · «Publicar» guarda el Resumen publicado («Publicado», protegida): `guardarAlPublicar`, desde `publicarLaEscala`.
 *   · «Usar esta versión» guarda el de ahora, pone la elegida y deja «Vuelta a una anterior». Nunca toca lo publicado.
 *
 * Desde el 23 nov («✨ Pedirle a Nexus», etapa 3 del plan maestro de «Hablar con Nexus») la foto lleva también los textos
 * fijos del Resumen (el titular, la bajada, los títulos: las claves `resumen.*` de `textosDeLaPagina`): un cambio al
 * titular deja su versión y vuelve con «Usar esta versión». Una versión de antes no los trae, y usarla no los toca. Sin
 * textos cambiados la huella es la de siempre (las versiones del 21 nov siguen siendo «la actual»). Las versiones del
 * Resumen son las de la exploración SIN pieza; las de la página de cada área viven aparte (./versiones-del-area-server.ts).
 *
 * Las versiones se guardan DESPUÉS de soltar la fila de la exploración: la tabla tiene una FK a ella y, con la fila
 * bloqueada (FOR UPDATE), insertar desde otra conexión esperaría a la transacción que la bloqueó.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { guardarVersion, filasDelHistorial } from "@/lib/versiones/guardar-server";
import { armarHistorial, huellaDeContenido } from "@/lib/versiones/historial";
import { conNombres, type VersionConNombre } from "@/lib/versiones/nombres-server";
import { fechaCorta } from "@/lib/canvas/versiones";
import { leerContenido, leerResumenGuardado } from "./esquemas";
import type { ResumenGuardado } from "./resumen-de-la-escala";
import { paginaParaElCse, type PaginaParaElCse } from "./escala-para-el-cliente-server";
import { bloquearFila } from "./servidor";
import { guardarLasAreasAlPublicar } from "./versiones-del-area-server";

/** Las claves de los textos fijos del Resumen (lib/external/textos-de-la-pagina.ts › `CLAVES.delResumen`). */
const DEL_RESUMEN = "resumen.";

/** Los textos fijos del Resumen cambiados para esta empresa: lo que la foto guarda además del Resumen. */
export function textosDelResumen(textos: Readonly<Record<string, string>> | null | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(textos ?? {}).filter(([k]) => k.startsWith(DEL_RESUMEN)));
}

/** Lo que guarda una versión del Resumen: el Resumen y, desde el 23 nov, sus textos fijos. */
type FotoDelResumen = ResumenGuardado & { textosDelResumen?: Record<string, string> };

/** Los textos fijos de una versión guardada; undefined: una versión de antes del 23 nov, que no los trae. */
export function textosDeLaVersion(contenido: unknown): Record<string, string> | undefined {
  if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) return undefined;
  const t = (contenido as { textosDelResumen?: unknown }).textosDelResumen;
  if (!t || typeof t !== "object" || Array.isArray(t)) return undefined;
  return Object.fromEntries(
    Object.entries(t as Record<string, unknown>).filter((e): e is [string, string] => e[0].startsWith(DEL_RESUMEN) && typeof e[1] === "string"),
  );
}

/** Los textos de la página con los del Resumen reemplazados por `delResumen` (los de las áreas no se tocan). */
export function conTextosDelResumen(textos: Readonly<Record<string, string>> | null | undefined, delResumen: Readonly<Record<string, string>>): Record<string, string> {
  return { ...Object.fromEntries(Object.entries(textos ?? {}).filter(([k]) => !k.startsWith(DEL_RESUMEN))), ...delResumen };
}

/**
 * El Resumen como queda al leerlo de la base (`leerResumenGuardado` completa y ordena lo que falta): así un Resumen recién
 * escrito y el mismo leído después dan la misma huella.
 */
function normalizado(r: ResumenGuardado): ResumenGuardado {
  return leerResumenGuardado(JSON.parse(JSON.stringify(r))) ?? r;
}

/** Lo que se compara: el Resumen normalizado y, si hay, sus textos fijos (sin ellos, la huella de siempre). */
function paraLaHuella(r: ResumenGuardado, textos: Readonly<Record<string, string>> | null | undefined): unknown {
  const t = textosDelResumen(textos);
  return Object.keys(t).length ? { ...normalizado(r), textosDelResumen: t } : normalizado(r);
}

/**
 * La huella con que se compara un Resumen (la misma en la lista, al guardar y en la firma de la pantalla). `textos`: los
 * de la página (`contenido.textosDeLaPagina`); solo cuentan los del Resumen.
 */
export function huellaDelResumen(r: ResumenGuardado | null | undefined, textos?: Readonly<Record<string, string>> | null): string | null {
  return r ? huellaDeContenido(paraLaHuella(r, textos)) : null;
}

/** Guarda una versión del Resumen con sus textos fijos. No lanza (lo hace `guardarVersion`). */
export async function guardarVersionDelResumen(
  exploracionId: string,
  crudo: ResumenGuardado,
  v: {
    tipo: Parameters<typeof guardarVersion>[1]["tipo"];
    nota: string;
    creadaPor: string | null;
    publicada?: boolean;
    createdAt?: Date;
    textos?: Readonly<Record<string, string>> | null;
    forzar?: boolean;
  },
) {
  const r = normalizado(crudo);
  const foto: FotoDelResumen = { ...r, textosDelResumen: textosDelResumen(v.textos) };
  return guardarVersion(
    { exploracionId, pieza: null },
    {
      tipo: v.tipo,
      nota: v.nota,
      creadaPor: v.creadaPor,
      huella: huellaDeContenido(paraLaHuella(r, v.textos)),
      contenido: foto,
      ...(v.forzar ? { forzar: true } : {}),
      ...(v.publicada ? { publicada: true, protegida: true } : {}),
      ...(v.createdAt ? { createdAt: v.createdAt } : {}),
    },
  );
}


/**
 * La versión de ANTES de un cambio de Nexus, a la que vuelve «Deshacer». Si la última guardada es de antes del 23 nov (no
 * trae los textos fijos), se guarda una nueva aunque sea igual: volver a la vieja no devolvería el titular ni la bajada
 * (la revisión del 23 nov). No lanza.
 */
export async function guardarLaDeAntesDeNexus(exploracionId: string, resumen: ResumenGuardado, textos: Readonly<Record<string, string>> | null | undefined) {
  const ultima = modeloDisponible(prisma.versionDeDocumento)
    ? await prisma.versionDeDocumento.findFirst({ where: { exploracionId, pieza: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { contenido: true } }).catch(() => null)
    : null;
  const deFormatoViejo = !!ultima && textosDeLaVersion(ultima.contenido) === undefined;
  return guardarVersionDelResumen(exploracionId, resumen, { tipo: "antes", nota: "Así estaba antes del cambio de Nexus.", creadaPor: null, textos, forzar: deFormatoViejo });
}

/** Los textos de la página de una exploración, como están ahora (rehacer no los toca). Nunca lanza: sin ellos, vacío. */
async function textosDeHoy(exploracionId: string): Promise<Record<string, string>> {
  try {
    const f = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true } });
    return f ? (leerContenido(f.contenido).textosDeLaPagina ?? {}) : {};
  } catch {
    return {};
  }
}

/** Al rehacer con IA: el de antes (si había) y el nuevo. No lanza. */
export async function guardarAlRehacer(exploracionId: string, o: { antes: ResumenGuardado | null | undefined; nuevo: ResumenGuardado; email: string | null }) {
  const textos = await textosDeHoy(exploracionId);
  if (o.antes) await guardarVersionDelResumen(exploracionId, o.antes, { tipo: "antes", nota: "Así estaba antes de rehacerlo con IA.", creadaPor: null, textos });
  await guardarVersionDelResumen(exploracionId, o.nuevo, { tipo: "ia", nota: "Después de rehacerlo con IA", creadaPor: o.email, textos });
}

/** Al publicar: el Resumen que quedó publicado, y la página de cada área (./versiones-del-area-server.ts). No lanza. */
export async function guardarAlPublicar(exploracionId: string, email: string | null) {
  try {
    const f = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true } });
    const c = f ? leerContenido(f.contenido) : undefined;
    if (c?.resumenDeLaEscala)
      await guardarVersionDelResumen(exploracionId, c.resumenDeLaEscala, { tipo: "publicado", nota: "Al publicar", creadaPor: email, publicada: true, textos: c.textosDeLaPagina });
    if (c) await guardarLasAreasAlPublicar(exploracionId, c, email);
  } catch (e) {
    console.error("[exploraciones/versiones-del-resumen] no se guardó la versión publicada:", e instanceof Error ? e.message : e);
  }
}

/**
 * La anterior que guardaba el botón de la mañana del 21 nov entra al historial una vez, con su fecha. Es la única
 * escritura al abrir el historial. Se reconoce por su huella, con un candado por exploración (pg_advisory_xact_lock):
 * dos personas que abren el historial a la vez no la guardan dos veces. Sin FOR UPDATE de la fila (ver arriba: la FK).
 */
async function pasarLaAnterior(exploracionId: string, contenido: ReturnType<typeof leerContenido>) {
  const anterior = contenido.resumenAnterior;
  if (!anterior) return;
  const r = normalizado(anterior.resumen);
  const huella = huellaDeContenido(r);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`versiones-del-resumen:${exploracionId}`}))`;
    const ya = await tx.versionDeDocumento.findFirst({ where: { exploracionId, pieza: null, huella }, select: { id: true } });
    if (ya) return;
    await tx.versionDeDocumento.create({
      data: {
        exploracionId,
        origen: anterior.motivo === "volver" ? "La que se reemplazó al volver a la versión anterior." : "La que había antes de rehacerlo con IA.",
        tipo: "guardada",
        creadaPor: anterior.por,
        huella,
        secciones: [],
        contenido: r as unknown as Prisma.InputJsonValue,
        createdAt: new Date(new Date(anterior.en).getTime() - 1000),
      },
    });
  });
}

export interface HistorialDelResumen {
  versiones: VersionConNombre[];
  /** La huella del Resumen de hoy: la pantalla la manda al usar una versión (null: no hay Resumen). */
  firma: string | null;
}

export async function historialDelResumen(exploracionId: string): Promise<HistorialDelResumen | null> {
  const f = await prisma.exploracionDeVenta.findUnique({
    where: { id: exploracionId },
    select: { contenido: true, accesoALaEscala: { select: { publicadaEn: true, revokedAt: true } } },
  });
  if (!f) return null;
  const c = leerContenido(f.contenido);
  const firma = huellaDelResumen(c.resumenDeLaEscala, c.textosDeLaPagina);
  if (!modeloDisponible(prisma.versionDeDocumento)) return { versiones: [], firma };
  await pasarLaAnterior(exploracionId, c);
  const filas = await filasDelHistorial({ exploracionId, pieza: null });
  const publicado = !!f.accesoALaEscala?.publicadaEn && !f.accesoALaEscala.revokedAt;
  return { versiones: await conNombres(armarHistorial(filas, { huellaActual: firma, publicado })), firma };
}

/** La página del Resumen armada con esa versión (la vista previa). null: no es de esta exploración. */
export async function paginaDeLaVersion(exploracionId: string, versionId: string): Promise<PaginaParaElCse | null> {
  const v = await prisma.versionDeDocumento.findFirst({ where: { id: versionId, exploracionId, pieza: null }, select: { contenido: true } });
  if (!v) return null;
  const r = leerResumenGuardado(v.contenido);
  if (!r) return null;
  return paginaParaElCse(exploracionId, { resumen: r, textosDelResumen: textosDeLaVersion(v.contenido) });
}

export type ResultadoDeUsar = { ok: true } | { ok: false; status: number; error: string };

/**
 * «Usar esta versión»: con la fila bloqueada, pone el Resumen de esa versión (y sus textos fijos, si los guardó). `firma`:
 * la del Resumen que ve la pantalla; si cambió (otra persona, o Nexus al rehacerlo), 409. `enCurso`: el candado de
 * «Rehacer con IA» (una corrida a la vez). Lo publicado no se toca: el cliente ve lo mismo hasta «Publicar».
 */
export async function usarVersionDelResumen(o: {
  exploracionId: string;
  versionId: string;
  email: string | null;
  firma: string | null;
  enCurso: (tx: Prisma.TransactionClient) => Promise<boolean>;
}): Promise<ResultadoDeUsar> {
  const v = await prisma.versionDeDocumento.findFirst({
    where: { id: o.versionId, exploracionId: o.exploracionId, pieza: null },
    select: { contenido: true, createdAt: true },
  });
  const elegido = v ? leerResumenGuardado(v.contenido) : undefined;
  if (!v || !elegido) return { ok: false, status: 404, error: "Esa versión no es de esta escala." };
  // Los textos fijos de la versión (desde el 23 nov). Una de antes no los trae: los de hoy se quedan.
  const textosElegidos = textosDeLaVersion(v.contenido);

  type Usado = ResultadoDeUsar & { antes?: ResumenGuardado; textosAntes?: Record<string, string>; textosDespues?: Record<string, string>; igual?: boolean };
  const r = await prisma.$transaction(async (tx): Promise<Usado> => {
    await bloquearFila(tx, o.exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: o.exploracionId }, select: { contenido: true, archivadaEn: true } });
    if (!f) return { ok: false, status: 404, error: "Esa exploración no existe." };
    if (f.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: ya no se puede cambiar." };
    if (await o.enCurso(tx)) return { ok: false, status: 409, error: "Nexus está rehaciendo el Resumen. Cuando termine, puedes usar otra versión." };
    const c = leerContenido(f.contenido);
    if (huellaDelResumen(c.resumenDeLaEscala, c.textosDeLaPagina) !== o.firma)
      return { ok: false, status: 409, error: "El Resumen cambió mientras mirabas el historial (otra persona, o Nexus al rehacerlo). Se cargó lo último: revísalo y vuelve a intentarlo." };
    const textosAntes = c.textosDeLaPagina ?? {};
    const textosDespues = textosElegidos === undefined ? textosAntes : conTextosDelResumen(textosAntes, textosElegidos);
    // La elegida es igual a la de ahora: no hay nada que cambiar ni que guardar.
    if (huellaDelResumen(elegido, textosDespues) === o.firma) return { ok: true, igual: true };
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    const { textosDeLaPagina: _fuera, ...sinTextos } = crudo;
    void _fuera;
    const contenido = { ...sinTextos, resumenDeLaEscala: elegido, ...(Object.keys(textosDespues).length ? { textosDeLaPagina: textosDespues } : {}) };
    await tx.exploracionDeVenta.update({ where: { id: o.exploracionId }, data: { contenido: contenido as unknown as Prisma.InputJsonValue } });
    return { ok: true, antes: c.resumenDeLaEscala, textosAntes, textosDespues };
  });
  if (!r.ok) return r;
  if (r.igual) return { ok: true };
  if (r.antes) await guardarVersionDelResumen(o.exploracionId, r.antes, { tipo: "antes", nota: "Así estaba antes de usar otra versión.", creadaPor: null, textos: r.textosAntes });
  await guardarVersionDelResumen(o.exploracionId, elegido, { tipo: "restaurado", nota: `Volvió la del ${fechaCorta(v.createdAt)}.`, creadaPor: o.email, textos: r.textosDespues });
  return { ok: true };
}
