/**
 * lib/cobranza/sociedades.ts
 *
 * Cómo se reconoce una sociedad por el nombre con que factura. PURO: sin Prisma, sin red, sin reloj,
 * sin zod (lo importan pantallas del navegador).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * El libro de Alex nombra al cliente como sale en la FACTURA, no como está en Nexus: «ILEANA AGUILAR
 * INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA» es la cuenta «IIA»; «Atlas Mining & Construction,
 * S.A. I 7208610-6» es «AMC - Atlas Mining & Construction»; «CONSTRULOGIX S.A (Construtecho)» es
 * «Construtecho». Comparar las cadenas tal cual no encuentra a nadie, y adivinar por monto es lo que
 * fabrica clientes duplicados.
 *
 * Por eso esto NO elige: devuelve candidatas con la razón por la que lo son (`via`), y la más fuerte
 * gana. Quien decide es una persona (etapa 12, `resolverSociedad`, nunca elige sola).
 *
 * ⚠ La cédula que viene pegada al nombre («I 7208610-6», «( J0310000005567 )», «NIT: …») se separa
 * ANTES de normalizar: si no, sus dígitos terminan dentro de la clave y dos facturas de la misma
 * empresa dejan de parecerse.
 */
import { soloDigitos } from "./odoo/emparejado";

/**
 * Formas jurídicas que no distinguen a nadie. Van de la más larga a la más corta: «s a de c v»
 * tiene que salir entera antes de que «s a» se lleve la mitad y deje «de c v» colgando.
 * Se aplican sobre el texto ya sin tildes, sin puntuación y con un espacio entre palabras.
 */
const FORMAS_JURIDICAS = [
  "sociedad anonima de capital variable",
  "sociedad de responsabilidad limitada",
  "sociedad anonima",
  "s de r l de c v",
  "s de rl de cv",
  "s a p i de c v",
  "sapi de cv",
  "s a de c v",
  "sa de cv",
  "s de r l",
  "s de rl",
  "s r l",
  "srl",
  "s a c",
  "sac",
  "s a s",
  "sas",
  "s a",
  "sa",
  "ltda",
  "limitada",
  "llc",
  "inc",
  "corp",
  "corporation",
  "ltd",
  "eirl",
];
const RE_FORMAS = new RegExp(`(?:^| )(?:${FORMAS_JURIDICAS.join("|")})(?= |$)`, "g");

/** Palabras de enlace: «Real Shipping and Trade» y «Real Shipping & Trade» son la misma. */
const ENLACES = new Set(["y", "and", "e", "de", "del", "la", "las", "el", "los", "the", "of"]);

/** Un pedazo con cinco dígitos o más es un identificador fiscal, no parte del nombre. */
const tieneIdentificador = (s: string) => (s.match(/\d/g)?.length ?? 0) >= 5;

/**
 * Un pedazo entero que es SOLO un identificador: cinco dígitos o más y ninguna palabra de cinco letras
 * entre ellos. «7208610-6», «SAS160825EQ3» y el RFC de persona física «COAL780221HR9» lo son;
 * «Rempro» no.
 */
const pareceIdentificador = (s: string) =>
  /^(nit|nrc|ein|rfc|ruc|vat)\s*:/i.test(s) ||
  (tieneIdentificador(s) && s.split(/[\d\s.:-]+/).every((palabra) => palabra.length < 5));

function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface IdentidadDelNombre {
  /** El nombre sin la cédula ni el alias entre paréntesis, tal cual se escribió. */
  nombre: string;
  /** Lo que se compara. Vacío solo si el nombre no traía letras ni número. */
  clave: string;
  /** Lo que va entre paréntesis y no es un identificador: «(Construtecho)», «(Wherex)». */
  alias: string | null;
  /** Los dígitos del primer identificador fiscal que trae pegado, o null. */
  cedula: string | null;
}

