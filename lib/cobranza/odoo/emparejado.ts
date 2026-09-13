/**
 * lib/cobranza/odoo/emparejado.ts
 *
 * Qué cliente de Odoo es qué cuenta de Nexus. Módulo puro: sin Prisma, sin red, sin reloj.
 *
 * ── POR QUÉ ESTA PANTALLA EXISTE Y NO ES «CONFIRMÁ ESTAS 49 PROPUESTAS» ──────────
 * Medido el 2026-09-02 contra las 49 cuentas reales y los 82 clientes reales de Odoo:
 *
 *     por cédula ............  2
 *     por nombre exacto .....  4
 *     dudosas ...............  8
 *     SIN NINGÚN CANDIDATO .. 33
 *     inemparejables ........  2
 *
 * **6 de 49 se resuelven solas.** La razón es estructural, no un matcher flojo: Nexus guarda
 * el nombre COMERCIAL (`Wherex`, `ALMOTEC`, `Teamnet`) y Odoo la RAZÓN SOCIAL (`CORPORACION
 * ALMOTEC SOCIEDAD ANONIMA`). Iberorutas factura como «SERVICIOS SAN MATEO Y SANTA ELENA DEL
 * SUR S.A.»: no hay heurística de nombres que una esas dos cadenas.
 *
 * Por eso el flujo principal de la pantalla es **buscar**, y las propuestas son el atajo.
 *
 * ── ⭐ Y POR ESO SE AGREGÓ LA SEÑAL DE MONTO ────────────────────────────────────
 * El monto exacto de una factura da **17 candidatos únicos contra 6 del nombre**, y resuelve
 * justo los que el nombre no puede: Corrugando→ACCCSA, TEC-AE→Fundación Tecnológica,
 * APRECAP, Cicadex.
 *
 * ⚠ Pero **~6 de esos 17 están mal** —Bluesat→Forestales, Teamnet→Fundación Tecnológica—
 * porque dos clientes distintos comparten un monto redondo y uno de los dos ni siquiera
 * factura en Odoo. Con ~65 % de acierto **NO puede aplicarse solo**: se propone con la
 * evidencia a la vista y confirma una persona.
 */
import { palabrasDistintivas, seParecen } from "@/lib/ventas/respaldo-de-factura";

/* ── 1. Cédulas ─────────────────────────────────────────────────────────────────── */

/**
 * ⚠ `base_vat` NO está instalado en este Odoo: el `vat` es texto libre sin validar. De 123
 * partners con vat, **46 no tienen un solo dígito**, y los formatos conviven en la misma
 * base: `3101497341`, `3-101-105018`, `31010746160` (11 dígitos, probablemente un typo).
 *
 * ⚠ Odoo no agrega el prefijo «CR» en Costa Rica, pero SÍ lo normaliza si alguien lo escribió
 * a mano, así que `CR3101098834` y `3101098834` son el mismo contribuyente.
 *
 * El prefijo se quita SOLO si lo que sigue son puros dígitos: un RFC mexicano como
 * `COAL780221HR9` no es un vat con prefijo de país, y quitarle el `CO` fabricaría un número
 * que no existe.
 */
export function soloDigitos(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  const m = t.match(/^([A-Za-z]{2})([\d\s.-]+)$/);
  return (m ? m[2]! : t).replace(/\D/g, "");
}

/** 9 = física · 10 = jurídica o NITE · 11-12 = DIMEX. Otra cosa no es una cédula de CR. */
export function claseDeCedula(digitos: string): string {
  if (digitos.length === 9 && digitos[0] !== "0") return "fisica(9)";
  if (digitos.length === 10) return "juridica/NITE(10)";
  if ((digitos.length === 11 || digitos.length === 12) && digitos[0] !== "0") return "DIMEX(11-12)";
  return `fuera-de-norma(${digitos.length})`;
}

/* ── 2. Nombres ─────────────────────────────────────────────────────────────────── */

