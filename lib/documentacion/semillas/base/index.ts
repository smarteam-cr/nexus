/**
 * lib/documentacion/semillas/base/index.ts — la base entera, en el orden del árbol.
 *
 *   🏠 Inicio
 *   🏛️ La empresa              propósito, misión y valores · historia
 *   🏢 Departamentos           Customer Success · Ventas · Finanzas · Desarrollo · Marketing · RevOps
 *   🧩 Servicios               casos de éxito
 *   🧰 Recursos y herramientas Escala de rendimiento · ¿Cómo funciona Nexus? · herramientas · marca
 *   🗓️ Cómo trabajamos         ¿Cómo trabajar en Smarteam? · horario y condiciones
 *   👥 El equipo
 *
 * La siembra (`scripts/seed-documentacion.ts`) y las pruebas (`paginas.test.ts`) leen ESTA lista:
 * una página que se agrega acá queda sembrada y revisada a la vez.
 *
 * ⚠ Las páginas que ya existían en la raíz (el manual, la Escala, «¿Cómo trabajar?») pasan a vivir
 * dentro de su sección. La siembra las MUEVE: si una persona las editó, conservan su contenido y su
 * versión (ver `semillas/accion.ts`).
 */
import type { PaginaSembrada } from "../bloques";
import { construirComoTrabajamos } from "./como-trabajamos";
import { construirDepartamentos } from "./departamentos";
import { construirElEquipo } from "./el-equipo";
import { construirInicio } from "./inicio";
import { construirLaEmpresa } from "./la-empresa";
import { construirRecursos } from "./recursos";
import { construirServicios } from "./servicios";

export function construirDocumentacion(): PaginaSembrada[] {
  return [
    construirInicio(),
    construirLaEmpresa(),
    construirDepartamentos(),
    construirServicios(),
    construirRecursos(),
    construirComoTrabajamos(),
    construirElEquipo(),
  ];
}