/**
 * Separa lo que el libro pega al nombre de la sociedad: la cédula (entre paréntesis, detrás de « I »,
 * de « / » o de «NIT:»/«EIN:»), y el alias comercial entre paréntesis.
 *
 * ⚠ « I » (i mayúscula) es el separador del libro, pero no siempre antecede una cédula: en «O4Bi I
 * Rempro» antecede al cliente final. Solo se descarta el pedazo que tiene forma de identificador.
 */
export function identidadDelNombre(raw: string): IdentidadDelNombre {
  let texto = raw.replace(/\s+/g, " ").trim();
  let alias: string | null = null;
  const ids: string[] = [];

  texto = texto.replace(/\(([^)]*)\)/g, (_m, dentro: string) => {
    const d = dentro.trim();
    if (!d) return " ";
    if (tieneIdentificador(d)) ids.push(d);
    else if (!alias) alias = d;
    return " ";
  });

  const partes = texto
    .split(/\s+(?:I|\/)\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nombrePartes: string[] = [];
  for (const parte of partes) {
    if (pareceIdentificador(parte)) {
      ids.push(parte);
      continue;
    }
    /* Un identificador al final sin separador: «… DE MÉXICO TEA950619MP8». */
    const palabras = parte.split(" ");
    const ultima = palabras[palabras.length - 1] ?? "";
    if (palabras.length > 1 && tieneIdentificador(ultima)) {
      ids.push(ultima);
      palabras.pop();
    }
    nombrePartes.push(palabras.join(" "));
  }

  const nombre = nombrePartes.join(" ").replace(/\s+/g, " ").replace(/[\s,.;:-]+$/, "").trim();
  let clave = claveDeTexto(nombre);
  let cedulaDigitos = ids.map((i) => soloDigitos(i.replace(/^(nit|nrc|ein|rfc|ruc|vat)\s*:\s*/i, ""))).find((d) => d.length >= 6);
  /* «3-101-721431 SOCIEDAD ANONIMA»: la sociedad no tiene más nombre que su número, y ese número es su cédula. */
  if (/^[\d ]+$/.test(clave)) {
    clave = clave.replace(/ /g, "");
    if (!cedulaDigitos && clave.length >= 9) cedulaDigitos = clave;
  }
  if (!clave && cedulaDigitos) clave = cedulaDigitos;
  if (!clave) clave = claveDeTexto(raw);
  return { nombre: nombre || raw.trim(), clave, alias, cedula: cedulaDigitos ?? null };
}

/**
 * Las palabras que distinguen a una empresa: sin tildes, puntuación, forma jurídica ni palabras de enlace.
 * La comparten la clave de acá y la clave suelta del alta (lib/cobranza/empresas-parecidas.ts): una sola
 * lista de formas jurídicas, así «S.A. de C.V.» no se quita en un lado y en el otro no.
 */
export function palabrasDelNombre(s: string): string[] {
  return plano(s)
    .replace(RE_FORMAS, " ")
    .replace(RE_FORMAS, " ")
    .split(" ")
    .filter((p) => p && !ENLACES.has(p));
}

function claveDeTexto(s: string): string {
  const tokens = palabrasDelNombre(s).filter((p) => !(tieneIdentificador(p) && /[a-z]/.test(p)));
  /* Siglas deletreadas: «D C C» es «DCC», como la escribe la razón social de la cuenta. */
  const juntos: string[] = [];
  let letras = "";
  for (const t of tokens) {
    if (/^[a-z]$/.test(t)) {
      letras += t;
      continue;
    }
    if (letras) juntos.push(letras);
    letras = "";
    juntos.push(t);
  }
  if (letras) juntos.push(letras);
  return juntos.join(" ");
}

/**
 * La clave de una sociedad: sin tildes, puntuación, forma jurídica, palabras de enlace ni la cédula
 * pegada. «Visual Branding, S.A. de C.V» y «Visual Branding» dan la misma.
 */
