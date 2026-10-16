"use client";

/**
 * components/seguimiento/LoQueDejoLaReunion.tsx — la tarjeta «Lo que dejó esta reunión», arriba de las pestañas de
 * la página de la reunión (docs/DECISIONS.md, «Una sola revisión por reunión», 2026-10-09).
 *
 * Arma la tarjeta con las piezas del sistema (components/ui/sistema.tsx), sin diseño nuevo. Cada cosa que propuso
 * Nexus es una fila azul con sus acciones, y cada acción va por la puerta que ya existe (la minuta, los pedidos fuera
 * de alcance, la ficha, Tareas, las alertas). Lo que se decide acá queda en su lugar, sin la marca de sugerencia: no
 * se pinta de verde ni se mueve. Las reglas de qué entra: lib/seguimiento/tarjeta.ts.
 *
 * «Usar todo» revisa la minuta, confirma los pedidos fuera de alcance, usa tus tareas propuestas y da por usadas las
 * novedades de los documentos (etapa 6). Nunca toca la información del cliente, la etapa, las alertas ni el avance.
 *
 * Los hechos de la reunión (etapa 6) van con su destino: una novedad de un documento se decide acá o arriba del
 * documento (la misma ruta); lo que fue a la ficha, a una alerta, al vigía, al avance o a la etapa dice a dónde fue.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea, useToast } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, BotonUsar, FilaSugerida, FranjaDeSugerencias, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { EstadoDeLoPropuesto } from "@/lib/lo-propuesto/tipos";
import type { Tarjeta } from "@/lib/seguimiento/tarjeta";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «7 nov», de un AAAA-MM-DD (sin zonas: es un día). */
function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1] ?? ""}`.trim();
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const ESTADO_EN_PALABRAS: Record<EstadoDeLoPropuesto, string> = {
  pendiente: "Pendiente",
  usado: "Se usó",
  desestimado: "Se desestimó",
  vencido: "Venció",
};

/** Lo que se decidió de cada cosa en esta pantalla (clave → cómo quedó). */
type Decididos = Record<string, string>;

async function pedir(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, status: r.status, data };
}

const mensaje = (data: Record<string, unknown>, porDefecto: string) => (typeof data.error === "string" && data.error ? data.error : porDefecto);

/** Las claves de lo que todavía pide decisión según el servidor. */
function clavesPendientes(t: Tarjeta): Set<string> {
  const s = new Set<string>();
  const m = t.secciones.minuta;
  if (m && (m.estado === "pendiente" || m.estado === "vencido")) s.add(`minuta:${m.id}`);
  for (const p of t.secciones.fueraDeAlcance.items) s.add(`pedido:${p.id}`);
  for (const c of t.secciones.ficha.items) s.add(`campo:${c.clave}`);
  for (const x of t.secciones.tareas.items) s.add(`tarea:${x.id}`);
  for (const a of t.secciones.alertas?.items ?? []) s.add(`alerta:${a.id}`);
  for (const h of t.secciones.hechos?.items ?? []) if (h.pideDecision) s.add(`hecho:${h.id}`);
  if (t.secciones.notaParaHubspot) s.add("nota");
  return s;
}

export default function LoQueDejoLaReunion({ inicial }: { inicial: Tarjeta }) {
  const toast = useToast();
  const router = useRouter();
  /* `vista` es lo que se pinta (las filas no se mueven al decidir); `vivo` es lo último del servidor (la huella, lo que
     usaría «Usar todo» y cuánto pide decisión). */
  const [vista, setVista] = useState<Tarjeta>(inicial);
  const [vivo, setVivo] = useState<Tarjeta>(inicial);
  const [decididos, setDecididos] = useState<Decididos>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const pendientesVivos = useMemo(() => clavesPendientes(vivo), [vivo]);
  const sessionId = vista.reunion.id;
  const clientId = vista.reunion.clientId;

  const refrescar = useCallback(async () => {
    const r = await pedir(`/api/sessions/${encodeURIComponent(sessionId)}/lo-que-dejo`, { method: "GET" });
    if (r.ok && r.data.tarjeta) setVivo(r.data.tarjeta as Tarjeta);
  }, [sessionId]);

  /** Una acción sobre una cosa: si sale bien, queda decidida en su lugar con este texto. */
  const accion = useCallback(
    async (clave: string, quedo: string, llamada: () => Promise<{ ok: boolean; data: Record<string, unknown> }>) => {
      setOcupado(clave);
      try {
        const r = await llamada();
        if (!r.ok) {
          toast.error(mensaje(r.data, "No se pudo guardar. Vuelve a intentarlo."));
          return;
        }
        setDecididos((d) => ({ ...d, [clave]: quedo }));
        await refrescar();
      } catch {
        toast.error("No se pudo guardar. Revisa tu conexión.");
      } finally {
        setOcupado(null);
      }
    },
    [refrescar, toast],
  );

  const usarTodo = useCallback(async () => {
    setOcupado("usar-todo");
    try {
      const r = await pedir(`/api/sessions/${encodeURIComponent(sessionId)}/lo-que-dejo`, {
        method: "POST",
        body: JSON.stringify({ huella: vivo.huella }),
      });
      if (r.status === 409 && r.data.tarjeta) {
        const nueva = r.data.tarjeta as Tarjeta;
        setVista(nueva);
        setVivo(nueva);
        toast.error(mensaje(r.data, "La reunión cambió. Revisa lo nuevo antes de usarlo."));
        return;
      }
      if (!r.ok) {
        toast.error(mensaje(r.data, "No se pudo usar todo. Vuelve a intentarlo."));
        return;
      }
      const aplicado = (r.data.aplicado as { tipo: string; id: string }[] | undefined) ?? [];
      const rechazado = (r.data.rechazado as { tipo: string; id: string; motivo: string }[] | undefined) ?? [];
      const etiqueta: Record<string, [string, string]> = {
        minuta: ["minuta", "Revisada"],
        "pedido-fuera-de-alcance": ["pedido", "Confirmada"],
        "tarea-propuesta": ["tarea", "La usaste"],
      };
      setDecididos((d) => {
        const n = { ...d };
        for (const a of aplicado) {
          // Una novedad viene como «<hecho>:<destino>»: la fila es la del hecho.
          if (a.tipo === "novedad") {
            n[`hecho:${a.id.split(":")[0]}`] = "Se usó";
            continue;
          }
          const [prefijo, texto] = etiqueta[a.tipo] ?? ["", ""];
          if (prefijo) n[`${prefijo}:${a.id}`] = texto;
        }
        return n;
      });
      if (r.data.tarjeta) setVivo(r.data.tarjeta as Tarjeta);
      if (rechazado.length) {
        toast.error(`${plural(rechazado.length, "cosa no se pudo usar", "cosas no se pudieron usar")}: ${rechazado[0].motivo}`);
      } else if (aplicado.length) {
        toast.success(`Listo: ${plural(aplicado.length, "cosa usada", "cosas usadas")}.`);
      }
    } catch {
      toast.error("No se pudo usar todo. Revisa tu conexión.");
    } finally {
      setOcupado(null);
    }
  }, [sessionId, toast, vivo.huella]);

  /** ¿Esta cosa ya no pide decisión? Lo decidiste acá, o lo decidió alguien más mientras tanto. */
  const yaNoPide = (clave: string): string | null => decididos[clave] ?? (pendientesVivos.has(clave) ? null : "Ya se decidió");

  const { secciones } = vista;
  const planVivo = vivo.planDeUsarTodo;
  /** Decide una novedad de un hecho (etapa 6): la misma ruta que la franja de arriba del documento, una vez por documento. */
  const decidirNovedadDelHecho = (clave: string, texto: string, projectId: string | null, hechoId: string, piezas: string[], que: "usar" | "desestimar") =>
    accion(clave, texto, async () => {
      if (!projectId || !piezas.length) return { ok: false, data: { error: "Esta novedad no es de un proyecto." } };
      for (const pieza of piezas) {
        const r = await pedir(`/api/projects/${encodeURIComponent(projectId)}/novedades/${encodeURIComponent(hechoId)}`, {
          method: "PATCH",
          body: JSON.stringify({ accion: que, pieza }),
        });
        if (!r.ok && r.status !== 409) return r;
      }
      return { ok: true, data: {} };
    });

  const hayPlan = !!planVivo.minuta || planVivo.pedidos.length > 0 || planVivo.tareas.length > 0 || (planVivo.novedades?.length ?? 0) > 0;
  const minuta = secciones.minuta;
  const minutaPendiente = !!minuta && (minuta.estado === "pendiente" || minuta.estado === "vencido");

  return (
    <section id="lo-que-dejo" className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <FranjaDeSugerencias>
        <span className="font-semibold">Lo que dejó esta reunión</span>
        {" · "}
        {vivo.pideDecision > 0 ? `${plural(vivo.pideDecision, "cosa pide tu decisión", "cosas piden tu decisión")}.` : "Nada pide tu decisión."}{" "}
        {vivo.vencida ? (
          <span className="rounded border border-warn-line bg-warn-surface px-1.5 py-0.5 text-xs text-warn-ink">
            Venció sin revisar el {diaCorto(vivo.venceEl)}: igual puedes decidir
          </span>
        ) : (
          <span className="text-fg-muted">Pide revisión hasta el {diaCorto(vivo.pideHasta)}.</span>
        )}
      </FranjaDeSugerencias>

      {/* La minuta: memoria de la reunión. Se revisa o se corrige; no se desestima. */}
      {minuta && (
        <Bloque titulo="Minuta">
          <ul className="space-y-2">
            {minutaPendiente && !yaNoPide(`minuta:${minuta.id}`) ? (
              <FilaSugerida
                origen={<span>Nexus la escribió al leer la reunión. Si algo está mal, corrígela en la reunión del proyecto.</span>}
                debajo={<DetalleDeLaMinuta minuta={minuta} />}
                acciones={
                  <BotonUsar
                    disabled={ocupado !== null}
                    onClick={() =>
                      accion(`minuta:${minuta.id}`, "Revisada", () =>
                        pedir(`/api/sessions/${encodeURIComponent(sessionId)}/minute`, { method: "PATCH", body: JSON.stringify({ status: "REVIEWED" }) }),
                      )
                    }
                  >
                    Marcar revisada
                  </BotonUsar>
                }
              >
                <p className="whitespace-pre-line">{minuta.resumen}</p>
              </FilaSugerida>
            ) : (
              <FilaNeutra estado={decididos[`minuta:${minuta.id}`] ?? (minuta.reviewedByEmail ? `Revisada por ${minuta.reviewedByEmail}` : "Revisada")}>
                <p className="whitespace-pre-line">{minuta.resumen}</p>
                <DetalleDeLaMinuta minuta={minuta} />
              </FilaNeutra>
            )}
          </ul>
        </Bloque>
      )}

      {secciones.fueraDeAlcance.items.length > 0 && (
        <Bloque titulo="Pedidos fuera de alcance" mas={secciones.fueraDeAlcance.mas} href={secciones.fueraDeAlcance.href}>
          <ul className="space-y-2">
            {secciones.fueraDeAlcance.items.map((p) => {
              const clave = `pedido:${p.id}`;
              const quedo = yaNoPide(clave);
              if (quedo) return <FilaNeutra key={p.id} estado={quedo}>{p.pedido}</FilaNeutra>;
              const cambiar = (estado: string, texto: string) =>
                accion(clave, texto, () =>
                  pedir(`/api/clients/${encodeURIComponent(clientId)}/solicitudes-fuera-de-alcance/${encodeURIComponent(p.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ estado }),
                  }),
                );
              return (
                <FilaSugerida
                  key={p.id}
                  encima={p.proyecto ?? undefined}
                  origen={
                    <span>
                      {p.quienLoPidio ? `Lo pidió ${p.quienLoPidio}. ` : ""}
                      {p.nota ?? "Al confirmarlo les avisamos a Ventas y a quien lidera Customer Success."}
                      {p.estado === "vencido" ? " Venció sin revisar." : ""}
                    </span>
                  }
                  debajo={<Cita texto={p.cita} />}
                  acciones={
                    <>
                      <BotonTexto disabled={ocupado !== null} onClick={() => cambiar("DESCARTADO", "Desestimada")}>
                        Desestimar
                      </BotonTexto>
                      <BotonBlanco disabled={ocupado !== null} onClick={() => cambiar("INCLUIDO", "Ya estaba incluida")}>
                        Ya estaba incluida
                      </BotonBlanco>
                      <BotonUsar disabled={ocupado !== null} onClick={() => cambiar("CONFIRMADO", "Confirmada")}>
                        Confirmar
                      </BotonUsar>
                    </>
                  }
                >
                  {p.pedido}
                </FilaSugerida>
              );
            })}
          </ul>
        </Bloque>
      )}

      {secciones.ficha.items.length > 0 && (
        <Bloque titulo="Información del cliente" mas={secciones.ficha.mas} href={secciones.ficha.href}>
          <ul className="space-y-2">
            {secciones.ficha.items.map((c) => {
              const clave = `campo:${c.clave}`;
              const quedo = yaNoPide(clave);
              if (quedo) return <FilaNeutra key={c.clave} estado={quedo}>{c.etiqueta}</FilaNeutra>;
              return (
                <FilaSugerida
                  key={c.clave}
                  encima={`${c.etiqueta}${c.interno ? " · interno" : ""}`}
                  origen={<span>Se confirma en Información del cliente, porque escribe en HubSpot.</span>}
                  acciones={
                    <>
                      <BotonTexto
                        disabled={ocupado !== null}
                        onClick={() =>
                          accion(clave, "Desestimada", () =>
                            pedir(`/api/clients/${encodeURIComponent(clientId)}/ficha`, {
                              method: "PUT",
                              body: JSON.stringify({ descartarCampos: [c.clave] }),
                            }),
                          )
                        }
                      >
                        Desestimar
                      </BotonTexto>
                      {secciones.ficha.href && (
                        <BotonUsar disabled={ocupado !== null} onClick={() => router.push(secciones.ficha.href!)}>
                          Usar
                        </BotonUsar>
                      )}
                    </>
                  }
                >
                  <p className="line-clamp-4 whitespace-pre-line">{c.propuesto}</p>
                </FilaSugerida>
              );
            })}
          </ul>
        </Bloque>
      )}

      {secciones.etapa.items.length > 0 && (
        <Bloque titulo="Etapa en HubSpot">
          <ul className="space-y-2">
            {secciones.etapa.items.map((s) => (
              <FilaSugerida
                key={s.projectId}
                encima={s.proyecto}
                origen={<span>En HubSpot sigue en {s.desde ?? "otra etapa"}. Nada se mueve hasta que respondas la encuesta.</span>}
                debajo={<Cita texto={s.cita} />}
                acciones={
                  <BotonUsar disabled={ocupado !== null} onClick={() => router.push(s.href)}>
                    {s.puedeResponder ? "Responder" : "Ver"}
                  </BotonUsar>
                }
              >
                Pasó a {s.hasta}
              </FilaSugerida>
            ))}
          </ul>
        </Bloque>
      )}

      {secciones.fechaDelDiagnostico.items.length > 0 && (
        <Bloque titulo="Presentación del diagnóstico">
          <ul className="space-y-2">
            {secciones.fechaDelDiagnostico.items.map((f) => (
              <FilaSugerida
                key={f.projectId}
                encima={f.proyecto}
                origen={<span>Úsala o cámbiala en el diagnóstico.</span>}
                debajo={<Cita texto={f.cita} />}
                acciones={
                  <BotonUsar disabled={ocupado !== null} onClick={() => router.push(f.href)}>
                    Revisarla
                  </BotonUsar>
                }
              >
                Se presenta el {f.fechaEnPalabras}
              </FilaSugerida>
            ))}
          </ul>
        </Bloque>
      )}

      {secciones.tareas.items.length > 0 && (
        <Bloque titulo="Tus tareas propuestas" mas={secciones.tareas.mas} href={secciones.tareas.href}>
          <ul className="space-y-2">
            {secciones.tareas.items.map((t) => {
              const clave = `tarea:${t.id}`;
              const quedo = yaNoPide(clave);
              if (quedo) return <FilaNeutra key={t.id} estado={quedo}>{`T-${t.numero} · ${t.titulo}`}</FilaNeutra>;
              const decidir = (tipo: "usar" | "rechazar", texto: string) =>
                accion(clave, texto, () =>
                  pedir(`/api/tareas/${encodeURIComponent(t.id)}/decision`, {
                    method: "POST",
                    body: JSON.stringify({ version: t.version, decision: { tipo } }),
                  }),
                );
              return (
                <FilaSugerida
                  key={t.id}
                  origen={t.contexto ? <span className="line-clamp-2">{t.contexto}</span> : undefined}
                  debajo={<Cita texto={t.cita} />}
                  acciones={
                    <>
                      <BotonTexto disabled={ocupado !== null} onClick={() => decidir("rechazar", "Desestimada")}>
                        Desestimar
                      </BotonTexto>
                      <BotonUsar disabled={ocupado !== null} onClick={() => decidir("usar", "La usaste")} />
                    </>
                  }
                >
                  T-{t.numero} · {t.titulo}
                </FilaSugerida>
              );
            })}
          </ul>
        </Bloque>
      )}

      {secciones.notaParaHubspot && (
        <Bloque titulo="Nota para HubSpot">
          {yaNoPide("nota") ? (
            <FilaNeutra estado={yaNoPide("nota")!}>La nota para HubSpot</FilaNeutra>
          ) : (
            <NotaParaHubspot
              sugerida={secciones.notaParaHubspot.sugerida}
              proyecto={secciones.notaParaHubspot.proyecto}
              ocupado={ocupado !== null}
              onUsar={(texto) =>
                accion("nota", "Escrita en HubSpot", () =>
                  pedir(`/api/sessions/${encodeURIComponent(sessionId)}/nota-para-hubspot`, { method: "POST", body: JSON.stringify({ accion: "usar", texto }) }),
                )
              }
              onDescartar={() =>
                accion("nota", "No se usó", () =>
                  pedir(`/api/sessions/${encodeURIComponent(sessionId)}/nota-para-hubspot`, { method: "POST", body: JSON.stringify({ accion: "descartar" }) }),
                )
              }
            />
          )}
        </Bloque>
      )}

      {secciones.alertas && secciones.alertas.items.length > 0 && (
        <Bloque titulo="Alertas que citan esta reunión" mas={secciones.alertas.mas} href={secciones.alertas.href}>
          <ul className="space-y-2">
            {secciones.alertas.items.map((a) => {
              const clave = `alerta:${a.id}`;
              const quedo = yaNoPide(clave);
              if (quedo) return <FilaNeutra key={a.id} estado={quedo}>{a.titulo}</FilaNeutra>;
              const cerrar = (status: "RESOLVED" | "DISMISSED", texto: string) =>
                accion(clave, texto, () =>
                  pedir(`/api/cs/alerts/${encodeURIComponent(a.id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
                );
              return (
                <FilaSugerida
                  key={a.id}
                  origen={<span className="line-clamp-2">{a.razon}</span>}
                  debajo={<Cita texto={a.cita} />}
                  acciones={
                    <>
                      <BotonTexto disabled={ocupado !== null} onClick={() => cerrar("DISMISSED", "Desestimada")}>
                        Desestimar
                      </BotonTexto>
                      <BotonUsar disabled={ocupado !== null} onClick={() => cerrar("RESOLVED", "Resuelta")}>
                        Resolver
                      </BotonUsar>
                    </>
                  }
                >
                  {a.titulo}
                </FilaSugerida>
              );
            })}
          </ul>
        </Bloque>
      )}

      {(secciones.hechos?.items.length ?? 0) > 0 && (
        <Bloque titulo="Lo que se dijo y a dónde va" mas={secciones.hechos.mas}>
          <ul className="space-y-2">
            {secciones.hechos.items.map((h) => {
              const clave = `hecho:${h.id}`;
              const novedades = h.destinos.filter((d) => d.decidible);
              const otros = h.destinos.filter((d) => !d.decidible);
              const dondeFue = otros.map((d) => `${d.rotulo}: ${d.comoQuedo.charAt(0).toLowerCase()}${d.comoQuedo.slice(1)}`).join(" · ");
              const quedo = h.pideDecision ? yaNoPide(clave) : null;
              if (!h.pideDecision || quedo) {
                return (
                  <FilaNeutra key={h.id} estado={quedo ?? (h.destinos.length ? "" : "Queda en la reunión")}>
                    <p>{h.frase}</p>
                    {dondeFue && <p className="mt-0.5 text-xs text-fg-muted">{dondeFue}</p>}
                  </FilaNeutra>
                );
              }
              const piezas = [...new Set(novedades.map((d) => d.pieza).filter((p): p is string => !!p))];
              const decidir = (que: "usar" | "desestimar", texto: string) => decidirNovedadDelHecho(clave, texto, h.projectId, h.id, piezas, que);
              const href = novedades.find((d) => d.href)?.href ?? null;
              return (
                <FilaSugerida
                  key={h.id}
                  encima={`${novedades.map((d) => d.rotulo).join(" · ")}${h.proyecto ? ` · ${h.proyecto}` : ""}`}
                  origen={<span className="line-clamp-2">{dondeFue || "Una novedad para el documento: ábrelo y cámbialo con el chat, o márcala como lista."}</span>}
                  debajo={<Cita texto={h.cita} />}
                  acciones={
                    <>
                      <BotonTexto disabled={ocupado !== null} onClick={() => void decidir("desestimar", "No aplica")}>
                        No aplica
                      </BotonTexto>
                      <BotonBlanco disabled={ocupado !== null} onClick={() => void decidir("usar", "Se usó")} title="Ya la cambiaste en el documento">
                        Listo
                      </BotonBlanco>
                      {href && (
                        <BotonUsar disabled={ocupado !== null} onClick={() => router.push(href)}>
                          Abrir el documento
                        </BotonUsar>
                      )}
                    </>
                  }
                >
                  {h.frase}
                </FilaSugerida>
              );
            })}
          </ul>
        </Bloque>
      )}

      {secciones.compromisos.items.length > 0 && (
        <details className="rounded-lg border border-line bg-surface-muted px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
            Compromisos que quedaron en Tareas ({secciones.compromisos.items.length + secciones.compromisos.mas}) · solo para leer: cada persona decide los suyos
          </summary>
          <ul className="mt-2 space-y-1.5">
            {secciones.compromisos.items.map((c) => (
              <li key={c.id} className={cn("text-xs text-fg-secondary", c.hecho && "line-through")}>
                {c.texto}
                <span className="text-fg-muted">
                  {c.responsable ? ` · ${c.responsable}` : c.lado === "CLIENTE" ? " · el cliente" : ""}
                  {c.vence ? ` · vence el ${diaCorto(c.vence)}` : ""}
                </span>
              </li>
            ))}
            {secciones.compromisos.mas > 0 && <li className="text-xs text-fg-muted">y {secciones.compromisos.mas} más</li>}
          </ul>
        </details>
      )}

      {vista.yaRevisado.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-fg-secondary">Ya revisado ({vista.yaRevisado.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {vista.yaRevisado.map((y) => (
              <li key={`${y.tipo}:${y.id}`} className="text-xs text-fg-secondary">
                {y.texto}
                <span className="text-fg-muted">
                  {" · "}
                  {ESTADO_EN_PALABRAS[y.estado]}
                  {y.por ? ` · ${y.por}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <BotonAzul disabled={!hayPlan || ocupado !== null} onClick={usarTodo}>
          {ocupado === "usar-todo" ? "Usando…" : "Usar todo"}
        </BotonAzul>
        <p className="min-w-0 flex-1 text-xs text-fg-muted">
          Revisa la minuta, confirma los pedidos fuera de alcance, usa tus tareas propuestas y da por usadas las novedades
          de los documentos que ves. Confirmar un pedido les avisa a Ventas y a quien lidera Customer Success. No toca la
          información del cliente, la etapa, las alertas ni el avance: esas se confirman donde se ve su efecto.
        </p>
      </div>
    </section>
  );
}

/**
 * La nota para HubSpot (etapa 5 de docs/mi-dia-plan.md): Nexus la arma con lo acordado de la minuta; la persona la cambia,
 * la usa (se escribe en HubSpot a su nombre) o la descarta. Nunca entra a «Usar todo»: escribe en HubSpot.
 */
export function NotaParaHubspot({
  sugerida,
  proyecto,
  ocupado,
  onUsar,
  onDescartar,
}: {
  sugerida: string;
  proyecto: string | null;
  ocupado: boolean;
  onUsar: (texto: string) => void;
  onDescartar: () => void;
}) {
  const [texto, setTexto] = useState(sugerida);
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-muted">
        Esta reunión no queda en el registro de HubSpot. Nexus armó la nota con lo acordado: cámbiala si hace falta.
        {proyecto ? ` Va a la empresa y al proyecto «${proyecto}».` : " Va a la empresa."}
      </p>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={Math.min(10, Math.max(4, texto.split("\n").length + 1))}
        aria-label="La nota para HubSpot"
        className="border-info-line bg-info-surface text-[13px]"
      />
      <div className="flex items-center justify-end gap-2">
        <BotonTexto disabled={ocupado} onClick={onDescartar}>
          Descartar
        </BotonTexto>
        <BotonUsar disabled={ocupado || !texto.trim()} onClick={() => onUsar(texto)}>
          Usar y escribir en HubSpot
        </BotonUsar>
      </div>
    </div>
  );
}

function Bloque({ titulo, mas = 0, href = null, children }: { titulo: string; mas?: number; href?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>{titulo}</p>
      {children}
      {mas > 0 &&
        (href ? (
          <Link href={href} className="text-xs font-semibold text-brand hover:text-brand-light">
            y {mas} más
          </Link>
        ) : (
          <p className="text-xs text-fg-muted">y {mas} más</p>
        ))}
    </div>
  );
}

/** Una cosa ya decidida: sin la marca de sugerencia, en su lugar. */
function FilaNeutra({ estado, children }: { estado: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-line bg-surface py-2.5 pl-3 pr-2.5">
      <div className="min-w-0 flex-1 text-sm leading-[1.45] text-fg-secondary">{children}</div>
      <span className="flex-shrink-0 text-xs text-fg-muted">{estado}</span>
    </li>
  );
}

function Cita({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-fg-muted">Ver de dónde sale</summary>
      <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs italic text-fg-secondary">«{texto}»</blockquote>
    </details>
  );
}

function DetalleDeLaMinuta({ minuta }: { minuta: NonNullable<Tarjeta["secciones"]["minuta"]> }) {
  const listas: [string, string[]][] = [
    ["Acuerdos", minuta.acuerdos],
    ["Decisiones", minuta.decisiones],
    ["Riesgos", minuta.riesgos],
  ];
  const conAlgo = listas.filter(([, xs]) => xs.length > 0);
  if (!conAlgo.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-fg-muted">Acuerdos, decisiones y riesgos</summary>
      <div className="mt-1 space-y-2">
        {conAlgo.map(([titulo, xs]) => (
          <div key={titulo}>
            <p className="text-xs font-medium text-fg-secondary">{titulo}</p>
            <ul className="list-disc pl-4 text-xs text-fg-secondary">
              {xs.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
