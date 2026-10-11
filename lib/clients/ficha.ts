/**
 * lib/clients/ficha.ts — LA ficha del cliente: una sola, por empresa, compartida por todos los
 * proyectos y todos los agentes.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * La información del cliente vivía DUPLICADA en dos lugares que ningún agente leía: el canvas
 * `client-info` (stakeholders, retos, oportunidades como bloques sueltos) y `Client.canvas` (un
 * JSON con perfil, motivación, retos…). Medido en prod el 2026-09-27: 0 de 188 clientes tenían
 * `Client.canvas` y el canvas tenía 1 bloque en total. Esta ficha reemplaza a los dos.
 *
 * ── DÓNDE VIVE ───────────────────────────────────────────────────────────────────────────────
 * `Client.ficha` (JSON) es la copia de Nexus, la que leen los agentes. HubSpot es el destino: al
 * CONFIRMAR, cada campo va a una propiedad de la EMPRESA (grupo «Nexus · Información del
 * cliente») o a una NOTA en la empresa. El criterio, decidido con Elías:
 *   - PROPIEDAD = cómo está el cliente HOY: una verdad vigente que se pisa y sirve para filtrar.
 *   - NOTA      = evidencia con fecha (por qué, qué cambió, de qué fuentes): se acumula.
 *
 * ── LA REGLA QUE NO SE NEGOCIA ───────────────────────────────────────────────────────────────
 * Los campos con `alCliente: false` NUNCA llegan a un documento que ve el cliente (apertura a la
 * asesoría, su porqué, motivación de compra, oportunidades). `fichaParaPrompt` y `fichaParaLaMemoria`
 * (la que usa lib/memoria) los cortan cuando el destino es un documento del cliente, y la postura de
 * los stakeholders se corta en código (`stakeholdersSinPostura`), no con una instrucción al modelo.
 * No hay otro camino para darle la ficha a un agente.
 *
 * Módulo PURO (sin Prisma ni fetch): lo usan la pantalla, la ruta, el script que crea las
 * propiedades y los agentes.
 */

// ── Los campos ────────────────────────────────────────────────────────────────────────────

export type ClaveDeFicha =
  | "aQueSeDedica"
  | "herramientasActuales"
  | "retosEstrategicos"
  | "resultadosQuePersigue"
  | "dolorPrincipal"
  | "stakeholders"
  | "aperturaAsesoria"
  | "porQueApertura"
  | "motivacionCompra"
  | "oportunidadesFuturas";

export type DestinoEnHubspot =
  /** Propiedad de texto CON FORMATO (rich text) en la empresa. */
  | { tipo: "texto"; propiedad: string }
  /** Propiedad de lista (select) en la empresa. */
  | { tipo: "lista"; propiedad: string }
  /** Va en la nota que se crea en la empresa en cada confirmación. */
  | { tipo: "nota" };

export type GrupoDeFicha = "negocio" | "busca" | "personas" | "interno";

export interface CampoDeFicha {
  clave: ClaveDeFicha;
  etiqueta: string;
  /** Qué escribir: la ve el CSE debajo del campo y la lee el agente que propone. */
  ayuda: string;
  grupo: GrupoDeFicha;
  destino: DestinoEnHubspot;
  /** false = interno: jamás se cita en un documento que ve el cliente. */
  alCliente: boolean;
  /** Si va al cliente pero con un recorte (p. ej. los stakeholders sin su postura). */
  recorteAlCliente?: string;
  /**
   * El campo NO se escribe a mano ni lo propone la IA de la ficha: sale de los resultados medibles
   * de los proyectos del cliente (lib/handoff/resultados-medibles.ts), que se editan y confirman en
   * esta misma sección. Al confirmar la ficha, su texto se arma con los resultados confirmados
   * (decisión de Elías del 2026-10-05: los resultados estaban dos veces, en dos formatos).
   */
  deLosResultados?: boolean;
}

export const GRUPOS_DE_FICHA: ReadonlyArray<{ clave: GrupoDeFicha; titulo: string; bajada: string }> = [
  { clave: "negocio", titulo: "El negocio", bajada: "Qué hace y con qué trabaja hoy." },
  { clave: "busca", titulo: "Lo que busca", bajada: "Hacia dónde quiere ir y qué le duele." },
  { clave: "personas", titulo: "Las personas", bajada: "Quién decide, quién usa y quién empuja." },
  {
    clave: "interno",
    titulo: "Interno",
    bajada: "Nunca aparece en un documento que ve el cliente.",
  },
];

/** El prefijo de TODAS las propiedades que crea Nexus en la empresa. */
export const PREFIJO_PROPIEDAD = "nexus_";
export const GRUPO_DE_PROPIEDADES = { name: "nexus_informacion_cliente", label: "Nexus · Información del cliente" };

export const CAMPOS_DE_LA_FICHA: readonly CampoDeFicha[] = [
  {
    clave: "aQueSeDedica",
    etiqueta: "A qué se dedica",
    ayuda: "Modelo de negocio, a quién atiende, cómo gana dinero y datos de escala (sedes, clientes, volumen).",
    grupo: "negocio",
    destino: { tipo: "texto", propiedad: "nexus_a_que_se_dedica" },
    alCliente: true,
  },
  {
    clave: "herramientasActuales",
    etiqueta: "Herramientas actuales",
    ayuda: "Con qué trabaja hoy (CRM, Excel, WhatsApp, ERP, formularios…) y para qué usa cada una.",
    grupo: "negocio",
    destino: { tipo: "texto", propiedad: "nexus_herramientas_actuales" },
    alCliente: true,
  },
  {
    // Primero en «Lo que busca», arriba de los retos (pedido de Elías, 2026-10-05).
    clave: "resultadosQuePersigue",
    etiqueta: "Resultados que persigue",
    ayuda:
      "Lo que el cliente quiere lograr, medible: cómo se mide, línea base, meta y plazo. Salen del handoff de cada proyecto y se confirman acá; los objetivos del diagnóstico los toman de acá.",
    grupo: "busca",
    destino: { tipo: "texto", propiedad: "nexus_resultados_que_persigue" },
    alCliente: true,
    deLosResultados: true,
  },
  {
    clave: "retosEstrategicos",
    etiqueta: "Retos estratégicos",
    ayuda: "Los desafíos de negocio del cliente, más allá de este proyecto.",
    grupo: "busca",
    destino: { tipo: "texto", propiedad: "nexus_retos_estrategicos" },
    alCliente: true,
  },
  {
    clave: "dolorPrincipal",
    etiqueta: "Dolor principal",
    ayuda: "Lo que hoy le cuesta al cliente, en sus palabras y con datos si los hay.",
    grupo: "busca",
    destino: { tipo: "texto", propiedad: "nexus_dolor_principal" },
    alCliente: true,
  },
  {
    clave: "stakeholders",
    etiqueta: "Stakeholders",
    ayuda:
      "Una viñeta por persona, con las cuatro partes: nombre — cargo — papel en el proyecto — postura. Si no sabes una, escribe «sin dato».",
    grupo: "personas",
    destino: { tipo: "texto", propiedad: "nexus_stakeholders" },
    alCliente: true,
    recorteAlCliente: "solo nombre, cargo y papel en el proyecto; NUNCA la postura",
  },
  {
    clave: "aperturaAsesoria",
    etiqueta: "Apertura a la asesoría",
    ayuda: "Qué tan dispuesto está a que lo guiemos, no solo a que le configuremos.",
    grupo: "interno",
    destino: { tipo: "lista", propiedad: "nexus_apertura_asesoria" },
    alCliente: false,
  },
  {
    clave: "porQueApertura",
    etiqueta: "Por qué esa apertura",
    ayuda: "La evidencia: qué dijo o hizo el cliente que lo muestra.",
    grupo: "interno",
    destino: { tipo: "nota" },
    alCliente: false,
  },
  {
    clave: "motivacionCompra",
    etiqueta: "Motivación de compra",
    ayuda: "Por qué nos compró a nosotros y por qué ahora.",
    grupo: "interno",
    destino: { tipo: "nota" },
    alCliente: false,
  },
  {
    clave: "oportunidadesFuturas",
    etiqueta: "Oportunidades futuras",
    ayuda: "Lo que podríamos venderle o proponerle más adelante.",
    grupo: "interno",
    destino: { tipo: "texto", propiedad: "nexus_oportunidades_futuras" },
    alCliente: false,
  },
];

