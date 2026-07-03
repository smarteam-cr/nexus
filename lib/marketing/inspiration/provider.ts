/**
 * lib/marketing/inspiration/provider.ts
 *
 * Abstracción del proveedor de inspiración (scraping de posts públicos de
 * LinkedIn). TODO el conocimiento del proveedor concreto (hoy Apify) vive en su
 * implementación — el resto de Nexus SOLO conoce esta interfaz. Razón: estos
 * proveedores mueren (Proxycurl fue demandado por LinkedIn y desapareció en
 * 2025); cambiar de proveedor = tocar solo lib/marketing/inspiration/.
 */

export interface RawInspirationPost {
  /** Id/URN estable del post en LinkedIn — clave de dedup (InspirationPost.externalId). */
  externalId: string;
  url?: string;
  authorName?: string;
  text: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  hasImage: boolean;
  postedAt: Date;
}

export interface InspirationProvider {
  /** Nombre corto del proveedor ("apify") — para logs/errores. */
  readonly name: string;
  /**
   * Posts recientes de un perfil público. Lanza InspirationProviderError con
   * mensaje accionable (token inválido, sin créditos, timeout, perfil inaccesible).
   */
  fetchRecentPosts(profileUrl: string, limit: number): Promise<RawInspirationPost[]>;
}

export class InspirationProviderError extends Error {
  constructor(
    message: string,
    readonly meta?: { profileUrl?: string; status?: number },
  ) {
    super(message);
    this.name = "InspirationProviderError";
  }
}
