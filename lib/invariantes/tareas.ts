/**
 * lib/invariantes/tareas.ts — los invariantes de Tareas internas (docs/tareas-plan.md §12, 2026-10-09).
 *
 * Lo que el SQL ya garantiza con un CHECK (hecha ⇔ completadaAt, sin responsable ⇒ sin semana, espacio de equipo ⇔
 * clave, un vínculo con un dueño y un destino) NO se repite acá: la base no deja escribirlo. Acá va lo que cruza
 * tablas y ninguna restricción alcanza. Todos son lecturas; las tablas de tareas son chicas (el piloto) y las
 * consultas miran solo lo que puede romperse (lo abierto, lo fusionado, lo que trae cita).
 */
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { claveDeEquipo, duenoDelEquipoPersonal, esEquipoPersonal } from "@/lib/tareas/equipos";
import { SQL_DE_TAREAS } from "@/lib/tareas/estados";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * Una base sin las tablas de Tareas (producción antes de aplicar el SQL) no puede violar nada de esto: no hay filas.
 * Sin esta red, el gate de `check:invariants` se caía entero en INV38 antes de aplicar el SQL, y el job lo daba por
 * «no verificable». Cualquier otro error sigue subiendo.
 */
/** ¿Falta la TABLA? Una columna que falta (P2022) no es esto: ahí sí hay filas, y el gate tiene que verlo (INV7). */
function faltaLaTabla(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2021" || code === "42P01") return true;
  return /table .* does not exist in the current database|no existe la relación/i.test(e instanceof Error ? e.message : "");
}

function conLasTablas(inv: Invariante): Invariante {
  return {
    ...inv,
    async correr(db, ahora) {
      try {
        return await inv.correr(db, ahora);
      } catch (e) {
        if (!faltaLaTabla(e)) throw e;
        return cumple(`✓ INV${inv.id}: no aplica todavía — esta base no tiene las tablas de Tareas (falta ${SQL_DE_TAREAS}).`);
      }
    },
  };
}

const ABIERTAS = ["pendiente", "en_curso"];
const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");
const dia = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * INV38 · Una tarea tiene el MISMO cliente que su proyecto de HubSpot y que su proyecto de tareas, y un proyecto de
 * tareas el mismo que su proyecto de HubSpot. Si no, «Por cliente» la cuenta en un cliente y su proyecto en otro, y la
 * cita de la reunión podría verse donde no corresponde. Las mutaciones lo rechazan; esto vigila que nada se cuele.
 * Remedio: corregir el cliente desde el cajón de la tarea o del proyecto.
 */
export const INV38: Invariante = conLasTablas({
  id: "38",
  nombre: "una tarea y su proyecto tienen el mismo cliente",
  async correr(db) {
    const [tareas, proyectos] = await Promise.all([
      db.tarea.findMany({
        where: { OR: [{ projectId: { not: null } }, { proyectoId: { not: null } }] },
        select: {
          numero: true,
          clientId: true,
          projectId: true,
          project: { select: { clientId: true, name: true } },
          proyecto: { select: { clientId: true, projectId: true, nombre: true } },
        },
      }),
      db.proyectoDeTareas.findMany({ where: { projectId: { not: null } }, select: { nombre: true, clientId: true, project: { select: { clientId: true, name: true } } } }),
    ]);
    const malas: string[] = [];
    for (const t of tareas) {
      if (t.project && t.project.clientId !== t.clientId) malas.push(`T-${t.numero}: su proyecto de HubSpot «${t.project.name}» es de otro cliente`);
      if (t.proyecto?.clientId && t.proyecto.clientId !== t.clientId) malas.push(`T-${t.numero}: su proyecto «${t.proyecto.nombre}» es de otro cliente`);
      if (t.proyecto?.projectId && t.proyecto.projectId !== t.projectId) malas.push(`T-${t.numero}: no está en el proyecto de HubSpot de «${t.proyecto.nombre}»`);
    }
    for (const p of proyectos) {
      if (p.project && p.project.clientId !== p.clientId) malas.push(`Proyecto «${p.nombre}»: su proyecto de HubSpot «${p.project.name}» es de otro cliente`);
    }
    if (malas.length) {
      return viola(`✗ INV38 VIOLADO: ${malas.length} tarea(s) o proyecto(s) con un cliente distinto al de su proyecto.\n${lista(malas)}\n    Remedio: corregir el cliente desde su cajón en /tareas.`);
    }
    return cumple(`✓ INV38: cada tarea tiene el cliente de su proyecto (${tareas.length} tareas y ${proyectos.length} proyectos con proyecto de HubSpot).`);
  },
});

