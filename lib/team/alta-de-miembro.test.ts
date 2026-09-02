/**
 * lib/team/alta-de-miembro.test.ts — LAS CUATRO FORMAS EN QUE UN ALTA FALLA SIN AVISAR.
 *
 * Las cuatro son silenciosas, y ésa es la razón de que estén acá y no en una revisión: ninguna
 * produce un error en el momento. El alta devuelve 201, la fila aparece en /team, y el problema se
 * manifiesta en otra pantalla, en otro momento, y para otra persona.
 *
 * ⚠ Antes de esta tanda NO había un solo test sobre el alta: ni invariante sobre TeamMember/AppUser,
 * ni censo de rutas que cubriera /api/team, ni conteo de endpoints. La única defensa era que el
 * único camino fuera un script que corría a mano.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  altaDeMiembro,
  validarAlta,
  ROLES_DE_EQUIPO,
  DOMINIO_DEL_EQUIPO,
  type DatosDeAlta,
  type MiembroPrevio,
} from "./alta-de-miembro";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const ALTA: DatosDeAlta = {
  name: "Persona Nueva",
  email: "pnueva@smarteamcr.com",
  area: "CSE",
  roleEnum: "CSE",
};

/** Cliente de mentira que registra QUÉ tablas se escribieron y si fue dentro de la transacción. */
function dbFalsa(previo: MiembroPrevio | null) {
  const escrituras: string[] = [];
  const tx = {
    teamMember: {
      upsert: async () => {
        escrituras.push("teamMember");
        return { id: "m1", name: ALTA.name, email: ALTA.email, area: ALTA.area, roleEnum: ALTA.roleEnum };
      },
    },
    appUser: {
      upsert: async () => {
        escrituras.push("appUser");
        return { id: "a1" };
      },
    },
  };
  const db = {
    teamMember: { findUnique: async () => previo, upsert: tx.teamMember.upsert },
    appUser: { upsert: tx.appUser.upsert },
    $transaction: async (fn: (t: typeof tx) => unknown) => {
      escrituras.push("«abre transacción»");
      return fn(tx);
    },
  };
  return { db, escrituras };
}

describe("⭐ un alta escribe LAS DOS filas, o la persona no puede entrar", () => {
  /**
   * LA guarda de este módulo. `POST /api/team` creaba solo el `TeamMember` y devolvía 201: el
   * Super Admin veía la fila en la tabla y daba el alta por hecha, mientras el callback de OAuth
   * hacía `signOut` y rebotaba a `/?error=not_member` — porque sin `AppUser` con `kind:"INTERNAL"`
   * el login se rechaza aunque el correo sea del dominio.
   *
   * La edición que la pone en rojo: borrar el `appUser.upsert` del módulo «porque el login ya
   * valida por correo». Nada más se pone rojo, y el alta sigue devolviendo 201.
   */
  it("⛔ escribe el perfil Y el AppUser del login", async () => {
    const { db, escrituras } = dbFalsa(null);
    const r = await altaDeMiembro(db as never, ALTA);
    expect(r.ok).toBe(true);
    expect(escrituras, "falta una de las dos mitades: el alta queda a medias").toContain("teamMember");
    expect(escrituras, "sin AppUser INTERNAL el login rechaza a esta persona").toContain("appUser");
  });

  it("⛔ y las dos van en UNA transacción", async () => {
    /* Sueltas —como estaban en el script— la segunda puede fallar sola: `AppUser.teamMemberId` es
       `@unique`, así que un AppUser previo apuntando a esa persona con otro correo tira P2002 y
       deja el TeamMember creado sin login. Y nada lo detecta después: no hay invariante de paridad
       entre las dos tablas. */
    const { db, escrituras } = dbFalsa(null);
    await altaDeMiembro(db as never, ALTA);
    expect(escrituras[0], "las filas se escriben fuera de la transacción").toBe("«abre transacción»");
  });

  it("y dice la verdad de lo que hizo: nueva vs. actualizada", async () => {
    const nueva = await altaDeMiembro(dbFalsa(null).db as never, ALTA);
    expect(nueva.ok && nueva.eraNuevo).toBe(true);
    const previa: MiembroPrevio = { name: "Persona Nueva", area: "CSE", roleEnum: "CSE", deactivatedAt: null };
    const otra = await altaDeMiembro(dbFalsa(previa).db as never, ALTA);
    expect(otra.ok && otra.eraNuevo).toBe(false);
  });
});

describe("⛔ reactivar es un acto, no un efecto colateral", () => {
  /**
   * La baja es BLANDA, así que «dar de alta» a alguien que ya estuvo es devolverle el acceso. El
   * script lo hacía SIEMPRE, y su única señal era una línea impresa en el dry-run del CLI — que
   * sobre HTTP no existe. Un apellido repetido o un typo le devolvía la cartera entera a un
   * ex-empleado sin que ninguna pantalla lo dijera, y de paso borraba el motivo de la baja.
   *
   * La edición que la pone en rojo: sacar el `&& !datos.reactivar` de la validación.
   */
  const deBaja: MiembroPrevio = {
    name: "Ex Empleado",
    area: "CSE",
    roleEnum: "CSE",
    deactivatedAt: new Date("2026-01-15"),
  };

  it("⭐ sin pedirlo, no vuelve — y el motivo lo dice", () => {
    const r = validarAlta({ ...ALTA, name: "Ex Empleado" }, deBaja);
    expect(r?.motivo).toBe("dado_de_baja");
    expect(r?.mensaje, "el rechazo no explica qué pasó: en pantalla es un callejón").toContain("dada de baja");
  });

  it("…y pidiéndolo, entra y se dice que fue una reactivación", async () => {
    const { db } = dbFalsa(deBaja);
    const r = await altaDeMiembro(db as never, { ...ALTA, reactivar: true });
    expect(r.ok && r.seReactivo).toBe(true);
  });

  it("una persona activa no dispara la bifurcación", () => {
    const activa: MiembroPrevio = { name: "Alguien", area: "CSE", roleEnum: "CSE", deactivatedAt: null };
    expect(validarAlta(ALTA, activa)).toBeNull();
  });
});

