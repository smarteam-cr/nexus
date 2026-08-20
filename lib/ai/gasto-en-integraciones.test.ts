/**
 * lib/ai/gasto-en-integraciones.test.ts — EL GASTO NO SE FILTRA POR LA PUERTA DE CONFIGURACIÓN.
 *
 * Correr: `npx vitest run lib/ai/gasto-en-integraciones.test.ts --project unit`.
 *
 * ── LA GUARDA QUE IMPORTA, Y POR QUÉ ES ESTRUCTURAL ──────────────────────────────────────────
 * `/settings/gasto-ia` está gateada a los roles de costos, con el redirect ANTES de la query: «es
 * plata, y se trata como tal». `/integrations` es otra cosa — la abre cualquier consultor interno
 * para conectar HubSpot o subir un logo.
 *
 * Al poner la tarjeta de Claude ahí, el gasto pasa a viajar por una página con un piso de permiso
 * MÁS BAJO. La forma correcta es no consultarlo: quien no tiene el rol recibe `null`, no un número
 * escondido con CSS.
 *
 * ⚠ Y ese es exactamente el modo de falla silencioso: un `{puedeVer && <Numero/>}` se ve idéntico
 * en pantalla y manda el número igual en el payload del server component, donde cualquiera lo lee
 * con el inspector. Se ve bien, y filtra.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

const PAGINA = fs.readFileSync(
  path.join(RAIZ, "app/(shell)/integrations/page.tsx"),
  "utf8",
);
const TARJETA = fs.readFileSync(
  path.join(RAIZ, "app/(shell)/integrations/ClaudeCard.tsx"),
  "utf8",
);
const CARGADOR = fs.readFileSync(
  path.join(RAIZ, "lib/ai/gasto-en-integraciones.ts"),
  "utf8",
);

describe("el gasto solo se consulta si el rol lo permite", () => {
  it("⛔ la consulta cuelga del rol de costos, no de un condicional de render", () => {
    /* La edición que la pone en rojo: `const resumen = await gastoResumidoDeClaude();` a secas,
       dejando el filtro para el JSX. Compila, se ve igual, y manda el número a todo el mundo. */
    expect(PAGINA).toContain("isCostosRole");
    expect(PAGINA).toMatch(/puedeVerGasto\s*\?\s*await gastoResumidoDeClaude\(\)\s*:\s*null/);
  });

  it("⛔ y el cargador NO decide el permiso: lo decide la página, antes de llamarlo", () => {
    /* Si el gate viviera adentro del cargador, el próximo consumidor lo heredaría sin saber que
       existe — y el día que alguien lo llame desde un endpoint sin sesión, el gate no tendría a
       quién preguntarle. El permiso se resuelve donde está la sesión. */
    expect(
      CARGADOR.includes("isCostosRole") || CARGADOR.includes("requireInternalUser"),
      "el cargador se metió a decidir permisos: eso es de la página, donde vive la sesión",
    ).toBe(false);
  });

  it("la tarjeta acepta `null` y lo dice, en vez de pintar un cero", () => {
    /* Un «$0» para quien no tiene permiso afirma algo falso sobre el gasto. Decir que el dato
       existe y quién lo ve es lo honesto. */
    expect(TARJETA).toContain("gasto: GastoDeClaude | null");
    /* Substring corto a propósito: el JSX parte las frases largas en varias líneas, y un assert
       sobre la frase entera se rompe con un reformateo que no cambió nada. */
    expect(TARJETA).toContain("reservado a los roles");
  });
});

describe("el número que se muestra no contradice a la pantalla grande", () => {
  it("⚠ ventanas MÓVILES, nunca «hoy»", () => {
    /* `resumirGasto` corta el día con la fecha de Costa Rica; un `gte` con corte UTC daría otro
       número para el mismo dato. Dos totales que no coinciden y nadie sabe cuál creer es peor que
       un total menos. La edición que la pone en rojo: agregar un bloque «hoy» acá. */
    expect(CARGADOR).toContain("costo30");
    expect(CARGADOR).toContain("costo7");
    expect(
      /costoHoy|llamadasHoy|claveDeHoy/.test(CARGADOR),
      "apareció un total de «hoy»: va a discrepar con /settings/gasto-ia, que corta por hora de CR",
    ).toBe(false);
  });

  it("⚠ y la tarjeta repite la salvedad: el medidor no es contabilidad", () => {
    /* La pantalla original lo dice en su encabezado. Un número suelto en otra pantalla, sin la
       salvedad, se lee como si fuera la factura. */
    expect(TARJETA).toContain("No es contabilidad");
  });

  it("agrega en la BASE y no trae las filas a memoria", () => {
    /* `/integrations` se abre para subir un logo: leer 20.000 filas ahí sería pagar una pantalla
       entera por un titular. La edición que la pone en rojo: cambiar el aggregate por findMany. */
    expect(CARGADOR).toContain("llmCall.aggregate");
    expect(
      CARGADOR.includes("llmCall.findMany"),
      "el cargador pasó a traer filas: eso es lo que hace la pantalla grande, no la tarjeta",
    ).toBe(false);
  });

  it("y si la tabla del medidor no existe, la página no revienta", () => {
    /* Su migración es aditiva y puede llegar después del deploy. Una pantalla de configuración
       que tira 500 por eso deja a alguien sin poder conectar HubSpot. */
    expect(CARGADOR).toContain("catch");
    expect(TARJETA).toContain("medidorListo");
  });
});
