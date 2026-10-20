/**
 * «Ver como otra persona» (lib/auth/ver-como.ts): quién puede, y que mirando NADA se escriba.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bloqueaEscritura, motivoParaNoVerComo, puedeVerComoASuperAdmin, RUTA_VER_COMO } from "./ver-como";

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

describe("ver como un Super Admin: solo Elías (prueba 148)", () => {
  const elias = { ...admin, id: "e", email: "egonzalez@smarteamcr.com" };
  const marco = { id: "m", roleEnum: "SUPER_ADMIN", deactivatedAt: null, kind: "INTERNAL" };
  it("Elías puede ver como Marco o Alex Arrieta, y como cualquiera", () => {
    expect(motivoParaNoVerComo(elias, marco)).toBeNull();
    expect(motivoParaNoVerComo(elias, heiver)).toBeNull();
    expect(motivoParaNoVerComo({ ...elias, email: "  EGonzalez@SmarteamCR.com " }, marco), "mayúsculas o espacios no lo cambian").toBeNull();
  });
  it("otro Super Admin no", () => {
    expect(motivoParaNoVerComo({ ...admin, email: "marco@smarteamcr.com" }, marco)).not.toBeNull();
    expect(motivoParaNoVerComo({ ...admin, email: null }, marco)).not.toBeNull();
    expect(motivoParaNoVerComo(admin, marco), "sin correo de sesión, no").not.toBeNull();
  });
  it("estar en la lista no saca las demás reglas", () => {
    expect(motivoParaNoVerComo({ ...elias, roleEnum: "CSL" }, marco), "deja de ser Super Admin").not.toBeNull();
    expect(motivoParaNoVerComo({ ...elias, deactivatedAt: new Date() }, marco)).not.toBeNull();
    expect(motivoParaNoVerComo(elias, { ...elias, kind: "INTERNAL" }), "a sí mismo no").toBe("Ya eres tú.");
    expect(motivoParaNoVerComo(elias, { ...marco, deactivatedAt: "2026-10-01" })).not.toBeNull();
    expect(motivoParaNoVerComo(elias, { ...marco, kind: "EXTERNAL" })).not.toBeNull();
  });
  it("la lista no se parece a otro correo", () => {
    expect(puedeVerComoASuperAdmin("egonzalez@smarteamcr.com")).toBe(true);
    for (const e of ["egonzalez@smarteamcr.com.evil.com", "xegonzalez@smarteamcr.com", "egonzalez@smarteamcr.co", "", null, undefined]) {
      expect(puedeVerComoASuperAdmin(e), String(e)).toBe(false);
    }
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
  it("el correo que decide la lista es el de la sesión (AppUser), en la ruta y en requireUser", () => {
    expect(leer("app/api/ver-como/route.ts")).toContain("{ ...real.teamMember, email: real.email }");
    expect(leer("lib/auth/supabase.ts")).toContain("{ ...real.teamMember, email: real.email }");
    expect(leer("app/api/ver-como/route.ts"), "la ruta no lee un correo del cuerpo").not.toMatch(/body\??\.email/);
  });
  it("los GET que escriben no lo hacen mirando como otra persona (el middleware solo corta POST/PUT/PATCH/DELETE)", () => {
    expect(leer("app/api/feedback/[id]/route.ts"), "abrir un reporte lo dejaría leído a nombre del otro").toMatch(
      /if \(!guard\.user\.verComoDe\) await marcarLeido\(/,
    );
    expect(leer("app/api/auth/callback/route.ts"), "el callback conectaría HubSpot a nombre del otro").toContain(
      "if (ctx.user.verComoDe) return salir(",
    );
    expect(leer("app/api/auth/hubspot/route.ts")).toContain("if (guard.user.verComoDe) return NextResponse.json(");
  });
  it("la lista vive en un solo lugar", () => {
    const src = leer("lib/auth/ver-como.ts");
    expect(src.match(/egonzalez@smarteamcr\.com/g)?.length).toBe(1);
  });
});
