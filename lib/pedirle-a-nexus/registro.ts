/**
 * lib/pedirle-a-nexus/registro.ts — LOS DOCUMENTOS QUE TRABAJAN CON «✨ PEDIRLE A NEXUS», cada uno con su contrato
 * (./contrato.ts; plan maestro de «Hablar con Nexus», punto 4.4). PURO.
 *
 * Sumar un documento = una entrada acá con sus ocho puntos llenos y su implementación en el servidor; `registro.test.ts`
 * falla si falta alguno, si la implementación no tiene sus tres funciones (leer, proponer, aplicar) o si aplicar no pasa por
 * el camino de la edición a mano.
 */

export interface ContratoDeDocumento {
  /** El tipo: lo que dice la herramienta del conector y el `documento` de la corrida. */
  tipo: string;
  nombre: string;
  /** 1. Quién es: de qué es y cómo lo verifica el servidor. */
  quienEs: string;
  /** 2. Qué se lee, en piezas con nombre (la función que las arma). */
  piezas: string;
  /** 3. Qué se puede cambiar. */
  cambiable: string;
  /** 4. Cómo se aplica: el archivo y la función del camino de la edición a mano (nunca uno nuevo). */
  aplica: { archivo: string; funcion: string };
  /** 5. Cómo se guarda la versión y cómo se deshace. */
  versiones: string;
  /** 6. Qué ve el cliente y quién publica. */
  publica: string;
  /** 7. La celda que pide. */
  permiso: string;
  /** 8. Para el agente de impacto: sus piezas principales. */
  paraElImpacto: readonly string[];
  /** La implementación en el servidor: el archivo que exporta leer, proponer y aplicar. */
  servidor: { archivo: string; leer: string; proponer: string; aplicar: string };
  /** El origen del gasto en el medidor (dentro del tope de US$ 100 de Nexus conversando). */
  origenDelGasto: string;
}

export const DOCUMENTOS_CON_NEXUS: readonly ContratoDeDocumento[] = [
  {
    tipo: "escala",
    nombre: "La página del Diagnóstico de rendimiento (el Resumen y la página de cada área)",
    quienEs:
      "Una exploración de la cuenta (preventa, o la de la cuenta): el servidor lee su clientId y lo compara con la cuenta que pide; el área tiene que estar en la página.",
    piezas: "piezasDelResumen y piezasDelArea (lib/exploraciones/escala-con-nexus.ts), desde la misma página que ve el cliente (paginaParaElCse).",
    cambiable:
      "El titular y la bajada, el problema principal, las etiquetas, el alcance, el tamaño, los puntos clave, el recorrido, cada equipo, lo que falta validar; en cada área, la descripción, la tarjeta de cada parte, los títulos, «Por dónde empezar», los casos y los riesgos. Se agrega en cada lista que lo acepta.",
    aplica: { archivo: "lib/exploraciones/servidor.ts", funcion: "aplicarCambios" },
    versiones:
      "El Resumen (con sus textos fijos) y la página de cada área: lo de antes y «Cambiado con Nexus»; «Deshacer» vuelve a la de antes con «Usar esta versión» del historial (choca si alguien cambió el documento después).",
    publica: "Nunca publica: queda «Hay cambios que el cliente no ve» hasta que una persona usa «Publicar».",
    permiso: "La guardia de la exploración para escribir: preventa.write (o la celda de generar la exploración de un proyecto).",
    paraElImpacto: ["El titular", "El problema principal", "Los puntos clave", "El reto principal de cada equipo"],
    servidor: { archivo: "lib/exploraciones/escala-con-nexus-server.ts", leer: "leerLaEscalaParaNexus", proponer: "proponerEnLaEscala", aplicar: "aplicarEnLaEscala" },
    origenDelGasto: "pedirle:escala",
  },
];
