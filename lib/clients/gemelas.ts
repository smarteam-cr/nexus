/**
 * lib/clients/gemelas.ts — ¿esta empresa de HubSpot ya está en Nexus con OTRA ficha?
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ ES LO PRIMERO ─────────────────────────────────
 * El botón «Traer de HubSpot» crea un `Client`. El anti-duplicado obvio —cruzar
 * `hubspotCompanyId`— NO alcanza, y está medido: de las 4 empresas que hoy calificaban,
 * **3 ya eran clientes de Nexus** creados por el importador de cobranza
 * (`lib/cobranza/ingest.ts`), que los crea SIN `hubspotCompanyId`. O sea que el cruce por id
 * las ve como nuevas.
 *
 * Y partir un cliente en dos no es cosmético: **parte la plata del trabajo**. La cuenta y los
 * cobros quedan en una ficha, el proyecto en la otra, y `ServicioContratado.projectId` apunta a
 * un `Project` que ahora es de otro `Client` — el servicio que cobra nunca puede colgarse del
 * proyecto que paga. Ya pasó el 2026-07-10 (111 clientes creados de una, 4 duplicados) y el
 * post-mortem vive en `scripts/cleanup-partner-created-clients.ts`, cuya lista de merges
 * empieza, literal, con `["MTS Multiservicios", "MTS MULTISERVICIOS"]`.
 *
 * ⚠ ES UN AVISO, NO UN CANDADO. Dos fichas parecidas pueden ser dos empresas distintas de
 * verdad, así que esto no puede bloquear: le muestra a la persona la ficha que ya existe y la
 * obliga a decir «es otra». Por eso el umbral es LAXO a propósito: un aviso de más cuesta un
 * segundo de lectura; una gemela no vista parte la cobranza en dos.
 */

/**
 * Sufijos legales al FINAL del nombre.
 *
 * ⚠ Se sacan como FRASE y no palabra por palabra: al quitar la puntuación, «S.A.» queda como
 * dos letras sueltas («s a»), y una lista de palabras que contuviera «a» destrozaría cualquier
 * nombre real. Por eso el patrón se aplica sobre el texto todavía espaciado, anclado al final,
 * y en bucle (para «S.A. de C.V.»).
 */
const SUFIJO_LEGAL_RE =
  /\s+(?:s\s*a\s*s?|s\s*r\s*l|s\s*de\s*r\s*l|de\s*c\s*v|ltda?|inc|corp|y\s+cia|cia|sociedad\s+anonima|limitada)$/;

/** Los ccTLD compuestos que hay que sacar enteros (`.com.gt` no es dominio de `gt`). */
const TLD_COMPUESTOS = [
  ".com.ar", ".com.br", ".com.co", ".com.gt", ".com.hn", ".com.mx", ".com.pa", ".com.pe",
  ".com.sv", ".com.uy", ".com.ve", ".co.cr", ".co.uk", ".net.mx",
];

/**
 * La RAÍZ de un dominio, sin protocolo, sin `www.` y sin extensión.
 *
 * `construtecho.com`, `construtecho.com.gt` y `construtecho.cr` colapsan todos en
 * `construtecho`. Es exactamente el caso medido: la misma empresa con el dominio de cada país.
 */
export function raizDeDominio(dominio: string): string {
  let d = dominio.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("@").pop() ?? d;
  for (const tld of TLD_COMPUESTOS) {
    if (d.endsWith(tld)) return d.slice(0, -tld.length);
  }
  const punto = d.lastIndexOf(".");
  return punto > 0 ? d.slice(0, punto) : d;
}

/** El nombre de una empresa, comparable: sin acentos, sin puntuación, sin sufijos legales. */
export function normalizarEtiqueta(nombre: string): string {
  let base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Lo que va entre paréntesis suele ser la razón social o un alias: no distingue.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let previo: string;
  do {
    previo = base;
    base = base.replace(SUFIJO_LEGAL_RE, "").trim();
  } while (base !== previo);
  return base.replace(/\s+/g, "");
}

/** Mínimo de caracteres para que un prefijo cuente. Debajo de esto, «dcc» matchearía cualquier cosa. */
const MINIMO_PREFIJO = 5;

/** ¿Una es prefijo de la otra, con suficiente cuerpo como para no ser casualidad? */
function seParecen(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length < MINIMO_PREFIJO || b.length < MINIMO_PREFIJO) return a === b && a.length > 0;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Lo mínimo que hay que traer de un Client para poder compararlo. */
export interface ClienteComparable {
  id: string;
  name: string;
  company: string | null;
  emailDomains: string[];
}

/** Lo que se sabe de la empresa candidata, del lado de HubSpot. */
export interface EmpresaCandidata {
  nombre: string | null;
  dominio: string | null;
}

export interface Gemela {
  clientId: string;
  nombre: string;
  /** Por qué se parecen, para poder decírselo a la persona. */
  motivo: "dominio" | "nombre";
}

/**
 * Las fichas de Nexus que PODRÍAN ser esta misma empresa.
 *
 * Devuelve todas las que se parecen, no la mejor: la persona decide, y para eso necesita ver
 * las candidatas. El orden es determinista (dominio primero, después nombre, y dentro de cada
 * grupo por nombre) porque esta lista se pinta y no puede bailar entre llamadas.
 */
export function detectarGemelas(
  candidata: EmpresaCandidata,
  clientes: readonly ClienteComparable[],
): Gemela[] {
  const raizCandidata = candidata.dominio ? raizDeDominio(candidata.dominio) : "";
  const etiquetaCandidata = candidata.nombre ? normalizarEtiqueta(candidata.nombre) : "";
  // El dominio también sirve como nombre: la ficha de HubSpot puede no tener `name` (1 de cada
  // 4 candidatas medidas), y entonces el dominio es lo único que hay para comparar.
  const etiquetasCandidata = [etiquetaCandidata, raizCandidata].filter(Boolean);

  const porDominio: Gemela[] = [];
  const porNombre: Gemela[] = [];

  for (const c of clientes) {
    const raices = c.emailDomains.map(raizDeDominio).filter(Boolean);
    if (raizCandidata && raices.some((r) => seParecen(r, raizCandidata))) {
      porDominio.push({ clientId: c.id, nombre: c.name, motivo: "dominio" });
      continue;
    }
    const etiquetas = [c.name, c.company]
      .filter((x): x is string => !!x)
      .map(normalizarEtiqueta)
      .filter(Boolean);
    // La raíz del dominio del cliente también compite como nombre: en Nexus hay fichas cuyo
    // `name` ES el dominio (el caso `kamalio.com`).
    etiquetas.push(...raices);
    if (etiquetas.some((e) => etiquetasCandidata.some((ec) => seParecen(e, ec)))) {
      porNombre.push({ clientId: c.id, nombre: c.name, motivo: "nombre" });
    }
  }

  const ordenar = (g: Gemela[]) => g.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [...ordenar(porDominio), ...ordenar(porNombre)];
}
