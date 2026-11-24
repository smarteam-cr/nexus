/**
 * lib/canvas/guardados-en-fila.test.ts — el servidor recibe los guardados de un bloque en el orden en
 * que se hicieron, aunque la red devuelva el primero más tarde (reporte de Juan Carlos, 24 nov).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import { crearFilaDeGuardados, sigueEsperando, ESPERA_MAXIMA_MS, ESPERA_SIN_AVANCE_MS } from "./guardados-en-fila";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("guardados del mismo bloque en fila", () => {
  it("el primero en hacerse llega primero, aunque su red sea la más lenta", async () => {
    const encolar = crearFilaDeGuardados();
    const base: string[] = [];
    // El caso real: «Agregar franja» dos veces. El primer PUT tarda más que el segundo.
    const a = encolar("bloque", async () => {
      await esperar(40);
      base.push("una franja");
    });
    const b = encolar("bloque", async () => {
      await esperar(5);
      base.push("dos franjas");
    });
    await Promise.all([a, b]);
    // Sin la fila, la base terminaba en «una franja»: el primero pisaba al segundo.
    expect(base).toEqual(["una franja", "dos franjas"]);
  });

  it("solo el último de la fila dice que no viene otro: es el que relee", async () => {
    const encolar = crearFilaDeGuardados();
    const r = await Promise.all([
      encolar("bloque", async () => 1),
      encolar("bloque", async () => 2),
      encolar("bloque", async () => 3),
    ]);
    expect(r.map((x) => x.vieneOtro)).toEqual([true, true, false]);
    expect(r.map((x) => x.valor)).toEqual([1, 2, 3]);
  });

  it("un guardado suelto no espera a nadie y relee", async () => {
    const encolar = crearFilaDeGuardados();
    const r = await encolar("bloque", async () => "ok");
    expect(r).toEqual({ valor: "ok", vieneOtro: false });
  });

  it("uno que falla no traba al siguiente", async () => {
    const encolar = crearFilaDeGuardados();
    const fallido = encolar("bloque", async () => {
      await esperar(10);
      throw new Error("red caída");
    });
    const siguiente = encolar("bloque", async () => "guardado");
    await expect(fallido).rejects.toThrow("red caída");
    await expect(siguiente).resolves.toEqual({ valor: "guardado", vieneOtro: false });
  });

  it("bloques distintos no se esperan entre sí", async () => {
    const encolar = crearFilaDeGuardados();
    const orden: string[] = [];
    await Promise.all([
      encolar("franjas", async () => {
        await esperar(30);
        orden.push("franjas");
      }),
      encolar("equipo", async () => {
        await esperar(1);
        orden.push("equipo");
      }),
    ]);
    expect(orden).toEqual(["equipo", "franjas"]);
  });

  it("después de vaciarse, la fila arranca de nuevo sin esperar", async () => {
    const encolar = crearFilaDeGuardados();
    await encolar("bloque", async () => 1);
    const inicio = Date.now();
    const r = await encolar("bloque", async () => 2);
    expect(r.vieneOtro).toBe(false);
    expect(Date.now() - inicio).toBeLessThan(50);
  });
});

describe("«Subir al cliente» espera la fila entera", () => {
  it("sigue esperando mientras la cuenta baja, aunque pasen más de 5 s en total", () => {
    // Cinco casillas en una red lenta: 12 s en total, pero la última bajó hace 1 s.
    expect(sigueEsperando(2, 1_000, 12_000)).toBe(true);
  });

  it("corta tras 5 s sin que baje nada: un fetch colgado no traba el publish", () => {
    expect(sigueEsperando(1, ESPERA_SIN_AVANCE_MS, 6_000)).toBe(false);
  });

  it("y corta a los 30 s en total, avance o no", () => {
    expect(sigueEsperando(3, 0, ESPERA_MAXIMA_MS)).toBe(false);
  });

  it("sin pendientes no espera", () => {
    expect(sigueEsperando(0, 0, 0)).toBe(false);
  });
});

describe("⛔ el guardado del canvas usa la fila (si se quita, vuelve el reporte de Juan Carlos)", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "components/canvas/useCanvasSections.ts"), "utf8")
    .split("\r\n")
    .join("\n");
  const inicio = src.indexOf("const saveBlock = useCallback(");
  const fin = src.indexOf("// Deshacer de 1 nivel un bloque", inicio);
  const saveBlock = src.slice(inicio, fin);

  it("saveBlock manda el PUT por la fila del bloque", () => {
    expect(inicio, "no se encontró saveBlock").toBeGreaterThan(0);
    expect(saveBlock).toContain("encolarGuardado(blockId, () =>");
    expect(saveBlock, "un PUT directo, fuera de la fila, vuelve a cruzarse en la red").not.toMatch(
      /await mutate\(sectionId, \{ method: "PUT"/,
    );
  });

  it("relee solo el último de la fila", () => {
    expect(saveBlock).toContain("if (!vieneOtro) refetch();");
  });

  it("cuenta lo encolado como pendiente ANTES de esperar su turno", () => {
    const cuenta = saveBlock.indexOf("pendingWrites.current++");
    const fila = saveBlock.indexOf("encolarGuardado(blockId");
    expect(cuenta, "flushPending no vería el guardado que espera en la fila").toBeGreaterThan(0);
    expect(cuenta).toBeLessThan(fila);
  });

  it("flushPending corta por quietud, no por un total fijo", () => {
    const flush = src.slice(src.indexOf("const flushPending = useCallback("), src.indexOf("const flushPending") + 900);
    expect(flush).toContain("sigueEsperando(");
  });
});
