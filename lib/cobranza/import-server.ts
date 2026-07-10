/**
 * lib/cobranza/import-server.ts
 *
 * Helpers de SERVIDOR del importador CSV (staging): revalidación de filas contra
 * importFilaCanonicaSchema + DEDUP contra los Client existentes (índices en
 * memoria, patrón lib/cobranza/ingest.ts). Compartido por el PATCH del batch
 * (revalida TODAS las filas al cambiar el mapeo) y el PATCH de fila (edición
 * inline en la cola de revisión). El apply real vive en el adaptador "sheet"
 * (lib/cobranza/adapters/account-source-csv.ts) — acá solo se sugiere el vínculo.
 *
 * Guardas del resolver (post-mortem 2026-07-10):
 *  - dominio COMPARTIDO (gmail…) jamás se usa como clave de dedup;
 *  - nombre en skip-list fuerza REVISAR con error explicativo;
 *  - computeAmbiguousNameTokens avisa si los nombres nuevos volverían ambiguo
 *    un token del title-match (aviso en la UI, no bloqueo).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { computeAmbiguousNameTokens, effectiveDomainsForClient } from "@/lib/sessions/categorize";
import { importFilaCanonicaSchema, type ImportCampoCanonico } from "./schema";
import { aplicarMapeo, esDominioCompartido, nombreEnSkipList, warningsFila } from "./import-core";

// ── Índices de dedup ─────────────────────────────────────────────────────────────

export type DedupTipo = "fuente_id" | "dominio" | "nombre_exacto";

export interface DedupResultado {
  clientId: string;
  tipo: DedupTipo;
  clienteNombre: string;
}

interface ClienteRef {
  id: string;
  name: string;
}

export interface DedupIndices {
  /** `${source}:${sourceExternalId}` → cliente (re-import idempotente). */
  byFuenteId: Map<string, ClienteRef>;
  /** dominio efectivo (emailDomains + company) → cliente. SIN dominios compartidos. */
  byDomain: Map<string, ClienteRef>;
  /** nombre normalizado (lowercase, sin acentos) → cliente. Señal ADVISORY. */
  byNombre: Map<string, ClienteRef>;
  /** Los clientes existentes (para computeAmbiguousNameTokens). */
  existentes: Array<{ name: string; company: string | null }>;
}

function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildDedupIndices(): Promise<DedupIndices> {
  const clients = await prisma.client.findMany({
    where: { isProspect: false },
    select: { id: true, name: true, company: true, emailDomains: true, source: true, sourceExternalId: true },
  });
  const byFuenteId = new Map<string, ClienteRef>();
  const byDomain = new Map<string, ClienteRef>();
  const byNombre = new Map<string, ClienteRef>();
  for (const c of clients) {
    const ref: ClienteRef = { id: c.id, name: c.name };
    if (c.source && c.sourceExternalId) byFuenteId.set(`${c.source}:${c.sourceExternalId}`, ref);
    for (const d of effectiveDomainsForClient(c)) {
      // Un dominio compartido apuntado a un cliente NO es clave de nada (leak con otra cara).
      if (!esDominioCompartido(d) && !byDomain.has(d)) byDomain.set(d, ref);
    }
    const nombreKey = normalizarNombre(c.name);
    if (nombreKey && !byNombre.has(nombreKey)) byNombre.set(nombreKey, ref);
  }
  return {
    byFuenteId,
    byDomain,
    byNombre,
    existentes: clients.map((c) => ({ name: c.name, company: c.company })),
  };
}

// ── Evaluación de una fila canónica ──────────────────────────────────────────────

export interface FilaEvaluada {
  estado: "VALIDA" | "REVISAR";
  /** Errores duros (Zod + skip-list) + warnings informativos con prefijo "⚠ ". */
  errores: string[];
  dedup: DedupResultado | null;
  idExterno: string | null;
}

/**
 * Valida el payload canónico (Zod) + reglas de negocio y corre el dedup.
 * Los warnings NO invalidan una fila que pasa Zod (solo informan, con prefijo
 * "⚠ ") — la excepción es la skip-list, que sí fuerza REVISAR con error.
 */
