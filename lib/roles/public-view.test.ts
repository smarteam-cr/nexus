/**
 * lib/roles/public-view.test.ts — el chokepoint público, que es lo único entre un
 * documento con una oferta salarial y la web abierta.
 *
 * Dos cosas se congelan acá:
 *  1. Los CUATRO caminos a `null` (token con forma inválida, inexistente, revocado —
 *     `publicToken` en null no matchea el findUnique— y desactivado). Un `null` es la
 *     única respuesta: quien está afuera no puede distinguir un caso de otro.
 *  2. El SHAPE exacto de lo que sale. Un `select` descuidado que sume `createdByEmail`,
 *     el propio token o los `shares` no rompería nada visible — este test sí.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { findUniqueMock } = vi.hoisted(() => ({ findUniqueMock: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { roleProfile: { findUnique: findUniqueMock } } }));

import { getPublicRoleDoc, ROLE_PUBLIC_TOKEN_RE } from "./public-view";

const TOKEN = "a".repeat(64);
const FILA = {
  docType: "PROPUESTA" as const,
  title: "Customer Success Lead",
  area: "Propuesta de contratación · Smarteam",
  summary: "Lleva éxito a toda la cartera.",
  content: { profile: { md: "…" } },
  active: true,
};

beforeEach(() => findUniqueMock.mockReset());

describe("forma del token", () => {
  it("acepta 64 hex y rechaza cualquier otra cosa", () => {
    expect(ROLE_PUBLIC_TOKEN_RE.test(TOKEN)).toBe(true);
    expect(ROLE_PUBLIC_TOKEN_RE.test("a".repeat(63))).toBe(false);
    expect(ROLE_PUBLIC_TOKEN_RE.test("z".repeat(64))).toBe(false);
  });
});

describe("getPublicRoleDoc", () => {
  it("token con forma inválida NO toca la base", async () => {
    expect(await getPublicRoleDoc("pegame-el-doc")).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("token vacío → null", async () => {
    expect(await getPublicRoleDoc("")).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("token inexistente (o revocado: el token pasa a null) → null", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getPublicRoleDoc(TOKEN)).toBeNull();
  });

  it("documento desactivado → null, aunque el token siga vivo", async () => {
    findUniqueMock.mockResolvedValue({ ...FILA, active: false });
    expect(await getPublicRoleDoc(TOKEN)).toBeNull();
  });

  it("devuelve EXACTAMENTE estas claves — nada de auditoría ni el token", async () => {
    findUniqueMock.mockResolvedValue(FILA);
    const doc = await getPublicRoleDoc(TOKEN);
    expect(doc).not.toBeNull();
    expect(Object.keys(doc!).sort()).toEqual(["area", "content", "docType", "summary", "title"]);
  });

  it("el `content` nulo sale como objeto vacío (el motor no recibe null)", async () => {
    findUniqueMock.mockResolvedValue({ ...FILA, content: null });
    expect((await getPublicRoleDoc(TOKEN))!.content).toEqual({});
  });
});
