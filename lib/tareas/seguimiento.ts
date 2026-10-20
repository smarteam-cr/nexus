/**
 * lib/tareas/seguimiento.ts — de los COMPROMISOS de una reunión a propuestas de Tarea (memoria de la cuenta, etapa 2).
 * PURO: no lee la base; lo que necesita (quién es el CSE, quién lleva la preventa) se lo pasa quien llama.
 *
 * La lectura de seguimiento de cada reunión (lib/sessions/post-process.ts) deja sus compromisos, ya con la cita
 * verificada. Acá se decide a quién le llega cada uno (decisión 7 de Elías, DECISIONS «La lectura de cada reunión es
 * durable…»):
 *   · lo que se comprometió SMARTEAM → propuesta para quien lo dijo: su correo si es del equipo activo, o su nombre si
 *     se resuelve con seguridad; si no, «Por asignar» del equipo de la lectura;
 *   · lo que prometió el CLIENTE → TAREA DE SEGUIMIENTO para el CSE del proyecto («Recordarle a Ana que envíe la base»),
 *     con la marca «frena el plan» si aplica. Sin CSE activo, «Por asignar» de Customer Success. En un prospecto, para
 *     quien lleva la preventa viva (sin responsable, «Por asignar» de Ventas); sin preventa, no se propone.
 *
 * Nada entra solo: todo nace PROPUESTA (o «Por asignar»), por el único escritor (`escribirPropuestasDeLectura`,
 * lib/tareas/mutaciones.ts, vía `escribirSalidaDeSeguimiento`). El `lineaId` empieza con `seg-`: no choca con una línea
 * de las notas de Tareas (una huella) ni de la conversación (`c:`), así una misma reunión leída por los dos caminos no
 * se pisa, y releerla no duplica (el `origenId` es `l:<lectura>:<lineaId>`).
 *
 * ⛔ La cita va en la tarea (se sirve con su regla, lib/tareas/serializar.ts), NUNCA en `sugerido`: eso va al evento.
 *
 * UN SEGUIMIENTO POR REUNIÓN Y CUENTA (Elías, 2026-10-19). Lo que prometió el cliente en una misma reunión (o un mismo
 * correo) y le llega a la misma persona es UNA tarea de seguimiento, con la lista de lo pendiente en su contexto:
 * «Seguimiento con Honda Costa Rica: 3 cosas que prometió Randall (lun 12 oct)». Medido ese día: 27 propuestas de
 * seguimiento en 15 reuniones; Caroline Bersot tenía tres «Recordarle / Verificar con Randall…» de la misma reunión.
 * Lo que se comprometió Smarteam sigue una por una: es trabajo distinto, a veces de personas distintas. El título lleva
 * el día para que dos reuniones de la misma cuenta no se junten por la huella del título (escribirPropuestasDeLectura).
 *
 * POCOS Y ESENCIALES (Elías, 2026-10-19). Antes de armar nada, `elegirLoEsencial` deja lo que alguien de verdad tiene que
 * hacer: saca lo que la lectura marcó como menor (salvo lo que frena el plan), pasa a Smarteam lo que el cliente espera
 * de Smarteam aunque lo haya dicho el cliente («quedamos atentos a que nos envíes el reporte») y ordena lo más
 * importante primero, porque el tope por persona (3 en una reunión con un cliente) toma en ese orden. Y lo que una
 * persona ya descartó en la cuenta no vuelve (`descartados`, lib/tareas/descartadas.ts).
 */
