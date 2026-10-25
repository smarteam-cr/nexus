"use client";

/**
 * components/landing/sections-planificacion-brief.tsx — las secciones de la Planificación que vinieron del
 * Brief de implementación (2026-10-25, docs/planificacion-brief-plan.md):
 *
 *   · `ficha_proyecto`     — los hubs con su edición y sus sesiones, quiénes participan, el alcance.
 *   · `usuarios_permisos`  — los equipos con su conjunto de permisos y los usuarios que entran a HubSpot.
 *   · `canales_entrada`    — por dónde entran los leads, quién los atiende y cómo pasan de área.
 *   · `formularios`        — cada formulario con sus campos, tomados de la tabla de propiedades.
 *   · `cotizaciones`       — qué propiedades lleva, el formato y los ajustes.
 *   · `informes`           — los informes y paneles, cada uno con el objetivo del diagnóstico que mide.
 *
 * Ninguna la escribe el agente en la corrida principal: las llenan el CSE, el cliente o una plantilla.
 * Mismas reglas que sections-planificacion.tsx: sin scrollers que dependan del viewport (va al PDF), en
 * lectura lo vacío no se pinta, y cada cosa dice de dónde sale.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import { Editable, InlineCheck, InlineSelect, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem, isSi } from "./inline";
import { ConIntro } from "./partes";
import { partesDe } from "@/lib/landing/partes";
import { OrigenChip, Mover, Campo } from "./sections-planificacion";
import { mover } from "@/lib/planificacion/secciones";
import { nuevoIdDeFila } from "@/lib/planificacion/propiedades";
import {
  EDICIONES,
  LADOS,
  PARTICIPANTES_DE_SIEMPRE,
  OBJETOS_CON_PERMISO,
  ACCIONES_DE_PERMISO,
  TIPOS_DE_EQUIPO,
  CANALES_DE_SIEMPRE,
  adoptarFichaDelProyecto,
  adoptarUsuariosPermisos,
  adoptarCanales,
  adoptarFormularios,
  adoptarCotizaciones,
  adoptarInformes,
  nivelesPermitidos,
  ajustarPermiso,
  resumenDeLicencias,
  avisosDeUsuarios,
  camposContraPropiedades,
  propiedadesParaFormulario,
  conIds,
  type FichaDelProyectoData,
  type HubDelProyecto,
  type Participante,
  type UsuariosPermisosData,
  type EquipoDeHubspot,
  type UsuarioDeHubspot,
  type AccionDePermiso,
  type ObjetoConPermiso,
  type CanalesDeEntradaData,
  type CanalDeEntrada,
  type FormulariosData,
  type Formulario,
  type CampoDeFormulario,
  type CotizacionesData,
  type InformesData,
  type Informe,
} from "@/lib/planificacion/brief";

const etiquetaDe = (opciones: readonly { value: string; label: string }[], v?: string) => opciones.find((o) => o.value === v)?.label ?? v ?? "";
const lleno = (v?: string) => !!(v ?? "").trim();

/** Una celda de texto de una tabla. */
function Celda({ value, editable, placeholder, onCommit, className }: { value?: string; editable?: boolean; placeholder: string; onCommit: (v: string) => void; className?: string }) {
  return <Editable as="span" className={className} editable={editable} value={value ?? ""} placeholder={placeholder} onCommit={onCommit} />;
}

/* ── Ficha del proyecto ─────────────────────────────────────────────────────── */

