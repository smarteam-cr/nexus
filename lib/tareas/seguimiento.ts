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
 */
import type { CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import type { PropuestaDeLectura } from "./mutaciones";
import { claveDeEquipo, type MiembroDelEquipo } from "./equipos";
import { resolverPersona } from "./personas";
import { MAX_TITULO } from "./reglas";
import { diaCortoConSemana, horaDeCostaRica, lunesDeFecha, semanaDeLaReunion } from "./semana";
import { huellaDeTexto } from "./texto";

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
  projectId: string | null;
  ruta: "completa" | "prospecto";
  /**
   * De dónde salió: una reunión (lo de siempre) o un correo que mandó Smarteam (iniciativa B, lib/comunicaciones). En un
   * correo, `reunion` es el correo (su id, su fecha y quien lo mandó) y lo que se comprometió Smarteam sin decir quién lo
   * lleva va a quien lo mandó.
   */
  fuente?: FuenteDelCompromiso;
}

export type FuenteDelCompromiso = { tipo: "reunion" } | { tipo: "correo"; asunto: string | null; autorEmail: string | null };

export interface ArmadoDeSeguimiento {
  propuestas: PropuestaDeLectura[];
  /** Lo que prometió un prospecto sin preventa viva: no se propone (no hay a quién). */
  sinDestino: number;
}

export const PREFIJO_DE_SEGUIMIENTO = "seg-";

/** El id estable de un compromiso dentro de su lectura: el lado y la huella de qué se comprometió. */
export function lineaDeSeguimiento(c: Pick<CompromisoDetectado, "quien" | "que">): string {
  return `${PREFIJO_DE_SEGUIMIENTO}${c.quien === "CLIENTE" ? "c" : "s"}-${huellaDeTexto(c.que)}`;
}

const recortar = (t: string) => (t.length > MAX_TITULO ? `${t.slice(0, MAX_TITULO - 1).trimEnd()}…` : t);
const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** El título de la tarea: el que escribió el modelo, o el de respaldo (también cuando el del modelo traía voseo). */
export function tituloDelCompromiso(c: Pick<CompromisoDetectado, "quien" | "que" | "tituloDeSeguimiento">): string {
  if (c.quien === "CLIENTE") return recortar(c.tituloDeSeguimiento?.trim() || `Seguimiento: ${c.que}`);
  return recortar(conMayuscula(c.que.trim()));
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

export function armarPropuestasDeSeguimiento(e: EntradaDeSeguimiento): ArmadoDeSeguimiento {
  const activos = new Map(e.miembros.map((m) => [m.email.toLowerCase(), m]));
  const activo = (email: string | null | undefined) => (email ? (activos.get(email.toLowerCase()) ?? null) : null);
  const semanaDeLaReunionDe = semanaDeLaReunion(e.reunion.inicio);
  const propuestas: PropuestaDeLectura[] = [];
  const vistas = new Set<string>();
  let sinDestino = 0;

  for (const c of e.compromisos) {
    const lineaId = lineaDeSeguimiento(c);
    if (vistas.has(lineaId)) continue;

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

    propuestas.push({
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
    });
  }
  return { propuestas, sinDestino };
}