import type { CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import type { PropuestaDeLectura } from "./mutaciones";
import { claveDeEquipo, type MiembroDelEquipo } from "./equipos";
import { resolverPersona } from "./personas";
import { yaSeDescarto } from "./descartadas";
import { MAX_TITULO } from "./reglas";
import type { Tema } from "./tema";
import { diaCortoConSemana, horaDeCostaRica, lunesDeFecha, semanaDeLaReunion } from "./semana";
import { huellaDeTexto, normalizar } from "./texto";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";

export interface EntradaDeSeguimiento {
  /** Ya con la cita verificada (lib/sessions/lectura-salida.ts, `verificarCitas`). */
  compromisos: readonly CompromisoDetectado[];
  lectura: { id: string; equipo: string };
  reunion: { id: string; inicio: Date; participantes: readonly string[] };
  /** El equipo activo, sin bajas ni la cuenta de prueba (`miembrosActivos`). */
  miembros: readonly MiembroDelEquipo[];
  /** El dueño del proyecto principal en HubSpot (`Project.hubspotOwnerEmail`), si lo hay. */
  cseDelProyecto: string | null;
  /** Sin proyecto principal: el que más proyectos activos lleva en la cuenta. */
  cseDeLaCuenta: string | null;
  /**
   * La preventa viva de un prospecto: `undefined` = no hay ninguna; `null` = la hay, pero sin responsable; un correo =
   * quien la lleva.
   */
  responsableDeLaPreventa?: string | null;
  clientId: string;
  /** El nombre de la cuenta: va en el título del seguimiento agrupado. */
  empresa?: string | null;
  projectId: string | null;
  ruta: "completa" | "prospecto";
  /**
   * De dónde salió: una reunión (lo de siempre) o un correo que mandó Smarteam (iniciativa B, lib/comunicaciones). En un
   * correo, `reunion` es el correo (su id, su fecha y quien lo mandó) y lo que se comprometió Smarteam sin decir quién lo
   * lleva va a quien lo mandó.
   */
  fuente?: FuenteDelCompromiso;
  /**
   * Los temas que alguien ya descartó en esta cuenta (lib/tareas/lectura.ts › `descartesDeLaCuenta`): lo que habla de
   * uno de ellos no se propone, sin plazo. Se mira cada compromiso ANTES de juntar lo del cliente.
   */
  descartados?: readonly Tema[][];
}

export type FuenteDelCompromiso = { tipo: "reunion" } | { tipo: "correo"; asunto: string | null; autorEmail: string | null };

export interface ArmadoDeSeguimiento {
  propuestas: PropuestaDeLectura[];
  /** Lo que prometió un prospecto sin preventa viva: no se propone (no hay a quién). */
  sinDestino: number;
  /** Lo que repetía un tema que alguien ya descartó en la cuenta. */
  yaDescartados: number;
}

export const PREFIJO_DE_SEGUIMIENTO = "seg-";

/** El id estable de un compromiso dentro de su lectura: el lado y la huella de qué se comprometió. */
export function lineaDeSeguimiento(c: Pick<CompromisoDetectado, "quien" | "que">): string {
  return `${PREFIJO_DE_SEGUIMIENTO}${c.quien === "CLIENTE" ? "c" : "s"}-${huellaDeTexto(c.que)}`;
}

const recortar = (t: string) => (t.length > MAX_TITULO ? `${t.slice(0, MAX_TITULO - 1).trimEnd()}…` : t);
const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Tope del título de una tarea de Smarteam que escribe la lectura (la forma «Verbo + qué + a quién»). */
export const MAX_TITULO_DEL_COMPROMISO = 90;

/**
 * ¿Sirve el título que escribió el modelo? «Verbo + qué + a quién o la cuenta»: empieza con un infinitivo (con o sin
 * pronombre: «Enviarle»), no pasa de `MAX_TITULO_DEL_COMPROMISO` y no trae voseo. Si no sirve, el título sale de `que`.
 */
export function tituloValido(titulo: string | null | undefined): boolean {
  const t = titulo?.trim() ?? "";
  if (t.length < 8 || t.length > MAX_TITULO_DEL_COMPROMISO) return false;
  const primera = normalizar(t).split(" ")[0] ?? "";
  if (!/(ar|er|ir)(le|les|lo|la|los|las|nos|se|me|te)?$/.test(primera)) return false;
  return voseoEnProsa(t).length === 0;
}

/** El título de la tarea: el que escribió el modelo, o el de respaldo (también cuando el del modelo traía voseo). */
export function tituloDelCompromiso(c: Pick<CompromisoDetectado, "quien" | "que" | "tituloDeSeguimiento" | "titulo">): string {
  if (c.quien === "CLIENTE") return recortar(c.tituloDeSeguimiento?.trim() || `Seguimiento: ${c.que}`);
  if (tituloValido(c.titulo)) return recortar(conMayuscula(c.titulo!.trim().replace(/[.;]+$/, "")));
  return recortar(conMayuscula(c.que.trim()));
}

/**
 * ¿Lo que «prometió el cliente» es en realidad lo que el cliente ESPERA DE SMARTEAM? «El cliente queda atento a que
 * Smarteam envíe el reporte», «Esperan que les enviemos la propuesta». Es un pendiente de Smarteam, no un seguimiento.
 * Conservador: solo con «atento(s) a que» o «espera(n) que», y con Smarteam (o «nos/les/le») como quien lo hace.
 */
export function loEsperaDeSmarteam(c: Pick<CompromisoDetectado, "quien" | "que" | "tituloDeSeguimiento">): boolean {
  if (c.quien !== "CLIENTE") return false;
  const t = normalizar(`${c.que} ${c.tituloDeSeguimiento ?? ""}`);
  const espera = /\b(atent[oa]s? a (que|recibir)|espera[n]? (que|recibir)|esperando (que|a que|recibir))\b/.test(t);
  if (!espera) return false;
  return /\b(smarteam|el equipo de smarteam|nos (env|mand|compart|pas)|les (env|mand|compart|pas)|le (env|mand|compart|pas)|(enviemos|mandemos|compartamos|preparemos|entreguemos))/.test(t);
}

export interface LoEsencial {
  /** Lo que se propone, lo más importante primero. */
  quedan: CompromisoDetectado[];
  /** Lo que la lectura marcó como menor: no se propone. */
  menores: CompromisoDetectado[];
  /** Cuántos pasaron de «lo prometió el cliente» a Smarteam (`loEsperaDeSmarteam`). */
  aSmarteam: number;
}

/** El peso para ordenar: lo que frena el plan, después lo que tiene fecha, después lo de Smarteam. Estable. */
function peso(c: CompromisoDetectado): number {
  return (c.frenaElPlan ? 0 : 4) + (c.fecha ? 0 : 2) + (c.quien === "SMARTEAM" ? 0 : 1);
}

/**
 * Pocos y esenciales: saca lo menor (lo que frena el plan se queda siempre), pasa a Smarteam lo que el cliente espera de
 * Smarteam y ordena. PURO: lo usan la lectura de cada reunión, la de cada correo y scripts/comparar-pendientes-de-reuniones.ts.
 */
export function elegirLoEsencial(compromisos: readonly CompromisoDetectado[]): LoEsencial {
  let aSmarteam = 0;
  const vistos = compromisos.map((c, i) => {
    if (!loEsperaDeSmarteam(c)) return { c, i };
    aSmarteam++;
    return { c: { ...c, quien: "SMARTEAM" as const, tituloDeSeguimiento: null, ownerEmail: null, responsable: "", esperaElCliente: true }, i };
  });
  const menores = vistos.filter((x) => x.c.esencial === false && !x.c.frenaElPlan).map((x) => x.c);
  const quedan = vistos
    .filter((x) => !(x.c.esencial === false && !x.c.frenaElPlan))
    .sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i)
    .map((x) => x.c);
  return { quedan, menores, aSmarteam };
}

