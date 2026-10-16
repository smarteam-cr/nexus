/**
 * lib/sessions/reunion-a-mano.int.test.ts — «Agregar una reunión» contra una base REAL (etapa 4f, 2026-10-15).
 *
 * Lo que tiene que sostenerse escribiendo de verdad: la reunión nueva queda del cliente que eligió la persona (con la
 * procedencia «humano»), con sus proyectos vinculados a mano, y con lo que pasó guardado según lo que es (la
 * transcripción en `transcript`; lo que se recuerda en `summary`, marcado). A una reunión de Meet sin nada se le agrega lo
 * que pasó; a una con transcripción, nunca. Un proyecto de otro cliente no entra (invariante 1).
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));

import { agregarReunion, opcionesParaAgregar } from "./reunion-a-mano-server";
import { agregarReunionSchema } from "./reunion-a-mano-schema";
import { leerMarcaAMano, recuerdoDeLaReunion } from "./reunion-a-mano";

const QUIEN = { email: "ana@smarteamcr.com", nombre: "Ana Gómez" };
const RECUERDO = "Hablamos del pipeline de ventas. Quedamos en mandar la propuesta el lunes y en revisar las propiedades.";

async function mundo() {
  const cliente = await prisma.client.create({ data: { name: "Cliente con reunión a mano (test)" } });
  const otro = await prisma.client.create({ data: { name: "Otro cliente (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
  const ajeno = await prisma.project.create({ data: { clientId: otro.id, name: "Proyecto ajeno (test)" } });
  return { cliente, otro, proyecto, ajeno };
}

const pedido = (o: Record<string, unknown>) => agregarReunionSchema.parse(o);

// La primera escritura carga la cola de la lectura (imports dinámicos): en frío pasa de los 5 s de siempre.
describe("agregar una reunión a mano — DB real", { timeout: 30_000 }, () => {
  it("una nueva con lo que se recuerda: del cliente, a mano, con su proyecto y la marca", async () => {
    const { cliente, proyecto } = await mundo();
    const r = await agregarReunion(
      pedido({
        clientId: cliente.id,
        fecha: "2026-10-14",
        hora: "10:00",
        titulo: "Llamada con Luis",
        proyectoIds: [proyecto.id],
        equipo: ["Ana@smarteamcr.com"],
        delCliente: ["Luis Mora"],
        contenido: { tipo: "recuerdo", texto: RECUERDO },
      }),
      QUIEN,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nueva).toBe(true);
    expect(r.sessionId.startsWith("manual_")).toBe(true);

    const s = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    expect(s.source).toBe("manual");
    expect(s.manualClientId).toBe(cliente.id);
    expect(s.manualClientSource).toBe("humano");
    expect(s.manualClientBy).toBe("ana@smarteamcr.com");
    expect(s.resolvedClientId).toBe(cliente.id);
    expect(s.transcript).toBeNull();
    expect(s.participants).toEqual(["ana@smarteamcr.com", "Luis Mora"]);
    expect(recuerdoDeLaReunion(s.summary)).toBe(RECUERDO);
    expect(leerMarcaAMano(s.summary)).toMatchObject({ tipo: "recuerdo", por: "ana@smarteamcr.com", nombre: "Ana Gómez" });
    expect(s.date.toISOString()).toBe("2026-10-14T16:00:00.000Z");

    const links = await prisma.sessionProject.findMany({ where: { sessionId: r.sessionId } });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ projectId: proyecto.id, source: "manual", isPrimary: true, included: true });
  });

  it("si ese día ya hay reuniones del cliente, pregunta antes de crear otra", async () => {
    const { cliente } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "gmeet_sin_nada", title: "Seguimiento semanal", date: new Date("2026-10-14T15:00:00Z"), participants: ["luis@cliente.test"], resolvedClientId: cliente.id },
    });
    const base = { clientId: cliente.id, fecha: "2026-10-14", titulo: "Otra", contenido: { tipo: "recuerdo", texto: RECUERDO } };

    const r = await agregarReunion(pedido(base), QUIEN);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.reunionesDelDia?.map((x) => x.id)).toEqual(["gmeet_sin_nada"]);
    expect(r.reunionesDelDia?.[0].porQueNo).toBeNull();

    const otra = await agregarReunion(pedido({ ...base, confirmarOtra: true }), QUIEN);
    expect(otra.ok).toBe(true);
  });

  it("a una de Meet sin nada se le agrega lo que pasó; a una con transcripción, nunca", async () => {
    const { cliente, proyecto } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "gmeet_vacia", title: "Revisión", date: new Date("2026-10-13T15:00:00Z"), participants: ["luis@cliente.test"], resolvedClientId: cliente.id, enrichAttempts: 2 },
    });
    await prisma.firefliesSession.create({
      data: {
        id: "gmeet_con_texto",
        title: "Kickoff",
        date: new Date("2026-10-13T18:00:00Z"),
        participants: ["luis@cliente.test"],
        resolvedClientId: cliente.id,
        transcript: "Luis: hola. ".repeat(40),
      },
    });

    const transcripcion = "Ana: Buenos días.\nLuis: Hola, ¿cómo están?\n".repeat(10);
    const r = await agregarReunion(
      pedido({ clientId: cliente.id, fecha: "2026-10-13", reunionExistenteId: "gmeet_vacia", proyectoIds: [proyecto.id], contenido: { tipo: "transcripcion", texto: transcripcion } }),
      QUIEN,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nueva).toBe(false);
    const s = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "gmeet_vacia" } });
    expect(s.transcript).toBe(transcripcion.trim());
    expect(s.source).toBe("google_meet");
    expect(s.enrichAttempts).toBe(0);
    expect(s.enrichedAt).not.toBeNull();
    expect(leerMarcaAMano(s.summary)?.tipo).toBe("transcripcion");

    const conTexto = await agregarReunion(
      pedido({ clientId: cliente.id, fecha: "2026-10-13", reunionExistenteId: "gmeet_con_texto", contenido: { tipo: "recuerdo", texto: RECUERDO } }),
      QUIEN,
    );
    expect(conTexto.ok).toBe(false);
    if (!conTexto.ok) expect(conTexto.status).toBe(409);
    const intacta = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "gmeet_con_texto" } });
    expect(intacta.summary).toBeNull();
  });

  it("un proyecto de otro cliente no entra, y una reunión de otro cliente tampoco", async () => {
    const { cliente, otro, ajeno } = await mundo();
    const r = await agregarReunion(
      pedido({ clientId: cliente.id, fecha: "2026-10-12", titulo: "X", proyectoIds: [ajeno.id], contenido: { tipo: "recuerdo", texto: RECUERDO } }),
      QUIEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);

    await prisma.firefliesSession.create({
      data: { id: "gmeet_del_otro", title: "Del otro", date: new Date("2026-10-12T15:00:00Z"), participants: [], resolvedClientId: otro.id },
    });
    const ajena = await agregarReunion(
      pedido({ clientId: cliente.id, fecha: "2026-10-12", reunionExistenteId: "gmeet_del_otro", contenido: { tipo: "recuerdo", texto: RECUERDO } }),
      QUIEN,
    );
    expect(ajena.ok).toBe(false);
    if (!ajena.ok) expect(ajena.status).toBe(404);
    expect(await prisma.firefliesSession.count({ where: { source: "manual" } })).toBe(0);
  });

  it("una reunión que todavía no ocurrió no se agrega", async () => {
    const { cliente } = await mundo();
    const r = await agregarReunion(
      pedido({ clientId: cliente.id, fecha: "2099-01-01", titulo: "Futura", contenido: { tipo: "recuerdo", texto: RECUERDO } }),
      QUIEN,
    );
    expect(r.ok).toBe(false);
  });

  it("las opciones traen los proyectos del cliente y las reuniones de ese día", async () => {
    const { cliente, proyecto } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "gmeet_del_dia", title: "Del día", date: new Date("2026-10-11T15:00:00Z"), participants: [], resolvedClientId: cliente.id },
    });
    const o = await opcionesParaAgregar(cliente.id, "2026-10-11");
    expect(o?.proyectos.map((p) => p.id)).toEqual([proyecto.id]);
    expect(o?.reunionesDelDia.map((r) => r.id)).toEqual(["gmeet_del_dia"]);
    expect((await opcionesParaAgregar(cliente.id, "2026-10-10"))?.reunionesDelDia).toEqual([]);
  });
});