export const OPCIONES_DE_APERTURA: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: "alta", etiqueta: "Alta" },
  { valor: "media", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
  { valor: "sin_evaluar", etiqueta: "Sin evaluar" },
];

/** Tope por campo. HubSpot acepta 65.536 caracteres por propiedad; esto deja aire para el HTML. */
export const MAX_CARACTERES_POR_CAMPO = 20_000;

export type ValoresDeFicha = Record<ClaveDeFicha, string>;

export function valoresVacios(): ValoresDeFicha {
  return Object.fromEntries(CAMPOS_DE_LA_FICHA.map((c) => [c.clave, ""])) as ValoresDeFicha;
}

export function campoDeFicha(clave: ClaveDeFicha): CampoDeFicha {
  return CAMPOS_DE_LA_FICHA.find((c) => c.clave === clave)!;
}

export function etiquetaDeApertura(valor: string): string {
  return OPCIONES_DE_APERTURA.find((o) => o.valor === valor)?.etiqueta ?? "";
}

// ── Lo que se guarda en Client.ficha ─────────────────────────────────────────────────────────

export type EstadoEnHubspot =
  | "sincronizada"
  /** Las propiedades se escribieron pero la nota no. */
  | "parcial"
  | "fallo"
  /** El cliente no tiene empresa vinculada en HubSpot: la ficha queda solo en Nexus. */
  | "sin_empresa";

export interface PropuestaDeFicha {
  valores: Partial<ValoresDeFicha>;
  /** De dónde salió cada cosa, en palabras: «Sesión de exploración del 12-sep», «Encuesta: Ventas». */
  fuentes: string[];
  /** Las fuentes de CADA campo propuesto: la pantalla las muestra debajo de la propuesta. */
  fuentesPorCampo: Partial<Record<ClaveDeFicha, string[]>>;
  /**
   * QUIÉN propuso cada campo (el `origen` de cada puerta: «Handoff», «Sesiones», «Exploración», «Preventa», «Actualizar
   * con IA», «HubSpot»), acumulado (2026-10-09, memoria de la cuenta, etapa 3). Lo escribe `fusionarPropuesta`, así
   * cubre todas las puertas sin tocarlas. Con esto la memoria no le da a un agente lo que él mismo propuso
   * (`fichaParaLaMemoria` › `excluirOrigenes`). Ausente en las propuestas de antes: `origenesDelCampo` lo deduce.
   */
  origenPorCampo?: Partial<Record<ClaveDeFicha, string[]>>;
  /**
   * Los campos propuestos que traen algo INTERNO aunque el campo vaya al cliente (2026-10-10): la radiografía de la
   * preventa en «A qué se dedica», «quién decide» en las personas. Lo marca la puerta que lo propone (`interno` en
   * `fusionarPropuesta`) y queda pegado al campo hasta que el CSE lo confirma o lo descarta, aunque después otra puerta
   * lo reescriba (el texto nuevo integra lo de antes). Mientras tanto ese campo propuesto no llega al handoff
   * (`fichaParaLaMemoria`). Ausente en las propuestas de antes: vale la marca de la fuente (`MARCA_DE_LO_INTERNO`).
   */
  internoPorCampo?: Partial<Record<ClaveDeFicha, true>>;
  at: string;
  /** Quién la propuso: «Handoff», «Sesiones», «Actualizar con IA»… («Varias fuentes» si fueron varias). */
  origen: string;
}

/** Lo que dice la etiqueta de una fuente cuando trae algo interno (la preventa: lib/exploraciones/a-la-ficha.ts). */
export const MARCA_DE_LO_INTERNO = "interno de la preventa";

/**
 * La versión del formato de `Client.ficha`. 2 (2026-10-09): la propuesta lleva `origenPorCampo` y lo confirmado su
 * `historia` por campo. Las de la versión 1 se leen igual: los dos campos son opcionales.
 */
export const VERSION_DE_LA_FICHA = 2;

/** De dónde salió lo CONFIRMADO de un campo: quién lo confirmó, cuándo y de qué fuente. */
export interface HistoriaDeCampo {
  /** El correo de quien confirmó (como en `decisiones`; `confirmadaPor` guarda el nombre). */
  por: string;
  /** ISO. */
  en: string;
  /** Las fuentes del valor confirmado («Sesión «Seguimiento» del 9 oct 2026», «Escrito a mano»). */
  fuentes: string[];
  /** Quién lo había propuesto («Handoff», «Sesiones»…), o «A mano». */
  origenes: string[];
}

export interface FichaGuardada {
  version: 1 | 2;
  /** Lo CONFIRMADO por el CSE. Desde la memoria de la cuenta (etapa 3), los agentes internos leen también lo propuesto. */
  valores: ValoresDeFicha;
  confirmadaAt: string | null;
  confirmadaPor: string | null;
  /** Lo que propuso la IA y todavía nadie revisó. Se borra al confirmar. */
  propuesta: PropuestaDeFicha | null;
  hubspot: { estado: EstadoEnHubspot; at: string; error?: string; notaId?: string } | null;
  /**
   * El valor de HubSpot que ya se propuso, por campo (2026-10-09, lib/clients/ficha-desde-hubspot.ts): lo que
   * alguien cambió en HubSpot se propone UNA vez; si se descarta, no vuelve hasta que HubSpot cambie de nuevo.
   */
  hubspotVisto?: Partial<Record<ClaveDeFicha, string>>;
  /**
   * Qué se hizo con cada campo que propuso la IA (2026-10-09, lib/lo-propuesto): usado tal cual, usado con cambios o
   * desestimado, con el CORREO de quien lo decidió. Sin esto, desestimar no dejaba rastro y «Uso de Nexus» no podía
   * contarlo. Los más nuevos, hasta MAX_DECISIONES.
   */
  decisiones?: DecisionDeCampo[];
  /**
   * De dónde salió lo confirmado de CADA campo: quién, cuándo y de qué fuente (2026-10-09, memoria de la cuenta, etapa
   * 3). Se escribe al confirmar, solo para los campos que cambiaron (`historiaAlConfirmar`). Sin esto, un agente no
   * sabía qué tan viejo era un dato. Los campos confirmados antes de esto no la tienen: vale `confirmadaAt`.
   */
  historia?: Partial<Record<ClaveDeFicha, HistoriaDeCampo>>;
}

export type EstadoDeDecisionDeCampo = "usado" | "usado_con_cambios" | "desestimado";