/** Lo escribe el código (no el modelo): para qué es, de quién vino y si frena el plan. Tuteo. */
export function contextoDelCompromiso(c: CompromisoDetectado, inicio: Date, fuente: FuenteDelCompromiso = { tipo: "reunion" }): string {
  const dia = diaCortoConSemana(horaDeCostaRica(inicio).fecha);
  const para = c.fecha ? ` Para el ${diaCortoConSemana(c.fecha)}.` : "";
  const que = c.que.trim().replace(/[.;]+$/, "");
  const donde = fuente.tipo === "correo" ? `en el correo del ${dia}${fuente.asunto ? ` «${fuente.asunto}»` : ""}` : `en la reunión del ${dia}`;
  if (c.quien === "CLIENTE") {
    const quien = c.responsable ? `${c.responsable} (del cliente)` : "el cliente";
    const frena = c.frenaElPlan ? " Frena el plan: sin esto, el proyecto no avanza." : "";
    return `Lo prometió ${quien} ${donde}: ${que}.${para}${frena}`;
  }
  const quien = c.responsable ? `, lo dijo ${c.responsable}` : "";
  return `Compromiso de Smarteam ${donde}${quien}: ${que}.${para}`;
}

/** El `lineaId` del seguimiento que junta lo que prometió el cliente para una persona (o para «Por asignar» de un equipo). */
export function lineaDelSeguimientoAgrupado(destino: string): string {
  return `${PREFIJO_DE_SEGUIMIENTO}c-g-${huellaDeTexto(destino)}`;
}

