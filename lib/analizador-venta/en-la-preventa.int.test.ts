/**
 * lib/analizador-venta/en-la-preventa.int.test.ts — el análisis de la venta en la preventa contra una base REAL (S4, S5 y
 * S7, 2026-10-27), con Claude simulado.
 *
 * Lo que tiene que sostenerse escribiendo de verdad: la pieza de un prospecto trae solo SUS reuniones de venta (el
 * chokepoint), atribuidas a quien habló; el vendedor comenta, una persona confirma con lo que va «para la próxima»; volver a
 * analizar borra la confirmación y deja los comentarios; la tendencia cuenta lo confirmado; e INV62 cuida la confirmación.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

vi.mock("server-only", () => ({}));
const crear = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } } }));

import { analizarReunionDeVenta } from "./analizar-server";
import { analisisDelProspecto } from "./pieza-server";
import { comentarAnalisis, confirmarAnalisis, desconfirmarAnalisis } from "./revision-server";
import { tendenciaDelEquipo } from "./tendencia-server";
import { AGENTE_DEL_ANALIZADOR, PROMPT_DEL_ANALIZADOR } from "./prompt";
import { INV62 } from "@/lib/invariantes/analizador-venta";

const DIA = 86_400_000;
const ANDRES = "andres@smarteamcr.com";
const LIZ = "liz@smarteamcr.com";
const TRANSCRIPCION = [
  "Andrés Pinzón: ¿Qué pasa hoy cuando un distribuidor no reporta sus ventas a tiempo? Quiero entender el impacto.",
  "Pablo Bogantes: Perdemos visibilidad del inventario y la junta nos pide números que no tenemos a fin de mes.",
  "Andrés Pinzón: ¿Y cuánto tiempo les toma armar ese reporte hoy, a mano, con las planillas de cada país?",
  "Pablo Bogantes: Dos personas, tres días cada mes. Es lo que más nos duele ahora mismo, la verdad.",
].join("\n");

const SOLO_HABLA_LIZ = [
  "Liz Navarro: Hoy quiero entender cómo arman el reporte de ventas de cada país y quién lo revisa al final del mes.",
  "Pablo Bogantes: Lo arma cada gerente y lo junto yo en una planilla grande, a mano, todos los meses.",
].join("\n");

const respuesta = (resumen: string) => ({
  stop_reason: "tool_use",
  content: [
    {
      type: "tool_use",
      name: "registrar_analisis",
      input: {
        resumen,
        juicios: [
          { punto: "consultiva", valor: "mucho", lectura: "Preguntaste por el impacto.", citas: [{ turno: 3, texto: "cuánto tiempo les toma armar ese reporte hoy" }] },
          { punto: "siguiente_paso", valor: "con_fecha_y_duenio", lectura: "Quedó una demo el martes.", citas: [{ turno: 2, texto: "la junta nos pide números que no tenemos" }] },
        ],
        recomendaciones: [{ texto: "Pregunta quién más decide en la junta.", citas: [] }],
      },
    },
  ],
});

describe("el análisis de la venta en la preventa — DB real", { timeout: 30_000 }, () => {
  it("la pieza trae solo las reuniones de la empresa; comentar, confirmar, volver a analizar; la tendencia e INV62", async () => {
    const ahora = new Date();
    await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteamcr.com"] } });
    await prisma.teamMember.create({ data: { name: "Andrés Pinzón", email: ANDRES, area: "Ventas", roleEnum: "VENTAS" } });
    await prisma.teamMember.create({ data: { name: "Liz Navarro", email: LIZ, area: "Customer Success", roleEnum: "CSE" } });
    const camosa = await prisma.client.create({ data: { name: "Camosa (test)", kind: "PROSPECTO" } });
    const otro = await prisma.client.create({ data: { name: "Otro prospecto (test)", kind: "PROSPECTO" } });
    await prisma.agent.create({ data: { id: AGENTE_DEL_ANALIZADOR, name: "Analizador", systemPrompt: PROMPT_DEL_ANALIZADOR, status: "ACTIVE", associatedStages: [] } });
    // La organizó Liz y fue Andrés: habló Andrés, así que es de Andrés (no de quien la organizó).
    await prisma.firefliesSession.createMany({
      data: [
        { id: "camosa-1", title: "Camosa l Exploración", date: new Date(+ahora - 10 * DIA), participants: [ANDRES, LIZ, "pablo@camosa.test"], organizerEmail: LIZ, transcript: TRANSCRIPCION, resolvedClientId: camosa.id },
        { id: "camosa-2", title: "Camosa l Propuesta", date: new Date(+ahora - 3 * DIA), participants: [ANDRES, "pablo@camosa.test"], organizerEmail: ANDRES, resolvedClientId: camosa.id },
        { id: "otro-1", title: "Otro l Exploración", date: new Date(+ahora - 2 * DIA), participants: [ANDRES, "x@otro.test"], organizerEmail: ANDRES, transcript: TRANSCRIPCION, resolvedClientId: otro.id },
        // La organizó Andrés (Ventas) y solo habló Liz (CS): por quién habló es de Liz; por el calendario habría sido de Andrés.
        { id: "otro-2", title: "Otro l Seguimiento", date: new Date(+ahora - 1 * DIA), participants: [ANDRES, LIZ, "x@otro.test"], organizerEmail: ANDRES, transcript: SOLO_HABLA_LIZ, resolvedClientId: otro.id },
        // Sin transcripción: por la invitación, menos quien la rechazó (Andrés): es de Liz.
        { id: "otro-3", title: "Otro l Demo", date: new Date(+ahora - 0.5 * DIA), participants: [ANDRES, LIZ, "x@otro.test"], organizerEmail: LIZ, resolvedClientId: otro.id },
      ],
    });
    await prisma.participanteDeReunion.create({ data: { sessionId: "otro-3", correo: ANDRES, esDelEquipo: true, respuesta: "RECHAZO" } });
    const deOtro = (await analisisDelProspecto(otro.id, ahora)).reuniones;
    expect(deOtro.map((r) => [r.id, r.correos])).toEqual([
      ["otro-1", [ANDRES]],
      ["otro-2", [LIZ]],
      ["otro-3", [LIZ]],
    ]);

    // S5: solo las de Camosa, de la más vieja a la más nueva, con quién habló calculado y atribuidas por quién habló.
    let pieza = await analisisDelProspecto(camosa.id, ahora);
    expect(pieza.reuniones.map((r) => r.id)).toEqual(["camosa-1", "camosa-2"]);
    expect(pieza.reuniones[0].correos).toEqual([ANDRES]);
    expect(pieza.reuniones[0].quienHablo?.fuente).toBe("transcripcion");
    expect(pieza.reuniones[1]).toMatchObject({ texto: "nada", quienHablo: null, detalle: null });
    expect(pieza.nombres[ANDRES]).toBe("Andrés Pinzón");

    // S4: se analiza, el vendedor discrepa y una persona confirma con lo que va para la próxima.
    crear.mockResolvedValue(respuesta("Exploraste el impacto antes de la solución."));
    expect((await analizarReunionDeVenta("camosa-1", { pedidoPor: "elias@smarteamcr.com" })).ok).toBe(true);
    expect(await confirmarAnalisis("sin-analisis", { por: ANDRES, paraLaProxima: [], analizadoAt: ahora.toISOString() })).toMatchObject({ ok: false, status: 404 });
    // Dos comentarios a la vez: los dos quedan (la fila se bloquea).
    const [c1, c2] = await Promise.all([
      comentarAnalisis("camosa-1", { por: ANDRES, tipo: "discrepa", punto: "siguiente_paso", texto: "La demo era el jueves." }),
      comentarAnalisis("camosa-1", { por: LIZ, tipo: "comenta", punto: null, texto: "De acuerdo con lo del impacto." }),
    ]);
    expect(c1.ok && c2.ok).toBe(true);
    const leido = (await prisma.analisisDeVenta.findUniqueOrThrow({ where: { sessionId: "camosa-1" } })).analizadoAt.toISOString();
    expect(
      (await confirmarAnalisis("camosa-1", { por: "Elias@smarteamcr.com", nota: "Bien", analizadoAt: leido, paraLaProxima: ["Pregunta quién más decide en la junta.", "Pregunta quién más decide en la junta."] })).ok,
    ).toBe(true);
    pieza = await analisisDelProspecto(camosa.id, ahora);
    const d = pieza.reuniones[0].detalle!;
    expect(d.comentarios).toHaveLength(2);
    expect(d.comentarios).toContainEqual(expect.objectContaining({ por: ANDRES, tipo: "discrepa", punto: "siguiente_paso", texto: "La demo era el jueves." }));
    expect(d.confirmado).toMatchObject({ por: "elias@smarteamcr.com", nota: "Bien" });
    expect(d.paraLaProxima).toEqual(["Pregunta quién más decide en la junta."]);
    expect((await INV62.correr(prisma, ahora)).ok).toBe(true);

    // S7: lo confirmado cuenta en la tendencia de Andrés; la reunión de otro prospecto también es suya (es de todo el equipo).
    let t = await tendenciaDelEquipo({ dias: 90, ahora });
    const andres = t.vendedores.find((v) => v.correo === ANDRES)!;
    expect(andres).toMatchObject({ nombre: "Andrés Pinzón", reuniones: 3, conTranscripcion: 2, confirmadas: 1, conFecha: { con: 1, de: 1 } });
    expect(t.vendedores.find((v) => v.correo === LIZ)).toMatchObject({ reuniones: 2, conTranscripcion: 1 });

    // Volver a analizar: la confirmación se va (el análisis es otro), los comentarios se quedan.
    crear.mockResolvedValue(respuesta("Segunda lectura."));
    expect((await analizarReunionDeVenta("camosa-1", { pedidoPor: "elias@smarteamcr.com" })).ok).toBe(true);
    const fila = await prisma.analisisDeVenta.findUniqueOrThrow({ where: { sessionId: "camosa-1" } });
    expect(fila).toMatchObject({ confirmadoPor: null, confirmadoAt: null, notaDeConfirmacion: null, paraLaProxima: null });
    expect(fila.comentarios).toHaveLength(2);
    // Quien tenía abierto el análisis viejo no puede confirmar el nuevo, que no leyó.
    expect(await confirmarAnalisis("camosa-1", { por: ANDRES, paraLaProxima: [], analizadoAt: leido })).toMatchObject({ ok: false, status: 409 });
    expect((await prisma.analisisDeVenta.findUniqueOrThrow({ where: { sessionId: "camosa-1" } })).confirmadoPor).toBeNull();
    t = await tendenciaDelEquipo({ dias: 90, ahora });
    expect(t.vendedores.find((v) => v.correo === ANDRES)!.confirmadas).toBe(0);

    // INV62: una confirmación anterior al análisis (lo que dejaría volver a analizar sin borrarla) la pone en rojo.
    await prisma.analisisDeVenta.update({ where: { sessionId: "camosa-1" }, data: { confirmadoPor: ANDRES, confirmadoAt: new Date(+fila.analizadoAt - 60_000) } });
    const rojo = await INV62.correr(prisma, ahora);
    expect(rojo.ok).toBe(false);
    expect(rojo.lineas.join("\n")).toContain("camosa-1");
    expect((await desconfirmarAnalisis("camosa-1")).ok).toBe(true);
    expect((await INV62.correr(prisma, ahora)).ok).toBe(true);

    // Si la reunión cambió de dueña, su análisis ya no se revisa (invariante 1; INV57 lo reclama).
    await prisma.firefliesSession.update({ where: { id: "camosa-1" }, data: { resolvedClientId: otro.id } });
    expect(await confirmarAnalisis("camosa-1", { por: ANDRES, paraLaProxima: [], analizadoAt: fila.analizadoAt.toISOString() })).toMatchObject({ ok: false, status: 409 });

    expect((await analisisDelProspecto(camosa.id, ahora)).reuniones.map((r) => r.id)).toEqual(["camosa-2"]);
  });
});