export interface DecisionDeCampo {
  clave: ClaveDeFicha;
  /** Lo que se había propuesto, recortado. */
  valor: string;
  estado: EstadoDeDecisionDeCampo;
  /** El correo de quien decidió (no el nombre: `confirmadaPor` guarda el nombre). */
  por: string;
  /** ISO. */
  en: string;
  /** De dónde salió el campo propuesto («Sesión «Seguimiento» del 9 oct 2026»). */
  fuentes: string[];
  /** Cuándo se propuso (la fecha de la propuesta). */
  propuestaAt?: string;
}

export const MAX_DECISIONES = 300;
const MAX_VALOR_DE_DECISION = 300;
const ESTADOS_DE_DECISION = new Set<string>(["usado", "usado_con_cambios", "desestimado"]);

export function fichaVacia(): FichaGuardada {
  return { version: VERSION_DE_LA_FICHA, valores: valoresVacios(), confirmadaAt: null, confirmadaPor: null, propuesta: null, hubspot: null };
}

const CLAVES = new Set<string>(CAMPOS_DE_LA_FICHA.map((c) => c.clave));

function soloValoresConocidos(bruto: unknown): Partial<ValoresDeFicha> {
  const out: Partial<ValoresDeFicha> = {};
  if (!bruto || typeof bruto !== "object") return out;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (CLAVES.has(k) && typeof v === "string") out[k as ClaveDeFicha] = v;
  }
  return out;
}

function leerFuentesPorCampo(bruto: unknown): Partial<Record<ClaveDeFicha, string[]>> {
  const out: Partial<Record<ClaveDeFicha, string[]>> = {};
  if (!bruto || typeof bruto !== "object") return out;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (CLAVES.has(k) && Array.isArray(v)) out[k as ClaveDeFicha] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** Lee `Client.ficha` tal como venga (null, viejo, a medias) y devuelve SIEMPRE una ficha completa. */
export function leerFicha(bruto: unknown): FichaGuardada {
  const base = fichaVacia();
  if (!bruto || typeof bruto !== "object") return base;
  const f = bruto as Partial<FichaGuardada>;
  const p = f.propuesta as Partial<PropuestaDeFicha> | null | undefined;
  return {
    version: VERSION_DE_LA_FICHA,
    valores: { ...base.valores, ...soloValoresConocidos(f.valores) },
    confirmadaAt: typeof f.confirmadaAt === "string" ? f.confirmadaAt : null,
    confirmadaPor: typeof f.confirmadaPor === "string" ? f.confirmadaPor : null,
    propuesta:
      p && typeof p === "object"
        ? {
            valores: soloValoresConocidos(p.valores),
            fuentes: Array.isArray(p.fuentes) ? p.fuentes.filter((x): x is string => typeof x === "string") : [],
            fuentesPorCampo: leerFuentesPorCampo(p.fuentesPorCampo),
            ...(p.origenPorCampo && typeof p.origenPorCampo === "object" ? { origenPorCampo: leerFuentesPorCampo(p.origenPorCampo) } : {}),
            ...(p.internoPorCampo && typeof p.internoPorCampo === "object" ? { internoPorCampo: leerMarcas(p.internoPorCampo) } : {}),
            at: typeof p.at === "string" ? p.at : "",
            origen: typeof p.origen === "string" ? p.origen : "",
          }
        : null,
    hubspot: f.hubspot && typeof f.hubspot === "object" ? f.hubspot : null,
    ...(f.hubspotVisto && typeof f.hubspotVisto === "object" ? { hubspotVisto: soloValoresConocidos(f.hubspotVisto) } : {}),
    ...(Array.isArray(f.decisiones) ? { decisiones: leerDecisiones(f.decisiones) } : {}),
    ...(f.historia && typeof f.historia === "object" ? { historia: leerHistoria(f.historia) } : {}),
  };
}

function leerMarcas(bruto: object): Partial<Record<ClaveDeFicha, true>> {
  const out: Partial<Record<ClaveDeFicha, true>> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) if (CLAVES.has(k) && v === true) out[k as ClaveDeFicha] = true;
  return out;
}

function soloTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function leerHistoria(bruto: object): Partial<Record<ClaveDeFicha, HistoriaDeCampo>> {
  const out: Partial<Record<ClaveDeFicha, HistoriaDeCampo>> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!CLAVES.has(k) || !v || typeof v !== "object") continue;
    const h = v as Record<string, unknown>;
    if (typeof h.por !== "string" || !h.por || typeof h.en !== "string" || !h.en) continue;
    out[k as ClaveDeFicha] = { por: h.por, en: h.en, fuentes: soloTextos(h.fuentes), origenes: soloTextos(h.origenes) };
  }
  return out;
}

function leerDecisiones(bruto: readonly unknown[]): DecisionDeCampo[] {
  const out: DecisionDeCampo[] = [];
  for (const d of bruto) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (typeof o.clave !== "string" || !CLAVES.has(o.clave)) continue;
    if (typeof o.estado !== "string" || !ESTADOS_DE_DECISION.has(o.estado)) continue;
    if (typeof o.por !== "string" || !o.por || typeof o.en !== "string" || !o.en) continue;
    out.push({
      clave: o.clave as ClaveDeFicha,
      valor: typeof o.valor === "string" ? o.valor.slice(0, MAX_VALOR_DE_DECISION) : "",
      estado: o.estado as EstadoDeDecisionDeCampo,
      por: o.por,
      en: o.en,
      fuentes: Array.isArray(o.fuentes) ? o.fuentes.filter((x): x is string => typeof x === "string") : [],
      ...(typeof o.propuestaAt === "string" && o.propuestaAt ? { propuestaAt: o.propuestaAt } : {}),
    });
  }
  return out.slice(-MAX_DECISIONES);
}

/**
 * Valida lo que manda la pantalla. Devuelve los valores limpios o el primer error en palabras.
 * La apertura solo acepta una opción de la lista (o vacío): un texto libre ahí rompería la
 * propiedad de lista de HubSpot.
 */
export function validarValores(bruto: unknown): { ok: true; valores: ValoresDeFicha } | { ok: false; error: string } {
  if (!bruto || typeof bruto !== "object") return { ok: false, error: "Faltan los valores de la ficha." };
  const valores = valoresVacios();
  for (const campo of CAMPOS_DE_LA_FICHA) {
    const v = (bruto as Record<string, unknown>)[campo.clave];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return { ok: false, error: `«${campo.etiqueta}» tiene que ser texto.` };
    const limpio = v.replace(/\r\n?/g, "\n").trim();
    if (limpio.length > MAX_CARACTERES_POR_CAMPO) {
      return { ok: false, error: `«${campo.etiqueta}» pasa de ${MAX_CARACTERES_POR_CAMPO.toLocaleString("es")} caracteres.` };
    }
    if (campo.destino.tipo === "lista" && limpio && !OPCIONES_DE_APERTURA.some((o) => o.valor === limpio)) {
      return { ok: false, error: `«${campo.etiqueta}» no es una opción válida.` };
    }
    valores[campo.clave] = limpio;
  }
  return { ok: true, valores };
}

/** Los campos que cambiaron entre dos versiones, en el orden de la ficha. */
export function camposQueCambiaron(antes: ValoresDeFicha, despues: ValoresDeFicha): ClaveDeFicha[] {
  return CAMPOS_DE_LA_FICHA.filter((c) => (antes[c.clave] ?? "").trim() !== (despues[c.clave] ?? "").trim()).map(
    (c) => c.clave,
  );
}

