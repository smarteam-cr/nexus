/**
 * lib/canvas/rotulos-del-motor.test.ts — EL RÓTULO SALE DE LA DEFINICIÓN, NO DEL RENDERER.
 *
 * ── QUÉ CIERRA ───────────────────────────────────────────────────────────────────────────────
 * Tres secciones tenían su título y su rótulo declarados en la definición **y escritos a mano
 * adentro del componente**. Dos copias del mismo texto son dos que pueden divergir, y acá la
 * divergencia tiene una forma concreta y silenciosa: renombrar «Procesos» desde el chat decía
 * «aplicado» y en pantalla no cambiaba nada — el título viajaba hasta el componente y se
 * descartaba. Es el peor modo de falla del vocabulario: el que no avisa.
 *
 * ⚠ Los literales SIGUEN en el código, pero como RESPALDO de la prop. Por eso las guardas de acá
 * no buscan el texto: buscan que el texto esté del lado derecho de un `||` cuya izquierda es la
 * prop. Una guarda que solo prohibiera el literal se satisface borrándolo, y borrarlo dejaría sin
 * título a una def sintetizada desde un snapshot viejo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toSectionDef } from "@/components/landing/configs/templates";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { KICKOFF_SECTION_COMPONENTS } from "@/components/landing/configs/kickoff";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const KICKOFF = "components/canvas/kickoff-sections/KickoffSections.tsx";
const GANTT = "components/canvas/TimelineSection.tsx";
const CRONO = "components/canvas/cronograma-sections/CronogramaSections.tsx";

describe("el encabezado que el motor pasa se PINTA", () => {
  it("Procesos usa el título y el rótulo del motor, con el literal solo de respaldo", () => {
    const src = leer(KICKOFF);
    expect(src).toContain('{sectionEyebrow?.trim() || "Cómo trabajamos"}');
    expect(src).toContain('{sectionTitle?.trim() || "Nuestros procesos"}');
  });

  it("el Gantt los recibe del motor y no los inventa dos niveles más adentro", () => {
    /* El wrapper del kickoff los baja; `TimelineSection` los pinta. Si el wrapper deja de pasarlos,
       el Gantt vuelve a su literal y renombrar la sección se apaga sin ningún error. */
    expect(leer(KICKOFF)).toContain("titulo={sectionTitle}");
    expect(leer(KICKOFF)).toContain("rotulo={sectionEyebrow}");
    const g = leer(GANTT);
    expect(g).toContain('{rotulo?.trim() || "Hoja de ruta"}');
    expect(g).toContain('titulo?.trim() || "Cronograma del proyecto"');
  });

  it("la última palabra del título va en itálica, se llame como se llame", () => {
    /* Estaba partida a mano (`Cronograma del <span>proyecto</span>`), así que un título renombrado
       perdía el tratamiento. Se calcula, para que el lenguaje visual sobreviva al renombrado. */
    const g = leer(GANTT);
    expect(g).toContain("const ultima = palabras.pop()");
    expect(g).not.toContain("Cronograma del <span");
  });

  it("las dos columnas del comparativo salen de `rotulosDeListas`, la misma fuente que el chat", () => {
    /* La definición ya los declaraba para que la línea del acuerdo dijera «a la lista «Hoy»». El
       renderer escribía las mismas dos palabras: si una cambiara, la cajita prometería una columna
       y la página mostraría otra. */
    expect(KICKOFF_DEF_BY_KEY.hoy_vs_sistema?.rotulosDeListas).toEqual({ hoy: "Hoy", conSistema: "Con el sistema" });
    const src = leer(KICKOFF);
    expect(src).toContain('rotulo("hoy", "Hoy")');
    expect(src).toContain('rotulo("conSistema", "Con el sistema")');
    expect(src).toContain("sectionRotulosDeListas?.[k]?.trim() || porDefecto");
    expect(leer("components/landing/LandingView.tsx")).toContain("sectionRotulosDeListas={def.rotulosDeListas}");
  });

  it("los rótulos de las 3 métricas dejan de estar escritos a mano en los DOS renderers", () => {
    for (const f of [KICKOFF, CRONO]) {
      const src = leer(f);
      expect(src, `${f} sigue con el rótulo escrito a mano`).not.toContain('label="Duración total"');
      expect(src, `${f} sigue con el rótulo escrito a mano`).not.toContain('label="Hoja de ruta"');
      expect(src).toContain('t(lang, "duracionTotal")');
      expect(src).toContain('t(lang, "hojaDeRuta")');
    }
  });
});