/**
 * INV39 · Ninguna tarea ni proyecto de tareas cuelga del contenedor «Información del cliente» (`__strategy__`): no es
 * un proyecto de verdad, y una tarea ahí no aparece en ningún proyecto. Remedio: sacarle el proyecto de HubSpot.
 */
export const INV39: Invariante = conLasTablas({
  id: "39",
  nombre: "ninguna tarea en el contenedor «Información del cliente»",
  async correr(db) {
    const [tareas, proyectos] = await Promise.all([
      db.tarea.count({ where: { project: { serviceType: SENTINEL_SERVICE_TYPE } } }),
      db.proyectoDeTareas.count({ where: { project: { serviceType: SENTINEL_SERVICE_TYPE } } }),
    ]);
    if (tareas + proyectos > 0) {
      return viola(`✗ INV39 VIOLADO: ${tareas} tarea(s) y ${proyectos} proyecto(s) de tareas cuelgan del contenedor «Información del cliente».\n    Remedio: quitarles el proyecto de HubSpot desde su cajón.`);
    }
    return cumple("✓ INV39: ninguna tarea en el contenedor «Información del cliente».");
  },
});

/**
 * INV40 · Ninguna tarea abierta en una semana que su responsable ya revisó. Cerrar la revisión exige que no quede
 * nada abierto, y todo lo que entra a una semana pasa por `semanaDestino` (salta las revisadas). Si aparece una, la
 * persona no la ve en «Semanas sin revisar» y queda colgada. Remedio: moverla a esta semana desde su cajón.
 */
export const INV40: Invariante = conLasTablas({
  id: "40",
  nombre: "ninguna tarea abierta en una semana ya revisada",
  async correr(db) {
    const [abiertas, cierres] = await Promise.all([
      db.tarea.findMany({ where: { archivadaAt: null, estado: { in: ABIERTAS }, semana: { not: null }, responsableEmail: { not: null } }, select: { numero: true, responsableEmail: true, semana: true } }),
      db.cierreDeSemana.findMany({ select: { personaEmail: true, semana: true } }),
    ]);
    const revisadas = new Set(cierres.map((c) => `${c.personaEmail}|${dia(c.semana)}`));
    const malas = abiertas.filter((t) => revisadas.has(`${t.responsableEmail}|${dia(t.semana)}`)).map((t) => `T-${t.numero} de ${t.responsableEmail}, semana del ${dia(t.semana)}`);
    if (malas.length) {
      return viola(`✗ INV40 VIOLADO: ${malas.length} tarea(s) abiertas en una semana que su responsable ya revisó.\n${lista(malas)}\n    Remedio: moverlas a esta semana desde su cajón (o que la persona corrija su revisión).`);
    }
    return cumple(`✓ INV40: ninguna tarea abierta en una semana revisada (${abiertas.length} abiertas con semana).`);
  },
});

/**
 * INV41 · Ninguna fusión («¿Es T-12?» → la misma) entre tareas de dos clientes distintos: el código la rechaza, porque
 * fundirlas mezcla la historia de dos clientes. Mira solo las fusionadas (una propuesta que solo SE PARECE a otra no se
 * fundió) y solo dos clientes distintos: una tarea sin cliente se puede fundir con una que lo tiene.
 */
export const INV41: Invariante = conLasTablas({
  id: "41",
  nombre: "ninguna fusión entre clientes distintos",
  async correr(db) {
    const fusionadas = await db.tarea.findMany({ where: { estado: "fusionada", mismaQueId: { not: null } }, select: { numero: true, clientId: true, mismaQue: { select: { numero: true, clientId: true } } } });
    const malas = fusionadas.filter((t) => !!t.clientId && !!t.mismaQue?.clientId && t.clientId !== t.mismaQue.clientId).map((t) => `T-${t.numero} se fundió con T-${t.mismaQue!.numero}, de otro cliente`);
    if (malas.length) return viola(`✗ INV41 VIOLADO: ${malas.length} fusión(es) entre clientes distintos.\n${lista(malas)}\n    Remedio: revisar el cliente de la tarea en la que quedó (la fusionada no se reabre).`);
    return cumple(`✓ INV41: ninguna fusión entre clientes distintos (${fusionadas.length} fusiones).`);
  },
});

