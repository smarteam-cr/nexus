/**
 * lib/hubspot/empresa.ts — el espejo de los datos de la empresa con su empresa en HubSpot (R2). PURO.
 *
 * Un solo módulo que dice, dato por dato, qué propiedad de HubSpot es, quién manda, en qué sentido va y cómo se escribe
 * el valor allá. Sale del catálogo de los datos de la empresa (lib/clients/datos-de-la-empresa.ts): la propiedad vive
 * ahí, junto al dato, para que no haya dos listas. Lo leen el que escribe (lib/clients/escritura-en-hubspot-server.ts),
 * la copia de cada hora (lib/clients/copia-de-hubspot-server.ts), la carga inicial y el script que crea las propiedades
 * (scripts/hubspot-crear-propiedades-empresa.ts).
 *
 * Dos banderas, apagadas salvo "1": `EMPRESA_HUBSPOT_ESCRITURA` (Nexus escribe en HubSpot lo que decide la persona y
 * lo que calcula Nexus; `escrituraHabilitada`) y `EMPRESA_HUBSPOT_COPIA` (lo que cambia en HubSpot vuelve a Nexus cada
 * hora; la lee lib/jobs/requisitos.ts, como toda bandera de un job). Se prenden DESPUÉS de crear las propiedades nuevas
 * con el script, y la escritura masiva va primero con 5 empresas.
 *
 * La regla (docs/empresa-datos-hubspot-plan.md, decisión 6):
 *   - lo que CALCULA Nexus (TAM, Insider, el siguiente caso) se escribe siempre que cambie;
 *   - lo que decide una persona se escribe cuando ella lo usa o lo edita;
 *   - lo estándar de HubSpot (empleados, facturación, país) se escribe cuando una persona lo decidió, o si en HubSpot
 *     está vacío; si HubSpot tiene un valor, Nexus solo lo propone;
 *   - lo que viene DE HubSpot no se vuelve a escribir (sería un eco).
 * El valor que tenía HubSpot antes se guarda en la fila de la decisión (`PropuestaDeDato.hubspotAnterior`); el script de
 * vuelta (scripts/hubspot-empresa-volver-atras.ts) lo lee de ahí.
 */
import { CATALOGO_DE_DATOS, datoDeLaEmpresa, leerValor, type ClaveDeDato, type DatoDeLaEmpresa, type FuenteDeDato, type ValorDeDato } from "@/lib/clients/datos-de-la-empresa";
import { CATALOGO_DE_CASOS } from "@/lib/casos-de-uso/catalogo";

export const GRUPO_NEXUS_EMPRESA = { name: "nexus_empresa", label: "Nexus · Empresa" } as const;

/** Nexus escribe en HubSpot. Apagada salvo "1". */
export function escrituraHabilitada(env: Record<string, string | undefined> = process.env): boolean {
  return env.EMPRESA_HUBSPOT_ESCRITURA === "1";
}

export interface CampoDelEspejo {
  clave: ClaveDeDato;
  propiedad: string;
  existe: boolean;
  sentido: "escribe" | "los_dos" | "lee";
  manda: DatoDeLaEmpresa["manda"];
}

/** El espejo: los datos que tienen propiedad en HubSpot. */
export const ESPEJO_DE_LA_EMPRESA: readonly CampoDelEspejo[] = CATALOGO_DE_DATOS.flatMap((d) =>
  d.hubspot ? [{ clave: d.clave, propiedad: d.hubspot.propiedad, existe: d.hubspot.existe, sentido: d.hubspot.sentido, manda: d.manda }] : [],
);

/** Las propiedades que se LEEN de la empresa de HubSpot para la carga inicial y la copia (sentido `lee` o `los_dos`). */
export const PROPIEDADES_QUE_SE_LEEN: readonly string[] = ESPEJO_DE_LA_EMPRESA.filter((c) => c.existe && c.sentido !== "escribe").map((c) => c.propiedad);

/** El dato de Nexus de una propiedad que se lee (`numberofemployees` → `empleados`). */
export function datoDeLaPropiedad(propiedad: string): ClaveDeDato | null {
  return ESPEJO_DE_LA_EMPRESA.find((c) => c.propiedad === propiedad && c.sentido !== "escribe")?.clave ?? null;
}

// ── El valor allá ────────────────────────────────────────────────────────────────────────────────

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * El valor interno de una opción en una propiedad NUEVA de HubSpot: sin tildes ni espacios («con equipo» → «con_equipo»,
 * «única» → «unica»). HubSpot guarda y filtra por ese valor, así que va sin sorpresas de codificación. Las listas que ya
 * existían (la industria de Smarteam, la apertura) conservan su valor tal cual está en el portal.
 */
