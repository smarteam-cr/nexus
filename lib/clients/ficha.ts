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
 * asesoría, su porqué, motivación de compra, oportunidades). `fichaParaPrompt` los corta cuando
 * el destino es un documento del cliente; no hay otro camino para darle la ficha a un agente.
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
    clave: "retosEstrategicos",
    etiqueta: "Retos estratégicos",
    ayuda: "Los desafíos de negocio del cliente, más allá de este proyecto.",
    grupo: "busca",
    destino: { tipo: "texto", propiedad: "nexus_retos_estrategicos" },
    alCliente: true,
  },
  {
    clave: "resultadosQuePersigue",
    etiqueta: "Resultados que persigue",
    ayuda: "Lo que el cliente quiere lograr, idealmente medible: qué número, cuánto y para cuándo.",
    grupo: "busca",
    destino: { tipo: "texto", propiedad: "nexus_resultados_que_persigue" },
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
    ayuda: "Una viñeta por persona: nombre — cargo — papel en el proyecto — postura.",
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
  at: string;
  /** Quién la propuso: «Handoff», «Sesiones», «Actualizar con IA»… */
  origen: string;
}

export interface FichaGuardada {
  version: 1;
  /** Lo CONFIRMADO por el CSE. Es lo único que leen los agentes. */
  valores: ValoresDeFicha;
  confirmadaAt: string | null;
  confirmadaPor: string | null;
  /** Lo que propuso la IA y todavía nadie revisó. Se borra al confirmar. */
  propuesta: PropuestaDeFicha | null;
  hubspot: { estado: EstadoEnHubspot; at: string; error?: string; notaId?: string } | null;
}

export function fichaVacia(): FichaGuardada {
  return { version: 1, valores: valoresVacios(), confirmadaAt: null, confirmadaPor: null, propuesta: null, hubspot: null };
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
    version: 1,
    valores: { ...base.valores, ...soloValoresConocidos(f.valores) },
    confirmadaAt: typeof f.confirmadaAt === "string" ? f.confirmadaAt : null,
    confirmadaPor: typeof f.confirmadaPor === "string" ? f.confirmadaPor : null,
    propuesta:
      p && typeof p === "object"
        ? {
            valores: soloValoresConocidos(p.valores),
            fuentes: Array.isArray(p.fuentes) ? p.fuentes.filter((x): x is string => typeof x === "string") : [],
            fuentesPorCampo: leerFuentesPorCampo(p.fuentesPorCampo),
            at: typeof p.at === "string" ? p.at : "",
            origen: typeof p.origen === "string" ? p.origen : "",
          }
        : null,
    hubspot: f.hubspot && typeof f.hubspot === "object" ? f.hubspot : null,
  };
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

/** Evento de ventana que avisa «la ficha de este cliente cambió» (detail: { clientId }). */
export const EVENTO_FICHA_CAMBIO = "nexus:ficha-cliente-cambio";

/** Los campos que la propuesta pendiente cambiaría respecto de lo confirmado (el número del aviso). */
export function camposPropuestos(ficha: FichaGuardada): ClaveDeFicha[] {
  const p = ficha.propuesta?.valores ?? {};
  return CAMPOS_DE_LA_FICHA.filter((c) => {
    const v = p[c.clave];
    return typeof v === "string" && v.trim() && v.trim() !== ficha.valores[c.clave].trim();
  }).map((c) => c.clave);
}

/** Lo que el agente toma como punto de partida de un campo: lo propuesto si hay, si no lo confirmado. */
export function valorVigente(ficha: FichaGuardada, clave: ClaveDeFicha): string {
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
  nuevos: ReadonlyArray<{ clave: string; valor: string; fuentes: readonly string[] }>,
  origen: string,
  ahora: Date = new Date(),
): { ficha: FichaGuardada; cambiados: ClaveDeFicha[] } {
  const base = ficha.propuesta ?? { valores: {}, fuentes: [], fuentesPorCampo: {}, at: "", origen: "" };
  const valores = { ...base.valores };
  const fuentesPorCampo = { ...base.fuentesPorCampo };
  const fuentesNuevas: string[] = [];
  const cambiados: ClaveDeFicha[] = [];
  for (const n of nuevos) {
    if (!CLAVES.has(n.clave) || typeof n.valor !== "string") continue;
    const clave = n.clave as ClaveDeFicha;
    const campo = campoDeFicha(clave);
    const valor = n.valor.replace(/\r\n?/g, "\n").trim().slice(0, MAX_CARACTERES_POR_CAMPO);
    if (!valor) continue;
    if (campo.destino.tipo === "lista" && !OPCIONES_DE_APERTURA.some((o) => o.valor === valor)) continue;
    if (valor === valorVigente(ficha, clave).trim()) continue;
    const fuentes = n.fuentes.filter((f) => typeof f === "string" && f.trim());
    valores[clave] = valor;
    fuentesPorCampo[clave] = [...new Set([...(fuentesPorCampo[clave] ?? []), ...fuentes])].slice(-MAX_FUENTES);
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

/** El cuerpo HTML de la nota que se crea en la empresa en cada confirmación. */
export function cuerpoDeLaNota(opts: {
  autor: string;
  cambios: readonly ClaveDeFicha[];
  primeraVez: boolean;
  valores: ValoresDeFicha;
  fuentes: readonly string[];
}): string {
  const { autor, cambios, primeraVez, valores, fuentes } = opts;
  const partes: string[] = [`<p><strong>Ficha del cliente confirmada en Nexus</strong> por ${escaparHtml(autor)}.</p>`];
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
 * campos internos y cada recorte va dicho en el propio texto, para que el agente no lo cite.
 * Devuelve "" si no hay nada confirmado: un agente no tiene por qué enterarse de una ficha vacía.
 */
export function fichaParaPrompt(ficha: FichaGuardada, opts: { paraDocumentoDelCliente: boolean }): string {
  if (!ficha.confirmadaAt) return "";
  const lineas: string[] = [];
  for (const campo of CAMPOS_DE_LA_FICHA) {
    if (opts.paraDocumentoDelCliente && !campo.alCliente) continue;
    const bruto = ficha.valores[campo.clave].trim();
    const valor = campo.destino.tipo === "lista" ? etiquetaDeApertura(bruto) : bruto;
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
