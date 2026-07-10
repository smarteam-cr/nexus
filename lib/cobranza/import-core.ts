/**
 * lib/cobranza/import-core.ts
 *
 * Helpers PUROS del importador tabular (cero Prisma/red/env — testeables solos):
 * heurística de mapeo de headers, normalización de valores con formato local
 * (montos "₡1.500.000,00", fechas "15/03/2026"), dominios compartidos y skip-list.
 * El Zod que valida el payload canónico vive en schema.ts (importFilaCanonicaSchema);
 * acá se produce ese payload desde la fila cruda + el mapeo.
 */
import { IMPORT_CAMPOS_CANONICOS, type ImportCampoCanonico } from "./schema";

// ── Skip-list y dominios compartidos ────────────────────────────────────────────

/**
 * Nombres que NUNCA se convierten en Client automáticamente (van a REVISAR).
 * Cubre los patrones de PARTNER_CREATE_SKIP de lib/cs/partner-sync.ts (portales
 * internos de Smarteam / basura — post-mortem 2026-07-10: dos "Smarteam" volvieron
 * ambiguo el token y desplomaron el resolver de sesiones) + basura típica de sheet
 * (filas de totales, separadores). Duplicado a propósito: Cobranza no importa
 * internals de lib/cs (aislamiento de módulos).
 */
export const COBRANZA_IMPORT_SKIP =
  /^(smarteam([ _].*)?|hub id:.*|total(es)?([ :].*)?|subtotal.*|n\/?a|-+|\.+|s\/n|sin nombre)$/i;

export function nombreEnSkipList(nombre: string): boolean {
  return COBRANZA_IMPORT_SKIP.test(nombre.trim());
}

/**
 * Dominios genéricos/compartidos que JAMÁS se registran en emailDomains ni se usan
 * como clave de dedup — apuntarlos a un solo cliente le colaría las sesiones de
 * todos los que usen ese dominio (leak documentado en KNOWN-ERRORS).
 */
const DOMINIOS_COMPARTIDOS = new Set([
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
  "msn.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
]);

export function esDominioCompartido(dominio: string): boolean {
  return DOMINIOS_COMPARTIDOS.has(dominio.toLowerCase());
}

// ── Normalizadores de valores locales ───────────────────────────────────────────

/**
 * Normaliza un dominio escrito de cualquier forma ("https://www.Empresa.com/x",
 * "info@empresa.com", " EMPRESA.COM ") a "empresa.com". null si no parece dominio.
 */
