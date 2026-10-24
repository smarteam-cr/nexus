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
  descarta, y al confirmar Nexus escribe 9 propiedades `nexus_*` en HubSpot.

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

   El TAM queda en `tam__potencial`, con su fuente y su fecha. La fórmula la valida Elías («Lo que decides tú» 20).
3. **Cada dato tiene un dueño y una fuente.** Por dato se guarda: el valor, de dónde salió (la investigación, HubSpot,
   una persona o el test), quién y cuándo. Una sola regla dice quién manda en cada uno.
4. **Proponer es fácil; decidir también.**
   - **La IA o cualquier persona del equipo** puede proponer un cambio a un dato de la empresa.
   - **La propuesta se ve en la ficha, al lado del dato,** con quién la hizo, por qué (la cita o la fuente) y tres
     botones: «Usar», «Editar» y «Descartar».
   - **Cualquier dato se edita a mano** con un clic.
   - **Quién decide:** el encargado de la cuenta, o el vendedor en un prospecto. Otra persona solo propone. Las
     propuestas pendientes se cuentan en la ficha («3 datos por revisar»); no se suman a «Por decidir» de Tareas, para no
     cargar a nadie.
   - Es el mismo patrón que ya usa la ficha; se extiende a todos los datos de la empresa.
5. **Las propiedades se hacen para reportar:**
   - todo lo que se quiera agrupar, filtrar o graficar es una lista, un número o una fecha, nunca texto libre;
   - los textos largos (a qué se dedica, el dolor) siguen como texto, para leer y no para reportar;
   - las propiedades nuevas van en un grupo propio de HubSpot, «Nexus · Empresa», con una descripción que dice que las
     escribe Nexus y de dónde salen.
6. **HubSpot en los dos sentidos, sin pisar a Ventas:**
   - lo que manda Nexus (TAM, perfil, escala, tráfico, Insider) se escribe siempre;
   - lo estándar (industria, empleados, facturación, país) se escribe solo si en HubSpot está vacío, o cuando el
     encargado acepta la propuesta;
   - lo que alguien cambia en HubSpot vuelve a Nexus en la copia de cada hora y, si choca con lo de Nexus, aparece como
     propuesta.

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
| Tráfico del sitio | `nexus_trafico` (nueva) | lista por rangos | el vendedor, con propuesta | escribe |
| Base con consentimiento | `nexus_base_consentimiento` (nueva) | lista por rangos | el vendedor, con propuesta | escribe |
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
   - Crear el grupo «Nexus · Empresa» y las propiedades nuevas con sus opciones, con un script en simulacro primero.
   - Ajustar las descripciones de las que existen.
   - Revisar con Elías los rangos de tráfico y de base, y las opciones de cada lista.
2. **Los datos en la empresa de Nexus:**
   - las columnas con su fuente y su fecha (SQL aditivo);
   - la carga inicial desde HubSpot y desde las 14 investigaciones de las preventas;
   - la tabla de la industria a la edición de la escala.
3. **La investigación en la empresa:**
   - mudarla de la preventa a la empresa, con su fecha y sus fuentes, y que la preventa la lea de ahí;
   - sumar las contrataciones y el tamaño estimado;
   - el botón «Actualizar la investigación».
4. **El TAM:** la fórmula validada por Elías, calculada por Nexus para cada empresa, con su explicación a la vista y la
   escritura en `tam__potencial`.
5. **Proponer y decidir:**
   - el diseño de la sección «Datos de la empresa» de la ficha en Claude Design (pantalla interna);
   - cada dato con su valor, su fuente y su fecha, la propuesta al lado (de quién y por qué), y «Usar», «Editar» y
     «Descartar»;
   - el contador de lo que falta revisar.
6. **El espejo con HubSpot:**
   - un solo módulo con la tabla de arriba, que reemplaza las cinco listas de lectura de hoy;
   - escribe según la regla de cada dato, y lo que cambia en HubSpot vuelve como propuesta.
7. **Los reportes:** tres o cuatro reportes base y un tablero «Cartera por potencial» en HubSpot, armados con Elías.

## Cuidados

- Crear propiedades en HubSpot es escribir en el portal de producción: va con simulacro y con el sí de Elías.
- Ninguna propiedad estándar se pisa sin regla: si HubSpot tiene un dato, Nexus solo lo propone.
- Un dato con fuente «persona» no lo cambia la IA: lo propone, y decide el encargado.
- La investigación no inventa cifras: lo que no encuentra queda vacío y se pregunta (B1).
