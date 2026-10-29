/**
 * La cuenta › La escala (2026-10-12): dónde está la empresa en cada área, con la fecha y de dónde sale. Ver
 * lib/exploraciones/escala-de-la-empresa.ts y lib/exploraciones/posicionar.ts.
 *
 *   GET  → la escala de hoy de cada exploración, las versiones guardadas (la escala en el tiempo), sobre qué se puede
 *          ubicar (cada proyecto, la preventa o la cuenta entera), las ventas ganadas, lo que propuso el agente en cada
 *          exploración y con qué edición y perfil se mide. `puede` dice qué botones pintar. Pide acceso al cliente.
 *          Escala única (2026-10-28): `cuenta` es la escala de la cuenta tal como la pinta el lienzo de la preventa
 *          (lib/exploraciones/escala-de-la-cuenta.ts), y `faltaAbrir` dice si todavía no existe o le falta el punto de
 *          partida de la preventa.
 *   POST →
 *          { accion: "abrir" } — abre la escala de la cuenta (la crea si no está) y, sin ningún nivel, le trae lo medido
 *              en la preventa. Pide la celda de generar la exploración. Devuelve `cuenta`, cuántas dimensiones trajo
 *              (`traidas`), cuánto de lo medido no existe en su escala (`afuera`) y si no se pudo traer (`noSeTrajo`).
 *          { accion: "actualizar", objetivo, ventaId?, proyectoId? } — «Actualizar escala» (2026-10-18): el agente lee TODO lo que
 *              Nexus sabe de la cuenta y PROPONE niveles (modo «posicionar»): nada se confirma solo, y nada se marca
 *              como leído. `objetivo`: `proyecto:<id>` (abre su exploración si no tiene), `preventa:<id>` o `cuenta`
 *              (la exploración de «Información del cliente», que se crea si no existe). Lo dispara una persona, por
 *              cliente: nunca corre solo ni para todos. `proyectoId` (con `cuenta`, escala única): un proyecto de la
 *              empresa cuyo handoff, cuestionarios, cronograma y memoria se leen como contexto; lo propuesto queda en la cuenta.
 *          { accion: "guardar", exploracionId, nota?, momento?, ventaId? } — guarda esta versión (origen «manual»),
 *              con su venta y su momento («al vender», «al arrancar» u «hoy»).
 *          Usar lo propuesto y corregir la edición o el perfil van por el PATCH de la exploración
 *          (/api/sales/exploraciones/[id]): el mismo escritor de siempre, que deja la versión del día.
 *          Pide acceso al cliente y poder trabajar esa exploración (la preventa: `preventa`; la de un proyecto o la de la
 *          cuenta: la celda de generar la exploración), igual que /api/sales/exploraciones/[id]/*.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardAccessToClient, guardContextoDelDocumento, guardPermission } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { ensureClientInfoProject } from "@/lib/canvas/strategy-project";
import { prisma } from "@/lib/db/prisma";
import { empresaExcluida } from "@/lib/escala/prueba/calculo";
import { lanzarCorrida } from "@/lib/exploraciones/agente";
import { asegurarExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { abrirLaEscalaDeLaCuenta, laEscalaDeLaCuenta } from "@/lib/exploraciones/escala-de-la-cuenta";
import { diaDelMomento, escalaDeLaEmpresa, esDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { CLAVE_DE_LA_CUENTA, MOMENTOS_DE_LA_VERSION } from "@/lib/exploraciones/posicionar";
import { ventasDeLaEmpresa } from "@/lib/exploraciones/posicionar-fuentes";
import { guardarVersionDeLaEscala, SQL_DE_LA_VENTA, SQL_DE_LAS_VERSIONES } from "@/lib/exploraciones/versiones-de-la-escala";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    // Qué puede hacer quien mira (la pantalla pinta los botones con esto; la API igual lo vuelve a pedir).
    const tm = guard.user.teamMember;
    const puede = tm
      ? { preventa: await can(tm, "preventa", "write"), exploracion: await can(tm, "exploracion", "generate") }
      : { preventa: false, exploracion: false };
    // «Probar la escala» (N2) no se ofrece con Wherex: nunca entra a la prueba.
    const [empresa, deLaEmpresa, deLaCuenta] = await Promise.all([
      prisma.client.findUnique({ where: { id }, select: { name: true } }),
      escalaDeLaEmpresa(id),
      laEscalaDeLaCuenta(id),
    ]);
    return NextResponse.json({ ...deLaEmpresa, puede, sePuedeProbar: !empresaExcluida(empresa?.name), cuenta: deLaCuenta.cuenta, faltaAbrir: deLaCuenta.faltaAbrir });
  } catch (e) {
    console.error("[clients/escala]", e);
    return NextResponse.json({ error: "No se pudo cargar la escala de la empresa." }, { status: 500 });
  }
}

const Id = z.string().min(1).max(64);
const Cuerpo = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("guardar"),
    exploracionId: Id,
    nota: z.string().max(500).optional(),
    momento: z.enum(MOMENTOS_DE_LA_VERSION).optional(),
    ventaId: Id.nullable().optional(),
  }),
  z.object({ accion: z.literal("actualizar"), objetivo: z.string().min(1).max(80), ventaId: Id.nullable().optional(), proyectoId: Id.nullable().optional() }),
  z.object({ accion: z.literal("abrir") }),
]);

/** La venta tiene que ser de esta empresa: una de otra no se usa ni para leer ni para amarrar una versión. */
async function ventaDeLaEmpresa(clientId: string, ventaId: string | null | undefined) {
  if (!ventaId) return { ok: true as const, venta: null };
  const venta = (await ventasDeLaEmpresa(clientId)).find((v) => v.id === ventaId) ?? null;
  return venta ? { ok: true as const, venta } : { ok: false as const };
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;

  try {
    if (c.accion === "abrir") {
      const g = await guardPermission("exploracion", "generate");
      if (g instanceof NextResponse) return g;
      const r = await abrirLaEscalaDeLaCuenta(id, g.teamMember?.email ?? g.user.email ?? "desconocido");
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ cuenta: r.cuenta, traidas: r.traidas, afuera: r.afuera, noSeTrajo: r.noSeTrajo });
    }

    const v = await ventaDeLaEmpresa(id, c.ventaId);
    if (!v.ok) return NextResponse.json({ error: "Esa venta no es de esta empresa." }, { status: 404 });

    if (c.accion === "actualizar") {
      let exploracionId: string;
      let email: string;
      let objetivo: string;
      let proyectoDeContexto: string | null = null;
      if (c.objetivo.startsWith("preventa:")) {
        exploracionId = c.objetivo.slice("preventa:".length);
        if (!(await esDeLaEmpresa(id, { exploracionId }))) return NextResponse.json({ error: "Esa preventa no es de esta empresa." }, { status: 404 });
        const g = await guardDeLaExploracion(exploracionId, "write");
        if (g instanceof NextResponse) return g;
        email = g.email ?? "desconocido";
        objetivo = "la preventa";
      } else {
        let projectId: string;
        if (c.objetivo === CLAVE_DE_LA_CUENTA) {
          // Primero el permiso: sin él no se crea nada.
          const g = await guardPermission("exploracion", "generate");
          if (g instanceof NextResponse) return g;
          projectId = (await ensureClientInfoProject(id)).projectId;
          objetivo = "la cuenta entera (sin un proyecto en particular)";
          if (c.proyectoId) {
            if (!(await esDeLaEmpresa(id, { projectId: c.proyectoId }))) return NextResponse.json({ error: "Ese proyecto no es de esta empresa." }, { status: 404 });
            const p = await prisma.project.findUnique({ where: { id: c.proyectoId }, select: { name: true } });
            proyectoDeContexto = c.proyectoId;
            objetivo = `la cuenta entera, con el contexto del proyecto «${p?.name ?? "sin nombre"}»`;
          }
        } else if (c.objetivo.startsWith("proyecto:")) {
          projectId = c.objetivo.slice("proyecto:".length);
          if (!(await esDeLaEmpresa(id, { projectId }))) return NextResponse.json({ error: "Ese proyecto no es de esta empresa." }, { status: 404 });
          const p = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
          objetivo = `el proyecto «${p?.name ?? "sin nombre"}»`;
        } else {
          return NextResponse.json({ error: "No se entiende sobre qué ubicar la escala." }, { status: 400 });
        }
        const g = await guardContextoDelDocumento(projectId, "exploracion");
        if (g instanceof NextResponse) return g;
        email = g.teamMember?.email ?? g.user.email ?? "desconocido";
        const r = await asegurarExploracionDelProyecto(projectId, email);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        exploracionId = r.id;
      }
      if (v.venta) objetivo += `, vendida en «${v.venta.nombre}» (ganada el ${v.venta.fechaCierre})`;
      const corrida = await lanzarCorrida(exploracionId, "posicionar", { triggeredByEmail: email, ventaId: v.venta?.id ?? null, objetivo, proyectoDeContexto });
      if (!corrida.ok) return NextResponse.json({ error: corrida.error }, { status: corrida.status });
      return NextResponse.json({ exploracionId, runId: corrida.runId, yaCorria: corrida.yaCorria }, { status: 202 });
    }

    if (!(await esDeLaEmpresa(id, { exploracionId: c.exploracionId }))) return NextResponse.json({ error: "Esa exploración no es de esta empresa." }, { status: 404 });
    const g = await guardDeLaExploracion(c.exploracionId, "write");
    if (g instanceof NextResponse) return g;

    // El día de la posición: hoy, el día en que se ganó la venta, o el arranque del proyecto (sin él, su alta).
    let dia: string | null = null;
    if (c.momento) {
      const m = await diaDelMomento(id, c.exploracionId, c.momento, { venta: v.venta, elegida: c.ventaId !== undefined });
      if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 });
      dia = m.dia;
    }
    const r = await guardarVersionDeLaEscala(c.exploracionId, {
      origen: "manual",
      email: g.email,
      nota: c.nota ?? null,
      ...(c.ventaId !== undefined ? { ventaGanadaId: v.venta?.id ?? null } : {}),
      ...(c.momento ? { momento: c.momento, diaDeLaPosicion: dia } : {}),
    });
    switch (r.estado) {
      case "guardada":
        return NextResponse.json({ ok: true, id: r.id });
      case "igual":
        return NextResponse.json({ ok: true, id: r.id, igual: true });
      case "sin-nivel":
        return NextResponse.json({ error: "Esa exploración todavía no tiene ningún nivel confirmado: no hay qué guardar." }, { status: 409 });
      case "sin-tabla":
        return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LAS_VERSIONES} y ${SQL_DE_LA_VENTA}, y reiniciar.` }, { status: 503 });
      case "no-existe":
        return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
    }
  } catch (e) {
    console.error("[clients/escala]", e);
    return NextResponse.json({ error: "No se pudo completar el pedido." }, { status: 500 });
  }
}
