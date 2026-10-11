/**
 * lib/rentabilidad/acceso.test.ts — QUIÉN VE RENTABILIDAD Y QUIÉN VE «TU CARGA» (2026-10-07).
 *
 * Correr: `npx vitest run lib/rentabilidad/acceso.test.ts --project unit`.
 *
 * Rentabilidad muestra el costo de la hora de cada persona (de la planilla) y el margen de cada cuenta: solo dirección
 * (SUPER_ADMIN), por decisión de Elías. «Tu carga» la abre quien lleva cuentas y muestra SOLO lo suyo: la persona sale
 * de la sesión, nunca de la dirección. Estas pruebas leen el código de las páginas: si alguien mueve el candado de
 * lugar o le da a «Tu carga» una forma de pedir la carga de otra persona, fallan.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { ROLES_CON_CARGA_PROPIA, veRentabilidad, veSuCarga } from "./acceso";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const RENTABILIDAD = "app/(shell)/customer-success/rentabilidad/page.tsx";
const CUENTA = "app/(shell)/customer-success/rentabilidad/cuenta/[clientId]/page.tsx";
const TU_CARGA = "app/(shell)/tu-carga/page.tsx";
const TEAM_ROLES = Object.keys(ROLE_LABEL);

describe("los roles", () => {
  it("Rentabilidad es solo de SUPER_ADMIN", () => {
    expect(TEAM_ROLES.filter((r) => veRentabilidad(r))).toEqual(["SUPER_ADMIN"]);
    expect(veRentabilidad(null)).toBe(false);
  });

  it("«Tu carga» la abren quienes llevan cuentas (CSE y CSL) y dirección", () => {
    expect([...ROLES_CON_CARGA_PROPIA]).toEqual(["CSE", "CSL"]);
    expect(TEAM_ROLES.filter((r) => veSuCarga(r)).sort()).toEqual(["CSE", "CSL", "SUPER_ADMIN"]);
  });
});

describe("las páginas preguntan ANTES de cargar", () => {
  for (const archivo of [RENTABILIDAD, CUENTA]) {
    it(`${archivo}: el candado de dirección va antes de leer la rentabilidad`, () => {
      if (!existsSync(join(RAIZ, archivo))) return; // la página de la cuenta llega con E5
      const src = leer(archivo);
      const candado = src.search(/if \(!ctx \|\| !veRentabilidad\(ctx\.role\)\)/);
      expect(candado, "falta el candado veRentabilidad").toBeGreaterThan(-1);
      const primeraLectura = src.search(/cargar(Rentabilidad|MargenDeLaCuenta)\w*\(/);
      expect(primeraLectura).toBeGreaterThan(candado);
    });
  }

  it("«Tu carga» pregunta veSuCarga antes de cargar y la persona sale de la sesión", () => {
    const src = leer(TU_CARGA);
    const candado = src.search(/if \(!ctx \|\| !veSuCarga\(ctx\.role\)\)/);
    expect(candado).toBeGreaterThan(-1);
    expect(src.search(/cargarTuCarga\(/)).toBeGreaterThan(candado);
    expect(src).toMatch(/const email = ctx\.user\.email;/);
    // Ni parámetros de la dirección ni de la búsqueda: no hay forma de pedir la carga de otra persona.
    expect(src).not.toMatch(/params|searchParams/);
    // Y nada del dinero.
    expect(src).not.toMatch(/cargarRentabilidad|lib\/rentabilidad\/queries/);
  });

  it("la pantalla de «Tu carga» no lee la carga del equipo: solo recibe lo que la página recortó", () => {
    const src = leer("components/carga/TuCarga.tsx");
    expect(src).not.toMatch(/cargarCargaDelEquipo|DatosDeLaCarga\b|lib\/rentabilidad\/queries/);
  });
});
