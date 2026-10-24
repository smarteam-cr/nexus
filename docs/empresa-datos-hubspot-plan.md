# Los datos de la empresa, su investigación y HubSpot — plan

> Pedido de Elías del 2026-10-23. Es el paso uno del roadmap (área R: R1, R2 y R5, con B1 adentro). Pide cuatro cosas:
> - que la investigación viva en la empresa;
> - que Nexus llene el TAM, porque el equipo no tiene el criterio para definirlo;
> - que la gente pueda proponer cambios y el usuario los vea y los edite, de forma muy sencilla;
> - que las propiedades de HubSpot sirvan para hacer reportes.
>
> Revisado contra la base de producción y las propiedades del portal de Smarteam el mismo día. **Nada construido.** El
> plan general de la arquitectura es `docs/arquitectura-empresa-plan.md`.

## Lo que hay hoy

**En Nexus** (200 empresas):
- **El TAM** (`tamUsd`) está vacío en todas.
- **La industria** vive en cinco lugares sin regla de cuál manda.
- **El tamaño** se lee de HubSpot en vivo y no se guarda.
- **La investigación web** («Radiografía»: sector, herramientas, hitos con su enlace) vive dentro de la preventa: hay 14
  de 20 preventas con ella.
- **La ficha** (`Client.ficha`) ya tiene el patrón de propuesta y confirmación: la IA propone un campo, el CSE lo usa o lo
  descarta, y al confirmar Nexus escribe en HubSpot 8 propiedades `nexus_*` (7 de texto y una lista) y 2 notas. Aparte,
  escribe `siguiente_paso_<equipo>` en empresas, negocios y proyectos.
- **La copia de las empresas desde HubSpot no existe:** hoy nada trae a Nexus, cada hora, lo que cambia en la empresa de
  HubSpot.

**En HubSpot**, propiedades de la empresa que ya existen:

| Propiedad | Tipo | Sirve para reportes |
|---|---|---|
| `tam__potencial` «TAM \| Potencial $» | número | Sí. Nadie la llena |
| `industria__smarteam_` «Industria (Smarteam)» | lista de 17 | Sí |
| `industry`, `hs_industry_group` | lista de HubSpot | Sí |
| `numberofemployees`, `hs_employee_range` | número, rango | Sí |
| `annualrevenue`, `hs_revenue_range` | número, rango | Sí |
| `country` | texto | A medias |
| `nexus_apertura_asesoria` | lista (alta, media, baja, sin evaluar) | Sí |
| `nexus_a_que_se_dedica`, `nexus_dolor_principal`, `nexus_retos_estrategicos`, `nexus_stakeholders`, `nexus_resultados_que_persigue`, `nexus_oportunidades_futuras`, `nexus_herramientas_actuales` | texto libre | **No:** un texto libre no se agrupa en un reporte |
| `nexus` | sí o no | Sí |

## Decisiones

1. **La investigación vive en la empresa.**
   - Cada investigación queda guardada en la empresa con su fecha y sus fuentes: el sitio, las noticias, la industria,
     los hitos, las contrataciones y el tamaño estimado.
   - La preventa, la propuesta, el diagnóstico y los agentes la leen de ahí.
   - Se rehace cuando vence (cada 6 meses) o cuando alguien pide «Actualizar la investigación».
   - Las 14 de las preventas se mudan a sus empresas.
