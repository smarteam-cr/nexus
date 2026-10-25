/**
 * lib/analizador-venta/analizador.int.test.ts — el analizador de reuniones de venta contra una base REAL (S2 y S3,
 * 2026-10-25), con Claude simulado.
 *
 * Lo que tiene que sostenerse escribiendo de verdad: una reunión con un prospecto se analiza y queda como propuesta con
 * sus juicios citados (el que cita algo que no se dijo se descarta) y quién habló calculado; una de entrega con un cliente
 * no se analiza; la vista por empresa las separa; e INV57 se pone en rojo si la reunión cambia de dueña después.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));
const crear = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } } }));

import { analizarReunionDeVenta, anotarElError } from "./analizar-server";
import { reunionesDeVenta, reunionesPorAnalizar } from "./reuniones-de-venta-server";
import { soltarAnalisisDeVentaAjenos } from "./ajenos";
import { AGENTE_DEL_ANALIZADOR, PROMPT_DEL_ANALIZADOR } from "./prompt";
import { INV57 } from "@/lib/invariantes/analizador-venta";

const DIA = 86_400_000;
const ANDRES = "andres@smarteamcr.com";
const TRANSCRIPCION = [
  "Camosa | Exploración - Transcripción",
  "00:00:01",
  "Andrés Pinzón: ¿Qué pasa hoy cuando un distribuidor no reporta sus ventas a tiempo? Quiero entender el impacto.",
  "Pablo Bogantes: Perdemos visibilidad del inventario y la junta nos pide números que no tenemos a fin de mes.",
  "Andrés Pinzón: ¿Y cuánto tiempo les toma armar ese reporte hoy, a mano, con las planillas de cada país?",
  "Pablo Bogantes: Dos personas, tres días cada mes. Es lo que más nos duele ahora mismo, la verdad.",
].join("\n");

describe("el analizador de reuniones de venta — DB real", { timeout: 30_000 }, () => {
  it("analiza la de un prospecto con citas verificadas, no la de entrega, y INV57 cuida a la dueña", async () => {
    const ahora = new Date();
    await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteamcr.com"] } });
    await prisma.teamMember.create({ data: { name: "Andrés Pinzón", email: ANDRES, area: "Ventas", roleEnum: "VENTAS" } });
    await prisma.teamMember.create({ data: { name: "Liz Navarro", email: "liz@smarteamcr.com", area: "Customer Success", roleEnum: "CSE" } });
    const camosa = await prisma.client.create({ data: { name: "Camosa (test)", kind: "PROSPECTO" } });
    const cemaco = await prisma.client.create({ data: { name: "Cemaco (test)", kind: "CLIENTE" } });
    await prisma.agent.create({ data: { id: AGENTE_DEL_ANALIZADOR, name: "Analizador", systemPrompt: PROMPT_DEL_ANALIZADOR, status: "ACTIVE", associatedStages: [] } });
    await prisma.firefliesSession.createMany({
      data: [
        { id: "venta-camosa", title: "Camosa l Exploración de retos operativos", date: new Date(+ahora - 2 * DIA), participants: [ANDRES, "pablo@camosa.test"], organizerEmail: ANDRES, transcript: TRANSCRIPCION, resolvedClientId: camosa.id },
        { id: "entrega-cemaco", title: "Cemaco | Seguimiento", date: new Date(+ahora - 2 * DIA), participants: ["liz@smarteamcr.com", "x@cemaco.test"], organizerEmail: "liz@smarteamcr.com", transcript: TRANSCRIPCION, resolvedClientId: cemaco.id },
      ],
    });

    crear.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "registrar_analisis",
          input: {
            resumen: "Exploraste el impacto antes de hablar de la solución.",
            juicios: [
              { punto: "consultiva", valor: "mucho", lectura: "Preguntaste por el impacto y por el costo del problema.", citas: [{ turno: 3, texto: "cuánto tiempo les toma armar ese reporte hoy" }] },
              { punto: "temas", valor: "producto", lectura: "Inventado.", citas: [{ turno: 2, texto: "queremos comprar las licencias ya" }] },
              { punto: "siguiente_paso", valor: "ninguno", lectura: "No quedó un siguiente paso.", citas: [] },
            ],
            recomendaciones: [{ texto: "Pregunta quién más decide en la junta.", citas: [{ turno: 2, texto: "la junta nos pide números que no tenemos" }] }],
          },
        },
      ],
    });

    // El job la elige: es de venta, reciente, con transcripción y sin análisis.
    expect(await reunionesPorAnalizar(ahora, 5)).toEqual(["venta-camosa"]);
    const r = await analizarReunionDeVenta("venta-camosa", { pedidoPor: "elias@smarteamcr.com" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.descartados).toBe(1);
    const fila = await prisma.analisisDeVenta.findUniqueOrThrow({ where: { sessionId: "venta-camosa" } });
    expect(fila).toMatchObject({ clientId: camosa.id, estado: "PROPUESTO", descartados: 1, pedidoPor: "elias@smarteamcr.com" });
    const res = fila.resultado as { juicios: { punto: string; citas: { hablante: string; turno: number }[] }[] };
    expect(res.juicios.map((j) => j.punto)).toEqual(["consultiva", "siguiente_paso"]);
    expect(res.juicios[0].citas[0]).toMatchObject({ hablante: "Andrés Pinzón", turno: 3 });
    expect((fila.quienHablo as { fuente: string; cliente: { porcentaje: number } }).fuente).toBe("transcripcion");
    // La corrida queda con su agente y su empresa (el costo lo anota el medidor por el agentSlug).
    expect(await prisma.agentRun.findFirstOrThrow({ where: { id: r.runId } })).toMatchObject({ agentId: AGENTE_DEL_ANALIZADOR, clientId: camosa.id, status: "DONE" });
    // El modelo recibió solo esta reunión: ninguna otra empresa en el material.
    const material = JSON.stringify(crear.mock.calls[0][0].messages);
    expect(material).toContain("Camosa (test)");
    expect(material).not.toContain("Cemaco");

    // Un error después no pisa el análisis bueno; y el job ya no la vuelve a tomar.
    await anotarElError("venta-camosa", camosa.id, "falló");
    expect(await prisma.analisisDeVenta.findUniqueOrThrow({ where: { sessionId: "venta-camosa" } })).toMatchObject({ estado: "PROPUESTO", error: null });
    expect(await reunionesPorAnalizar(ahora, 5)).toEqual([]);

    // La de entrega con un cliente, sin Ventas en la sala, no es de venta: ni sola ni a mano.
    expect(await analizarReunionDeVenta("entrega-cemaco", { pedidoPor: null })).toMatchObject({ ok: false, status: 409 });
    expect(await analizarReunionDeVenta("entrega-cemaco", { pedidoPor: "elias@smarteamcr.com" })).toMatchObject({ ok: false, status: 409 });

    // La expansión de un cliente sin preventa (con Ventas en la sala): no entra sola, pero se analiza a mano y desde ahí cuenta.
    await prisma.firefliesSession.create({
      data: { id: "fase2-cemaco", title: "Fase 2: Marketing", date: new Date(+ahora - 3 * DIA), participants: [ANDRES, "x@cemaco.test"], organizerEmail: ANDRES, transcript: TRANSCRIPCION, resolvedClientId: cemaco.id },
    });
    expect((await reunionesDeVenta({ dias: 90, ahora })).map((e) => e.nombre)).toEqual(["Camosa (test)"]);
    expect(await analizarReunionDeVenta("fase2-cemaco", { pedidoPor: null })).toMatchObject({ ok: false, status: 409 });
    expect((await analizarReunionDeVenta("fase2-cemaco", { pedidoPor: "elias@smarteamcr.com" })).ok).toBe(true);

    // La vista por empresa: Camosa con su reunión analizada, y la expansión de Cemaco; la de entrega no aparece.
    const empresas = await reunionesDeVenta({ dias: 90, ahora });
    expect(empresas.map((e) => e.nombre).sort()).toEqual(["Camosa (test)", "Cemaco (test)"]);
    expect(empresas.find((e) => e.nombre === "Cemaco (test)")!.reuniones.map((r) => r.id)).toEqual(["fase2-cemaco"]);
    empresas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    expect(empresas[0]).toMatchObject({ conTranscripcion: 1, analizadas: 1 });
    expect(empresas[0].reuniones[0].vendedores).toEqual(["Andrés Pinzón"]);

    // INV57: en verde; si la reunión cambia de dueña después del análisis, en rojo.
    expect((await INV57.correr(prisma, ahora)).ok).toBe(true);
    await prisma.firefliesSession.update({ where: { id: "venta-camosa" }, data: { resolvedClientId: cemaco.id } });
    const rojo = await INV57.correr(prisma, ahora);
    expect(rojo.ok).toBe(false);
    expect(rojo.lineas.join("\n")).toContain("venta-camosa");
    // Lo que hace la re-atribución al cambiar la dueña (y el script de remedio): suelta el análisis ajeno.
    expect(await soltarAnalisisDeVentaAjenos(["venta-camosa", "fase2-cemaco"])).toBe(1);
    expect((await INV57.correr(prisma, ahora)).ok).toBe(true);
  });
});
