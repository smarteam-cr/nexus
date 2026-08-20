/**
 * lib/external/business-case-view.ts
 *
 * CHOKEPOINT de seguridad del Business Case externo. Único lugar donde un token
 * de prospecto se resuelve a los datos del caso. Corre SIEMPRE server-side.
 *
 * Doble check EN CADA LECTURA: acceso no revocado (revokedAt == null) Y caso
 * publicado (publishedAt != null). Sirve el publishedSnapshot congelado (secciones
 * + bloques CONFIRMED), sin exponer ids/estado internos.
 *
 * ── QUÉ DECIDE ACÁ Y QUÉ NO ──────────────────────────────────────────────────
 * Acá viven los checks del ACCESO (forma del token, revocado, publicado, caducado) y
 * se DEVUELVE el modo (`requiresPassword`) sin actuar sobre él. Cuál de las dos puertas
 * puede servir con ese modo lo decide cada página, en su propio archivo — mismo criterio
 * que lib/external/access.ts: la seguridad de cada superficie se lee donde se decide.
 *
 * ── LA EXCEPCIÓN AL "TODOS LOS FALLOS SE VEN IGUAL" ──────────────────────────
 * Todo el módulo externo devuelve fallos indistinguibles a propósito. `expired` es la
 * única excepción, y es deliberada: Ventas necesita que el cliente que llega tarde vea
 * "esta propuesta caducó, escribile a tu asesor" en vez de un 404 que se lee como error
 * de Smarteam. Lo que la hace aceptable es que para verla hay que tener un token VÁLIDO
 * en la mano: un token inventado sigue cayendo en `denied`, igual que siempre. Lo único
 * que se filtra es "este link existió", a quien ya tenía el link.
 */
import { prisma } from "@/lib/db/prisma";

/** Cookie httpOnly propia del business case (no choca con la del kickoff). */
export const BUSINESS_CASE_COOKIE = "nexus_bc_access";
export const BC_TOKEN_RE = /^[a-f0-9]{64}$/i;

export type BusinessCaseLandingBlock = {
  blockType: string;
  content: string | null;
  data: unknown;
};
export type BusinessCaseLandingSection = {
  key: string;
  label: string;
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  blocks: BusinessCaseLandingBlock[];
  // Presentación congelada al publicar (snapshots nuevos): permite renderizar fiel
  // una sección aunque el template vivo ya no la defina (render sintetizado).
  sectionType?: string;
  theme?: "dark" | "light" | "soft" | null;
  eyebrow?: string | null;
  selfTitled?: boolean;
  backdrop?: boolean;
};
export type BusinessCaseLandingData = {
  name: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoDarkUrl: string | null;
  clientLogoScale: number | null;
  /** Template con el que se publicó (snapshots nuevos). Ausente = hubspot (legacy). */
  templateId?: string;
  sections: BusinessCaseLandingSection[];
};

/** Estado de aprobación que ve el prospecto en la landing (shape client-safe). */
export type BusinessCaseApproval = {
  approvedAt: string;
  /** Correo con el que aprobó — se lo devolvemos a quien YA está adentro del link. */
  approvedByEmail: string | null;
  approvedByName: string | null;
};

export type BusinessCaseAccessState =
  /** Token inválido, inexistente, revocado o caso sin publicar. Indistinguibles. */
  | { kind: "denied" }
  /** Token VÁLIDO pero con la ventana vencida. Ver la nota del encabezado. */
  | { kind: "expired"; contactEmail: string | null }
  | {
      kind: "ok";
      /** true = esta propuesta se sirve por /verify + cookie; false = por /external/propuesta/{token}. */
      requiresPassword: boolean;
      businessCaseId: string;
      data: BusinessCaseLandingData;
      approval: BusinessCaseApproval | null;
      expiresAt: string | null;
    };

/**
 * token → estado de acceso completo. NUNCA lanza por "denegado".
 *
 * `businessCaseId` sale de acá para que la aprobación (POST /approve) no tenga que
 * resolver el token por su cuenta: un segundo lugar que traduzca token → caso sería un
 * segundo lugar donde acordarse de revocado/publicado/caducado.
 */
export async function resolveBusinessCaseAccess(token: string): Promise<BusinessCaseAccessState> {
  if (!token || !BC_TOKEN_RE.test(token)) return { kind: "denied" };

  const access = await prisma.businessCaseExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      revokedAt: true,
      requiresPassword: true,
      expiresAt: true,
      createdByEmail: true,
      businessCase: {
        select: {
          id: true,
          name: true,
          publishedAt: true,
          publishedSnapshot: true,
          approvedAt: true,
          approvedByEmail: true,
          approvedByName: true,
          client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
        },
      },
    },
  });
  if (!access) return { kind: "denied" };
  if (access.revokedAt) return { kind: "denied" };

  const bc = access.businessCase;
  if (!bc.publishedAt) return { kind: "denied" };

  const snap = bc.publishedSnapshot as unknown as Partial<BusinessCaseLandingData> | null;
  if (!snap || !Array.isArray(snap.sections)) return { kind: "denied" };

  // Una propuesta ya APROBADA no caduca: el cliente tiene derecho a releer lo que aprobó,
  // y cerrarle la puerta al documento que respalda un "sí" es la peor forma de ahorrar.
  const vencida =
    !!access.expiresAt && access.expiresAt.getTime() <= Date.now() && !bc.approvedAt;
  if (vencida) return { kind: "expired", contactEmail: access.createdByEmail };

  await prisma.businessCaseExternalAccess
    .update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    kind: "ok",
    requiresPassword: access.requiresPassword,
    businessCaseId: bc.id,
    expiresAt: access.expiresAt?.toISOString() ?? null,
    approval: bc.approvedAt
      ? {
          approvedAt: bc.approvedAt.toISOString(),
          approvedByEmail: bc.approvedByEmail,
          approvedByName: bc.approvedByName,
        }
      : null,
    data: {
      name: snap.name ?? bc.name,
      clientName: snap.clientName ?? bc.client.name,
      clientLogoUrl: snap.clientLogoUrl ?? bc.client.logoUrl,
      // `??` a lo VIVO, igual que la URL: los snapshots publicados ANTES de esta tanda no
      // traen estas keys, así que una propuesta de hace meses respeta la variante y el
      // tamaño nuevos en el próximo render, sin migrar un solo Json.
      clientLogoDarkUrl: snap.clientLogoDarkUrl ?? bc.client.logoDarkUrl,
      clientLogoScale: snap.clientLogoScale ?? bc.client.logoScale,
      templateId: typeof snap.templateId === "string" ? snap.templateId : undefined,
      sections: snap.sections,
    },
  };
}
