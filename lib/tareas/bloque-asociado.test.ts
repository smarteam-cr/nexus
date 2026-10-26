/**
 * lib/tareas/bloque-asociado.test.ts — un evento que ya existía y se unió a una tarea (P3, 2026-10-27: «Asociar a una
 * tarea») nunca lo borra Nexus. Lo que lo pone en rojo: leer los bloques sin conservar `asociado`, o que `quitarBloques`
 * (lo único que borra eventos de Calendar) deje de saltarse los asociados.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leerBloques, repartirBloques } from "./estados";

const RAIZ = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

describe("el bloque asociado (P3)", () => {
  it("leerBloques conserva la marca y el evento unido, y un unido nunca trae `eventoId` (lo que borra mira ese campo)", () => {
    const b = leerBloques([
      { calendario: "ana@x.com", eventoId: "e1", inicio: "2026-10-28T15:00:00Z", fin: "2026-10-28T16:00:00Z", asociado: true, eventoUnido: "e1" },
      { calendario: "ana@x.com", eventoId: "e2", inicio: "2026-10-28T17:00:00Z", fin: "2026-10-28T18:00:00Z", asociado: "si" },
    ]);
    expect(b[0]).toMatchObject({ asociado: true, eventoUnido: "e1", eventoId: null });
    expect("asociado" in b[1]!).toBe(false);
    expect(b[1]!.eventoId).toBe("e2");
  });

  it("repartirBloques lo deja entre los tuyos (para desunirlo), con la marca", () => {
    const b = leerBloques([{ calendario: "ana@x.com", eventoId: null, inicio: "2026-10-28T15:00:00Z", fin: "2026-10-28T16:00:00Z", asociado: true, eventoUnido: "e1" }]);
    const r = repartirBloques(b, "ANA@x.com", new Date("2026-10-27T00:00:00Z"));
    expect(r.miosQueVienen.map((x) => x.asociado)).toEqual([true]);
  });

  it("quitarBloques, lo único que borra eventos de Calendar, se salta los asociados", () => {
    const src = leer("lib/google/agenda.ts");
    const quitar = src.slice(src.indexOf("export async function quitarBloques"), src.indexOf("export async function leerEventoDelCalendario"));
    expect(quitar).toMatch(/const propios = bloques\.filter\(\(b\) => [^\n]*!b\.asociado\)/);
    // Fuera de quitarBloques, el único borrado es el de una tanda que falló a medias (lo que Nexus acababa de crear).
    expect(src.split("events.delete(").length - 1).toBe(2);
  });

  it("«asociar» guarda el evento con la marca, después de leerlo en tu calendario", () => {
    const ruta = leer("app/api/tareas/[id]/agenda/route.ts");
    const asociar = ruta.slice(ruta.indexOf('if (d.modo === "asociar")'), ruta.indexOf("if (!tarea.acciones.agendar)"));
    expect(asociar).toContain("leerEventoDelCalendario(p.ctx.email, d.eventoId)");
    expect(asociar).toContain("eventoId: null");
    expect(asociar).toContain("asociado: true, eventoUnido: ev.id");
  });
});
