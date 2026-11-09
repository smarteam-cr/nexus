/**
 * lib/tareas/clientes-de-las-lineas.int.test.ts — el cliente que Tareas sugiere para una línea de una reunión interna,
 * cuando quien la lee ve solo una parte de una empresa con unidades (revisión del 8 nov). Contra una base REAL.
 *
 * Correr: `npx vitest run --project integration lib/tareas/clientes-de-las-lineas.int.test.ts` (con `npm run db:local -- up`).
 *
 * Cemaco · Costa Rica es la principal y Cemaco · Ecuador su unidad con dominio propio. Las otras unidades entran al
 * índice solo para la regla de la marca: nunca se sugieren a quien no las ve.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));

import { prisma } from "@/lib/db/prisma";
import { clientesDeLasLineas } from "./lectura";
import type { ClientesQueVes } from "./clientes";
import type { LineaDeProximosPasos } from "./proximos-pasos";

const linea = (id: string, titulo: string): LineaDeProximosPasos => ({ id, personas: [], titulo, detalle: null, texto: titulo });
const ves = (...ids: string[]): ClientesQueVes => ({ todos: false, ids: new Set(ids), porId: new Map() });

async function cemaco() {
  const cr = await prisma.client.create({ data: { name: "Cemaco · Costa Rica", emailDomains: ["cemaco.co.cr"], siglas: ["CR"] } });
  const ec = await prisma.client.create({
    data: { name: "Cemaco · Ecuador", emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], comparteDominioConId: cr.id },
  });
  return { cr, ec };
}

describe("Tareas sugiere con la regla de las unidades aunque se vea solo una parte de la empresa — DB real", () => {
  it("quien ve solo la principal: «Planificación expansión Costa Rica» no sugiere nada; «Cemaco CR | pipeline», Costa Rica", async () => {
    const { cr, ec } = await cemaco();
    const r = await clientesDeLasLineas(
      [linea("a", "Planificación expansión Costa Rica"), linea("b", "Cemaco CR | revisar el pipeline"), linea("c", "Llamar a Cemaco Ecuador")],
      ves(cr.id),
    );
    expect(r.get("a")?.sugerido).toBeNull();
    expect(r.get("b")?.sugerido).toBe(cr.id);
    // Ecuador no se le sugiere a quien no la ve, ni como opción.
    expect(r.get("c")?.sugerido).toBeNull();
    expect(r.get("c")?.candidatos).not.toContain(ec.id);
  });

  it("quien ve solo la unidad: la marca sola no la sugiere y la principal no aparece", async () => {
    const { cr, ec } = await cemaco();
    const r = await clientesDeLasLineas([linea("a", "Llamar a Cemaco por la factura"), linea("b", "Kickoff Cemaco Ecuador")], ves(ec.id));
    expect(r.get("a")?.sugerido).toBeNull();
    expect(r.get("a")?.candidatos).not.toContain(cr.id);
    expect(r.get("b")?.sugerido).toBe(ec.id);
  });
});