/** Una cosa que prometió el cliente, como la lee el seguimiento agrupado. */
export interface PendienteDelCliente {
  que: string;
  /** Quién del cliente lo prometió, tal como se dijo. */
  quien: string | null;
  fecha: string | null;
  frenaElPlan: boolean;
  cita: string;
}

export interface SeguimientoAgrupado {
  titulo: string;
  contexto: string;
  cita: string;
  venceEl: string | null;
  frenaElPlan: boolean;
}

const primerNombre = (t: string) => t.trim().split(/\s+/)[0] ?? t;

/**
 * Lo que prometió el cliente en una reunión, junto: el título dice cuántas cosas y de quién; el contexto, la lista. PURO:
 * lo usan la lectura (al proponer) y scripts/agrupar-seguimientos-propuestos.ts (lo que ya estaba propuesto).
 */
export function seguimientoAgrupado(items: readonly PendienteDelCliente[], o: { empresa?: string | null; inicio: Date; fuente?: FuenteDelCompromiso }): SeguimientoAgrupado {
  const dia = diaCortoConSemana(horaDeCostaRica(o.inicio).fecha);
  const personas = [...new Set(items.map((i) => i.quien?.trim()).filter((x): x is string => !!x))];
  const quien = personas.length === 1 ? personas[0]! : null;
  const n = items.length;
  const cosas = n === 1 ? "1 cosa" : `${n} cosas`;
  const titulo = recortar(`Seguimiento${o.empresa ? ` con ${o.empresa}` : ""}: ${cosas} que prometió ${quien ? primerNombre(quien) : "el cliente"} (${dia})`);
  const donde = o.fuente?.tipo === "correo" ? `en el correo del ${dia}${o.fuente.asunto ? ` «${o.fuente.asunto}»` : ""}` : `en la reunión del ${dia}`;
  const de = quien ? `${quien} (del cliente)` : "el cliente";
  const lineas = items.map((i) => {
    const que = conMayuscula(i.que.trim().replace(/[.;]+$/, ""));
    // Sin repetir el nombre si la línea ya empieza con él («Kevin Orozco: Kevin Orozco debe…»).
    const autor = !quien && i.quien && !normalizar(que).startsWith(normalizar(i.quien)) ? `${i.quien}: ` : "";
    const para = i.fecha ? ` (para el ${diaCortoConSemana(i.fecha)})` : "";
    return `• ${autor}${que}${para}${i.frenaElPlan ? " · frena el plan" : ""}`;
  });
  const frenaElPlan = items.some((i) => i.frenaElPlan);
  const contexto = [`Lo prometió ${de} ${donde}. Lo que falta:`, ...lineas].join("\n");
  const fechas = items.flatMap((i) => (i.fecha ? [i.fecha] : [])).sort();
  return { titulo, contexto, cita: items.map((i) => i.cita.trim()).filter(Boolean).join(" … "), venceEl: fechas[0] ?? null, frenaElPlan };
}

