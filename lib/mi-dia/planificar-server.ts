/**
 * lib/mi-dia/planificar-server.ts — los datos de «Planifica tu semana» (fase 2.3, 2026-10-17). SERVER-ONLY, solo
 * lectura. La regla es pura: lib/mi-dia/planificar.ts.
 *
 * Las cuentas son las de tu inicio (lib/mi-dia/inicio-server.ts › cuentasBase): el CSE, las suyas; la CSL, las que
 * lleva (y las que no lleva nadie); Desarrollo, los clientes con proyecto de desarrollo activo. De cada una: sus tareas
 * abiertas (de cualquier equipo, sin lo «Solo para mí» ni lo de un espacio privado donde no estás), las reuniones que
 * vienen (tu calendario de los próximos 8 días, con el resolvedor único, y las planeadas en Tareas), la última reunión
 * con quiénes estuvieron, y la próxima reunión que dejó sugerida esa última reunión.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { tareasDisponible } from "@/lib/tareas/servidor";
import type { Alcance } from "@/lib/para-ti/alcance-server";
import { cuentaDelEvento } from "./agenda";
import { calendarioDeLosProximosDias } from "./calendario-server";
import { mapasDeEmpresas } from "./empresas-server";
import { cuentasBase } from "./inicio-server";
import type { VarianteDelInicio } from "./inicio";
import { planificarLaSemana, semanaAPlanificar, type CuentaParaPlanificar, type PlanDeLaSemana } from "./planificar";
import { deEspacioPrivadoAjeno, ultimasReuniones } from "./servicio-server";
import type { ReunionDeLaCuenta } from "./servicio";
import { diaCorto } from "./servicio";

/** Cuántas cuentas se planifican como mucho (la CSL con toda la cartera sin encargado no cabe en una pantalla). */
export const MAX_CUENTAS_DEL_PLAN = 40;
/** La próxima sugerida de una reunión vale si la reunión fue en los últimos 30 días. */
const DIAS_DE_LA_PROXIMA_SUGERIDA = 30;

const diaCR = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
const comoDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface DatosDelPlan {
  plan: PlanDeLaSemana;
  /** Las cuentas que no entraron (más de `MAX_CUENTAS_DEL_PLAN`). */
  sinEntrar: number;
}

