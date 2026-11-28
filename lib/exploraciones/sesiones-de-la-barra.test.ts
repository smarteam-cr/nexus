import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * lib/exploraciones/sesiones-de-la-barra.test.ts — lo que pidió Elías al probar Líneas Hospitalarias (2026-11-28), fijado
 * en el texto de las pantallas de la preventa (son componentes de cliente: la regla pura vive en guia.ts y quien-estuvo.ts).
 */
const raiz = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8").replace(/\r\n/g, "\n");

describe("la preventa después de probarla con Líneas Hospitalarias", () => {
  it("la barra de la izquierda lista las mismas sesiones que el Resumen, también la próxima sin agendar", () => {
    /* La edición que la pone en rojo: volver a `pestanas` (la «Sesión 2 · próxima» salía en el Resumen y no en la barra). */
    expect(leer("components/exploraciones/RielDePiezas.tsx")).toMatch(/const \{ todas: pestanas, activa, estadoDe, estadoDeLaReunion \} = useSesiones\(\)/);
  });

  it("«+ Agregar sesión» ofrece pegar una transcripción, por el cajón de «Agregar una reunión» y la misma puerta de sesiones", () => {
    const s = leer("components/exploraciones/AgregarSesion.tsx");
    expect(s).toMatch(/titulo="Pegar una transcripción"/);
    expect(s).toMatch(/<AgregarReunion[\s\S]*tipoInicial="transcripcion"/);
    expect(s).toMatch(/\/api\/sales\/exploraciones\/\$\{exp\.id\}\/sesiones[\s\S]*tipo: "pasada"/);
  });

  it("«Eliminar sesión» en rojo claro con los tokens de peligro que ya existen; nada dice «Quitar la sesión»", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    expect(s).toMatch(/border-danger-line bg-danger-surface text-danger-ink/);
    expect(s).toMatch(/Eliminar sesión/);
    expect(s).not.toMatch(/>\s*Quitar la sesión\s*</);
    expect(s).not.toMatch(/confirmLabel="Quitar la sesión"/);
  });

  it("la sesión interna se RECOMIENDA con un clic (sacarla de la exploración) y se puede descartar; no cambia sola", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    expect(s).toMatch(/pareceSesionInterna\(quienEstuvo\) && sePuedeSacar/);
    expect(s).toMatch(/Es interna: sacarla de la exploración[\s\S]*No, es de la exploración/);
  });

  it("«Quién estuvo» va en la «i» a la izquierda del estado de la sesión", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    expect(s).toMatch(/<InfoDeQuienEstuvo datos=\{quienEstuvo\} \/>\}\s*<EstadoDeLaSesionChip/);
  });
});
