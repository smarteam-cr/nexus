/**
 * lib/documentacion/semillas/base/el-equipo.ts — la sección «El equipo».
 *
 * El directorio NO se escribe: es el bloque vivo `equipo`, que se arma al abrir la página con las
 * personas activas de Nexus, por área. Así no se queda viejo cuando alguien entra o sale — que es
 * exactamente lo que le pasa a un directorio escrito a mano.
 */
import { aviso, bloqueVivo, divisor, parrafoRico, titulo, type PaginaSembrada } from "../bloques";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";

export function construirElEquipo(): PaginaSembrada {
  return {
    ...pagina("equipo"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "quiénes somos, por área. La lista sale de Nexus: cuando alguien entra o sale del equipo, se actualiza sola.",
      ),

      titulo(2, "Quién lidera qué"),
      parrafoRico("Cada departamento, con quien lo lidera y qué hace: ", a("departamentos"), "."),

      titulo(2, "Todo el equipo"),
      bloqueVivo("equipo"),

      titulo(2, "Los roles"),
      parrafoRico("Los roles de Customer Success, completos: ", deCs("rolCse"), " · ", deCs("rolCsl"), "."),
      parrafoRico("Qué puede ver y hacer cada rol dentro de Nexus: ", deCs("nexus"), "."),

      divisor(),
      parrafoRico([
        "La foto, el área y el rol de cada persona se cambian en Nexus → Equipo, y eso lo hace la dirección.",
        { italica: true },
      ]),
    ],
  };
}
