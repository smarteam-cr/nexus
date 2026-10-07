/**
 * lib/guia-exploracion/contenido.ts — las SESIONES de la exploración del CSE: qué hay adentro y cómo cambia.
 *
 * Desde el 2026-10-05 la exploración son dos vistas: Sesiones (qué preguntar y con quién) y
 * Cuestionarios (lo que contesta el cliente antes). Este módulo es el de las sesiones. Hasta ese día
 * guardaba además resultados, cómo opera cada equipo, personas, «lo que no hay que repreguntar», la
 * escala confirmada y lo que cae fuera de lo contratado: repetía Información del cliente, que es de
 * la EMPRESA (la comparten sus proyectos) y se confirma a HubSpot. Ahora cada cosa vive en su lugar
 * (decisión de Elías, DECISIONS «La exploración son sesiones y cuestionarios»):
 *   · lo que se averigua del cliente → Información del cliente (como sugerencia, lib/clients/ficha-propuesta.ts);
 *   · el nivel de la escala → el Diagnóstico, que lee las sesiones;
 *   · lo que no se vendió → «Pedidos fuera de alcance» del handoff.
 * Al tomar la decisión había una sola guía en producción (Cemaco) y estaba vacía: no hubo nada que mudar.
 *
 * ── EL AGENTE PROPONE, EL CSE CONFIRMA (molde de lib/exploraciones) ──────────
 * Lo confirmado vive en `contenido`; lo que propone el agente, en `propuesta`, aparte. El agente nunca
 * escribe en `contenido`: por eso volver a proponer no puede borrar una pregunta marcada. Cada
 * propuesta tiene un id estable (por destino + texto): lo descartado no vuelve.
 *
 * Módulo PURO (sin Prisma, sin zod): lo usan el servidor y la pantalla.
 */

export type ClaveDeEquipo = "ventas" | "marketing" | "servicio";
export const EQUIPOS: readonly ClaveDeEquipo[] = ["ventas", "marketing", "servicio"];
export const NOMBRE_DEL_EQUIPO: Record<ClaveDeEquipo, string> = { ventas: "Ventas", marketing: "Marketing", servicio: "Servicio" };
/** Qué hub enciende cada equipo (los tags del proyecto). */
export const HUB_DEL_EQUIPO: Record<ClaveDeEquipo, string> = { ventas: "sales_hub", marketing: "marketing_hub", servicio: "service_hub" };

/** Una fuente citada: `id` corto (H = handoff, K = kickoff, C = cuestionarios, F = ficha, R = reunión…) y la frase. */
export interface Fuente {
  id: string;
  etiqueta: string;
  cita?: string;
}

export interface PreguntaDeSesion {
  id: string;
  texto: string;
  repregunta?: string;
  /** A qué apunta: «resultados», un equipo (ventas, marketing, servicio), «escala:<dimensión>» o «contradiccion». */
  objetivo?: string;
  hecha: boolean;
  /** Lo que se averiguó, si el CSE lo anotó. */
  respuesta?: string;
  /**
   * A qué campos de Información del cliente llegó lo averiguado como sugerencia (lo escribe el
   * servidor cuando vuelve la propuesta a la ficha). Vacío = no trajo nada nuevo para la ficha.
   */
  fichaCampos?: string[];
}

export interface Sesion {
  id: string;
  titulo: string;
  objetivo: string;
  conQuien: string;
  preguntas: PreguntaDeSesion[];
}

export interface ContenidoDeGuia {
  sesiones: Sesion[];
}

export function contenidoVacio(): ContenidoDeGuia {
  return { sesiones: [] };
}

/**
 * El título sin el número que a veces le pone el agente («Sesión 1 — Negocio…» → «Negocio…»): el
 * número lo da la posición en el plan (cada sesión es una pestaña «Sesión N»), y uno escrito en el
 * título queda viejo apenas se agrega, se quita o se usa otra.
 */
