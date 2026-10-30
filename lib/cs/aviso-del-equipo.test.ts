import { describe, expect, it } from "vitest";
import { alertaConLaCita, comoAvisoDelEquipo, razonDeAviso, tituloDeAviso } from "./aviso-del-equipo";
import { esPorCita, llaveDelVigia } from "./alertas-reglas";
import { CATEGORIAS_QUE_PINTAN } from "./cita-de-alerta";

describe("el aviso del equipo", () => {
  it("el título de kölbi deja de decir «Cliente:» y dice «Aviso del equipo:»", () => {
    expect(tituloDeAviso("Cliente: equipo ventas sin rutina ni acompañamiento — aprenden solos")).toBe(
      "Aviso del equipo: Equipo ventas sin rutina ni acompañamiento — aprenden solos",
    );
    expect(tituloDeAviso("Queja del cliente: los paneles no reflejan los datos de Meta")).toBe(
      "Aviso del equipo: Los paneles no reflejan los datos de Meta",
    );
    expect(tituloDeAviso("Desorden en las campañas")).toBe("Aviso del equipo: Desorden en las campañas");
  });

  it("el título no pasa del tope", () => {
    expect(tituloDeAviso(`Queja: ${"x".repeat(300)}`).length).toBeLessThanOrEqual(140);
  });

  it("el porqué dice quién lo levantó", () => {
    expect(razonDeAviso("no hay una rutina", "Valentina Sandoval")).toBe(
      "Lo levantó Valentina Sandoval, de Smarteam, en la reunión: es un aviso del equipo, no una queja del cliente. Dijo: «no hay una rutina»",
    );
    expect(razonDeAviso("x", null)).toMatch(/^Lo levantó Alguien de Smarteam/);
  });

  it("cambia la categoría y conserva el resto; un aviso no pinta el color", () => {
    const a = comoAvisoDelEquipo({ category: "QUEJA", title: "Cliente: algo", reason: "El cliente se quejó.", severity: "HIGH", evidence: { cita: 1 } }, "Valentina Sandoval", "algo");
    expect(a).toMatchObject({ category: "AVISO_DEL_EQUIPO", severity: "HIGH", evidence: { cita: 1 } });
    expect(a.reason).not.toContain("El cliente se quejó");
    expect(CATEGORIAS_QUE_PINTAN.has(a.category)).toBe(false);
  });
});

describe("la alerta del vigía después de buscar su frase", () => {
  const queja = { category: "QUEJA", title: "Cliente: sin rutina", reason: "Lo dijo.", suggestedAction: null as string | null, evidence: { sessionIds: ["s1"] } };
  const verificada = { texto: "no hay una rutina", fuente: "reunion", id: "s1" };
  const lista = (o: Partial<Parameters<typeof alertaConLaCita>[1]>) =>
    alertaConLaCita(queja, { evidencia: { sessionIds: ["s1"] }, textoPedido: "no hay una rutina", verificada: null, avisoDe: null, ...o });

  it("⭐ la frase de alguien del equipo: aviso, con la frase verificada y quién la dijo", () => {
    const a = lista({ verificada, avisoDe: "Valentina Sandoval" });
    expect(a.category).toBe("AVISO_DEL_EQUIPO");
    expect(a.evidence).toMatchObject({ cita: { verificada: true, dichaPor: "Valentina Sandoval", id: "s1" } });
  });

  it("la frase del cliente: sigue siendo queja, verificada", () => {
    const a = lista({ verificada });
    expect(a.category).toBe("QUEJA");
    expect(a.evidence).toMatchObject({ cita: { verificada: true } });
  });

  it("la frase que no aparece: sin verificar, aunque haya hablante", () => {
    const a = lista({ avisoDe: "Valentina Sandoval" });
    expect(a.category).toBe("QUEJA");
    expect(a.evidence).toMatchObject({ citaSinVerificar: "no hay una rutina" });
  });

  it("dos avisos distintos no se pisan: uno por frase, como la queja", () => {
    expect(esPorCita("AVISO_DEL_EQUIPO")).toBe(true);
    expect(llaveDelVigia("c1", "AVISO_DEL_EQUIPO", "h1")).not.toBe(llaveDelVigia("c1", "AVISO_DEL_EQUIPO", "h2"));
  });
});
