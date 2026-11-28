import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opcionesDeLasPestanas, pestanaDeLaReunion, pestanasDeSesiones, type ReunionDeLaExploracion } from "./guia";

describe("pestanaDeLaReunion — pegar una transcripción no duplica la sesión", () => {
  const zoom: ReunionDeLaExploracion = { id: "gmeet_zoom", titulo: "Propuesta CRM", fecha: "2026-11-27T20:00:00.000Z", origen: "meet", leida: false, texto: "nada", fueraDeMeet: "Fue por Zoom" };
  const sync: ReunionDeLaExploracion = { id: "gmeet_sync", titulo: "Sync", fecha: "2026-11-11T20:30:00.000Z", origen: "meet", leida: false, texto: "transcripcion" };

  it("la reunión de una sesión elegida, ligada por la fecha o que entró sola es de su pestaña", () => {
    /* La edición que la pone en rojo: buscar solo en `sesiones[].reunion` (la ligada por la fecha y la automática no están ahí). */
    const elegida = pestanasDeSesiones([{ id: "s2", fecha: "2026-11-27", reunion: { id: "gmeet_zoom", origen: "meet" } }], [zoom], "2026-11-28");
    expect(pestanaDeLaReunion(elegida, "gmeet_zoom")).toBe("s2");
    const porFecha = pestanasDeSesiones([{ id: "s2", fecha: "2026-11-27" }], [zoom], "2026-11-28");
    expect(pestanaDeLaReunion(porFecha, "gmeet_zoom")).toBe("s2");
    const sola = pestanasDeSesiones([], [sync], "2026-11-28", opcionesDeLasPestanas(true, []));
    expect(pestanaDeLaReunion(sola, "gmeet_sync")).toBe("r-meet-gmeet_sync");
  });

  it("una reunión nueva (la que crea el cajón) no es de ninguna: se agrega como sesión", () => {
    const p = pestanasDeSesiones([{ id: "s2", fecha: "2026-11-27", reunion: { id: "gmeet_zoom", origen: "meet" } }], [zoom], "2026-11-28");
    expect(pestanaDeLaReunion(p, "manual_nueva")).toBeNull();
  });
});

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
    expect(s).toMatch(/variant="destructive-soft"[\s\S]{0,300}Eliminar sesión/);
    expect(leer("components/ui/button-variants.ts")).toMatch(/"destructive-soft": "bg-danger-surface text-danger-ink border border-danger-line/);
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
