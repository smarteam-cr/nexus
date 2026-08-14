/**
 * lib/projects/publish-surfaces.ts — las superficies de PROYECTO que se comparten al exterior.
 *
 * FUENTE ÚNICA. Antes esta lista vivía transcrita en tres lugares que no se conocían entre sí:
 * un ternario en el panel de acceso (`kind === "kickoff" ? … : kind === "cronograma" ? … : …`),
 * el `select` del chokepoint, y un `expect(conPost).toBe(3)` a mano en `publicable.test.ts`.
 * Sumar la cuarta obligaba a acertarle a los tres, y el test —que existe para que nadie se
 * olvide— era justamente el que había que editar para que dejara de quejarse.
 *
 * Ahora el candado DERIVA de acá, así que pasó a ser más fuerte: además de cazar un endpoint
 * de publicación sin guard, caza una superficie declarada que no tiene endpoint.
 *
 * ⚠ El nombre del directorio importa. `lib/projects/publicable.test.ts` descubre los endpoints
 * por DIRECTORIO (`app/api/**​/publish-*​/route.ts`), así que un endpoint que no empiece con
 * `publish-` nace fuera del descubrimiento — y por lo tanto sin que nadie verifique que llama
 * a `guardPublicacionDeProyecto`. Es exactamente el modo de falla que el candado cierra.
 */
export interface PublishSurface {
  /** La key que usa la UI. */
  key: "kickoff" | "cronograma" | "desarrollo" | "entrega";
  /** Rótulo del link en el panel de acceso. */
  label: string;
  /** Directorio del endpoint bajo `app/api/projects/[projectId]/`. SIEMPRE `publish-*`. */
  endpoint: string;
  /** Campo de `Project` que marca «compartido». El chokepoint lo exige NO-null en cada lectura. */
  flag: "kickoffPublishedAt" | "timelinePublishedAt" | "desarrolloPublishedAt" | "entregaPublishedAt";
  /** Valor de `?next=` en el link de verificación. `null` = el kickoff, que es el default. */
  next: string | null;
}

export const PUBLISH_SURFACES: readonly PublishSurface[] = [
  { key: "kickoff", label: "Link Kickoff", endpoint: "publish-kickoff", flag: "kickoffPublishedAt", next: null },
  { key: "cronograma", label: "Link Cronograma", endpoint: "publish-timeline", flag: "timelinePublishedAt", next: "cronograma" },
  {
    key: "desarrollo",
    label: "Link Requerimiento técnico",
    endpoint: "publish-desarrollo",
    flag: "desarrolloPublishedAt",
    next: "desarrollo",
  },
  { key: "entrega", label: "Link Entrega", endpoint: "publish-entrega", flag: "entregaPublishedAt", next: "entrega" },
] as const;

export type PublishSurfaceKey = PublishSurface["key"];

const BY_KEY = new Map(PUBLISH_SURFACES.map((s) => [s.key, s]));

export function publishSurface(key: PublishSurfaceKey): PublishSurface {
  const s = BY_KEY.get(key);
  if (!s) throw new Error(`Superficie de publicación desconocida: ${key}`);
  return s;
}

/** `"kickoffPublishedAt"` → `"kickoffPublished"`. Distribuye sobre la unión (T es desnudo). */
type SinAt<T extends string> = T extends `${infer B}At` ? B : never;

/**
 * La key del DTO de `GET /external-access` que dice si la superficie está compartida: el `flag`
 * de la base sin el sufijo `At`. Se declara como TIPO —no como campo— para que sumar una
 * superficie al registro tipe sola la respuesta y el panel, sin tocar tres interfaces a mano.
 */
export type PublishedDtoKey = SinAt<PublishSurface["flag"]>;

export function publishedDtoKey(s: PublishSurface): PublishedDtoKey {
  return s.flag.slice(0, -2) as PublishedDtoKey;
}