/** Las formas jurídicas que aparecen en la razón social y no distinguen a nadie. */
const SUFIJOS =
  /\b(s\s?\.?\s?a\s?\.?\s?s?|sociedad\s+anonima|s\s?\.?\s?r\s?\.?\s?l|srl|ltda?|limitada|cia|compania|corp|corporation|inc|llc|ltd|sas|eirl)\b\.?/gi;

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,()\-]/g, " ")
    .replace(SUFIJOS, " ")
    .replace(/[^a-z0-9\s&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── 3. Las entradas ────────────────────────────────────────────────────────────── */

export interface PartnerOdoo {
  odooPartnerId: number;
  nombre: string;
  vat: string | null;
  customerRank: number;
}

export interface CuentaNexus {
  cuentaId: string;
  nombre: string;
  cedulaJuridica: string | null;
  /**
   * Los montos NETOS distintos que Nexus tiene cargados para esta cuenta, **con su moneda**.
   *
   * ⚠ La moneda no es decoración. `cruzar()` de diferencias.ts ya exigía moneda igual para
   * aparear —«USD 2.000 y CRC 2.000 no son el mismo hecho, son 500 veces distintos»— y esta
   * función se saltaba esa misma regla: proponía un cliente de Odoo cuya factura en colones
   * coincidía en número con un cobro en dólares.
   */
  montos: Array<{ monto: number; moneda: string }>;
}

/** Un monto neto facturado en Odoo, con el partner que lo emitió. */
export interface MontoDeOdoo {
  odooPartnerId: number;
  montoNeto: number;
  moneda: string;
}

export type ViaEmparejado = "CEDULA" | "MONTO" | "NOMBRE" | "MANUAL";

export interface Candidato {
  odooPartnerId: number;
  nombre: string;
  via: ViaEmparejado;
  /** El texto que se le muestra a la persona para que decida. Nunca «confiá en mí». */
  evidencia: string;
}

/**
 * En qué situación quedó cada cuenta. Se distingue `INEMPAREJABLE` de `SIN_CANDIDATO` a
 * propósito: la primera es un problema del NOMBRE de la cuenta y la segunda parece un hueco
 * de Odoo. Meterlas juntas haría buscar en el lado equivocado.
 */
export type ClaseEmparejado = "CEDULA" | "NOMBRE_EXACTO" | "MONTO" | "DUDOSA" | "SIN_CANDIDATO" | "INEMPAREJABLE";

export interface PropuestaEmparejado {
  cuentaId: string;
  cuentaNombre: string;
  clase: ClaseEmparejado;
  candidatos: Candidato[];
  /**
   * Etapa 12 (H10): la cuenta YA tiene un cliente de Odoo y esto propone otra ficha para la misma cuenta
   * —otra sociedad de la empresa, o la misma empresa cargada dos veces en Odoo—. Solo sale con señal
   * fuerte (cédula o nombre exacto): a una cuenta vinculada no se le proponen adivinanzas.
   */
  otraSociedad: boolean;
}

/* ── 4. La señal de monto ───────────────────────────────────────────────────────── */

const CENTAVOS = (n: number) => Math.round(n * 100);

/**
 * Empareja por monto exacto, y **solo cuando el monto identifica a UNA cuenta y UN partner**.
 *
 * ⚠ La unicidad es lo único que hace utilizable esta señal, y aun así no la vuelve correcta:
 * si Bluesat tiene un cobro de 1.500 y no factura en Odoo, mientras Forestales sí emitió una
 * factura de 1.500, el par es único en las dos direcciones **y está mal**. Por eso lo que
 * devuelve es un candidato con su evidencia, no un vínculo.
 */
export function candidatosPorMonto(
  cuentas: readonly CuentaNexus[],
  montosOdoo: readonly MontoDeOdoo[],
): Map<string, Candidato[]> {
  /* La clave lleva la MONEDA. Sin ella, una factura de CRC 2.000 emparejaba con un cobro de
     USD 2.000 y proponía el cliente equivocado con toda la evidencia a favor. */
  const clave = (monto: number, moneda: string) => `${moneda}|${CENTAVOS(monto)}`;

  const cuentasPorMonto = new Map<string, Set<string>>();
  for (const c of cuentas) {
    for (const m of c.montos) {
      if (m.monto <= 0) continue;
      const k = clave(m.monto, m.moneda);
      (cuentasPorMonto.get(k) ?? cuentasPorMonto.set(k, new Set()).get(k)!).add(c.cuentaId);
    }
  }

  const partnersPorMonto = new Map<string, Set<number>>();
  for (const f of montosOdoo) {
    if (f.montoNeto <= 0) continue;
    const k = clave(f.montoNeto, f.moneda);
    (partnersPorMonto.get(k) ?? partnersPorMonto.set(k, new Set()).get(k)!).add(f.odooPartnerId);
  }

  const out = new Map<string, Candidato[]>();
  for (const [k, cs] of cuentasPorMonto) {
    if (cs.size !== 1) continue;
    const ps = partnersPorMonto.get(k);
    if (!ps || ps.size !== 1) continue;
    const cuentaId = [...cs][0]!;
    const odooPartnerId = [...ps][0]!;
    const [moneda, centavos] = k.split("|");
    const monto = (Number(centavos) / 100).toFixed(2);
    const evidencia = `Odoo tiene una factura de ${moneda} ${monto} y esta cuenta un cobro por el mismo monto en la misma moneda. Ningún otro cliente comparte esa cifra.`;
    const lista = out.get(cuentaId) ?? [];
    if (!lista.some((c) => c.odooPartnerId === odooPartnerId)) {
      lista.push({ odooPartnerId, nombre: "", via: "MONTO", evidencia });
    }
    out.set(cuentaId, lista);
  }
  return out;
}

/* ── 5. La propuesta ────────────────────────────────────────────────────────────── */

/**
 * Las tres señales, cada una con su evidencia, en orden de confianza. **Ninguna se aplica
 * sola**: esta función alimenta una pantalla, no una escritura.
 */
export function proponerEmparejados(
  cuentas: readonly CuentaNexus[],
  partners: readonly PartnerOdoo[],
  montosOdoo: readonly MontoDeOdoo[] = [],
  /**
   * `yaVinculadas`: las cuentas que ya tienen algún cliente de Odoo. Siguen en la lista, pero solo vuelven
   * si hay una ficha libre con su cédula o su nombre exacto (`otraSociedad`). Sin la lista, todas se tratan
   * como sin vincular, que es como se proponía antes de la etapa 12.
   */
  opts: { yaVinculadas?: ReadonlySet<string> } = {},
): PropuestaEmparejado[] {
  const porVat = new Map<string, PartnerOdoo[]>();
  for (const p of partners) {
    const v = soloDigitos(p.vat);
    if (v) porVat.set(v, [...(porVat.get(v) ?? []), p]);
  }

  const porNombre = new Map<string, PartnerOdoo[]>();
  for (const p of partners) {
    const n = normalizar(p.nombre);
    if (n) porNombre.set(n, [...(porNombre.get(n) ?? []), p]);
  }

  const nombreDe = new Map(partners.map((p) => [p.odooPartnerId, p.nombre]));
  const porMonto = candidatosPorMonto(cuentas, montosOdoo);

  /**
   * ⭐ Qué partners ya están reclamados por una señal FUERTE (cédula o nombre exacto), y por
   * qué cuenta. El vínculo `res.partner → CuentaFinanciera` es único del lado del partner
   * —`odooPartnerId @unique`—, así que un partner que ya tiene dueño **no puede** ser el par
   * de otra cuenta. No es una heurística: es la forma de la tabla.
   *
   * Esto mata el falso positivo que se había medido y aceptado como inevitable:
   * `BLUESAT → FORESTALES LATINOAMERICANOS` coincidía por un monto redondo, pero Forestales
   * ya emparejaba con su propia cuenta por nombre exacto. Sube el acierto de la señal de
   * monto de 8/10 a 8/9 sin aflojar nada.
   */
  const reclamados = new Map<number, string>();
  for (const c of cuentas) {
    const ced = soloDigitos(c.cedulaJuridica);
    for (const p of ced ? (porVat.get(ced) ?? []) : []) reclamados.set(p.odooPartnerId, c.cuentaId);
    for (const p of porNombre.get(normalizar(c.nombre)) ?? []) reclamados.set(p.odooPartnerId, c.cuentaId);
  }

  return cuentas.flatMap((c): PropuestaEmparejado[] => {
    const ced = soloDigitos(c.cedulaJuridica);
    const porCedula = ced ? (porVat.get(ced) ?? []) : [];
    const exactos = porNombre.get(normalizar(c.nombre)) ?? [];
    /* ⭐ Etapa 12 (H10): una cuenta ya vinculada puede sumar otra ficha, pero solo por cédula o nombre
       exacto. El monto y el parecido quedan afuera: su plata ya la explica su primer cliente, y un
       nombre parecido en una cuenta que ya tiene dueño es justo cómo se cuelgan facturas ajenas. */
    const vinculada = opts.yaVinculadas?.has(c.cuentaId) ?? false;

    /* `palabrasDistintivas` corta en 4 letras: menos que eso y entran siglas como «CR», «SA»
       o «TEC» contra cualquier cosa. Un nombre hecho solo de siglas cortas —`IIA`, `TEC- AE`—
       se queda sin nada con qué comparar, y eso es un problema del nombre, no de Odoo. */
    const distintivas = palabrasDistintivas(c.nombre);
    const parciales =
      vinculada || exactos.length || distintivas.length === 0
        ? []
        : partners.filter((p) => seParecen(c.nombre, p.nombre) || seParecen(p.nombre, c.nombre));

    const deMonto = vinculada
      ? []
      : (porMonto.get(c.cuentaId) ?? [])
          .filter((k) => (reclamados.get(k.odooPartnerId) ?? c.cuentaId) === c.cuentaId)
          .map((k) => ({ ...k, nombre: nombreDe.get(k.odooPartnerId) ?? "" }));

    const candidatos: Candidato[] = [
      ...porCedula.map((p) => ({
        odooPartnerId: p.odooPartnerId,
        nombre: p.nombre,
        via: "CEDULA" as const,
        evidencia: `Misma cédula: ${p.vat} (${claseDeCedula(soloDigitos(p.vat))}).`,
      })),
      ...exactos.map((p) => ({
        odooPartnerId: p.odooPartnerId,
        nombre: p.nombre,
        via: "NOMBRE" as const,
        evidencia: "El nombre coincide exacto una vez quitadas las formas jurídicas.",
      })),
      ...deMonto,
      ...parciales.map((p) => ({
        odooPartnerId: p.odooPartnerId,
        nombre: p.nombre,
        via: "NOMBRE" as const,
        evidencia: `Los nombres se parecen (${distintivas.join(", ")}). ⚠ Nexus guarda el nombre comercial y Odoo la razón social: revisalo.`,
      })),
    ];

    /* Se deduplica por partner conservando la PRIMERA vía, que es la de más confianza. */
    const vistos = new Set<number>();
    const unicos = candidatos.filter((k) => !vistos.has(k.odooPartnerId) && vistos.add(k.odooPartnerId));
    /* Una cuenta vinculada sin ficha libre que la reclame no es trabajo pendiente: no se lista. */
    if (vinculada && unicos.length === 0) return [];

    const clase: ClaseEmparejado = porCedula.length
      ? "CEDULA"
      : exactos.length
        ? "NOMBRE_EXACTO"
        : deMonto.length
          ? "MONTO"
          : parciales.length
            ? "DUDOSA"
            : distintivas.length === 0
              ? "INEMPAREJABLE"
              : "SIN_CANDIDATO";

    return [{ cuentaId: c.cuentaId, cuentaNombre: c.nombre, clase, candidatos: unicos.slice(0, 6), otraSociedad: vinculada }];
  });
}

/* ── 6. El buscador ─────────────────────────────────────────────────────────────── */

/**
 * El flujo PRINCIPAL de la pantalla, no el de excepción: con 33 cuentas sin candidato, la
 * persona escribe «almotec» y ve qué hay. Busca por nombre, por cédula y por correo, porque
 * cuál de los tres recuerda quien busca no es predecible.
 */
export function buscarPartners(
  partners: readonly PartnerOdoo[],
  consulta: string,
  opts: { soloClientes?: boolean; limite?: number } = {},
): PartnerOdoo[] {
  const q = normalizar(consulta);
  const digitos = soloDigitos(consulta);
  if (!q && !digitos) return [];

  const base = opts.soloClientes ? partners.filter((p) => p.customerRank > 0) : partners;
  const hits = base.filter((p) => {
    if (digitos.length >= 4 && soloDigitos(p.vat).includes(digitos)) return true;
    return q.length >= 2 && normalizar(p.nombre).includes(q);
  });

  /* Primero los que empiezan con lo escrito: buscar «tec» y que el primero sea «FUNDACIÓN
     TECNOLÓGICA» en vez de «INTECSA» es lo que hace que una lista de 9 sea usable. */
  return hits
    .sort((a, b) => {
      const pa = normalizar(a.nombre).startsWith(q) ? 0 : 1;
      const pb = normalizar(b.nombre).startsWith(q) ? 0 : 1;
      return pa - pb || a.nombre.localeCompare(b.nombre, "es");
    })
    .slice(0, opts.limite ?? 25);
}

/* ── 7. Lo que se aprende al confirmar ──────────────────────────────────────────── */

/**
 * Al confirmar un vínculo se escribe la cédula de Odoo en la `CuentaFinanciera`. **Es lo que
 * convierte una tarde de trabajo manual en un emparejado que después se sostiene solo**: hoy
 * solo 2 de 49 cuentas tienen cédula, y la señal más confiable no tiene con qué operar.
 *
 * ⛔ NUNCA pisa una cédula que ya está cargada. Si las dos difieren, eso es una diferencia
 * para la mesa de trabajo —puede ser que el vínculo esté mal, o que Odoo tenga el typo— y
 * resolverla en silencio a favor de Odoo perdería el dato que alguien cargó a mano.
 *
 * ⭐ Etapa 12: una SEGUNDA cédula no es un conflicto cuando la de la cuenta ya la explica otra de sus
 * sociedades (`cedulasDeOtrasSociedades`). ARQUITECTURA DE MUEBLES está dos veces en Odoo, #39 con
 * 3101746160 y #100 con 31010746160: vinculada la primera, la cuenta aprendió su cédula, y la segunda
 * ficha es otra ficha de la misma cuenta, no un error. Sigue siendo conflicto cuando ninguna sociedad de
 * la cuenta tiene la cédula que la cuenta dice: ahí el vínculo o la cédula cargada a mano pueden estar mal.
 */
export function cedulaAAprender(
  cedulaEnNexus: string | null,
  vatDeOdoo: string | null,
  cedulasDeOtrasSociedades: readonly (string | null)[] = [],
):
  | { escribir: string }
  | { conflicto: { nexus: string; odoo: string } }
  | { otraSociedad: { nexus: string; odoo: string } }
  | null {
  const odoo = soloDigitos(vatDeOdoo);
  if (!odoo) return null;
  const nexus = soloDigitos(cedulaEnNexus);
  if (!nexus) return { escribir: odoo };
  if (nexus === odoo) return null;
  if (cedulasDeOtrasSociedades.some((c) => soloDigitos(c) === nexus)) return { otraSociedad: { nexus, odoo } };
  return { conflicto: { nexus, odoo } };
}

/* ── 8. A qué cuenta va cada factura ────────────────────────────────────────────── */

/** Lo mínimo de una factura del espejo para decidir su cuenta. */
export interface FacturaAtribuible {
  id: string;
  odooMoveId: number;
  numero: string;
  odooPartnerId: number;
  cuentaId: string | null;
}

/** Un vínculo tal como está guardado. `cuentaId: null` = el partner no tiene cuenta (o se desvinculó). */
export interface VinculoGuardadoMin {
  /**
   * null = una sociedad de Mercury o QuickBooks (etapa 12): la tabla de vínculos guarda también las sociedades
   * sin ficha de Odoo, y esas no atribuyen ninguna factura del espejo.
   */
  odooPartnerId: number | null;
  cuentaId: string | null;
}

export interface Reatribucion {
  facturaId: string;
  odooMoveId: number;
  numero: string;
  anterior: string | null;
  nuevo: string | null;
}

/**
 * Qué facturas tienen que cambiar de cuenta para quedar con la de su vínculo. **La regla es una
 * sola**: la cuenta de una factura es la cuenta del vínculo de su partner, o ninguna.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Hasta el 2026-09-12 la cuenta la escribía SOLO el sync. Medido: las 27 cuentas que Alex
 * emparejó el 3-sep no tuvieron ningún efecto, porque la última corrida buena fue el 2-sep y
 * Odoo dejó de contestar: **347 de 347 facturas sin cuenta**, y «Lo que no cuadra» acusando
 * USD 237.355 de «cobros sin factura» cuyas facturas estaban en el espejo, sin atribuir.
 *
 * La usan las tres puntas que escriben la cuenta —confirmar o deshacer un vínculo, el sync y la
 * reatribución única— y el invariante que la vigila. Una segunda definición en cualquiera de
 * ellas es cómo el sync termina deshaciendo lo que una persona confirmó.
 *
 * ⚠ No mira el tipo de documento: una nota de crédito es del mismo cliente que la factura que
 * corrige, y dejarla sin cuenta la hacía sumar en el balde de «sin atribuir» como si hubiera
 * que cobrarla. Qué documento cuenta como plata lo decide `esDocumentoVivo` en diferencias.ts.
 *
 * PURA e idempotente: aplicada una vez, la segunda pasada devuelve vacío.
 */
export function reatribuciones<F extends FacturaAtribuible>(
  facturas: readonly F[],
  vinculos: readonly VinculoGuardadoMin[],
): Reatribucion[] {
  const cuentaDe = new Map<number, string>();
  for (const v of vinculos) if (v.cuentaId && v.odooPartnerId !== null) cuentaDe.set(v.odooPartnerId, v.cuentaId);

  const out: Reatribucion[] = [];
  for (const f of facturas) {
    const nuevo = cuentaDe.get(f.odooPartnerId) ?? null;
    if ((f.cuentaId ?? null) === nuevo) continue;
    out.push({ facturaId: f.id, odooMoveId: f.odooMoveId, numero: f.numero, anterior: f.cuentaId ?? null, nuevo });
  }
  return out;
}