export async function planDeLaSemana(variante: VarianteDelInicio, a: Alcance, o: { ahora: Date; hoyISO: string }): Promise<DatosDelPlan> {
  const yo = a.email.toLowerCase();
  const todas = await cuentasBase(variante, a);
  // La CSL planifica lo que lleva y lo que no lleva nadie; los demás, lo suyo (Desarrollo, todo lo de desarrollo).
  const mias = variante === "csl" ? todas.filter((c) => !c.llevaEmail || c.llevaEmail === yo) : todas;
  const cuentas = mias.sort((x, y) => x.empresa.localeCompare(y.empresa, "es")).slice(0, MAX_CUENTAS_DEL_PLAN);
  const ids = cuentas.map((c) => c.clientId);
  const semana = semanaAPlanificar(o.hoyISO);
  if (ids.length === 0) return { plan: planificarLaSemana([], { ...o, ocupado: [] }), sinEntrar: 0 };

  const conTareas = await tareasDisponible();
  const [filas, cal, ultimas, sugeridas, internos] = await Promise.all([
    conTareas
      ? prisma.tarea.findMany({
          where: {
            archivadaAt: null,
            estado: { in: ["pendiente", "en_curso"] },
            privada: false,
            clientId: { in: ids },
            ...(a.rol === "SUPER_ADMIN" ? {} : { NOT: deEspacioPrivadoAjeno(yo) }),
          },
          select: {
            id: true,
            numero: true,
            titulo: true,
            clientId: true,
            estado: true,
            privada: true,
            venceEl: true,
            semana: true,
            clase: true,
            reunionInicio: true,
            equipo: true,
            responsableEmail: true,
            prioridad: true,
            lado: true,
            version: true,
          },
          orderBy: [{ numero: "asc" }],
          take: 3_000,
        })
      : Promise.resolve([]),
    calendarioDeLosProximosDias(yo, o.ahora),
    ultimasReuniones(ids, o.ahora),
    prisma.seguimientoDeReunion
      .findMany({
        where: {
          proximaEstado: null,
          proximaObjetivo: { not: null },
          session: { resolvedClientId: { in: ids }, date: { gte: new Date(o.ahora.getTime() - DIAS_DE_LA_PROXIMA_SUGERIDA * 86_400_000), lte: o.ahora } },
        },
        select: { sessionId: true, proximaTitulo: true, proximaObjetivo: true, session: { select: { title: true, date: true, resolvedClientId: true } } },
        orderBy: { session: { date: "desc" } },
        take: 200,
      })
      .catch(() => []),
    mapasDeEmpresas(o.ahora).then((m) => m.internos),
  ]);

  const tareasDe = new Map<string, CuentaParaPlanificar["tareas"][number][]>();
  const planeadas = new Map<string, ReunionDeLaCuenta[]>();
  for (const t of filas) {
    if (!t.clientId) continue;
    const vista = {
      id: t.id,
      numero: t.numero,
      titulo: t.titulo,
      clientId: t.clientId,
      estado: t.estado,
      privada: t.privada,
      venceEl: comoDia(t.venceEl),
      semana: comoDia(t.semana),
      reunionDia: t.clase === "reunion" && t.reunionInicio ? diaCR(t.reunionInicio) : null,
      equipo: t.equipo,
      responsableEmail: t.responsableEmail,
      prioridad: t.prioridad,
      clase: t.clase,
      lado: t.lado,
      version: t.version,
    };
    tareasDe.set(t.clientId, [...(tareasDe.get(t.clientId) ?? []), vista]);
    if (t.clase === "reunion" && t.reunionInicio && t.reunionInicio >= o.ahora) {
      planeadas.set(t.clientId, [...(planeadas.get(t.clientId) ?? []), { clientId: t.clientId, titulo: t.titulo, inicio: t.reunionInicio.toISOString(), fuente: "tarea" }]);
    }
  }
  const delCalendario = new Map<string, ReunionDeLaCuenta[]>();
  for (const r of cal?.reuniones ?? []) {
    const clientId = cuentaDelEvento(r);
    if (clientId) delCalendario.set(clientId, [...(delCalendario.get(clientId) ?? []), { clientId, titulo: r.titulo, inicio: r.inicio, fuente: "calendario" }]);
  }
  const ultimaDe = new Map(ultimas.map((u) => [u.resolvedClientId as string, u]));
  const sugeridaDe = new Map<string, CuentaParaPlanificar["proximaSugerida"]>();
  for (const s of sugeridas) {
    const c = s.session.resolvedClientId;
    if (!c || sugeridaDe.has(c) || !s.proximaObjetivo) continue;
    sugeridaDe.set(c, { titulo: s.proximaTitulo, objetivo: s.proximaObjetivo, deLaReunion: `la reunión «${s.session.title}» del ${diaCorto(s.session.date.toISOString())}`, sessionId: s.sessionId });
  }

  const para: CuentaParaPlanificar[] = cuentas.map((c) => {
    const u = ultimaDe.get(c.clientId);
    return {
      clientId: c.clientId,
      empresa: c.empresa,
      proyectos: c.proyectos,
      tareas: tareasDe.get(c.clientId) ?? [],
      reuniones: [...(planeadas.get(c.clientId) ?? []), ...(delCalendario.get(c.clientId) ?? [])],
      invitados: (u?.participants ?? []).map((p) => p.trim().toLowerCase()).filter((p) => p.includes("@") && !internos.has(p.split("@")[1] ?? "")),
      ultimaReunion: u ? u.date.toISOString() : null,
      proximaSugerida: sugeridaDe.get(c.clientId) ?? null,
    };
  });
  // Lo ocupado de la semana (tu calendario de los próximos 8 días cubre la que viene desde el viernes).
  const ocupado = cal ? cal.ocupado.filter((x) => diaCR(new Date(x.inicio)) >= semana.desde && diaCR(new Date(x.inicio)) <= semana.viernes) : null;
  return { plan: planificarLaSemana(para, { ...o, ocupado }), sinEntrar: Math.max(0, mias.length - cuentas.length) };
}
