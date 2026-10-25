# La Planificación con lo que pide el Brief de implementación — plan

> Escrito el 2026-10-24 contra el código y contra la hoja «BRIEF DE IMPLEMENTACIÓN» de Smarteam (Google Sheets, 20
> pestañas). **Nada construido.** Amplía L4 («La Planificación como el siguiente entregable») e I2 («Dos plantillas de
> Planificación») del roadmap, y trae al frente «Las tareas que salen de la Planificación», que estaba en «Más
> adelante».

## La idea en una línea

El Brief es lo que el equipo ya llena a mano para configurar HubSpot. La Planificación de Nexus ya tiene la mitad
(procesos, ciclo de vida, propiedades, pipelines, automatizaciones, conversaciones). Le falta la otra mitad del Brief
—usuarios y permisos, canales de entrada, formularios, cotizaciones, importación, informes— y le falta lo que una hoja
de cálculo no puede dar: que **todo cuelgue de la misma tabla de propiedades**, que el cliente llene su parte en el
enlace y que lo planificado se vuelva la lista de construcción.

## Lo que hay hoy

- **La Planificación** (`components/landing/configs/planificacion.defs.ts`, renderer
  `components/landing/sections-planificacion.tsx`, lógica pura en `lib/planificacion/`): portada · cómo van a funcionar
  los procesos · etapas del ciclo de vida · arquitectura · propiedades por objeto (una pestaña por objeto) · pipelines
  con etapas de izquierda a derecha · automatizaciones · conversaciones · rutinas de adopción · despliegue por olas ·
  aprobación. Todo vive en `CanvasBlock` (Json): **sumar secciones no pide SQL.**
- **Cada cosa dice de dónde sale** (acordado en una reunión, propuesta de Smarteam o supuesto).
- **Las propiedades** ya tienen `grupo`, `id`, `autor` y `extra` pensados para las plantillas de Caroline, y
  `fusionarFilas` respeta las filas de una persona al regenerar. Pero el grupo es solo una etiqueta en la fila: no hay
  vista por grupo ni orden de grupos.
- **El agente ya está cerca del tope** (`maxTokens: 21000`, el máximo sin streaming). No se le pueden sumar seis
  secciones más en la misma corrida.

## Cada pestaña del Brief, y dónde queda

| Pestaña del Brief | Hoy en Nexus | Qué propongo |
|---|---|---|
| Aspectos generales (hubs, tipo de hub, sesiones de set up y de capacitación por hub, involucrados de Smarteam y HubSpot, fechas, alcances) | El alcance y los interesados en el Handoff; las fechas en el Cronograma | Portada nueva «Ficha del proyecto»: hubs y edición, sesiones de set up y de capacitación por hub (es L4 etapa 1), quiénes participan. Las fechas se **leen** del Cronograma, no se escriben acá |
| Usuarios + permisos principales | No existe | Sección nueva «Usuarios y permisos» (etapa 2) |
| Historia inicial de usuario (definiciones del ciclo de vida, estado del lead, canalización de leads por canal) | Ciclo de vida, sí. Estado del lead y canales, no | «Estado del lead» como tabla al lado del ciclo de vida, y sección nueva «Por dónde entran tus leads» (etapa 3) |
| Formulario + workflow + filtro | Automatizaciones como lista plana | «Formularios» cuyos campos se eligen de la tabla de propiedades, y automatizaciones con disparador, condición y lo que pasa en cada rama (etapa 3) |
| Chatbot | Conversaciones, sin guion | El guion del bot (saludo y pasos) y quién atiende, dentro de Conversaciones (etapa 4) |
| Propiedades de contacto, empresa, negocios, tickets | Propiedades por objeto | Por objeto → por grupo, con la vista de la ficha como se va a ver en HubSpot (etapa 1) |
| Historia de proceso de ventas (la gestión comercial de hoy) | — | **No entra:** es cómo opera hoy, y eso vive en el Diagnóstico («Cómo operas hoy»). Lo planificado de ventas ya son los procesos y el pipeline |
| Pipelines | Sí, con etapas, cuándo entra y requisitos | Sumar «qué pasa solo en esta etapa» (la automatización de la etapa; en el Brief, la razón de pérdida condicional) (etapa 3) |
| Cotizaciones | No existe | Sección opcional «Cotizaciones» si el alcance trae Sales Hub Pro o más (etapa 4) |
| Plantilla BD (contactos, empresas, negocios, productos) | No existe | «Importación de tus datos»: la plantilla sale **sola** de la tabla de propiedades y se descarga en Excel (etapa 5) |
| KPI's | Las métricas se retiraron (los objetivos viven en el Diagnóstico) | «Informes y paneles» que se van a construir, cada uno atado al objetivo del Diagnóstico que mide (etapa 4) |
| Integraciones | Arquitectura de la solución | Se queda como está |
| Set up básico (checklist técnico) | No existe | La lista de construcción **sale de lo planificado**, no se escribe (etapa 5) |
| Recursos | — | El enlace a la guía en video, en la ayuda de la sección que la necesita |