export function claveSociedad(raw: string | null | undefined): string {
  if (!raw) return "";
  return identidadDelNombre(raw).clave;
}

/* ── Candidatas ─────────────────────────────────────────────────────────────────── */

export interface SociedadConocida {
  id: string;
  /** Todos los nombres con que se la conoce: el comercial y la razón social. */
  nombres: readonly (string | null | undefined)[];
  cedula?: string | null;
}

/**
 * Por qué una sociedad es candidata, de la señal más fuerte a la más débil. Solo se devuelven las del
 * escalón más fuerte que tenga alguna.
 *  · CEDULA  — los dígitos de la cédula pegada al nombre son los de la cuenta.
 *  · NOMBRE  — misma clave.
 *  · ALIAS   — lo que va entre paréntesis es el nombre de la cuenta («(Construtecho)»).
 *  · PARCIAL — todas las palabras de uno están en el otro («Oceanica» ⊂ «Clínica Oceanica»).
 *  · SIGLAS  — «CAV» son las iniciales de «Club de Amantes del Vino». La más débil: solo sirve para
 *              mostrar, nunca para proponer un número.
 */
export type ViaDeNombre = "CEDULA" | "NOMBRE" | "ALIAS" | "PARCIAL" | "SIGLAS";
const ESCALONES: readonly ViaDeNombre[] = ["CEDULA", "NOMBRE", "ALIAS", "PARCIAL", "SIGLAS"];

export interface CandidataPorNombre {
  id: string;
  via: ViaDeNombre;
}

const palabras = (clave: string) => clave.split(" ").filter(Boolean);

/** Todas las palabras de `a` están en `b`, y `a` alcanza para distinguir (no una sílaba suelta). */
function contenida(a: string, b: string): boolean {
  const pa = palabras(a);
  if (!pa.length) return false;
  if (pa.length === 1 && pa[0]!.length < 4) return false;
  const pb = new Set(palabras(b));
  return pa.every((p) => pb.has(p));
}

function siglas(clave: string): string {
  return palabras(clave)
    .map((p) => p[0] ?? "")
    .join("");
}

/**
 * Las sociedades conocidas que pueden ser la del nombre `raw`, del escalón más fuerte que tenga alguna.
 * Vacío = ninguna. Más de una = hay que preguntarle a una persona.
 */
export function candidatasPorNombre(raw: string, conocidas: readonly SociedadConocida[]): CandidataPorNombre[] {
  const ident = identidadDelNombre(raw);
  const aliasClave = ident.alias ? claveSociedad(ident.alias) : "";
  const porVia = new Map<ViaDeNombre, Set<string>>();
  const anotar = (via: ViaDeNombre, id: string) => porVia.set(via, (porVia.get(via) ?? new Set()).add(id));

  for (const s of conocidas) {
    const cedula = soloDigitos(s.cedula);
    if (ident.cedula && cedula.length >= 6 && cedula === ident.cedula) anotar("CEDULA", s.id);
    for (const n of s.nombres) {
      if (!n) continue;
      const clave = claveSociedad(n);
      if (!clave) continue;
      if (ident.clave && clave === ident.clave) anotar("NOMBRE", s.id);
      else if (aliasClave && clave === aliasClave) anotar("ALIAS", s.id);
      else if (ident.clave && (contenida(ident.clave, clave) || contenida(clave, ident.clave))) anotar("PARCIAL", s.id);
      else if (
        ident.clave &&
        /^[a-z]{2,5}$/.test(ident.clave) &&
        palabras(clave).length >= 2 &&
        siglas(clave) === ident.clave
      ) {
        anotar("SIGLAS", s.id);
      }
    }
  }

  for (const via of ESCALONES) {
    const ids = porVia.get(via);
    if (ids?.size) return [...ids].sort().map((id) => ({ id, via }));
  }
  return [];
}

/* ── Las sociedades que facturan (etapa 12) ──────────────────────────────────────── */