2. **Nexus calcula el TAM** con la investigación y una fórmula escrita, y dice cómo lo calculó. La propuesta inicial de
   la fórmula es lo que Smarteam le podría vender a esa empresa en un año:
   - las licencias de HubSpot según su tamaño y los hubs que le sirven;
   - Insider si califica;
   - los servicios (implementación y recurrente) según su escala, a la tarifa de su segmento.

   El TAM queda en `tam__potencial`, con su fuente y su fecha. **Fórmula validada por Elías el 2026-10-23.** Va en dos
   versiones:
   - **TAM v1, en el paso uno** (Elías, 2026-10-24): sale de cómo es la empresa: su tamaño (empleados), si es casa
     matriz o filial (y cuántas filiales tiene), su industria y su modelo de negocio. Con eso, las licencias de HubSpot
     que le corresponden por tamaño y por los hubs que le sirven, a precio de lista, e Insider si califica. **Los
     servicios todavía no suman:** los precios los fija Ventas hasta que existan las actividades, y no se usa un monto
     por nivel de la escala. El TAM dice «estimado v1».
   - **Lo que la empresa ya paga de licencias** sale de su portal, por Client Partners
     (`docs/integracion-hubspot-partners-plan.md`); el TAM muestra al lado lo que ya tiene y lo que le falta.
   - **TAM v2, después de A2:** suma los servicios, con las horas de las actividades.
   - En Nexus se reusan `Client.tamUsd` y `Client.industry`, y se les suma la fuente y la fecha; la etapa 2 suma la
     columna **segmento** (estándar, corporativo o gobierno).
   - **Antes del código, se enmienda DECISIONS «Qué ES una empresa: `ClientKind` + TAM (2026-07-24)»**, que hoy dice que
     Nexus no deriva el TAM. Se conservan null distinto de 0 y el techo de 100 millones.
   - **Quién lee `tamUsd` hoy:** `proponerPotencial` (`lib/cs/clasificacion.ts:228-231`) dice «TAM estimado por Ventas»,
     y `app/api/clients/[id]/classification/route.ts` exige `ventas.write` para escribirlo. La razón pasa a decir la
     fuente («calculado por Nexus»), el permiso se ajusta, y antes del `--apply` se muestra cuántas cuentas cambian de
     potencial (la CSL tiene que saberlo).
   - El TAM no entra a la memoria de la cuenta: `lib/memoria/frontera.test.ts:311` ya lo prohíbe, y R11 lo respeta.
3. **Cada dato tiene un dueño y una fuente.** Por dato se guarda: el valor, de dónde salió (la investigación, HubSpot,
   una persona o el test), quién y cuándo. Una sola regla dice quién manda en cada uno.
4. **Proponer es fácil; decidir también.**
   - **La IA o cualquier persona del equipo** puede proponer un cambio a un dato de la empresa.
   - **La propuesta se ve en la ficha, al lado del dato,** con quién la hizo, por qué (la cita o la fuente) y tres
     botones: «Usar», «Editar» y «Descartar».
   - **Cualquier dato se edita a mano** con un clic.
   - **Quién decide** (Elías, 2026-10-24): **el usuario de Nexus que lo está usando, según su rol**, y lo que decide
     se escribe en HubSpot con la sugerencia del agente. El rol sale de una celda nueva, `clientes.decidirDatos`
     (`lib/auth/permissions/registry.ts`, editable en /team); la traen CSE, CSL, Ventas y los super admin (Elías, 2026-10-24). El TAM lo ve solo el equipo, nunca el cliente. Los reportes
     de HubSpot van después: primero, que el usuario escriba en HubSpot. Las
     propuestas pendientes se cuentan en la ficha («3 datos por revisar»); no se suman a «Por decidir» de Tareas, para no
     cargar a nadie.
   - Es el mismo patrón que ya usa la ficha; se extiende a todos los datos de la empresa.
5. **Las propiedades se hacen para reportar:**
   - todo lo que se quiera agrupar, filtrar o graficar es una lista, un número o una fecha, nunca texto libre;
   - los textos largos (a qué se dedica, el dolor) siguen como texto, para leer y no para reportar;
   - las propiedades nuevas van en un grupo propio de HubSpot, «Nexus · Empresa», con una descripción que dice que las
     escribe Nexus y de dónde salen.
6. **HubSpot en los dos sentidos, sin pisar a Ventas:**
   - lo que **calcula** Nexus (TAM, nivel en la escala, Insider, siguiente caso y sus fechas) se escribe siempre;
   - lo que decide una persona (industria, perfil, tráfico, base) y lo estándar (industria, empleados, facturación,
     país) se escribe cuando el usuario, según su rol, usa o edita la propuesta; lo estándar, además, se llena solo si
     en HubSpot está vacío;
   - lo que alguien cambia en HubSpot vuelve a Nexus en la copia de cada hora y, si choca con lo de Nexus, aparece como
     propuesta. **Esa copia no existe:** se crea el job `empresas-hubspot`, cada hora, incremental por
     `hs_lastmodifieddate`, por el transporte de U6 y con bandera. Lleva un filtro de eco: lo que Nexus acaba de
     escribir no vuelve como propuesta.
7. **Dónde viven los datos** (se escribe en DECISIONS antes del código): los valores, en columnas de `Client` con su
   tipo; las propuestas y la procedencia, en una tabla `PropuestaDeDato` (empresa, campo, valor, fuente, autor, cita,
   estado, quién decidió y cuándo, **valor anterior**), no en el Json `Client.ficha`. Esa tabla es también la historia
   que pide R9.

## El catálogo de propiedades

