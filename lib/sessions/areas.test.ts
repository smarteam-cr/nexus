/**
 * lib/sessions/areas.test.ts — quién cae en cada frente.
 *
 * Los valores del fixture NO son inventados: son los del roster real (`TeamMember.area`),
 * incluidas sus mayúsculas. `isDevMember` normaliza y `isCseMember` compara exacto, así que
 * un test con valores "prolijos" pasaría sin probar nada.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * El frente "Desarrollo" del widget mostraba sesiones donde no hubo ningún dev. La sospecha
 * inicial fue que los tres del equipo (Alejandro Salas, Alejandro Rodríguez, Breiner Salas)
 * estaban mal clasificados; el dato dijo que no —los tres tienen `area: "Development"`— y el
 * problema era que el frente miraba a `deliveryEmails`, que es la UNIÓN con CSE. De ahí sale
 * `devEmails`, y de ahí que este test fije las dos cosas por separado.
 */
import { describe, expect, it } from "vitest";
import { classifyTeamEmailsByArea, isCseMember, isDevMember, isSalesMember } from "./areas";

/** Recorte del roster real (2026-07-30), con los valores de `area` tal cual están en la base. */
const ROSTER = [
  { email: "ASalas@smarteamcr.com", area: "Development", roleEnum: "DEV" },
  { email: "arodriguez@smarteamcr.com", area: "Development", roleEnum: "DEV" },
  { email: "bsalas@smarteamcr.com", area: "Development", roleEnum: "DEV" },
  { email: "hgomez@smarteamcr.com", area: "CSE", roleEnum: "CSE" },
  { email: "jescudero@smarteamcr.com", area: "CSE", roleEnum: "CSE" },
  { email: "losorio@smarteamcr.com", area: "CSE", roleEnum: "CSL" },
  { email: "apinzon@smarteamcr.com", area: "Ventas", roleEnum: "VENTAS" },
  // Marco Salas: SUPER_ADMIN de rol, Ventas de área. El área manda para el análisis.
  { email: "msalas@smarteamcr.com", area: "Ventas", roleEnum: "SUPER_ADMIN" },
  { email: "egonzalez@smarteamcr.com", area: "RevOps", roleEnum: "SUPER_ADMIN" },
  { email: "lflores@smarteamcr.com", area: "Marketing", roleEnum: "MARKETING" },
  // Caso real: área de Development pero rol CSE (alguien que se movió de equipo).
  { email: "jarauz@smarteamcr.com", area: "Development", roleEnum: "CSE" },
];

const sets = classifyTeamEmailsByArea(ROSTER);

describe("los tres del equipo de desarrollo entran a devEmails", () => {
  it("con el valor de `area` que tienen de verdad", () => {
    for (const email of ["asalas@smarteamcr.com", "arodriguez@smarteamcr.com", "bsalas@smarteamcr.com"]) {
      expect(sets.devEmails.has(email), `${email} quedó fuera de devEmails`).toBe(true);
    }
  });

  it("los emails se guardan SIEMPRE en minúscula", () => {
    // El roster real tiene "ASalas@…" con mayúscula; `participants` de las sesiones no.
    expect(sets.devEmails.has("asalas@smarteamcr.com")).toBe(true);
    expect(sets.devEmails.has("ASalas@smarteamcr.com")).toBe(false);
  });

  it("`isDevMember` normaliza el área (mayúsculas y espacios)", () => {
    for (const area of ["Development", "development", " DESARROLLO ", "Dev", "developer"]) {
      expect(isDevMember({ email: "x@y.com", area }), `"${area}"`).toBe(true);
    }
    expect(isDevMember({ email: "x@y.com", area: "CSE" })).toBe(false);
  });
});

describe("devEmails NO es deliveryEmails", () => {
  it("un CSE está en entrega pero NO en desarrollo", () => {
    expect(sets.deliveryEmails.has("hgomez@smarteamcr.com")).toBe(true);
    expect(sets.devEmails.has("hgomez@smarteamcr.com")).toBe(false);
  });

  it("desarrollo es un subconjunto ESTRICTO de entrega", () => {
    /* Si algún día dejaran de serlo, el frente de una implementación perdería las sesiones
       técnicas — que es el fix que `deliveryEmails` vino a hacer. */
    for (const e of sets.devEmails) expect(sets.deliveryEmails.has(e)).toBe(true);
    expect(sets.devEmails.size).toBeLessThan(sets.deliveryEmails.size);
  });

  it("entrega = CSE ∪ Desarrollo, ni uno más", () => {
    const union = new Set([...sets.cseEmails, ...sets.devEmails]);
    expect([...sets.deliveryEmails].sort()).toEqual([...union].sort());
  });
});

describe("los otros frentes no se movieron", () => {
  it("Ventas mira el ÁREA, no el rol", () => {
    // Marco Salas es SUPER_ADMIN y tiene que seguir contando como Ventas.
    expect(sets.salesEmails.has("msalas@smarteamcr.com")).toBe(true);
    expect(isSalesMember({ email: "x@y.com", area: "Sales" })).toBe(true); // el seed viejo
  });

  it("un área que no es de ningún frente no cae en ninguno", () => {
    for (const email of ["egonzalez@smarteamcr.com", "lflores@smarteamcr.com"]) {
      expect(sets.salesEmails.has(email)).toBe(false);
      expect(sets.deliveryEmails.has(email)).toBe(false);
      // …pero SÍ son internos: es lo que distingue "equipo" de "cliente".
      expect(sets.internalEmails.has(email)).toBe(true);
    }
  });

  it("área Development + rol CSE cae en los dos, y se respeta", () => {
    expect(sets.devEmails.has("jarauz@smarteamcr.com")).toBe(true);
    expect(sets.cseEmails.has("jarauz@smarteamcr.com")).toBe(true);
    expect(isCseMember({ email: "jarauz@smarteamcr.com", area: "Development", roleEnum: "CSE" })).toBe(true);
  });

  it("internalEmails los trae a TODOS", () => {
    expect(sets.internalEmails.size).toBe(ROSTER.length);
  });
});
