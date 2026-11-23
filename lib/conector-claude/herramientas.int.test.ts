/**
 * lib/conector-claude/herramientas.int.test.ts — el conector no cruza de cuenta, con filas reales (fase 0,
 * docs/plan-conector-claude.md › 2.7 y 2.8). Correr con la base local: `npx vitest run --project integration <este archivo>`.
 *
 * La frontera: una CSE sin acceso a una cuenta recibe «No existe.» en CADA herramienta, y una reunión o un proyecto de
 * otra cuenta tampoco existen dentro de la suya.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { pipelineByKey } from "@/lib/projects/kind";
import { contextoDeOperacion } from "@/lib/operaciones/contexto-server";
import { BUSCAR_CUENTA, LEER_REUNION, MEMORIA_DE_LA_CUENTA, NO_EXISTE, REUNIONES } from "./herramientas-server";
import { personaDelConector } from "./persona-server";

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const DIA = 86_400_000;
let serie = 0;

async function cuentaConProyecto(nombre: string, kind: "CLIENTE" | "INTERNO", dueno: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind } });
  const p = await prisma.project.create({
    data: { name: `Proyecto de ${nombre}`, clientId: c.id, status: "active", hubspotPipelineId: CS, hubspotServiceId: `hs-${++serie}`, hubspotOwnerEmail: dueno },
  });
  const s = await prisma.firefliesSession.create({
    data: {
      id: `reunion-${++serie}`,
      title: `${nombre} | Seguimiento`,
      date: new Date(Date.now() - 2 * DIA),
      participants: [dueno, `alguien@${nombre.toLowerCase().replace(/\W/g, "")}.test`],
      organizerEmail: dueno,
      transcript: `Lo que se dijo con ${nombre}. ${"Y siguió la conversación. ".repeat(12)}`,
      resolvedClientId: c.id,
    },
  });
  return { id: c.id, proyecto: p.id, reunion: s.id };
}

/** Una CSE dueña de la cuenta «Propia», y otra cuenta («Ajena») de otro CSE. */
async function mundo() {
  const cse = await prisma.teamMember.create({ data: { name: "CSE de prueba", email: `cse${++serie}@smarteamcr.com`, roleEnum: "CSE" } });
  const propia = await cuentaConProyecto("Propia", "CLIENTE", cse.email);
  const ajena = await cuentaConProyecto("Ajena", "CLIENTE", `otro${++serie}@smarteamcr.com`);
  return { cse, ctx: contextoDeOperacion(cse), propia, ajena };
}

const noExiste = { ok: false, texto: NO_EXISTE };

describe("⛔ una CSE sin acceso a una cuenta recibe «No existe.» en cada herramienta", () => {
  it("memoria, reuniones y leer una reunión de la cuenta ajena", async () => {
    const { ctx, ajena } = await mundo();
    expect(await MEMORIA_DE_LA_CUENTA.leer(ctx, { cuenta: ajena.id })).toEqual(noExiste);
    expect(await MEMORIA_DE_LA_CUENTA.leer(ctx, { cuenta: ajena.id, proyecto: ajena.proyecto })).toEqual(noExiste);
    expect(await REUNIONES.leer(ctx, { cuenta: ajena.id })).toEqual(noExiste);
    expect(await LEER_REUNION.leer(ctx, { cuenta: ajena.id, reunion: ajena.reunion })).toEqual(noExiste);
  });

  it("buscar_cuenta no la nombra, ni buscándola por su nombre", async () => {
    const { ctx, propia } = await mundo();
    const todas = await BUSCAR_CUENTA.leer(ctx, {});
    expect(todas.ok && (todas.datos.cuentas as { id: string }[]).map((c) => c.id)).toEqual([propia.id]);
    expect(await BUSCAR_CUENTA.leer(ctx, { texto: "ajena" })).toEqual({ ok: true, datos: { cuentas: [], total: 0, hayMas: false } });
  });

  it("una cuenta que no existe responde lo mismo que una que no ve", async () => {
    const { ctx } = await mundo();
    expect(await REUNIONES.leer(ctx, { cuenta: "no-hay-tal-cuenta" })).toEqual(noExiste);
  });
});

describe("⛔ dentro de su cuenta, lo de otra cuenta tampoco existe", () => {
  it("una reunión o un proyecto de la cuenta ajena, pedidos con el id de la propia", async () => {
    const { ctx, propia, ajena } = await mundo();
    expect(await LEER_REUNION.leer(ctx, { cuenta: propia.id, reunion: ajena.reunion })).toEqual(noExiste);
    expect(await MEMORIA_DE_LA_CUENTA.leer(ctx, { cuenta: propia.id, proyecto: ajena.proyecto })).toEqual(noExiste);
  });

  it("las reuniones de la propia son solo las suyas", async () => {
    const { ctx, propia } = await mundo();
    const r = await REUNIONES.leer(ctx, { cuenta: propia.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.datos.reuniones as { id: string; texto: string }[]).map((x) => [x.id, x.texto])).toEqual([[propia.reunion, "transcripción"]]);
    expect(r.datos.cuenta).toMatchObject({ id: propia.id, nombre: "Propia", tipo: "cartera" });
  });
});

