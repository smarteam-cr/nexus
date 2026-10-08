/**
 * lib/escala/datos/servidor.ts — el borrador de la escala en la pantalla. SERVIDOR.
 *
 * Lo que necesitan la página `/escala/borrador` y sus rutas (`app/api/escala/borrador/`): el estado
 * del borrador con su bitácora, abrirlo, subirle un `.md` con cambios, revisarlo y publicarlo. Las
 * reglas viven en `versiones.ts` (las mismas del script); acá se les pone la base de la app y se arma
 * lo que se muestra. Quién puede: los super admin (`puedeEditarLaEscala`), lo revisa cada ruta.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { documentoPorClave } from "@/lib/escala/documento/documentos";
import { huellaDe } from "@/lib/escala/documento/huella";
import { leerDocumentoPublicado, leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { leerMapaDeHerramientasVigente } from "@/lib/escala/herramientas/vigente";
import { resumenDeCambios, type CambioDeLaEscala } from "./diferencias";
import { escalaDeLosDatos, generarMarkdown } from "./generar";
import { revisarParaPublicar, type RevisionDelBorrador } from "./publicar";
import {
  nombresDeLasEdiciones,
  paraMostrar,
  type CambioParaMostrar,
  type EstadoDelBorrador,
  type ResumenDelBorrador,
  type TandaDeLaBitacora,
} from "./pantalla";
import { versionSiguiente, type TipoDeAncla } from "./reglas";
import {
  congelarBorrador,
  crearBorrador,
  descartarBorrador,
  ErrorDelBorrador,
  guardarEnElBorrador,
  leerBorrador,
  prepararImportacion,
  type VersionConDatos,
} from "./versiones";

export const SQL_DE_LOS_DATOS = "scripts/sql/2026-10-08-escala-como-datos.sql";

/** Cuántas tandas de la bitácora se muestran (las más recientes). */
const TANDAS_A_LA_VISTA = 40;

// ── Mostrar ───────────────────────────────────────────────────────────────────

function resumen(b: VersionConDatos & { creadaEn: Date; actualizadaEn: Date; actualizadaPorEmail: string | null }, total: number): ResumenDelBorrador {
  return {
    version: b.version,
    basadaEn: b.basadaEn,
    revision: b.revision,
    creadaEn: b.creadaEn.toISOString(),
    actualizadaEn: b.actualizadaEn.toISOString(),
    actualizadaPorEmail: b.actualizadaPorEmail,
    totalDeCambios: total,
  };
}

