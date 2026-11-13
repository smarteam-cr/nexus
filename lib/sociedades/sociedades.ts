/**
 * lib/sociedades/sociedades.ts — las sociedades de Smarteam (2026-11-13). PURO: sin Prisma, sin red, sin reloj.
 *
 * Smarteam no es una sola sociedad: CR Smarteam factura en Odoo, Smarteam Consultora LLC en Mercury, Smart Agro
 * arranca y cobra con el mismo flujo de la principal, y Flywheel le debe plata a CR Smarteam. Este módulo dice de cuál
 * es cada cosa y deja un filtro que cualquier pantalla puede usar (`filtrarPorSociedad`).
 *
 * ⚠ NO es la sociedad DEL CLIENTE a la que se le factura (`Cobro.sociedadFacturadaId`, lib/cobranza/sociedades.ts).
 *
 * ── POR QUÉ NINGÚN NOMBRE NI ID VA EN EL CÓDIGO ──────────────────────────────────
 * Las sociedades son filas (`SociedadPropia`, nacen en el SQL). Se las reconoce en Odoo y en el banco por sus `alias`
 * —«flywheel», «smarteam consult»—, que se corrigen en la base. El catálogo de cuentas de Odoo se está fusionando
 * (de más de 270 a unas 32): fijar el id de la cuenta «110304» dejaría de andar el día que se fusione.
 */

export type PlataformaSociedad = "ODOO" | "MERCURY" | "NINGUNA";

export interface SociedadPropiaDTO {
  id: string;
  /** Estable: la del filtro (`?sociedad=flywheel`). */
  clave: string;
  nombre: string;
  razonSocial: string | null;
  pais: string | null;
  plataforma: PlataformaSociedad;
  odooCompanyId: number | null;
  alias: string[];
  principal: boolean;
  activa: boolean;
  orden: number;
}

/** Lo que la ficha de una cuenta muestra de su sociedad (`/api/cobranza/cuentas/[id]/sociedad-propia`). */
export interface SociedadDeLaCuentaDTO {
  sociedades: Array<Pick<SociedadPropiaDTO, "id" | "clave" | "nombre" | "plataforma" | "activa">>;
  /** La que tiene puesta. null = la de su vía. */
  puesta: string | null;
  /** La que vale hoy (la puesta o la de su vía). */
  efectiva: string | null;
  /** La que tendría sin ninguna puesta. */
  porSuVia: string | null;
  viaCobro: string;
}

/** La forma en que se comparan nombres: minúscula, sin tildes y con un espacio entre palabras. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ¿El texto nombra a esta sociedad? Por palabras enteras: «flywheel» no coincide con «flywheels». Devuelve el largo
 * del alias que coincidió (el más largo), o 0. Un alias de menos de 4 letras no cuenta: coincidiría con cualquier cosa.
 */
export function coincidenciaDeAlias(texto: string | null | undefined, alias: readonly string[]): number {
  const t = ` ${normalizarTexto(texto)} `;
  if (t.trim() === "") return 0;
  let mejor = 0;
  for (const a of alias) {
    const n = normalizarTexto(a);
    if (n.length < 4) continue;
    if (t.includes(` ${n} `) && n.length > mejor) mejor = n.length;
  }
  return mejor;
}

/**
 * La sociedad que nombran estos textos (el nombre de una cuenta contable, de un contacto, la referencia de una
 * transferencia). Con dos sociedades nombradas gana la del alias más largo, el más específico; con un empate, nadie:
 * mejor no atribuir que atribuirle una deuda a quien no es.
 */
export function sociedadPorTexto<S extends Pick<SociedadPropiaDTO, "id" | "alias">>(
  textos: ReadonlyArray<string | null | undefined>,
  sociedades: readonly S[],
  excluirId?: string | null,
): S | null {
  let mejor: S | null = null;
  let largo = 0;
  let empate = false;
  for (const s of sociedades) {
    if (excluirId && s.id === excluirId) continue;
    const n = Math.max(0, ...textos.map((t) => coincidenciaDeAlias(t, s.alias)));
    if (n === 0) continue;
    if (n > largo) {
      mejor = s;
      largo = n;
      empate = false;
    } else if (n === largo && mejor?.id !== s.id) {
      empate = true;
    }
  }
  return empate ? null : mejor;
}

