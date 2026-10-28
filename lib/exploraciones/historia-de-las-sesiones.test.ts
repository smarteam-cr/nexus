/**
 * lib/exploraciones/historia-de-las-sesiones.test.ts — lo que dejó cada sesión, para la guía y su asistente (caso CEMACO,
 * 2026-10-20): todas las sesiones (no las tres últimas), lo ya respondido, los acuerdos, las notas, lo acordado para la
 * próxima y la misma reunión por Meet y por HubSpot una sola vez.
 */
import { describe, expect, it } from "vitest";
import type { LecturaDeReunion } from "./contenido";
import type { SesionPlaneada } from "./guia";
import { acordadoParaLaProxima, historiaDeLasSesiones, textoDeLaProxima, textoDeLasSesiones, TOPES_DE_LA_HISTORIA } from "./historia-de-las-sesiones";

const lectura = (fecha: string, titulo: string, resumen: string, extra: Partial<LecturaDeReunion> = {}): LecturaDeReunion => ({
  etiqueta: `Reunión del ${fecha.slice(0, 10)}: ${titulo}`,
  resumen,
  cobertura: [],
  fecha,
  titulo,
  en: fecha,
  corridaId: "r",
  ...extra,
});

const sesion = (id: string, fecha: string, reunion?: string, extra: Partial<SesionPlaneada> = {}): SesionPlaneada => ({
  id,
  fecha,
  ...(reunion ? { reunion: { id: reunion, origen: "meet" as const } } : {}),
  ...extra,
});

/** Cuatro sesiones de un proyecto, como CEMACO el 20 oct, y la próxima con su objetivo. */
function cemaco() {
  const lecturas: Record<string, LecturaDeReunion> = {
    "meet:m1": lectura("2026-10-06T14:00:00.000Z", "Sales Hub", "Tres marcas sobre un mismo ERP."),
    "meet:m2": lectura("2026-10-08T15:00:00.000Z", "Data Hub", "La cédula es el identificador único."),
    "meet:m3": lectura("2026-10-13T22:00:00.000Z", "Sales Hub", "Entregas a domicilio por correo."),
    "meet:m4": lectura("2026-10-20T02:00:00.000Z", "Inicio de diagnóstico", "Dos personas internas y cinco agencias externas.", {
      cobertura: [
        { para: "obstaculos", pregunta: "¿Quién coordina con las agencias?", respondida: true, detalle: "Noel lo lleva al 100 %" },
        { para: "1.5", pregunta: "¿Cómo aprende un vendedor nuevo?", respondida: false },
      ],
    }),
  };
  const sesiones = [
    sesion("s1", "2026-10-06", "m1"),
    sesion("s2", "2026-10-08", "m2"),
    sesion("s3", "2026-10-13", "m3"),
    sesion("s4", "2026-10-19", "m4"),
    sesion("s5", "2026-10-20", undefined, { objetivo: "Priorizar lo que pidió Marco.", explorar: ["Volumetrías por canal"] }),
  ];
  const acuerdos = {
    "meet:m4": {
      acuerdos: [
        "Natalia será invitada a todas las sesiones de diagnóstico.",
        "La sesión del día siguiente (20-oct) se enfocará en analizar cada canal de marketing y sus volumetrías.",
      ],
      decisiones: ["Priorizar la depuración de la base antes de las campañas."],
      revisada: false,
    },
  };
  return { lecturas, sesiones, acuerdos, notas: { "sesion:s2": "José Pablo manda el Excel el jueves." } };
}

