/**
 * El agente de impacto cuenta en el tope del mes de Nexus conversando (lib/ai/tope-de-nexus.ts, 22 nov): al llegar a
 * US$ 100 no llama a la IA ni deja corrida, y lo dice con su `omitido`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const llamadas: unknown[] = [];
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (p: unknown) => {
        llamadas.push(p);
        return { content: [{ type: "text", text: '{"cambia":false,"porque":"","partes":[],"contradiceLoAceptado":false}' }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { _olvidarElGastoDeNexus } from "@/lib/ai/tope-de-nexus-server";
import { OMITIDO_POR_EL_TOPE } from "@/lib/ai/tope-de-nexus";
import { evaluarElImpacto } from "./impacto-server";

const NOTA = { texto: "El gerente confirmó que pierden unos 40 mil dólares al mes en cartera vencida.", por: "Liz", en: "2026-11-22T15:00:00.000Z" };
const ENTREGABLE = {
  nombre: "la página de La escala",
  armado: true,
  piezas: [{ parte: "Titular", texto: "Cobran a mano y pierden plata" }],
  publicado: false,
  cliente: { presentadaEl: null, presentadaPor: null, respuesta: null, aceptado: null },
  loAceptado: "",
};

beforeEach(() => {
  _olvidarElGastoDeNexus();
  llamadas.length = 0;
});

describe("el impacto y el tope del mes", () => {
  it("con US$ 100 gastados este mes no llama a la IA ni deja corrida", async () => {
    const c = await prisma.client.create({ data: { name: "Centauro de prueba", kind: "PROSPECTO" }, select: { id: true } });
    await prisma.llmCall.create({ data: { model: "claude-sonnet-4-6", costUsd: 100, origen: "chat:preventa" } });
    const r = await evaluarElImpacto(NOTA, ENTREGABLE, { agentSlug: "x", entregable: "escala", clientId: c.id, projectId: null, email: "liz@smarteam.test", filtros: {} });
    expect(r).toMatchObject({ cambia: false, omitido: OMITIDO_POR_EL_TOPE });
    expect(llamadas).toHaveLength(0);
    expect(await prisma.agentRun.count()).toBe(0);
  });

  it("debajo del tope, corre", async () => {
    const c = await prisma.client.create({ data: { name: "Centauro de prueba", kind: "PROSPECTO" }, select: { id: true } });
    await prisma.llmCall.create({ data: { model: "claude-sonnet-4-6", costUsd: 99, origen: "chat:preventa" } });
    const r = await evaluarElImpacto(NOTA, ENTREGABLE, { agentSlug: "x", entregable: "escala", clientId: c.id, projectId: null, email: "liz@smarteam.test", filtros: {} });
    expect(r.omitido).toBeUndefined();
    expect(llamadas).toHaveLength(1);
  });
});