export function claveDeOpcion(valor: string): string {
  return sinTildes(valor).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Las opciones del dato se escriben con su clave solo en las propiedades que crea Nexus. */
function usaClaveDeOpcion(d: DatoDeLaEmpresa): boolean {
  return d.tipo === "opcion" && !!d.hubspot && !d.hubspot.existe;
}

/** Cómo se escribe en HubSpot el valor de un dato. */
export function valorParaHubspot(clave: ClaveDeDato, valor: ValorDeDato): string {
  const d = datoDeLaEmpresa(clave);
  if (typeof valor === "number") return d.tipo === "entero" ? String(Math.round(valor)) : String(Math.round(valor * 100) / 100);
  return usaClaveDeOpcion(d) ? claveDeOpcion(valor) : valor;
}

/** Lo que llega de HubSpot, al valor de Nexus (null = vacío o algo que no se entiende: no se usa). */
export function valorDesdeHubspot(clave: ClaveDeDato, crudo: string | null | undefined): ValorDeDato | null {
  if (crudo === null || crudo === undefined || crudo.trim() === "") return null;
  const d = datoDeLaEmpresa(clave);
  if (usaClaveDeOpcion(d)) {
    const op = d.opciones?.find((o) => claveDeOpcion(o.valor) === crudo.trim());
    return op ? op.valor : null;
  }
  const l = leerValor(d, d.tipo === "entero" || d.tipo === "dinero" ? Number(crudo) : crudo);
  return l.ok ? l.valor : null;
}

// ── Qué se escribe ───────────────────────────────────────────────────────────────────────────────

export interface EntradaDeLaEscritura {
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
  /** Lo que tiene hoy la propiedad en HubSpot ("" o null = vacía). */
  enHubspot: string | null;
}

/** Las fuentes que son una persona: en Nexus, el vendedor en la preventa o el test. */
const DECIDIO_UNA_PERSONA: ReadonlySet<FuenteDeDato> = new Set(["persona", "preventa", "test"]);

/**
 * La propiedad y el valor que se escriben en HubSpot para un dato, o null si no corresponde. No escribe: lo usa el que
 * escribe (lib/clients/escritura-en-hubspot.ts), que además respeta la bandera.
 */
export function queSeEscribe(e: EntradaDeLaEscritura): { propiedad: string; valor: string } | null {
  const campo = ESPEJO_DE_LA_EMPRESA.find((c) => c.clave === e.clave);
  if (!campo || campo.sentido === "lee" || e.valor === null || e.fuente === null) return null;
  // Lo que vino de HubSpot no vuelve a HubSpot: sería un eco.
  if (e.fuente === "hubspot") return null;
  const valor = valorParaHubspot(e.clave, e.valor);
  const enHs = (e.enHubspot ?? "").trim();
  if (enHs === valor || (typeof e.valor === "number" && enHs !== "" && Number(enHs) === e.valor)) return null;
  const vacioEnHubspot = enHs === "";
  const decidioUnaPersona = DECIDIO_UNA_PERSONA.has(e.fuente);
  if (campo.manda === "nexus") return e.fuente === "nexus" || decidioUnaPersona ? { propiedad: campo.propiedad, valor } : null;
  if (campo.manda === "persona") return decidioUnaPersona || vacioEnHubspot ? { propiedad: campo.propiedad, valor } : null;
  // manda HubSpot: lo de una persona se escribe; lo de la IA, solo si allá está vacío.
  return decidioUnaPersona || vacioEnHubspot ? { propiedad: campo.propiedad, valor } : null;
}

/** Una fecha como la quiere una propiedad de fecha de HubSpot (el día, sin hora): el día de Costa Rica, no el de UTC. */
export function fechaParaHubspot(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(d);
}

/** Las propiedades que acompañan al TAM: de dónde salió y cuándo. */
export function propiedadesDelTam(fuente: FuenteDeDato, at: Date): { propiedad: string; valor: string }[] {
  return [
    { propiedad: "nexus_tam_fuente", valor: fuente === "nexus" ? "nexus" : "persona" },
    { propiedad: "nexus_tam_fecha", valor: fechaParaHubspot(at) },
  ];
}

// ── Las propiedades nuevas ───────────────────────────────────────────────────────────────────────

export type Definicion = {
  name: string;
  label: string;
  type: "enumeration" | "date";
  fieldType: "select" | "date";
  description: string;
  groupName: string;
  displayOrder: number;
  options?: { label: string; value: string; displayOrder: number }[];
  /** Qué la llena. `ahora` = algo de Nexus ya la escribe; lo demás, cuando exista su fuente (la propiedad queda vacía). */
  quienLaLlena: "ahora" | "la escala (B2 o N2)" | "la lectura de preparación (N6)" | "lo que le falta comprar (R12)";
};

/** Los niveles de la escala, como opciones (`nexus_nivel_*`). */
const NIVELES = [
  ["deficiente", "Deficiente"],
  ["inicial", "Inicial"],
  ["funcional", "Funcional"],
  ["eficiente", "Eficiente"],
  ["optimo", "Óptimo"],
  ["sin_evaluar", "Sin evaluar"],
] as const;

const desc = (texto: string) => `${texto} Lo escribe Nexus (lib/hubspot/empresa.ts); cámbialo en la ficha de la empresa en Nexus.`;

/**
 * Las 14 propiedades nuevas de la empresa, en el grupo «Nexus · Empresa»: listas y fechas, nunca texto libre
 * (docs/empresa-datos-hubspot-plan.md, decisión 5). El plan las contaba 13: «el perfil de negocio» son dos (cómo cierra
 * y qué pasa después). El orden es el de la ficha.
 */
export function definicionesDeLasPropiedadesNuevas(): Definicion[] {
  let orden = 0;
  const base = (name: string, label: string, description: string, quienLaLlena: Definicion["quienLaLlena"]) => ({
    name,
    label,
    description: desc(description),
    groupName: GRUPO_NEXUS_EMPRESA.name,
    displayOrder: ++orden,
    quienLaLlena,
  });
  const lista = (b: ReturnType<typeof base>, opciones: readonly (readonly [string, string])[]): Definicion => ({
    ...b,
    type: "enumeration",
    fieldType: "select",
    options: opciones.map(([value, label], i) => ({ value, label, displayOrder: i + 1 })),
  });
  const fecha = (b: ReturnType<typeof base>): Definicion => ({ ...b, type: "date", fieldType: "date" });
  const deDato = (clave: ClaveDeDato, quien: Definicion["quienLaLlena"] = "ahora"): Definicion => {
    const d = datoDeLaEmpresa(clave);
    return lista(
      base(d.hubspot!.propiedad, d.etiqueta, d.ayuda, quien),
      (d.opciones ?? []).map((o) => [claveDeOpcion(o.valor), o.etiqueta] as const),
    );
  };
  return [
    lista(base("nexus_tam_fuente", "Cómo se calculó el TAM", "De dónde salió el TAM | Potencial.", "ahora"), [
      ["nexus", "Calculado por Nexus (estimado v1)"],
      ["persona", "Corregido por una persona"],
    ]),
    fecha(base("nexus_tam_fecha", "Fecha del TAM", "Cuándo se calculó o corrigió el TAM.", "ahora")),
    fecha(base("nexus_investigacion_fecha", "Fecha de la investigación", "Cuándo Nexus investigó la empresa en la web.", "ahora")),
    deDato("aQuienVende"),
    deDato("perfilCierre"),
    deDato("perfilDespues"),
    deDato("trafico"),
    deDato("baseConsentimiento"),
    deDato("calificaInsider", "la lectura de preparación (N6)"),
    lista(base("nexus_nivel_ventas", "Nivel en Ventas", "La última posición confirmada en la Escala de Rendimiento, en Ventas.", "la escala (B2 o N2)"), NIVELES),
    lista(base("nexus_nivel_marketing", "Nivel en Marketing", "La última posición confirmada en la Escala de Rendimiento, en Marketing.", "la escala (B2 o N2)"), NIVELES),
    lista(base("nexus_nivel_servicio", "Nivel en Servicio", "La última posición confirmada en la Escala de Rendimiento, en Servicio.", "la escala (B2 o N2)"), NIVELES),
    fecha(base("nexus_escala_fecha", "Fecha de la posición en la escala", "Cuándo se confirmó la posición en la escala.", "la escala (B2 o N2)")),
    lista(
      base("nexus_siguiente_caso", "Siguiente caso sugerido", "El caso de uso que más movería a la empresa y que todavía no tiene.", "lo que le falta comprar (R12)"),
      CATALOGO_DE_CASOS.map((c) => [c.id.replace(/-/g, "_"), c.titulo.slice(0, 100)] as const),
    ),
  ];
}

/** El valor de `nexus_siguiente_caso` para un caso del catálogo. */
export function valorDelSiguienteCaso(casoId: string): string {
  return casoId.replace(/-/g, "_");
}

/** Las 14 propiedades nuevas, por nombre. */
export const PROPIEDADES_NUEVAS: readonly string[] = definicionesDeLasPropiedadesNuevas().map((d) => d.name);