describe("historiaDeLasSesiones", () => {
  it("lleva TODAS las sesiones de la exploración, en orden, con lo respondido, lo que no salió, los acuerdos y las notas", () => {
    const c = cemaco();
    const h = historiaDeLasSesiones({ ...c, automaticas: false, fuera: [], proximaId: "s5" });
    expect(h.sesiones.map((s) => s.titulo)).toEqual(["Sales Hub", "Data Hub", "Sales Hub", "Inicio de diagnóstico"]);
    const texto = textoDeLasSesiones(h);
    expect(texto).toContain("Tres marcas sobre un mismo ERP."); // la primera: antes se caía (solo las tres últimas)
    expect(texto).toContain("Ya respondido: «¿Quién coordina con las agencias?» → Noel lo lleva al 100 %");
    expect(texto).toContain("Se llevó y no salió: «¿Cómo aprende un vendedor nuevo?»");
    expect(texto).toContain("Acuerdo (minuta en borrador): La sesión del día siguiente (20-oct)");
    expect(texto).toContain("Decisión (minuta en borrador): Priorizar la depuración");
    expect(texto).toContain("Lo que anotó quien la llevó: José Pablo manda el Excel el jueves.");
    expect(h.reuniones).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("la próxima: su objetivo, lo que se llevó y lo que la última reunión acordó para ella", () => {
    const c = cemaco();
    const h = historiaDeLasSesiones({ ...c, automaticas: false, fuera: [], proximaId: "s5" });
    expect(h.proxima.objetivo).toBe("Priorizar lo que pidió Marco.");
    expect(h.proxima.acordado?.lineas).toEqual(["La sesión del día siguiente (20-oct) se enfocará en analizar cada canal de marketing y sus volumetrías."]);
    const texto = textoDeLaProxima(h.proxima, { conExplorar: true });
    expect(texto).toMatch(/^Lo que se acordó para ella en «Inicio de diagnóstico»/);
    expect(texto).toContain("Volumetrías por canal");
    expect(textoDeLaProxima(h.proxima, { conExplorar: false })).not.toContain("Volumetrías por canal");
  });

  it("una reunión que no es de una sesión no entra (la exploración son sus sesiones)", () => {
    const c = cemaco();
    const lecturas = { ...c.lecturas, "meet:ajena": lectura("2026-10-15T15:00:00.000Z", "Otra", "No es de la exploración.") };
    const h = historiaDeLasSesiones({ ...c, lecturas, automaticas: false, fuera: [], proximaId: "s5" });
    expect(textoDeLasSesiones(h)).not.toContain("No es de la exploración.");
  });

  it("la misma reunión por Meet y por HubSpot va una vez, sin repetir lo cubierto", () => {
    const cobertura = [{ para: "autoridad", pregunta: "¿Quién da el visto bueno?", respondida: true, detalle: "Miriam" }];
    const lecturas = {
      "hubspot:h1": lectura("2026-10-15T16:00:00.000Z", "Tecnosagot + Smarteam", "Desde HubSpot.", { cobertura }),
      "meet:g1": lectura("2026-10-15T16:30:00.000Z", "Tecnosagot + Smarteam", "Desde Meet.", { cobertura }),
    };
    const h = historiaDeLasSesiones({ lecturas, sesiones: [], automaticas: true, fuera: [], notas: {}, proximaId: null });
    expect(h.sesiones).toHaveLength(1);
    const texto = textoDeLasSesiones(h);
    expect(texto.match(/Ya respondido/g)).toHaveLength(1);
    expect(texto).toContain("Desde HubSpot.");
    expect(texto).toContain("Desde Meet.");
    expect(h.reuniones).toEqual(["g1"]);
  });

  it("con el tope, se van las más viejas, nunca la última", () => {
    const lecturas = Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [`meet:x${i}`, lectura(`2026-09-${String(i + 1).padStart(2, "0")}T15:00:00.000Z`, `Sesión ${i}`, "x".repeat(2_000))]),
    );
    const h = historiaDeLasSesiones({ lecturas, sesiones: [], automaticas: true, fuera: [], notas: {}, proximaId: null });
    expect(h.sesiones.length).toBeLessThanOrEqual(TOPES_DE_LA_HISTORIA.sesiones);
    expect(h.sesiones[h.sesiones.length - 1].titulo).toBe("Sesión 13");
    expect(textoDeLasSesiones(h).length).toBeLessThanOrEqual(TOPES_DE_LA_HISTORIA.total + 500);
  });
});

describe("acordadoParaLaProxima", () => {
  const conAcuerdos = (acuerdos: string[]) => [{ clave: "meet:a", claves: ["meet:a"], fecha: "2026-10-19T20:00:00.000Z", titulo: "Una", equipo: null, texto: "", acuerdos }];
  it("reconoce «la próxima sesión», «mañana» y el día de la próxima; deja lo demás", () => {
    const r = acordadoParaLaProxima(
      conAcuerdos([
        "En la próxima sesión se revisa el pipeline.",
        "Mañana se ven los canales.",
        "El 20 de octubre se presenta el mapa.",
        "Se preparará un demo para la semana del 26 de octubre.",
      ]),
      "2026-10-20",
    );
    expect(r?.lineas).toEqual(["En la próxima sesión se revisa el pipeline.", "Mañana se ven los canales.", "El 20 de octubre se presenta el mapa."]);
  });
  it("sin acuerdos que hablen de la próxima, nada", () => {
    expect(acordadoParaLaProxima(conAcuerdos(["Natalia será invitada."]), "2026-10-20")).toBeNull();
    expect(acordadoParaLaProxima([], "2026-10-20")).toBeNull();
  });
});
