"use client";

/**
 * Identificacion — con quién se habla: la industria y el perfil de negocio, y las áreas en juego.
 *
 * La industria (la edición de la escala) y el perfil de negocio se ELIGEN SOLOS (pedido de Elías,
 * 2026-10-01): por la industria de HubSpot o, si no alcanza, por el agente que lee todo lo de la
 * empresa; con la edición va su perfil habitual. Se ve quién los eligió y por qué, y se cambian con
 * un clic. Las hipótesis sueltas y «Qué explorar a fondo» se retiraron de acá (2026-10-01): se
 * repetían con el mapa de la escala y la guía de la reunión, que es donde viven.
 */
import { useState } from "react";
import { Badge, Button, Input, Segmentado, Select } from "@/components/ui";
import { CIERRES, DESPUES, type Cierre, type Despues } from "@/lib/escala/documento/tipos";
import { industriaDelVendedor, normalizarTexto, type EscalaSugerida } from "@/lib/exploraciones/contenido";
import { industriaLegible, sugerirEdicion } from "@/lib/exploraciones/industria";
import { useLienzo } from "./contexto";
import { Propuestas } from "./Propuestas";

const NOMBRE_DEL_CIERRE: Record<Cierre, string> = { "con equipo": "Con equipo", transaccional: "Transaccional", mixta: "Mixta" };
const NOMBRE_DEL_DESPUES: Record<Despues, string> = { única: "Relación única", recompra: "Recompra", continua: "Relación continua" };

export function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

export function IndustriaYPerfil() {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const elegida = e.contenido.edicionElegida;
  const pendientes = pendientesPara((d) => d.tipo === "edicion" || d.tipo === "perfil");
  const edicion = escala.ediciones.find((x) => x.slug === e.edicion) ?? null;
  const habitual = edicion?.perfilHabitual ?? null;
  const esElHabitual = !!habitual && habitual.cierre === e.perfilCierre && habitual.despues === e.perfilDespues;
  const definicion = (p: typeof escala.perfil.cierre, nombre: string) =>
    p?.opciones.find((o) => normalizarTexto(o.nombre) === normalizarTexto(nombre))?.definicion;
  const opcionesCierre = CIERRES.map((c) => ({ clave: c, etiqueta: NOMBRE_DEL_CIERRE[c], title: definicion(escala.perfil.cierre, c) }));
  const opcionesDespues = DESPUES.map((d) => ({ clave: d, etiqueta: NOMBRE_DEL_DESPUES[d], title: definicion(escala.perfil.despues, d) }));

  /* La sugerida: la que guardó la exploración (la industria de HubSpot al abrirla, o el agente al
     preparar) o, si es vieja y no la tiene, la que dice la industria de HubSpot. */
  const sugerida: EscalaSugerida | null =
    elegida?.sugerida ??
    (() => {
      const slug = sugerirEdicion(exp.empresa.industria, escala.ediciones.map((x) => x.slug));
      const ed = slug ? escala.ediciones.find((x) => x.slug === slug) : null;
      return ed
        ? {
            edicion: ed.slug,
            cierre: ed.perfilHabitual?.cierre ?? null,
            despues: ed.perfilHabitual?.despues ?? null,
            por: "industria" as const,
            razon: `La industria de la empresa en HubSpot es «${industriaLegible(exp.empresa.industria)}».`,
          }
        : null;
    })();
  const distintaDeLaSugerida =
    !!sugerida && industriaDelVendedor(e) && (sugerida.edicion !== e.edicion || sugerida.cierre !== e.perfilCierre || sugerida.despues !== e.perfilDespues);
  const nombreDeLaSugerida = sugerida
    ? [
        sugerida.edicion ? (escala.ediciones.find((x) => x.slug === sugerida.edicion)?.nombre ?? sugerida.edicion) : "Escala general",
        sugerida.cierre && NOMBRE_DEL_CIERRE[sugerida.cierre].toLowerCase(),
        sugerida.despues && NOMBRE_DEL_DESPUES[sugerida.despues].toLowerCase(),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const quien =
    industriaDelVendedor(e)
      ? { insignia: "La elegiste tú", texto: "El agente ya no la cambia." }
      : elegida?.por === "agente"
        ? { insignia: "Automática", texto: elegida.razon ?? "La eligió el agente con lo que hay en HubSpot." }
        : elegida?.por === "industria"
          ? { insignia: "Automática", texto: elegida.razon ?? "Por la industria de la empresa en HubSpot." }
          : { insignia: null, texto: "El agente la elige al preparar, con lo que hay de la empresa en HubSpot." };

  return (
    <Tarjeta
      titulo="Escala"
      ayuda="Con qué edición de la escala se mide y cómo vende la empresa. Se sugieren solas con lo que hay de la empresa; cámbialas si no calzan."
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-fg-secondary" htmlFor="exploracion-edicion">
            Industria (edición de la escala)
          </label>
          <Select
            id="exploracion-edicion"
            value={e.edicion ?? ""}
            disabled={!puedeEditar || guardando}
            onChange={(ev) => void cambiar([{ op: "edicion", edicion: ev.target.value || null }], { refrescar: true })}
          >
            <option value="">Escala general</option>
            {escala.ediciones.map((ed) => (
              <option key={ed.slug} value={ed.slug}>
                {ed.nombre}
              </option>
            ))}
          </Select>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
            {quien.insignia && (
              <Badge size="xs" variant={industriaDelVendedor(e) ? "default" : "info"}>
                {quien.insignia}
              </Badge>
            )}
            <span>{quien.texto}</span>
          </p>
          {distintaDeLaSugerida && sugerida && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
              <p className="min-w-0 text-xs text-fg-secondary">
                La sugerida es <span className="font-medium text-fg">{nombreDeLaSugerida}</span>
                {sugerida.razon ? `: ${sugerida.razon}` : "."}
              </p>
              {puedeEditar && (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={guardando}
                  onClick={() => void cambiar([{ op: "restablecerEscala", sugerida }], { refrescar: true })}
                >
                  Restablecer la sugerida
                </Button>
              )}
            </div>
          )}
          {edicion?.descripcion && <p className="text-xs text-fg-muted">{edicion.descripcion}</p>}
          {exp.empresa.industria && <p className="text-2xs text-fg-muted">En HubSpot: {industriaLegible(exp.empresa.industria)}</p>}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Cómo se cierra la venta</span>
            <Segmentado<Cierre>
              etiqueta="Cómo se cierra la venta"
              opciones={opcionesCierre}
              valor={e.perfilCierre}
              deshabilitado={!puedeEditar || guardando}
              onCambio={(c) => void cambiar([{ op: "perfil", cierre: c, despues: e.perfilDespues }], { refrescar: true })}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Qué pasa después de la venta</span>
            <Segmentado<Despues>
              etiqueta="Qué pasa después de la venta"
              opciones={opcionesDespues}
              valor={e.perfilDespues}
              deshabilitado={!puedeEditar || guardando}
              onCambio={(d) => void cambiar([{ op: "perfil", cierre: e.perfilCierre, despues: d }], { refrescar: true })}
            />
          </div>
          {edicion && habitual && (
            <p className="text-xs text-fg-muted">
              {esElHabitual
                ? `Es el perfil habitual de «${edicion.nombre}» en la escala.`
                : `El habitual de «${edicion.nombre}» es ${NOMBRE_DEL_CIERRE[habitual.cierre].toLowerCase()} · ${NOMBRE_DEL_DESPUES[habitual.despues].toLowerCase()}.`}
            </p>
          )}
        </div>
      </div>
      <Propuestas items={pendientes} />
    </Tarjeta>
  );
}

