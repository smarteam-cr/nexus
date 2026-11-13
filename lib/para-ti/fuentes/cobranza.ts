/**
 * lib/para-ti/fuentes/cobranza.ts — lo de Cobranza que espera a UNA persona (2026-11-13). SERVER-ONLY.
 *
 * Todas personales: le llegan a quien responde por el dato, no a un frente.
 *  · «cobranza-a-tu-cargo»: los negocios ganados sin cobro de los que eres responsable (por defecto, quien cobra) y los
 *    proyectos que pasaron a producción y todavía no tienen su cobro (lib/cobranza/responsables.ts).
 *  · «cobranza-produccion»: los desarrollos terminados cuyo paso a producción confirmas tú (por defecto, Alejandro Salas).
 *  · «cobranza-primera-cuota»: la regla de los 15 días, a quien lleva el proyecto (lib/cobranza/estado-de-pago.ts).
 *  · «cobranza-contratos»: los contratos recurrentes de tus cuentas que vencen, y las cuentas con contrato que no avanzan
 *    (lib/cobranza/contratos.ts).
 *
 * ⛔ Sin montos para Customer Success: el CSE no ve la plata de la cartera (lib/para-ti/fuentes/tus-cuentas.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cuentasDelPedido } from "@/lib/mi-dia/lecturas-server";
import { DIAS_SIN_CONTACTO } from "@/lib/cs/cartera-reglas";
import { diasEntre } from "@/lib/cs/formato";
import { CONFIRMA_PRODUCCION, RESPONSABLE_DE_COBRO } from "@/lib/cobranza/responsables";
import { loQueLeToca } from "@/lib/cobranza/paso-a-produccion";
import { cuandoVence, queHacerConElFin } from "@/lib/cobranza/contratos";
import { cargarContratos, cargarTablaDeProduccion, cargarVentasSinCobro, primerasCuotasVencidas } from "@/lib/cobranza/seguimiento-server";
import { tienePermiso } from "../alcance-server";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

/** Un SQL que todavía no se corrió no rompe «Para ti»: esa fuente no trae nada. */
const sinEsquemaNada = <T>(e: unknown, vacio: T): T => {
  if (esquemaDesactualizado(e)) return vacio;
  throw e;
};

const fmtDia = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

const cuentasQueLlevas = (a: { proyectos: ReadonlyArray<{ encargado: boolean; clientId: string }> }) =>
  [...new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId))];

export const COBRANZA_A_TU_CARGO: Fuente = {
  clave: "cobranza-a-tu-cargo",
  frente: null,
  alDia: "Los negocios ganados y los cobros por arrancar a tu cargo",
  aplica: (a) => tienePermiso(a, "cobranza", "read"),
  async medir(a, c) {
    const yo = a.email.toLowerCase();
    // Quien no es el responsable por defecto solo mira si alguien le asignó algo (una consulta barata).
    if (yo !== RESPONSABLE_DE_COBRO.email) {
      const [ventas, proyectos] = await Promise.all([
        prisma.ventaGanada.count({ where: { responsableCobroEmail: yo, excluida: false, estado: "GANADA" } }),
        prisma.cobroDelProyecto.count({ where: { cobraEmail: yo } }),
      ]).catch((e) => sinEsquemaNada(e, [0, 0]));
      if (ventas === 0 && proyectos === 0) return [];
    }
    const [ventas, tabla] = await Promise.all([cargarVentasSinCobro(c.hoyISO), cargarTablaDeProduccion()]).catch((e) =>
      sinEsquemaNada(e, [[], []] as [Awaited<ReturnType<typeof cargarVentasSinCobro>>, Awaited<ReturnType<typeof cargarTablaDeProduccion>>]),
    );
    const out: Pendiente[] = [];
    const mias = ventas.filter((v) => v.responsable === yo);
    if (mias.length > 0) {
      const nombres = mias.slice(0, 3).map((v) => (v.clienteNombre ? `${v.clienteNombre} (${v.nombre})` : v.nombre));
      out.push({
        clave: "cobranza-a-tu-cargo:ventas",
        fuente: "cobranza-a-tu-cargo",
        cuando: "semana",
        delAgente: false,
        clientId: null,
        titulo: `Carga el cobro de ${plural(mias.length, "negocio ganado", "negocios ganados")}`,
        detalle: `${nombres.join(" · ")}${mias.length > 3 ? ` y ${mias.length - 3} más` : ""}. Carga su plan de cobro o descártalos con una razón.`,
        meta: "Cobranza › Seguimiento",
        accion: "Ver la lista",
        href: "/cobranza?ver=seguimiento",
        cantidad: mias.length,
      });
    }
    for (const f of loQueLeToca(tabla, yo).arrancar) {
      if (f.situacion.clave !== "en-produccion") continue;
      out.push({
        clave: `cobranza-a-tu-cargo:arrancar:${f.id}`,
        fuente: "cobranza-a-tu-cargo",
        cuando: "hoy",
        delAgente: false,
        clientId: f.clientId,
        titulo: `Arranca el cobro de «${f.nombre}» (${f.clienteNombre})`,
        detalle: `Pasó a producción el ${fmtDia(f.situacion.desde)} y todavía no tiene un servicio de Cobranza ligado. Créalo (o liga el que ya existe) con esa fecha de inicio.`,
        meta: "Cobranza › Paso a producción",
        accion: "Ir a Cobranza",
        href: "/cobranza",
        desde: f.situacion.en,
      });
    }
    return out;
  },
};

