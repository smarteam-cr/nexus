import "server-only";

/**
 * lib/print/load-doc.ts — carga y AUTORIZA un documento para imprimir. Un solo chokepoint.
 *
 * Que sea uno solo es el argumento central de tener una ruta genérica en vez de ocho: con
 * ocho páginas habría ocho lugares donde olvidarse del anti-IDOR o de filtrar los borradores.
 *
 * ── LAS TRES REGLAS, APLICADAS ACÁ Y NO EN CADA TIPO ─────────────────────────
 *   · contenido VIVO, no el snapshot publicado (igual que el business case: el CSE
 *     descarga el PDF para revisar ANTES de subirlo);
 *   · lo que el CSE ocultó al cliente NO se imprime;
 *   · un bloque en DRAFT —propuesta del agente que nadie aceptó— tampoco.
 *
 * La tercera se aplica en la query (`where: { status: "CONFIRMED" }`) y la segunda al armar
 * las filas. La primera es simplemente no leer `publishedSnapshot` en ningún lado.
 */
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireInternalUser } from "@/lib/auth/supabase";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { getBrandLogos, brandLogoMap } from "@/lib/external/smarteam-logo";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { kickoffHiddenKey } from "@/components/canvas/kickoff-landing-adapter";
import type { PrintDocType } from "./doc-types";

/**
 * Una fila de sección, ya serializable: cruza la frontera server→client tal cual.
 *
 * Es la MISMA forma que consumen los adaptadores (`LandingSectionRow`) — bloques crudos, no
 * `data` ya resuelta — a propósito: el adaptador es quien sabe leer una CARD, juntar los
 * bloques legacy de markdown y volcar los overrides del hero. Resolverlo acá sería una
 * segunda implementación de esa regla, que es justo lo que este archivo viene a evitar.
 */
export interface PrintRow {
  key: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown }>;
}

/** Todo lo que la vista de impresión necesita. Sin funciones ni componentes: se serializa. */
export interface PrintDocPayload {
  docType: string;
  /** Para el nombre del archivo. */
  clientName: string;
  /** Para el nombre del archivo y el `<title>`. */
  docTitle: string;
  /** Nombre del proyecto, para desambiguar en el `<title>` cuando el cliente tiene varios. */
  projectName: string;
  palette: "brand" | "internal";
  rows: PrintRow[];
  ctx: {
    clientName: string;
    lang: string | null;
    clientLogoUrl: string | null;
    clientLogoDarkUrl: string | null;
    clientLogoScale: number | null;
    smarteamLogoUrl: string | null;
    brandLogos: Record<string, string>;
  };
}

/** Resultado del gate. Sin excepciones: el caller decide si es una página o un endpoint. */
export type PrintAuth =
  | { ok: true; email: string | null }
  | { ok: false; status: 401 | 403 | 404 };

/**
 * EL gate, por scope — el único. Reusa los MISMOS guards que el resto de la app (no inventa
 * reglas) y devuelve un resultado en vez de una respuesta, porque tiene dos consumidores con
 * formas incompatibles: la página, que solo puede `notFound()`/`redirect()`, y el endpoint,
 * que necesita un status y un mensaje.
 */
export async function authorizePrintDoc(tipo: PrintDocType, docId: string): Promise<PrintAuth> {
  if (tipo.scope === "project-piece") {
    // El acceso es al CLIENTE del proyecto: la misma regla y el mismo código que gatean
    // todos los endpoints de canvas. No se replica el criterio, se llama al guard.
    const guard = await guardAccessToProject(docId);
    if (guard instanceof NextResponse) {
      // 404 y no 403: que un proyecto ajeno no se distinga de uno inexistente.
      return { ok: false, status: guard.status === 401 ? 401 : 404 };
    }
    return { ok: true, email: guard.user.teamMember?.email ?? null };
  }

  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) return { ok: false, status: 401 };
  const ok =
    tipo.scope === "business-case"
      ? await can(ctx.teamMember, "ventas", "read") // igual que /print/business-case
      : ctx.role === "SUPER_ADMIN"; // perfiles de puesto, igual que /roles/[id]
  return ok ? { ok: true, email: ctx.teamMember.email ?? null } : { ok: false, status: 403 };
}

