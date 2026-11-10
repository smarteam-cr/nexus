/**
 * lib/exploraciones/unidades-en-la-lista.ts — las unidades de una empresa en «Planificar con una empresa». PURO.
 *
 * Desde el 9 nov una empresa puede ser varias fichas (DECISIONS «Una empresa con varias unidades»): la principal, con
 * el dominio y la empresa de HubSpot, y las unidades que le cuelgan (`comparteDominioConId`). HubSpot solo conoce la
 * empresa: buscando «cema» devolvía «Cemaco Internacional» y no había cómo planificar la preventa de «Cemaco ·
 * Ecuador». Acá la lista de HubSpot se vuelve una lista de OPCIONES, una por ficha:
 *
 *   - Una empresa de HubSpot cuya ficha tiene unidades (o es una unidad) trae al grupo entero, en su lugar: una
 *     CABECERA con el nombre de la empresa («Cemaco», sin botón: solo agrupa) y debajo, al mismo nivel, cada ficha
 *     («Cemaco · Costa Rica», con el nombre de HubSpot chico si difiere, y «Cemaco · Ecuador»). Elías, 9 nov: la
 *     principal no es la madre de las otras; las dos son unidades de Cemaco.
 *   - Buscar por el nombre de una unidad («Ecuador», «AE») o sus siglas encuentra su grupo aunque HubSpot no lo
 *     conozca: va arriba, solo en la primera página.
 *   - Cada opción abre o crea la preventa de SU ficha (invariante 1): la principal por su empresa de HubSpot
 *     (`companyId`), una unidad SIEMPRE por su ficha (`clientId`), tenga o no empresa propia. *Por qué siempre:* la
 *     puerta de la empresa resuelve a quien tenga la empresa VIVA, y si la de la unidad se fusiona con la de la
 *     principal (ya le pasó a la vieja de AE), HubSpot contesta con la de la principal y abriría su preventa.
 *
 * Una empresa sin unidades sigue como antes: el nombre de HubSpot.
 */
import { industriaLegible } from "./industria";

/** Una empresa de la página de HubSpot, ya con la industria legible. */
export interface EmpresaEnLaLista {
  id: string;
  nombre: string;
  dominio: string | null;
  industria: string | null;
  pais: string | null;
  ultimaActividad: string | null;
}

/** Una ficha de Nexus que la lista necesita: las de las empresas de la página y las de los grupos. */
export interface FichaDeLaLista {
  id: string;
  name: string;
  kind: string;
  hubspotCompanyId: string | null;
  comparteDominioConId: string | null;
  siglas: string[];
  emailDomains: string[];
  industry: string | null;
  /** La preventa viva de ESTA ficha, si hay. */
  exploracionId: string | null;
}

/** La cabecera de una empresa con unidades: solo agrupa, no se planifica. */
export interface CabeceraDeGrupo {
  tipo: "grupo";
  /** `grupo:<id de la principal>`. */
  clave: string;
  /** El nombre de la empresa: «Cemaco», «TEC» (`nombreDelGrupo`). */
  nombre: string;
  /** Cuántas opciones lleva debajo. */
  unidades: number;
  /** El dominio que comparten (el de la principal). */
  dominio: string | null;
}

export interface OpcionDeEmpresa {
  tipo: "opcion";
  /** Única en la lista: el id de la ficha si la hay, si no el de la empresa de HubSpot. */
  clave: string;
  /** Se abre por la empresa de HubSpot (la puerta de Ventas resuelve su ficha). Nunca en una unidad. */
  companyId: string | null;
  /** Se abre por la ficha: solo una unidad. */
  clientId: string | null;
  /** La ficha no tiene empresa propia en HubSpot (una unidad que vive en la de su principal). */
  sinEmpresaPropia: boolean;
  nombre: string;
  /** El nombre de la empresa en HubSpot cuando la opción muestra el de Nexus y no coinciden. */
  enHubspot: string | null;
  /** La opción es una de las unidades de una empresa (va debajo de su cabecera). */
  enGrupo: boolean;
  dominio: string | null;
  industria: string | null;
  pais: string | null;
  ultimaActividad: string | null;
  esCliente: boolean;
  exploracionId: string | null;
}

/** Sin tildes, en minúsculas y con todo signo como espacio: «TEC · AE» → «tec ae». */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * ¿La búsqueda nombra a esta ficha por Nexus? Una palabra del nombre que empieza con lo buscado («cema», «ecua»,
 * «costa ri»), o una sigla igual a lo buscado («ae»). Por palabra y no por pedazo: «ae» no es «TEC · TAE».
 */
export function laBusquedaNombraALaFicha(q: string, ficha: Pick<FichaDeLaLista, "name" | "siglas">): boolean {
  const t = plano(q);
  if (t.length < 2) return false;
  if (` ${plano(ficha.name)}`.includes(` ${t}`)) return true;
  return ficha.siglas.some((s) => plano(s) === t);
}

/**
 * El nombre de la empresa de un grupo. La separación en unidades nombra cada ficha «Empresa · Unidad»
 * (scripts/lib/unidades.ts; la prueba lo vigila contra cada entrada): el nombre es lo que va antes del « · » cuando
 * TODAS las fichas del grupo lo comparten. Si no lo comparten, el nombre de la empresa de HubSpot de la principal, y
 * si no hay, el de la principal.
 */
export function nombreDelGrupo(nombres: readonly string[], deHubspot: string | null): string {
  const antes = nombres.map((n) => {
    const i = n.indexOf(" · ");
    return i > 0 ? n.slice(0, i).trim() : null;
  });
  const primero = antes[0];
  if (primero && antes.every((a) => a !== null && plano(a) === plano(primero))) return primero;
  return deHubspot ?? nombres[0] ?? "";
}

