/**
 * lib/guia-exploracion/contenido.ts — la GUÍA DE EXPLORACIÓN del CSE: qué hay adentro y cómo cambia.
 *
 * Reemplaza al informe de exploración (pedido de Elías, 2026-10-02). No es un documento que se lee:
 * es un LIENZO que se usa y se sigue durante las sesiones. El ejecutivo sale de ella sabiendo QUÉ
 * explorar y CON QUIÉN. Se organiza por tres objetivos:
 *   1. Los RESULTADOS que el cliente necesita (qué quiere lograr, quién lo necesita y para qué), desde
 *      lo que capturó el handoff y siempre dentro de lo contratado.
 *   2. Cada EQUIPO contratado: cómo opera hoy y dónde se traba.
 *   3. La ESCALA: dónde quedó en el diagnóstico preliminar y qué dimensiones faltan confirmar.
 * Y alrededor: lo que NO hay que repreguntar (corto), el plan de sesiones con preguntas marcables y
 * «con quién», a quién involucrar (con roles sin confirmar) y la franja «Fuera de lo contratado».
 *
 * ── EL AGENTE PROPONE, EL CSE CONFIRMA (molde de lib/exploraciones) ──────────
 * Lo confirmado vive en `contenido`; lo que propone el agente, en `propuesta`, aparte. El agente nunca
 * escribe en `contenido`: por eso regenerar no puede borrar una pregunta marcada ni nada de lo que el
 * CSE ya trabajó. Cada propuesta tiene un id estable (por destino + texto): lo descartado no vuelve.
 *
 * Módulo PURO (sin Prisma, sin zod): lo usan el servidor y la pantalla.
 */

export type ClaveDeEquipo = "ventas" | "marketing" | "servicio";
export const EQUIPOS: readonly ClaveDeEquipo[] = ["ventas", "marketing", "servicio"];
export const NOMBRE_DEL_EQUIPO: Record<ClaveDeEquipo, string> = { ventas: "Ventas", marketing: "Marketing", servicio: "Servicio" };
/** Qué hub enciende cada equipo (los tags del proyecto). */
export const HUB_DEL_EQUIPO: Record<ClaveDeEquipo, string> = { ventas: "sales_hub", marketing: "marketing_hub", servicio: "service_hub" };

export type RolDePersona = "firma" | "decide" | "influye" | "afectado";
export const ROLES: readonly RolDePersona[] = ["firma", "decide", "influye", "afectado"];
export const NOMBRE_DEL_ROL: Record<RolDePersona, string> = {
  firma: "Firma",
  decide: "Decide",
  influye: "Influye",
  afectado: "Le afecta",
};

export type Alcance = "dentro" | "duda" | "fuera";

/** Una fuente citada: `id` corto (H = handoff, K = kickoff, C = cuestionarios, R = reunión…) y la frase. */
export interface Fuente {
  id: string;
  etiqueta: string;
  cita?: string;
}

export interface Dato {
  id: string;
  texto: string;
  fuente?: string;
}

export interface Resultado {
  id: string;
  /** Qué quiere lograr, en palabras del cliente. */
  que: string;
  /** Quién lo necesita (rol o persona). */
  quien: string;
  /** Para qué: la consecuencia de negocio. */
  paraQue: string;
  alcance: Alcance;
  confirmado: boolean;
}

export interface Hallazgo {
  id: string;
  texto: string;
  confirmado: boolean;
}

export interface Equipo {
  opera: Hallazgo[];
  trabas: Hallazgo[];
}

export interface PreguntaDeSesion {
  id: string;
  texto: string;
  repregunta?: string;
  /** A qué objetivo apunta: «resultados», un equipo, o «escala:<dimensión>». */
  objetivo?: string;
  hecha: boolean;
  /** Lo que se averiguó, si el CSE lo anotó. */
  respuesta?: string;
}

export interface Sesion {
  id: string;
  titulo: string;
  objetivo: string;
  conQuien: string;
  preguntas: PreguntaDeSesion[];
}