export function evaluarCanonico(canonico: Record<string, unknown>, idx: DedupIndices): FilaEvaluada {
  const errores: string[] = [];
  const parsed = importFilaCanonicaSchema.safeParse(canonico);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errores.push(`${issue.path.join(".") || "fila"}: ${issue.message}`);
    }
  }

  const nombre = typeof canonico.clienteNombre === "string" ? canonico.clienteNombre.trim() : "";
  const enSkipList = nombre !== "" && nombreEnSkipList(nombre);
  if (enSkipList) {
    errores.push(
      `"${nombre}" está en la lista de exclusión (interno de Smarteam o basura de sheet) — corregí el nombre u omití la fila; no se crea automáticamente.`,
    );
  }

  let dedup: DedupResultado | null = null;
  let idExterno: string | null = null;
  if (parsed.success) {
    const c = parsed.data;
    idExterno = c.idExterno ?? null;
    const porFuente = idExterno ? idx.byFuenteId.get(`sheet:${idExterno}`) : undefined;
    const porDominio = c.dominio && !esDominioCompartido(c.dominio) ? idx.byDomain.get(c.dominio) : undefined;
    const porNombre = idx.byNombre.get(normalizarNombre(c.clienteNombre));
    if (porFuente) dedup = { clientId: porFuente.id, tipo: "fuente_id", clienteNombre: porFuente.name };
    else if (porDominio) dedup = { clientId: porDominio.id, tipo: "dominio", clienteNombre: porDominio.name };
    else if (porNombre) dedup = { clientId: porNombre.id, tipo: "nombre_exacto", clienteNombre: porNombre.name };
  } else if (typeof canonico.idExterno === "string" && canonico.idExterno) {
    idExterno = canonico.idExterno;
  }

  // Warnings de negocio (la skip-list ya subió como error duro — no se repite).
  const warnings = warningsFila(canonico).filter((w) => !w.includes("lista de exclusión"));
  errores.push(...warnings.map((w) => `⚠ ${w}`));

  return {
    estado: parsed.success && !enSkipList ? "VALIDA" : "REVISAR",
    errores,
    dedup,
    idExterno,
  };
}

/** Payload de update Prisma de una fila re-evaluada (Json null explícito → DbNull). */
export function filaUpdateData(canonico: Record<string, unknown>, ev: FilaEvaluada) {
  return {
    canonico: canonico as Prisma.InputJsonValue,
    estado: ev.estado,
    errores: ev.errores as Prisma.InputJsonValue,
    dedup: ev.dedup ? ({ ...ev.dedup } as Prisma.InputJsonValue) : Prisma.DbNull,
    idExterno: ev.idExterno,
  };
}

// ── Revalidación del batch completo (PATCH {mapeo}) ─────────────────────────────

/**
 * Guarda el mapeo, re-mapea + revalida TODAS las filas (estado VALIDA/REVISAR) y
 * pasa el batch a EN_REVISION — todo en una TX. Devuelve los tokens del
 * title-match que se volverían AMBIGUOS si se crearan los clientes nuevos del
 * batch (avisoResolver — post-mortem "dos Smarteam" 2026-07-10).
 */
export async function revalidarImport(
  importId: string,
  mapeo: Partial<Record<ImportCampoCanonico, string | null>>,
): Promise<{ avisoResolver: string[] }> {
  const filas = await prisma.importacionFila.findMany({
    where: { importId },
    select: { id: true, raw: true },
    orderBy: { numFila: "asc" },
  });
  const idx = await buildDedupIndices();

  const nuevosNombres: Array<{ name: string; company: string | null }> = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [
    prisma.importacionCobranza.update({
      where: { id: importId },
      data: { mapeo: mapeo as Prisma.InputJsonValue, estado: "EN_REVISION" },
    }),
  ];

  for (const fila of filas) {
    const canonico = aplicarMapeo(fila.raw as Record<string, unknown>, mapeo);
    const ev = evaluarCanonico(canonico, idx);
    if (ev.estado === "VALIDA" && !ev.dedup && typeof canonico.clienteNombre === "string") {
      nuevosNombres.push({ name: canonico.clienteNombre, company: null });
    }
    updates.push(
      prisma.importacionFila.update({ where: { id: fila.id }, data: filaUpdateData(canonico, ev) }),
    );
  }
  await prisma.$transaction(updates);

  // Tokens ambiguos NUEVOS que introduciría el batch (clientes a crear vs existentes).
  const antes = computeAmbiguousNameTokens(idx.existentes);
  const despues = computeAmbiguousNameTokens([...idx.existentes, ...nuevosNombres]);
  const avisoResolver = [...despues].filter((t) => !antes.has(t)).sort();

  return { avisoResolver };
}
