/**
 * lib/tareas/chat/lineas.ts — lo que la persona LEE antes de aplicar (docs/tareas-plan.md §6.5.3). PURO.
 *
 * Una línea por operación, armada en el servidor desde los ids (nunca desde lo que escribió el modelo): la fecha ya
 * calculada, la semana real, quién decide y «parecida a T-12» si hay una abierta parecida. El mismo texto le llega al
 * modelo en el bloque de pendientes («un solo traductor para los dos lectores»), con la ref de lo nuevo a la vista.
 * También el rótulo de cada operación, para que el botón diga lo que hace («Crear 6 tareas»).
 */
import { nombreDelEquipo } from "../equipos";
import { diaCortoConSemana, nombreDeLaSemana } from "../semana";
import { parecidaA, semanaReal, type CuandoCalculado, type FotoDeTareas, type OperacionDeTareas, type ParaQuienDelChat, type RefAProyecto, type RefATarea } from "./operaciones";

const NOMBRE_DEL_CAMPO: Record<string, string> = {
  titulo: "el título",
  prioridad: "la prioridad",
  vence: "la fecha límite",
  minutos: "las horas",
  notas: "las notas",
  etiquetas: "las etiquetas",
  cliente: "el cliente",
  proyecto: "el proyecto",
  seccion: "la sección",
  nombre: "el nombre",
  responsable: "el responsable",
  secciones: "las secciones",
  estado: "el estado",
};

function horas(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;
}

function nombreDe(foto: FotoDeTareas, email: string): string {
  return email === foto.yo.email ? "ti" : (foto.personasPorEmail.get(email)?.nombre ?? email);
}

function cuando(foto: FotoDeTareas, para: ParaQuienDelChat, c: CuandoCalculado | undefined): string | null {
  if (!c) return null;
  if (!c.semana && !c.vence) return "más adelante";
  if (c.vence) return diaCortoConSemana(c.vence);
  const s = semanaReal(foto, para, c.semana);
  return s ? nombreDeLaSemana(s) : null;
}

/** Los nombres de lo que el mismo acuerdo crea (una tarea o un proyecto nuevo se nombra por su título). */
function nombresDelAcuerdo(ops: readonly OperacionDeTareas[]) {
  const tareas = new Map<string, string>();
  const proyectos = new Map<string, string>();
  for (const o of ops) {
    if (o.op === "tarea.crear" && o.ref) tareas.set(o.ref, o.titulo);
    if (o.op === "proyecto.crear") proyectos.set(o.ref, o.nombre);
  }
  return { tareas, proyectos };
}

function laTarea(foto: FotoDeTareas, r: RefATarea, n: ReturnType<typeof nombresDelAcuerdo>): string {
  if ("numero" in r) {
    const t = foto.tareas.get(r.numero);
    return t ? `T-${r.numero} «${t.titulo}»` : `T-${r.numero}`;
  }
  return `«${n.tareas.get(r.ref) ?? r.ref}» [${r.ref}]`;
}

function elProyecto(foto: FotoDeTareas, r: RefAProyecto, n: ReturnType<typeof nombresDelAcuerdo>): string {
  if ("id" in r) return `«${foto.proyectosPorId.get(r.id)?.nombre ?? "un proyecto"}»`;
  return `«${n.proyectos.get(r.ref) ?? r.ref}» [${r.ref}]`;
}

function paraQuienTexto(foto: FotoDeTareas, para: ParaQuienDelChat): { verbo: string; decide: string | null } {
  switch (para.tipo) {
    case "yo":
      return { verbo: "Crear", decide: null };
    case "nadie":
      return { verbo: "Crear, sin responsable,", decide: null };
    case "equipo":
      return { verbo: `Pedirle a ${nombreDelEquipo(para.clave)}`, decide: "le llega a su líder" };
    case "persona": {
      const p = foto.personasPorEmail.get(para.email);
      return { verbo: `Proponerle a ${p?.nombre ?? para.email}${p ? ` (${p.equipoNombre})` : ""}`, decide: `la decide ${p?.nombre.split(" ")[0] ?? "esa persona"}` };
    }
  }
}

