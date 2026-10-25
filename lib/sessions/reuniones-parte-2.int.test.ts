/**
 * lib/sessions/reuniones-parte-2.int.test.ts — T3, T4 y T9 contra una base REAL (2026-10-25).
 *
 * Lo que tiene que sostenerse escribiendo de verdad:
 *   · T4: el job guarda el motivo de cada reunión sin texto, lo borra cuando llega el texto, e INV52 lo vigila;
 *   · T3: la propuesta sale del resolver; confirmarla escribe el dueño «humano» con quién fue, lo materializa y anota la
 *     decisión; quien no estuvo no decide; una empresa que no puede abrir no se elige;
 *   · T9: lo que cuenta quien estuvo queda como el texto de la reunión, con el origen «preguntas»; quien no estuvo, no.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));
// Lo que `reResolveSession` y `agregarReunion` disparan en segundo plano (la cola de la lectura, los hechos) no es lo
// que se prueba acá, y corriendo después del caso choca con el TRUNCATE del siguiente.
vi.mock("@/lib/lecturas/cola", () => ({ encolarSeguimiento: async () => ({ encolada: false, motivo: "apagada" }) }));
vi.mock("@/lib/seguimiento/hechos-server", () => ({ alCambiarDeDueno: async () => {} }));

import { guardarMotivosSinTexto } from "./motivo-sin-texto-server";
import { calcularPropuestas } from "./propuesta-de-empresa-server";
import { decidirEmpresaDeLaReunion } from "./empresa-de-la-reunion-server";
import { guardarRespuestas, preguntasParaLaReunion } from "./preguntas-de-contexto-server";
import { leerMarcaAMano } from "./reunion-a-mano";
import { INV52, INV52_BLOQUEA } from "@/lib/invariantes/reuniones";
import { INV1 } from "@/lib/invariantes/sesiones";
import { reunionesEnOtraEmpresa } from "./buscar-en-la-empresa-server";

const DIA = 86_400_000;
const TEXTO = "Ana: les mando la base de clientes el miércoles. ".repeat(10);
const LIZ = "liz@smarteam.test";

async function casa() {
  await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteam.test"] } });
  const liz = await prisma.teamMember.create({ data: { name: "Liz Navarro", email: LIZ, roleEnum: "SUPER_ADMIN" } });
  const marco = await prisma.teamMember.create({ data: { name: "Marco Rojas", email: "marco@smarteam.test", roleEnum: "CSE" } });
  return { liz, marco };
}

describe("T4 · el motivo de cada reunión sin texto, guardado", { timeout: 30_000 }, () => {
  it("se guarda, se borra cuando llega el texto, e INV52 lo vigila", async () => {
    const ahora = new Date();
    await casa();
    const empresa = await prisma.client.create({ data: { name: "Cemaco (test)", emailDomains: ["cemaco.test"] } });
    const hace = (d: number) => new Date(+ahora - d * DIA);
    await prisma.firefliesSession.createMany({
      data: [
        // Una cuenta del Workspace de Smarteam (la que reconoce por-que-falta.ts) la organizó y no se grabó.
        { id: "t4-sin-nada", title: "Cemaco | Data Hub", date: hace(3), duration: 48, enrichedAt: new Date(+hace(3) + 2 * 3_600_000), participants: ["liliana@smarteamcr.com", "ana@cemaco.test"], organizerEmail: "liliana@smarteamcr.com", resolvedClientId: empresa.id },
        { id: "t4-con-texto", title: "Con texto", date: hace(3), enrichedAt: hace(3), participants: [LIZ, "ana@cemaco.test"], transcript: TEXTO, resolvedClientId: empresa.id },
      ],
    });

    const antes = await INV52.correr(prisma, ahora);
    expect(antes.ok).toBe(!INV52_BLOQUEA);
    expect(antes.lineas.join("\n")).toContain("t4-sin-nada");

    const r = await guardarMotivosSinTexto({ ahora });
    expect(r).toMatchObject({ escritas: 1, borradas: 0 });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t4-sin-nada" } })).motivoSinTexto).toBe("no_se_grabo");
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t4-con-texto" } })).motivoSinTexto).toBeNull();
    expect((await INV52.correr(prisma, ahora)).lineas[0]).toMatch(/^✓ INV52/);

    // Una segunda corrida no escribe nada; cuando llega el texto, el motivo se borra.
    expect(await guardarMotivosSinTexto({ ahora })).toMatchObject({ escritas: 0, borradas: 0 });
    await prisma.firefliesSession.update({ where: { id: "t4-sin-nada" }, data: { transcript: TEXTO } });
    expect(await guardarMotivosSinTexto({ ahora })).toMatchObject({ escritas: 0, borradas: 1 });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t4-sin-nada" } })).motivoSinTexto).toBeNull();
  });
});

describe("T3 · la empresa de una reunión sin empresa", { timeout: 30_000 }, () => {
  it("la propone el resolver, la confirma quien estuvo y queda anotado quién y qué decidió", async () => {
    const ahora = new Date();
    const { liz, marco } = await casa();
    // La reunión llegó antes que la empresa: quedó sin dueña. La empresa nueva la reconoce por el dominio.
    await prisma.firefliesSession.create({
      data: { id: "t3-faco", title: "Revisión de FACO", date: new Date(+ahora - 2 * DIA), enrichedAt: new Date(+ahora - 2 * DIA), participants: [LIZ, "pablo@faco.test"], organizerEmail: LIZ, transcript: TEXTO },
    });
    const faco = await prisma.client.create({ data: { name: "FACO (test)", emailDomains: ["faco.test"] } });

    const p = await calcularPropuestas({ ahora });
    expect(p).toMatchObject({ miradas: 1, nuevas: 1 });
    const guardada = await prisma.propuestaDeEmpresa.findUniqueOrThrow({ where: { sessionId: "t3-faco" } });
    expect(guardada).toMatchObject({ tipo: "CLIENTE", clientId: faco.id, decision: null });
    // Una segunda corrida no la reescribe.
    expect(await calcularPropuestas({ ahora })).toMatchObject({ nuevas: 0, cambiadas: 0 });

    // Quien no estuvo no decide.
    const vista = { accion: "confirmar" as const, esperada: { tipo: "CLIENTE" as const, clave: faco.id } };
    // Una propuesta distinta de la que vio la persona no se confirma.
    expect(await decidirEmpresaDeLaReunion("t3-faco", { accion: "confirmar", esperada: { tipo: "HUBSPOT", clave: "hs-1" } }, { email: LIZ, teamMemberId: liz.id, veTodo: false })).toMatchObject({
      ok: false,
      status: 409,
    });
    const ajeno = await decidirEmpresaDeLaReunion("t3-faco", vista, { email: marco.email, teamMemberId: marco.id, veTodo: false });
    expect(ajeno).toMatchObject({ ok: false, status: 403 });

    const r = await decidirEmpresaDeLaReunion("t3-faco", vista, { email: LIZ, teamMemberId: liz.id, veTodo: false });
    expect(r).toMatchObject({ ok: true, clientId: faco.id, creada: false });
    const s = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t3-faco" } });
    expect(s).toMatchObject({ manualClientId: faco.id, manualClientSource: "humano", manualClientBy: LIZ, resolvedClientId: faco.id });
    expect(await prisma.propuestaDeEmpresa.findUniqueOrThrow({ where: { sessionId: "t3-faco" } })).toMatchObject({ decision: "CONFIRMADA", decididaPor: LIZ });

    // Ya tiene empresa: no se «confirma» de nuevo; moverla pide poder abrir las dos.
    expect(await decidirEmpresaDeLaReunion("t3-faco", vista, { email: LIZ, teamMemberId: liz.id, veTodo: false })).toMatchObject({ ok: false, status: 409 });
  });

  it("elegir otra empresa la anota como «otra»; una que quien decide no puede abrir, no se elige", async () => {
    const ahora = new Date();
    const { liz, marco } = await casa();
    await prisma.firefliesSession.create({
      data: { id: "t3-otra", title: "Llamada", date: new Date(+ahora - DIA), enrichedAt: new Date(+ahora - DIA), participants: [LIZ, "marco@smarteam.test", "x@personal.test"], organizerEmail: LIZ, transcript: TEXTO },
    });
    const propuesta = await prisma.client.create({ data: { name: "Propuesta (test)" } });
    const elegida = await prisma.client.create({ data: { name: "Elegida (test)" } });
    await prisma.propuestaDeEmpresa.create({ data: { sessionId: "t3-otra", tipo: "CLIENTE", clientId: propuesta.id, nombre: propuesta.name } });

    // Marco estuvo, pero es CSE sin esa empresa asignada: no la puede elegir.
    expect(await decidirEmpresaDeLaReunion("t3-otra", { accion: "elegir", clientId: elegida.id }, { email: marco.email, teamMemberId: marco.id, veTodo: false })).toMatchObject({
      ok: false,
      status: 403,
    });
    const r = await decidirEmpresaDeLaReunion("t3-otra", { accion: "elegir", clientId: elegida.id }, { email: LIZ, teamMemberId: liz.id, veTodo: true });
    expect(r).toMatchObject({ ok: true, clientId: elegida.id });
    expect(await prisma.propuestaDeEmpresa.findUniqueOrThrow({ where: { sessionId: "t3-otra" } })).toMatchObject({ decision: "OTRA" });
  });
});

describe("T8 · mover una reunión que quedó en otra empresa", { timeout: 30_000 }, () => {
  it("pide abrir las dos empresas, suelta los vínculos a la vieja (INV1 en verde) y no deja adivinar títulos ajenos", async () => {
    const ahora = new Date();
    const { liz, marco } = await casa();
    const a = await prisma.client.create({ data: { name: "Empresa A (test)", emailDomains: ["a.test"] } });
    const b = await prisma.client.create({ data: { name: "Empresa B (test)" } });
    const proyectoDeB = await prisma.project.create({ data: { clientId: b.id, name: "Proyecto de B (test)" } });
    await prisma.firefliesSession.createMany({
      data: [
        { id: "t8-en-b", title: "Despido de Ana", date: new Date(+ahora - 120 * DIA), participants: [LIZ, "ana@a.test"], transcript: TEXTO, resolvedClientId: b.id },
      ],
    });
    await prisma.sessionProject.create({ data: { sessionId: "t8-en-b", projectId: proyectoDeB.id, isPrimary: true, source: "manual" } });

    // Marco (CSE) no abre B: no ve el título, y el número de ocultas no cambia con lo que escribe.
    const sinAcceso = await reunionesEnOtraEmpresa({ clientId: a.id, teamMemberId: marco.id, ahora });
    expect(sinAcceso).toMatchObject({ reuniones: [], ocultas: 1 });
    expect((await reunionesEnOtraEmpresa({ clientId: a.id, teamMemberId: marco.id, q: "despido", ahora })).ocultas).toBe(1);
    expect((await reunionesEnOtraEmpresa({ clientId: a.id, teamMemberId: marco.id, q: "zzz", ahora })).ocultas).toBe(1);
    // Moverla sin abrir B: «no existe».
    expect(await decidirEmpresaDeLaReunion("t8-en-b", { accion: "mover", clientId: a.id }, { email: marco.email, teamMemberId: marco.id, veTodo: false })).toMatchObject({
      ok: false,
      status: 404,
    });

    // Liz (Super Admin) la ve y la mueve: queda en A, sin el vínculo al proyecto de B.
    const conAcceso = await reunionesEnOtraEmpresa({ clientId: a.id, teamMemberId: liz.id, ahora });
    expect(conAcceso.reuniones.map((r) => r.sessionId)).toEqual(["t8-en-b"]);
    const r = await decidirEmpresaDeLaReunion("t8-en-b", { accion: "mover", clientId: a.id }, { email: LIZ, teamMemberId: liz.id, veTodo: true });
    expect(r).toMatchObject({ ok: true, clientId: a.id });
    expect(await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t8-en-b" } })).toMatchObject({ manualClientId: a.id, resolvedClientId: a.id });
    expect(await prisma.sessionProject.count({ where: { sessionId: "t8-en-b" } })).toBe(0);
    expect((await INV1.correr(prisma, ahora)).ok).toBe(true);
  });
});

describe("T9 · lo que cuenta quien estuvo", { timeout: 30_000 }, () => {
  it("las preguntas citan solo reuniones de la misma empresa, y lo respondido queda como el texto", async () => {
    const ahora = new Date();
    const { liz, marco } = await casa();
    const cemaco = await prisma.client.create({ data: { name: "Cemaco" } });
    const otra = await prisma.client.create({ data: { name: "Otra empresa" } });
    await prisma.firefliesSession.createMany({
      data: [
        { id: "t9-anterior", title: "Cemaco | NAV", date: new Date(+ahora - 7 * DIA), participants: [LIZ, "a@cemaco.test"], transcript: TEXTO, resolvedClientId: cemaco.id },
        { id: "t9-ajena", title: "Otra | Secreto", date: new Date(+ahora - 5 * DIA), participants: [LIZ, "a@otra.test"], transcript: TEXTO, resolvedClientId: otra.id },
        { id: "t9-sin-texto", title: "Cemaco | Data Hub", date: new Date(+ahora - 2 * DIA), participants: [LIZ, "a@cemaco.test"], organizerEmail: LIZ, resolvedClientId: cemaco.id, enrichedAt: new Date(+ahora - 2 * DIA) },
      ],
    });
    await prisma.sessionMinute.createMany({
      data: [
        { sessionId: "t9-anterior", summary: "x", agreements: [{ text: "Delphos manda el web service" }] },
        { sessionId: "t9-ajena", summary: "x", agreements: [{ text: "Un acuerdo de otra empresa" }] },
      ],
    });

    const preguntas = await preguntasParaLaReunion({ sessionId: "t9-sin-texto", dueno: cemaco.id, empresa: "Cemaco", titulo: "Cemaco | Data Hub", fecha: new Date(+ahora - 2 * DIA) });
    const textos = preguntas.map((p) => p.texto).join("\n");
    expect(textos).toContain("«Data Hub»");
    expect(textos).toContain("Delphos manda el web service");
    expect(textos).not.toContain("otra empresa");

    const respuestas = [{ pregunta: preguntas[0].texto, respuesta: "Se definió el alcance del Data Hub con las tres fuentes de datos." }];
    expect(await guardarRespuestas("t9-sin-texto", cemaco.id, { respuestas, extra: "" }, { email: marco.email, nombre: "Marco" })).toMatchObject({ ok: false, status: 403 });
    const r = await guardarRespuestas("t9-sin-texto", cemaco.id, { respuestas, extra: "" }, { email: liz.email, nombre: "Liz Navarro" });
    expect(r.ok).toBe(true);
    const s = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "t9-sin-texto" } });
    expect(leerMarcaAMano(s.summary)).toMatchObject({ tipo: "recuerdo", por: LIZ, origen: "preguntas" });
    expect((s.summary as { overview: string }).overview).toContain("Se definió el alcance del Data Hub");
  });
});
