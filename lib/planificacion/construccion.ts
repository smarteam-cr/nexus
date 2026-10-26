/**
 * lib/planificacion/construccion.ts — de lo planificado a lo construido (L4 etapa 5 del roadmap, 2026-10-27,
 * docs/planificacion-brief-plan.md). Puro: lo usan el panel del editor, la ruta que manda la lista a Tareas y las pruebas.
 *
 * Cada cosa que se configura en HubSpot (una propiedad, un pipeline, un formulario, una automatización, un equipo, un
 * usuario, una conversación, un informe, el ciclo de vida, las cotizaciones) lleva su ESTADO (por construir ·
 * construido) y su ENLACE al recurso en HubSpot: es el «Link de recurso» y el «Set up básico» del Brief, sin escribirlos
 * aparte.
 *
 * Dónde vive: en cada sección, en `construccion` (clave de la cosa → estado y enlace). Es una clave FUERA del esquema del
 * agente, así que regenerar, «Mejorar con IA» y el chat la conservan (`preserveNonSchemaKeys`, que copia las claves de
 * primer nivel). Sin SQL, como pide el plan. El cliente no la ve: ninguna sección la pinta en lectura.
 *
 * La clave de una cosa sale de su `id` si lo tiene, y si no de su nombre: renombrar un pipeline le pierde el estado (lo
 * dice el panel), pero regenerar con el mismo nombre no.
 *
 * La lista de construcción va a Tareas AGRUPADA (una tarea por objeto con sus propiedades, una por pipeline, por
 * formulario…): cincuenta propiedades no son cincuenta tareas. Cada grupo tiene su clave estable y la tarea se crea con
 * `origenId = planificacion:<canvas>:<grupo>`, así mandarla dos veces no la duplica.
 */
import { adoptarFormularios, adoptarInformes, adoptarUsuariosPermisos, adoptarCotizaciones, cotizacionesVacia } from "./brief";
import { adoptarAutomatizaciones, adoptarCicloDeVida, adoptarConversaciones, adoptarPipelines } from "./secciones";
import { claveDeFila, normalizarObjeto, type FilaPropiedad } from "./propiedades";

export const ESTADOS_DE_CONSTRUCCION = [
  { value: "por_construir", label: "Por construir" },
  { value: "construido", label: "Construido" },
] as const;
export type EstadoDeConstruccion = (typeof ESTADOS_DE_CONSTRUCCION)[number]["value"];

export interface MarcaDeConstruccion {
  estado?: EstadoDeConstruccion;
  /** El recurso en HubSpot (https://app.hubspot.com/…). */
  enlace?: string;
  /** Cuándo se marcó construido (ISO). */
  en?: string;
}

/** La clave fuera del esquema donde cada sección guarda lo suyo. */
export const CLAVE_DE_CONSTRUCCION = "construccion";

export type TipoDeCosa =
  | "propiedad"
  | "pipeline"
  | "formulario"
  | "automatizacion"
  | "equipo"
  | "usuario"
  | "conversacion"
  | "informe"
  | "ciclo"
  | "cotizaciones";

export interface CosaParaConstruir {
  /** La sección donde vive (y donde se guarda su marca). */
  seccion: string;
  /** Única dentro de la sección. */
  clave: string;
  tipo: TipoDeCosa;
  nombre: string;
  /** Una línea con lo que hace falta saber para construirla («Contacto · desplegable»). */
  detalle: string;
  /** El grupo con el que va a Tareas. */
  grupo: string;
  estado: EstadoDeConstruccion;
  enlace: string;
}

export interface GrupoDeConstruccion {
  clave: string;
  /** El título de la tarea, en imperativo y tuteo. */
  titulo: string;
  cosas: CosaParaConstruir[];
  construidas: number;
}

const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const lleno = (v: unknown) => txt(v).trim() !== "";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Un nombre como parte de una clave: sin tildes, minúsculas, sin signos. */
export const claveDeNombre = (v: unknown) =>
  sinTildes(txt(v))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Las marcas guardadas en una sección (lo que no tiene forma de marca se ignora). */
