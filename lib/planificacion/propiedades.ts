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
  /** «si» si aparece en la ficha del registro (lo que el Brief llama «tarjeta de visualización»). Fuera del esquema. */
  enFicha?: string;
}

/**
 * Un grupo de propiedades de un objeto (2026-10-25, el Brief de implementación). Las filas dicen su
 * grupo por nombre; esta lista guarda el ORDEN de los grupos y los que todavía no tienen propiedades.
 * Fuera del esquema del agente: `preserveNonSchemaKeys` la conserva al regenerar.
 */
export interface GrupoDePropiedades {
  objeto: string;
  nombre: string;
}

export interface PropiedadesData {
  intro?: string;
  filas: FilaPropiedad[];
  grupos?: GrupoDePropiedades[];
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
  /* 2026-10-25 — las que trae HubSpot (nombre, correo, etapa del ciclo de vida): en el Brief dicen «N/A»
     como tipo. Se planifican igual porque deciden qué se ve en la ficha y qué pide un formulario. */
  { value: "hubspot", label: "Viene con HubSpot" },
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
  /* «⚠️ Por validar» NO es un nombre: cuenta como vacío y manda la etiqueta. Antes se limpiaba DESPUÉS de elegir, así
     que todas las «Por validar» de un objeto tenían la misma clave: al regenerar quedaba una sola, y «Mejorar con IA» o
     el chat le daban a una la identidad de otra (2026-10-25, lo encontró la revisión). */
  const limpio = (v: unknown) =>
    sinTildes(typeof v === "string" ? v : "").replace(/[`⚠️]/g, "").toLowerCase().replace(/por (validar|definir)/g, "").replace(/\s+/g, " ").trim();
  return `${normalizarObjeto(f.objeto).toLowerCase()}|${limpio(f.campo) || limpio(f.etiqueta)}`;
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

/* ── Grupos, ficha y plantilla de importación (2026-10-25, el Brief de implementación) ──────────────
   El Brief ordena las propiedades de cada objeto por grupos («Información del contacto»,
   «Clasificación de registro»…) y marca cuáles se ven en la ficha. Acá viven el orden de los grupos,
   lo que se muestra en la ficha y la plantilla que el cliente llena para importar su base. */

const mismoObjeto = (a: unknown, b: string) => normalizarObjeto(a) === b;
const nombreDeGrupo = (g: unknown) => (typeof g === "string" ? g.trim() : "");
const esSi = (v: unknown) => typeof v === "string" && /^(si|sí|yes|true|x)$/i.test(v.trim());

/** Una fila que tocó una persona pasa a ser suya (regenerar ya no la reemplaza). Una de plantilla sigue siéndolo. */
export function tocadaPorUnaPersona(f: FilaPropiedad): FilaPropiedad {
  return { ...f, id: f.id ?? nuevoIdDeFila(), autor: f.autor === "plantilla" ? "plantilla" : "persona" };
}

/**
 * Los grupos de un objeto, en orden: primero los de la lista guardada, después los que solo dicen las
 * filas (en el orden en que aparecen). «» (sin grupo) va al final, y solo si alguna fila no tiene grupo.
 */
export function gruposDe(data: Pick<PropiedadesData, "filas" | "grupos">, objeto: string): string[] {
  const vistos = new Set<string>();
  const orden: string[] = [];
  const sumar = (n: string) => {
    if (!n || vistos.has(n.toLowerCase())) return;
    vistos.add(n.toLowerCase());
    orden.push(n);
  };
  for (const g of data.grupos ?? []) if (mismoObjeto(g.objeto, objeto)) sumar(nombreDeGrupo(g.nombre));
  const filas = (data.filas ?? []).filter((f) => mismoObjeto(f.objeto, objeto));
  for (const f of filas) sumar(nombreDeGrupo(f.grupo));
  if (filas.some((f) => !nombreDeGrupo(f.grupo))) orden.push("");
  return orden;
}

/** La lista de grupos de los demás objetos, intacta, más la de este objeto con el orden que se pasa. */
function conGruposDe(data: PropiedadesData, objeto: string, nombres: string[]): GrupoDePropiedades[] {
  const otros = (data.grupos ?? []).filter((g) => !mismoObjeto(g.objeto, objeto));
  return [...otros, ...nombres.filter(Boolean).map((nombre) => ({ objeto, nombre }))];
}

export function agregarGrupo(data: PropiedadesData, objeto: string, nombre: string): PropiedadesData {
  const n = nombre.trim();
  const actuales = gruposDe(data, objeto).filter(Boolean);
  if (!n || actuales.some((g) => g.toLowerCase() === n.toLowerCase())) return data;
  return { ...data, grupos: conGruposDe(data, objeto, [...actuales, n]) };
}

/** Renombra el grupo en la lista y en cada fila del objeto que lo usa. Renombrar a uno que ya existe los junta. */
export function renombrarGrupo(data: PropiedadesData, objeto: string, viejo: string, nuevo: string): PropiedadesData {
  const n = nuevo.trim();
  if (!n || n === viejo) return data;
  const iguales = (g: unknown) => nombreDeGrupo(g).toLowerCase() === viejo.toLowerCase();
  const nombres = gruposDe(data, objeto).filter(Boolean);
  const yaExiste = nombres.some((g) => g.toLowerCase() === n.toLowerCase() && !iguales(g));
  const orden = yaExiste ? nombres.filter((g) => !iguales(g)) : nombres.map((g) => (iguales(g) ? n : g));
  return {
    ...data,
    grupos: conGruposDe(data, objeto, orden),
    filas: data.filas.map((f) => (mismoObjeto(f.objeto, objeto) && iguales(f.grupo) ? tocadaPorUnaPersona({ ...f, grupo: n }) : f)),
  };
}

/** Cambia de lugar un grupo dentro de su objeto. */
export function moverGrupo(data: PropiedadesData, objeto: string, nombre: string, delta: -1 | 1): PropiedadesData {
  const nombres = gruposDe(data, objeto).filter(Boolean);
  const i = nombres.findIndex((g) => g.toLowerCase() === nombre.toLowerCase());
  const j = i + delta;
  if (i < 0 || j < 0 || j >= nombres.length) return data;
  const orden = [...nombres];
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return { ...data, grupos: conGruposDe(data, objeto, orden) };
}

/** Quita el grupo: sus propiedades quedan sin grupo, no se borran. */
export function quitarGrupo(data: PropiedadesData, objeto: string, nombre: string): PropiedadesData {
  const iguales = (g: unknown) => nombreDeGrupo(g).toLowerCase() === nombre.toLowerCase();
  return {
    ...data,
    grupos: conGruposDe(data, objeto, gruposDe(data, objeto).filter((g) => g && !iguales(g))),
    filas: data.filas.map((f) => (mismoObjeto(f.objeto, objeto) && iguales(f.grupo) ? tocadaPorUnaPersona({ ...f, grupo: "" }) : f)),
  };
}

/** Las opciones de una lista, una por elemento. Separadas por renglón o «·»; si no hay ninguno de los dos, por coma. */
export function opcionesDe(v: unknown): string[] {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t || t.startsWith("⚠️")) return [];
  const partes = /[\n·]/.test(t) ? t.split(/\s*[\n·]\s*/) : t.split(/\s*,\s*/);
  return partes.map((p) => p.trim()).filter(Boolean);
}

/** Las filas de un objeto en el orden de la ficha: por grupo (en su orden) y, dentro, como están. */
export function filasEnOrdenDeFicha(data: Pick<PropiedadesData, "filas" | "grupos">, objeto: string): FilaPropiedad[] {
  const filas = (data.filas ?? []).filter((f) => mismoObjeto(f.objeto, objeto));
  const grupos = gruposDe(data, objeto).map((g) => g.toLowerCase());
  const pos = (f: FilaPropiedad) => grupos.indexOf(nombreDeGrupo(f.grupo).toLowerCase());
  return filas.map((f, i) => ({ f, i })).sort((a, b) => pos(a.f) - pos(b.f) || a.i - b.i).map((x) => x.f);
}

/** La ficha de un objeto: los grupos con las propiedades marcadas «en la ficha». Sin ninguna marcada, vacía. */
export function fichaDe(data: Pick<PropiedadesData, "filas" | "grupos">, objeto: string): Array<{ grupo: string; propiedades: string[] }> {
  const out: Array<{ grupo: string; propiedades: string[] }> = [];
  for (const f of filasEnOrdenDeFicha(data, objeto)) {
    if (!esSi(f.enFicha)) continue;
    const nombre = (f.etiqueta || f.campo || "").trim();
    if (!nombre) continue;
    const g = nombreDeGrupo(f.grupo);
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.grupo === g) ultimo.propiedades.push(nombre);
    else out.push({ grupo: g, propiedades: [nombre] });
  }
  return out;
}

/** Lo que no se importa: un cálculo lo arma HubSpot y un archivo no viaja en una planilla. */
const NO_SE_IMPORTA = new Set(["calculo", "archivo"]);

const celdaCsv = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Las columnas de la plantilla de importación de un objeto (el «PLANTILLA BD» del Brief): una por propiedad, en el
 * orden de la ficha, con la etiqueta que ve el usuario. Sale sola de la tabla de propiedades: si cambia una propiedad,
 * cambia la plantilla. Se descarga en Excel (lib/planificacion/plantilla-excel.ts): un CSV separado por comas se abre
 * en una sola columna en un Excel configurado para Costa Rica, que separa con punto y coma (2026-10-25, la revisión).
 */
export function columnasDeImportacion(data: Pick<PropiedadesData, "filas" | "grupos">, objeto: string): string[] {
  const columnas = filasEnOrdenDeFicha(data, objeto)
    .filter((f) => !NO_SE_IMPORTA.has((f.tipo ?? "").trim()))
    .map((f) => (f.etiqueta || f.campo || "").replace(/[`⚠️]/g, "").trim())
    .filter((n) => n && !/por validar/i.test(n));
  return columnas.filter((c, i) => columnas.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i);
}