/** Una fila de la lista: la cabecera de una empresa con unidades, o una opción que se planifica. */
export type FilaDeLaLista = CabeceraDeGrupo | OpcionDeEmpresa;

export function armarOpciones(o: {
  empresas: EmpresaEnLaLista[];
  fichas: FichaDeLaLista[];
  /** Lo buscado; solo se usa en la primera página para sumar los grupos que HubSpot no encontró. */
  q: string;
  primeraPagina: boolean;
}): FilaDeLaLista[] {
  const porId = new Map(o.fichas.map((f) => [f.id, f]));
  const porEmpresa = new Map(o.fichas.filter((f) => f.hubspotCompanyId).map((f) => [f.hubspotCompanyId!, f]));
  const unidadesDe = (raizId: string) =>
    o.fichas.filter((f) => f.comparteDominioConId === raizId).sort((a, b) => a.name.localeCompare(b.name, "es"));
  /** La principal del grupo de la ficha, o null si la ficha no es parte de una empresa con unidades. */
  const raizDe = (f: FichaDeLaLista): FichaDeLaLista | null => {
    if (f.comparteDominioConId) return porId.get(f.comparteDominioConId) ?? null;
    return unidadesDe(f.id).length > 0 ? f : null;
  };

  const salida: FilaDeLaLista[] = [];
  const gruposPuestos = new Set<string>();

  const deLaFicha = (f: FichaDeLaLista, empresa: EmpresaEnLaLista | null, raiz: FichaDeLaLista): OpcionDeEmpresa | null => {
    const esUnidad = f.id !== raiz.id;
    // La principal se abre por su empresa de HubSpot; sin una, no hay puerta (la de la ficha es solo para unidades).
    if (!esUnidad && !f.hubspotCompanyId) return null;
    return {
      tipo: "opcion",
      clave: f.id,
      companyId: esUnidad ? null : f.hubspotCompanyId,
      clientId: esUnidad ? f.id : null,
      sinEmpresaPropia: !f.hubspotCompanyId,
      nombre: f.name,
      enHubspot: empresa && plano(empresa.nombre) !== plano(f.name) ? empresa.nombre : null,
      enGrupo: true,
      dominio: empresa?.dominio ?? f.emailDomains[0] ?? null,
      industria: empresa?.industria ?? industriaLegible(f.industry),
      pais: empresa?.pais ?? null,
      ultimaActividad: empresa?.ultimaActividad ?? null,
      esCliente: f.kind === "CLIENTE",
      exploracionId: f.exploracionId,
    };
  };

  const ponerGrupo = (raiz: FichaDeLaLista, destino: FilaDeLaLista[]) => {
    gruposPuestos.add(raiz.id);
    const fichas = [raiz, ...unidadesDe(raiz.id)];
    const deHubspot = raiz.hubspotCompanyId ? (o.empresas.find((e) => e.id === raiz.hubspotCompanyId)?.nombre ?? null) : null;
    destino.push({
      tipo: "grupo",
      clave: `grupo:${raiz.id}`,
      nombre: nombreDelGrupo(
        fichas.map((f) => f.name),
        deHubspot,
      ),
      unidades: fichas.filter((f) => f.id !== raiz.id || f.hubspotCompanyId).length,
      dominio: raiz.emailDomains[0] ?? null,
    });
    for (const f of fichas) {
      // Los datos de HubSpot solo los lleva la ficha DUEÑA de esa empresa en la página: nunca la principal se los presta a una unidad.
      const empresa = f.hubspotCompanyId ? (o.empresas.find((e) => e.id === f.hubspotCompanyId) ?? null) : null;
      const op = deLaFicha(f, empresa, raiz);
      if (op) destino.push(op);
    }
  };

  for (const e of o.empresas) {
    const ficha = porEmpresa.get(e.id) ?? null;
    const raiz = ficha ? raizDe(ficha) : null;
    if (raiz) {
      if (!gruposPuestos.has(raiz.id)) ponerGrupo(raiz, salida);
      continue;
    }
    salida.push({
      tipo: "opcion",
      clave: ficha?.id ?? `hs:${e.id}`,
      companyId: e.id,
      clientId: null,
      sinEmpresaPropia: false,
      nombre: e.nombre,
      enHubspot: null,
      enGrupo: false,
      dominio: e.dominio,
      industria: e.industria,
      pais: e.pais,
      ultimaActividad: e.ultimaActividad,
      esCliente: ficha?.kind === "CLIENTE",
      exploracionId: ficha?.exploracionId ?? null,
    });
  }

  // Los grupos que la búsqueda nombra por Nexus y HubSpot no trajo («Ecuador»): arriba, porque calzan por nombre.
  if (o.primeraPagina && o.q.trim().length >= 2) {
    const arriba: FilaDeLaLista[] = [];
    for (const f of o.fichas) {
      if (!laBusquedaNombraALaFicha(o.q, f)) continue;
      const raiz = raizDe(f);
      if (raiz && !gruposPuestos.has(raiz.id)) ponerGrupo(raiz, arriba);
    }
    salida.unshift(...arriba);
  }
  return salida;
}

/**
 * Suma la página que sigue sin repetir opciones: un grupo que la primera página trajo por nombre puede volver cuando
 * HubSpot devuelve su empresa más adelante, y una unidad con empresa propia puede salir en otra página que su principal.
 */
export function sumarPagina<T extends { clave: string }>(antes: readonly T[], nuevas: readonly T[]): T[] {
  const ya = new Set(antes.map((o) => o.clave));
  const salida = [...antes];
  for (const o of nuevas) {
    if (ya.has(o.clave)) continue;
    ya.add(o.clave);
    salida.push(o);
  }
  return salida;
}
