/**
 * lib/timeline/apertura-del-chat.test.ts — EL CHAT SE ABRE SOLO CON UNA PROPUESTA NUEVA, UNA VEZ (E3 P5).
 *
 * Correr: `npx vitest run lib/timeline/apertura-del-chat.test.ts --project unit`.
 *
 * La tabla completa de `debeAbrirseElChat`, y lo que recuerda el navegador. Una vez por persona y por
 * propuesta (D14): la marca del servidor gana aunque el navegador no recuerde nada.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  claveDeLaApertura,
  debeAbrirseElChat,
  leerApertura,
  recordarApertura,
  type AlmacenDeLaApertura,
  type EntradaDeLaApertura,
} from "./apertura-del-chat";

const BASE: EntradaDeLaApertura = {
  puedeEditar: true,
  puedeConversar: true,
  hayBorrador: true,
  token: "run-4",
  conCambios: true,
  nadaQueDecidir: false,
  tareasArmando: false,
  recalculando: false,
  ocupado: false,
  conOtraCapa: false,
  chatAbierto: false,
  anchoSuficiente: true,
  abiertoEnElServidor: false,
  recordadoLocal: false,
};
const con = (cambio: Partial<EntradaDeLaApertura>) => debeAbrirseElChat({ ...BASE, ...cambio });

describe("⭐ cuándo se abre solo", () => {
  it("con una propuesta nueva, en una pantalla ancha y sin nada encima: se abre", () => {
    expect(con({})).toBe("abrir");
  });

  it("⛔ sin permiso, sin propuesta guardada, o sin nada que decidir: nada", () => {
    /* La edición que la pone en rojo: abrirlo a quien no puede editar o no puede conversar (la ruta del chat
       le respondería 403), o sobre una propuesta que se descarta sola. Se retiró «Pedir cambio con IA» (E4): ya no
       hay vista previa del modificador, y su fila (`deAssist`) salió con ella. */
    for (const c of [
      { puedeEditar: false },
      { puedeConversar: false },
      { hayBorrador: false },
      { token: null },
      { conCambios: false },
      { nadaQueDecidir: true },
    ]) {
      expect(con(c), JSON.stringify(c)).toBe("nada");
    }
  });

  it("⭐ ya se abrió para esta persona (en cualquier computadora): nada, aunque el navegador no lo recuerde", () => {
    /* La edición que la pone en rojo: mirar solo `localStorage` (Elías lo vería abrirse en sus dos PCs). */
    expect(con({ abiertoEnElServidor: true })).toBe("nada");
    expect(con({ abiertoEnElServidor: true, recordadoLocal: false, chatAbierto: false })).toBe("nada");
  });

  it("este navegador lo recuerda pero el servidor no: se vuelve a marcar, sin abrir", () => {
    expect(con({ recordadoLocal: true })).toBe("solo-marcar");
  });

  it("⛔ mientras la IA arma o recalcula, con el cronograma ocupado o con otra capa encima: se espera", () => {
    /* La edición que la pone en rojo: abrirlo encima del detalle de una tarea o de un diálogo, o mientras la
       propuesta todavía no se puede editar. */
    for (const c of [{ tareasArmando: true }, { recalculando: true }, { ocupado: true }, { conOtraCapa: true }]) {
      expect(con(c), JSON.stringify(c)).toBe("nada");
    }
  });

  it("ya abierto a mano: solo se marca; en una pantalla angosta: nada (se abre después, en una ancha)", () => {
    expect(con({ chatAbierto: true })).toBe("solo-marcar");
    expect(con({ anchoSuficiente: false })).toBe("nada");
  });
});

describe("lo que recuerda el navegador", () => {
  const almacen = (): AlmacenDeLaApertura & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it("una entrada por proyecto, con el token de la propuesta", () => {
    const a = almacen();
    expect(leerApertura("p1", "run-4", a)).toBe(false);
    recordarApertura("p1", "run-4", a);
    expect(a.m.get(claveDeLaApertura("p1"))).toBe("run-4");
    expect(leerApertura("p1", "run-4", a)).toBe(true);
    expect(leerApertura("p1", "run-5", a), "otra propuesta hereda la marca de la anterior").toBe(false);
  });

  it("⛔ sin almacén, o si el navegador no deja leer ni escribir, no tira", () => {
    const roto: AlmacenDeLaApertura = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(leerApertura("p1", "run-4", roto)).toBe(false);
    expect(() => recordarApertura("p1", "run-4", roto)).not.toThrow();
    expect(leerApertura("p1", "run-4", null)).toBe(false);
  });
});
