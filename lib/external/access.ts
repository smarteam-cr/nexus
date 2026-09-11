/**
 * lib/external/access.ts
 *
 * Resolución COMPARTIDA del acceso externo (Fase C / D.1.5): el paso común de TODOS los
 * chokepoints de superficie externa (kickoff, cronograma, requerimiento técnico, entrega).
 *
 * Acá viven los checks que son del ACCESO: forma de la credencial, existencia, revokedAt, versión
 * de la contraseña y si el proyecto admite mirones de afuera. Los flags de PUBLICACIÓN por
 * superficie (kickoffPublishedAt / timelinePublishedAt / …) NO se chequean acá a propósito: cada
 * chokepoint hace su check explícito en su propio archivo — la seguridad de cada superficie se lee
 * donde se decide, no escondida en el resolver.
 *
 * ── DÓNDE VA CADA CHECK, Y POR QUÉ ───────────────────────────────────────────
 * Por SUPERFICIE → la vista (¿está publicado ESTE kickoff?). Por PROYECTO → acá (¿este proyecto
 * admite que alguien de afuera lo vea?). `publicable` es del segundo tipo: no depende de qué
 * superficie se pida, así que ponerlo en las cuatro vistas serían cuatro copias, y la quinta
 * superficie que alguien agregue mañana nacería sin él.
 *
 * ⚠ Este NO es el único lugar que resuelve un token: `/external/verify-access` hace su propia
 * consulta para canjear la contraseña por la credencial de 30 días y NO pasa por acá. El mismo
 * check tiene que estar en los DOS.
 *
 * ── LA CREDENCIAL LLEVA LA VERSIÓN DE LA CONTRASEÑA (A-11) ────────────────────
 * Se resuelve el VALOR de una credencial (`<token>.<versión>`, ver lib/external/credencial.ts),
 * nunca un token pelado: la versión se deriva del hash vigente, y una credencial canjeada con una
 * contraseña anterior deja de coincidir. Así cambiar la contraseña expulsa a quien ya había
 * entrado — que es para lo que se cambia.
 *
 * ── LA DIRECCIÓN MANDA (2026-09-10) ──────────────────────────────────────────
 * Hasta acá el navegador guardaba UNA credencial y la dirección no nombraba el proyecto: la página
 * mostraba el del último acceso guardado. Así Elías abrió «el cronograma de Judesur» y vio el de
 * Wherex. Ahora la dirección nombra el acceso (`/external/<superficie>/<id>`), el navegador guarda
 * varios (lib/external/lista-de-accesos.ts), y `resolveActiveAccess` exige el id: una credencial
 * válida de OTRO acceso no devuelve nada. Ninguna página puede mostrar un proyecto que su
 * dirección no nombra.
 */
import { prisma } from "@/lib/db/prisma";
import { credencialVigente, leerCredencial, type Credencial } from "@/lib/external/credencial";
import {
  hechosDeProyecto,
  projectCapabilities,
  type FilaParaHechos,
} from "@/lib/projects/kind";

/** Forma del token: 64 chars hex (crypto.randomBytes(32)). */
export const TOKEN_RE = /^[a-f0-9]{64}$/i;

export interface ActiveAccess {
  accessId: string;
  project: {
    id: string;
    name: string;
    /** Para que «Ver otros proyectos» se limite al mismo cliente (lib/external/selector-de-proyectos.ts). */
    clientId: string;
    kickoffPublishedAt: Date | null;
    timelinePublishedAt: Date | null;
    desarrolloPublishedAt: Date | null;
    entregaPublishedAt: Date | null;
    /** Empresa cliente (Client) — nombre para titulares + logo para el chrome client-facing. */
    // Los tres campos del logo viajan juntos: qué archivo, cuál variante y a qué tamaño
    // son una sola unidad visual (ver lib/ui/logo-scale.ts).
    client: { name: string; logoUrl: string | null; logoDarkUrl: string | null; logoScale: number | null };
  };
}

/**
 * Un proyecto que ESTE navegador tiene abierto, con la credencial que lo abre.
 * ⛔ `credencial` es server-side: se le pasa a una vista, jamás a un componente de cliente.
 */
export interface AccesoDelNavegador extends ActiveAccess {
  credencial: string;
}

