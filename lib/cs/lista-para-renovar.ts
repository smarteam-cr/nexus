/**
 * lib/cs/lista-para-renovar.ts — «Lista para renovar · N de 6» (pestaña Renovación, rediseño del
 * 2026-10-05). PURO y client-safe.
 *
 * Lo que tiene que estar bien antes de que el cliente decida si renueva, calculado con lo que la
 * ficha ya muestra en las otras pestañas: uso, licencias, resultados, bloqueos, contacto y
 * cancelación. No es un puntaje ni una predicción: cada punto dice qué falta y dónde verlo.
 * Un punto sin dato no cuenta como listo ni como pendiente: se dice que no hay dato.
 */
import { diasEntre, plural } from "./formato";
import { UMBRALES } from "./lectura-partner";
import { licenciasDeLaCuenta, licenciasSinAsignar } from "./adopcion";
import type { CuentaDeCartera } from "./cartera-reglas";
import type { PestanaDeCuenta } from "./pestanas-de-la-cuenta";

/** Sin una conversación con el cliente en este plazo, la renovación llega en frío. */
export const DIAS_DE_CONTACTO_PARA_RENOVAR = 30;

export interface PuntoParaRenovar {
  clave: "uso" | "licencias" | "resultados" | "bloqueos" | "contacto" | "cancelacion";
  /** true = listo · false = falta · null = no hay dato para decirlo. */
  listo: boolean | null;
  texto: string;
  detalle: string;
  /** La pestaña donde se ve el detalle. */
  destino: PestanaDeCuenta | null;
}

export function listaParaRenovar(
  cuenta: CuentaDeCartera,
  resultados: ReadonlyArray<{ confirmado: boolean }>,
  hoy: string,
): { puntos: PuntoParaRenovar[]; listos: number; conDato: number } {
  const p = cuenta.partner;
  const puntos: PuntoParaRenovar[] = [];

  // 1. Uso
  if (!p || p.uso === null) {
    puntos.push({ clave: "uso", listo: null, texto: `Uso de la plataforma sobre ${UMBRALES.usoBajo}`, detalle: "HubSpot todavía no da el puntaje de uso.", destino: "adopcion" });
  } else {
    const bajando = p.tendencia !== null && p.tendencia <= UMBRALES.tendenciaCaida;
    puntos.push({
      clave: "uso",
      listo: p.uso >= UMBRALES.usoBajo,
      texto: `Uso de la plataforma sobre ${UMBRALES.usoBajo}`,
      detalle: `Hoy ${p.uso}${bajando ? " y bajando" : ""}.`,
      destino: "adopcion",
    });
  }

  // 2. Licencias
  const filas = p ? licenciasDeLaCuenta(p) : [];
  if (filas.length === 0) {
    puntos.push({ clave: "licencias", listo: null, texto: "Todas las licencias pagadas asignadas", detalle: "HubSpot no da las licencias de esta cuenta.", destino: "adopcion" });
  } else {
    const libres = licenciasSinAsignar(filas);
    const desglose = filas.filter((f) => f.libres > 0).map((f) => `${f.libres} de ${f.tipo.replace(/ Hub$/, "")}`);
    puntos.push({
      clave: "licencias",
      listo: libres === 0,
      texto: "Todas las licencias pagadas asignadas",
      detalle: libres === 0 ? "Todas asignadas." : `${plural(libres, "sin asignar", "sin asignar")}: ${desglose.join(", ")}.`,
      destino: "adopcion",
    });
  }

  // 3. Resultados
  const confirmados = resultados.filter((r) => r.confirmado).length;
  puntos.push({
    clave: "resultados",
    listo: resultados.length > 0 && confirmados === resultados.length,
    texto: "Resultados del cliente confirmados",
    detalle:
      resultados.length === 0
        ? "Todavía no hay resultados medibles: sin ellos no hay de qué hablar en la reunión de valor."
        : `${confirmados} de ${resultados.length} ${confirmados === 1 ? "confirmado" : "confirmados"}.`,
    destino: "resultados",
  });

  // 4. Bloqueos
  const activos = cuenta.proyectos.filter((x) => x.activo);
  const bloqueados = activos.filter((x) => x.bloqueado);
  puntos.push({
    clave: "bloqueos",
    listo: bloqueados.length === 0,
    texto: "Proyectos sin bloqueo",
    detalle:
      activos.length === 0
        ? "Sin proyectos activos."
        : bloqueados.length === 0
          ? `${plural(activos.length, "proyecto activo", "proyectos activos")}, ninguno bloqueado.`
          : `«${bloqueados[0].nombre}» está bloqueado${bloqueados[0].motivoBloqueo ? `: ${bloqueados[0].motivoBloqueo}` : ""}${bloqueados.length > 1 ? ` (y ${bloqueados.length - 1} más)` : ""}.`,
    destino: "proyectos",
  });

  // 5. Contacto
  const dias = cuenta.ultimoContacto ? diasEntre(cuenta.ultimoContacto, hoy) : null;
  puntos.push({
    clave: "contacto",
    listo: dias !== null && dias <= DIAS_DE_CONTACTO_PARA_RENOVAR,
    texto: `Contacto con el cliente en los últimos ${DIAS_DE_CONTACTO_PARA_RENOVAR} días`,
    detalle: dias === null ? "Sin contacto registrado." : dias <= 0 ? "Último contacto hoy." : `Último contacto hace ${plural(dias, "día", "días")}.`,
    destino: "conversaciones",
  });

  // 6. Cancelación
  if (!p) {
    puntos.push({ clave: "cancelacion", listo: null, texto: "Sin cancelación registrada en HubSpot", detalle: "La cuenta no está vinculada a HubSpot Partner.", destino: null });
  } else {
    puntos.push({
      clave: "cancelacion",
      listo: !p.cancelacion,
      texto: "Sin cancelación registrada en HubSpot",
      detalle: p.cancelacion ? `HubSpot registra una cancelación${p.cancelacion.hubs.length ? ` de ${p.cancelacion.hubs.join(", ")}` : ""}.` : "HubSpot no registra ninguna.",
      destino: null,
    });
  }

  return {
    puntos,
    listos: puntos.filter((x) => x.listo === true).length,
    conDato: puntos.filter((x) => x.listo !== null).length,
  };
}