/** Una línea por operación. */
export function describirOperacionesDeTareas(foto: FotoDeTareas, ops: readonly OperacionDeTareas[]): string[] {
  const n = nombresDelAcuerdo(ops);
  return ops.map((o) => {
    switch (o.op) {
      case "tarea.crear": {
        const p = paraQuienTexto(foto, o.para);
        const asigna = o.para.tipo === "persona" && o.modo === "asignar";
        const persona = o.para.tipo === "persona" ? (foto.personasPorEmail.get(o.para.email)?.nombre ?? o.para.email) : null;
        const cabeza = asigna ? `Asignarle a ${persona}` : p.verbo;
        const partes = [`${cabeza} «${o.titulo}»${o.ref ? ` [${o.ref}]` : ""}`];
        if (o.para.tipo === "yo") partes.push("para ti");
        if (o.dia && o.cuando?.vence) partes.push(`día hábil ${o.dia} · ${diaCortoConSemana(o.cuando.vence)}`);
        else {
          const c = cuando(foto, o.para, o.cuando);
          if (c) partes.push(c);
        }
        if (o.minutos) partes.push(horas(o.minutos));
        if (o.prioridad === "alta") partes.push("prioridad alta");
        if (o.proyecto) partes.push(`en ${elProyecto(foto, o.proyecto, n)}`);
        if (o.seccion) partes.push(`sección «${o.seccion}»`);
        if (o.clientId) partes.push(foto.nombresDeClientes.get(o.clientId) ?? "un cliente");
        if (o.projectId) partes.push(`proyecto de HubSpot «${foto.proyectosHubspotPorId.get(o.projectId)?.nombre ?? "—"}»`);
        if (o.despuesDe?.length) partes.push(`después de ${o.despuesDe.map((d) => laTarea(foto, d, n)).join(" y ")}`);
        if (o.etiquetas?.length) partes.push(o.etiquetas.map((e) => `#${e}`).join(" "));
        if (o.privada) partes.push("solo para ti");
        if (!asigna && p.decide) partes.push(p.decide);
        if (o.pidioAsignar) partes.push("no puedes asignársela directo: le llega como propuesta");
        if (o.para.tipo === "yo") {
          const parecida = parecidaA(foto, o.titulo);
          if (parecida) partes.push(`parecida a T-${parecida}`);
        }
        // El contexto se lee ENTERO antes de aplicar: es lo que va a ver quien la recibe, y lo que se guarda.
        return o.contexto ? `${partes.join(" · ")} — ${o.contexto}` : partes.join(" · ");
      }
      case "tarea.editar": {
        const valor =
          o.valor === null
            ? "nada"
            : o.campo === "vence"
              ? diaCortoConSemana(String(o.valor))
              : o.campo === "minutos"
                ? horas(Number(o.valor))
                : o.campo === "cliente"
                  ? (foto.nombresDeClientes.get(String(o.valor)) ?? "un cliente")
                  : o.campo === "proyecto"
                    ? `«${foto.proyectosPorId.get(String(o.valor))?.nombre ?? "un proyecto"}»`
                    : Array.isArray(o.valor)
                      ? o.valor.map((e) => `#${e}`).join(" ") || "ninguna"
                      : `«${o.valor}»`;
        return `Cambiar ${NOMBRE_DEL_CAMPO[o.campo]} de ${laTarea(foto, o.tarea, n)} a ${valor}`;
      }
      case "tarea.asignar": {
        const quien = o.para.tipo === "persona" ? nombreDe(foto, o.para.email) : "ti";
        if (o.para.tipo === "yo") return `Quedarte con ${laTarea(foto, o.tarea, n)}`;
        return o.modo === "asignar"
          ? `Asignarle ${laTarea(foto, o.tarea, n)} a ${quien}`
          : `Proponerle ${laTarea(foto, o.tarea, n)} a ${quien} · la decide ${quien.split(" ")[0]}${o.pidioAsignar ? " · no puedes asignársela directo" : ""}`;
      }
      case "tarea.mover-semana": {
        /* La semana de quien la tiene (su semana revisada no la ve quien pide), y sin el día: aplicar mueve la semana y
           no toca la fecha límite. */
        const t = "numero" in o.tarea ? foto.tareas.get(o.tarea.numero) : null;
        const de: ParaQuienDelChat = !t?.responsableEmail || t.responsableEmail === foto.yo.email ? { tipo: "yo" } : { tipo: "persona", email: t.responsableEmail };
        const c = cuando(foto, de, { semana: o.cuando.semana, vence: null });
        return `Pasar ${laTarea(foto, o.tarea, n)} a ${c === "más adelante" ? "«Más adelante»" : (c ?? "otra semana")}`;
      }
      case "tarea.depender":
        return `${laTarea(foto, o.tarea, n)} espera a ${o.despuesDe.map((d) => laTarea(foto, d, n)).join(" y ")}`;
      case "proyecto.crear": {
        /* «Borrador» solo si trae tareas: el aplicar lo deja en borrador cuando alguna tarea marcada va adentro; si no,
           nace activo. Dicho así («con sus tareas»), la línea sigue siendo cierta aunque se desmarquen todas. */
        const conTareas = ops.some((x) => x.op === "tarea.crear" && x.proyecto && "ref" in x.proyecto && x.proyecto.ref === o.ref);
        const partes = [`Crear el proyecto «${o.nombre}» [${o.ref}] en ${foto.espaciosPorId.get(o.espacioId)?.nombre ?? "tu espacio"}`];
        if (conTareas) partes.push("con sus tareas queda en borrador hasta que lo actives");
        if (o.clientId) partes.push(foto.nombresDeClientes.get(o.clientId) ?? "un cliente");
        if (o.inicia && o.vence) partes.push(`del ${diaCortoConSemana(o.inicia)} al ${diaCortoConSemana(o.vence)}`);
        else if (o.inicia) partes.push(`desde el ${diaCortoConSemana(o.inicia)}`);
        else if (o.vence) partes.push(`vence el ${diaCortoConSemana(o.vence)}`);
        if (o.responsableEmail) partes.push(`responsable: ${nombreDe(foto, o.responsableEmail)}`);
        if (o.secciones?.length) partes.push(`secciones: ${o.secciones.join(", ")}`);
        if (o.projectId) partes.push("el cronograma que ve el cliente no cambia");
        return partes.join(" · ");
      }
      case "proyecto.editar": {
        const valor =
          o.valor === null
            ? "nada"
            : o.campo === "vence"
              ? diaCortoConSemana(String(o.valor))
              : o.campo === "responsable"
                ? nombreDe(foto, String(o.valor))
                : Array.isArray(o.valor)
                  ? o.valor.join(", ")
                  : o.campo === "estado"
                    ? ({ activo: "activo", en_pausa: "en pausa", terminado: "terminado" }[String(o.valor)] ?? String(o.valor))
                    : `«${o.valor}»`;
        return `Cambiar ${NOMBRE_DEL_CAMPO[o.campo]} del proyecto ${elProyecto(foto, o.proyecto, n)} a ${valor}`;
      }
    }
  });
}

