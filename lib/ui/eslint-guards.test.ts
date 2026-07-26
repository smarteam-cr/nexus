/**
 * lib/ui/eslint-guards.test.ts — META-TEST: el guard del guard.
 *
 * El bug que motivó esto fue SILENCIOSO durante semanas: dos config objects de flat
 * config definían `no-restricted-syntax` (tokens y slabs) y el segundo REEMPLAZABA al
 * primero en todos los .tsx solapados — el guard de tokens quedó muerto sin que nada
 * lo dijera, y entraron ~2.4k grises crudos. En flat config la misma clave de regla NO
 * se fusiona: el último gana.
 *
 * Este test resuelve la config REAL que ESLint aplica a archivos concretos y afirma
 * que cada familia de selectores rige donde debe. Si alguien vuelve a agregar un guard
 * con la misma clave (o desalinea los `ignores` con EXENTOS_TOKENS), esto lo caza el
 * mismo día, no semanas después.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/* UNA sola instancia para los tres tests. Antes cada uno construía la suya, y como resolver la
   flat config entera cuesta ~5 s en frío, el primero se pasaba del timeout por defecto (5 s)
   cada vez que el archivo corría junto a los otros 78 — o sea que la suite completa quedaba en
   rojo permanente aunque el guard estuviera bien. Un test que siempre falla deja de avisar de
   nada: tapa las fallas de verdad. Con la instancia compartida el costo se paga una vez. */
const eslint = new ESLint({ cwd: process.cwd() });

async function selectoresPara(archivo: string): Promise<string> {
  const config = (await eslint.calculateConfigForFile(archivo)) as {
    rules?: Record<string, unknown>;
  };
  return JSON.stringify(config.rules?.["no-restricted-syntax"] ?? []);
}

// El arranque en frío de ESLint no cabe en el timeout por defecto cuando la máquina está cargada.
describe("meta-test: las dos familias de no-restricted-syntax no se pisan", { timeout: 30_000 }, () => {
  it("un .tsx interno tiene AMBAS familias (tokens + anti-slab)", async () => {
    const selectores = await selectoresPara("components/ui/Button.tsx");
    expect(selectores, "familia de tokens ausente — ¿otro guard pisó la clave?").toMatch(/-gray-/);
    expect(selectores, "familia anti-slab ausente — ¿otro guard pisó la clave?").toMatch(
      /skeleton-shimmer/,
    );
  });

  it("un exento de tokens (app/page.tsx) conserva SOLO el anti-slab", async () => {
    const selectores = await selectoresPara("app/page.tsx");
    expect(selectores, "el login está exento de tokens (hex a propósito)").not.toMatch(/-gray-/);
    expect(selectores, "el anti-slab debe seguir rigiendo en los exentos de tokens").toMatch(
      /skeleton-shimmer/,
    );
  });

  it("las superficies .stl (landing/external/print) no tienen ninguna familia", async () => {
    const selectores = await selectoresPara("components/landing/LandingView.tsx");
    expect(selectores).not.toMatch(/-gray-/);
    expect(selectores).not.toMatch(/skeleton-shimmer/);
  });
});
