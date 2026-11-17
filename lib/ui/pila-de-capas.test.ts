import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apilarCapa, esLaDeArriba } from "./pila-de-capas";
import { Z } from "./z";

describe("Escape cierra solo la capa de arriba (Finanzas, 2026-11-17)", () => {
  it("con un diálogo abierto sobre un cajón, el de arriba es el diálogo; al cerrarlo, vuelve a ser el cajón", () => {
    const cajon = Symbol("cajón");
    const dialogo = Symbol("diálogo");
    const sacarCajon = apilarCapa(cajon);
    const sacarDialogo = apilarCapa(dialogo);
    expect(esLaDeArriba(dialogo)).toBe(true);
    expect(esLaDeArriba(cajon)).toBe(false);
    sacarDialogo();
    expect(esLaDeArriba(cajon)).toBe(true);
    sacarCajon();
    expect(esLaDeArriba(cajon)).toBe(false);
  });

  it("sacar una capa de abajo no le quita el lugar a la de arriba", () => {
    const a = Symbol("a");
    const b = Symbol("b");
    const sacarA = apilarCapa(a);
    const sacarB = apilarCapa(b);
    sacarA();
    expect(esLaDeArriba(b)).toBe(true);
    sacarB();
    sacarB();
    expect(esLaDeArriba(b)).toBe(false);
  });
});

describe("⛔ un diálogo se ve por encima del cajón desde el que se abre", () => {
  const leer = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");

  it("Modal (y ConfirmDialog, que lo usa) nace en la capa MODAL, sobre la del cajón y la del cajón de detalle", () => {
    expect(Z.MODAL).toBeGreaterThan(Z.DRAWER);
    expect(Z.MODAL).toBeGreaterThan(Z.OVERLAY);
    expect(leer("components", "ui", "Modal.tsx")).toMatch(/z = zClass\("MODAL"\),/);
  });

  it("Modal y Drawer atienden Escape solo si son la capa de arriba", () => {
    for (const archivo of ["Modal.tsx", "Drawer.tsx"]) {
      expect(leer("components", "ui", archivo)).toMatch(/if \(e\.key === "Escape" && esLaDeArriba\(capa\)\) onClose\(\);/);
    }
  });
});