/** Junta en una sola propuesta lo que prometió el cliente para el mismo destino (dos o más). Lo de Smarteam no se toca. */
function agruparLoDelCliente(propuestas: PropuestaDeLectura[], delCliente: Map<PropuestaDeLectura, CompromisoDetectado>, e: EntradaDeSeguimiento): PropuestaDeLectura[] {
  const destinoDe = (p: PropuestaDeLectura) => (p.responsableEmail ? p.responsableEmail : `asignar:${p.equipo}`);
  const grupos = new Map<string, PropuestaDeLectura[]>();
  for (const p of propuestas) if (delCliente.has(p)) grupos.set(destinoDe(p), [...(grupos.get(destinoDe(p)) ?? []), p]);
  const salida: PropuestaDeLectura[] = [];
  const hechos = new Set<string>();
  for (const p of propuestas) {
    if (!delCliente.has(p)) {
      salida.push(p);
      continue;
    }
    const destino = destinoDe(p);
    const grupo = grupos.get(destino)!;
    if (grupo.length < 2) {
      salida.push(p);
      continue;
    }
    if (hechos.has(destino)) continue;
    hechos.add(destino);
    const items = grupo.map((g) => {
      const c = delCliente.get(g)!;
      return { que: c.que, quien: c.responsable || null, fecha: c.fecha, frenaElPlan: c.frenaElPlan, cita: c.cita };
    });
    const a = seguimientoAgrupado(items, { empresa: e.empresa, inicio: e.reunion.inicio, fuente: e.fuente });
    const semanas = grupo.flatMap((g) => (g.semana ? [g.semana] : [])).sort();
    const personas = [...new Set(items.map((i) => i.quien).filter((x): x is string => !!x))];
    // De quién del cliente es, solo si es una sola persona.
    const resto = { ...p.sugerido };
    delete resto.responsableDelCliente;
    salida.push({
      ...p,
      lineaId: lineaDelSeguimientoAgrupado(destino),
      titulo: a.titulo,
      contexto: a.contexto,
      cita: a.cita,
      venceEl: a.venceEl,
      semana: p.porAsignar ? null : (semanas[0] ?? p.semana),
      sugerido: {
        ...resto,
        frenaElPlan: a.frenaElPlan,
        agrupa: grupo.length,
        ...(personas.length === 1 ? { responsableDelCliente: personas[0] } : {}),
      },
    });
  }
  return salida;
}