/**
 * Al volver «Actualizar con IA» (tarda hasta un minuto), lo que el CSE escribió sin confirmar se
 * conserva sobre la ficha nueva: los campos que difieren entre la ficha del momento del clic y lo que
 * hay en pantalla AHORA, escritos antes del clic o mientras esperaba. `base` es el borrador ya
 * re-sembrado con la ficha nueva. Antes se comparaba contra el borrador del clic y lo escrito durante
 * la espera se perdía.
 */
export function conservarLoEscrito(
  alClic: ValoresDeFicha | null,
  enPantalla: ValoresDeFicha,
  base: ValoresDeFicha,
): ValoresDeFicha {
  if (!alClic) return base;
  const escritos = camposQueCambiaron(alClic, enPantalla);
  return escritos.length ? { ...base, ...Object.fromEntries(escritos.map((k) => [k, enPantalla[k]])) } : base;
}

/** Los campos que viajan como propiedad de la empresa (los internos van solo en la nota). */
export const CAMPOS_EN_PROPIEDAD: readonly ClaveDeFicha[] = CAMPOS_DE_LA_FICHA.filter(
  (c) => c.destino.tipo !== "nota",
).map((c) => c.clave);

/**
 * Qué viaja a HubSpot al confirmar la ficha. La última escritura «quedó al día» si terminó entera, o
 * si no hay empresa a la cual escribir. Si NO quedó al día (falló, quedó a medias o la empresa se
 * vinculó después), viajan todas las propiedades y también la nota. Esa nota nunca llegó: con
 * «fallo» ni se intenta, y sin ella «Por qué esa apertura» y «Motivación de compra» no quedan en
 * ningún lado de HubSpot. Al día y sin cambios, no hay nada que escribir.
 */
export function escrituraEnHubspot(opts: {
  primeraVez: boolean;
  cambios: readonly ClaveDeFicha[];
  estadoPrevio: EstadoEnHubspot | null | undefined;
  hayEmpresa: boolean;
}): { alDia: boolean; aEscribir: readonly ClaveDeFicha[]; conNota: boolean } {
  const alDia = opts.estadoPrevio === "sincronizada" || (opts.estadoPrevio === "sin_empresa" && !opts.hayEmpresa);
  const todo = opts.primeraVez || !alDia;
  return { alDia, aEscribir: todo ? CAMPOS_EN_PROPIEDAD : opts.cambios, conNota: todo || opts.cambios.length > 0 };
}

/** Evento de ventana que avisa «la ficha de este cliente cambió» (detail: { clientId }). */
export const EVENTO_FICHA_CAMBIO = "nexus:ficha-cliente-cambio";

/** Los campos que la IA de la ficha puede proponer (los que salen de los resultados, no). */
export const CAMPOS_QUE_PROPONE_LA_IA: readonly CampoDeFicha[] = CAMPOS_DE_LA_FICHA.filter((c) => !c.deLosResultados);

/** Los campos que la propuesta pendiente cambiaría respecto de lo confirmado (el número del aviso). */
export function camposPropuestos(ficha: FichaGuardada): ClaveDeFicha[] {
  const p = ficha.propuesta?.valores ?? {};
  return CAMPOS_QUE_PROPONE_LA_IA.filter((c) => {
    const v = p[c.clave];
    return typeof v === "string" && v.trim() && v.trim() !== ficha.valores[c.clave].trim();
  }).map((c) => c.clave);
}

/**
 * Quita campos de lo que propone la IA (el «Descartar» de cada campo). Sin campos propuestos, la
 * propuesta se va entera. Antes el descarte por campo vivía solo en la pantalla: el número de la
 * pestaña «Información del cliente» no se apagaba nunca y al volver las propuestas reaparecían.
 */
export function quitarDeLaPropuesta(ficha: FichaGuardada, claves: readonly ClaveDeFicha[]): FichaGuardada {
  if (!ficha.propuesta || !claves.length) return ficha;
  const valores = { ...ficha.propuesta.valores };
  const fuentesPorCampo = { ...ficha.propuesta.fuentesPorCampo };
  const origenPorCampo = ficha.propuesta.origenPorCampo ? { ...ficha.propuesta.origenPorCampo } : undefined;
  const internoPorCampo = ficha.propuesta.internoPorCampo ? { ...ficha.propuesta.internoPorCampo } : undefined;
  for (const k of claves) {
    delete valores[k];
    delete fuentesPorCampo[k];
    if (origenPorCampo) delete origenPorCampo[k];
    if (internoPorCampo) delete internoPorCampo[k];
  }
  const quedan = CAMPOS_DE_LA_FICHA.some((c) => typeof valores[c.clave] === "string" && valores[c.clave]!.trim());
  return {
    ...ficha,
    propuesta: quedan
      ? {
          ...ficha.propuesta,
          valores,
          fuentesPorCampo,
          ...(origenPorCampo ? { origenPorCampo } : {}),
          ...(internoPorCampo ? { internoPorCampo } : {}),
        }
      : null,
  };
}

// ── Lo que se decidió de cada campo propuesto (lib/lo-propuesto) ─────────────────────────────

function decisionDe(ficha: FichaGuardada, clave: ClaveDeFicha, estado: EstadoDeDecisionDeCampo, por: string, en: string): DecisionDeCampo {
  const p = ficha.propuesta;
  return {
    clave,
    valor: (p?.valores[clave] ?? "").trim().slice(0, MAX_VALOR_DE_DECISION),
    estado,
    por: por.toLowerCase(),
    en,
    fuentes: [...(p?.fuentesPorCampo[clave] ?? [])],
    ...(p?.at ? { propuestaAt: p.at } : {}),
  };
}

/**
 * Las decisiones de un «Descartar»: cada campo propuesto que se descarta queda desestimado, con el correo de quien lo
 * hizo. Solo los que de verdad estaban propuestos (un campo igual a lo confirmado no era una propuesta).
 */
export function decisionesAlDescartar(ficha: FichaGuardada, claves: readonly ClaveDeFicha[], por: string, en: string): DecisionDeCampo[] {
  const propuestos = new Set(camposPropuestos(ficha));
  return claves.filter((k) => propuestos.has(k)).map((k) => decisionDe(ficha, k, "desestimado", por, en));
}

/**
 * Las decisiones de un «Confirmar», campo por campo de lo que estaba propuesto: igual a lo propuesto = usado; igual a
 * lo que ya estaba confirmado = desestimado (se quedó con lo de antes); distinto de los dos = usado con cambios.
 */
export function decisionesAlConfirmar(antes: FichaGuardada, confirmados: ValoresDeFicha, por: string, en: string): DecisionDeCampo[] {
  return camposPropuestos(antes).map((k) => {
    const propuesto = (antes.propuesta?.valores[k] ?? "").trim();
    const confirmado = (confirmados[k] ?? "").trim();
    const anterior = (antes.valores[k] ?? "").trim();
    const estado: EstadoDeDecisionDeCampo = confirmado === propuesto ? "usado" : confirmado === anterior ? "desestimado" : "usado_con_cambios";
    return decisionDe(antes, k, estado, por, en);
  });
}

/** La ficha con estas decisiones sumadas al registro (los más nuevos, hasta MAX_DECISIONES). */
export function conDecisiones(ficha: FichaGuardada, nuevas: readonly DecisionDeCampo[]): FichaGuardada {
  if (!nuevas.length) return ficha;
  return { ...ficha, decisiones: [...(ficha.decisiones ?? []), ...nuevas].slice(-MAX_DECISIONES) };
}

