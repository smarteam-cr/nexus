/**
 * lib/para-ti/fuentes/finanzas.ts — Finanzas en «Para ti».
 *
 * · Frente «Finanzas: registrar» → lo MISMO que Finanzas › Pendientes (`medirPendientes` + `armarPendientes`), con las
 *   mismas reglas y los mismos textos: «Para ti» no cuenta otra cosa.
 * · Personal → lo que quien supervisa te DEVOLVIÓ (`devueltosPara`), con su comentario.
 * · Frente «Finanzas: supervisar» → lo de Finanzas › Supervisión (`medirSupervision`): el trabajo del equipo por
 *   revisar, las decisiones de Conciliación y el cierre del mes anterior.
 */
import "server-only";
import { medirPendientes } from "@/lib/finanzas/pendientes-server";
import { armarPendientes } from "@/lib/finanzas/pendientes";
import { devueltosPara } from "@/lib/finanzas/revision-server";
import { medirSupervision } from "@/lib/finanzas/supervision-server";
import { tienePermiso } from "../alcance-server";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const FINANZAS_REGISTRAR: Fuente = {
  clave: "finanzas-registrar",
  frente: "FINANZAS_REGISTRAR",
  alDia: "Facturar, registrar pagos y conciliar",
  async medir(a, c) {
    const tareas = armarPendientes(await medirPendientes(c.hoyISO, a.email));
    return tareas.map(
      (t): Pendiente => ({
        clave: `finanzas-registrar:${t.clave}`,
        fuente: "finanzas-registrar",
        cuando: t.cuando,
        delAgente: false,
        titulo: t.titulo,
        detalle: t.detalle,
        meta: "Finanzas",
        plata: t.plata || undefined,
        accion: t.accion,
        href: t.href,
      }),
    );
  },
};

export const FINANZAS_DEVUELTO: Fuente = {
  clave: "finanzas-devuelto",
  frente: null,
  alDia: "Lo que te devolvieron en Finanzas",
  // Solo se revisa lo que registra quien no es Super Admin (revision-server.ts).
  aplica: (a) => a.rol !== "SUPER_ADMIN" && tienePermiso(a, "cobranza", "read"),
  async medir(a) {
    const devueltos = await devueltosPara(a.email);
    return devueltos.map(
      (d): Pendiente => ({
        clave: `finanzas-devuelto:${d.tipo}:${d.registroId}`,
        fuente: "finanzas-devuelto",
        cuando: "hoy",
        delAgente: false,
        titulo: `${d.por} te devolvió: ${d.texto}`,
        detalle: `«${d.comentario}»`,
        meta: "Finanzas · devuelto",
        accion: "Ir a corregirlo",
        href: d.href,
      }),
    );
  },
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const FINANZAS_SUPERVISAR: Fuente = {
  clave: "finanzas-supervisar",
  frente: "FINANZAS_SUPERVISAR",
  alDia: "La supervisión y el cierre del mes",
  async medir(_a, c) {
    const d = await medirSupervision(c.hoyISO);
    const out: Pendiente[] = [];
    const porRevisar = d.revision.pagos.length + d.revision.gastos.length;
    if (porRevisar > 0) {
      out.push({
        clave: "finanzas-supervisar:revision",
        fuente: "finanzas-supervisar",
        cuando: "hoy",
        delAgente: false,
        titulo: `Revisa ${plural(porRevisar, "registro del equipo", "registros del equipo")}`,
        detalle: `${plural(d.revision.pagos.length, "pago", "pagos")} y ${plural(d.revision.gastos.length, "gasto", "gastos")} que registró el equipo y nadie miró.`,
        meta: "Finanzas › Supervisión",
        accion: "Revisarlos",
        href: "/finanzas/supervision",
      });
    }
    if (d.filasPorDecidir > 0) {
      out.push({
        clave: "finanzas-supervisar:decisiones",
        fuente: "finanzas-supervisar",
        cuando: "semana",
        delAgente: false,
        titulo: `Decide ${plural(d.filasPorDecidir, "diferencia de Conciliación", "diferencias de Conciliación")}`,
        detalle: "Son preguntas de negocio, como «¿entró esta plata?»: el equipo no las puede resolver.",
        meta: "Finanzas › Conciliación",
        accion: "Decidir",
        href: "/finanzas/conciliacion",
      });
    }
    if (!d.cierre.cerrado && d.cierre.total > 0) {
      const mes = MESES[Number(d.cierre.periodo.slice(5, 7)) - 1] ?? d.cierre.periodo;
      const listo = d.cierre.listas === d.cierre.total;
      out.push({
        clave: `finanzas-supervisar:cierre:${d.cierre.periodo}`,
        fuente: "finanzas-supervisar",
        cuando: listo ? "hoy" : "semana",
        delAgente: false,
        titulo: listo ? `Cierra ${mes}: está todo listo` : `Cierre de ${mes}: ${d.cierre.listas} de ${d.cierre.total} listos`,
        detalle: listo
          ? "Lo que frena el cierre está completo."
          : "Falta parte de lo que frena el cierre del mes.",
        meta: "Finanzas › Cierre del mes",
        accion: listo ? "Cerrarlo" : "Ver qué falta",
        href: "/finanzas/cierre",
      });
    }
    return out;
  },
};