/** La traducción para una PAGE, que no puede devolver una respuesta: corta el render. */
async function autorizar(tipo: PrintDocType, docId: string): Promise<void> {
  const r = await authorizePrintDoc(tipo, docId);
  if (r.ok) return;
  if (r.status === 404) notFound();
  redirect("/");
}

/**
 * Carga el documento. Devuelve `null` cuando no hay nada que imprimir (canvas inexistente),
 * para que la página responda 404 en vez de una hoja en blanco.
 *
 * ⚠ AUTORIZA ANTES DE LEER: el orden importa: un `docId` de otro cliente no debe llegar
 * siquiera a la consulta de contenido.
 */
export async function loadPrintDoc(
  tipo: PrintDocType,
  docId: string,
  opts?: { yaAutorizado?: boolean },
): Promise<PrintDocPayload | null> {
  /* `yaAutorizado` es SOLO para el camino del token de un solo uso: Puppeteer navega sin
     cookies, así que no hay sesión que gatear, y el token —emitido tras autorizar y atado a
     este par (docType, docId)— es la prueba. Cualquier otro caller lo omite. */
  if (!opts?.yaAutorizado) await autorizar(tipo, docId);

  if (tipo.scope !== "project-piece") {
    // El business case y los perfiles tienen su propia forma de guardar el contenido; sus
    // loaders llegan en su fase. Hasta entonces este camino solo sirve piezas de proyecto.
    return null;
  }

  const proyecto = await prisma.project.findUnique({
    where: { id: docId },
    select: { name: true, hiddenKickoffKeys: true, client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } } },
  });
  if (!proyecto) return null;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: docId, ...canvasOf(tipo.pieceSlug!) },
    select: { id: true, sections: true },
  });
  if (!canvas) return null;

  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: {
        // Solo lo CONFIRMADO llega al papel (ver cabecera). Y SIN `take: 1`: una sección
        // legacy guarda su texto en varios bloques de markdown que el adaptador concatena.
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true },
      },
    },
  });

  /* Las dos fuentes de "oculta", que no son la misma forma porque nacieron en módulos
     distintos: el Json del canvas (business case) y una columna del PROYECTO (kickoff),
     cuya clave es el id de la sección salvo cronograma y procesos. Se leen las dos, así el
     día que un tipo estrene visibilidad no hay que acordarse de este archivo. */
  const ocultasPorKey = hiddenKeysFrom(canvas.sections);
  const ocultasKickoff = new Set(proyecto.hiddenKickoffKeys ?? []);

  const rows: PrintRow[] = secciones
    .filter((s) => !ocultasPorKey.has(s.key) && !ocultasKickoff.has(kickoffHiddenKey(s.key, s.id)))
    .map((s) => ({
      key: s.key,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      blocks: s.blocks.map((b) => ({ blockType: b.blockType, content: b.content, data: b.data })),
    }));

  const logos = await getBrandLogos();
  /* Idioma: el motor lo guarda en una clave no-schema (`__lang`) de la portada, el mismo
     dual-read que hace el workspace. Se BUSCA en todas las filas en vez de asumir que la
     portada es la primera: no siempre lo es —una portada oculta se filtró recién— y la key
     del hero es privada de cada adaptador, que corre del lado cliente. Ninguna otra sección
     escribe `__lang`, así que la primera que aparezca es la buena. */
  const lang =
    rows
      .flatMap((r) => r.blocks)
      .map((b) => (b.data as { __lang?: unknown } | null)?.__lang)
      .find((v) => typeof v === "string" && v) ?? null;

  return {
    docType: tipo.id,
    clientName: proyecto.client.name,
    projectName: proyecto.name,
    // El nombre del archivo NO sale del titular escrito: ese cambia con cada edición y el
    // CSE termina con cinco PDFs que no distingue. Cliente + tipo es estable y ordena solo.
    docTitle: tipo.label,
    palette: tipo.palette,
    rows,
    ctx: {
      clientName: proyecto.client.name,
      lang: typeof lang === "string" ? lang : null,
      clientLogoUrl: proyecto.client.logoUrl,
      clientLogoDarkUrl: proyecto.client.logoDarkUrl,
      clientLogoScale: proyecto.client.logoScale,
      smarteamLogoUrl: logos.smarteam ?? null,
      brandLogos: brandLogoMap(logos),
    },
  };
}