| Dato | Propiedad de HubSpot | Tipo | Manda | Sentido |
|---|---|---|---|---|
| TAM potencial (USD) | `tam__potencial` (existe) | número | Nexus | escribe |
| Cómo se calculó el TAM | `nexus_tam_fuente` (nueva) | lista: investigación, vendedor, CSE | Nexus | escribe |
| Fecha del TAM | `nexus_tam_fecha` (nueva) | fecha | Nexus | escribe |
| Empleados | `numberofemployees` (existe) | número | HubSpot; Nexus si está vacío | los dos |
| Facturación anual | `annualrevenue` (existe) | número | HubSpot; Nexus si está vacío | los dos |
| Industria de Smarteam | `industria__smarteam_` (existe) | lista de 17 | la persona, con propuesta de Nexus | los dos |
| País | `country` (existe) | texto | HubSpot | los dos |
| A quién le vende | `nexus_a_quien_vende` (nueva) | lista: empresas, personas, ambos | la persona, con propuesta | escribe |
| Cómo cierra la venta | `nexus_perfil_cierre` (nueva) | lista: con equipo, transaccional, mixta | la persona, con propuesta | escribe |
| Qué pasa después | `nexus_perfil_despues` (nueva) | lista: una sola compra, recompra, continua | la persona, con propuesta | escribe |
| Tráfico del sitio | `nexus_trafico` (nueva) | lista por rangos | la persona, con propuesta | escribe |
| Base con consentimiento | `nexus_base_consentimiento` (nueva) | lista por rangos | la persona, con propuesta | escribe |
| Califica para Insider | `nexus_califica_insider` (nueva) | lista: lista, casi lista, todavía no, sin evaluar | Nexus (lectura de preparación, N6) | escribe |
| Nivel en Ventas, Marketing y Servicio | `nexus_nivel_ventas`, `nexus_nivel_marketing`, `nexus_nivel_servicio` (nuevas) | lista: los cinco niveles y sin evaluar | Nexus (la última posición confirmada) | escribe |
| Fecha de la posición en la escala | `nexus_escala_fecha` (nueva) | fecha | Nexus | escribe |
| Siguiente caso sugerido | `nexus_siguiente_caso` (nueva) | lista con los casos de la biblioteca | Nexus (R12) | escribe |
| Fecha de la investigación | `nexus_investigacion_fecha` (nueva) | fecha | Nexus | escribe |
| Apertura a la asesoría | `nexus_apertura_asesoria` (existe) | lista | la persona | escribe |

**La industria y la escala:** cada una de las 17 opciones de «Industria (Smarteam)» apunta a una edición de la escala
(Turismo, Inmobiliaria, Educación, Automotriz…) o a la escala general. Así la industria que se elige en HubSpot decide la
edición del test, la exploración y el diagnóstico.

**Los reportes que habilita en HubSpot:**
- el TAM de la cartera por industria, por encargado y por nivel en la escala;
- las empresas que califican para Insider;
- cuántas empresas hay en cada nivel por área;
- el siguiente caso sugerido por empresa, para que Ventas arme su lista de venta cruzada.

## Etapas

1. **El catálogo en HubSpot.**
   - En el paso uno se crean el grupo «Nexus · Empresa» y, ya como listas, números y fechas, **solo las propiedades que
     algo llena ahora**: `nexus_tam_fuente`, `nexus_tam_fecha`, `nexus_investigacion_fecha`, `nexus_a_quien_vende`,
     `nexus_perfil_cierre`, `nexus_perfil_despues`, `nexus_trafico` y `nexus_base_consentimiento`. Con un script en
     simulacro primero y el sí de Elías. Molde: `scripts/hubspot-crear-propiedades-ficha.ts` y
     `hubspot-crear-propiedades-siguiente-paso.ts`.
   - `nexus_nivel_*` y `nexus_escala_fecha` (B2 o N2), `nexus_califica_insider` (N6) y `nexus_siguiente_caso` (R12) se
     crean cuando exista su fuente.
   - Ajustar las descripciones de las que existen.
   - Revisar con Elías los rangos de tráfico y de base, y las opciones de cada lista («Lo que decides tú» 27 del
     roadmap).
2. **Los datos en la empresa de Nexus:**
   - las columnas con su fuente y su fecha, más el segmento (un solo SQL aditivo, con la tabla `PropuestaDeDato` y la
     de la investigación);
   - la carga inicial desde HubSpot y desde las 14 investigaciones de las preventas;
   - la tabla de la industria a la edición de la escala.
   - Pruebas: un motor puro `quienManda(…)` con su unit por fila del catálogo, y una prueba de integración de usar,
     editar y descartar.