export function tituloSinNumero(titulo: string): string {
  const t = titulo.replace(/^\s*sesi[oó]n\s*(?:n[º°o]?\s*)?\d+\s*(?:[—–\-:·.|]\s*)?/i, "").trim();
  return t || titulo.trim();
}

/** La próxima sesión: la primera con preguntas sin hacer (o sin preguntas). Sin ninguna así, null. */
export function proximaSesion(c: ContenidoDeGuia): Sesion | null {
  return c.sesiones.find((s) => s.preguntas.length === 0 || s.preguntas.some((q) => !q.hecha)) ?? null;
}

/** Qué letra lleva una pregunta en pantalla, según a qué apunta. */
export function letraDelObjetivo(objetivo: string | undefined): { letra: string; corto: string; ayuda: string } | null {
  if (!objetivo) return null;
  if (objetivo === "resultados") return { letra: "R", corto: "resultados", ayuda: "Apunta a los resultados que busca el cliente" };
  if (objetivo === "ventas") return { letra: "V", corto: "Ventas", ayuda: "Apunta al equipo de Ventas" };
  if (objetivo === "marketing") return { letra: "M", corto: "Marketing", ayuda: "Apunta al equipo de Marketing" };
  if (objetivo === "servicio") return { letra: "S", corto: "Servicio", ayuda: "Apunta al equipo de Servicio" };
  if (objetivo.startsWith("escala:")) return { letra: "E", corto: "escala", ayuda: "Apunta a una dimensión de la escala" };
  if (objetivo === "contradiccion") return { letra: "C", corto: "contradicción", ayuda: "Una contradicción entre personas del cliente: se cierra conversándola" };
  return null;
}

/** La dimensión de la escala a la que apunta una pregunta («escala:1.3» → «1.3»). */
export function dimensionDelObjetivo(objetivo: string | undefined): string | null {
  return objetivo?.startsWith("escala:") ? objetivo.slice("escala:".length).trim() || null : null;
}

// ── Lo que propone el agente ─────────────────────────────────────────────────

export type DestinoDePropuesta =
  | { tipo: "sesion" }
  /** Una pregunta del plan que la última reunión ya contestó (la marca la confirma el CSE). */
  | { tipo: "respondida"; sesionId: string; preguntaId: string }
  /** Una contradicción entre dos personas del cliente (cuestionarios o reunión), con las dos citas. */
  | { tipo: "contradiccion" };

export type ValorPropuesto =
  | { texto: string } // contradiccion
  | { titulo: string; objetivo: string; conQuien: string; preguntas: Array<{ texto: string; repregunta?: string; objetivo?: string }> } // sesion
  | { respuesta: string }; // respondida

export interface ItemPropuesto {
  id: string;
  destino: DestinoDePropuesta;
  valor: ValorPropuesto;
  razon?: string;
  fuentes: Fuente[];
  corridaId: string;
  en: string;
}

export interface Corrida {
  id: string;
  modo: "preparar" | "leer";
  en: string;
  propuestas: number;
  descartadas: number;
}

export interface PropuestaDeGuia {
  items: ItemPropuesto[];
  /** Ids de propuestas descartadas: no vuelven aunque el agente las proponga de nuevo. */
  descartadas: string[];
  /** Reuniones ya leídas por «Leer la reunión». */
  leidas: string[];
  corridas: Corrida[];
}

export function propuestaVacia(): PropuestaDeGuia {
  return { items: [], descartadas: [], leidas: [], corridas: [] };
}

const DESTINOS: ReadonlySet<string> = new Set(["sesion", "respondida", "contradiccion"]);

/** Texto comparable (para ids estables y para no proponer dos veces lo mismo). */
export function clave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function textoPrincipal(v: ValorPropuesto): string {
  if ("texto" in v) return v.texto;
  if ("titulo" in v) return v.titulo;
  return v.respuesta;
}