export interface Persona {
  id: string;
  nombre: string;
  rol: RolDePersona | null;
  /** Qué sabe que nadie más sabe / qué le importa. */
  sabe: string;
  /** false = rol sin confirmar (se marca ⚠ en pantalla). */
  confirmado: boolean;
}

export interface NivelConfirmado {
  nivel: string;
  nota?: string;
}

export interface ContenidoDeGuia {
  noRepreguntar: Dato[];
  resultados: Resultado[];
  equipos: Partial<Record<ClaveDeEquipo, Equipo>>;
  /** La escala: lo que el CSE confirmó por dimensión. Lo preliminar se lee aparte (no se copia). */
  escala: Record<string, NivelConfirmado>;
  sesiones: Sesion[];
  personas: Persona[];
  fueraDeAlcance: Dato[];
}

export const TOPE_NO_REPREGUNTAR = 8;

export function contenidoVacio(): ContenidoDeGuia {
  return { noRepreguntar: [], resultados: [], equipos: {}, escala: {}, sesiones: [], personas: [], fueraDeAlcance: [] };
}

// ── Lo que propone el agente ─────────────────────────────────────────────────

export type DestinoDePropuesta =
  | { tipo: "noRepreguntar" }
  | { tipo: "resultado" }
  | { tipo: "opera"; equipo: ClaveDeEquipo }
  | { tipo: "traba"; equipo: ClaveDeEquipo }
  | { tipo: "persona" }
  | { tipo: "sesion" }
  /** Una pregunta del plan que la última reunión ya contestó (la marca la confirma el CSE). */
  | { tipo: "respondida"; sesionId: string; preguntaId: string }
  | { tipo: "fueraDeAlcance" }
  /** Una contradicción entre dos personas del cliente (cuestionarios o reunión), con las dos citas. */
  | { tipo: "contradiccion" };

export type ValorPropuesto =
  | { texto: string } // noRepreguntar, opera, traba, fueraDeAlcance, contradiccion
  | { que: string; quien: string; paraQue: string; alcance: Alcance } // resultado
  | { nombre: string; rol: RolDePersona | null; sabe: string } // persona
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
  /** Reuniones ya leídas por «Leer la última reunión». */
  leidas: string[];
  corridas: Corrida[];
}

export function propuestaVacia(): PropuestaDeGuia {
  return { items: [], descartadas: [], leidas: [], corridas: [] };
}

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
  if ("que" in v) return v.que;
  if ("nombre" in v) return v.nombre;
  if ("titulo" in v) return v.titulo;
  return v.respuesta;
}

/** Id estable: el mismo destino con el mismo texto es la misma propuesta (lo descartado no vuelve). */
export function idDelItem(destino: DestinoDePropuesta, valor: ValorPropuesto): string {
  const extra = destino.tipo === "respondida" ? `${destino.sesionId}:${destino.preguntaId}` : "equipo" in destino ? destino.equipo : "";
  return `p-${hash(`${destino.tipo}|${extra}|${clave(textoPrincipal(valor))}`)}`;
}

