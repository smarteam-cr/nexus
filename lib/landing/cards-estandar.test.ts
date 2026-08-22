/**
 * lib/landing/cards-estandar.test.ts — LAS TARJETAS DEL MOTOR SON UNA SOLA.
 *
 * Elías, 2026-08-22: «a veces las cards de kickoff son diferentes a las del canvas de exploración;
 * me interesa que a nivel de motor eso esté estandarizado».
 *
 * Medido antes de tocar: el CSS ya era el mismo. Lo duplicado era el JSX —el mismo markup escrito
 * en dos archivos— y una diferencia real: los dolores pisaban el token del ícono con un ámbar en
 * línea. Ahora hay un componente y la excepción se declara desde afuera.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import { CATALOGO_DE_SECCIONES, TARJETAS_TYPE } from "@/lib/landing/catalogo-de-secciones";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

/** Los archivos que pintan una grilla de tarjetas del motor. */
const CONSUMIDORES = [
  "components/landing/sections.tsx",
  "components/canvas/kickoff-sections/KickoffSections.tsx",
  "components/landing/sections-tarjetas.tsx",
];

describe("un solo markup de tarjeta", () => {
  it.each(CONSUMIDORES)("⭐ %s delega en CardGrid en vez de repetir el markup", (archivo) => {
    /* La edición que la pone en rojo: volver a escribir el `<div className="stl-item stl-card">`
       con sus dos Editable adentro. Se ve idéntico y vuelve a divergir con el tiempo — que es
       exactamente lo que pasó entre el kickoff y los dolores. */
    const src = leer(archivo);
    expect(src, `${archivo} dejó de usar la grilla compartida`).toContain("<CardGrid");
    expect(
      src.includes('className="stl-item stl-card"'),
      `${archivo} volvió a escribir el markup de la tarjeta a mano`,
    ).toBe(false);
  });

  it("⛔ y el componente compartido NO quema el color del ícono", () => {
    /* El ámbar de los dolores existe y se queda —no le cambiamos la cara a lo publicado— pero
       ahora es una prop de quien lo quiere, no un estilo dentro del markup común pisando el token
       del motor. La edición que la pone en rojo: mover el ámbar adentro de `CardGrid`. */
    const grid = leer("components/landing/card-grid.tsx");
    expect(grid, "el acento volvió a estar quemado en el componente compartido").not.toContain(
      "#D97706",
    );
    expect(grid, "el ícono dejó de usar el token del motor").toContain('className="stl-card-icon"');

    const dolores = leer("components/landing/sections.tsx");
    expect(dolores, "los dolores perdieron su ámbar: cambia la cara de lo ya publicado").toContain(
      "#D97706",
    );
  });

  it("⚠ cada grilla conserva su forma: 4 columnas los dolores, 2 el kickoff", () => {
    /* No es cosmético: cuatro por fila es para un vistazo y dos para lectura pausada. Unificar
       esto TAMBIÉN habría sido cambiarle la cara a documentos ya entregados. */
    const dolores = leer("components/landing/sections.tsx");
    const i = dolores.lastIndexOf("<CardGrid");
    expect(dolores.slice(i, i + 400)).toContain("columnas={4}");

    const kickoff = leer("components/canvas/kickoff-sections/KickoffSections.tsx");
    const j = kickoff.indexOf("<CardGrid");
    expect(kickoff.slice(j, j + 400)).toContain("columnas={2}");
  });
});

describe("el tipo creable con ícono", () => {
  it("⭐ está en el catálogo y comparte el esquema de «Texto con tarjetas»", () => {
    /* Comparten esquema a propósito: migrar de con-ícono a sin-ícono no debería costar reescribir
       el contenido. La edición que la pone en rojo: darle un esquema propio. */
    const conIcono = CATALOGO_DE_SECCIONES.find((t) => t.sectionType === TARJETAS_TYPE);
    const prosa = CATALOGO_DE_SECCIONES.find((t) => t.tipo === "prosa");
    expect(conIcono, "el tipo con ícono desapareció del catálogo").toBeDefined();
    expect(conIcono?.schema).toEqual(prosa?.schema);
    expect(conIcono?.nombre).toContain("ícono");
  });
});