/* ── El botón ────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * La clase de cada operación, para el botón: «crear» (lo tuyo), «proponer:<nombre>», «asignar:<nombre>»,
 * «equipo:<nombre>», «proyecto», «plan» (una tarea dentro de un proyecto nuevo) o «cambio».
 */
export function rotulosDeOperaciones(foto: FotoDeTareas, ops: readonly OperacionDeTareas[]): string[] {
  const nuevos = new Set(ops.flatMap((o) => (o.op === "proyecto.crear" ? [o.ref] : [])));
  return ops.map((o) => {
    if (o.op === "proyecto.crear") return "proyecto";
    if (o.op !== "tarea.crear") return "cambio";
    if (o.proyecto && "ref" in o.proyecto && nuevos.has(o.proyecto.ref)) return "plan";
    if (o.para.tipo === "persona") return `${o.modo === "asignar" ? "asignar" : "proponer"}:${foto.personasPorEmail.get(o.para.email)?.nombre ?? o.para.email}`;
    if (o.para.tipo === "equipo") return `equipo:${nombreDelEquipo(o.para.clave)}`;
    return "crear";
  });
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Lo que dice el botón sobre lo que quedó marcado: «Crear 6 tareas», «Mandarle la sugerencia a Marco Salas»… */
export function textoDelBotonDeTareas(rotulos: readonly string[] | undefined, desmarcadas: ReadonlySet<number>): string | null {
  if (!rotulos?.length) return null;
  const marcados = rotulos.filter((_, i) => !desmarcadas.has(i));
  if (!marcados.length) return null;
  const cuenta = (pref: string) => marcados.filter((r) => r === pref || r.startsWith(`${pref}:`));
  const proyecto = cuenta("proyecto").length;
  const plan = cuenta("plan").length;
  // Sin tareas marcadas adentro, el proyecto nace activo: el botón no dice «borrador».
  if (proyecto === 1 && marcados.length === 1 + plan) return plan ? `Crear el borrador del proyecto y ${plan === 1 ? "su tarea" : `sus ${plan} tareas`}` : "Crear el proyecto";
  const propuestas = cuenta("proponer");
  const nombres = [...new Set(propuestas.map((r) => r.slice("proponer:".length)))];
  if (propuestas.length === marcados.length && nombres.length === 1) return propuestas.length === 1 ? `Mandarle la sugerencia a ${nombres[0]}` : `Mandarle las ${propuestas.length} sugerencias a ${nombres[0]}`;
  const crear = cuenta("crear").length + cuenta("asignar").length + cuenta("equipo").length + propuestas.length + plan;
  if (crear === marcados.length) return `Crear ${plural(crear, "tarea", "tareas")}`;
  return `Aplicar ${plural(marcados.length, "cambio", "cambios")}`;
}