export function normalizarDominio(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  const at = d.lastIndexOf("@");
  if (at >= 0) d = d.slice(at + 1); // era un email
  d = d.replace(/^[a-z]+:\/\//, ""); // protocolo
  d = d.replace(/^www\./, "");
  d = d.split(/[/?#\s]/)[0]; // path/query/espacios
  d = d.replace(/\.+$/, ""); // punto final suelto
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * Parsea un monto con formato local a number (2 decimales). Acepta "₡1.500.000,00",
 * "$1,200.50", "1200", "1.200,50", "USD 800". null si no hay número reconocible.
 * Regla del separador decimal: si aparecen "." y "," el ÚLTIMO es el decimal; si
 * aparece uno solo, es decimal únicamente cuando le siguen exactamente 1-2 dígitos
 * al final (si no, es separador de miles).
 */
export function parseMontoLocal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  const limpio = raw.replace(/[^\d.,-]/g, ""); // fuera símbolos de moneda/espacios/letras
  if (!limpio || !/\d/.test(limpio)) return null;

  const lastDot = limpio.lastIndexOf(".");
  const lastComma = limpio.lastIndexOf(",");
  let normalizado: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Ambos presentes: el último es el decimal, el otro son miles.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const milesSep = decimalSep === "." ? "," : ".";
    normalizado = limpio.split(milesSep).join("");
    if (decimalSep === ",") normalizado = normalizado.replace(",", ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const idx = lastComma >= 0 ? lastComma : lastDot;
    const tras = limpio.length - idx - 1;
    const unicaAparicion = limpio.indexOf(sep) === idx;
    if (unicaAparicion && tras >= 1 && tras <= 2) {
      normalizado = limpio.replace(sep, "."); // decimal
    } else {
      normalizado = limpio.split(sep).join(""); // miles (repetido o con 3 dígitos)
    }
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Parsea una fecha local a ISO "YYYY-MM-DD". Acepta "2026-03-15", "15/03/2026",
 * "15-3-2026", "3/15/2026" NO (día-primero manda — formato local CR). null si no parsea.
 */
export function parseFechaLocal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return valida(Number(y), Number(m), Number(d));
  }
  const local = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    const [, d, m, y] = local;
    return valida(Number(y), Number(m), Number(d));
  }
  return null;

  function valida(y: number, m: number, d: number): string | null {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/** Mapas de sinónimos → valor de enum canónico (lowercase, sin acentos). */
const ENUM_SINONIMOS: Record<string, Record<string, string>> = {
  tipo: {
    nacional: "NACIONAL",
    internacional: "INTERNACIONAL",
    nac: "NACIONAL",
    int: "INTERNACIONAL",
  },
  viaCobro: {
    mercury: "MERCURY",
    odoo: "ODOO",
    otra: "OTRA",
    otro: "OTRA",
  },
  moneda: {
    crc: "CRC",
    colones: "CRC",
    colon: "CRC",
    "₡": "CRC",
    usd: "USD",
    dolares: "USD",
    dolar: "USD",
    $: "USD",
  },
  terminosPago: {
    anticipado: "ANTICIPADO",
    vencido: "VENCIDO",
    "mes anticipado": "ANTICIPADO",
    "mes vencido": "VENCIDO",
  },
};

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizarEnumLocal(
  campo: "tipo" | "viaCobro" | "moneda" | "terminosPago",
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const key = sinAcentos(raw.trim().toLowerCase());
  return ENUM_SINONIMOS[campo][key] ?? null;
}

/** Slug estable para idExterno cuando el sheet no trae columna id. */
export function slugNombre(nombre: string): string {
  return sinAcentos(nombre.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Mapeo columna → campo canónico ──────────────────────────────────────────────

/** Heurística de headers (normalizados) → campo canónico. Solo SUGERENCIA editable. */
const HEADER_HINTS: Array<{ campo: ImportCampoCanonico; re: RegExp }> = [
  { campo: "clienteNombre", re: /^(cliente|empresa|nombre( del cliente)?|company|razon social)$/ },
  { campo: "dominio", re: /^(dominio|domain|sitio( web)?|web|website|url)$/ },
  { campo: "correoCobro", re: /^(correo( de cobro)?|email|e-?mail|contacto( de cobro)?)$/ },
  { campo: "idExterno", re: /^(id|codigo|ref(erencia)?)$/ },
  { campo: "tipo", re: /^(tipo( de cuenta)?|nacional\/?internacional)$/ },
  { campo: "viaCobro", re: /^(via( de cobro)?|medio( de cobro)?|plataforma)$/ },
  { campo: "moneda", re: /^(moneda|currency|divisa)$/ },
  { campo: "terminosPago", re: /^(terminos?( de pago)?|condicion(es)? de pago)$/ },
  { campo: "diaCobroAncla", re: /^(dia( de cobro)?|dia ancla|fecha de cobro \(dia\))$/ },
  { campo: "suscripcionMonto", re: /^(monto( mensual)?|mensualidad|suscripcion|fee|tarifa|precio)$/ },
  { campo: "suscripcionMoneda", re: /^(moneda (de la )?suscripcion)$/ },
  { campo: "suscripcionInicio", re: /^(inicio|fecha( de)? inicio|arranque|desde)$/ },
  { campo: "notas", re: /^(notas?|observacion(es)?|comentarios?)$/ },
];

export function sugerirMapeo(columnas: string[]): Partial<Record<ImportCampoCanonico, string>> {
  const mapeo: Partial<Record<ImportCampoCanonico, string>> = {};
  for (const col of columnas) {
    const norm = sinAcentos(col.trim().toLowerCase());
    for (const { campo, re } of HEADER_HINTS) {
      if (!mapeo[campo] && re.test(norm)) {
        mapeo[campo] = col; // se guarda el header ORIGINAL (clave de la fila cruda)
        break;
      }
    }
  }
  return mapeo;
}

/**
 * Produce el payload CANÓNICO (normalizado, listo para importFilaCanonicaSchema)
 * desde la fila cruda + el mapeo. Los campos sin columna mapeada o vacíos van null.
 */
export function aplicarMapeo(
  raw: Record<string, unknown>,
  mapeo: Partial<Record<ImportCampoCanonico, string | null>>,
): Record<string, unknown> {
  const celda = (campo: ImportCampoCanonico): string | null => {
    const col = mapeo[campo];
    if (!col) return null;
    const v = raw[col];
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const nombre = celda("clienteNombre") ?? "";
  const canonico: Record<string, unknown> = {
    clienteNombre: nombre,
    dominio: normalizarDominio(celda("dominio")),
    correoCobro: celda("correoCobro")?.toLowerCase() ?? null,
    idExterno: celda("idExterno") ?? (nombre ? slugNombre(nombre) : null),
    tipo: normalizarEnumLocal("tipo", celda("tipo")),
    viaCobro: normalizarEnumLocal("viaCobro", celda("viaCobro")),
    moneda: normalizarEnumLocal("moneda", celda("moneda")),
    terminosPago: normalizarEnumLocal("terminosPago", celda("terminosPago")),
    diaCobroAncla: parseDiaAncla(celda("diaCobroAncla")),
    suscripcionMonto: parseMontoLocal(celda("suscripcionMonto")),
    suscripcionMoneda: normalizarEnumLocal("moneda", celda("suscripcionMoneda")),
    suscripcionInicio: parseFechaLocal(celda("suscripcionInicio")),
    notas: celda("notas"),
  };
  return canonico;
}

export function parseDiaAncla(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

/**
 * Clampea la fecha de inicio de facturación al CICLO CORRIENTE (sin backfill de
 * historia): si la fecha es anterior al mes actual, se corre al mismo día del mes
 * actual (clampeado al largo del mes) → el catch-up máximo es 1 cuota del mes en
 * curso. Devuelve también si hubo clamp (para dejar rastro en notas/bitácora).
 */
export function clampInicioCicloCorriente(
  fechaInicioISO: string,
  todayISO: string,
): { fechaISO: string; clampeada: boolean } {
  const [fy, fm, fd] = fechaInicioISO.split("-").map(Number);
  const [ty, tm] = todayISO.split("-").map(Number);
  if (fy > ty || (fy === ty && fm >= tm)) return { fechaISO: fechaInicioISO, clampeada: false };
  // Mismo día del mes actual, clampeado al largo del mes (UTC — sin new Date local).
  const diasEnMes = new Date(Date.UTC(ty, tm, 0)).getUTCDate(); // día 0 del mes siguiente
  const dia = Math.min(fd, diasEnMes);
  return {
    fechaISO: `${ty}-${String(tm).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
    clampeada: true,
  };
}

/** Warnings de negocio de una fila canónica (no bloquean — se muestran en la cola). */
export function warningsFila(canonico: {
  clienteNombre?: unknown;
  dominio?: unknown;
}): string[] {
  const out: string[] = [];
  const nombre = typeof canonico.clienteNombre === "string" ? canonico.clienteNombre : "";
  const dom = typeof canonico.dominio === "string" ? canonico.dominio : null;
  if (nombre && nombreEnSkipList(nombre)) {
    out.push("El nombre está en la lista de exclusión (interno o basura de sheet) — revisá antes de crear.");
  }
  if (!dom) {
    out.push("Sin dominio: la empresa no va a matchear sesiones automáticamente.");
  } else if (esDominioCompartido(dom)) {
    out.push(`Dominio compartido (${dom}): no se registrará en la empresa para no cruzar sesiones.`);
  }
  return out;
}

// Verificación estática: HEADER_HINTS solo usa campos canónicos declarados.
const _camposValidos: ReadonlySet<string> = new Set(IMPORT_CAMPOS_CANONICOS);
void _camposValidos;