## Lo que mejora sobre la hoja

1. **Un dato, una vez.** La tabla de propiedades alimenta los campos de los formularios, las condiciones de las
   vistas, los requisitos de cada etapa del pipeline y la plantilla de importación. Se eligen de una lista; si un
   formulario usa una propiedad que no existe, Nexus lo marca. En la hoja, «Motivo de interés» se escribe cuatro veces
   y nada avisa si no coinciden.
2. **La matriz de permisos se llena con cuatro opciones, no con nueve casillas.** Por objeto y acción: Nada · Lo suyo
   · Lo de su equipo · Todo. Y no deja marcar «eliminar» más amplio que «editar» ni «editar» más que «ver», que en la
   hoja se puede.
3. **El cliente llena su parte en el enlace.** Hoy el cliente recibe la hoja para escribir sus usuarios, canales y
   responsables. En Nexus lo escribe en el enlace de la Planificación que ya existe, y el CSE lo ve al instante.
4. **De planificado a construido.** Cada propiedad, pipeline, formulario, automatización y usuario lleva su estado
   (por construir · construido) y su enlace al recurso en HubSpot: es el «Link de recurso» del Brief. Juntos son el
   Set up básico, sin escribirlo aparte.
5. **La ficha se ve antes de configurarla.** La pestaña de cada objeto muestra la barra lateral del registro como va a
   quedar en HubSpot: los grupos en orden y qué propiedades van a la vista. Es lo que el Brief intenta con los colores
   («por defecto ya es visible» y «tarjetas en visualización»).
6. **Se mantiene lo que ya hace bien Nexus:** cada cosa dice de dónde sale, y regenerar no borra lo que escribió una
   persona.

## Etapas

Cada etapa se puede programar y probar sola. Ninguna pide SQL: todo es contenido de la Planificación.

1. **Propiedades por grupos.**
   - Los grupos pasan a ser de primera clase por objeto: con orden, se crean, se renombran y se arrastra una propiedad
     de un grupo a otro.
   - Por propiedad, dos marcas nuevas: «Aparece en la ficha» y «Viene con HubSpot» (las predeterminadas, que en el Brief
     dicen N/A). Las opciones de una lista se editan como lista, una por renglón, no separadas por puntos.
   - Vista previa de la ficha por objeto.
   - Importar una plantilla de propiedades (Excel o la pestaña del Brief) a filas con `autor: "plantilla"`, por la
     fusión que ya existe. Antes: pasar «Mejorar con IA» y el chat por esa misma fusión (pendiente desde el 2 oct; hoy
     borran `id`, `autor` y `extra`).
2. **Usuarios y permisos.**
   - Equipos o divisiones, y los usuarios: nombre, correo, cargo, equipo, licencia que necesita, superadministrador y
     champion.
   - Conjuntos de permisos por equipo, en dos bloques como el Brief (supervisión y operativo): contactos, empresas,
     negocios y tickets × ver, editar y eliminar, con las cuatro opciones; más acceso a la tabla de usuarios y exportar.
   - Cuenta de licencias contra lo vendido: «planificaste 12 asientos de Sales Hub; se vendieron 10».
   - La IA no inventa personas: sugiere equipos y permisos desde las reuniones, y los nombres los escribe el CSE o el
     cliente.
3. **Cómo entra y avanza un lead.**
   - «Estado del lead» como tabla al lado del ciclo de vida, con qué significa cada valor.
   - «Por dónde entran tus leads»: canal, quién atiende, cómo se atiende y cómo pasa a otra área. Cada canal apunta a su
     formulario, a su conversación y a su automatización de asignación.
   - «Formularios»: campos tomados de la tabla de propiedades, con obligatorio.
   - Automatizaciones con disparador, condición, lo que pasa si se cumple y si no, y lo que hay que tener en cuenta; y
     la vista o filtro que deja (propiedad y condición).
   - Pipelines: lo que pasa solo en cada etapa.
