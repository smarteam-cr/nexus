/**
 * lib/ui/raw-neutral.mjs — FUENTE ÚNICA del patrón de "gris crudo" (invariante #5).
 *
 * Lo importan DOS guards que no pueden divergir jamás:
 *   - eslint.config.mjs → warn en el editor mientras se escribe.
 *   - lib/ui/token-vocab.test.ts → el ratchet que FRENA el merge.
 * Es .mjs plano (no .ts) para que el config de ESLint lo importe sin toolchain.
 *
 * El patrón es un string (no RegExp) porque el selector de esquery lo interpola
 * dentro de /.../ y el test lo compila con new RegExp(). DOS límites duros de
 * esquery (aprendidos a golpes): re-escapa mal los backslashes, y corta el
 * literal en la PRIMERA `/` aunque esté dentro de un grupo o clase.
 *
 * Excepción sancionada: `bg-black/NN` (scrim que DEBE ser oscuro en ambos modos,
 * ver el mensaje) NO matchea. Como no se puede nombrar la barra, el boundary de
 * bg-black usa la clase [^-a-z.-0]: el rango .-0 cubre 0x2E–0x30, o sea `.`,
 * `/` y `0` — la barra queda excluida sin escribirla. `bg-black` a secas y todo
 * white/black restante sí cuentan (text-white/80 incluido).
 */
export const RAW_NEUTRAL_RE =
  "(?:bg|text|border|ring|divide|from|via|to)-gray-[0-9]|text-(?:white|black)(?:[^-a-z]|$)|bg-white(?:[^-a-z]|$)|bg-black(?:[^-a-z.-0]|$)";

export const RAW_NEUTRAL_MSG =
  "Usá tokens semánticos del tema (bg-surface · bg-surface-muted · bg-surface-hover · border-line · text-fg · text-fg-secondary · text-fg-muted · text-brand). Los grises crudos (bg-gray-*, text-white, etc.) no flipean en modo claro. Scrims que deben ser oscuros en ambos modos: usá bg-black/NN.";