export function armarPropuestasDeSeguimiento(e: EntradaDeSeguimiento): ArmadoDeSeguimiento {
  const activos = new Map(e.miembros.map((m) => [m.email.toLowerCase(), m]));
  const activo = (email: string | null | undefined) => (email ? (activos.get(email.toLowerCase()) ?? null) : null);
  const semanaDeLaReunionDe = semanaDeLaReunion(e.reunion.inicio);
  const propuestas: PropuestaDeLectura[] = [];
  const delCliente = new Map<PropuestaDeLectura, CompromisoDetectado>();
  const vistas = new Set<string>();
  let sinDestino = 0;
  let yaDescartados = 0;

  for (const c of e.compromisos) {
    const lineaId = lineaDeSeguimiento(c);
    if (vistas.has(lineaId)) continue;
    if (e.descartados?.length && yaSeDescarto([tituloDelCompromiso(c), c.que], e.descartados, e.empresa)) {
      yaDescartados++;
      continue;
    }

    // ¿A quién le llega? `null` = «Por asignar» del equipo `equipoSinResponsable`.
    let responsable: MiembroDelEquipo | null = null;
    let equipoSinResponsable = e.lectura.equipo;
    const sugerido: PropuestaDeLectura["sugerido"] = {
      lado: c.quien === "CLIENTE" ? "cliente" : "smarteam",
      tipo: c.tipo,
      frenaElPlan: c.frenaElPlan,
      seguimiento: true,
      ...(e.fuente?.tipo === "correo" ? { deUnCorreo: true } : {}),
    };

    if (c.quien === "SMARTEAM") {
      // El nombre que se dijo manda sobre el correo que eligió el modelo, si los dos apuntan a personas distintas.
      const porNombre = c.responsable ? resolverPersona(c.responsable, [...activos.values()], e.reunion.participantes) : null;
      const delNombre = porNombre?.tipo === "seguro" ? activo(porNombre.email) : null;
      responsable = delNombre ?? activo(c.ownerEmail);
      // En un correo, sin saber quién lo lleva, es de quien lo mandó: escribió «te envío…».
      if (!responsable && e.fuente?.tipo === "correo") responsable = activo(e.fuente.autorEmail);
      // Lo que el cliente espera de Smarteam, sin nombre: es de quien lleva la cuenta (o la preventa).
      if (!responsable && c.esperaElCliente) responsable = e.ruta === "completa" ? (activo(e.cseDelProyecto) ?? activo(e.cseDeLaCuenta)) : activo(e.responsableDeLaPreventa);
      if (!responsable && c.esperaElCliente) equipoSinResponsable = e.ruta === "completa" ? "cs" : "ventas";
      if (!responsable && c.responsable) sugerido.responsableDicho = c.responsable;
    } else if (e.ruta === "completa") {
      responsable = activo(e.cseDelProyecto) ?? (e.cseDelProyecto ? null : activo(e.cseDeLaCuenta));
      equipoSinResponsable = "cs";
      if (c.responsable) sugerido.responsableDelCliente = c.responsable;
    } else {
      // Un prospecto: el seguimiento es de quien lleva la preventa viva. Sin preventa, no hay a quién (decisión de Elías).
      if (e.responsableDeLaPreventa === undefined) {
        sinDestino++;
        continue;
      }
      responsable = activo(e.responsableDeLaPreventa);
      equipoSinResponsable = "ventas";
      if (c.responsable) sugerido.responsableDelCliente = c.responsable;
    }
    vistas.add(lineaId);

    const porAsignar = !responsable;
    // La semana: la de la fecha comprometida, salvo que caiga antes que la de la reunión.
    const semanaDeLaFecha = c.fecha ? lunesDeFecha(c.fecha) : null;
    const semana = semanaDeLaFecha && semanaDeLaFecha > semanaDeLaReunionDe ? semanaDeLaFecha : semanaDeLaReunionDe;

    const propuesta: PropuestaDeLectura = {
      lineaId,
      titulo: tituloDelCompromiso(c),
      // El detalle es texto de la reunión: vive en la cita, que se sirve con su regla. Las notas arrancan vacías.
      notas: null,
      contexto: contextoDelCompromiso(c, e.reunion.inicio, e.fuente),
      cita: c.cita,
      responsableEmail: responsable ? responsable.email.toLowerCase() : null,
      equipo: responsable ? claveDeEquipo(responsable.area, responsable.email) : equipoSinResponsable,
      semana: porAsignar ? null : semana,
      venceEl: c.fecha,
      clientId: e.clientId,
      projectId: e.projectId,
      proyectoId: null,
      pedidaPorEmail: null,
      pedidaPorEquipo: null,
      mismaQueId: null,
      sugerido,
      porAsignar,
    };
    propuestas.push(propuesta);
    if (c.quien === "CLIENTE") delCliente.set(propuesta, c);
  }
  return { propuestas: agruparLoDelCliente(propuestas, delCliente, e), sinDestino, yaDescartados };
}

/* ── Lo que ya estaba propuesto (scripts/agrupar-seguimientos-propuestos.ts) ─────────────────────────────────── */

/**
 * De una tarea de seguimiento suelta que ya existe, lo que necesita el seguimiento agrupado. El contexto lo escribió el
 * código (`contextoDelCompromiso`), así que se lee de ahí; si no se reconoce, el título hace de «qué».
 */
export function pendienteDesdeLaTarea(t: { titulo: string; contexto: string | null; venceEl: string | null; cita: string | null }): PendienteDelCliente {
  const m = t.contexto?.match(/^Lo prometió (.+?) en (?:la reunión|el correo) del [^:]*?: (.+?)\.(?: Para el [^.]+\.)?(?: Frena el plan.*)?$/);
  const quienCrudo = m?.[1] ?? null;
  const quien = quienCrudo && quienCrudo !== "el cliente" ? quienCrudo.replace(/ \(del cliente\)$/, "") : null;
  return {
    que: m?.[2]?.trim() || t.titulo,
    quien,
    fecha: t.venceEl,
    frenaElPlan: !!t.contexto?.includes("Frena el plan"),
    cita: t.cita ?? "",
  };
}

/** ¿El `origenId` es un seguimiento SUELTO de lo que prometió el cliente (no uno que ya junta varios)? */
export function esSeguimientoSueltoDelCliente(origenId: string | null): boolean {
  if (!origenId || origenId.includes(":retirada:")) return false;
  return origenId.includes(`:${PREFIJO_DE_SEGUIMIENTO}c-`) && !origenId.includes(`:${PREFIJO_DE_SEGUIMIENTO}c-g-`);
}