/** ¿Ya está confirmado algo igual? Entonces la propuesta no aporta. */
export function yaEstaConfirmado(c: ContenidoDeGuia, it: Pick<ItemPropuesto, "destino" | "valor">): boolean {
  const t = clave(textoPrincipal(it.valor));
  const d = it.destino;
  switch (d.tipo) {
    case "noRepreguntar":
      return c.noRepreguntar.some((x) => clave(x.texto) === t);
    case "resultado":
      return c.resultados.some((x) => clave(x.que) === t);
    case "opera":
      return (c.equipos[d.equipo]?.opera ?? []).some((x) => clave(x.texto) === t);
    case "traba":
      return (c.equipos[d.equipo]?.trabas ?? []).some((x) => clave(x.texto) === t);
    case "persona":
      return c.personas.some((x) => clave(x.nombre) === t);
    case "sesion":
      return c.sesiones.some((x) => clave(x.titulo) === t);
    case "respondida":
      return !!c.sesiones.find((s) => s.id === d.sesionId)?.preguntas.find((q) => q.id === d.preguntaId)?.hecha;
    case "fueraDeAlcance":
      return c.fueraDeAlcance.some((x) => clave(x.texto) === t);
    case "contradiccion":
      return false;
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

/** Lo que sigue pendiente de decidir (lo confirmado ya no se ofrece). */
export function pendientes(p: PropuestaDeGuia, c: ContenidoDeGuia): ItemPropuesto[] {
  return p.items.filter((i) => !yaEstaConfirmado(c, i));
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export type Lista = "noRepreguntar" | "resultados" | "personas" | "fueraDeAlcance" | "sesiones";

export type OperacionDeGuia =
  /** Usar una propuesta (el CSE puede editar el valor antes). */
  | { op: "usar"; itemId: string; valor?: ValorPropuesto }
  | { op: "descartar"; itemIds: string[] }
  /** Agregar a mano. */
  | { op: "agregarDato"; lista: "noRepreguntar" | "fueraDeAlcance"; texto: string; fuente?: string }
  | { op: "agregarResultado"; que: string; quien?: string; paraQue?: string; alcance?: Alcance }
  | { op: "agregarHallazgo"; equipo: ClaveDeEquipo; tipo: "opera" | "traba"; texto: string }
  | { op: "agregarPersona"; nombre: string; rol?: RolDePersona | null; sabe?: string }
  | { op: "agregarSesion"; titulo: string; objetivo?: string; conQuien?: string }
  | { op: "agregarPregunta"; sesionId: string; texto: string; repregunta?: string; objetivo?: string }
  /** Editar cualquier campo de un elemento (por id). */
  | { op: "editar"; lista: Lista | "hallazgo"; id: string; campos: Record<string, unknown> }
  | { op: "quitar"; lista: Lista | "hallazgo"; id: string }
  | { op: "marcarPregunta"; sesionId: string; preguntaId: string; hecha: boolean; respuesta?: string }
  | { op: "confirmarNivel"; dimensionId: string; nivel: string | null; nota?: string };

export type ResultadoDeOperaciones = { ok: true; contenido: ContenidoDeGuia } | { ok: false; error: string };

const LETRAS: ReadonlySet<string> = new Set(["D", "I", "F", "E", "O"]);

function txt(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function nuevoId(prefijo: string, semilla: string, usados: Set<string>): string {
  let id = `${prefijo}-${hash(semilla)}`;
  let n = 1;
  while (usados.has(id)) id = `${prefijo}-${hash(semilla + n++)}`;
  return id;
}

function ids(c: ContenidoDeGuia): Set<string> {
  const s = new Set<string>();
  for (const x of [...c.noRepreguntar, ...c.resultados, ...c.personas, ...c.fueraDeAlcance, ...c.sesiones]) s.add(x.id);
  for (const ses of c.sesiones) for (const q of ses.preguntas) s.add(q.id);
  for (const e of Object.values(c.equipos)) for (const h of [...(e?.opera ?? []), ...(e?.trabas ?? [])]) s.add(h.id);
  return s;
}

function equipo(c: ContenidoDeGuia, k: ClaveDeEquipo): Equipo {
  const e = c.equipos[k] ?? { opera: [], trabas: [] };
  c.equipos[k] = e;
  return e;
}

function aplicarUso(c: ContenidoDeGuia, it: ItemPropuesto, valor: ValorPropuesto, usados: Set<string>): string | null {
  const d = it.destino;
  const semilla = `${it.id}|${Date.now()}`;
  switch (d.tipo) {
    case "noRepreguntar":
    case "fueraDeAlcance":
    case "contradiccion": {
      const texto = txt("texto" in valor ? valor.texto : "", 600);
      if (!texto) return "La propuesta no tiene texto.";
      const lista = d.tipo === "fueraDeAlcance" ? c.fueraDeAlcance : c.noRepreguntar;
      if (d.tipo === "noRepreguntar" && lista.length >= TOPE_NO_REPREGUNTAR) {
        return `«Lo que no hay que repreguntar» es una lista corta: hasta ${TOPE_NO_REPREGUNTAR}.`;
      }
      if (d.tipo === "contradiccion") {
        // Una contradicción confirmada es algo a cerrar EN SESIÓN: va como pregunta a la primera sesión.
        const ses = c.sesiones[0];
        if (!ses) return "Agrega una sesión antes: la contradicción se cierra conversándola.";
        ses.preguntas.push({ id: nuevoId("q", semilla, usados), texto, hecha: false, objetivo: "contradiccion" });
        return null;
      }
      lista.push({ id: nuevoId("d", semilla, usados), texto, fuente: it.fuentes.map((f) => f.etiqueta).join(" · ") || undefined });
      return null;
    }
    case "resultado": {
      if (!("que" in valor) || !txt(valor.que, 300)) return "El resultado no dice qué se quiere lograr.";
      c.resultados.push({
        id: nuevoId("r", semilla, usados),
        que: txt(valor.que, 300),
        quien: txt(valor.quien, 200),
        paraQue: txt(valor.paraQue, 400),
        alcance: valor.alcance === "fuera" || valor.alcance === "duda" ? valor.alcance : "dentro",
        confirmado: true,
      });
      return null;
    }
    case "opera":
    case "traba": {
      const texto = txt("texto" in valor ? valor.texto : "", 600);
      if (!texto) return "La propuesta no tiene texto.";
      const e = equipo(c, d.equipo);
      (d.tipo === "opera" ? e.opera : e.trabas).push({ id: nuevoId("h", semilla, usados), texto, confirmado: true });
      return null;
    }
    case "persona": {
      if (!("nombre" in valor) || !txt(valor.nombre, 120)) return "La persona no tiene nombre.";
      c.personas.push({
        id: nuevoId("pe", semilla, usados),
        nombre: txt(valor.nombre, 120),
        rol: valor.rol && ROLES.includes(valor.rol) ? valor.rol : null,
        sabe: txt(valor.sabe, 400),
        // Lo que viene del agente entra SIN confirmar: el rol se confirma con el cliente.
        confirmado: false,
      });
      return null;
    }
    case "sesion": {
      if (!("titulo" in valor) || !txt(valor.titulo, 120)) return "La sesión no tiene título.";
      c.sesiones.push({
        id: nuevoId("s", semilla, usados),
        titulo: txt(valor.titulo, 120),
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
      if (r) q.respuesta = r;
      return null;
    }
  }
}

/** Aplica las operaciones EN ORDEN, todas o ninguna. Pura: no muta `inicial`. */
export function aplicarOperaciones(
  inicial: ContenidoDeGuia,
  propuesta: PropuestaDeGuia,
  ops: readonly OperacionDeGuia[],
): { ok: true; contenido: ContenidoDeGuia; descartadas: string[] } | { ok: false; error: string } {
  const c: ContenidoDeGuia = JSON.parse(JSON.stringify(inicial));
  const descartadas = new Set(propuesta.descartadas);
  const usados = ids(c);
  for (const o of ops) {
    const error = ((): string | null => {
      switch (o.op) {
        case "usar": {
          const it = propuesta.items.find((i) => i.id === o.itemId);
          if (!it) return "Esa propuesta ya no está.";
          return aplicarUso(c, it, o.valor ?? it.valor, usados);
        }
        case "descartar":
          for (const id of o.itemIds) descartadas.add(id);
          return null;
        case "agregarDato": {
          const texto = txt(o.texto, 600);
          if (!texto) return "Escribe el texto.";
          const lista = o.lista === "fueraDeAlcance" ? c.fueraDeAlcance : c.noRepreguntar;
          if (o.lista === "noRepreguntar" && lista.length >= TOPE_NO_REPREGUNTAR) {
            return `«Lo que no hay que repreguntar» es una lista corta: hasta ${TOPE_NO_REPREGUNTAR}.`;
          }
          lista.push({ id: nuevoId("d", texto + Date.now(), usados), texto, fuente: txt(o.fuente, 200) || undefined });
          return null;
        }
        case "agregarResultado": {
          const que = txt(o.que, 300);
          if (!que) return "Escribe qué quiere lograr el cliente.";
          c.resultados.push({
            id: nuevoId("r", que + Date.now(), usados),
            que,
            quien: txt(o.quien, 200),
            paraQue: txt(o.paraQue, 400),
            alcance: o.alcance === "fuera" || o.alcance === "duda" ? o.alcance : "dentro",
            confirmado: true,
          });
          return null;
        }
        case "agregarHallazgo": {
          const texto = txt(o.texto, 600);
          if (!texto || !EQUIPOS.includes(o.equipo)) return "Escribe el texto.";
          const e = equipo(c, o.equipo);
          (o.tipo === "traba" ? e.trabas : e.opera).push({ id: nuevoId("h", texto + Date.now(), usados), texto, confirmado: true });
          return null;
        }
        case "agregarPersona": {
          const nombre = txt(o.nombre, 120);
          if (!nombre) return "Escribe el nombre o el rol.";
          c.personas.push({
            id: nuevoId("pe", nombre + Date.now(), usados),
            nombre,
            rol: o.rol && ROLES.includes(o.rol) ? o.rol : null,
            sabe: txt(o.sabe, 400),
            confirmado: false,
          });
          return null;
        }
        case "agregarSesion": {
          const titulo = txt(o.titulo, 120);
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
            if (r) q.respuesta = r;
            else delete q.respuesta;
          }
          return null;
        }
        case "confirmarNivel": {
          if (!o.dimensionId || o.dimensionId.length > 20) return "Dimensión inválida.";
          if (o.nivel === null) {
            delete c.escala[o.dimensionId];
            return null;
          }
          if (!LETRAS.has(o.nivel)) return "Nivel inválido.";
          c.escala[o.dimensionId] = { nivel: o.nivel, ...(txt(o.nota, 400) ? { nota: txt(o.nota, 400) } : {}) };
          return null;
        }
        case "editar":
        case "quitar":
          return editarOQuitar(c, o);
      }
    })();
    if (error) return { ok: false, error };
  }
  return { ok: true, contenido: c, descartadas: [...descartadas] };
}

const CAMPOS_EDITABLES: Record<string, Record<string, number>> = {
  noRepreguntar: { texto: 600, fuente: 200 },
  fueraDeAlcance: { texto: 600, fuente: 200 },
  resultados: { que: 300, quien: 200, paraQue: 400 },
  personas: { nombre: 120, sabe: 400 },
  sesiones: { titulo: 120, objetivo: 400, conQuien: 300 },
  hallazgo: { texto: 600 },
  pregunta: { texto: 400, repregunta: 300 },
};

function editarOQuitar(c: ContenidoDeGuia, o: Extract<OperacionDeGuia, { op: "editar" | "quitar" }>): string | null {
  // Hallazgos (por equipo) y preguntas (dentro de una sesión) se buscan por id en su contenedor.
  if (o.lista === "hallazgo") {
    for (const e of Object.values(c.equipos)) {
      for (const lista of [e?.opera, e?.trabas]) {
        const i = lista?.findIndex((h) => h.id === o.id) ?? -1;
        if (lista && i >= 0) {
          if (o.op === "quitar") lista.splice(i, 1);
          else editarCampos(lista[i] as unknown as Record<string, unknown>, o.campos, CAMPOS_EDITABLES.hallazgo);
          return null;
        }
      }
    }
    return "Ese hallazgo ya no está.";
  }
  if (o.lista === "sesiones") {
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
          // ⛔ Lo que el CSE ya preguntó no se borra (es el mismo principio que regenerar).
          if (s.preguntas[i].hecha) return "Esa pregunta ya se hizo: no se borra.";
          s.preguntas.splice(i, 1);
        } else editarCampos(s.preguntas[i] as unknown as Record<string, unknown>, o.campos, CAMPOS_EDITABLES.pregunta);
        return null;
      }
    }
    return "Esa sesión ya no está.";
  }
  const lista = c[o.lista] as unknown as Array<Record<string, unknown> & { id: string }>;
  const i = lista.findIndex((x) => x.id === o.id);
  if (i < 0) return "Ese elemento ya no está.";
  if (o.op === "quitar") {
    lista.splice(i, 1);
    return null;
  }
  editarCampos(lista[i], o.campos, CAMPOS_EDITABLES[o.lista] ?? {});
  // Campos especiales (no texto): rol, confirmado, alcance.
  if (o.lista === "personas") {
    const p = lista[i] as unknown as Persona;
    if ("rol" in o.campos) p.rol = ROLES.includes(o.campos.rol as RolDePersona) ? (o.campos.rol as RolDePersona) : null;
    if ("confirmado" in o.campos) p.confirmado = o.campos.confirmado === true;
  }
  if (o.lista === "resultados" && "alcance" in o.campos) {
    const a = o.campos.alcance;
    (lista[i] as unknown as Resultado).alcance = a === "fuera" || a === "duda" ? a : "dentro";
  }
  return null;
}

function editarCampos(destino: Record<string, unknown>, campos: Record<string, unknown>, permitidos: Record<string, number>) {
  for (const [k, max] of Object.entries(permitidos)) {
    if (k in campos) destino[k] = txt(campos[k], max);
  }
}

// ── Lectura tolerante (la columna es de la base) ─────────────────────────────

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(esObj) : []);
const s = (x: unknown, max = 2000) => (typeof x === "string" ? x.slice(0, max) : "");

export function leerContenido(raw: unknown): ContenidoDeGuia {
  const r = esObj(raw) ? raw : {};
  const equipos: ContenidoDeGuia["equipos"] = {};
  if (esObj(r.equipos)) {
    for (const k of EQUIPOS) {
      const e = (r.equipos as Record<string, unknown>)[k];
      if (!esObj(e)) continue;
      const h = (x: unknown) => arr(x).flatMap((i) => (s(i.id) && s(i.texto) ? [{ id: s(i.id), texto: s(i.texto), confirmado: i.confirmado !== false }] : []));
      equipos[k] = { opera: h(e.opera), trabas: h(e.trabas) };
    }
  }
  const escala: Record<string, NivelConfirmado> = {};
  if (esObj(r.escala)) {
    for (const [k, v] of Object.entries(r.escala)) {
      if (esObj(v) && LETRAS.has(s(v.nivel))) escala[k] = { nivel: s(v.nivel), ...(s(v.nota) ? { nota: s(v.nota) } : {}) };
    }
  }
  const dato = (x: unknown): Dato[] => arr(x).flatMap((i) => (s(i.id) && s(i.texto) ? [{ id: s(i.id), texto: s(i.texto), ...(s(i.fuente) ? { fuente: s(i.fuente) } : {}) }] : []));
  return {
    noRepreguntar: dato(r.noRepreguntar),
    fueraDeAlcance: dato(r.fueraDeAlcance),
    resultados: arr(r.resultados).flatMap((i) =>
      s(i.id) && s(i.que)
        ? [{ id: s(i.id), que: s(i.que), quien: s(i.quien), paraQue: s(i.paraQue), alcance: (i.alcance === "fuera" || i.alcance === "duda" ? i.alcance : "dentro") as Alcance, confirmado: i.confirmado !== false }]
        : [],
    ),
    equipos,
    escala,
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
                  ? [{ id: s(q.id), texto: s(q.texto), ...(s(q.repregunta) ? { repregunta: s(q.repregunta) } : {}), ...(s(q.objetivo) ? { objetivo: s(q.objetivo) } : {}), hecha: q.hecha === true, ...(s(q.respuesta) ? { respuesta: s(q.respuesta) } : {}) }]
                  : [],
              ),
            },
          ]
        : [],
    ),
    personas: arr(r.personas).flatMap((p) =>
      s(p.id) && s(p.nombre)
        ? [{ id: s(p.id), nombre: s(p.nombre), rol: ROLES.includes(p.rol as RolDePersona) ? (p.rol as RolDePersona) : null, sabe: s(p.sabe), confirmado: p.confirmado === true }]
        : [],
    ),
  };
}

export function leerPropuesta(raw: unknown): PropuestaDeGuia {
  const r = esObj(raw) ? raw : {};
  return {
    items: arr(r.items).flatMap((i) =>
      s(i.id) && esObj(i.destino) && esObj(i.valor)
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
