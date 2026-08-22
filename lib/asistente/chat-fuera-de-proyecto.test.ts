/**
 * lib/asistente/chat-fuera-de-proyecto.test.ts — EL CHAT SIRVE A DOCUMENTOS QUE NO SON DE UN PROYECTO.
 *
 * La propuesta comercial y los documentos de Roles usan el MISMO motor de páginas y la misma
 * maquinaria de consenso, pero no cuelgan de un proyecto. Darles chat costó generalizar tres cosas
 * —el dueño del hilo, la base de la API y de dónde salen las defs— y cada una tiene un modo de
 * falla propio que no grita. Esto es lo que impide que se apaguen sin que nadie se entere.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PIEZAS_CON_CHAT, PIEZA_PROPUESTA_COMERCIAL, PIEZA_ROL } from "./piezas";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

/**
 * El archivo SIN comentarios. Mencionar un símbolo para explicar por qué NO se usa es lo correcto;
 * una guarda que no distingue mencionar de usar obliga a borrar justo la explicación que importa.
 */
const soloCodigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

/** Los tres lugares que montan el proveedor del aplicador, uno por dueño de documento. */
const MONTAJES = [
  { archivo: "components/clients/ProjectCanvasPanel.tsx", dueno: "proyecto" },
  { archivo: "components/business-cases/PropuestaConChat.tsx", dueno: "propuesta comercial" },
  { archivo: "components/roles/RolConChat.tsx", dueno: "rol" },
] as const;

