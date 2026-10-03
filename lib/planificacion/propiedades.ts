/**
 * lib/planificacion/propiedades.ts — las PROPIEDADES POR OBJETO de la Planificación (2026-10-02).
 *
 * Vivían en Ejecución («Arquitectura de propiedades», con la tabla de la integración). Pasaron a la
 * Planificación porque son parte de lo que va a quedar configurado en HubSpot y se le muestran al
 * cliente antes de configurar.
 *
 * ── PENSADA PARA LAS PLANTILLAS DE CAROLINE ───────────────────────────────────
 * Caroline trabaja con dos plantillas de Excel de propiedades y va a mandar un prototipo. Sin haberlas
 * visto, la fila se arma para recibirlas sin perder nada:
 *   · campos propios para lo que trae cualquier plantilla de propiedades (objeto, grupo, etiqueta,
 *     nombre interno, tipo, opciones, obligatoria, estado, para qué);
 *   · `id` y `autor` por fila, FUERA del esquema del agente;
 *   · `extra`: las columnas de la plantilla que no tengan campo propio (fuera del esquema).
 *
 * ── REGENERAR NO BORRA LO DE UNA PERSONA ─────────────────────────────────────
 * `coerceToSchema` rehace cada fila solo con las claves del esquema, y `preserveNonSchemaKeys` mira
 * el primer nivel: regenerar reemplazaba la tabla entera. `fusionarFilas` deja intactas las filas de
 * una persona o de una plantilla y reemplaza solo las del agente.
 *
 * Puro: lo usan el renderer, el runner, la migración y las pruebas.
 */

export type AutorDeFila = "ia" | "persona" | "plantilla";

export interface FilaPropiedad {
  /** Fuera del esquema: identidad estable para editar e importar sin duplicar. */
  id?: string;
  /** Fuera del esquema: quién la escribió. Las de una persona o una plantilla sobreviven al regenerar. */
  autor?: AutorDeFila;
  /** Contacto | Empresa | Lead | Negocio | Ticket | objeto personalizado. */
  objeto: string;
  /** Grupo de propiedades en HubSpot («Información de admisión»). */
  grupo?: string;
  /** Lo que ve el usuario en HubSpot. */
  etiqueta: string;
  /** Nombre interno; «⚠️ Por validar» si no está decidido. */
  campo: string;
  tipo: string;
  /** Opciones de un desplegable o de casillas, separadas por «·» o «,». */
  opciones?: string;
  obligatoria?: string;
  /** nueva | existente | ajustar. */
  estado?: string;
  /** Para qué existe, sin jerga. */
  uso?: string;
  /** acordado | propuesta | supuesto (lib/planificacion/origen.ts). */
  origen?: string;
  /** La reunión que lo respalda. */
  fuente?: string;
  /** De la tabla de la integración (Desarrollo/Ejecución). Fuera del esquema del agente. */
  sistema?: string;
  direccion?: string;
  esLlave?: string;
  /** Columnas de una plantilla que no tienen campo propio. Fuera del esquema. */
  extra?: Record<string, string>;
}

export interface PropiedadesData {
  intro?: string;
  filas: FilaPropiedad[];
}

/** Los tipos de campo de HubSpot, en español. El valor viejo de la tabla de integración se mapea abajo. */
export const TIPOS_DE_PROPIEDAD = [
  { value: "texto", label: "Texto de una línea" },
  { value: "texto_largo", label: "Texto de varias líneas" },
  { value: "numero", label: "Número" },
  { value: "moneda", label: "Moneda" },
  { value: "fecha", label: "Fecha" },
  { value: "fecha_hora", label: "Fecha y hora" },
  { value: "desplegable", label: "Desplegable" },
  { value: "opcion_unica", label: "Botones de opción" },
  { value: "casillas", label: "Casillas múltiples" },
  { value: "casilla", label: "Casilla única (sí/no)" },
  { value: "telefono", label: "Teléfono" },
  { value: "archivo", label: "Archivo" },
  { value: "usuario", label: "Usuario de HubSpot" },
  { value: "calculo", label: "Cálculo" },
] as const;

export const ESTADOS_DE_PROPIEDAD = [
  { value: "nueva", label: "Nueva" },
  { value: "existente", label: "Existente" },
  { value: "ajustar", label: "Ajustar" },
] as const;

/** Orden de las pestañas. Un objeto personalizado va después, en el orden en que aparece. */
export const OBJETOS_ESTANDAR = ["Contacto", "Empresa", "Lead", "Negocio", "Ticket"] as const;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** «contacts», «Contactos», «deal», «Negocios»… → el nombre de la pestaña. Uno desconocido queda como vino. */
export function normalizarObjeto(o: unknown): string {
  if (typeof o !== "string") return "";
  const t = sinTildes(o).trim().toLowerCase();
  if (!t) return "";
  if (/^contact/.test(t)) return "Contacto";
  if (/^(empresa|compan)/.test(t)) return "Empresa";
  if (/^lead/.test(t)) return "Lead";
  if (/^(negocio|deal|oportunidad)/.test(t)) return "Negocio";
  if (/^ticket/.test(t)) return "Ticket";
  return o.trim();
}

