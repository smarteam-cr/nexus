/**
 * lib/ai/assist.test.ts — núcleo del assist de documento, con `anthropic` MOCKEADO
 * (ningún test pega a la API real; los shapes de los fixtures reproducen los del
 * .d.ts del SDK 0.78: server_tool_use / web_search_tool_result / pause_turn).
 * Correr: `npx vitest run lib/ai/assist.test.ts --project unit`
 */
import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: vi.fn() } } }));

import { anthropic } from "@/lib/anthropic";
import { runDocumentAssist, type DocumentAssistInput } from "./assist";

const createMock = vi.mocked(anthropic.messages.create);

beforeEach(() => {
  createMock.mockReset();
});

const SECTIONS: DocumentAssistInput["sections"] = [
  {
    key: "profile",
    label: "Perfil",
    schema: { type: "object", properties: { md: { type: "string" } } },
    brief: "Qué es el puesto en 2 líneas.",
    currentData: { md: "Texto viejo" },
  },
  {
    key: "wig",
    label: "La meta",
    schema: {
      type: "object",
      properties: { desde: { type: "string" }, hasta: { type: "string" }, fecha: { type: "string" } },
    },
    currentData: { desde: "X", hasta: "Y", fecha: "2026-12", nota_curada: "no me pierdas" },
  },
];

function baseInput(): DocumentAssistInput {
  return {
    docLabel: "perfil de puesto",
    systemPrompt: "Eres el asistente de perfiles de Smarteam.",
    sections: SECTIONS,
    instruction: "Mejora el perfil",
  };
}

function textMsg(overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ profile: { md: "Texto nuevo" }, __reasoning: "Aclaré el alcance." }) }],
    ...overrides,
  };
}

// (a) Respuesta solo-texto: propuesta validada, summary por label, sin búsquedas.
test("a — solo texto: propone, resume por label y no marca web search", async () => {
  createMock.mockResolvedValueOnce(textMsg() as never);
  const r = await runDocumentAssist(baseInput());
  expect(r.proposal).toEqual({ profile: { md: "Texto nuevo" } });
  expect(r.summary).toEqual(["Perfil"]);
  expect(r.reasoning).toBe("Aclaré el alcance.");
  expect(r.usedWebSearch).toBe(false);
  expect(r.citations).toEqual([]);
  // La tool web_search SIEMPRE va en la llamada (el modelo decide usarla o no).
  const params = createMock.mock.calls[0][0] as { tools?: Array<{ type: string; name: string }> };
  expect(params.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
});

// (b) Con server_tool_use + web_search_tool_result: citations dedupeadas + flag.
test("b — con búsquedas: junta citations (dedupe por url) y marca usedWebSearch", async () => {
  createMock.mockResolvedValueOnce({
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", id: "st1", name: "web_search", input: { query: "4dx lead measures" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "st1",
        content: [
          { type: "web_search_result", url: "https://a.com/4dx", title: "4DX explained", encrypted_content: "x", page_age: null },
          { type: "web_search_result", url: "https://a.com/4dx", title: "4DX explained (dup)", encrypted_content: "x", page_age: null },
          { type: "web_search_result", url: "https://b.com", title: "", encrypted_content: "x", page_age: null },
        ],
      },
      { type: "text", text: JSON.stringify({ wig: { desde: "3", hasta: "8", fecha: "2026-12-31" } }) },
    ],
  } as never);
  const r = await runDocumentAssist(baseInput());
  expect(r.usedWebSearch).toBe(true);
  expect(r.citations).toEqual([
    { url: "https://a.com/4dx", title: "4DX explained" },
    { url: "https://b.com", title: "https://b.com" }, // título vacío → cae a la url
  ]);
  // El merge no-schema conserva lo curado que el schema no conoce.
  expect(r.proposal.wig).toEqual({ desde: "3", hasta: "8", fecha: "2026-12-31", nota_curada: "no me pierdas" });
});

// (c) Key fuera del contrato: se descarta con warning, jamás llega al apply.
test("c — sección desconocida: warning y descarte; las válidas pasan", async () => {
  createMock.mockResolvedValueOnce(
    textMsg({
      content: [
        {
          type: "text",
          text: JSON.stringify({ profile: { md: "ok" }, horarios: { hack: "no debería" } }),
        },
      ],
    }) as never,
  );
  const r = await runDocumentAssist(baseInput());
  expect(r.proposal).toEqual({ profile: { md: "ok" } });
  expect("horarios" in r.proposal).toBe(false);
  expect(r.warnings.some((w) => w.includes('"horarios"'))).toBe(true);
});

// (d) pause_turn: re-envía el content del assistant y concatena el texto.
test("d — pause_turn: continúa la conversación y junta el texto de ambos turnos", async () => {
  createMock
    .mockResolvedValueOnce({
      stop_reason: "pause_turn",
      content: [
        { type: "server_tool_use", id: "st1", name: "web_search", input: { query: "q" } },
        { type: "text", text: '{"profile": {"md": "mitad' },
      ],
    } as never)
    .mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: ' y final"}}' }],
    } as never);
  const r = await runDocumentAssist(baseInput());
  expect(createMock).toHaveBeenCalledTimes(2);
  // La 2ª llamada lleva el content del assistant del 1er turno (continuación).
  const second = createMock.mock.calls[1][0] as { messages: Array<{ role: string }> };
  expect(second.messages).toHaveLength(2);
  expect(second.messages[1].role).toBe("assistant");
  expect(r.proposal).toEqual({ profile: { md: "mitad y final" } });
  expect(r.usedWebSearch).toBe(true);
});

// (e) max_tokens: NUNCA aplicar una propuesta truncada.
test("e — max_tokens: aborta con mensaje humano", async () => {
  createMock.mockResolvedValueOnce(textMsg({ stop_reason: "max_tokens" }) as never);
  await expect(runDocumentAssist(baseInput())).rejects.toThrow(/límite de tokens/);
});

// (f) Búsqueda con error: warning, la propuesta sigue.
test("f — web_search_tool_result con error_code: warning sin romper", async () => {
  createMock.mockResolvedValueOnce({
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", id: "st1", name: "web_search", input: { query: "q" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "st1",
        content: { type: "web_search_tool_result_error", error_code: "unavailable" },
      },
      { type: "text", text: JSON.stringify({ profile: { md: "sin fuentes" } }) },
    ],
  } as never);
  const r = await runDocumentAssist(baseInput());
  expect(r.proposal).toEqual({ profile: { md: "sin fuentes" } });
  expect(r.warnings.some((w) => w.includes("unavailable"))).toBe(true);
  expect(r.citations).toEqual([]);
});

// (g) Sin propuesta utilizable: error claro (JSON inválido o solo keys descartadas).
test("g — sin secciones válidas: lanza con mensaje según el caso", async () => {
  createMock.mockResolvedValueOnce(textMsg({ content: [{ type: "text", text: "no hay json" }] }) as never);
  await expect(runDocumentAssist(baseInput())).rejects.toThrow(/no devolvió una propuesta válida/);

  createMock.mockResolvedValueOnce(
    textMsg({ content: [{ type: "text", text: JSON.stringify({ desconocida: {} }) }] }) as never,
  );
  await expect(runDocumentAssist(baseInput())).rejects.toThrow(/ninguna sección editable/);
});