/** Si hay un borrador abierto, su versión. Para el botón de la cabecera de la escala: una consulta liviana. */
export async function versionDelBorrador(): Promise<string | null> {
  if (!modeloDisponible(prisma.escalaVersion)) return null;
  try {
    return (await prisma.escalaVersion.findFirst({ where: { estado: "borrador" }, select: { version: true } }))?.version ?? null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

export async function estadoDelBorrador(): Promise<EstadoDelBorrador> {
  if (!modeloDisponible(prisma.escalaVersion)) return { estado: "sin-tablas" };
  try {
    // De la publicada alcanza la versión: sus datos pesan medio mega.
    const [borrador, publicada] = await Promise.all([
      leerBorrador(prisma),
      prisma.escalaVersion.findFirst({ where: { estado: "publicada" }, orderBy: { publicadaEn: "desc" }, select: { version: true } }),
    ]);
    const sugerida = versionSiguiente(publicada?.version ?? null);
    if (!borrador) return { estado: "ok", borrador: null, publicada: publicada?.version ?? null, sugerida, bitacora: [] };

    const fila = await prisma.escalaVersion.findUniqueOrThrow({
      where: { id: borrador.id },
      select: { creadaEn: true, actualizadaEn: true, actualizadaPorEmail: true },
    });
    const [total, filas] = await Promise.all([
      prisma.escalaCambio.count({ where: { versionId: borrador.id } }),
      prisma.escalaCambio.findMany({ where: { versionId: borrador.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
    ]);
    const ediciones = nombresDeLasEdiciones(borrador.datos);
    // Una tanda: los cambios de una misma importación (su `lote`), o uno suelto del editor.
    const tandas: TandaDeLaBitacora[] = [];
    let actual: { clave: string; tanda: TandaDeLaBitacora } | null = null;
    for (const f of filas) {
      const clave = f.lote ?? f.id;
      if (!actual || actual.clave !== clave) {
        if (tandas.length >= TANDAS_A_LA_VISTA) break;
        actual = { clave, tanda: { cuando: f.createdAt.toISOString(), autorEmail: f.autorEmail, origen: f.origen, nota: f.nota, cambios: [] } };
        tandas.push(actual.tanda);
      }
      actual.tanda.cambios.push(
        paraMostrar(
          { ancla: f.ancla, tipoDeAncla: f.tipoDeAncla as TipoDeAncla, accion: f.accion as CambioDeLaEscala["accion"], campo: f.campo, antes: f.antes, despues: f.despues },
          ediciones,
        ),
      );
    }
    // Dentro de una tanda, en el orden en que se anotaron.
    for (const t of tandas) t.cambios.reverse();
    return { estado: "ok", borrador: resumen({ ...borrador, ...fila }, total), publicada: publicada?.version ?? null, sugerida, bitacora: tandas };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tablas" };
    throw e;
  }
}

/** El `.md` del borrador, para bajarlo y editarlo. */
export async function markdownDelBorrador(): Promise<{ version: string; texto: string } | null> {
  const b = await leerBorrador(prisma);
  return b ? { version: b.version, texto: generarMarkdown(b.datos) } : null;
}

// ── Cambiar ───────────────────────────────────────────────────────────────────

export async function abrirBorrador(version: string, por: string): Promise<void> {
  await crearBorrador(prisma, { version, por });
}

export async function descartarElBorrador(): Promise<string | null> {
  return descartarBorrador(prisma);
}

async function borradorEnLaRevision(revision: number): Promise<VersionConDatos> {
  const b = await leerBorrador(prisma);
  if (!b) throw new ErrorDelBorrador("No hay ningún borrador abierto.");
  if (b.revision !== revision) throw new ErrorDelBorrador("El borrador cambió mientras tanto. Vuelve a cargar la página y repite el cambio.");
  return b;
}

/** Lo que cambiaría al subir un `.md`, sin guardar nada. */
export async function verLaImportacion(texto: string, revision: number): Promise<{ cambios: CambioParaMostrar[]; resumen: string }> {
  const b = await borradorEnLaRevision(revision);
  const { cambios } = prepararImportacion(b, texto);
  const ediciones = nombresDeLasEdiciones(b.datos);
  return { cambios: cambios.map((c) => paraMostrar(c, ediciones)), resumen: resumenDeCambios(cambios) };
}

/** Sube el `.md` al borrador y anota cada cambio en la bitácora. */
export async function guardarLaImportacion(args: { texto: string; revision: number; nota: string | null; por: string }): Promise<{ cambios: number }> {
  const b = await borradorEnLaRevision(args.revision);
  const { datos, cambios } = prepararImportacion(b, args.texto);
  if (!cambios.length) return { cambios: 0 };
  await guardarEnElBorrador(prisma, { borrador: b, datos, cambios, origen: "importacion", por: args.por, nota: args.nota });
  return { cambios: cambios.length };
}

// ── Publicar ──────────────────────────────────────────────────────────────────

async function revisar(b: VersionConDatos, edicionesRevisadas: boolean): Promise<{ revision: RevisionDelBorrador; texto: string }> {
  const texto = generarMarkdown(b.datos);
  const [vigente, especificacion, manual, mapa, publicadas] = await Promise.all([
    leerEscalaVigente(),
    leerDocumentoPublicado("especificacion"),
    leerDocumentoPublicado("manual"),
    leerMapaDeHerramientasVigente(),
    prisma.escalaDocumento.findMany({ where: { documento: "escala" }, select: { version: true } }),
  ]);
  const revision = revisarParaPublicar({
    escala: escalaDeLosDatos(b.datos),
    texto,
    anterior: vigente.estado === "ok" ? vigente.escala : null,
    especificacion: especificacion?.texto ?? null,
    manual: manual?.texto ?? null,
    mapa,
    publicadas: publicadas.map((p) => p.version),
    edicionesRevisadas,
  });
  return { revision, texto };
}

/** Las pruebas y lo que cambia, sin publicar. */
export async function revisarElBorrador(edicionesRevisadas = false): Promise<RevisionDelBorrador & { revisionDelBorrador: number }> {
  const b = await leerBorrador(prisma);
  if (!b) throw new ErrorDelBorrador("No hay ningún borrador abierto.");
  const { revision } = await revisar(b, edicionesRevisadas);
  return { ...revision, revisionDelBorrador: b.revision };
}

/**
 * Publica el borrador: su `.md` va a "EscalaDocumento" (lo que leen las pantallas y lo que se descarga)
 * y el borrador se congela, en la misma transacción. Vuelve a correr las pruebas: si algo frena, no
 * publica nada.
 */
export async function publicarElBorrador(args: { revision: number; edicionesRevisadas: boolean; por: string }): Promise<{ version: string }> {
  const b = await borradorEnLaRevision(args.revision);
  const { revision, texto } = await revisar(b, args.edicionesRevisadas);
  if (revision.bloqueos.length) throw new ErrorDelBorrador(`No se publica: ${revision.bloqueos.join(" ")}`);
  const en = new Date();
  const { archivo } = documentoPorClave("escala");
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.escalaDocumento.create({
          data: { documento: "escala", version: b.version, escalaVersion: b.version, archivo, texto, huella: huellaDe(texto), publicadaEn: en, publicadaPorEmail: args.por },
        });
        await congelarBorrador(tx, { borrador: b, por: args.por, en });
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ErrorDelBorrador(`La ${b.version} ya está publicada.`);
    throw e;
  }
  return { version: b.version };
}