/** El select del acceso, UNO para las dos lecturas: el resolver de una página y el del navegador. */
const SELECT_ACCESO = {
  id: true,
  revokedAt: true,
  passwordHash: true,
  project: {
    select: {
      id: true,
      name: true,
      clientId: true,
      kickoffPublishedAt: true,
      timelinePublishedAt: true,
      desarrolloPublishedAt: true,
      entregaPublishedAt: true,
      // De qué CLASE es el proyecto: decide si admite mirones de afuera.
      hubspotPipelineId: true,
      proyectoInterno: true,
      hermanoCsProjectId: true,
      altaEstado: true,
      // Los tres campos del logo viajan JUNTOS: qué archivo, cuál variante y a qué
      // tamaño son una sola unidad visual. Este select es el chokepoint de las CUATRO
      // superficies externas — se agrega acá una vez.
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
  },
} as const;

interface FilaDeAcceso {
  id: string;
  revokedAt: Date | null;
  passwordHash: string;
  project: ActiveAccess["project"] & FilaParaHechos;
}

/**
 * Los checks del ACCESO, en un solo lugar para las dos lecturas. Devuelve null si el acceso está
 * revocado, si la credencial se canjeó con otra contraseña, o si el proyecto dejó de admitir
 * publicación externa.
 */
function chequearAcceso(access: FilaDeAcceso, cred: Credencial): ActiveAccess | null {
  // Acceso revocado → gana sobre la credencial, en CADA lectura.
  if (access.revokedAt) return null;

  // La versión de la credencial tiene que ser la del hash VIGENTE: cambiar la contraseña
  // invalida toda credencial canjeada con la anterior (A-11).
  if (!credencialVigente(cred, access.passwordHash)) return null;

  /* ¿El proyecto admite publicación externa? Devolver `null` —y no un error propio— es
     deliberado: para quien está afuera, un proyecto que dejó de ser publicable se comporta igual
     que un acceso revocado, sin contarle que existe. */
  if (!publicableAfuera(access.project)) return null;

  return { accessId: access.id, project: access.project };
}

/**
 * credencial + id del acceso que nombra la DIRECCIÓN → acceso ACTIVO de ESE proyecto.
 *
 * Devuelve null si la credencial tiene forma inválida, no existe, está revocada, se canjeó con
 * otra contraseña, el proyecto no es publicable — o si es de OTRO acceso que el que pide la página.
 * Nunca lanza por "denegado". El check del flag de la superficie corre en cada chokepoint (la
 * credencial de 30 días jamás otorga acceso por sí sola).
 */
export async function resolveActiveAccess(credencial: string, accesoId: string): Promise<ActiveAccess | null> {
  // 0. Forma de la credencial: `<token>.<versión>` (evita tocar DB con basura; un token pelado
  //    de antes de A-11 tampoco pasa de acá).
  const cred = leerCredencial(credencial);
  if (!cred) return null;

  // 1. token → acceso → proyecto (con los flags de publicación).
  const access = await prisma.projectExternalAccess.findUnique({
    where: { accessToken: cred.token },
    select: SELECT_ACCESO,
  });
  if (!access) return null;

  // 2. ⭐ La credencial es válida pero de OTRO proyecto que el que nombra la dirección: no se
  //    muestra nada. Es exactamente el incidente del 2026-09-10 (Judesur pedido, Wherex servido).
  if (access.id !== accesoId) return null;

  // 3. revokedAt + versión de la contraseña + publicable.
  return chequearAcceso(access, cred);
}

/**
 * Las credenciales que trae el navegador → los proyectos que tiene abiertos, ya chequeados.
 *
 * Es lo que alimenta «Ver otros proyectos» y la página que elige proyecto cuando la dirección no
 * lo dice. Una sola consulta para todas. NO marca uso (`lastUsedAt`): listar un proyecto no es
 * mirarlo; lo marca solo la vista del proyecto que se abre.
 */
export async function resolverAccesosDelNavegador(credenciales: readonly string[]): Promise<AccesoDelNavegador[]> {
  // Tope defensivo: la lista ya viene acotada (lib/external/lista-de-accesos.ts), esto solo
  // impide que una cookie fabricada a mano convierta el render en una consulta enorme.
  const creds = credenciales
    .map((c) => leerCredencial(c))
    .filter((c): c is Credencial => c !== null)
    .slice(0, 16);
  if (creds.length === 0) return [];

  const filas = await prisma.projectExternalAccess.findMany({
    where: { accessToken: { in: creds.map((c) => c.token) } },
    select: { ...SELECT_ACCESO, accessToken: true },
  });
  const porToken = new Map(filas.map((f) => [f.accessToken, f]));

  const out: AccesoDelNavegador[] = [];
  const vistos = new Set<string>();
  for (const cred of creds) {
    const fila = porToken.get(cred.token);
    if (!fila || vistos.has(fila.id)) continue;
    const activo = chequearAcceso(fila, cred);
    if (!activo) continue;
    vistos.add(fila.id);
    out.push({ ...activo, credencial: `${cred.token}.${cred.version}` });
  }
  return out;
}

/**
 * ¿Este proyecto admite que alguien de AFUERA lo mire? Compartida por los dos lugares que
 * resuelven un token (este archivo y `/external/verify-access`) para que no puedan responder
 * distinto.
 */
export function publicableAfuera(p: FilaParaHechos): boolean {
  return projectCapabilities(hechosDeProyecto(p)).publicable;
}

/** Marca de uso best-effort — nunca bloquea el render de la superficie. */
export async function touchAccess(accessId: string): Promise<void> {
  await prisma.projectExternalAccess
    .update({ where: { id: accessId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}
