import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alContarLoQuePaso, marcaAlContar, opcionesDeLasPestanas, pestanaDeLaReunion, pestanasDeSesiones, type ReunionDeLaExploracion } from "./guia";

describe("alContarLoQuePaso — lo que cuentas en «¿Qué pasó?» queda en la sesión correcta (segunda vuelta)", () => {
  const zoom: ReunionDeLaExploracion = { id: "gmeet_zoom", titulo: "Zoom", fecha: "2026-11-27T20:00:00.000Z", origen: "meet", leida: false, texto: "nada" };
  const otra: ReunionDeLaExploracion = { id: "gmeet_otra", titulo: "Otra", fecha: "2026-11-27T22:00:00.000Z", origen: "meet", leida: false, texto: "nada" };
  const dosDelDia = pestanasDeSesiones(
    [
      { id: "s2", fecha: "2026-11-27", reunion: { id: "gmeet_zoom", origen: "meet" } },
      { id: "s3", fecha: "2026-11-27", reunion: { id: "gmeet_otra", origen: "meet" } },
    ],
    [zoom, otra],
    "2026-11-28",
  );
  const s2 = dosDelDia.find((p) => p.clave === "s2")!;

  it("si es la reunión de esta sesión, se relee; si es una nueva, se une", () => {
    expect(alContarLoQuePaso({ pestana: s2, sessionId: "gmeet_zoom", pestanas: dosDelDia })).toEqual({ accion: "releer" });
    expect(alContarLoQuePaso({ pestana: s2, sessionId: "manual_nueva", pestanas: dosDelDia })).toEqual({ accion: "unir", volverSesion: false });
  });

  it("la reunión que ya es de la sesión 3 no se une a la 2 (quedarían dos sesiones con la misma reunión)", () => {
    /* La edición que la pone en rojo: unir sin mirar las otras pestañas (la revisión del 28 nov lo encontró). */
    expect(alContarLoQuePaso({ pestana: s2, sessionId: "gmeet_otra", pestanas: dosDelDia })).toEqual({ accion: "deOtraSesion", clave: "s3" });
  });

  it("una reunión que entró sola (sin sesión guardada) se vuelve sesión antes de unirle otra", () => {
    const sola = pestanasDeSesiones([], [zoom], "2026-11-28", opcionesDeLasPestanas(true, []));
    expect(alContarLoQuePaso({ pestana: sola[0], sessionId: "manual_nueva", pestanas: sola })).toEqual({ accion: "unir", volverSesion: true });
  });

  it("contar lo que pasó quita «No se hizo» y «Por otro canal»; «Se cortó» se queda", () => {
    expect(marcaAlContar("noSeHizo")).toBeUndefined();
    expect(marcaAlContar("otroCanal")).toBeUndefined();
    expect(marcaAlContar("cortada")).toBe("cortada");
    expect(marcaAlContar(undefined)).toBeUndefined();
  });
});

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

  it("la sesión interna va en «Equipo del cliente»: opción del selector y badge azul que abren «Sacar de la exploración» (segunda vuelta)", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    const e = leer("components/exploraciones/EquipoDeLaSesion.tsx");
    // La sugiere la regla de «Quién estuvo», solo donde se puede sacar, y elegirla abre el diálogo (nada cambia solo).
    expect(s).toMatch(/const interna: SesionInterna \| null = sePuedeSacar[\s\S]{0,200}pareceSesionInterna\(quienEstuvo\)[\s\S]{0,400}alElegir: \(\) => setSacando\(true\)/);
    expect(s).toMatch(/<EquipoDeLaSesion pestana=\{pestana\} momento=\{momento\} interna=\{interna\} \/>/);
    expect(e).toMatch(/key: "interna"[\s\S]{0,600}Sesión interna[\s\S]{0,600}onSelect: interna\.alElegir/);
    expect(e).toMatch(/¿Es una <span className="font-semibold text-fg">sesión interna<\/span>\?/);
    // El aviso amarillo se fue: el mensaje sale una sola vez.
    expect(s).not.toMatch(/Parece una sesión interna:/);
    expect(s).not.toMatch(/Es interna: sacarla de la exploración/);
  });

  it("cualquier sesión se elimina, «Cambiar reunión» va al lado y «Copiar enlace» ya no está (segunda vuelta)", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    expect(s).toMatch(/\{sePuedeCambiarReunion && \([\s\S]{0,400}Cambiar reunión[\s\S]{0,200}<\/Button>\s*\)\}\s*\{sePuedeQuitar && \(/);
    expect(s).not.toMatch(/Copiar enlace\s*</);
    expect(s).not.toMatch(/enlace\("cambiar reunión"/);
  });

  it("«¿Qué pasó con esta sesión?» abre el MISMO cajón que «Pegar una transcripción», y todo va a la reunión (A1 y B)", () => {
    const d = leer("components/exploraciones/DespuesDeLaSesion.tsx");
    expect(d).toMatch(/titulo="Se hizo: cuéntale a Nexus qué pasó"/);
    expect(d).toMatch(/<AgregarReunion[\s\S]{0,600}onAgregada=\{\(sessionId\) => void alContar\(sessionId\)\}/);
    // La otra reunión se une a ESTA sesión por la puerta de «Cambiar reunión», decidido por la regla pura.
    expect(d).toMatch(/alContarLoQuePaso\(\{ pestana, sessionId, pestanas: todas \}\)/);
    expect(d).toMatch(/tipo: "pasada", sessionId, paraSesionId: sesionId/);
    // Ni la tarjeta de «otro canal» ni el panel del documento de la exploración.
    expect(d).not.toMatch(/titulo: "Se hizo por otro canal"/);
    expect(d).not.toMatch(/<SumarAMano/);
  });

  it("«Quién estuvo» va en la «i» a la izquierda del estado de la sesión", () => {
    const s = leer("components/exploraciones/SesionesDeExploracion.tsx");
    expect(s).toMatch(/<InfoDeQuienEstuvo datos=\{quienEstuvo\} \/>\}\s*<EstadoDeLaSesionChip/);
  });
});
