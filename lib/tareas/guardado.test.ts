import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estadoDelGuardado, TEXTO_DEL_GUARDADO } from "./guardado";

describe("estadoDelGuardado", () => {
  const nada = { pendientes: 0, enVuelo: 0, error: false, guardadoAlguna: false };

  it("al abrir dice que se guarda solo", () => {
    expect(estadoDelGuardado(nada)).toBe("listo");
    expect(TEXTO_DEL_GUARDADO.listo).toBe("Los cambios se guardan solos");
  });

  it("mientras escribes: sin guardar; mientras va: guardando; después: guardado", () => {
    expect(estadoDelGuardado({ ...nada, pendientes: 1 })).toBe("sin_guardar");
    expect(estadoDelGuardado({ ...nada, pendientes: 1, enVuelo: 1 })).toBe("guardando");
    expect(estadoDelGuardado({ ...nada, guardadoAlguna: true })).toBe("guardado");
  });

  it("un error se dice hasta que se guarda bien; lo que va en camino gana", () => {
    expect(estadoDelGuardado({ ...nada, error: true, guardadoAlguna: true })).toBe("error");
    expect(estadoDelGuardado({ ...nada, error: true, enVuelo: 1 })).toBe("guardando");
  });
});

describe("el cajón de la tarea dice si guardó", () => {
  const cajon = readFileSync("components/tareas/CajonDeTarea.tsx", "utf8");

  it("muestra el estado del guardado y deja reintentar", () => {
    expect(cajon).toContain("TEXTO_DEL_GUARDADO[estadoGuardado]");
    expect(cajon).toContain("Reintentar");
  });

  it("cerrar el cajón manda lo escrito, y el título y las notas se guardan al dejar de escribir", () => {
    expect(cajon).toMatch(/onClose=\{cerrarCajon\}/);
    expect(cajon).toContain("ESPERA_AL_ESCRIBIR_MS");
    expect(cajon.match(/onBlur=\{guardarTexto\}/g)?.length).toBe(2);
  });

  it("escribe solo por la API de siempre (el escritor único)", () => {
    expect(cajon).not.toMatch(/from "@\/lib\/db\/prisma"/);
    expect(cajon).not.toMatch(/from "@\/lib\/tareas\/mutaciones"/);
  });
});