export function AreasEnJuego() {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const e = exp.estado;
  const pendientes = pendientesPara((d) => d.tipo === "area");
  const [razones, setRazones] = useState<Record<string, string>>(e.contenido.razonesDeAreas);
  /* Si las razones cambian por otro lado (usar lo propuesto), los campos las siguen. */
  const [razonesVistas, setRazonesVistas] = useState(e.contenido.razonesDeAreas);
  if (razonesVistas !== e.contenido.razonesDeAreas) {
    setRazonesVistas(e.contenido.razonesDeAreas);
    setRazones(e.contenido.razonesDeAreas);
  }

  const alternar = (id: string) => {
    const areas = e.areas.includes(id) ? e.areas.filter((a) => a !== id) : [...e.areas, id];
    void cambiar([{ op: "areas", areas }]);
  };

  return (
    <Tarjeta
      titulo="Áreas en juego"
      ayuda="La del test, más las que el prospecto nombra o paga sin usar. El orden cuenta: a igual nivel, va primero la que se eligió primero."
    >
      <div className="flex flex-wrap gap-2">
        {escala.areas.map((a) => {
          const i = e.areas.indexOf(a.id);
          return (
            <Button
              key={a.id}
              size="sm"
              variant={i >= 0 ? "ghost" : "secondary"}
              aria-pressed={i >= 0}
              disabled={!puedeEditar || guardando}
              onClick={() => alternar(a.id)}
            >
              {i >= 0 && <span className="tabular-nums">{i + 1}.</span>} {a.nombre}
            </Button>
          );
        })}
      </div>
      {e.areas.length > 0 && (
        <div className="space-y-2">
          {e.areas.map((id) => (
            <div key={id} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr]">
              <span className="text-xs text-fg-secondary">Por qué {escala.areas.find((a) => a.id === id)?.nombre}</span>
              <Input
                value={razones[id] ?? ""}
                disabled={!puedeEditar}
                placeholder="Lo que dijo o lo que paga sin usar"
                onChange={(ev) => setRazones((r) => ({ ...r, [id]: ev.target.value }))}
                onBlur={() => {
                  if ((razones[id] ?? "") !== (e.contenido.razonesDeAreas[id] ?? "")) {
                    void cambiar([{ op: "areas", areas: e.areas, razones: { [id]: (razones[id] ?? "").trim() } }]);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      <Propuestas items={pendientes} />
    </Tarjeta>
  );
}