export const FichaDelProyectoSection: FC<SectionProps<FichaDelProyectoData>> = ({ data, editable, onChange }) => {
  const d = adoptarFichaDelProyecto(data);
  // Se guardan solo los hubs con algún dato: los cinco se pintan siempre (adoptarFichaDelProyecto).
  const hubsConDato = (hubs: HubDelProyecto[]) => hubs.filter((h) => isSi(h.incluido ?? "") || lleno(h.edicion) || lleno(h.sesionesSetup) || lleno(h.sesionesCapacitacion));
  const set = (next: Partial<FichaDelProyectoData>) =>
    onChange?.({ ...partesDe(data), ...d, hubs: hubsConDato(d.hubs), participantes: conIds(d.participantes), ...next });
  const setHub = (i: number, patch: Partial<HubDelProyecto>) => set({ hubs: hubsConDato(replaceAt(d.hubs, i, { ...d.hubs[i], ...patch })) });
  const participantes = d.participantes;
  const setP = (i: number, patch: Partial<Participante>) => set({ participantes: conIds(replaceAt(participantes, i, { ...participantes[i], ...patch })) });

  const hubsVisibles = editable ? d.hubs : d.hubs.filter((h) => isSi(h.incluido ?? ""));
  const vacia = !hubsVisibles.length && !participantes.length && !lleno(d.alcance) && !lleno(d.consideraciones);
  if (!editable && vacia) return null;

  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<FichaDelProyectoData>)} placeholder="Una frase que presenta el proyecto…">
      {hubsVisibles.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Hub</th>
                {editable && <th className="stl-props-mid">Entra</th>}
                <th>Edición</th>
                <th className="stl-props-mid">Sesiones de set up</th>
                <th className="stl-props-mid">Sesiones de capacitación</th>
              </tr>
            </thead>
            <tbody>
              {hubsVisibles.map((h) => {
                const i = d.hubs.indexOf(h);
                return (
                  <tr key={h.hub} className={editable && !isSi(h.incluido ?? "") ? "stl-plan-apagada" : undefined}>
                    <td className="stl-accion-titulo">{h.hub}</td>
                    {editable && <td className="stl-props-mid"><InlineCheck value={h.incluido ?? ""} editable onCommit={(v) => setHub(i, { incluido: v })} ariaLabel={`El proyecto incluye ${h.hub}`} /></td>}
                    <td><InlineSelect value={h.edicion ?? ""} options={EDICIONES} editable={editable} onCommit={(v) => setHub(i, { edicion: v })} ariaLabel={`Edición de ${h.hub}`} /></td>
                    <td className="stl-props-mid"><Celda value={h.sesionesSetup} editable={editable} placeholder="—" onCommit={(v) => setHub(i, { sesionesSetup: v })} /></td>
                    <td className="stl-props-mid"><Celda value={h.sesionesCapacitacion} editable={editable} placeholder="—" onCommit={(v) => setHub(i, { sesionesCapacitacion: v })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(editable || participantes.length > 0) && <h3 className="stl-plan-objeto">Quiénes participan</h3>}
      {participantes.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>De</th>
                <th className="stl-props-mid">Principal</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {participantes.map((p, i) => (
                <tr key={p.id ?? i}>
                  <td><Celda className="stl-accion-titulo" value={p.nombre} editable={editable} placeholder="Nombre…" onCommit={(v) => setP(i, { nombre: v })} /></td>
                  <td><Celda value={p.cargo} editable={editable} placeholder="Cargo…" onCommit={(v) => setP(i, { cargo: v })} /></td>
                  <td><Celda value={p.correo} editable={editable} placeholder="correo@…" onCommit={(v) => setP(i, { correo: v })} /></td>
                  <td><Celda value={p.telefono} editable={editable} placeholder="—" onCommit={(v) => setP(i, { telefono: v })} /></td>
                  <td><InlineSelect value={p.lado ?? ""} options={LADOS} editable={editable} onCommit={(v) => setP(i, { lado: v })} ariaLabel="De qué lado está" /></td>
                  <td className="stl-props-mid"><InlineCheck value={p.principal ?? ""} editable={editable} onCommit={(v) => setP(i, { principal: v })} ariaLabel="Contacto principal" /></td>
                  {editable && (
                    <td className="stl-props-actions"><RemoveBtn onClick={() => set({ participantes: removeAt(participantes, i) })} title="Quitar a esta persona" /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <div className="stl-plan-acciones">
          <AddBtn label="Agregar persona" onClick={() => set({ participantes: conIds(appendItem(participantes, { nombre: "", cargo: "", correo: "", telefono: "", lado: "cliente", principal: "no" })) })} />
          {!participantes.length && (
            <button type="button" className="stl-plan-mini" onClick={() => set({ participantes: conIds<Participante>(PARTICIPANTES_DE_SIEMPRE.map((p) => ({ nombre: "", correo: "", telefono: "", principal: "no", ...p }))) })}>
              Empezar con los cargos de siempre
            </button>
          )}
        </div>
      )}

      {(editable || lleno(d.alcance) || lleno(d.consideraciones)) && (
        <dl className="stl-plan-campos stl-plan-campos--ancho">
          <Campo rotulo="Alcance" value={d.alcance} editable={editable} placeholder="Lo que incluye el proyecto, en pocas líneas…" onCommit={(v) => set({ alcance: v })} />
          <Campo rotulo="A considerar" value={d.consideraciones} editable={editable} placeholder="Lo que hay que tener en cuenta…" onCommit={(v) => set({ consideraciones: v })} />
        </dl>
      )}
      {editable && <p className="stl-plan-aviso">Las fechas del kickoff, del inicio y del cierre estimado están en el Cronograma.</p>}
    </ConIntro>
  );
};

/* ── Usuarios y permisos ────────────────────────────────────────────────────── */

export const UsuariosPermisosSection: FC<SectionProps<UsuariosPermisosData>> = ({ data, editable, onChange }) => {
  const d = adoptarUsuariosPermisos(data);
  const set = (next: Partial<UsuariosPermisosData>) => onChange?.({ ...partesDe(data), intro: d.intro, equipos: conIds(d.equipos), usuarios: conIds(d.usuarios), ...next });
  const equipos = d.equipos;
  const usuarios = d.usuarios;
  const setEquipo = (i: number, patch: Partial<EquipoDeHubspot>) => set({ equipos: conIds(replaceAt(equipos, i, { ...equipos[i], ...patch })) });
  const setUsuario = (i: number, patch: Partial<UsuarioDeHubspot>) => set({ usuarios: conIds(replaceAt(usuarios, i, { ...usuarios[i], ...patch })) });
  if (!editable && !equipos.length && !usuarios.length) return null;

  const opcionesDeEquipo = equipos.filter((e) => e.id).map((e) => ({ value: e.id!, label: e.nombre || "Equipo sin nombre" }));
  const licencias = resumenDeLicencias(usuarios);
  const avisos = editable ? avisosDeUsuarios(d) : [];

  const matriz = (e: EquipoDeHubspot, i: number) => (
    <div key={e.id ?? i} className="stl-plan-bloque stl-item">
      {editable && <RemoveBtn onClick={() => set({ equipos: removeAt(equipos, i) })} title="Quitar este equipo" />}
      <div className="stl-plan-bloque-h">
        <span className="stl-plan-tipo">
          {editable ? <InlineSelect value={e.tipo ?? ""} options={TIPOS_DE_EQUIPO} editable onCommit={(v) => setEquipo(i, { tipo: v })} ariaLabel="Tipo de equipo" placeholder="Tipo" /> : etiquetaDe(TIPOS_DE_EQUIPO, e.tipo)}
        </span>
        <Editable as="span" className="stl-plan-nombre" editable={editable} value={e.nombre} placeholder="Nombre del equipo (Ventas, Supervisores)…" onCommit={(v) => setEquipo(i, { nombre: v })} />
      </div>
      <div className="stl-props-scroll">
        <table className="stl-props stl-plan-permisos">
          <thead>
            <tr>
              <th />
              {ACCIONES_DE_PERMISO.map((a) => <th key={a.key}>{a.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {OBJETOS_CON_PERMISO.map((o) => {
              const p = e.permisos?.[o.key as ObjetoConPermiso];
              return (
                <tr key={o.key}>
                  <td className="stl-accion-titulo">{o.label}</td>
                  {ACCIONES_DE_PERMISO.map((a) => (
                    <td key={a.key}>
                      <InlineSelect
                        value={p?.[a.key as AccionDePermiso] ?? ""}
                        options={nivelesPermitidos(p, a.key as AccionDePermiso)}
                        editable={editable}
                        placeholder="—"
                        ariaLabel={`${a.label} ${o.label.toLowerCase()}`}
                        onCommit={(v) => setEquipo(i, { permisos: { ...(e.permisos ?? {}), [o.key]: ajustarPermiso(p, a.key as AccionDePermiso, v || "nada") } })}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stl-plan-meta">
        <label className="stl-plan-check"><InlineCheck value={e.tablaDeUsuarios ?? ""} editable={editable} onCommit={(v) => setEquipo(i, { tablaDeUsuarios: v })} ariaLabel="Ve la tabla de usuarios" /> Ve la tabla de usuarios</label>
        <label className="stl-plan-check"><InlineCheck value={e.exportar ?? ""} editable={editable} onCommit={(v) => setEquipo(i, { exportar: v })} ariaLabel="Puede exportar la base" /> Puede exportar la base</label>
      </div>
    </div>
  );

  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<UsuariosPermisosData>)} placeholder="Quién va a trabajar en HubSpot y qué puede hacer cada equipo…">
      {(editable || equipos.length > 0) && <h3 className="stl-plan-objeto">Equipos y sus permisos</h3>}
      {equipos.map(matriz)}
      {editable && (
        <>
          <AddBtn label="Agregar equipo" onClick={() => set({ equipos: [...conIds(equipos), { id: nuevoIdDeFila(), nombre: "", tipo: "operativo", permisos: {}, tablaDeUsuarios: "no", exportar: "no" }] })} />
          <p className="stl-plan-aviso">Editar no puede llegar más lejos que ver, ni eliminar más que editar: al bajar uno, bajan los que dependen de él. Los superadministradores no van en un equipo: los marcas en la lista de usuarios.</p>
        </>
      )}

      {(editable || usuarios.length > 0) && <h3 className="stl-plan-objeto">Usuarios que trabajarán en HubSpot</h3>}
      {editable && <p className="stl-plan-aviso">Empieza por quien lidera la implementación, sigue con directores y supervisores, y termina con el equipo que opera.</p>}
      {usuarios.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>Correo</th>
                <th>Cargo</th>
                <th>Equipo</th>
                <th>Licencia</th>
                <th className="stl-props-mid">Superadmin</th>
                <th className="stl-props-mid">Champion</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id ?? i}>
                  <td><Celda className="stl-accion-titulo" value={u.nombre} editable={editable} placeholder="Nombre…" onCommit={(v) => setUsuario(i, { nombre: v })} /></td>
                  <td><Celda value={u.apellido} editable={editable} placeholder="Apellido…" onCommit={(v) => setUsuario(i, { apellido: v })} /></td>
                  <td><Celda value={u.correo} editable={editable} placeholder="correo@…" onCommit={(v) => setUsuario(i, { correo: v })} /></td>
                  <td><Celda value={u.cargo} editable={editable} placeholder="Cargo…" onCommit={(v) => setUsuario(i, { cargo: v })} /></td>
                  <td><InlineSelect value={u.equipoId ?? ""} options={opcionesDeEquipo} editable={editable} onCommit={(v) => setUsuario(i, { equipoId: v })} ariaLabel="Equipo" placeholder="Sin equipo" /></td>
                  <td><Celda value={u.licencia} editable={editable} placeholder="Sales Hub Pro…" onCommit={(v) => setUsuario(i, { licencia: v })} /></td>
                  <td className="stl-props-mid"><InlineCheck value={u.superAdmin ?? ""} editable={editable} onCommit={(v) => setUsuario(i, { superAdmin: v })} ariaLabel="Superadministrador" /></td>
                  <td className="stl-props-mid"><InlineCheck value={u.champion ?? ""} editable={editable} onCommit={(v) => setUsuario(i, { champion: v })} ariaLabel="Champion" /></td>
                  {editable && (
                    <td className="stl-props-actions"><RemoveBtn onClick={() => set({ usuarios: removeAt(usuarios, i) })} title="Quitar este usuario" /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && <AddBtn label="Agregar usuario" onClick={() => set({ usuarios: [...conIds(usuarios), { id: nuevoIdDeFila(), nombre: "", apellido: "", correo: "", cargo: "", licencia: "", superAdmin: "no", champion: "no" }] })} />}
      {licencias.length > 0 && (
        <p className="stl-plan-resumen">
          {(() => {
            const n = licencias.reduce((t, l) => t + l.usuarios, 0);
            return `${n} ${n === 1 ? "usuario" : "usuarios"} · ${licencias.map((l) => `${l.usuarios} ${l.licencia}`).join(" · ")}`;
          })()}
        </p>
      )}
      {avisos.length > 0 && (
        <ul className="stl-plan-avisos">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      )}
    </ConIntro>
  );
};

/* ── Por dónde entran los leads ─────────────────────────────────────────────── */

export const CanalesDeEntradaSection: FC<SectionProps<CanalesDeEntradaData>> = ({ data, editable, onChange }) => {
  const d = adoptarCanales(data);
  const canales = d.canales;
  const set = (next: Partial<CanalesDeEntradaData>) => onChange?.({ ...partesDe(data), intro: d.intro, canales: conIds(canales), ...next });
  const setCanal = (i: number, patch: Partial<CanalDeEntrada>) => set({ canales: conIds(replaceAt(canales, i, { ...canales[i], ...patch })) });
  if (!editable && !canales.length) return null;
  const nuevo = (canal: string): CanalDeEntrada => ({ id: nuevoIdDeFila(), canal, responsable: "", atencion: "", pasaA: "", origen: "" });
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<CanalesDeEntradaData>)} placeholder="Por dónde llegan los leads y qué pasa con cada uno…">
      {canales.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Quién atiende</th>
                <th>Cómo se atiende</th>
                <th>Cómo pasa a otra área</th>
                <th>Origen</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {canales.map((c, i) => (
                <tr key={c.id ?? i}>
                  <td><Celda className="stl-accion-titulo" value={c.canal} editable={editable} placeholder="Canal…" onCommit={(v) => setCanal(i, { canal: v })} /></td>
                  <td><Celda value={c.responsable} editable={editable} placeholder="Persona o equipo…" onCommit={(v) => setCanal(i, { responsable: v })} /></td>
                  <td><Celda className="stl-props-desc" value={c.atencion} editable={editable} placeholder="Los pasos, uno por renglón…" onCommit={(v) => setCanal(i, { atencion: v })} /></td>
                  <td><Celda value={c.pasaA} editable={editable} placeholder="Por correo, por asignación en HubSpot…" onCommit={(v) => setCanal(i, { pasaA: v })} /></td>
                  <td><OrigenChip value={c.origen} editable={editable} onCommit={(v) => setCanal(i, { origen: v })} /></td>
                  {editable && (
                    <td className="stl-props-actions">
                      <span className="stl-plan-pie">
                        <Mover rotulo="el canal" puedeIzq={i > 0} puedeDer={i < canales.length - 1} onIzq={() => set({ canales: mover(canales, i, -1) })} onDer={() => set({ canales: mover(canales, i, 1) })} />
                        <RemoveBtn onClick={() => set({ canales: removeAt(canales, i) })} title="Quitar este canal" />
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <div className="stl-plan-acciones">
          <AddBtn label="Agregar canal" onClick={() => set({ canales: [...conIds(canales), nuevo("")] })} />
          {!canales.length && (
            <button type="button" className="stl-plan-mini" onClick={() => set({ canales: CANALES_DE_SIEMPRE.map(nuevo) })}>
              Empezar con los canales de siempre
            </button>
          )}
        </div>
      )}
    </ConIntro>
  );
};

/* ── Formularios ────────────────────────────────────────────────────────────── */

export const FormulariosSection: FC<SectionProps<FormulariosData>> = ({ data, ctx, editable, onChange }) => {
  const d = adoptarFormularios(data);
  const items = d.items;
  const set = (next: Partial<FormulariosData>) => onChange?.({ ...partesDe(data), intro: d.intro, items: conIds(items), ...next });
  const setItem = (i: number, patch: Partial<Formulario>) => set({ items: conIds(replaceAt(items, i, { ...items[i], ...patch })) });
  if (!editable && !items.length) return null;
  const propiedades = ctx.planificacion?.propiedades;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<FormulariosData>)} placeholder="Los formularios que se van a crear y qué pide cada uno…">
      <div className="stl-plan-cards">
        {items.map((f, i) => {
          const campos = camposContraPropiedades(f.campos, propiedades);
          const opciones = propiedadesParaFormulario(propiedades, f.objeto);
          const setCampo = (j: number, patch: Partial<CampoDeFormulario>) => setItem(i, { campos: replaceAt(f.campos, j, { ...f.campos[j], ...patch }) });
          const faltan = campos.filter((c) => c.falta).length;
          return (
            <div key={f.id ?? i} className={`stl-plan-card stl-item${faltan || normalizarSupuesto(f.origen) ? " stl-plan-card--aviso" : ""}`}>
              {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} title="Quitar este formulario" />}
              <div className="stl-plan-card-h">
                <div>
                  <Editable as="div" className="stl-plan-card-t" editable={editable} value={f.nombre} placeholder="Nombre del formulario (Formulario · Sitio web)…" onCommit={(v) => setItem(i, { nombre: v })} />
                  {(editable || f.donde) && <Editable as="div" className="stl-plan-fuente" editable={editable} value={f.donde ?? ""} placeholder="Dónde vive (sitio web, anuncio de Meta)…" onCommit={(v) => setItem(i, { donde: v })} />}
                </div>
                <OrigenChip value={f.origen} editable={editable} onCommit={(v) => setItem(i, { origen: v })} />
              </div>
              <ul className="stl-plan-campos-form">
                {campos.map((c, j) => (
                  <li key={`${c.propiedadId ?? c.etiqueta}-${j}`} className={c.falta ? "stl-plan-falta" : undefined}>
                    {editable && opciones.length > 0 ? (
                      <InlineSelect
                        value={c.propiedadId ?? ""}
                        options={opciones}
                        editable
                        placeholder={c.etiqueta || "Elige una propiedad"}
                        ariaLabel="Propiedad que pide el campo"
                        onCommit={(v) => setCampo(j, { propiedadId: v || undefined, etiqueta: opciones.find((o) => o.value === v)?.label ?? c.etiqueta })}
                      />
                    ) : (
                      <Editable as="span" editable={editable} value={c.vigente} placeholder="Campo…" onCommit={(v) => setCampo(j, { etiqueta: v, propiedadId: undefined })} />
                    )}
                    {editable ? (
                      <label className="stl-plan-check"><InlineCheck value={c.obligatorio ?? ""} editable onCommit={(v) => setCampo(j, { obligatorio: v })} ariaLabel="Obligatorio" /> Obligatorio</label>
                    ) : (
                      isSi(c.obligatorio ?? "") && <span className="stl-plan-oblig">Obligatorio</span>
                    )}
                    {c.falta && <span className="stl-plan-oblig">Ya no está en las propiedades</span>}
                    {editable && <RemoveBtn onClick={() => setItem(i, { campos: removeAt(f.campos, j) })} title="Quitar este campo" />}
                  </li>
                ))}
              </ul>
              {editable && (
                <button type="button" className="stl-plan-mini" onClick={() => setItem(i, { campos: [...f.campos, { etiqueta: "", obligatorio: "no" }] })}>+ Campo</button>
              )}
              <dl className="stl-plan-campos">
                <Campo rotulo="Al enviarlo" value={f.alEnviar} editable={editable} placeholder="Qué pasa: la automatización que dispara…" onCommit={(v) => setItem(i, { alEnviar: v })} />
              </dl>
            </div>
          );
        })}
      </div>
      {editable && (
        <AddBtn
          label="Agregar formulario"
          onClick={() => set({ items: [...conIds(items), { id: nuevoIdDeFila(), nombre: "", objeto: "Contacto", donde: "", campos: [], alEnviar: "", origen: "" }] })}
        />
      )}
      {editable && !propiedades?.length && <p className="stl-plan-aviso">Cuando la sección de propiedades tenga filas, los campos se eligen de ahí.</p>}
    </ConIntro>
  );
};

const normalizarSupuesto = (o?: string) => (o ?? "").trim().toLowerCase().startsWith("supuest");

/* ── Cotizaciones ───────────────────────────────────────────────────────────── */

export const CotizacionesSection: FC<SectionProps<CotizacionesData>> = ({ data, editable, onChange }) => {
  const d = adoptarCotizaciones(data);
  const set = (next: Partial<CotizacionesData>) => onChange?.({ ...partesDe(data), ...d, ...next });
  if (!editable && !lleno(d.propiedades) && !lleno(d.formato) && !lleno(d.ajustes)) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<CotizacionesData>)} placeholder="Cómo se van a armar las cotizaciones en HubSpot…">
      <div className="stl-plan-card">
        <div className="stl-plan-card-h">
          <span />
          <OrigenChip value={d.origen} editable={editable} onCommit={(v) => set({ origen: v })} />
        </div>
        <dl className="stl-plan-campos stl-plan-campos--ancho">
          <Campo rotulo="Propiedades" value={d.propiedades} editable={editable} placeholder="Lo que lleva cada cotización (productos, descuento, vigencia)…" onCommit={(v) => set({ propiedades: v })} />
          <Campo rotulo="Formato" value={d.formato} editable={editable} placeholder="La plantilla: logo, términos, firma…" onCommit={(v) => set({ formato: v })} />
          <Campo rotulo="Ajustes" value={d.ajustes} editable={editable} placeholder="Aprobaciones, numeración, moneda…" onCommit={(v) => set({ ajustes: v })} />
        </dl>
      </div>
    </ConIntro>
  );
};

/* ── Informes y paneles ─────────────────────────────────────────────────────── */

export const InformesSection: FC<SectionProps<InformesData>> = ({ data, editable, onChange }) => {
  const d = adoptarInformes(data);
  const items = d.items;
  const set = (next: Partial<InformesData>) => onChange?.({ ...partesDe(data), intro: d.intro, items: conIds(items), ...next });
  const setItem = (i: number, patch: Partial<Informe>) => set({ items: conIds(replaceAt(items, i, { ...items[i], ...patch })) });
  if (!editable && !items.length) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<InformesData>)} placeholder="Los informes y paneles que se van a construir…">
      {items.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Qué mide</th>
                <th>Cada cuánto</th>
                <th>Área</th>
                <th>Objetivo</th>
                <th>Origen</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.id ?? i}>
                  <td><Celda className="stl-accion-titulo" value={x.nombre} editable={editable} placeholder="Negocios en el pipeline…" onCommit={(v) => setItem(i, { nombre: v })} /></td>
                  <td><Celda className="stl-props-desc" value={x.mide} editable={editable} placeholder="Qué cuenta y cómo…" onCommit={(v) => setItem(i, { mide: v })} /></td>
                  <td><Celda value={x.frecuencia} editable={editable} placeholder="Semanal…" onCommit={(v) => setItem(i, { frecuencia: v })} /></td>
                  <td><Celda value={x.area} editable={editable} placeholder="Ventas…" onCommit={(v) => setItem(i, { area: v })} /></td>
                  <td><Celda value={x.objetivo} editable={editable} placeholder="OBJ-01" onCommit={(v) => setItem(i, { objetivo: v })} /></td>
                  <td><OrigenChip value={x.origen} editable={editable} onCommit={(v) => setItem(i, { origen: v })} /></td>
                  {editable && (
                    <td className="stl-props-actions"><RemoveBtn onClick={() => set({ items: removeAt(items, i) })} title="Quitar este informe" /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && <AddBtn label="Agregar informe" onClick={() => set({ items: [...conIds(items), { id: nuevoIdDeFila(), nombre: "", mide: "", frecuencia: "", area: "", objetivo: "", origen: "" }] })} />}
    </ConIntro>
  );
};