/** Id estable: el mismo destino con el mismo texto es la misma propuesta (lo descartado no vuelve). */
export function idDelItem(destino: DestinoDePropuesta, valor: ValorPropuesto): string {
  const extra = destino.tipo === "respondida" ? `${destino.sesionId}:${destino.preguntaId}` : "";
  return `p-${hash(`${destino.tipo}|${extra}|${clave(textoPrincipal(valor))}`)}`;
}

/** ¿Ya está confirmado algo igual? Entonces la propuesta no aporta. */
export function yaEstaConfirmado(c: ContenidoDeGuia, it: Pick<ItemPropuesto, "destino" | "valor">): boolean {
  const t = clave(textoPrincipal(it.valor));
  const d = it.destino;
  switch (d.tipo) {
    case "sesion": {
      // Sin el número: al usarla, el título se guarda sin «Sesión N —» (tituloSinNumero).
      const titulo = clave(tituloSinNumero(textoPrincipal(it.valor)));
      return c.sesiones.some((x) => clave(tituloSinNumero(x.titulo)) === titulo);
    }
    case "respondida": {
      const q = c.sesiones.find((s) => s.id === d.sesionId)?.preguntas.find((q) => q.id === d.preguntaId);
      // Una pregunta que ya no está en el plan tampoco se ofrece: no hay dónde marcarla.
      return !q || q.hecha;
    }
    case "contradiccion":
      return c.sesiones.some((s) => s.preguntas.some((q) => clave(q.texto) === t));
  }
}

/** Suma lo nuevo del agente: sin repetidos, sin lo descartado y sin lo que ya está confirmado. */
export function fusionarPropuestas(p: PropuestaDeGuia, c: ContenidoDeGuia, nuevos: ItemPropuesto[], corrida: Corrida): PropuestaDeGuia {
  const descartadas = new Set(p.descartadas);
  const vivos = new Map(p.items.map((i) => [i.id, i]));
  for (const n of nuevos) {
    if (descartadas.has(n.id) || yaEstaConfirmado(c, n)) continue;
    vivos.set(n.id, n);
  }
  return { ...p, items: [...vivos.values()], corridas: [corrida, ...p.corridas].slice(0, 30) };
}