/** Dónde se emite una factura. `OTRA` es QuickBooks. */
export const PLATAFORMAS_DE_COBRO = ["ODOO", "MERCURY", "OTRA"] as const;
export type PlataformaDeCobro = (typeof PLATAFORMAS_DE_COBRO)[number];

export function esPlataformaDeCobro(v: string | null | undefined): v is PlataformaDeCobro {
  return (PLATAFORMAS_DE_COBRO as readonly string[]).includes(v ?? "");
}

/** Cómo se llaman en pantalla: el mismo rótulo que `VIA_COBRO_LABEL` (components/cobranza/format.ts). */
export const NOMBRE_DE_PLATAFORMA: Readonly<Record<PlataformaDeCobro, string>> = {
  ODOO: "Odoo",
  MERCURY: "Mercury",
  OTRA: "QuickBooks",
};

/**
 * La clave con que una sociedad es ÚNICA en su plataforma: su nombre en factura sin tildes, puntuación, forma
 * jurídica ni la cédula pegada, pero CON lo que va entre paréntesis.
 *
 * ⚠ No es `claveSociedad`: esa suelta el paréntesis para encontrar la cuenta de una fila del libro. Acá
 * «Librería Internacional» y «Librería Internacional (Desarrollos Culturales Costa Rica)» son dos nombres en
 * factura distintos —hoy, dos cuentas con la misma cédula— y no pueden chocar. Tampoco mira la cédula: una
 * misma cédula factura con varios nombres (DECISIONS.md, el caso Grupo Petróleo / Clínica Oceánica).
 */
export function claveFactura(nombre: string | null | undefined): string {
  if (!nombre) return "";
  const ident = identidadDelNombre(nombre);
  return claveDeTexto([ident.nombre, ident.alias].filter(Boolean).join(" ")) || ident.clave;
}

/** Una sociedad que factura, tal como la leen el alta y la decisión del cobro. */
export interface SociedadQueFactura {
  id: string;
  plataforma: PlataformaDeCobro;
  /** El nombre con que sale en la factura (`OdooPartnerVinculo.odooPartnerNombre`). */
  nombre: string;
  /** La ficha de Odoo, si la tiene. Las de Mercury y QuickBooks no. */
  odooPartnerId: number | null;
  /** La cuenta a la que le factura. null = quedó suelta. */
  cuentaId: string | null;
}

/** Una sociedad de la cuenta como opción del diálogo de «Marcar facturado». */
export interface SociedadOpcion {
  id: string;
  plataforma: PlataformaDeCobro;
  nombre: string;
}

/** Una sociedad de la cuenta como la muestra la ficha (GET /api/cobranza/cuentas/[cuentaId]/sociedades). */
export interface SociedadDeLaCuenta extends SociedadOpcion {
  cedula: string | null;
  /** true = es una ficha de Odoo: se vincula y se desvincula en Cobranza › Odoo. */
  conFicha: boolean;
  /** Cuántos cobros dicen que se le facturaron. Con alguno, no se suelta. */
  cobros: number;
  confirmadoPor: string | null;
}

/**
 * Con qué sociedad YA existente choca una nueva, o null. Solo contra las que no tienen ficha de Odoo y en la
 * misma plataforma: las de Odoo se distinguen por su ficha, y «Quirinale Group» en Mercury y en QuickBooks
 * son dos identidades distintas.
 */
export function choqueDeSociedad<S extends SociedadQueFactura>(
  nueva: { plataforma: PlataformaDeCobro; nombre: string },
  existentes: readonly S[],
): S | null {
  const clave = claveFactura(nueva.nombre);
  if (!clave) return null;
  return (
    existentes.find(
      (s) => s.odooPartnerId === null && s.plataforma === nueva.plataforma && claveFactura(s.nombre) === clave,
    ) ?? null
  );
}

