/**
 * lib/hubspot/empresa.ts — el espejo de los datos de la empresa con su empresa en HubSpot (R2, preparado el 2026-10-24).
 * PURO.
 *
 * Un solo módulo que dice, dato por dato, qué propiedad de HubSpot es, quién manda y en qué sentido va. Sale del catálogo
 * de los datos de la empresa (lib/clients/datos-de-la-empresa.ts): la propiedad vive ahí, junto al dato, para que no
 * haya dos listas. Va a reemplazar las cinco listas de lectura de hoy y la escritura de la ficha.
 *
 * ⛔ HOY NO ESCRIBE NADA. Escribir en HubSpot espera al transporte único (U6, lib/hubspot/client.ts de la sesión de
 * HubSpot) y queda detrás de `EMPRESA_HUBSPOT_ESCRITURA` (apagada: `escrituraHabilitada()` da false salvo "1"). Lo que
 * está acá es la regla de qué se escribiría (`queSeEscribe`), probada, y las definiciones de las propiedades nuevas para
 * el script que las crea (scripts/hubspot-crear-propiedades-empresa.ts, en simulacro y con el sí de Elías).
 *
 * La regla (docs/empresa-datos-hubspot-plan.md, decisión 6):
 *   - lo que CALCULA Nexus (TAM, Insider) se escribe siempre que cambie;
 *   - lo que decide una persona se escribe cuando ella lo usa o lo edita;
 *   - lo estándar de HubSpot (empleados, facturación, país) se escribe cuando una persona lo decidió, o si en HubSpot
 *     está vacío; si HubSpot tiene un valor, Nexus solo lo propone;
 *   - lo que viene DE HubSpot no se vuelve a escribir (sería un eco).
 * El valor anterior se guarda SOLO en `PropuestaDeDato.valorAnterior` (el script de vuelta lo lee de ahí).
 */
import { CATALOGO_DE_DATOS, type ClaveDeDato, type DatoDeLaEmpresa, type FuenteDeDato, type ValorDeDato } from "@/lib/clients/datos-de-la-empresa";

export const GRUPO_NEXUS_EMPRESA = { name: "nexus_empresa", label: "Nexus · Empresa" } as const;

/** La bandera. Apagada salvo "1". */
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

export interface EntradaDeLaEscritura {
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
  /** Lo que tiene hoy la propiedad en HubSpot ("" o null = vacía). */
  enHubspot: string | null;
}

/**
 * La propiedad y el valor que se escribirían en HubSpot para un dato, o null si no corresponde. No escribe: el que
 * escriba (después de U6) llama a esto y respeta `escrituraHabilitada()`.
 */
export function queSeEscribe(e: EntradaDeLaEscritura): { propiedad: string; valor: string } | null {
  const campo = ESPEJO_DE_LA_EMPRESA.find((c) => c.clave === e.clave);
  if (!campo || campo.sentido === "lee" || e.valor === null || e.fuente === null) return null;
  // Lo que vino de HubSpot no vuelve a HubSpot: sería un eco.
  if (e.fuente === "hubspot") return null;
  const valor = String(e.valor);
  if ((e.enHubspot ?? "").trim() === valor) return null;
  const vacioEnHubspot = (e.enHubspot ?? "").trim() === "";
  const decidioUnaPersona = e.fuente === "persona" || e.fuente === "preventa" || e.fuente === "test";
  if (campo.manda === "nexus") return e.fuente === "nexus" || decidioUnaPersona ? { propiedad: campo.propiedad, valor } : null;
  if (campo.manda === "persona") return decidioUnaPersona || vacioEnHubspot ? { propiedad: campo.propiedad, valor } : null;
  // manda HubSpot: lo de una persona se escribe; lo de la IA, solo si allá está vacío.
  return decidioUnaPersona || vacioEnHubspot ? { propiedad: campo.propiedad, valor } : null;
}

/** Las propiedades nuevas del paso uno (docs/empresa-datos-hubspot-plan.md › etapa 1): solo las que algo llena ahora. */
export const PROPIEDADES_NUEVAS_DEL_PASO_UNO: readonly string[] = [
  "nexus_tam_fuente",
  "nexus_tam_fecha",
  "nexus_investigacion_fecha",
  "nexus_a_quien_vende",
  "nexus_perfil_cierre",
  "nexus_perfil_despues",
  "nexus_trafico",
  "nexus_base_consentimiento",
];

type Definicion = { name: string; label: string; type: "enumeration" | "date"; fieldType: "select" | "date"; description: string; options?: { label: string; value: string }[] };

/** Las definiciones que crearía el script, con su tipo de reporte (lista o fecha, nunca texto libre). */
export function definicionesDelPasoUno(): Definicion[] {
  const desc = (texto: string) => `${texto} Lo escribe Nexus (lib/hubspot/empresa.ts); no lo edites a mano: cámbialo en la ficha de Nexus.`;
  const deDato = (clave: ClaveDeDato): Definicion => {
    const d = CATALOGO_DE_DATOS.find((x) => x.clave === clave)!;
    return {
      name: d.hubspot!.propiedad,
      label: d.etiqueta,
      type: "enumeration",
      fieldType: "select",
      description: desc(d.ayuda),
      options: (d.opciones ?? []).map((o) => ({ label: o.etiqueta, value: o.valor })),
    };
  };
  return [
    {
      name: "nexus_tam_fuente",
      label: "Cómo se calculó el TAM",
      type: "enumeration",
      fieldType: "select",
      description: desc("De dónde salió el TAM | Potencial."),
      options: [
        { label: "Calculado por Nexus (estimado v1)", value: "nexus" },
        { label: "Corregido por una persona", value: "persona" },
      ],
    },
    { name: "nexus_tam_fecha", label: "Fecha del TAM", type: "date", fieldType: "date", description: desc("Cuándo se calculó o corrigió el TAM.") },
    { name: "nexus_investigacion_fecha", label: "Fecha de la investigación", type: "date", fieldType: "date", description: desc("Cuándo Nexus investigó la empresa en la web.") },
    deDato("aQuienVende"),
    deDato("perfilCierre"),
    deDato("perfilDespues"),
    deDato("trafico"),
    deDato("baseConsentimiento"),
  ];
}