4. **Ficha del proyecto y las secciones opcionales.**
   - Portada «Ficha del proyecto»: hubs y edición, sesiones de set up y de capacitación por hub (salen de las
     actividades vendidas cuando existan; mientras, las escribe el CSE), quiénes participan de Smarteam, de HubSpot y
     del cliente. Fechas leídas del Cronograma.
   - Conversaciones con el guion del bot.
   - Cotizaciones (propiedades, formato y ajustes) e «Informes y paneles».
5. **Lo que sale solo de lo planificado.**
   - Estado y enlace al recurso de HubSpot en cada cosa que se construye.
   - La lista de construcción en una vista interna (no va al cliente ni al PDF), y de ahí a Tareas: «crea estas
     propiedades», «arma este pipeline».
   - La plantilla de importación descargable por objeto.
6. **El cliente llena su parte en el enlace.**
   - En el enlace externo, las secciones de usuarios, canales y responsables se pueden editar. Lo que escribe queda
     con `autor: "cliente"` y el CSE lo revisa.
7. **Las dos plantillas** (es I2).
   - Esencial: ficha del proyecto, usuarios y permisos, ciclo de vida y estado del lead, propiedades, pipelines,
     formularios y automatizaciones.
   - Completa: todo lo anterior más procesos, arquitectura, conversaciones, cotizaciones, informes, importación,
     rutinas y olas.

**Más adelante, fuera de este plan:** leer las propiedades que ya tiene el portal del cliente (pide conectar su portal,
que hoy no está) y crearlas en HubSpot desde Nexus (escribe en el portal del cliente: se decide aparte).

## Cómo se programa sin romper nada

- Cada sección nueva sigue la receta del motor de documentos (ARCHITECTURE §1-WEB): su definición en
  `planificacion.defs.ts`, su componente en `sections-planificacion.tsx`, la lectura pura y sus pruebas en
  `lib/planificacion/`, y su entrada en el registro congelado (`lib/landing/registry.test.ts`).
- **El agente no genera todo de una vez.** Las secciones nuevas nacen fuera de la corrida principal: se llenan a mano,
  por importación, por el cliente o con «Mejorar con IA» sección por sección. Así la corrida no pasa el tope de 21.000.
- Las referencias a propiedades van por `id` de fila, no por nombre: renombrar una propiedad no rompe el formulario
  que la usa.
- Las secciones viejas se leen igual que hoy: una planificación ya generada no cambia hasta que alguien la edita.

## Criterio de éxito

Caroline arma la planificación de un cliente nuevo sin abrir la hoja del Brief: el cliente escribe sus usuarios en el
enlace, la plantilla de importación sale sola de las propiedades, y la lista de construcción queda en Tareas.

## Preguntas para Elías

1. [decidido el 2026-10-24] Usuarios y permisos van **dentro** de la Planificación (la que ve el cliente).
2. ¿Traemos los Briefs que ya están llenos de los clientes actuales? La hoja tiene forma fija, así que se puede leer.
3. ¿Con qué cliente probamos primero, y lo prueba Caroline?

## Riesgos

- El documento se alarga y el PDF pesa: por eso las dos plantillas, y todo se puede ocultar.
- La matriz de permisos en el PDF: va como tabla estática, sin interacción.
- Que el cliente edite en el enlace abre escritura externa: cada sección editable por el cliente se habilita una por una
  y con su prueba de que no toca nada más.

## Para el roadmap

Sumar a L4 (o como área propia «La Planificación con el Brief»), con las siete etapas de arriba. Se prueba así:

1. Etapa 1: en la Planificación de un proyecto, pestaña Contacto, crear el grupo «Información de gestión», arrastrar
   «Motivo de interés» a ese grupo y marcarla «Aparece en la ficha» → la vista previa la muestra en ese grupo; regenerar
   la planificación → el grupo y la fila siguen.
2. Etapa 2: marcar «eliminar: Todo» con «editar: Lo suyo» → Nexus no lo deja y dice por qué.
3. Etapa 3: borrar la propiedad «País» que usa el formulario del sitio web → el formulario muestra el aviso.
4. Etapa 5: descargar la plantilla de importación de Contactos → trae una columna por propiedad del objeto, en el
   orden de la ficha.