/**
 * INV42 · Ninguna tarea lleva la cita de una reunión cuyo dueño es OTRO cliente. Es la invariante medular #1 llevada
 * a Tareas: la cita de una reunión de Wherex no puede quedar en una tarea de Honda. Si el dueño de la reunión se
 * corrigió DESPUÉS de leerla (en /sessions), también aparece acá: una persona decide si la tarea cambia de cliente o
 * si se le borra la cita. Una reunión interna (dueño Smarteam) no cuenta.
 */
export const INV42: Invariante = conLasTablas({
  id: "42",
  nombre: "ninguna tarea con la cita de una reunión de otro cliente",
  async correr(db) {
    const conCita = await db.tarea.findMany({
      where: { sessionId: { not: null }, cita: { not: null }, clientId: { not: null } },
      select: { numero: true, clientId: true, session: { select: { title: true, resolvedClientId: true, manualClientId: true } } },
    });
    const duenos = [...new Set(conCita.map((t) => t.session?.resolvedClientId ?? t.session?.manualClientId).filter((x): x is string => !!x))];
    const internos = new Set((duenos.length ? await db.client.findMany({ where: { id: { in: duenos }, kind: "INTERNO" }, select: { id: true } }) : []).map((c) => c.id));
    const malas = conCita
      .filter((t) => {
        const dueno = t.session?.resolvedClientId ?? t.session?.manualClientId ?? null; // la precedencia del chokepoint
        return !!dueno && !internos.has(dueno) && dueno !== t.clientId;
      })
      .map((t) => `T-${t.numero}: cita de «${t.session?.title ?? "una reunión"}», que es de otro cliente`);
    if (malas.length) {
      return viola(`✗ INV42 VIOLADO: ${malas.length} tarea(s) con la cita de una reunión de otro cliente.\n${lista(malas)}\n    Remedio: revisar el dueño de la reunión en /sessions; si está bien, cambiar el cliente de la tarea.`);
    }
    return cumple(`✓ INV42: ninguna tarea con la cita de una reunión de otro cliente (${conCita.length} con cita y cliente).`);
  },
});

/**
 * INV43 · Ninguna tarea abierta en un sprint sin personas activas (el área de alguien cambió, o se dio de baja la
 * única persona de un sprint personal). Nadie la vería en su semana ni en «Por asignar». Remedio: asignarla a alguien
 * desde su cajón (el job del lunes, en 1A.2, la reparte solo).
 */
export const INV43: Invariante = conLasTablas({
  id: "43",
  nombre: "ninguna tarea abierta en un sprint sin personas",
  async correr(db) {
    const [miembros, abiertas] = await Promise.all([
      db.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, area: true } }),
      db.tarea.findMany({ where: { archivadaAt: null, estado: { in: [...ABIERTAS, "propuesta"] }, equipo: { not: null }, proyectoId: null }, select: { numero: true, equipo: true } }),
    ]);
    const conGente = new Set(miembros.map((m) => claveDeEquipo(m.area, m.email.toLowerCase())));
    const activos = new Set(miembros.map((m) => m.email.toLowerCase()));
    const huerfanas = abiertas.filter((t) => {
      const e = t.equipo!;
      if (esEquipoPersonal(e)) return !activos.has(duenoDelEquipoPersonal(e) ?? "");
      return !conGente.has(e);
    });
    if (huerfanas.length) {
      const porEquipo = new Map<string, number>();
      for (const t of huerfanas) porEquipo.set(t.equipo!, (porEquipo.get(t.equipo!) ?? 0) + 1);
      return viola(
        `✗ INV43 VIOLADO: ${huerfanas.length} tarea(s) abiertas en un sprint sin personas activas.\n${lista([...porEquipo].map(([e, n]) => `${e}: ${n}`))}\n    Remedio: asignarlas a alguien desde su cajón.`,
      );
    }
    return cumple(`✓ INV43: ninguna tarea abierta en un sprint sin personas (${abiertas.length} abiertas de sprint).`);
  },
});