/** La misma plantilla en CSV (con BOM, para las tildes): lo que se baja si el Excel no se puede armar en el navegador. */
export function plantillaDeImportacion(data: Pick<PropiedadesData, "filas" | "grupos">, objeto: string): string {
  return String.fromCharCode(0xfeff) + columnasDeImportacion(data, objeto).map(celdaCsv).join(",") + "\r\n";
}

/**
 * Lo que una propuesta de la IA o del chat no sabe que existe (la identidad y el autor de cada fila, sus
 * columnas extra, si va en la ficha, y el orden de los grupos), recuperado de la versión anterior.
 * Antes, «Mejorar con IA» y el chat devolvían la tabla con el esquema del agente y todo eso se perdía:
 * una fila de una persona pasaba a ser de la IA y el próximo regenerar la borraba. No resucita filas:
 * si el chat quitó una, queda quitada.
 */
export function conservarLoDeFuera(previo: unknown, nuevo: unknown): unknown {
  const p = (previo ?? {}) as Partial<PropiedadesData>;
  const n = (nuevo ?? {}) as Partial<PropiedadesData>;
  if (!Array.isArray(n.filas)) return nuevo;
  const previas = Array.isArray(p.filas) ? p.filas.filter((f) => f && typeof f === "object") : [];
  const porId = new Map(previas.filter((f) => f.id).map((f) => [f.id!, f]));
  const porClave = new Map(previas.map((f) => [claveDeFila(f), f]));
  const usadas = new Set<FilaPropiedad>();
  const filas = n.filas.map((f) => {
    if (!f || typeof f !== "object") return f;
    const antes = (f.id ? porId.get(f.id) : undefined) ?? porClave.get(claveDeFila(f));
    if (!antes || usadas.has(antes)) return { ...f, id: f.id ?? nuevoIdDeFila(), autor: f.autor ?? "ia" };
    usadas.add(antes);
    return {
      ...f,
      id: f.id ?? antes.id ?? nuevoIdDeFila(),
      autor: f.autor ?? antes.autor ?? "ia",
      ...(f.extra === undefined && antes.extra ? { extra: antes.extra } : {}),
      ...(f.enFicha === undefined && antes.enFicha ? { enFicha: antes.enFicha } : {}),
      ...(f.sistema === undefined && antes.sistema ? { sistema: antes.sistema } : {}),
      ...(f.direccion === undefined && antes.direccion ? { direccion: antes.direccion } : {}),
      ...(f.esLlave === undefined && antes.esLlave ? { esLlave: antes.esLlave } : {}),
    };
  });
  return { ...n, filas, ...(n.grupos === undefined && p.grupos ? { grupos: p.grupos } : {}) };
}
