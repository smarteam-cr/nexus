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
import {
  kickoffHiddenKey,
  missingCtxSections,
  comparaSectionHasContent,
  stripProseCompara,
  COMPARA_KEY,
} from "@/components/canvas/kickoff-landing-adapter";
import { applyAssignments, normalizeAssignments, HORARIOS_KEY } from "@/lib/kickoff/horario-assignments";
import { readClientTimeline } from "@/lib/external/timeline-view";
import { readClientProcesos } from "@/lib/canvas/read-procesos";
import type { KickoffTimelineData, KickoffProceso } from "@/lib/external/kickoff-view-types";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { getRole } from "@/lib/roles/queries";
import { ROLE_CONTENT_KEYS } from "@/components/landing/configs/roles.defs";
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
  /** SOLO caso de negocio: qué plantilla del motor usar. `null` en los demás tipos, que
   *  tienen una config por tipo y no una por documento. */
  templateId: string | null;
  rows: PrintRow[];
  ctx: {
    clientName: string;
    lang: string | null;
    clientLogoUrl: string | null;
    clientLogoDarkUrl: string | null;
    clientLogoScale: number | null;
    smarteamLogoUrl: string | null;
    brandLogos: Record<string, string>;
    /** Solo KICKOFF: lo que NO vive en CanvasBlock (cronograma de ProjectTimeline y
     *  flowcharts de procesos). Ausente en los demás tipos. */
    kickoff?: {
      timeline: KickoffTimelineData | null;
      procesos: KickoffProceso[];
    };
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
      ? await can(ctx.teamMember, "ventas", "read") // el mismo guard que el resto de ventas
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
  opts?: { yaAutorizado?: boolean; canvasId?: string | null },
): Promise<PrintDocPayload | null> {
  /* `yaAutorizado` es SOLO para el camino del token de un solo uso: Puppeteer navega sin
     cookies, así que no hay sesión que gatear, y el token —emitido tras autorizar y atado a
     este par (docType, docId)— es la prueba. Cualquier otro caller lo omite. */
  if (!opts?.yaAutorizado) await autorizar(tipo, docId);

  if (tipo.scope === "role") return await cargarPerfilDePuesto(tipo, docId);
  if (tipo.scope === "business-case") return await cargarCasoDeNegocio(tipo, docId, opts?.canvasId);

  const proyecto = await prisma.project.findUnique({
    where: { id: docId },
    select: {
      name: true,
      clientId: true,
      hiddenKickoffKeys: true,
      // Overlay VIVO de la asignación franja→sesión: lo que el cliente arrastró vive fuera
      // del bloque, así que sin esto el papel imprime la franja semilla y no la elegida.
      kickoffHorarioAssignments: true,
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
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

  const esKickoff = tipo.id === "kickoff";

  /* Las dos transformaciones propias del kickoff se aplican ACÁ, sobre el bloque, y no del
     lado cliente — igual que en el chokepoint externo (lib/external/kickoff-view.ts), y por
     la misma razón: el de-dup de la comparación depende del set COMPLETO de secciones. Si se
     calculara después de filtrar, ocultar «Hoy / Con el sistema» haría que la comparación
     reapareciera desde la prosa, o sea exactamente lo contrario de lo que el CSE pidió. */
  const dropProseCompara = esKickoff && comparaSectionHasContent(secciones);
  const assignments = esKickoff ? normalizeAssignments(proyecto.kickoffHorarioAssignments) : null;

  const rows: PrintRow[] = secciones
    .filter((s) => !ocultasPorKey.has(s.key) && !ocultasKickoff.has(kickoffHiddenKey(s.key, s.id)))
    .map((s) => ({
      key: s.key,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      blocks: s.blocks.map((b) => ({
        blockType: b.blockType,
        content: b.content,
        data:
          assignments && s.key === HORARIOS_KEY
            ? applyAssignments(b.data, assignments)
            : dropProseCompara && s.key !== COMPARA_KEY
              ? stripProseCompara(b.data)
              : b.data,
      })),
    }));

  /* Las secciones ctx-driven (cronograma, procesos) no salen de un CanvasBlock. Los kickoffs
     viejos ni siquiera tienen la CanvasSection, así que se inyecta una fila vacía para que la
     config las incluya — salvo que estén ocultas, claro. */
  if (esKickoff) {
    for (const k of missingCtxSections(rows.map((r) => r.key))) {
      if (!ocultasKickoff.has(k)) {
        rows.push({ key: k, titleOverride: null, eyebrowOverride: null, blocks: [] });
      }
    }
  }

  /* Cronograma y procesos, VIVOS. Se lee `readClientTimeline` y no la variante publicada a
     propósito, por dos razones: la regla del PDF es contenido vivo, y la publicada ESCRIBE un
     backfill en la base cuando falta el snapshot — una descarga de PDF no puede mutar nada.
     Los procesos van `onlyConfirmed`: en el editor se ven en borrador, en el papel no. */
  const kickoff = esKickoff
    ? {
        timeline: ocultasKickoff.has("cronograma") ? null : await readClientTimeline(docId),
        procesos: ocultasKickoff.has("procesos")
          ? []
          : (await readClientProcesos(proyecto.clientId, { onlyConfirmed: true })).filter(
              // «procesos» oculta la sección entera; una key suelta oculta UN proceso.
              (p) => !ocultasKickoff.has(p.id),
            ),
      }
    : undefined;

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
    templateId: null,
    rows,
    ctx: {
      clientName: proyecto.client.name,
      lang: typeof lang === "string" ? lang : null,
      clientLogoUrl: proyecto.client.logoUrl,
      clientLogoDarkUrl: proyecto.client.logoDarkUrl,
      clientLogoScale: proyecto.client.logoScale,
      smarteamLogoUrl: logos.smarteam ?? null,
      brandLogos: brandLogoMap(logos),
      kickoff,
    },
  };
}

/**
 * Perfiles de puesto — el único tipo que NO cuelga de un canvas.
 *
 * `RoleProfile.content` es un Json plano con una entrada por sección, y la portada son
 * COLUMNAS de la tabla. No hay bloques, ni estado DRAFT, ni secciones ocultas: nada que
 * filtrar. Es literalmente lo que arma `RoleWorkspace`, con la data viniendo de la base en
 * vez del estado local — y por eso el papel sale igual que la pantalla.
 *
 * Un perfil desactivado SÍ se imprime: ni `getRole` ni la página `/roles/[id]` filtran por
 * `active`, y solo un SUPER_ADMIN llega hasta acá. Inventar el filtro solo en el camino del
 * PDF sería una regla que no existe en ningún otro lado.
 */
async function cargarPerfilDePuesto(
  tipo: PrintDocType,
  docId: string,
): Promise<PrintDocPayload | null> {
  const role = await getRole(docId);
  if (!role) return null;

  /* Se empaqueta en un bloque CARD sintético para viajar por la MISMA tubería que el resto:
     así el adaptador de impresión es uno solo y no hay una segunda forma de `PrintRow`. */
  const fila = (key: string, data: unknown): PrintRow => ({
    key,
    titleOverride: null,
    eyebrowOverride: null,
    blocks: [{ blockType: "CARD", content: null, data }],
  });

  return {
    docType: tipo.id,
    // Sin cliente: un perfil de puesto es de la casa. El archivo se llama por el puesto.
    clientName: "",
    projectName: "",
    docTitle: role.title,
    palette: tipo.palette,
    templateId: null,
    rows: [
      fila("hero", { title: role.title, area: role.area, summary: role.summary }),
      // Las vacías no hace falta filtrarlas: no son `pinned`, así que el motor las omite solo
      // en modo lectura (ver `isBlank` en lib/landing/is-blank.ts).
      ...ROLE_CONTENT_KEYS.map((k) => fila(k, role.content[k] ?? null)),
    ],
    ctx: {
      clientName: "",
      lang: null,
      clientLogoUrl: null,
      clientLogoDarkUrl: null,
      clientLogoScale: null,
      smarteamLogoUrl: null,
      brandLogos: {},
    },
  };
}

/**
 * Caso de negocio — el único que NO cuelga de un proyecto: cuelga de `BusinessCase`, tiene
 * VERSIONES (cada una un `ProjectCanvas`) y elige plantilla por documento en vez de por tipo.
 *
 * `canvasId` permite exportar una versión que no es la activa; sin él sale la activa, que es
 * lo que el vendedor ve en pantalla.
 */
async function cargarCasoDeNegocio(
  tipo: PrintDocType,
  docId: string,
  canvasId?: string | null,
): Promise<PrintDocPayload | null> {
  const bc = await prisma.businessCase.findUnique({
    where: { id: docId },
    select: {
      id: true,
      name: true,
      caseType: true,
      caseSubtype: true,
      language: true,
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
  });
  if (!bc) return null;

  // La plantilla vive en el `__meta` de la v0 (mismo patrón que la pantalla del caso).
  const v0 = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: docId, version: 0 },
    select: { sections: true },
  });
  const resuelto = resolveCaseTypeFor(bc, v0?.sections);

  const canvas = canvasId
    ? await prisma.projectCanvas.findUnique({
        where: { id: canvasId },
        select: { id: true, businessCaseId: true, sections: true },
      })
    : await prisma.projectCanvas.findFirst({
        where: { businessCaseId: docId, isActive: true },
        select: { id: true, businessCaseId: true, sections: true },
      });
  // Anti-IDOR: un canvasId de OTRO caso no debe filtrar contenido ajeno.
  if (!canvas || canvas.businessCaseId !== docId) return null;

  const ocultas = hiddenKeysFrom(canvas.sections);
  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      key: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true },
      },
    },
  });

  const rows: PrintRow[] = secciones
    .filter((s) => !ocultas.has(s.key))
    .map((s) => ({
      key: s.key,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      blocks: s.blocks.map((b) => ({ blockType: b.blockType, content: b.content, data: b.data })),
    }));

  // Idioma: la columna persistente primero; si no, el `__lang` fuera de schema del hero
  // (mismo dual-read que BusinessCaseWorkspace).
  const langHero = rows
    .flatMap((r) => r.blocks)
    .map((b) => (b.data as { __lang?: unknown } | null)?.__lang)
    .find((v) => typeof v === "string" && v);
  const logos = await getBrandLogos();

  return {
    docType: tipo.id,
    clientName: bc.client.name,
    projectName: "",
    docTitle: bc.name,
    palette: tipo.palette,
    templateId: resuelto.templateId,
    rows,
    ctx: {
      clientName: bc.client.name,
      lang: bc.language ?? (typeof langHero === "string" ? langHero : null),
      clientLogoUrl: bc.client.logoUrl,
      clientLogoDarkUrl: bc.client.logoDarkUrl,
      clientLogoScale: bc.client.logoScale,
      smarteamLogoUrl: logos.smarteam ?? null,
      brandLogos: brandLogoMap(logos),
    },
  };
}
