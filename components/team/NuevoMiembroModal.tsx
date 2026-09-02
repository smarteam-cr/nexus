"use client";

/**
 * components/team/NuevoMiembroModal.tsx — el alta de una persona, desde la pantalla.
 *
 * Hasta hoy el alta se hacía SOLO por script, y el EmptyState de /team lo decía. El endpoint
 * existía pero no lo llamaba nadie, y creaba media persona: el perfil sin el `AppUser` del login.
 *
 * ⛔ Este formulario lo ve únicamente un SUPER_ADMIN, y el gate de verdad NO es éste: es
 * `guardRole("SUPER_ADMIN")` en el endpoint. Esconder el botón no protege nada — elegir el rol de
 * alguien es administrar permisos, y eso en este repo no se delega ni con `equipo.manage`.
 *
 * ⚠ Los dos campos se llaman parecido y significan cosas opuestas, así que el formulario lo dice
 * en vez de asumirlo: ROL es el permiso (qué puede hacer) y ÁREA es el eje de análisis de sesiones
 * (con qué sombrero trabaja). El endpoint viejo los confundía y escribía el rol en el área.
 */

import { useState } from "react";
import { Modal, Button, Field, Input, Select, Alert, useToast } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { ROLE_OPTIONS, AREA_OPTIONS } from "./roles-ui";

export default function NuevoMiembroModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Refetch de la lista: el revalidate del servidor NO refresca esta tabla. */
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("CSE");
  const [roleEnum, setRoleEnum] = useState("CSE");
  const [guardando, setGuardando] = useState(false);
  /**
   * El caso «ya estuvo y está dada de baja». Es un estado propio y no un toast porque la respuesta
   * exige una decisión: reactivar le devuelve a esa persona el acceso a la cartera entera.
   */
  const [dadoDeBaja, setDadoDeBaja] = useState<string | null>(null);

  async function guardar(reactivar: boolean) {
    setGuardando(true);
    try {
      const r = await fetchJson<{ member: { name: string }; seReactivo: boolean }>("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, area, roleEnum, ...(reactivar ? { reactivar } : {}) }),
      });
      toast.success(
        r.seReactivo
          ? `${r.member.name} vuelve al equipo`
          : `${r.member.name} ya puede entrar con su cuenta de Google`,
      );
      onCreated();
      onClose();
    } catch (e) {
      /* El 409 de «dada de baja» no es un error que se avisa y se olvida: es una bifurcación. */
      if (e instanceof ApiError && e.status === 409) setDadoDeBaja(e.message);
      else toast.error(e instanceof ApiError ? e.message : "No se pudo dar de alta");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo miembro del equipo"
      description="Queda habilitada para entrar con su cuenta de Google del dominio. El rol decide qué puede ver y hacer."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          {dadoDeBaja ? (
            <Button variant="primary" loading={guardando} onClick={() => guardar(true)}>
              Reactivar de todas formas
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={guardando}
              disabled={!name.trim() || !email.trim()}
              onClick={() => guardar(false)}
            >
              Dar de alta
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {dadoDeBaja && (
          <Alert variant="warning" title="Esa persona ya estuvo en el equipo">
            {dadoDeBaja}
          </Alert>
        )}

        <Field label="Nombre y apellido">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre Apellido"
            autoFocus
          />
        </Field>

        <Field
          label="Correo"
          hint="Tiene que ser del dominio del equipo: es la llave con la que entra."
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              /* Cambiar el correo cambia de persona: la bifurcación de reactivación ya no aplica. */
              if (dadoDeBaja) setDadoDeBaja(null);
            }}
            placeholder="persona@smarteamcr.com"
          />
        </Field>

        <Field label="Rol (permiso)" hint="Qué puede ver y hacer dentro de Nexus.">
          <Select value={roleEnum} onChange={(e) => setRoleEnum(e.target.value)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Área (análisis)"
          hint="Con qué sombrero trabaja. No da permisos: se usa para clasificar sesiones."
        >
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            {AREA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