/** Los objetos presentes en las filas, estándar primero y después los personalizados. */
export function objetosDe(filas: readonly FilaPropiedad[], incluirEstandar = false): string[] {
  const presentes = new Set(filas.map((f) => normalizarObjeto(f.objeto)).filter(Boolean));
  const estandar = OBJETOS_ESTANDAR.filter((o) => incluirEstandar || presentes.has(o));
  const otros = [...presentes].filter((o) => !(OBJETOS_ESTANDAR as readonly string[]).includes(o));
  return [...estandar, ...otros];
}

/** Tipo viejo de la tabla de integración (texto|numero|fecha|booleano|enumeracion|moneda|id) → tipo de HubSpot. */
export function tipoDesdeTablaDeIntegracion(t: unknown): string {
  const v = typeof t === "string" ? sinTildes(t).trim().toLowerCase() : "";
  if (v === "booleano") return "casilla";
  if (v === "enumeracion") return "desplegable";
  if (v === "id") return "texto";
  return v;
}

interface FilaDeIntegracion {
  sistema?: string;
  objeto?: string;
  campo?: string;
  tipo?: string;
  direccion?: string;
  esLlave?: string;
  obligatorio?: string;
  descripcion?: string;
}

/** Las filas de la vieja «Arquitectura de propiedades» de Ejecución → filas de la Planificación. */
export function desdeTablaDeIntegracion(filas: readonly FilaDeIntegracion[], autor: AutorDeFila): FilaPropiedad[] {
  return filas
    .filter((f) => (f.campo ?? "").trim() || (f.descripcion ?? "").trim())
    .map((f, i) => ({
      id: `mig-${i + 1}`,
      autor,
      objeto: normalizarObjeto(f.objeto),
      etiqueta: "",
      campo: (f.campo ?? "").trim(),
      tipo: tipoDesdeTablaDeIntegracion(f.tipo),
      obligatoria: f.obligatorio ?? "",
      estado: "nueva",
      uso: f.descripcion ?? "",
      origen: "",
      fuente: "",
      ...(f.sistema && f.sistema.trim().toLowerCase() !== "hubspot" ? { sistema: f.sistema } : {}),
      ...(f.direccion ? { direccion: f.direccion } : {}),
      ...(f.esLlave ? { esLlave: f.esLlave } : {}),
    }));
}

/** Cómo se reconoce la misma propiedad entre dos versiones: objeto + nombre interno (o etiqueta). */
export function claveDeFila(f: FilaPropiedad): string {
  const nombre = (f.campo ?? "").replace(/[`⚠️]/g, "").trim() || (f.etiqueta ?? "").trim();
  const n = sinTildes(nombre).toLowerCase().replace(/por validar/g, "").replace(/\s+/g, " ").trim();
  return `${normalizarObjeto(f.objeto).toLowerCase()}|${n}`;
}

let contador = 0;
/** Id corto y suficiente para distinguir filas dentro de una sección. */
export function nuevoIdDeFila(): string {
  contador = (contador + 1) % 1_000_000;
  return `p${Date.now().toString(36)}${contador.toString(36)}`;
}

const esDeUnaPersona = (f: FilaPropiedad) => f.autor === "persona" || f.autor === "plantilla";

/**
 * Lo que queda después de regenerar: las filas de una persona o de una plantilla, intactas y en su
 * lugar; las del agente, reemplazadas por las nuevas. Una nueva que repite una propiedad que ya
 * escribió una persona se descarta (manda la persona). Una nueva que coincide con una vieja del agente
 * hereda su id, así no cambia de identidad entre versiones.
 */
export function fusionarFilas(previas: readonly FilaPropiedad[], nuevas: readonly FilaPropiedad[]): FilaPropiedad[] {
  const conservadas = previas.filter(esDeUnaPersona);
  const tomadas = new Set(conservadas.map(claveDeFila));
  const idPorClave = new Map(previas.filter((f) => !esDeUnaPersona(f) && f.id).map((f) => [claveDeFila(f), f.id!]));
  const agregadas: FilaPropiedad[] = [];
  for (const n of nuevas) {
    const clave = claveDeFila(n);
    if (tomadas.has(clave)) continue;
    tomadas.add(clave);
    agregadas.push({ ...n, objeto: normalizarObjeto(n.objeto), autor: "ia", id: idPorClave.get(clave) ?? n.id ?? nuevoIdDeFila() });
  }
  // Agrupadas por objeto, en el orden de las pestañas; dentro de cada objeto, las de la persona primero.
  const orden = objetosDe([...conservadas, ...agregadas]);
  const pos = (f: FilaPropiedad) => {
    const i = orden.indexOf(normalizarObjeto(f.objeto));
    return i < 0 ? orden.length : i;
  };
  return [...conservadas, ...agregadas]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => pos(a.f) - pos(b.f) || a.i - b.i)
    .map((x) => x.f);
}