export function marcasDe(data: unknown): Record<string, MarcaDeConstruccion> {
  const m = (data as Record<string, unknown> | null | undefined)?.[CLAVE_DE_CONSTRUCCION];
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  const out: Record<string, MarcaDeConstruccion> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const estado = o.estado === "construido" ? "construido" : o.estado === "por_construir" ? "por_construir" : undefined;
    out[k] = { ...(estado ? { estado } : {}), ...(lleno(o.enlace) ? { enlace: txt(o.enlace).trim() } : {}), ...(lleno(o.en) ? { en: txt(o.en) } : {}) };
  }
  return out;
}

/**
 * La data de la sección con la marca de UNA cosa cambiada. Escribe sobre la data cruda: todo lo demás queda como estaba.
 * Marcar «por construir» sin enlace borra la marca (es el estado de siempre).
 */
export function conMarca(data: unknown, clave: string, cambio: Partial<MarcaDeConstruccion>, ahora: string): Record<string, unknown> {
  const base = { ...((data && typeof data === "object" ? data : {}) as Record<string, unknown>) };
  const marcas = marcasDe(base);
  const previa = marcas[clave] ?? {};
  const nueva: MarcaDeConstruccion = { ...previa, ...cambio };
  if (cambio.estado === "construido" && previa.estado !== "construido") nueva.en = ahora;
  if (cambio.estado === "por_construir") delete nueva.en;
  if (cambio.enlace !== undefined && !cambio.enlace.trim()) delete nueva.enlace;
  const vacia = (!nueva.estado || nueva.estado === "por_construir") && !nueva.enlace;
  const siguientes = { ...marcas };
  if (vacia) delete siguientes[clave];
  else siguientes[clave] = nueva;
  base[CLAVE_DE_CONSTRUCCION] = siguientes;
  return base;
}

