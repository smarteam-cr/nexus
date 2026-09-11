/**
 * components/documentacion/esquema-editor.ts — QUÉ bloques existen en una página de Documentación.
 *
 * Es el esquema de BlockNote. Los bloques de fábrica salen de `TIPOS_DE_FABRICA`
 * (`lib/documentacion/tipos.ts`), la lista ÚNICA que también usa el servidor para sanear el
 * contenido: si un tipo se agrega o se saca, se hace en un solo lugar.
 *
 * Los de archivo (imagen, video, audio, archivo) no están en esa lista. Se sacan del ESQUEMA —no
 * solo del menú «/»— porque así tampoco entran pegando una imagen: sin un lugar donde subirla
 * quedaría un bloque roto apuntando a nada.
 *
 * Los dos bloques propios:
 *   · «aviso» — el recuadro de color, con los tokens del tema.
 *   · «vivo»  — el que no se escribe: se arma solo desde los registros de Nexus.
 * Los dos specs se crean a nivel de módulo (regla `react-hooks/static-components`).
 *
 * ⚠ Solo lo importa código de CLIENTE (el editor). Los tipos se pueden importar desde cualquier
 * lado con `import type`, que no arrastra BlockNote al servidor.
 */
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { TIPOS_DE_FABRICA } from "@/lib/documentacion/tipos";
import { bloqueAviso } from "./bloques/Aviso";
import { bloqueVivo } from "./bloques/Vivo";

function elegir<T extends object, K extends keyof T>(objeto: T, claves: readonly K[]): Pick<T, K> {
  const salida = {} as Pick<T, K>;
  for (const clave of claves) salida[clave] = objeto[clave];
  return salida;
}

export const esquemaDeDocumentacion = BlockNoteSchema.create({
  blockSpecs: {
    ...elegir(defaultBlockSpecs, TIPOS_DE_FABRICA),
    aviso: bloqueAviso(),
    vivo: bloqueVivo(),
  },
});

/** Un bloque tal como lo devuelve el editor (con id y todas sus props). */
export type BloqueDeDocumentacion = typeof esquemaDeDocumentacion.Block;
/** Un bloque tal como se le puede DAR al editor (props y id opcionales). */
export type BloqueParcialDeDocumentacion = typeof esquemaDeDocumentacion.PartialBlock;