// ── La reunión de la que salió un campo propuesto ───────────────────────────────────────────
//
// La propuesta de la ficha no guarda el id de la reunión: guarda la ETIQUETA de la fuente («Sesión «Seguimiento» del
// 9 oct 2026»). Para saber qué campos son de una reunión hay que compararla, y esto es lo único que la arma y la lee.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día de Costa Rica (UTC-6, sin horario de verano) de un instante: [año, mes 1-12, día]. */
function diaDeCostaRica(fecha: Date | string): [number, number, number] {
  const cr = new Date(new Date(fecha).getTime() - 6 * 3_600_000);
  return [cr.getUTCFullYear(), cr.getUTCMonth() + 1, cr.getUTCDate()];
}

/**
 * La etiqueta de una reunión como fuente de la ficha: «Sesión «título» del 9 oct 2026». La fecha se arma A MANO (con
 * `toLocaleDateString` cambiaba entre versiones de Node: «9 oct 2026», «9 oct. 2026»): es la misma forma que guardó la
 * producción hasta hoy.
 */
export function etiquetaDeSesion(s: { title: string | null; date: Date | string }): string {
  const [a, m, d] = diaDeCostaRica(s.date);
  return `Sesión «${s.title ?? "sin título"}» del ${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

/**
 * ¿Esta fuente es la etiqueta de esta reunión? El título se compara exacto; la fecha tolera las formas que escribió
 * cada versión de Node («9 oct 2026», «9 oct. 2026», «9 de oct. de 2026», «sept»).
 */
export function fuenteEsDeLaReunion(fuente: string, s: { title: string | null; date: Date | string }): boolean {
  const prefijo = `Sesión «${s.title ?? "sin título"}» del `;
  if (!fuente.startsWith(prefijo)) return false;
  const partes = fuente
    .slice(prefijo.length)
    .toLowerCase()
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter((x) => x && x !== "de");
  if (partes.length !== 3) return false;
  const [dia, mes, anio] = partes;
  const [a, m, d] = diaDeCostaRica(s.date);
  return Number(dia) === d && mes.slice(0, 3) === MESES_CORTOS[m - 1] && Number(anio) === a;
}

/** Los campos propuestos (que todavía esperan) que salieron de esta reunión, en el orden de la ficha. */
export function camposDeLaReunion(ficha: FichaGuardada, s: { title: string | null; date: Date | string }): ClaveDeFicha[] {
  const fuentes = ficha.propuesta?.fuentesPorCampo ?? {};
  return camposPropuestos(ficha).filter((k) => (fuentes[k] ?? []).some((f) => fuenteEsDeLaReunion(f, s)));
}

/** Lo que ya se decidió de los campos que salieron de esta reunión. */
export function decisionesDeLaReunion(ficha: FichaGuardada, s: { title: string | null; date: Date | string }): DecisionDeCampo[] {
  return (ficha.decisiones ?? []).filter((d) => d.fuentes.some((f) => fuenteEsDeLaReunion(f, s)));
}

/** Lo que el agente toma como punto de partida de un campo: lo propuesto si hay, si no lo confirmado. */
export function valorVigente(ficha: FichaGuardada, clave: ClaveDeFicha): string {
  // Un campo que sale de los resultados no tiene propuesta que valga (las viejas se ignoran).
  if (campoDeFicha(clave).deLosResultados) return ficha.valores[clave];
  const propuesto = ficha.propuesta?.valores[clave];
  return typeof propuesto === "string" && propuesto.trim() ? propuesto : ficha.valores[clave];
}

const MAX_FUENTES = 30;

/**
 * Suma lo que trajo una fuente nueva a la propuesta pendiente. ACUMULA: si el CSE no revisó en
 * dos semanas, ve UNA propuesta con todo lo que entró, y cada campo dice de dónde salió.
 *
 * El agente devuelve el texto COMPLETO de cada campo (lo que había + lo nuevo), así que acá se
 * reemplaza el valor propuesto y se suman las fuentes. Lo que no mejora nada se descarta: un valor
 * igual a lo confirmado, una apertura fuera de la lista, un texto vacío.
 */
export function fusionarPropuesta(
  ficha: FichaGuardada,
  /** `interno`: lo que se suma trae algo interno aunque el campo vaya al cliente (ver `internoPorCampo`). */
  nuevos: ReadonlyArray<{ clave: string; valor: string; fuentes: readonly string[]; interno?: boolean }>,
  origen: string,
  ahora: Date = new Date(),
): { ficha: FichaGuardada; cambiados: ClaveDeFicha[] } {
  const base: PropuestaDeFicha = ficha.propuesta ?? { valores: {}, fuentes: [], fuentesPorCampo: {}, at: "", origen: "" };
  const valores = { ...base.valores };
  const fuentesPorCampo = { ...base.fuentesPorCampo };
  // El origen de cada campo ACUMULA, como sus fuentes: el valor nuevo integra lo de antes (el agente devuelve el
  // texto completo), así que lo propuesto queda «derivado» de todas las puertas que lo tocaron.
  const origenPorCampo: Partial<Record<ClaveDeFicha, string[]>> = { ...(base.origenPorCampo ?? {}) };
  // La marca de lo interno también queda pegada: el texto nuevo integra lo de antes, también lo interno.
  const internoPorCampo: Partial<Record<ClaveDeFicha, true>> = { ...(base.internoPorCampo ?? {}) };
  const fuentesNuevas: string[] = [];
  const cambiados: ClaveDeFicha[] = [];
  for (const n of nuevos) {
    if (!CLAVES.has(n.clave) || typeof n.valor !== "string") continue;
    const clave = n.clave as ClaveDeFicha;
    const campo = campoDeFicha(clave);
    // Los resultados salen de la lista medible de cada proyecto, no de lo que proponga la IA.
    if (campo.deLosResultados) continue;
    const valor = n.valor.replace(/\r\n?/g, "\n").trim().slice(0, MAX_CARACTERES_POR_CAMPO);
    if (!valor) continue;
    if (campo.destino.tipo === "lista" && !OPCIONES_DE_APERTURA.some((o) => o.valor === valor)) continue;
    if (valor === valorVigente(ficha, clave).trim()) continue;
    const fuentes = n.fuentes.filter((f) => typeof f === "string" && f.trim());
    valores[clave] = valor;
    fuentesPorCampo[clave] = [...new Set([...(fuentesPorCampo[clave] ?? []), ...fuentes])].slice(-MAX_FUENTES);
    // Una propuesta de antes no guardaba el origen por campo: lo que se deduce de ella se conserva al sumar el nuevo.
    const previos = origenPorCampo[clave] ?? (base.valores[clave] ? origenesDelCampo(ficha, clave) : []);
    origenPorCampo[clave] = [...new Set([...previos, origen])];
    if (n.interno) internoPorCampo[clave] = true;
    fuentesNuevas.push(...fuentes);
    cambiados.push(clave);
  }
  if (!cambiados.length) return { ficha, cambiados };
  return {
    ficha: {
      ...ficha,
      propuesta: {
        valores,
        fuentesPorCampo,
        origenPorCampo,
        ...(Object.keys(internoPorCampo).length ? { internoPorCampo } : {}),
        fuentes: [...new Set([...base.fuentes, ...fuentesNuevas])].slice(-MAX_FUENTES),
        at: ahora.toISOString(),
        // Si ya había una propuesta de otra procedencia, el rótulo dice que viene de varias.
        origen: base.origen && base.origen !== origen ? "Varias fuentes" : origen,
      },
    },
    cambiados,
  };
}

export function fichaTieneContenido(valores: ValoresDeFicha): boolean {
  return CAMPOS_DE_LA_FICHA.some((c) => valores[c.clave].trim() && valores[c.clave] !== "sin_evaluar");
}

// ── De dónde salió cada campo (memoria de la cuenta, etapa 3) ───────────────────────────────

/** Los `origen` que escriben las puertas de la propuesta (lib/clients/ficha-propuesta.ts y ficha-desde-hubspot-server.ts). */
export const ORIGENES_DE_LA_FICHA = ["Handoff", "Sesiones", "Exploración", "Preventa", "Actualizar con IA", "HubSpot"] as const;
/** Un campo propuesto del que no se sabe quién lo propuso (una propuesta de antes, con fuentes que no se reconocen). */
export const ORIGEN_DESCONOCIDO = "desconocido";
/** Un campo confirmado que el CSE escribió (o cambió) a mano. */
export const ORIGEN_A_MANO = "A mano";
/** El origen de «Resultados que persigue»: sale de los resultados confirmados de cada proyecto. */
export const ORIGEN_RESULTADOS = "Resultados de los proyectos";

/**
 * El origen que delata la ETIQUETA de una fuente, o null si no se reconoce. Lo usan las propuestas de antes de
 * `origenPorCampo` y la regla «lo derivado de» de `fichaParaLaMemoria` («Actualizar con IA» lee los handoffs, así que
 * un campo suyo con una fuente «Handoff de «…»» también es del handoff).
 */
export function origenDeLaFuente(fuente: string): string | null {
  const f = fuente.trim();
  if (f.startsWith("Handoff de «")) return "Handoff";
  if (f.startsWith("Sesión «")) return "Sesiones";
  if (f.startsWith("Exploración ·")) return "Exploración";
  if (f.startsWith("Preventa ·")) return "Preventa";
  if (f.startsWith("Encuesta de «")) return "Actualizar con IA";
  if (f.startsWith("Lo que dice HubSpot")) return "HubSpot";
  return null;
}

/**
 * Quién propuso este campo. Con `origenPorCampo`, eso. Sin él (propuestas de antes), se deduce de las etiquetas de sus
 * fuentes y, si no se puede, del `origen` de la propuesta cuando no dice «Varias fuentes». Lo que no se reconoce suma
 * `ORIGEN_DESCONOCIDO`: para excluir, no saber cuenta como sí. Vacío si el campo no está propuesto.
 */
export function origenesDelCampo(ficha: FichaGuardada, clave: ClaveDeFicha): string[] {
  const p = ficha.propuesta;
  if (!p || !(p.valores[clave] ?? "").trim()) return [];
  const guardados = p.origenPorCampo?.[clave];
  if (guardados?.length) return guardados;
  const fuentes = p.fuentesPorCampo[clave] ?? [];
  const deLasFuentes = fuentes.map(origenDeLaFuente);
  const conocidos = [...new Set(deLasFuentes.filter((x): x is string => !!x))];
  if (conocidos.length) return deLasFuentes.some((x) => !x) ? [...conocidos, ORIGEN_DESCONOCIDO] : conocidos;
  if (p.origen && p.origen !== "Varias fuentes") return [p.origen];
  return [ORIGEN_DESCONOCIDO];
}

/**
 * ¿Este campo propuesto queda afuera para un lector que excluye estos orígenes? Sí si lo propuso uno de ellos, si una
 * de sus fuentes es de uno de ellos (lo derivado: «Handoff de «…»» propuesto por «Actualizar con IA»), o si no se sabe
 * quién lo propuso. Sin exclusiones, nunca.
 */
export function propuestaExcluida(ficha: FichaGuardada, clave: ClaveDeFicha, excluir: readonly string[]): boolean {
  if (!excluir.length) return false;
  const origenes = origenesDelCampo(ficha, clave);
  if (origenes.some((o) => o === ORIGEN_DESCONOCIDO || excluir.includes(o))) return true;
  return (ficha.propuesta?.fuentesPorCampo[clave] ?? []).some((f) => {
    const o = origenDeLaFuente(f);
    return !!o && excluir.includes(o);
  });
}

/**
 * ¿Este campo propuesto trae algo INTERNO (la radiografía o «quién decide» de la preventa)? Sí si la puerta lo marcó
 * (`internoPorCampo`) o, en una propuesta de antes, si una de sus fuentes lo dice (`MARCA_DE_LO_INTERNO`). Mientras
 * nadie lo confirme, no sale del alcance interno de la memoria.
 */
export function propuestaConLoInterno(ficha: FichaGuardada, clave: ClaveDeFicha): boolean {
  const p = ficha.propuesta;
  if (!p) return false;
  if (p.internoPorCampo?.[clave]) return true;
  return (p.fuentesPorCampo[clave] ?? []).some((f) => f.includes(MARCA_DE_LO_INTERNO));
}

// ── La historia de lo confirmado ─────────────────────────────────────────────────────────────

/**
 * De dónde salió cada campo que cambia al confirmar: igual a lo propuesto, sus fuentes y sus orígenes; distinto de lo
 * propuesto, lo mismo más «Editado a mano»; sin propuesta, «Escrito a mano». «Resultados que persigue» sale de los
 * resultados confirmados de los proyectos. Un campo que se vació también queda (dice quién lo vació).
 */
export function historiaAlConfirmar(
  antes: FichaGuardada,
  confirmados: ValoresDeFicha,
  por: string,
  en: string,
): Partial<Record<ClaveDeFicha, HistoriaDeCampo>> {
  const out: Partial<Record<ClaveDeFicha, HistoriaDeCampo>> = {};
  const quien = por.toLowerCase();
  for (const k of camposQueCambiaron(antes.valores, confirmados)) {
    if (campoDeFicha(k).deLosResultados) {
      out[k] = { por: quien, en, fuentes: ["Resultados confirmados de los proyectos"], origenes: [ORIGEN_RESULTADOS] };
      continue;
    }
    const propuesto = (antes.propuesta?.valores[k] ?? "").trim();
    const fuentes = [...(antes.propuesta?.fuentesPorCampo[k] ?? [])];
    const origenes = origenesDelCampo(antes, k);
    if (propuesto && (confirmados[k] ?? "").trim() === propuesto) {
      out[k] = { por: quien, en, fuentes, origenes };
    } else if (propuesto) {
      out[k] = { por: quien, en, fuentes: [...fuentes, "Editado a mano"], origenes: [...new Set([...origenes, ORIGEN_A_MANO])] };
    } else {
      out[k] = { por: quien, en, fuentes: ["Escrito a mano"], origenes: [ORIGEN_A_MANO] };
    }
  }
  return out;
}

/** La ficha con esta historia sumada (lo nuevo de un campo reemplaza lo anterior de ese campo). */
export function conHistoria(ficha: FichaGuardada, nueva: Partial<Record<ClaveDeFicha, HistoriaDeCampo>>): FichaGuardada {
  if (!Object.keys(nueva).length) return ficha;
  return { ...ficha, version: VERSION_DE_LA_FICHA, historia: { ...(ficha.historia ?? {}), ...nueva } };
}

// ── Los conteos de «Lo que la IA ya sabe» ────────────────────────────────────────────────────

/** Cuántos campos hay confirmados y propuestos, y los propuestos por quién los propuso. Son conteos: nunca el contenido. */
export function conteoDeLaFicha(ficha: FichaGuardada): {
  confirmados: number;
  propuestos: number;
  propuestosPorOrigen: Record<string, number>;
} {
  const confirmados = CAMPOS_DE_LA_FICHA.filter((c) => {
    const v = ficha.valores[c.clave].trim();
    return v && v !== "sin_evaluar";
  }).length;
  const propuestos = camposPropuestos(ficha);
  const propuestosPorOrigen: Record<string, number> = {};
  for (const k of propuestos) for (const o of origenesDelCampo(ficha, k)) propuestosPorOrigen[o] = (propuestosPorOrigen[o] ?? 0) + 1;
  return { confirmados, propuestos: propuestos.length, propuestosPorOrigen };
}

// ── Texto con formato → HTML de HubSpot ──────────────────────────────────────────────────────
//
// El CSE escribe con el formato mínimo que ya usa en todo Nexus: «- » para viñetas, «1. » para
// listas numeradas, **negrita** y *cursiva*. HubSpot guarda texto con formato como HTML. Un
// convertidor propio y chico, en vez de una librería: el subconjunto es cerrado, y así el
// resultado es predecible y se puede testear línea por línea.

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function enLinea(s: string): string {
  return escaparHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

export function textoAHtml(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let lista: "ul" | "ol" | null = null;
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) out.push(`<p>${parrafo.map(enLinea).join("<br>")}</p>`);
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista) out.push(`</${lista}>`);
    lista = null;
  };
  for (const cruda of lineas) {
    const linea = cruda.trimEnd();
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (vineta || numero) {
      cerrarParrafo();
      const tipo = vineta ? "ul" : "ol";
      if (lista !== tipo) {
        cerrarLista();
        out.push(`<${tipo}>`);
        lista = tipo;
      }
      out.push(`<li>${enLinea((vineta ?? numero)![1])}</li>`);
      continue;
    }
    if (!linea.trim()) {
      cerrarParrafo();
      cerrarLista();
      continue;
    }
    cerrarLista();
    // Un título estilo «## Algo» se guarda como un párrafo en negrita: HubSpot no muestra títulos.
    const titulo = /^#{1,6}\s+(.*)$/.exec(linea);
    parrafo.push(titulo ? `**${titulo[1]}**` : linea);
  }
  cerrarParrafo();
  cerrarLista();
  return out.join("");
}

/** Las propiedades de la empresa que hay que escribir para estos campos. */
export function propiedadesParaHubspot(valores: ValoresDeFicha, claves: readonly ClaveDeFicha[]): Record<string, string> {
  const props: Record<string, string> = {};
  for (const clave of claves) {
    const { destino } = campoDeFicha(clave);
    if (destino.tipo === "texto") props[destino.propiedad] = textoAHtml(valores[clave]);
    if (destino.tipo === "lista") props[destino.propiedad] = valores[clave];
  }
  return props;
}

/** Cómo empieza la nota que Nexus deja en la empresa al confirmar. Lo lee `esNotaDeLaFicha`. */
export const ENCABEZADO_DE_LA_NOTA = "Ficha del cliente confirmada en Nexus";

/**
 * ¿Este texto (HTML o ya limpio) es una nota de la ficha? La nota lleva los campos internos
 * (apertura, su porqué, motivación de compra) y queda en el timeline de la empresa, que alimenta la
 * propuesta que abre el cliente. Por LA REGLA de arriba, esa nota no puede entrar a ninguna fuente:
 * lib/hubspot/company-timeline.ts la saca en el único lugar que lee ese timeline.
 */
export function esNotaDeLaFicha(texto: string): boolean {
  return texto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trimStart().startsWith(ENCABEZADO_DE_LA_NOTA);
}

/** El cuerpo HTML de la nota que se crea en la empresa en cada confirmación. */
export function cuerpoDeLaNota(opts: {
  autor: string;
  cambios: readonly ClaveDeFicha[];
  primeraVez: boolean;
  valores: ValoresDeFicha;
  fuentes: readonly string[];
}): string {
  const { autor, cambios, primeraVez, valores, fuentes } = opts;
  const partes: string[] = [`<p><strong>${ENCABEZADO_DE_LA_NOTA}</strong> por ${escaparHtml(autor)}.</p>`];
  if (primeraVez) partes.push("<p>Primera versión de la ficha.</p>");
  else if (cambios.length) {
    partes.push("<p><strong>Qué cambió:</strong></p>");
    partes.push(`<ul>${cambios.map((c) => `<li>${escaparHtml(campoDeFicha(c).etiqueta)}</li>`).join("")}</ul>`);
  }
  const apertura = etiquetaDeApertura(valores.aperturaAsesoria);
  if (apertura) partes.push(`<p><strong>Apertura a la asesoría:</strong> ${escaparHtml(apertura)}</p>`);
  if (valores.porQueApertura.trim()) {
    partes.push("<p><strong>Por qué esa apertura:</strong></p>", textoAHtml(valores.porQueApertura));
  }
  if (valores.motivacionCompra.trim()) {
    partes.push("<p><strong>Motivación de compra:</strong></p>", textoAHtml(valores.motivacionCompra));
  }
  if (fuentes.length) {
    partes.push("<p><strong>De dónde salió:</strong></p>");
    partes.push(`<ul>${fuentes.map((f) => `<li>${escaparHtml(f)}</li>`).join("")}</ul>`);
  }
  return partes.join("");
}

// ── La ficha para un agente ──────────────────────────────────────────────────────────────────

/**
 * La ficha CONFIRMADA como texto para un prompt. Con `paraDocumentoDelCliente` quedan afuera los
 * campos internos y la postura de los stakeholders (cortada en código, `stakeholdersSinPostura`), y
 * cada recorte va dicho en el propio texto, para que el agente no lo cite.
 * Devuelve "" si no hay nada confirmado: un agente no tiene por qué enterarse de una ficha vacía.
 *
 * ⚠ La leen todavía el diagnóstico y la planificación (documentos del cliente) hasta que lean la memoria
 * (lib/memoria/consumidores.test.ts › AUN_SIN_CONECTAR): por eso el recorte va acá también, no solo en
 * `fichaParaLaMemoria`.
 */
export function fichaParaPrompt(ficha: FichaGuardada, opts: { paraDocumentoDelCliente: boolean }): string {
  if (!ficha.confirmadaAt) return "";
  const lineas: string[] = [];
  for (const campo of CAMPOS_DE_LA_FICHA) {
    if (opts.paraDocumentoDelCliente && !campo.alCliente) continue;
    const bruto = ficha.valores[campo.clave].trim();
    const conRecorte = opts.paraDocumentoDelCliente && campo.clave === "stakeholders" ? stakeholdersSinPostura(bruto) : bruto;
    const valor = campo.destino.tipo === "lista" ? etiquetaDeApertura(conRecorte) : conRecorte;
    if (!valor) continue;
    const marca = !campo.alCliente
      ? " (INTERNO — nunca se cita al cliente)"
      : opts.paraDocumentoDelCliente && campo.recorteAlCliente
        ? ` (al cliente: ${campo.recorteAlCliente})`
        : "";
    lineas.push(`### ${campo.etiqueta}${marca}\n${valor}`);
  }
  if (!lineas.length) return "";
  return `## Ficha del cliente (confirmada por el CSE el ${ficha.confirmadaAt.slice(0, 10)})\n\n${lineas.join("\n\n")}`;
}