describe("lo suyo sí lo lee", () => {
  it("una reunión por partes, y la memoria con el lector del conector", async () => {
    const { ctx, propia } = await mundo();
    const r = await LEER_REUNION.leer(ctx, { cuenta: propia.id, reunion: propia.reunion });
    expect(r).toMatchObject({ ok: true, datos: { parte: 1, de: 1 } });
    expect(r.ok && String(r.datos.transcripcion).startsWith("Lo que se dijo con Propia.")).toBe(true);
    expect(await LEER_REUNION.leer(ctx, { cuenta: propia.id, reunion: propia.reunion, parte: 2 })).toEqual({ ok: false, texto: "Esa reunión tiene 1 parte." });
    const m = await MEMORIA_DE_LA_CUENTA.leer(ctx, { cuenta: propia.id });
    expect(m).toMatchObject({ ok: true, datos: { cuenta: { id: propia.id }, proyectos: [{ id: propia.proyecto }] } });
  });
});

describe("⛔ lo que no ocurrió no existe, y cada reunión dice su día y su texto como el resto de Nexus", () => {
  it("ni la reunión agendada ni la cancelada sin texto; la cancelada con texto sí, el día es el de Costa Rica", async () => {
    const { ctx, cse, propia } = await mundo();
    const base = { participants: [cse.email, "alguien@propia.test"], organizerEmail: cse.email, resolvedClientId: propia.id };
    const futura = await prisma.firefliesSession.create({ data: { ...base, id: `futura-${++serie}`, title: "Propia | La que viene", date: new Date(Date.now() + 2 * DIA) } });
    const cancelada = await prisma.firefliesSession.create({
      data: { ...base, id: `cancelada-${++serie}`, title: "Propia | Cancelada", date: new Date(Date.now() - 3 * DIA), canceladaEn: new Date(Date.now() - 4 * DIA) },
    });
    const canceladaConTexto = await prisma.firefliesSession.create({
      data: { ...base, id: `cancelada-con-texto-${++serie}`, title: "Propia | Movida", date: new Date(Date.now() - 5 * DIA), canceladaEn: new Date(), transcript: "Sí ocurrió. ".repeat(30) },
    });
    const soloNotas = await prisma.firefliesSession.create({
      data: { ...base, id: `notas-${++serie}`, title: "Propia | Con notas", date: new Date(Date.now() - 6 * DIA), summary: { overview: "Las notas de Gemini de la reunión. ".repeat(20) } },
    });
    // Las 18:30 del lunes 16 nov en Costa Rica son las 00:30 del martes 17 en hora universal.
    const deNoche = await prisma.firefliesSession.create({ data: { ...base, id: `noche-${++serie}`, title: "Propia | De noche", date: new Date("2026-11-17T00:30:00.000Z") } });

    const r = await REUNIONES.leer(ctx, { cuenta: propia.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porId = new Map((r.datos.reuniones as { id: string; dia: string; texto: string }[]).map((x) => [x.id, x]));
    expect(porId.has(futura.id)).toBe(false);
    expect(porId.has(cancelada.id)).toBe(false);
    expect(porId.get(canceladaConTexto.id)?.texto).toBe("transcripción");
    expect(porId.get(soloNotas.id)?.texto).toBe("solo notas");
    expect(porId.get(deNoche.id)).toMatchObject({ dia: "2026-11-16", texto: "nada" });

    expect(await LEER_REUNION.leer(ctx, { cuenta: propia.id, reunion: futura.id })).toEqual(noExiste);
    expect(await LEER_REUNION.leer(ctx, { cuenta: propia.id, reunion: cancelada.id })).toEqual(noExiste);
  });
});

describe("⛔ las empresas de Smarteam no se leen por el conector", () => {
  it("aunque todos las vean en Tareas", async () => {
    const { ctx, cse } = await mundo();
    const casa = await cuentaConProyecto("Smarteam", "INTERNO", cse.email);
    expect(await REUNIONES.leer(ctx, { cuenta: casa.id })).toEqual(noExiste);
    expect(await BUSCAR_CUENTA.leer(ctx, { texto: "smarteam" })).toEqual({ ok: true, datos: { cuentas: [], total: 0, hayMas: false } });
  });
});

describe("⛔ quién puede usar el conector", () => {
  it("un interno activo sí; uno desactivado, uno externo o un correo sin usuario no", async () => {
    const { cse } = await mundo();
    await prisma.appUser.create({ data: { authUserId: `auth-${++serie}`, email: cse.email, kind: "INTERNAL", teamMemberId: cse.id } });
    expect((await personaDelConector({ email: cse.email.toUpperCase() }))?.id).toBe(cse.id);

    const ido = await prisma.teamMember.create({ data: { name: "Ya no está", email: `ido${++serie}@smarteamcr.com`, roleEnum: "CSE", deactivatedAt: new Date() } });
    await prisma.appUser.create({ data: { authUserId: `auth-${++serie}`, email: ido.email, kind: "INTERNAL", teamMemberId: ido.id } });
    expect(await personaDelConector({ email: ido.email })).toBeNull();

    const cliente = await prisma.client.create({ data: { name: "Un cliente", kind: "CLIENTE" } });
    await prisma.appUser.create({ data: { authUserId: `auth-${++serie}`, email: "persona@cliente.test", kind: "EXTERNAL", clientId: cliente.id } });
    expect(await personaDelConector({ email: "persona@cliente.test" })).toBeNull();
    expect(await personaDelConector({ email: "nadie@smarteamcr.com" })).toBeNull();
  });
});