/** Lo que el cobro tiene antes del cambio. Fechas como día ISO (`YYYY-MM-DD`). */
export interface SociedadAntes {
  cuentaId: string;
  fechaEmisionISO: string | null;
  plataformaFactura: PlataformaDeCobro | null;
  sociedadFacturadaId: string | null;
}

/** El pedido, con la semántica de `cobroPatchSchema`: `undefined` = no lo toca; `null` = lo quita. */
export interface PedidoDeSociedad {
  fechaEmisionISO?: string | null;
  plataformaFactura?: PlataformaDeCobro | null;
  sociedadFacturadaId?: string | null;
}

/** El documento del espejo que tiene el número del cobro: su cliente de Odoo tiene que ser la sociedad. */
export interface DocumentoDelNumero {
  numero: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
}

export type DecisionDeSociedad =
  | { tipo: "sin-cambios" }
  | { tipo: "rechazo"; status: 400 | 409; mensaje: string }
  | {
      tipo: "escribir";
      plataformaFactura: PlataformaDeCobro | null;
      sociedadFacturadaId: string | null;
      /** El texto de la bitácora del cobro. */
      bitacora: string;
    };

/**
 * Qué pasa con la plataforma y la sociedad de la factura en un cambio del cobro.
 *
 * ⛔ NUNCA ELIGE SOLA. A qué sociedad se factura lo decide quien factura (Vilma, factura por factura), e
 * inferirlo por nombre o por monto es lo que fabrica clientes duplicados. Con una sola sociedad en la
 * plataforma tampoco la pone: sin pedido, queda sin anotar.
 *
 * Las reglas, en orden:
 *  1. Sin factura después del cambio no hay plataforma ni sociedad: pedirlas es un 400, y las que había se
 *     limpian dejando cuáles eran en la bitácora (revertir la factura).
 *  2. Sin pedido, nada cambia: quien marca facturado sin decir dónde (un cargador, «Números» del libro) no
 *     inventa una plataforma.
 *  3. La sociedad tiene que ser de la cuenta (409) y de la plataforma pedida (400); su plataforma pasa a ser
 *     la del cobro. Si el número es de un documento de Odoo de OTRO cliente, 409.
 *  4. Cambiar la plataforma sin cambiar la sociedad no deja anotada una sociedad de otra plataforma: 400.
 *  5. ⭐ Decir la plataforma en una cuenta que factura por ella con dos sociedades o más exige decir cuál:
 *     Grupo INB factura por Mercury como Quirinale Group y como Ingeniería Verde.
 *
 * `sociedades`: las de la cuenta, más la que el cobro tenía anotada aunque ya no sea de la cuenta (para poder
 * nombrarla). ⚠ El 409 de «ese número ya está en otra cuenta» sigue siendo de numero-factura.ts.
 */