// ── La ficha para la memoria de la cuenta (lib/memoria) ─────────────────────────────────────

/** Para quién es el texto: un documento que lee el cliente, el handoff (interno, pero escribe lo que leen los documentos del cliente) o un agente interno. */
export type AlcanceDeLaFicha = "cliente" | "sin-lo-interno" | "interno";

/** Las partes de una viñeta de stakeholders: nombre — cargo — papel en el proyecto — postura. */
const PARTES_DE_UNA_PERSONA = 4;

/**
 * Los stakeholders SIN la postura. Es el `recorteAlCliente` del campo, hecho en código (antes era solo una instrucción
 * al modelo). No se adivina por posición:
 *   · solo las viñetas de PRIMER nivel (sin sangría): una sub-viñeta («  - Postura: escéptica») es justo donde se anota;
 *   · con las cuatro partes (o más), se quedan las tres primeras (nombre, cargo, papel);
 *   · con menos, solo el nombre: falta una parte y no se sabe cuál, así que la última puede ser la postura
 *     («Ana — muy escéptica», «Ana — gerente — no confía en consultoras»).
 * Lo que no es una viñeta no va: puede traer la postura en prosa. Por eso la ficha pide las cuatro partes siempre, con
 * «sin dato» en la que falta (lib/clients/ficha-pedido.ts, y la preventa en lib/exploraciones/a-la-ficha.ts).
 */
