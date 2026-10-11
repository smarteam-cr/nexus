/**
 * lib/cs/pase-de-cuenta.ts — lo que recibe el CSE nuevo cuando le pasan una cuenta (2026-10-09, entrega 5 de
 * docs/exito-del-cliente-cartera-plan.md). PURO.
 *
 * Con el pase, al CSE nuevo le llega en «Para ti» un resumen de la cuenta: el color y su porqué, lo esencial de la
 * memoria interna (la ficha confirmada, las personas, los compromisos abiertos y los pedidos fuera de alcance abiertos;
 * memoria de la cuenta, etapa 3), el tipo de relación, el momento, la renovación, las alertas abiertas, el último
 * contacto, si está en espera del cliente, la relación con HubSpot y los proyectos activos. Todo sale de las mismas
 * reglas que Éxito del cliente.
 *
 * ⚠ El detalle de un aviso se corta a 280 caracteres (lib/para-ti/avisos.ts › `textoDeAviso`): por eso lo esencial va
 * en UNA línea de conteos y nombres, DESPUÉS del color, la relación, la renovación y las alertas (que tienen que entrar
 * siempre), y el detalle de cada cosa queda en la ficha del cliente. Que el CSE nuevo reciba el contenido entero (qué
 * dice la ficha, cuáles son los compromisos y los pedidos) espera una decisión de Elías: un aviso no da el lugar.
 */
import { clasificarCuenta, nombreDelValor } from "./clasificacion";
import { NOMBRE_DE_LA_SALUD, proximaRenovacion, saludDeLaCuenta, type CuentaDeCartera } from "./cartera-reglas";
import { relacionConHubspot } from "./relacion-gestionada";
import { diasEntre, fmtDia, plural } from "./formato";

/**
 * Una sección de lo esencial de la memoria interna (la forma de `loEsencialDeLaCuenta`, lib/memoria). Se declara acá,
 * sin importar lib/memoria: este archivo es puro, y quien llama al cargador es la ruta del pase.
 */
export interface SeccionEsencialDelPase {
  clave: "ficha" | "personas" | "compromisos" | "pedidos";
  lineas: readonly string[];
}

/** El nombre de una persona de la ficha («Ana — directora — sponsor» → «Ana»). */
function nombreDeLaPersona(linea: string): string {
  return linea.split(/\s+[—–-]\s+/)[0]?.trim() ?? "";
}

/** Lo esencial en UNA línea: cuántos datos confirmados, quiénes son, cuántos compromisos y pedidos abiertos. null sin nada. */
export function lineaDeLoEsencial(secciones: readonly SeccionEsencialDelPase[]): string | null {
  const de = (clave: SeccionEsencialDelPase["clave"]) => secciones.find((s) => s.clave === clave)?.lineas ?? [];
  const ficha = de("ficha");
  const personas = de("personas").map(nombreDeLaPersona).filter(Boolean);
  const compromisos = de("compromisos");
  const pedidos = de("pedidos");
  const partes = [
    ficha.length ? plural(ficha.length, "dato confirmado de la ficha", "datos confirmados de la ficha") : null,
    personas.length
      ? `personas: ${personas.slice(0, 3).join(", ")}${personas.length > 3 ? ` y ${personas.length - 3} más` : ""}`
      : null,
    compromisos.length ? plural(compromisos.length, "compromiso abierto", "compromisos abiertos") : null,
    pedidos.length ? plural(pedidos.length, "pedido fuera de alcance abierto", "pedidos fuera de alcance abiertos") : null,
  ].filter(Boolean);
  return partes.length ? `Lo que ya se sabe: ${partes.join(" · ")}.` : null;
}

/** El resumen, en líneas cortas (el detalle de un aviso). `esencial`: lo esencial de la memoria interna. */
export function resumenDelPase(c: CuentaDeCartera, hoy: string, esencial: readonly SeccionEsencialDelPase[] = []): string {
  const salud = saludDeLaCuenta(c, hoy);
  const cl = clasificarCuenta(c, hoy);
  const renueva = proximaRenovacion(c, hoy);
  const relacion = relacionConHubspot(c.partner, hoy);
  const activos = c.proyectos.filter((p) => p.activo);
  const lineas = [
    `${NOMBRE_DE_LA_SALUD[salud.salud]}: ${salud.porque}`,
    `${nombreDelValor("relacion", cl.relacion.vigente)} · momento: ${(nombreDelValor("momento", cl.momento.vigente) ?? "").toLowerCase()}`,
    renueva ? `Renueva el ${fmtDia(renueva, hoy)}.` : null,
    c.alertas.length > 0 ? `${plural(c.alertas.length, "alerta abierta", "alertas abiertas")} en Éxito del cliente.` : null,
    // Después de la renovación y las alertas: con lo esencial antes, esas dos líneas quedaban fuera de los 280.
    lineaDeLoEsencial(esencial),
    c.ultimoContacto ? `Último contacto con el cliente: hace ${plural(diasEntre(c.ultimoContacto, hoy), "día", "días")}.` : "Sin contacto registrado con el cliente.",
    c.ajustes?.espera ? `En espera del cliente: ${c.ajustes.espera.nota}` : null,
    relacion.estado !== "sin-partner" ? `HubSpot: ${relacion.corto.toLowerCase()}.` : null,
    activos.length > 0 ? `Proyectos activos: ${activos.map((p) => `«${p.nombre}»`).join(", ")}.` : null,
  ];
  return lineas.filter(Boolean).join("\n");
}