/** ¿Es un enlace aceptable? Solo http(s): un `javascript:` en un enlace que alguien abre es un riesgo. */
export function enlaceValido(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface SeccionDeLaPlanificacion {
  key: string;
  data: unknown;
  /** Oculta para el cliente: igual se construye lo que tenga (ocultar no es descartar), pero el panel lo dice. */
  hidden?: boolean;
}

/** Las propiedades que hay que crear o ajustar: las que ya existen o vienen con HubSpot no se construyen. */
const propiedadParaConstruir = (f: FilaPropiedad) => (lleno(f.etiqueta) || lleno(f.campo)) && f.estado !== "existente" && f.estado !== "hubspot";

/** Todo lo que se construye en HubSpot, en el orden del documento, con su marca. */
export function cosasParaConstruir(secciones: readonly SeccionDeLaPlanificacion[]): CosaParaConstruir[] {
  const out: CosaParaConstruir[] = [];
  const data = (key: string) => secciones.find((s) => s.key === key)?.data;
  const con = (seccion: string, c: Omit<CosaParaConstruir, "seccion" | "estado" | "enlace">) => {
    const m = marcasDe(data(seccion))[c.clave] ?? {};
    out.push({ ...c, seccion, estado: m.estado ?? "por_construir", enlace: m.enlace ?? "" });
  };
  const vistas = new Set<string>();
  /** La clave de un ítem sin id: su nombre, y si se repite, con el orden (dos «Lead» distintos no comparten marca). */
  const unica = (seccion: string, base: string) => {
    let k = base;
    for (let i = 2; vistas.has(`${seccion}|${k}`); i++) k = `${base}~${i}`;
    vistas.add(`${seccion}|${k}`);
    return k;
  };

  // Usuarios y permisos: primero los equipos (los usuarios se asignan a uno).
  const up = adoptarUsuariosPermisos(data("usuarios_permisos"));
  for (const e of up.equipos.filter((x) => lleno(x.nombre))) {
    con("usuarios_permisos", {
      clave: unica("usuarios_permisos", `equipo:${e.id ?? claveDeNombre(e.nombre)}`),
      tipo: "equipo",
      nombre: e.nombre.trim(),
      detalle: "Equipo con su conjunto de permisos",
      grupo: "usuarios",
    });
  }
  // Lo que el cliente escribió en el enlace y el CSE todavía no revisó no se construye (etapa 6): primero se mira.
  const revisado = (x: object) => (x as { porRevisar?: unknown }).porRevisar !== "si";
  for (const u of up.usuarios.filter((x) => (lleno(x.nombre) || lleno(x.correo)) && revisado(x))) {
    const nombre = [txt(u.nombre), txt(u.apellido)].join(" ").trim() || txt(u.correo).trim();
    con("usuarios_permisos", {
      clave: unica("usuarios_permisos", `usuario:${u.id ?? claveDeNombre(u.correo || nombre)}`),
      tipo: "usuario",
      nombre,
      detalle: [txt(u.correo).trim(), txt(u.licencia).trim()].filter(Boolean).join(" · ") || "Usuario",
      grupo: "usuarios",
    });
  }

  // El ciclo de vida: una sola cosa, si cambia algo.
  const ciclo = adoptarCicloDeVida(data("ciclo_vida_crm"));
  const cambios = ciclo.etapas.filter((e) => lleno(e.etapa) && e.cambio && e.cambio !== "se_mantiene");
  if (cambios.length || ciclo.estadosLead?.some((e) => lleno(e.estado))) {
    con("ciclo_vida_crm", {
      clave: "ciclo-de-vida",
      tipo: "ciclo",
      nombre: "Etapas del ciclo de vida y estado del lead",
      detalle: cambios.length ? `${cambios.length} ${cambios.length === 1 ? "etapa cambia" : "etapas cambian"}` : "El estado del lead",
      grupo: "ciclo",
    });
  }

  // Las propiedades, por objeto.
  const filas = ((data("propiedades") as { filas?: FilaPropiedad[] } | undefined)?.filas ?? []).filter(
    (f): f is FilaPropiedad => !!f && typeof f === "object",
  );
  for (const f of filas.filter(propiedadParaConstruir)) {
    const objeto = normalizarObjeto(f.objeto) || "Otro objeto";
    con("propiedades", {
      clave: unica("propiedades", `propiedad:${f.id ?? claveDeFila(f)}`),
      tipo: "propiedad",
      nombre: (f.etiqueta || f.campo).trim(),
      detalle: [objeto, txt(f.tipo).trim(), f.estado === "ajustar" ? "ajustar" : ""].filter(Boolean).join(" · "),
      grupo: `propiedades:${claveDeNombre(objeto)}`,
    });
  }

  for (const f of adoptarFormularios(data("formularios")).items.filter((x) => lleno(x.nombre))) {
    con("formularios", {
      clave: unica("formularios", `formulario:${f.id ?? claveDeNombre(f.nombre)}`),
      tipo: "formulario",
      nombre: f.nombre.trim(),
      detalle: [txt(f.donde).trim(), `${f.campos.length} ${f.campos.length === 1 ? "campo" : "campos"}`].filter(Boolean).join(" · "),
      grupo: `formulario:${claveDeNombre(f.id ?? f.nombre)}`,
    });
  }

  for (const p of adoptarPipelines(data("pipelines")).pipelines.filter((x) => lleno(x.nombre))) {
    const k = unica("pipelines", `pipeline:${claveDeNombre(p.nombre)}`);
    con("pipelines", {
      clave: k,
      tipo: "pipeline",
      nombre: p.nombre.trim(),
      detalle: [txt(p.objeto).trim(), `${p.etapas.length} ${p.etapas.length === 1 ? "etapa" : "etapas"}`].filter(Boolean).join(" · "),
      grupo: k,
    });
  }

  for (const a of adoptarAutomatizaciones(data("automatizaciones")).items.filter((x) => lleno(x.nombre))) {
    const k = unica("automatizaciones", `automatizacion:${claveDeNombre(a.nombre)}`);
    con("automatizaciones", { clave: k, tipo: "automatizacion", nombre: a.nombre.trim(), detalle: txt(a.donde).trim() || "Automatización", grupo: k });
  }

  for (const c of adoptarConversaciones(data("conversaciones")).items.filter((x) => lleno(x.nombre))) {
    const k = unica("conversaciones", `conversacion:${claveDeNombre(c.nombre)}`);
    con("conversaciones", { clave: k, tipo: "conversacion", nombre: c.nombre.trim(), detalle: txt(c.canal).trim() || "Conversación", grupo: k });
  }

  if (!cotizacionesVacia(data("cotizaciones"))) {
    const c = adoptarCotizaciones(data("cotizaciones"));
    con("cotizaciones", { clave: "cotizaciones", tipo: "cotizaciones", nombre: "Cotizaciones", detalle: txt(c.formato).trim() || "Propiedades, formato y ajustes", grupo: "cotizaciones" });
  }

  for (const i of adoptarInformes(data("informes")).items.filter((x) => lleno(x.nombre))) {
    con("informes", {
      clave: unica("informes", `informe:${i.id ?? claveDeNombre(i.nombre)}`),
      tipo: "informe",
      nombre: i.nombre.trim(),
      detalle: [txt(i.area).trim(), txt(i.frecuencia).trim()].filter(Boolean).join(" · ") || "Informe",
      grupo: "informes",
    });
  }
  return out;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El título de la tarea de un grupo. */
function tituloDelGrupo(clave: string, cosas: readonly CosaParaConstruir[]): string {
  const primera = cosas[0];
  if (clave === "usuarios") {
    const usuarios = cosas.filter((c) => c.tipo === "usuario").length;
    const equipos = cosas.filter((c) => c.tipo === "equipo").length;
    if (!usuarios) return equipos === 1 ? "Crea el equipo en HubSpot con sus permisos" : `Crea los ${equipos} equipos en HubSpot con sus permisos`;
    if (!equipos) return `Invita a ${plural(usuarios, "usuario", "usuarios")} a HubSpot`;
    return `Crea ${plural(equipos, "equipo", "equipos")} con sus permisos e invita a ${plural(usuarios, "usuario", "usuarios")} a HubSpot`;
  }
  if (clave === "ciclo") return "Ajusta las etapas del ciclo de vida y el estado del lead en HubSpot";
  if (clave === "cotizaciones") return "Configura las cotizaciones en HubSpot";
  if (clave === "informes") return `Arma ${plural(cosas.length, "informe", "informes")} en HubSpot`;
  if (clave.startsWith("propiedades:")) {
    const objeto = primera.detalle.split(" · ")[0];
    return `Crea ${plural(cosas.length, "propiedad", "propiedades")} de ${objeto} en HubSpot`;
  }
  const nombre = `«${primera.nombre}»`;
  switch (primera.tipo) {
    case "formulario":
      return `Arma el formulario ${nombre} en HubSpot`;
    case "pipeline":
      return `Arma el pipeline ${nombre} en HubSpot`;
    case "automatizacion":
      return `Construye la automatización ${nombre} en HubSpot`;
    case "conversacion":
      return `Conecta la conversación ${nombre} en HubSpot`;
    default:
      return `Construye ${nombre} en HubSpot`;
  }
}

/** La lista de construcción agrupada como va a Tareas, en el orden del documento. */
export function gruposDeConstruccion(cosas: readonly CosaParaConstruir[]): GrupoDeConstruccion[] {
  const orden: string[] = [];
  const por = new Map<string, CosaParaConstruir[]>();
  for (const c of cosas) {
    if (!por.has(c.grupo)) {
      por.set(c.grupo, []);
      orden.push(c.grupo);
    }
    por.get(c.grupo)!.push(c);
  }
  return orden.map((clave) => {
    const lista = por.get(clave)!;
    return { clave, titulo: tituloDelGrupo(clave, lista), cosas: lista, construidas: lista.filter((c) => c.estado === "construido").length };
  });
}

/** Las notas de la tarea de un grupo: lo que hay que construir, una línea por cosa, con lo que ya está. */
export function notasDelGrupo(g: GrupoDeConstruccion, documento: string): string {
  const lineas = g.cosas.map((c) => `- ${c.estado === "construido" ? "[hecho] " : ""}${c.nombre}${c.detalle ? ` (${c.detalle})` : ""}`);
  return [`De la planificación «${documento}». Lo que hay que construir:`, ...lineas.slice(0, 60), lineas.length > 60 ? `- y ${lineas.length - 60} más` : ""]
    .filter(Boolean)
    .join("\n");
}

/** La clave de la tarea de un grupo: la misma cada vez, así mandarla dos veces no la duplica. */
export const origenIdDelGrupo = (canvasId: string, grupo: string) => `planificacion:${canvasId}:${grupo}`.slice(0, 190);

/** Cuántas cosas hay y cuántas ya están construidas. */
export function avanceDeConstruccion(cosas: readonly CosaParaConstruir[]): { total: number; construidas: number } {
  return { total: cosas.length, construidas: cosas.filter((c) => c.estado === "construido").length };
}