export function stakeholdersSinPostura(texto: string): string {
  const out: string[] = [];
  for (const cruda of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const vineta = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(cruda);
    if (!vineta) continue;
    const partes = vineta[1]
      .split(/\s+[—–-]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!partes.length) continue;
    if (partes.length >= PARTES_DE_UNA_PERSONA) {
      out.push(`- ${partes.slice(0, 3).join(" — ")}`);
      continue;
    }
    const nombre = soloElNombre(partes[0]);
    if (nombre) out.push(`- ${nombre}`);
  }
  return out.join("\n");
}

/** Las palabras que un nombre puede llevar en minúscula. */
const CONECTORES_DE_NOMBRE = new Set(["de", "del", "la", "las", "los", "y", "da", "das", "do", "dos", "van", "von", "e"]);

/**
 * La primera parte de una viñeta incompleta, solo si parece un nombre: hasta la primera coma, paréntesis o dos puntos
 * («Ana, gerente, escéptica» → «Ana»), de una a cinco palabras, cada una con mayúscula salvo los conectores («Luis de
 * la Torre»). Si no parece un nombre («Ana es muy escéptica»), null: la viñeta no va.
 */
function soloElNombre(parte: string): string | null {
  const t = parte.replace(/[*_`]/g, "").split(/[,(:;/|]/)[0].trim();
  const palabras = t.split(/\s+/).filter(Boolean);
  if (!palabras.length || palabras.length > 5) return null;
  const ok = palabras.every((p, i) => /^\p{Lu}/u.test(p) || (i > 0 && CONECTORES_DE_NOMBRE.has(p)));
  return ok ? palabras.join(" ") : null;
}

const MAX_FUENTES_EN_LA_MEMORIA = 3;

function listaDeFuentes(fuentes: readonly string[]): string {
  if (!fuentes.length) return "sin fuente";
  const vistas = fuentes.slice(-MAX_FUENTES_EN_LA_MEMORIA);
  const resto = fuentes.length - vistas.length;
  return `${vistas.join("; ")}${resto > 0 ? ` y ${resto} más` : ""}`;
}

function valorDelCampo(campo: CampoDeFicha, bruto: string | undefined): string {
  const v = (bruto ?? "").trim();
  if (!v || v === "sin_evaluar") return "";
  return campo.destino.tipo === "lista" ? etiquetaDeApertura(v) : v;
}

/**
 * LA FICHA PARA LA MEMORIA (lib/memoria): lo confirmado y, para los agentes, lo propuesto con su fuente. Sin título
 * (lo pone quien la arma). "" si no hay nada que decir. Funciona sin `confirmadaAt`: lo propuesto también es memoria.
 *
 *   · `cliente`: solo lo CONFIRMADO, solo los campos que puede ver el cliente, y los stakeholders sin la postura.
 *   · `sin-lo-interno` (el handoff): lo confirmado y lo propuesto (marcado «propuesto, sin confirmar»), sin los campos
 *     internos, sin la postura y sin lo propuesto que trae algo interno (`propuestaConLoInterno`: la radiografía o
 *     «quién decide» de la preventa caen en campos que van al cliente): ese agente escribe también lo que leen los
 *     documentos del cliente.
 *   · `interno`: todo, lo interno marcado, con la historia de cada campo (quién, cuándo, de dónde).
 *
 * Lo propuesto por un origen de `excluirOrigenes`, o derivado de él, o de origen desconocido, no entra: un agente no
 * lee lo que él mismo propuso (DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»).
 */
export function fichaParaLaMemoria(
  ficha: FichaGuardada,
  opts: { alcance: AlcanceDeLaFicha; excluirOrigenes?: readonly string[] },
): string {
  const excluir = opts.excluirOrigenes ?? [];
  const interno = opts.alcance === "interno";
  const propuestos = new Set(opts.alcance === "cliente" ? [] : camposPropuestos(ficha));
  const bloques: string[] = [];
  for (const campo of CAMPOS_DE_LA_FICHA) {
    if (!interno && !campo.alCliente) continue;
    const sinPostura = !interno && campo.clave === "stakeholders";
    const recortar = (t: string) => (sinPostura ? stakeholdersSinPostura(t) : t);
    const confirmado = recortar(valorDelCampo(campo, ficha.valores[campo.clave]));
    const propuesto =
      propuestos.has(campo.clave) &&
      !propuestaExcluida(ficha, campo.clave, excluir) &&
      (interno || !propuestaConLoInterno(ficha, campo.clave))
        ? recortar(valorDelCampo(campo, ficha.propuesta?.valores[campo.clave]))
        : "";
    if (!confirmado && !propuesto) continue;

    // El recorte va dicho también en `sin-lo-interno`: el handoff escribe lo que leen el kickoff y el cuestionario.
    const marca = !campo.alCliente
      ? " (INTERNO — nunca se cita al cliente)"
      : !interno && campo.recorteAlCliente
        ? ` (al cliente: ${campo.recorteAlCliente})`
        : "";
    const partes = [`### ${campo.etiqueta}${marca}`];
    if (confirmado) {
      const h = ficha.historia?.[campo.clave];
      const cuando = h ? h.en.slice(0, 10) : ficha.confirmadaAt?.slice(0, 10);
      const detalle = !cuando
        ? "Confirmado"
        : interno && h
          ? `Confirmado el ${cuando} por ${h.por} · de: ${listaDeFuentes(h.fuentes)}`
          : `Confirmado el ${cuando}`;
      partes.push(propuesto || interno ? `${detalle}:\n${confirmado}` : `(${detalle.toLowerCase()})\n${confirmado}`);
    }
    if (propuesto) {
      const fuentes = ficha.propuesta?.fuentesPorCampo[campo.clave] ?? [];
      partes.push(`Propuesto, sin confirmar · de: ${listaDeFuentes(fuentes)}:\n${propuesto}`);
    }
    bloques.push(partes.join("\n"));
  }
  return bloques.join("\n\n");
}