export const COBRANZA_PRODUCCION: Fuente = {
  clave: "cobranza-produccion",
  frente: null,
  alDia: "Los pasos a producción que confirmas",
  async medir(a) {
    const yo = a.email.toLowerCase();
    if (yo !== CONFIRMA_PRODUCCION.email) {
      const n = await prisma.cobroDelProyecto.count({ where: { confirmaProduccionEmail: yo } }).catch((e) => sinEsquemaNada(e, 0));
      if (n === 0) return [];
    }
    const tabla = await cargarTablaDeProduccion().catch((e) => sinEsquemaNada(e, []));
    return loQueLeToca(tabla, yo).confirmar.map(
      (f): Pendiente => ({
        clave: `cobranza-produccion:${f.id}`,
        fuente: "cobranza-produccion",
        cuando: "hoy",
        delAgente: false,
        clientId: f.clientId,
        titulo: `Confirma si «${f.nombre}» (${f.clienteNombre}) ya está en producción`,
        detalle: "El desarrollo terminó en HubSpot. Su cobro arranca el día que confirmes: sin eso no se le puede cobrar, tampoco por Stripe.",
        meta: "Cobranza › Paso a producción",
        accion: "Confirmar",
        href: "/cobranza/production",
      }),
    );
  },
};

export const COBRANZA_PRIMERA_CUOTA: Fuente = {
  clave: "cobranza-primera-cuota",
  frente: null,
  alDia: "Los pagos de los proyectos que llevas",
  aplica: (a) => a.proyectos.some((p) => p.encargado),
  async medir(a, c) {
    const mios = a.proyectos.filter((p) => p.encargado);
    const misProyectos = new Set(mios.map((p) => p.id));
    const misCuentas = new Set(mios.map((p) => p.clientId));
    const vencidas = await primerasCuotasVencidas([...misCuentas], c.hoyISO).catch((e) => sinEsquemaNada(e, []));
    // Un servicio con proyecto avisa a quien lleva ESE proyecto; uno sin proyecto es de la cuenta: a quien lleva alguno.
    return vencidas
      .filter((v) => (v.projectId ? misProyectos.has(v.projectId) : misCuentas.has(v.clientId)))
      .map(
        (v): Pendiente => ({
          clave: `cobranza-primera-cuota:${v.servicioId}`,
          fuente: "cobranza-primera-cuota",
          cuando: "hoy",
          delAgente: false,
          clientId: v.clientId,
          titulo: `${v.clienteNombre}: la primera cuota de «${v.servicio}» lleva ${v.dias === 1 ? "1 día" : `${v.dias} días`} vencida`,
          detalle: "Habla con tu líder para pausar las sesiones o la implementación hasta que pague.",
          meta: "Estado de pago",
          accion: "Abrir la cuenta",
          href: `/clients/${encodeURIComponent(v.clientId)}${v.projectId ? `?tab=${encodeURIComponent(v.projectId)}` : ""}`,
        }),
      );
  },
};

export const COBRANZA_CONTRATOS: Fuente = {
  clave: "cobranza-contratos",
  frente: null,
  alDia: "Los contratos recurrentes de tus cuentas",
  aplica: (a) => a.proyectos.some((p) => p.encargado),
  async medir(a, c) {
    const cuentas = cuentasQueLlevas(a);
    const contratos = await cargarContratos(c.hoyISO, cuentas).catch((e) => sinEsquemaNada(e, []));
    if (contratos.length === 0) return [];
    const out: Pendiente[] = [];
    for (const k of contratos) {
      if (!k.aviso) continue;
      out.push({
        clave: `cobranza-contratos:fin:${k.servicioId}`,
        fuente: "cobranza-contratos",
        cuando: k.aviso.clave === "vencido" || k.aviso.dias <= 7 ? "hoy" : "semana",
        delAgente: false,
        clientId: k.clientId,
        titulo: `${k.clienteNombre}: el contrato de «${k.servicio}» ${cuandoVence(k.aviso)}`,
        detalle: queHacerConElFin(k.aviso),
        meta: "Contrato recurrente",
        accion: "Abrir la cuenta",
        href: `/clients/${encodeURIComponent(k.clientId)}`,
      });
    }
    /* «No avanza»: lo que ya mide la cartera de Customer Success, el último contacto con el cliente. Las mismas cuentas
       que «Tus cuentas en riesgo»: la cartera se arma una vez por pedido. */
    const conContrato = new Set(contratos.map((k) => k.clientId));
    const nombre = new Map(contratos.map((k) => [k.clientId, k.clienteNombre]));
    for (const cuenta of await cuentasDelPedido(cuentas)) {
      if (!conContrato.has(cuenta.clientId)) continue;
      const dias = cuenta.ultimoContacto ? diasEntre(cuenta.ultimoContacto.slice(0, 10), c.hoyISO) : null;
      if (dias !== null && dias <= DIAS_SIN_CONTACTO) continue;
      out.push({
        clave: `cobranza-contratos:sin-avance:${cuenta.clientId}`,
        fuente: "cobranza-contratos",
        cuando: "semana",
        delAgente: false,
        clientId: cuenta.clientId,
        titulo: `${nombre.get(cuenta.clientId) ?? cuenta.nombre} paga un contrato recurrente y no avanza`,
        detalle:
          dias === null
            ? "No hay ningún contacto registrado con el cliente. Agenda una reunión: quien paga y no usa el servicio es quien no renueva."
            : `Sin contacto con el cliente hace ${dias} días. Agenda una reunión: quien paga y no usa el servicio es quien no renueva.`,
        meta: "Contrato recurrente",
        accion: "Abrir la cuenta",
        href: `/clients/${encodeURIComponent(cuenta.clientId)}`,
      });
    }
    return out;
  },
};
