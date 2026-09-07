/**
 * lib/ui/achicar-imagen.test.ts — la foto se achica ANTES de salir del navegador.
 *
 * ── EL CASO REAL QUE LO ORIGINÓ (2026-09-07) ─────────────────────────────────
 * «No se puede subir la foto de Caroline Bersot», mensaje «No se pudo subir la foto». Lo medido:
 * el bucket estaba sano, la credencial del servidor también (`/api/health?storage=1` → true), y
 * aun así el archivo NUNCA llegaba a Supabase. El camino tiene TRES topes y solo dos viven en este
 * repo: el handler (1 MB), el bucket (4 MB) y el `client_max_body_size` del nginx del VPS, que por
 * defecto es 1 MB y está fuera del repositorio. Cuando el que corta es el proxy, la respuesta es un
 * HTML de error: el cliente no encuentra `error` en el JSON y cae a su mensaje genérico. Por eso el
 * texto no decía nada útil.
 *
 * Achicar en el navegador es la única solución que no depende de configurar algo fuera del repo, y
 * de paso hace que ninguna página del cliente cargue una foto de 4 MB para pintarla a 44 px.
 *
 * ⚠ Los tests de este proyecto corren en `node`, sin DOM: acá se fija el CONTRATO que se puede
 * probar sin canvas (los cortes y el fail-open) más un escaneo de que los dos uploaders lo usen.
 * El reescalado en sí se verifica en pantalla, subiendo una foto.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { achicarImagen, LADO_MAXIMO_FOTO } from "./achicar-imagen";

/** `File` mínimo: en node no hay DOM, pero sí `File` (undici) desde Node 20. */
const archivo = (nombre: string, tipo: string, bytes: number): File =>
  new File([new Uint8Array(bytes)], nombre, { type: tipo });

describe("achicarImagen: qué NO toca", () => {
  it("sin DOM devuelve el original — nunca rompe por correr donde no hay canvas", async () => {
    /* Este test corre en `node`, así que `document` no existe: es exactamente el caso. La función
       tiene que degradar, no lanzar. La edición que lo pone en rojo: sacar el guard de `document`. */
    const f = archivo("foto.jpg", "image/jpeg", 4 * 1024 * 1024);
    const r = await achicarImagen(f);
    expect(r.archivo, "devolvió otra cosa que el original").toBe(f);
    expect(r.seAchico).toBe(false);
    expect(r.motivo).toBe("sin-dom");
  });

  it("el lado máximo alcanza para las dos superficies donde se pinta una foto", () => {
    /* 44 px el avatar de /team, 140 px el kickoff que abre el cliente. 512 cubre las dos en
       pantallas retina con margen. Si alguien lo baja de 280 deja de alcanzar para el kickoff. */
    expect(LADO_MAXIMO_FOTO).toBeGreaterThanOrEqual(280);
  });
});

describe("⛔ los dos uploaders achican antes de mandar", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const soloCodigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("LA guarda: ninguno mete el `file` crudo en el FormData", async () => {
    /* La edición que lo pone en rojo: volver a `fd.append("file", file)`. No rompe tipos ni build —
       solo hace que una foto de teléfono vuelva a chocar contra un tope que no se ve, con un mensaje
       que no dice nada. Es justo el fallo del 2026-09-07. */
    for (const rel of ["components/team/TeamManager.tsx", "components/ui/LogoUploader.tsx"]) {
      const src = soloCodigo(leer(rel));
      expect(src, `${rel} no achica antes de subir`).toContain("await achicarImagen(file)");
      expect(src, `${rel} manda el archivo crudo`).toContain('fd.append("file", archivo)');
      expect(
        /fd\.append\(\s*"file"\s*,\s*file\s*\)/.test(src),
        `${rel} volvió a mandar el archivo original sin achicar`,
      ).toBe(false);
    }
  });
});
