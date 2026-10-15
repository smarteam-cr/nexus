/**
 * lib/para-ti/fuentes/siguientes-pasos.ts — «Tu siguiente movimiento» (2026-10-15, etapa 2 de docs/mi-dia-plan.md).
 * PERSONAL: los siguientes pasos vigentes que llevas tú (`SiguientePaso.responsableEmail`), de cualquier equipo.
 *
 *   · con la fecha pasada o de hoy → «Para hoy»;
 *   · de esta semana (hasta 7 días) → «Esta semana»;
 *   · sin fecha o más adelante: no se pide nada (se ven en la cartera y en la ficha).
 * Se va solo cuando se da por hecho o se cambia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { urlDeProyecto } from "@/lib/agents/run-url";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";
import { diasHastaElPaso, NOMBRE_DEL_EQUIPO, NOMBRE_DEL_OBJETO, type ObjetoDelPaso } from "@/lib/siguiente-paso/reglas";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";
import { fechaCorta } from "@/lib/ventas/negocios";

const DIAS_DE_LA_SEMANA = 7;

export const SIGUIENTES_PASOS: Fuente = {
  clave: "siguientes-pasos",
  frente: null,
  alDia: "Tus siguientes pasos",
  async medir(a, c) {
    let filas;
    try {
      filas = await prisma.siguientePaso.findMany({
        where: { estado: "vigente", responsableEmail: a.email.toLowerCase(), fecha: { not: null } },
        select: { id: true, objeto: true, objetoId: true, equipo: true, que: true, fecha: true, clientId: true, createdAt: true },
      });
    } catch (e) {
      if (esquemaDesactualizado(e)) return [];
      throw e;
    }
    const cercanas = filas.filter((f) => diasHastaElPaso(f.fecha!.toISOString().slice(0, 10), c.hoyISO) <= DIAS_DE_LA_SEMANA);
    if (cercanas.length === 0) return [];

    // El nombre de lo que se mueve: la empresa, el negocio o el proyecto.
    const ids = (o: ObjetoDelPaso) => cercanas.filter((f) => f.objeto === o).map((f) => f.objetoId);
    const [empresas, negocios, proyectos] = await Promise.all([
      prisma.client.findMany({ where: { id: { in: [...new Set([...ids("empresa"), ...cercanas.map((f) => f.clientId).filter((x): x is string => !!x)])] } }, select: { id: true, name: true } }),
      prisma.negocioAbierto.findMany({ where: { id: { in: ids("negocio") } }, select: { id: true, nombre: true } }),
      prisma.project.findMany({ where: { id: { in: ids("proyecto") } }, select: { id: true, name: true } }),
    ]);
    const nombreDe = new Map<string, string>([
      ...empresas.map((x) => [`empresa:${x.id}`, x.name] as const),
      ...negocios.map((x) => [`negocio:${x.id}`, x.nombre] as const),
      ...proyectos.map((x) => [`proyecto:${x.id}`, x.name] as const),
    ]);
    const empresaDe = new Map(empresas.map((x) => [x.id, x.name]));

    return cercanas.map((f): Pendiente => {
      const fecha = f.fecha!.toISOString().slice(0, 10);
      const dias = diasHastaElPaso(fecha, c.hoyISO);
      const objeto = f.objeto as ObjetoDelPaso;
      const nombre = nombreDe.get(`${objeto}:${f.objetoId}`) ?? NOMBRE_DEL_OBJETO[objeto];
      const empresa = f.clientId ? (empresaDe.get(f.clientId) ?? null) : null;
      const href =
        objeto === "proyecto" && f.clientId
          ? urlDeProyecto(f.clientId, f.objetoId)
          : f.clientId
            ? `/clients/${f.clientId}`
            : "/para-ti?vista=cartera";
      return {
        clave: `siguientes-pasos:${f.id}`,
        fuente: "siguientes-pasos",
        cuando: dias <= 0 ? "hoy" : "semana",
        delAgente: false,
        titulo: f.que,
        detalle: dias < 0 ? `Era para el ${fechaCorta(fecha)}: hazlo, dalo por hecho o define el que sigue.` : dias === 0 ? "Es para hoy." : `Para el ${fechaCorta(fecha)}.`,
        meta: `Siguiente paso de ${NOMBRE_DEL_EQUIPO[f.equipo as EquipoDelSiguientePaso]} · ${objeto === "empresa" ? nombre : `${nombre}${empresa ? ` · ${empresa}` : ""}`}`,
        accion: "Abrir",
        href,
        desde: f.createdAt.toISOString(),
      };
    });
  },
};