3. **La investigación en la empresa** (R5), en dos partes que comparten `lib/exploraciones/agente.ts` y `esquemas.ts`:
   - en el paso uno: mudarla de la preventa a la empresa, con su fecha, sus fuentes, las contrataciones y el tamaño
     estimado, y el botón «Actualizar la investigación»;
   - después de K7 y K1 en `main` (o en la misma sesión que K): que la preventa la lea de ahí.
4. **El TAM:** la fórmula (validada el 2026-10-23), calculada por Nexus para cada empresa, con su explicación a la vista y la
   escritura en `tam__potencial`. Primero el TAM v1 (decisión 2).
5. **Proponer y decidir:**
   - el diseño de la sección «Datos de la empresa» de la ficha en Claude Design (pantalla interna);
   - cada dato con su valor, su fuente y su fecha, la propuesta al lado (de quién y por qué), y «Usar», «Editar» y
     «Descartar»;
   - el contador de lo que falta revisar.
6. **El espejo con HubSpot:**
   - un solo módulo con la tabla de arriba, que reemplaza las cinco listas de lectura de hoy;
   - escribe según la regla de cada dato, y lo que cambia en HubSpot vuelve como propuesta (el job `empresas-hubspot` de
     la decisión 6).
7. **Los reportes** (después): tres o cuatro reportes base y un tablero «Cartera por potencial» en HubSpot, armados con
   Elías.

## Criterio de éxito

- **Completo:** en las empresas activas (con un proyecto activo o una preventa abierta), tamaño, industria (la columna
  `industry`, hoy llena en 47), perfil y TAM («estimado v1») llenos y con su fuente.
- **Igual en HubSpot:** el mismo valor en el 100 %.
- **Creíble:** 8 de cada 10 creíbles en una muestra que revisa su encargado.
- **Usado:** al menos la mitad de las propuestas usadas, editadas o descartadas en 14 días (hoy, en la ficha, 23 de 199).
- **La investigación:** guardada en la empresa, con su fecha y sus fuentes, en las activas.
- «0 propiedades nuevas de texto libre» aplica al catálogo cuando se cree.

## Validado en HubSpot (2026-10-24, solo lectura)

- **Existen** las 7 que el catálogo marca como existentes: `tam__potencial`, `numberofemployees`, `annualrevenue`,
  `industria__smarteam_`, `country` y `nexus_apertura_asesoria`, con su tipo (número, lista o texto).
- **No existen todavía** las 13 marcadas como nuevas (la fuente y la fecha del TAM, el perfil de negocio, el tráfico, la
  base con consentimiento, Insider, el nivel en cada área, la fecha de la escala, el siguiente caso y la fecha de la
  investigación). Se crean en el paso 1, con simulacro.
- Existen además 7 `nexus_*` de texto libre de la ficha (`nexus_a_que_se_dedica`, `nexus_dolor_principal`,
  `nexus_herramientas_actuales`, `nexus_oportunidades_futuras`, `nexus_resultados_que_persigue`,
  `nexus_retos_estrategicos`, `nexus_stakeholders`).

## Cómo pregunta Nexus lo que falta (Elías, 2026-10-24)

Con el mecanismo que ya existe, «Preguntas sobre la cuenta» (`lib/encuestas-de-cuenta/`): al entrar a la ficha de una
empresa, Nexus le pregunta a quien la ve (según su rol) lo que nadie anotó, y la respuesta se escribe en HubSpot. Hoy solo
acepta «Sí / No / No sé». Se le suma:
- respuestas con opciones (los rangos de tráfico, de base, el perfil de negocio);
- que Nexus proponga la respuesta (de la investigación o de las reuniones) y la persona solo confirme o corrija;
- que pregunte solo lo que falta, una cosa por vez, y que no vuelva a preguntar lo que ya está confirmado.

## Cuidados

- Crear propiedades en HubSpot es escribir en el portal de producción: va con simulacro y con el sí de Elías.
- **Escribir en HubSpot** va detrás de la bandera `EMPRESA_HUBSPOT_ESCRITURA=0`; el valor anterior se guarda **solo** en
  `PropuestaDeDato.valorAnterior`, y hay un script de vuelta con simulacro. La primera escritura masiva se hace con 5
  empresas, se mira en HubSpot y después va el resto.
- Ninguna propiedad estándar se pisa sin regla: si HubSpot tiene un dato, Nexus solo lo propone.
- Un dato con fuente «persona» no lo cambia la IA: lo propone, y decide el usuario de Nexus que lo está usando, según
  su rol (2026-10-24).
- La investigación no inventa cifras: lo que no encuentra queda vacío y se pregunta (B1).