/** Lo que sigue pendiente de decidir (lo confirmado y lo descartado ya no se ofrecen). */
export function pendientes(p: PropuestaDeGuia, c: ContenidoDeGuia): ItemPropuesto[] {
  const descartadas = new Set(p.descartadas);
  return p.items.filter((i) => !descartadas.has(i.id) && !yaEstaConfirmado(c, i));
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export type OperacionDeGuia =
  /**
   * Usar una propuesta (el CSE puede editar el valor antes). `sesionId`: para una contradicción, la
   * sesión donde se lleva (la pestaña en la que estaba); sin él, a la próxima.
   */
  | { op: "usar"; itemId: string; valor?: ValorPropuesto; sesionId?: string }
  | { op: "descartar"; itemIds: string[] }
  | { op: "agregarSesion"; titulo: string; objetivo?: string; conQuien?: string }
  | { op: "agregarPregunta"; sesionId: string; texto: string; repregunta?: string; objetivo?: string }
  /** Editar una sesión o una pregunta (por id). */
  | { op: "editar"; lista: "sesiones"; id: string; campos: Record<string, unknown> }
  | { op: "quitar"; lista: "sesiones"; id: string }
  | { op: "marcarPregunta"; sesionId: string; preguntaId: string; hecha: boolean; respuesta?: string };

function txt(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function nuevoId(prefijo: string, semilla: string, usados: Set<string>): string {
  let id = `${prefijo}-${hash(semilla)}`;
  let n = 1;
  while (usados.has(id)) id = `${prefijo}-${hash(semilla + n++)}`;
  usados.add(id);
  return id;
}

function ids(c: ContenidoDeGuia): Set<string> {
  const s = new Set<string>();
  for (const ses of c.sesiones) {
    s.add(ses.id);
    for (const q of ses.preguntas) s.add(q.id);
  }
  return s;
}

/** Una pregunta cuyo «lo que averiguaste» quedó escrito o cambió: va como sugerencia a Información del cliente. */
export interface Averiguado {
  sesionId: string;
  preguntaId: string;
  sesion: string;
  pregunta: string;
  respuesta: string;
}

function aplicarUso(c: ContenidoDeGuia, it: ItemPropuesto, valor: ValorPropuesto, usados: Set<string>, sesionId?: string): string | null {
  const d = it.destino;
  const semilla = `${it.id}|${Date.now()}`;
  switch (d.tipo) {
    case "contradiccion": {
      const texto = txt("texto" in valor ? valor.texto : "", 600);
      if (!texto) return "La propuesta no tiene texto.";
      // Una contradicción se cierra EN SESIÓN: va como pregunta a la sesión elegida, o a la próxima.
      const ses = (sesionId ? c.sesiones.find((x) => x.id === sesionId) : undefined) ?? proximaSesion(c) ?? c.sesiones[c.sesiones.length - 1];
      if (!ses) return "Agrega una sesión antes: la contradicción se cierra conversándola.";
      ses.preguntas.push({ id: nuevoId("q", semilla, usados), texto, hecha: false, objetivo: "contradiccion" });
      return null;
    }
    case "sesion": {
      if (!("titulo" in valor) || !txt(valor.titulo, 120)) return "La sesión no tiene título.";
      c.sesiones.push({
        id: nuevoId("s", semilla, usados),
        titulo: tituloSinNumero(txt(valor.titulo, 120)),
        objetivo: txt(valor.objetivo, 400),
        conQuien: txt(valor.conQuien, 300),
        preguntas: (valor.preguntas ?? []).slice(0, 20).flatMap((q, i) => {
          const t = txt(q.texto, 400);
          return t
            ? [{ id: nuevoId("q", `${semilla}|${i}`, usados), texto: t, repregunta: txt(q.repregunta, 300) || undefined, objetivo: txt(q.objetivo, 60) || undefined, hecha: false }]
            : [];
        }),
      });
      return null;
    }
    case "respondida": {
      const q = c.sesiones.find((s) => s.id === d.sesionId)?.preguntas.find((x) => x.id === d.preguntaId);
      if (!q) return "Esa pregunta ya no está en el plan.";
      q.hecha = true;
      const r = txt("respuesta" in valor ? valor.respuesta : "", 1000);
      if (r && r !== q.respuesta) {
        q.respuesta = r;
        delete q.fichaCampos;
      }
      return null;
    }
  }
}

/**
 * Aplica las operaciones EN ORDEN, todas o ninguna. Pura: no muta `inicial`. Devuelve también lo
 * averiguado que quedó escrito o cambió (para llevarlo a Información del cliente).
 */
export function aplicarOperaciones(
  inicial: ContenidoDeGuia,
  propuesta: PropuestaDeGuia,
  ops: readonly OperacionDeGuia[],
): { ok: true; contenido: ContenidoDeGuia; descartadas: string[]; averiguado: Averiguado[] } | { ok: false; error: string } {
  const c: ContenidoDeGuia = JSON.parse(JSON.stringify(inicial));
  const descartadas = new Set(propuesta.descartadas);
  const usados = ids(c);
  for (const o of ops) {
    const error = ((): string | null => {
      switch (o.op) {
        case "usar": {
          const it = propuesta.items.find((i) => i.id === o.itemId);
          if (!it || !DESTINOS.has(it.destino.tipo)) return "Esa propuesta ya no está.";
          return aplicarUso(c, it, o.valor ?? it.valor, usados, typeof o.sesionId === "string" ? o.sesionId : undefined);
        }
        case "descartar":
          for (const id of o.itemIds) descartadas.add(id);
          return null;
        case "agregarSesion": {
          const titulo = tituloSinNumero(txt(o.titulo, 120));
          if (!titulo) return "Ponle un título a la sesión.";
          c.sesiones.push({ id: nuevoId("s", titulo + Date.now(), usados), titulo, objetivo: txt(o.objetivo, 400), conQuien: txt(o.conQuien, 300), preguntas: [] });
          return null;
        }
        case "agregarPregunta": {
          const s = c.sesiones.find((x) => x.id === o.sesionId);
          const texto = txt(o.texto, 400);
          if (!s) return "Esa sesión ya no está.";
          if (!texto) return "Escribe la pregunta.";
          s.preguntas.push({ id: nuevoId("q", texto + Date.now(), usados), texto, repregunta: txt(o.repregunta, 300) || undefined, objetivo: txt(o.objetivo, 60) || undefined, hecha: false });
          return null;
        }
        case "marcarPregunta": {
          const q = c.sesiones.find((x) => x.id === o.sesionId)?.preguntas.find((x) => x.id === o.preguntaId);
          if (!q) return "Esa pregunta ya no está.";
          q.hecha = !!o.hecha;
          if (o.respuesta !== undefined) {
            const r = txt(o.respuesta, 1000);
            if (r !== (q.respuesta ?? "")) delete q.fichaCampos;
            if (r) q.respuesta = r;
            else delete q.respuesta;
          }
          return null;
        }
        case "editar":
        case "quitar":
          return editarOQuitar(c, o);
        default:
          return "Operación desconocida.";
      }
    })();
    if (error) return { ok: false, error };
  }
  return { ok: true, contenido: c, descartadas: [...descartadas], averiguado: averiguadoNuevo(inicial, c) };
}

/** Lo averiguado que quedó escrito o cambió entre dos versiones, en preguntas hechas. */
export function averiguadoNuevo(antes: ContenidoDeGuia, despues: ContenidoDeGuia): Averiguado[] {
  const previo = new Map(antes.sesiones.flatMap((s) => s.preguntas.map((q) => [q.id, q.respuesta ?? ""] as const)));
  return despues.sesiones.flatMap((s) =>
    s.preguntas
      .filter((q) => q.hecha && q.respuesta && q.respuesta !== previo.get(q.id))
      .map((q) => ({ sesionId: s.id, preguntaId: q.id, sesion: s.titulo, pregunta: q.texto, respuesta: q.respuesta! })),
  );
}

const CAMPOS_EDITABLES: Record<"sesiones" | "pregunta", Record<string, number>> = {
  sesiones: { titulo: 120, objetivo: 400, conQuien: 300 },
  pregunta: { texto: 400, repregunta: 300 },
};

function editarOQuitar(c: ContenidoDeGuia, o: Extract<OperacionDeGuia, { op: "editar" | "quitar" }>): string | null {
  if (o.lista !== "sesiones") return "Lista desconocida.";
  const iSes = c.sesiones.findIndex((s) => s.id === o.id);
  if (iSes >= 0) {
    if (o.op === "quitar") {
      if (c.sesiones[iSes].preguntas.some((q) => q.hecha)) return "Esa sesión tiene preguntas ya hechas: no se borra.";
      c.sesiones.splice(iSes, 1);
    } else editarCampos(c.sesiones[iSes] as unknown as Record<string, unknown>, o.campos, CAMPOS_EDITABLES.sesiones);
    return null;
  }
  for (const s of c.sesiones) {
    const i = s.preguntas.findIndex((q) => q.id === o.id);
    if (i >= 0) {
      if (o.op === "quitar") {
        // ⛔ Lo que el CSE ya preguntó no se borra (es el mismo principio que volver a proponer).
        if (s.preguntas[i].hecha) return "Esa pregunta ya se hizo: no se borra.";
        s.preguntas.splice(i, 1);
      } else editarCampos(s.preguntas[i] as unknown as Record<string, unknown>, o.campos, CAMPOS_EDITABLES.pregunta);
      return null;
    }
  }
  return "Esa sesión ya no está.";
}

function editarCampos(destino: Record<string, unknown>, campos: Record<string, unknown>, permitidos: Record<string, number>) {
  for (const [k, max] of Object.entries(permitidos)) {
    if (k in campos) destino[k] = txt(campos[k], max);
  }
}

/** Anota en cada pregunta a qué campos de Información del cliente llegó lo averiguado. Pura. */
export function anotarFichaCampos(c: ContenidoDeGuia, preguntas: ReadonlyArray<{ preguntaId: string; respuesta: string }>, campos: readonly string[]): ContenidoDeGuia {
  const out: ContenidoDeGuia = JSON.parse(JSON.stringify(c));
  for (const p of preguntas) {
    for (const s of out.sesiones) {
      const q = s.preguntas.find((x) => x.id === p.preguntaId);
      // Solo si la respuesta sigue siendo la que se mandó: si el CSE la cambió mientras tanto, esa
      // corrida ya no la describe (la siguiente la anota).
      if (q && q.respuesta === p.respuesta) q.fichaCampos = [...campos];
    }
  }
  return out;
}

// ── Lectura tolerante (la columna es de la base) ─────────────────────────────

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(esObj) : []);
const s = (x: unknown, max = 2000) => (typeof x === "string" ? x.slice(0, max) : "");

/** Lee lo guardado. Las listas viejas de la guía (resultados, personas, escala…) se ignoran: hoy viven en otro lado. */
export function leerContenido(raw: unknown): ContenidoDeGuia {
  const r = esObj(raw) ? raw : {};
  return {
    sesiones: arr(r.sesiones).flatMap((x) =>
      s(x.id)
        ? [
            {
              id: s(x.id),
              titulo: s(x.titulo),
              objetivo: s(x.objetivo),
              conQuien: s(x.conQuien),
              preguntas: arr(x.preguntas).flatMap((q) =>
                s(q.id) && s(q.texto)
                  ? [
                      {
                        id: s(q.id),
                        texto: s(q.texto),
                        ...(s(q.repregunta) ? { repregunta: s(q.repregunta) } : {}),
                        ...(s(q.objetivo) ? { objetivo: s(q.objetivo) } : {}),
                        hecha: q.hecha === true,
                        ...(s(q.respuesta) ? { respuesta: s(q.respuesta) } : {}),
                        ...(Array.isArray(q.fichaCampos) ? { fichaCampos: q.fichaCampos.filter((x): x is string => typeof x === "string").slice(0, 12) } : {}),
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    ),
  };
}

export function leerPropuesta(raw: unknown): PropuestaDeGuia {
  const r = esObj(raw) ? raw : {};
  return {
    items: arr(r.items).flatMap((i) =>
      s(i.id) && esObj(i.destino) && esObj(i.valor) && DESTINOS.has(s(i.destino.tipo))
        ? [
            {
              id: s(i.id),
              destino: i.destino as unknown as DestinoDePropuesta,
              valor: i.valor as unknown as ValorPropuesto,
              ...(s(i.razon) ? { razon: s(i.razon) } : {}),
              fuentes: arr(i.fuentes).map((f) => ({ id: s(f.id, 10), etiqueta: s(f.etiqueta, 200), ...(s(f.cita) ? { cita: s(f.cita, 600) } : {}) })),
              corridaId: s(i.corridaId),
              en: s(i.en),
            },
          ]
        : [],
    ),
    descartadas: Array.isArray(r.descartadas) ? r.descartadas.filter((x): x is string => typeof x === "string") : [],
    leidas: Array.isArray(r.leidas) ? r.leidas.filter((x): x is string => typeof x === "string") : [],
    corridas: arr(r.corridas).map((c) => ({
      id: s(c.id),
      modo: c.modo === "leer" ? "leer" : "preparar",
      en: s(c.en),
      propuestas: typeof c.propuestas === "number" ? c.propuestas : 0,
      descartadas: typeof c.descartadas === "number" ? c.descartadas : 0,
    })),
  };
}
