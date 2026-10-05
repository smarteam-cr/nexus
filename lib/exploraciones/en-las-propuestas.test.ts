/**
 * `usarPreventa` con prisma simulado: el invariante n.º 1 (nunca mezclar clientes) y que unir dos
 * veces a la vez no rompa con la llave única de los casos de uso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const filas = {
    bc: { clientId: "cliente-a" } as { clientId: string } | null,
    exp: null as Record<string, unknown> | null,
    delCatalogo: [] as { id: string }[],
    yaTiene: [] as { useCaseId: string }[],
  };
  const prisma = {
    businessCase: {
      findUnique: vi.fn(async () => filas.bc),
      update: vi.fn((args: unknown) => ({ que: "businessCase.update", args })),
    },
    exploracionDeVenta: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => filas.exp),
    },
    useCase: { findMany: vi.fn(async () => filas.delCatalogo) },
    businessCaseUseCase: {
      findMany: vi.fn(async () => filas.yaTiene),
      create: vi.fn((args: unknown) => ({ que: "businessCaseUseCase.create", args })),
      createMany: vi.fn((args: unknown) => ({ que: "businessCaseUseCase.createMany", args })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { filas, prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));

import { usarPreventa } from "./en-las-propuestas";

/** Una preventa de `clientId` que eligió esos casos de uso. */
function preventa(clientId: string, casos: string[]) {
  return {
    clientId,
    contenido: { casosDeUso: Object.fromEntries(casos.map((id) => [id, { titulo: `Caso ${id}`, areaId: null }])) },
    propuesta: {},
    areas: [],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivadaEn: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.filas.bc = { clientId: "cliente-a" };
  db.filas.exp = null;
  db.filas.delCatalogo = [];
  db.filas.yaTiene = [];
});

describe("usarPreventa", () => {
  it("⛔ una preventa de OTRA empresa no se une: 400 y no se escribe nada", async () => {
    db.filas.exp = preventa("cliente-b", ["caso-1"]);
    db.filas.delCatalogo = [{ id: "caso-1" }];
    const r = await usarPreventa("bc-1", "exp-1");
    expect(r).toEqual({ ok: false, status: 400, error: "Esa preventa es de otra empresa." });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(db.prisma.businessCase.update).not.toHaveBeenCalled();
    expect(db.prisma.businessCaseUseCase.createMany).not.toHaveBeenCalled();
  });

  it("suma los casos nuevos con createMany + skipDuplicates (dos pedidos a la vez no chocan con la llave única)", async () => {
    db.filas.exp = preventa("cliente-a", ["caso-1", "caso-2", "ia-0000abcd"]);
    db.filas.delCatalogo = [{ id: "caso-1" }, { id: "caso-2" }];
    db.filas.yaTiene = [{ useCaseId: "caso-1" }];
    const r = await usarPreventa("bc-1", "exp-1");
    expect(r).toEqual({ ok: true });
    expect(db.prisma.businessCaseUseCase.create).not.toHaveBeenCalled();
    expect(db.prisma.businessCaseUseCase.createMany).toHaveBeenCalledWith({
      data: [{ businessCaseId: "bc-1", useCaseId: "caso-2", selected: true }],
      skipDuplicates: true,
    });
    const ops = db.prisma.$transaction.mock.calls[0][0] as { que: string }[];
    expect(ops.map((o) => o.que)).toEqual(["businessCase.update", "businessCaseUseCase.createMany"]);
  });

  it("sin casos nuevos, solo une la propuesta", async () => {
    db.filas.exp = preventa("cliente-a", ["caso-1"]);
    db.filas.delCatalogo = [{ id: "caso-1" }];
    db.filas.yaTiene = [{ useCaseId: "caso-1" }];
    expect(await usarPreventa("bc-1", "exp-1")).toEqual({ ok: true });
    const ops = db.prisma.$transaction.mock.calls[0][0] as { que: string }[];
    expect(ops.map((o) => o.que)).toEqual(["businessCase.update"]);
  });
});