describe("⛔ el dominio se valida ANTES de escribir", () => {
  /* El login exige el dominio exacto. Sin este chequeo, un typo como `@smarteamcr.co` o un correo
     personal escribe las dos filas sin protestar y la persona choca contra `?error=domain`; y
     corregirlo después deja una fila huérfana, porque el correo es la llave de todo. */
  it("⭐ un correo de otro dominio se rechaza, y el motivo explica por qué", () => {
    const r = validarAlta({ ...ALTA, email: "alguien@gmail.com" }, null);
    expect(r?.motivo).toBe("dominio_ajeno");
    expect(r?.mensaje).toContain(DOMINIO_DEL_EQUIPO);
  });

  it("y el typo del dominio también — es el caso realista", () => {
    expect(validarAlta({ ...ALTA, email: "pnueva@smarteamcr.co" }, null)?.motivo).toBe("dominio_ajeno");
  });

  it("un rol que no existe se rechaza acá, no en Prisma", () => {
    /* Prisma rechaza el enum recién AL ESCRIBIR, y un default silencioso deja a la persona con
       menos acceso del que se le quiso dar — o con más. */
    const r = validarAlta({ ...ALTA, roleEnum: "SUPERADMIN" as never }, null);
    expect(r?.motivo).toBe("rol_invalido");
  });

  it("y el área vacía también: es el eje con el que se clasifican las sesiones", () => {
    expect(validarAlta({ ...ALTA, area: "  " }, null)?.motivo).toBe("area_vacia");
  });

  it("los siete roles del enum están, y ninguno de más", () => {
    expect([...ROLES_DE_EQUIPO].sort()).toEqual(
      ["ADMIN", "CSE", "CSL", "DEV", "MARKETING", "SUPER_ADMIN", "VENTAS"],
    );
  });
});

describe("⛔ la puerta del alta es el ROL, no una celda delegable", () => {
  /**
   * ⭐ LA GUARDA MÁS IMPORTANTE DEL ARCHIVO, y la que falla más callada: con el gate equivocado la
   * pantalla se ve idéntica y ningún test se pone rojo.
   *
   * `guardCapability("manageTeam")` mapea a la celda `equipo.manage`, que es DELEGABLE: un Super
   * Admin puede prendérsela a cualquier rol desde la pestaña «Plantillas por rol» de esta misma
   * página, o a una persona suelta por override. Con ese gate, alguien que recibió la celda
   * prestada podía crear un miembro con rol SUPER_ADMIN — y como el alta ahora también crea el
   * `AppUser`, esa identidad ENTRA. Cada paso está permitido por separado, así que la escalada no
   * dispara ninguna alerta.
   *
   * La edición que la pone en rojo: volver el guard del POST a `guardCapability("manageTeam")`.
   */
  const ruta = () => leer("app/api/team/route.ts");

  it("⭐ el POST exige SUPER_ADMIN por rol", () => {
    const src = ruta();
    const i = src.indexOf("export async function POST");
    expect(i, "se movió el POST: la guarda no mira nada").toBeGreaterThan(0);
    const tramo = src.slice(i, i + 400);
    expect(tramo, "el alta volvió a un gate delegable: se puede escalar a Super Admin").toContain(
      'guardRole("SUPER_ADMIN")',
    );
    expect(tramo).not.toContain("guardCapability");
  });

  it("⛔ y el cuerpo es estricto: la clave `role` legacy ya no se traga", () => {
    /* El endpoint viejo aceptaba `role` y lo escribía en `area` (herencia del rename de la
       columna). Un formulario que mandara `{ role: "SUPER_ADMIN" }` pensando en el permiso
       guardaba ese texto en el eje de ANÁLISIS y dejaba el rol real en CSE, con un 201 y la fila
       en pantalla. Con `strictObject` esa clave es un 400. */
    const src = ruta();
    expect(src).toContain("z.strictObject");
    expect(src, "volvió el alias que escribía el ROL en el campo de ÁREA").not.toContain(
      "(area ?? role)",
    );
  });

  it("⛔ y el endpoint NO reimplementa el alta: la delega al módulo", () => {
    /* Un segundo camino de escritura acá no sería interfaz duplicada: sería un alta a medias,
       porque la mitad que se olvida es siempre la misma. */
    const src = ruta();
    expect(src).toContain("altaDeMiembro(prisma");
    expect(src, "el endpoint volvió a escribir la tabla por su cuenta").not.toContain(
      "prisma.teamMember.create",
    );
  });

  it("⛔ y el script usa EL MISMO módulo, no su propia copia", () => {
    /* Si divergen, el CLI y la pantalla aceptan cosas distintas — y la que se usa a mano es la que
       nadie revisa. */
    const src = leer("scripts/create-team-member.ts");
    expect(src).toContain("altaDeMiembro");
    expect(src, "el script volvió a escribir las filas por su cuenta").not.toContain(
      "prisma.appUser.upsert",
    );
  });
});