describe("⭐ `leeElEncabezado` — declarar un hecho en vez de inferirlo", () => {
  /**
   * Qué archivo pinta cada sección que declara la marca. La marca dice «este componente SÍ pinta
   * lo que el motor le pasa»; declararla sobre uno que no lo pinta devuelve exactamente el modo de
   * falla que vino a cerrar. Una entrada nueva acá es la forma de decir dónde verificarlo.
   */
  const RENDERER_DE: Record<string, string> = {
    cronograma: KICKOFF,
    procesos: KICKOFF,
  };

  const conMarca = Object.values(KICKOFF_DEF_BY_KEY).filter((d) => d.leeElEncabezado);

  it("las que la declaran son exactamente las que pintan el encabezado", () => {
    expect(conMarca.length).toBeGreaterThan(0);
    for (const d of conMarca) {
      const archivo = RENDERER_DE[d.key];
      expect(
        archivo,
        `«${d.key}» declara leeElEncabezado y nadie dijo qué archivo lo pinta: agregalo a RENDERER_DE y verificá que lo lea`,
      ).toBeTruthy();
      const src = leer(archivo);
      expect(src, `${archivo} no lee sectionTitle`).toContain("sectionTitle");
      expect(src, `${archivo} no lee sectionEyebrow`).toContain("sectionEyebrow");
    }
  });

  it("⚠ la marca sobrevive a `toSectionDef` — la trampa por CUARTA vez", () => {
    /* `chatLabel`, `schemaDelChat` y `rotulosDeListas` ya se declararon en la def y murieron en
       este traductor, con su guarda en verde porque probaba la def CRUDA. Ésta prueba la
       TRADUCIDA, que es la que llega a la pantalla. */
    const traducida = toSectionDef(KICKOFF_DEF_BY_KEY.procesos, KICKOFF_SECTION_COMPONENTS);
    expect(traducida?.leeElEncabezado).toBe(true);
  });

  it("⛔ `selfTitled` deja de decidir si el rótulo se ve, en los DOS armadores", () => {
    /* La pregunta correcta es «¿escribir el rótulo se va a VER?», y `selfTitled` contesta otra.
       Si los dos armadores no calculan lo mismo, el chat acuerda algo que el editor rechaza. */
    for (const f of ["lib/asistente/contexto.ts", "components/asistente/ejecutar-operaciones.ts"]) {
      expect(leer(f), `${f} sigue infiriendo por selfTitled`).toContain(
        "rotulable: !def?.selfTitled || !!def?.leeElEncabezado,",
      );
    }
  });
});

describe("⭐ el chrome de cada sección va a la IZQUIERDA (Elías, 2026-08-23)", () => {
  const css = leer("app/landing-engine.css");
  const regla = (sel: string) => {
    const i = css.indexOf(sel);
    return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  };

  it("la regla base ancla a la izquierda, e invierte el orden", () => {
    /* ⚠ El `row-reverse` no es cosmético: el orden del DOM crece hacia la izquierda desde el borde
       derecho, así que sin invertir el ⠿ —lo que más se agarra— queda pegado al contenido y el
       badge naranja empuja todo hacia el centro. */
    const base = regla(".stl .stl-overlay {");
    expect(base.length, "la guarda no está mirando nada").toBeGreaterThan(60);
    expect(base).toContain("left: 16px");
    expect(base).toContain("right: auto");
    expect(base).toContain("row-reverse");
  });

  it("⛔ pero sobre una sección COLAPSADA vuelve a la derecha", () => {
    /* Con `padding: 14px` el overlay se superpone con la barra, que arranca con «▸ Título». A la
       izquierda taparía el caret y el título — el ÚNICO asidero para volver a mostrar una sección
       oculta. La edición que la pone en rojo: borrar esta regla «porque es redundante». */
    const exc = regla(".stl .stl-collapsed > .stl-overlay {");
    expect(exc, "el chrome colapsado taparía el asidero para volver a mostrar la sección").toContain(
      "right: 16px",
    );
    expect(exc).toContain("left: auto");
  });

  it("⛔ el layout tiene UN dueño: la hoja, no un estilo inline", () => {
    /* Un `display:flex` inline le gana a la hoja, y ahí el `row-reverse` se queda sin con qué
       componerse — el chrome volvería a la derecha sin que nada falle. */
    const lv = leer("components/landing/LandingView.tsx");
    const i = lv.indexOf('className="stl-overlay"');
    expect(i).toBeGreaterThan(0);
    expect(lv.slice(i, i + 120), "volvió un estilo inline al overlay").not.toContain("display:");
  });
});
