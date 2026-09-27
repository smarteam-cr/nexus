import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EXPLICACION_DEL_PASO, ESTADOS_DE_ALTA, siguientePaso } from "./alta";

/**
 * lib/projects/alta-cartel.test.ts — EL CARTEL del alta trabada: que aparezca donde se ve
 * siempre, que su texto salga de un solo lugar, y que su botón no pueda duplicar un proyecto
 * en el CRM.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un alta a medio hacer deja el proyecto en cuarentena: se ve y se abre, pero no cobra, no
 * suma a la cartera y no se le publica nada al cliente. Sin cartel eso es indistinguible de
 * un bug — y el modo de fallar no es que alguien se queje, es que NADIE se queje: el proyecto
 * simplemente no aparece en cobranza y se descubre al cerrar el mes.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const CARTEL = "components/projects/AltaTrabada.tsx";
const REINTENTO = "app/api/projects/[projectId]/alta/retry/route.ts";
/**
 * Dónde tiene que aparecer, y por qué ahí.
 *
 * ⚠ Eran DOS —el rail y el widget— y el 2026-09-27 pasó a ser UNO. No fue una limpieza: el
 * widget se mudó adentro de la pestaña «Resumen» del proyecto, así que su copia dejó de verse
 * en los otros nueve documentos y quedó como un segundo cartel idéntico a treinta centímetros
 * del primero. Dos avisos iguales en la misma pantalla enseñan a ignorar los dos.
 *
 * El que sobrevive es el del rail POR LA MISMA RAZÓN de siempre: es el único que se ve sin
 * entrar a ningún lado.
 */
const SUPERFICIES: Array<{ archivo: string; porque: string }> = [
  {
    archivo: "app/(shell)/clients/[id]/WorkspaceClient.tsx",
    porque:
      "el rail de la ficha del cliente. Es el que IMPORTA: se ve en cualquier documento del " +
      "proyecto, así que sin él un alta trabada se descubre de casualidad.",
  },
];

describe("el cartel cubre todos los estados en curso", () => {
  it("todo estado que no terminó tiene su explicación escrita", () => {
    /* Si mañana se suma un cuarto estado y nadie le escribe el texto, el cartel se pintaría
       vacío o reventaría con un `undefined.titulo`. Esto lo dice antes. */
    for (const estado of ESTADOS_DE_ALTA) {
      const paso = siguientePaso(estado);
      if (!paso) continue;
      expect(EXPLICACION_DEL_PASO[paso], `el estado «${estado}» no tiene explicación`).toBeTruthy();
      expect(EXPLICACION_DEL_PASO[paso].titulo.length).toBeGreaterThan(0);
      expect(EXPLICACION_DEL_PASO[paso].detalle.length).toBeGreaterThan(0);
    }
  });

  it("el paso que CREA avisa que reintentar no duplica", () => {
    /* Es la única pregunta que frena a alguien antes de apretar el botón. Si el texto no la
       responde, el reflejo es no apretarlo y escribirle a alguien — que es exactamente el
       trabajo manual que este cartel viene a evitar. */
    expect(EXPLICACION_DEL_PASO["crear-en-hubspot"].detalle.toLowerCase()).toContain("duplica");
  });
});

describe("el texto vive en UN solo lugar", () => {
  it("el componente no escribe los títulos a mano", () => {
    /* El riesgo es que alguien copie el bloque a una segunda superficie —ya pasó una vez— y a
       partir de ahí solo se corrija uno. Que el texto venga del módulo puro hace imposible ese
       fork, y por eso la guarda sigue aunque hoy el cartel se monte en un solo lado. */
    const src = leer(CARTEL);
    for (const paso of Object.keys(EXPLICACION_DEL_PASO) as Array<keyof typeof EXPLICACION_DEL_PASO>) {
      expect(
        src.includes(EXPLICACION_DEL_PASO[paso].titulo),
        `${CARTEL} tiene el título de «${paso}» hardcodeado; sale de lib/projects/alta.ts`,
      ).toBe(false);
    }
    expect(src).toContain("EXPLICACION_DEL_PASO");
  });
});

describe("el cartel está donde se ve siempre", () => {
  for (const s of SUPERFICIES) {
    it(`${s.archivo} lo monta`, () => {
      const src = leer(s.archivo);
      expect(src.includes("AltaTrabada"), s.porque).toBe(true);
    });
  }

  it("la consulta que lo alimenta trae el dato que necesita", () => {
    /* Montar el componente no alcanza: si la consulta no trae `altaEstado`, el cartel decide
       "no hay alta" y no se pinta nunca. Es el modo de fallar silencioso de esta pantalla. */
    expect(leer("app/(shell)/clients/[id]/page.tsx")).toContain("altaEstado: true");
  });
});

describe("el botón de reintentar no puede duplicar un proyecto", () => {
  it("el endpoint no acepta NINGÚN dato del cliente", () => {
    /* Todo el trabajo —y toda la seguridad contra duplicar— vive en `avanzarAlta`, que relee
       el estado desde la base. Si el endpoint aceptara un paso o un estado del cuerpo, un
       reintento con el dato equivocado podría crear un segundo record en el CRM: el incidente
       que ya obligó a escribir un script de limpieza. El único parámetro es el id. */
    const src = leer(REINTENTO);
    expect(src, "el endpoint lee el cuerpo de la petición").not.toContain("req.json()");
    expect(src, "el endpoint lee query params").not.toContain("searchParams");
  });

  it("reintentar exige la MISMA celda que dar de alta", () => {
    /* Reintentar es terminar el alta. Un rol que no puede empezarla tampoco debería disparar
       una escritura en el CRM desde un cartel. */
    expect(leer(REINTENTO)).toContain('guardPermission("proyectos", "create")');
  });

  it("reintentar acota al proyecto", () => {
    expect(leer(REINTENTO)).toContain("guardAccessToProject(");
  });

  it("el motor se llama con el id y nada más", () => {
    const src = leer(REINTENTO);
    expect(src).toContain("avanzarAlta(projectId)");
  });
});