describe("el chat fuera de un proyecto", () => {
  it.each(MONTAJES)(
    "⛔⭐ $dueno: el que provee el aplicador NO lo consume",
    ({ archivo, dueno }) => {
      /* Es el bug que estuvo VIVO en producción hasta el 2026-08-22, en el chat de proyectos: un
         contexto solo fluye hacia ABAJO, así que el componente que provee lee de AFUERA de su
         propio proveedor —`null`, siempre— y el botón «Aplicar» no hace nada, sin un error en
         consola. Al sumar dos montajes más, el mismo error volvió a estar a una línea de distancia.

         La edición que la pone en rojo: llamar `useAplicadorDeDocumento()` en el que monta. */
      const src = leer(archivo);
      expect(src, `${dueno}: dejó de montar el proveedor — nadie puede aplicar`).toContain(
        "<AplicadorDeDocumentoProvider>",
      );
      expect(
        src.includes("useAplicadorDeDocumento(") || src.includes("useHayAplicadorDeDocumento("),
        `${dueno}: volvió a consumir el contexto que él mismo provee — va a leer null siempre`,
      ).toBe(false);
      expect(src, `${dueno}: dejó de montar el cajón`).toContain("<ChatDelDocumento");
    },
  );

  it("⭐ el cajón no cablea la ruta de proyectos: la base la arma quien monta", () => {
    /* Mientras `ChatDelAsistente` armaba `/api/projects/${projectId}/asistente` adentro, la única
       forma de servir a otro dueño era clonar el componente entero. La edición que la pone en
       rojo: volver a escribir la ruta adentro del chat. */
    const chat = leer("components/asistente/ChatDelAsistente.tsx");
    const codigo = chat
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*"))
      .join("\n");
    expect(codigo, "el chat volvió a cablear la ruta de proyectos").not.toContain("/api/projects");
    expect(codigo, "el chat dejó de colgar el asistente de la base recibida").toContain(
      "${base}/asistente",
    );

    /* Y las tres bases son distintas: si dos coincidieran, dos documentos compartirían hilo. */
    const bases = [
      leer("components/clients/ProjectCanvasPanel.tsx"),
      leer("components/business-cases/PropuestaConChat.tsx"),
      leer("components/roles/RolConChat.tsx"),
    ].map((src) => /base=\{`([^`]+)`\}/.exec(src)?.[1] ?? null);
    expect(bases, "algún montaje dejó de pasar su base").not.toContain(null);
    expect(new Set(bases).size, "dos documentos comparten la base de la API").toBe(3);
  });

  it("⛔⭐ LA PORTADA DEL ROL NO SE LEE DE `content` — leerla de ahí BORRA datos", () => {
    /* ── EL DAÑO, y por eso ésta es la guarda más cara del archivo ────────────
       El título, el área y el resumen de un rol son COLUMNAS de la fila; el motor los junta al
       pintar la portada. `content` NO los tiene.

       Si el contexto o el ejecutor leyeran `content["hero"]`, el chat vería la portada VACÍA y
       —peor— al cambiar el título escribiría `{title}` solo: el área y el resumen desaparecen.
       Sin error, sin log, sobre el encabezado del documento.

       La edición que la pone en rojo: volver a `contenido["hero"]` en el contexto, o pasarle
       `content` crudo al ejecutor en vez de las secciones tal como se pintan. */
    const ctx = leer("lib/asistente/contexto.ts");
    const tramo = ctx.slice(ctx.lastIndexOf("export async function contextoDeRol"));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(tramo, "el contexto del rol dejó de armar la portada desde las columnas").toContain(
      'key === "hero"',
    );
    expect(tramo).toContain("rol.summary");

    /* Y del lado del ejecutor: recibe lo que se PINTA, no `content`. */
    const ejec = soloCodigo(leer("components/asistente/ejecutar-operaciones-de-rol.ts"));
    expect(ejec, "el ejecutor volvió a indexar content por key").not.toMatch(
      /content\[[^\]]+\]/,
    );
    const ws = leer("components/roles/RoleWorkspace.tsx");
    expect(ws, "el workspace dejó de pasarle al ejecutor las secciones que pinta").toContain(
      "useEjecutarOperacionesDelChatDeRol(sections,",
    );
  });

  it("⭐ las secciones del rol salen del TIPO de documento, no de las del perfil", () => {
    /* `ROLE_SECTIONS` son las del PERFIL. Una propuesta laboral tiene otras keys: con la lista
       del perfil, el chat sobre una propuesta habría visto siete secciones vacías —las del otro
       documento— y habría rechazado cada operación sobre las que sí existen, con el motivo
       «no es una sección de este documento».

       La edición que la pone en rojo: volver a mapear `ROLE_SECTIONS` en `contextoDeRol`. */
    const ctx = leer("lib/asistente/contexto.ts");
    const tramo = soloCodigo(ctx.slice(ctx.lastIndexOf("export async function contextoDeRol")));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(400);
    expect(tramo, "el contexto del rol volvió a las secciones del perfil").not.toContain(
      "ROLE_SECTIONS",
    );
    expect(tramo).toContain("sectionDefsForDocType(rol.docType)");
  });

  it("⛔ en un rol el chat no crea, no borra y no oculta secciones", () => {
    /* La lista de secciones de un rol es FIJA: el motor las arma siempre desde la plantilla del
       tipo, completa. Una `seccion.crear` acá escribiría en un lugar que nadie lee, y el hilo
       diría «aplicado» sobre algo que no existe.

       La edición que la pone en rojo: poner cualquiera de las dos en `true`. */
    const ejec = leer("components/asistente/ejecutar-operaciones-de-rol.ts");
    const i = ejec.lastIndexOf("aplicarOperacionesDeDocumento(");
    expect(i, "el ejecutor dejó de aplicar operaciones").toBeGreaterThan(-1);
    const llamada = ejec.slice(i, i + 300);
    expect(llamada, "el rol dejó de negar ocultar").toContain("puedeOcultar: false");
    expect(llamada, "el rol dejó de negar crear").toContain("puedeCrear: false");
  });

  it("⭐ las dos piezas nuevas pueden conversar", () => {
    /* Sin esto el cajón se abre, el hilo se guarda… y el POST responde que esa pieza no conversa.
       La edición que la pone en rojo: sacarlas de `CONVERSAN_SIN_ASSIST`. */
    expect(PIEZAS_CON_CHAT, "la propuesta comercial se quedó sin chat").toContain(
      PIEZA_PROPUESTA_COMERCIAL,
    );
    expect(PIEZAS_CON_CHAT, "los documentos de Roles se quedaron sin chat").toContain(PIEZA_ROL);
    /* Y los dos slugs son distintos: comparten dueño-flexible pero no documento. */
    expect(PIEZA_PROPUESTA_COMERCIAL).not.toBe(PIEZA_ROL);
  });
});