export function resolverSociedad(
  antes: SociedadAntes,
  pedido: PedidoDeSociedad,
  sociedades: readonly SociedadQueFactura[],
  byEmail: string,
  documento: DocumentoDelNumero | null = null,
): DecisionDeSociedad {
  const rechazo = (status: 400 | 409, mensaje: string): DecisionDeSociedad => ({ tipo: "rechazo", status, mensaje });
  const porId = new Map(sociedades.map((s) => [s.id, s]));
  const describir = (plataforma: PlataformaDeCobro | null, sociedadId: string | null): string => {
    const donde = plataforma ? NOMBRE_DE_PLATAFORMA[plataforma] : null;
    if (sociedadId) return `«${porId.get(sociedadId)?.nombre ?? sociedadId}»${donde ? ` por ${donde}` : ""}`;
    return donde ? `por ${donde}` : "sin anotar";
  };
  const fechaDespues = pedido.fechaEmisionISO === undefined ? antes.fechaEmisionISO : pedido.fechaEmisionISO;

  /* 1. Sin factura. */
  if (fechaDespues === null) {
    if (pedido.plataformaFactura || pedido.sociedadFacturadaId) {
      return rechazo(400, "Un cobro sin factura no tiene a quién ni dónde se facturó: primero marcalo facturado.");
    }
    if (!antes.plataformaFactura && !antes.sociedadFacturadaId) return { tipo: "sin-cambios" };
    return {
      tipo: "escribir",
      plataformaFactura: null,
      sociedadFacturadaId: null,
      bitacora: `Se quitó a quién se había facturado (${describir(antes.plataformaFactura, antes.sociedadFacturadaId)}): el cobro dejó de estar facturado.`,
    };
  }

  /* 2. Sin pedido. */
  if (pedido.plataformaFactura === undefined && pedido.sociedadFacturadaId === undefined) return { tipo: "sin-cambios" };

  let plataforma = pedido.plataformaFactura !== undefined ? pedido.plataformaFactura : antes.plataformaFactura;
  const sociedadId = pedido.sociedadFacturadaId !== undefined ? pedido.sociedadFacturadaId : antes.sociedadFacturadaId;

  if (sociedadId) {
    const s = porId.get(sociedadId);
    /* 3. */
    if (!s || s.cuentaId !== antes.cuentaId) {
      return rechazo(
        409,
        pedido.sociedadFacturadaId !== undefined
          ? "Esa sociedad no le factura a esta cuenta. Agregala en la cuenta, o en Cobranza › Odoo si es una ficha de Odoo."
          : "La sociedad anotada ya no le factura a esta cuenta: elegí de nuevo a quién se facturó.",
      );
    }
    if (pedido.sociedadFacturadaId !== undefined && pedido.plataformaFactura && pedido.plataformaFactura !== s.plataforma) {
      return rechazo(
        400,
        `«${s.nombre}» factura por ${NOMBRE_DE_PLATAFORMA[s.plataforma]}, no por ${NOMBRE_DE_PLATAFORMA[pedido.plataformaFactura]}.`,
      );
    }
    /* 4. */
    if (pedido.sociedadFacturadaId === undefined && plataforma !== s.plataforma) {
      return rechazo(
        400,
        `La factura está anotada a «${s.nombre}», que factura por ${NOMBRE_DE_PLATAFORMA[s.plataforma]}. Para cambiar la plataforma, elegí también la sociedad.`,
      );
    }
    if (documento && s.odooPartnerId !== null && documento.odooPartnerId !== s.odooPartnerId) {
      return rechazo(
        409,
        `La factura ${documento.numero} es de «${documento.odooPartnerNombre}» en Odoo, no de «${s.nombre}». Elegí la sociedad del documento.`,
      );
    }
    plataforma = s.plataforma;
  }

  /* 5. */
  if (pedido.plataformaFactura !== undefined && plataforma && !sociedadId) {
    const deEsaPlataforma = sociedades.filter((s) => s.cuentaId === antes.cuentaId && s.plataforma === plataforma);
    if (deEsaPlataforma.length >= 2) {
      return rechazo(
        400,
        `Esta cuenta factura por ${NOMBRE_DE_PLATAFORMA[plataforma]} con ${deEsaPlataforma.length} sociedades (${deEsaPlataforma
          .map((s) => `«${s.nombre}»`)
          .join(", ")}): elegí a cuál se le facturó.`,
      );
    }
  }

  if (plataforma === antes.plataformaFactura && sociedadId === antes.sociedadFacturadaId) return { tipo: "sin-cambios" };
  if (!byEmail) return rechazo(400, "Anotar a quién se facturó exige un usuario con nombre.");

  const ahora = describir(plataforma, sociedadId);
  return {
    tipo: "escribir",
    plataformaFactura: plataforma,
    sociedadFacturadaId: sociedadId,
    bitacora:
      !antes.plataformaFactura && !antes.sociedadFacturadaId
        ? `${byEmail} anotó que se facturó ${ahora}.`
        : `${byEmail} cambió a quién se facturó: ${describir(antes.plataformaFactura, antes.sociedadFacturadaId)} → ${ahora}.`,
  };
}
