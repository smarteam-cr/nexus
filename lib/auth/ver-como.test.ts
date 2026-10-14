/**
 * «Ver como otra persona» (lib/auth/ver-como.ts): quién puede, y que mirando NADA se escriba.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bloqueaEscritura, motivoParaNoVerComo, RUTA_VER_COMO } from "./ver-como";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const admin = { id: "a", roleEnum: "SUPER_ADMIN", deactivatedAt: null };
const heiver = { id: "h", roleEnum: "CSE", deactivatedAt: null, kind: "INTERNAL" };

describe("solo lectura mientras se mira", () => {
  it("con la cookie, toda escritura se corta", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(bloqueaEscritura(m, "/api/projects/x/ciclo", true), m).toBe(true);
    }
  });
  it("leer sigue andando, y salir también", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(bloqueaEscritura(m, "/api/projects/x", true)).toBe(false);
    expect(bloqueaEscritura("DELETE", RUTA_VER_COMO, true), "si no, no se puede volver al propio usuario").toBe(false);
    expect(bloqueaEscritura("POST", RUTA_VER_COMO, true)).toBe(false);
  });
  it("una ruta que solo EMPIEZA igual no se cuela", () => {
    expect(bloqueaEscritura("POST", "/api/ver-comox", true)).toBe(true);
  });
  it("sin la cookie no cambia nada", () => {
    expect(bloqueaEscritura("POST", "/api/projects/x", false)).toBe(false);
  });
});

describe("quién puede mirar a quién", () => {
  it("un Super Admin activo mira a alguien activo del equipo", () => {
    expect(motivoParaNoVerComo(admin, heiver)).toBeNull();
  });
  it("nadie más", () => {
    expect(motivoParaNoVerComo({ ...admin, roleEnum: "CSL" }, heiver)).not.toBeNull();
    expect(motivoParaNoVerComo({ ...admin, deactivatedAt: new Date() }, heiver)).not.toBeNull();
    expect(motivoParaNoVerComo(null, heiver)).not.toBeNull();
  });
  it("ni a cualquiera", () => {
    expect(motivoParaNoVerComo(admin, null)).not.toBeNull();
    expect(motivoParaNoVerComo(admin, { ...heiver, deactivatedAt: "2026-10-01" })).not.toBeNull();
    expect(motivoParaNoVerComo(admin, { ...heiver, roleEnum: "SUPER_ADMIN" })).not.toBeNull();
    expect(motivoParaNoVerComo(admin, { ...heiver, kind: "EXTERNAL" })).not.toBeNull();
    expect(motivoParaNoVerComo(admin, { ...admin, kind: "INTERNAL" })).not.toBeNull();
  });
});

describe("⛔ las piezas que lo sostienen", () => {
  it("el middleware corta las escrituras ANTES de cualquier handler", () => {
    const src = leer("middleware.ts");
    const corte = src.indexOf("bloqueaEscritura(request.method");
    expect(corte, "el middleware dejó de cortar las escrituras: mirando se escribiría a nombre de otro").toBeGreaterThan(-1);
    expect(corte).toBeLessThan(src.indexOf("createServerClient("));
  });
  it("requireUser cambia de identidad solo por el criterio único, y solo para un Super Admin", () => {
    const src = leer("lib/auth/supabase.ts");
    expect(src).toMatch(/return identidadVista\(appUser\);/);
    const cuerpo = src.slice(src.indexOf("async function identidadVista"), src.indexOf("export const requireUser"));
    expect(cuerpo.length, "la guarda no mira nada").toBeGreaterThan(200);
    expect(cuerpo).toContain('real.teamMember?.roleEnum !== "SUPER_ADMIN"');
    expect(cuerpo).toContain("motivoParaNoVerComo(");
  });
  it("la ruta de entrar usa el mismo criterio", () => {
    expect(leer("app/api/ver-como/route.ts")).toContain("motivoParaNoVerComo(");
  });
});
