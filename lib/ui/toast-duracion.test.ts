/**
 * lib/ui/toast-duracion.test.ts — ningún toast puede quedarse para siempre.
 *
 * El caso real que originó esta tabla (2026-08-14): los avisos de «agente terminado» traen una
 * acción («Ver»), y la regla de entonces era «con acción → sticky». Resultado: se apilaban seis
 * en pantalla, tapando la app, y había que cerrarlos de a uno. Un aviso que da trabajo dejó de
 * ser un aviso.
 *
 * La lección que fija este archivo: **más tiempo no es tiempo infinito**. Lo que garantiza que
 * el usuario alcance a apretar la acción es la PAUSA AL PASAR EL MOUSE (en el componente), no
 * la eternidad.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  duracionDeToast,
  DURACION_BASE,
  DURACION_MAXIMA,
  FACTOR_CON_ACCION,
  MAX_VISIBLES,
  type ToastType,
} from "./toast-duracion";

const TIPOS: ToastType[] = ["success", "error", "info"];
const RAIZ = path.resolve(__dirname, "..", "..");

describe("⛔ ningún toast es eterno", () => {
  it("toda combinación posible da un número finito y positivo", () => {
    /* La matriz completa: 3 tipos × {sin acción, con acción} × {sin duration, 0, negativo,
       enorme}. Si alguna devolviera 0 o Infinity, ese toast se queda en pantalla hasta que
       alguien lo cierre a mano — que es exactamente el bug que esto cierra. */
    const duraciones = [undefined, 0, -1, 999_999_999];
    for (const type of TIPOS) {
      for (const conAccion of [false, true]) {
        for (const duration of duraciones) {
          const ms = duracionDeToast(type, { duration, conAccion });
          expect(Number.isFinite(ms), `${type}/${conAccion}/${duration} no es finito`).toBe(true);
          expect(ms, `${type}/${conAccion}/${duration} no es positivo`).toBeGreaterThan(0);
          expect(ms, `${type}/${conAccion}/${duration} supera el techo`).toBeLessThanOrEqual(
            DURACION_MAXIMA,
          );
        }
      }
    }
  });

  it("`duration: 0` es el MÁXIMO, no «para siempre»", () => {
    // Lo usan la alerta CS de severidad alta y el error de scope de HubSpot: quieren
    // insistencia, no permanencia.
    for (const type of TIPOS) expect(duracionDeToast(type, { duration: 0 })).toBe(DURACION_MAXIMA);
  });
});

describe("una acción da más tiempo", () => {
  it("con acción dura exactamente el doble que sin acción", () => {
    for (const type of TIPOS) {
      const solo = duracionDeToast(type, { conAccion: false });
      const conAccion = duracionDeToast(type, { conAccion: true });
      expect(solo).toBe(DURACION_BASE[type]);
      expect(conAccion).toBe(DURACION_BASE[type] * FACTOR_CON_ACCION);
    }
  });

  it("un error se lee más despacio que un «Listo»", () => {
    /* Congela el ORDEN, no los números: ajustar los ms es libre, invertir la jerarquía no.
       Un aviso de éxito confirma algo que el usuario acaba de hacer —ya sabe qué pasó—; un
       error tiene que dar tiempo a leer qué falló. */
    expect(DURACION_BASE.error).toBeGreaterThan(DURACION_BASE.info);
    expect(DURACION_BASE.info).toBeGreaterThan(DURACION_BASE.success);
  });

  it("lo que pide quien lo emite se respeta, pero nunca por encima del techo", () => {
    expect(duracionDeToast("success", { duration: 3000 })).toBe(3000);
    expect(duracionDeToast("success", { duration: DURACION_MAXIMA * 10 })).toBe(DURACION_MAXIMA);
  });
});

describe("el componente hace cumplir la tabla", () => {
  const src = fs.readFileSync(path.join(RAIZ, "components", "ui", "Toast.tsx"), "utf8");

  it("calcula la duración con el helper y no con una tabla propia", () => {
    /* Sin esto la plomería falla del peor modo: el helper existe, los tests pasan, y el
       componente sigue con sus constantes viejas. Ya pasó en este repo con otros registros. */
    expect(src).toContain("duracionDeToast(type, {");
    expect(src, "volvió una tabla de duraciones dentro del componente").not.toMatch(
      /DEFAULT_DURATION\s*[:=]/,
    );
  });

  it("el reloj se pausa al pasar el mouse y al enfocar con el teclado", () => {
    /* Es lo que reemplaza al sticky. Si alguien lo saca «porque complica», las duraciones
       cortas pasan a hacer que un aviso se escape justo cuando estirás la mano — y el reflejo
       siguiente sería volver a hacerlos eternos. */
    for (const gancho of ["onMouseEnter", "onMouseLeave", "onFocus", "onBlur"]) {
      expect(src, `falta ${gancho}: sin pausa, acortar los tiempos se vuelve hostil`).toContain(
        `${gancho}={() =>`,
      );
    }
    expect(src).toContain("pausar(t.id)");
    expect(src).toContain("reanudar(t.id)");
  });

  it("la pila tiene tope y descarta por el más viejo", () => {
    expect(src).toContain("MAX_VISIBLES");
    expect(MAX_VISIBLES).toBeGreaterThan(0);
    expect(MAX_VISIBLES, "más de 4 apilados tapan la pantalla — era el síntoma original").toBeLessThanOrEqual(4);
  });
});
