"use client";

/**
 * PanelDelAgente — el agente de la exploración: prepararla, leer las reuniones y la historia de lo
 * que leyó.
 *
 * El agente corre en segundo plano y PROPONE: cuando termina, lo propuesto aparece en el lugar de
 * cada casilla para usarlo o descartarlo. Si el vendedor sale y vuelve, la pantalla retoma la
 * corrida que sigue viva (la consulta al abrir). Las reuniones de Meet las lee solo cuando llega la
 * transcripción; las que quedan sin leer se avisan acá y en «Qué sigue».
 *
 * Compacto (pedido de Elías, 2026-10-01): los botones y UNA línea con la última lectura; la historia,
 * el test, la agenda y los correos sin permiso quedan plegados en «Lo que leyó».
 */
import { Alert, Button } from "@/components/ui";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import type { CorridaDelAgente } from "@/lib/exploraciones/contenido";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

/** Qué casillas alimentó una corrida, en palabras: «Metas», «Retos» y el nivel de 3 dimensiones. */
function queAlimento(claves: readonly string[]): string {
  const partes: string[] = [];
  const casillas = claves.filter((c) => c.startsWith("casilla:")).map((c) => `«${definicionDe(c.slice(8) as ClaveDeCasilla).etiqueta}»`);
  partes.push(...new Set(casillas));
  const contar = (prefijo: string) => claves.filter((c) => c.startsWith(prefijo)).length;
  const niveles = contar("nivel:");
  if (niveles) partes.push(niveles === 1 ? "el nivel de una dimensión" : `el nivel de ${niveles} dimensiones`);
  if (contar("falta:")) partes.push("lo que pide Funcional");
  if (contar("aExplorar:")) partes.push("las dimensiones a explorar");
  if (contar("area:")) partes.push("las áreas en juego");
  if (claves.includes("edicion") || claves.includes("perfil")) partes.push("la escala y el perfil");
  if (contar("casoDeUso:")) partes.push("los casos de uso");
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Qué hizo una corrida, en pocas palabras. */
function queHizo(c: CorridaDelAgente): string {
  if (c.modo === "preparar") return "Preparó";
  if (c.modo === "casos") return "Propuso casos de uso";
  if (c.modo === "guia") return "Armó la guía de la próxima reunión";
  return c.automatica ? "Leyó sola la reunión que llegó" : "Leyó lo nuevo";
}

function Historia({ corridas }: { corridas: CorridaDelAgente[] }) {
  if (corridas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-fg-secondary">Las últimas lecturas</p>
      <ul className="space-y-2">
        {corridas.slice(0, 5).map((c) => {
          const alimento = queAlimento(c.alimento);
          return (
            <li key={c.id} className="text-xs text-fg-muted">
              <p className="text-fg-secondary">
                {diaYHora(c.en)} · {queHizo(c)}
                {c.modo !== "guia" && (
                  <>
                    {" · "}
                    {c.propuestos === 0 ? "nada nuevo que proponer" : `${c.propuestos} ${c.propuestos === 1 ? "propuesta" : "propuestas"}`}
                    {alimento ? ` en ${alimento}` : ""}
                  </>
                )}
              </p>
              {c.leyo.length > 0 && (
                <details>
                  <summary className="cursor-pointer select-none">
                    {c.leyo.length} {c.leyo.length === 1 ? "fuente" : "fuentes"}
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {c.leyo.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * `compacto`: sin «Lo que leyó» (en «La escala», donde lo que importa es que el mapa esté al día);
 * el detalle vive en «Exploración».
 */
export default function PanelDelAgente({ modoPrincipal = "preparar", compacto = false }: { modoPrincipal?: "preparar" | "leer"; compacto?: boolean }) {
  const { exp, puedeEditar, sinLeer } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();

  const corridas = [...exp.estado.propuesta.corridas].reverse();
  const yaPreparo = corridas.some((c) => c.modo === "preparar");
  // Con una reunión sin leer, leerla es lo primero, en cualquier paso.
  const leerPrimero = modoPrincipal === "leer" || sinLeer.length > 0;
  const ultima = corridas[0];

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">El agente</h3>
          <p className="text-xs text-fg-muted">
            {ultima
              ? `Última lectura: ${diaYHora(ultima.en)} · ${queHizo(ultima)}${ultima.modo === "guia" ? "" : ` · ${ultima.propuestos === 0 ? "nada nuevo que proponer" : `${ultima.propuestos} ${ultima.propuestos === 1 ? "propuesta" : "propuestas"}`}`}`
              : "Lee HubSpot, el test y las reuniones de Meet, y propone; tú usas o descartas."}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {leerPrimero ? (
              <>
                <Button size="sm" variant="primary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("leer")}>
                  Leer la última reunión
                </Button>
                <Button size="sm" variant="secondary" disabled={corriendo || lanzando} onClick={() => void lanzar("preparar")}>
                  Volver a preparar
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("preparar")}>
                  {yaPreparo ? "Volver a preparar" : "Preparar con el agente"}
                </Button>
                <Button size="sm" variant="secondary" disabled={corriendo || lanzando} onClick={() => void lanzar("leer")}>
                  Leer la última reunión
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {corriendo && (
        <p className="text-xs text-fg-secondary" role="status">
          {corrida?.etiqueta ?? "El agente está trabajando"}: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && <Alert variant="danger">{corrida.error}</Alert>}

      {sinLeer.length > 0 && !corriendo && (
        <Alert variant="warning" title={sinLeer.length === 1 ? "Hay una reunión sin leer" : `Hay ${sinLeer.length} reuniones sin leer`}>
          <ul className="space-y-0.5">
            {sinLeer.slice(0, 4).map((r) => (
              <li key={`${r.origen}-${r.id}`}>
                «{r.titulo}», {diaCorto(r.fecha)}
                {r.origen === "hubspot" ? " (agendada en HubSpot: se lee lo que dejó el notetaker)" : ""}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {!compacto && <HistorialDelAgente />}
    </section>
  );
}

/**
 * Lo que leyó el agente: sus últimas corridas con sus fuentes, el test de marketing, las reuniones
 * agendadas y los correos que no pudo leer. Va plegado al final de Exploración (pedido de Elías,
 * 2026-10-02: era lo primero que se veía y no es lo primero que se necesita).
 */
export function HistorialDelAgente() {
  const { exp, escala } = useLienzo();
  const corridas = [...exp.estado.propuesta.corridas].reverse();
  const leido = exp.leido;
  const agenda = leido.agenda;
  const nombreDeArea = (id: string) => escala.areas.find((a) => a.id === id)?.nombre ?? id;
  const hayDetalle = corridas.length > 0 || leido.tests.length > 0 || agenda.length > 0 || leido.correosSinPermiso > 0;
  if (!hayDetalle) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface px-5 py-4">
      <summary className="cursor-pointer select-none text-sm font-semibold text-fg">
        Historial del agente
        <span className="ml-2 text-xs font-normal text-fg-muted">lo que leyó y propuso en cada corrida</span>
      </summary>
      <div className="mt-2 space-y-3">
        <Historia corridas={corridas} />

        {leido.tests.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-fg-secondary">El test de marketing</p>
            <ul className="space-y-0.5 text-xs text-fg-muted">
              {leido.tests.map((t) => (
                <li key={t.resultado.areaId}>
                  {nombreDeArea(t.resultado.areaId)}: lo contestó {t.contacto}
                  {t.resultado.fecha ? ` el ${diaCorto(t.resultado.fecha)}` : ""}. Sus niveles entran como hipótesis en «La escala»: son de la escala anterior y se confirman en la primera reunión.
                </li>
              ))}
            </ul>
          </div>
        )}

        {agenda.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-fg-secondary">Reuniones agendadas en HubSpot</p>
            <ul className="space-y-0.5 text-xs text-fg-muted">
              {agenda.slice(0, 3).map((a) => (
                <li key={a.id}>
                  {diaYHora(a.inicio)} · {a.titulo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {leido.correosSinPermiso > 0 && (
          <p className="text-xs text-fg-muted">
            Hay {leido.correosSinPermiso} {leido.correosSinPermiso === 1 ? "correo" : "correos"} con la empresa que Nexus todavía no puede leer: falta el permiso de correos en la conexión con HubSpot.
          </p>
        )}
      </div>
    </details>
  );
}