/** La sociedad que lleva sus libros en esa compañía de Odoo. null = una compañía que Nexus no conoce (se avisa). */
export function sociedadPorCompany<S extends Pick<SociedadPropiaDTO, "odooCompanyId">>(
  odooCompanyId: number | null | undefined,
  sociedades: readonly S[],
): S | null {
  if (odooCompanyId === null || odooCompanyId === undefined) return null;
  return sociedades.find((s) => s.odooCompanyId === odooCompanyId) ?? null;
}

export function sociedadPrincipal<S extends Pick<SociedadPropiaDTO, "principal" | "activa">>(sociedades: readonly S[]): S | null {
  return sociedades.find((s) => s.principal && s.activa) ?? sociedades.find((s) => s.principal) ?? null;
}

/**
 * De qué sociedad es una cuenta de cobranza. La que tiene puesta, si existe y está activa; si no, la de su vía (Odoo →
 * la que factura en Odoo, Mercury → la que factura en Mercury); si ninguna factura por esa vía, la principal.
 *
 * ⭐ Así casi ninguna cuenta necesita la columna llena: solo las que NO son de la sociedad de su vía (una de Smart
 * Agro, que cobra con el mismo flujo de la principal).
 */
export function sociedadDeLaCuenta<S extends Pick<SociedadPropiaDTO, "id" | "plataforma" | "principal" | "activa" | "orden">>(
  cuenta: { sociedadPropiaId: string | null; viaCobro: string },
  sociedades: readonly S[],
): S | null {
  if (cuenta.sociedadPropiaId) {
    const propia = sociedades.find((s) => s.id === cuenta.sociedadPropiaId && s.activa);
    if (propia) return propia;
  }
  const porVia = [...sociedades]
    .filter((s) => s.activa && s.plataforma === cuenta.viaCobro)
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.orden - b.orden)[0];
  return porVia ?? sociedadPrincipal(sociedades);
}

/** El valor del filtro que significa «todas». */
export const TODAS_LAS_SOCIEDADES = "todas";

/** `?sociedad=` → la clave de una sociedad que existe, o null (= todas). Un valor que no existe no filtra nada. */
export function claveDelFiltro(
  valor: string | null | undefined,
  sociedades: ReadonlyArray<Pick<SociedadPropiaDTO, "clave">>,
): string | null {
  if (!valor || valor === TODAS_LAS_SOCIEDADES) return null;
  return sociedades.some((s) => s.clave === valor) ? valor : null;
}

/**
 * EL filtro por sociedad, para cualquier lista. `claveDe` dice de qué sociedad es cada fila (su clave, o null si no se
 * sabe). Con el filtro en «todas» devuelve la lista tal cual; con una sociedad, solo las suyas: una fila sin sociedad
 * no es de ninguna.
 */
export function filtrarPorSociedad<T>(filas: readonly T[], clave: string | null, claveDe: (fila: T) => string | null): T[] {
  if (!clave) return [...filas];
  return filas.filter((f) => claveDe(f) === clave);
}

/** Cuántas filas tiene cada sociedad, para mostrar el filtro con sus números. */
export function contarPorSociedad<T>(filas: readonly T[], claveDe: (fila: T) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of filas) {
    const c = claveDe(f);
    if (c) out.set(c, (out.get(c) ?? 0) + 1);
  }
  return out;
}

/**
 * Las opciones del filtro: «Todas» y las sociedades que tienen algo que mostrar, en su orden. Una sociedad sin filas no
 * aparece (Flywheel no cobra: en Cobranza sería un filtro que siempre da vacío), salvo la elegida, para poder salir.
 */
export function opcionesDelFiltro(
  sociedades: ReadonlyArray<Pick<SociedadPropiaDTO, "clave" | "nombre" | "orden" | "activa">>,
  conteo: ReadonlyMap<string, number>,
  elegida: string | null,
): Array<{ clave: string; etiqueta: string; cuenta?: number }> {
  const total = [...conteo.values()].reduce((s, n) => s + n, 0);
  const con = [...sociedades]
    .filter((s) => s.activa && ((conteo.get(s.clave) ?? 0) > 0 || s.clave === elegida))
    .sort((a, b) => a.orden - b.orden)
    .map((s) => ({ clave: s.clave, etiqueta: s.nombre, cuenta: conteo.get(s.clave) ?? 0 }));
  return [{ clave: TODAS_LAS_SOCIEDADES, etiqueta: "Todas", cuenta: total }, ...con];
}
