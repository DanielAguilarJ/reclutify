# Requirements — Reparación del Centro de Capacitación

## Introducción

El módulo de capacitación (Training Center) de Reclutify está implementado en código pero no funciona de extremo a extremo: la subida de documentos no produce resultados visibles y el flujo completo de capacitación (generar módulos, publicar programa, contratar candidato, acceso del empleado, tutor IA, evaluación) no se completa.

El código de la aplicación existe y está razonablemente completo:

- 13 rutas de API bajo `src/app/api/training/` (documents, programs, generate-modules, publish, versions, hire-candidate, access, bootstrap, chat, start-module, complete-module, evaluate-module, update-progress, save-session).
- Stores de cliente: `src/store/trainingAdminStore.ts` (admin) y `src/store/trainingStore.ts` (aprendiz).
- Páginas de administración: `/admin/training`, `/admin/training/configure/[programId]`, `/admin/training/progress/[employeeId]`.
- Páginas de aprendiz: `/training/[token]`, `/training/center`, `/training/center/module/[moduleId]`.
- Contratos de validación en `src/lib/training/contracts.ts` y autorización en `src/lib/training/auth.ts`.
- 5 migraciones `202607180001`–`202607180005` más `supabase/repair_training_v2.sql`, un script consolidado idempotente que reaplica migraciones, crea el bucket de storage y hace backfill de `org_members`.

Por tanto, el objetivo de esta reparación **no es reescribir la funcionalidad**, sino cerrar la brecha entre el código y su entorno de ejecución (base de datos, storage, RPCs, variables de entorno) y corregir los puntos donde los fallos se ocultan en lugar de reportarse.

## Hallazgos previos (base del diagnóstico)

Estos son los puntos concretos identificados al revisar el código. Se documentan aquí porque condicionan los requisitos.

1. **Fallo silencioso en la subida de documentos.** `POST /api/training/documents` procesa cada archivo de forma independiente y siempre responde `200` con `{ success: true, documents: [...], failures: [...] }`, incluso cuando **todos** los archivos fallaron. La interfaz en `configure/[programId]/page.tsx` solo comprueba `res.ok`, por lo que muestra el toast de éxito "Documentos cargados y procesados" aunque `failures` contenga todos los archivos y `documents` esté vacío. Además, el mensaje de cada fallo se aplana a un texto genérico (`'Could not process training document'`), perdiendo la causa raíz.

2. **Dependencia no verificada del esquema de base de datos.** La ruta de subida inserta en `training_documents` sin `program_id` ni `file_url`. Ambas columnas eran `NOT NULL` en el esquema original (`20260530_training_center.sql`) y solo dejan de serlo cuando se aplica `202607180001_training_v2_foundation.sql`. Si esa migración no está aplicada, cada inserción falla y, por el punto 1, el fallo queda invisible. Lo mismo aplica a las tablas `training_program_documents`, `training_module_documents`, `training_document_chunks` y `training_access_sessions`, todas creadas en esa migración.

3. **Dependencia no verificada del bucket de storage.** La subida escribe en el bucket privado `training-documents`, creado también en `202607180001`. Sin el bucket, `admin.storage.from('training-documents').upload(...)` falla.

4. **Dependencia no verificada de RPCs.** El flujo depende de funciones de Postgres definidas en las migraciones `0002`–`0005`: `hire_training_candidate`, `finalize_training_evaluation`, `complete_training_module_without_evaluation`, `start_training_module`, `detach_training_program_document`. Si faltan, la contratación, la evaluación y el avance de módulos se caen.

5. **Dependencia no verificada de membresía.** Toda la autorización de administración pasa por `requireProgramAdmin` / `requireOrgAdmin`, que exigen una fila en `org_members` con `role IN ('owner','admin')` para el usuario y la organización. Si `org_members` no está poblada para el usuario actual, toda la sección responde `403 Forbidden`.

6. **Posible desalineación en el layout del aprendiz.** `src/app/training/center/layout.tsx` consulta `training_employees` filtrando por `user_id`, columna que no aparece en las migraciones de Training V2 revisadas. Debe verificarse su existencia antes de asumir que la comprobación funciona.

7. **Sin verificar en tiempo de ejecución.** No se pudo inspeccionar el estado real de la base de datos Supabase del proyecto desde el entorno de desarrollo. Los puntos 2–6 son hipótesis fundadas en el código, no hechos confirmados. El primer requisito cubre precisamente esa verificación.

**Corrección tras la implementación.** Los hallazgos 2, 3 y 4 se verificaron y resultaron FALSOS. El archivo `src/lib/database.types.ts`, generado desde el esquema real de Supabase, contiene las tablas `training_document_chunks`, `training_program_documents` y `training_access_sessions`, y declara `training_documents.program_id` y `training_documents.file_url` como nulables. Las migraciones de Training V2 están aplicadas. La causa raíz real es el límite de tamaño de cuerpo de petición de la plataforma de despliegue, documentado en `design.md`, combinado con el fallo silencioso del hallazgo 1.

## Requisitos

### Requisito 1 — Diagnóstico verificable del entorno

**Historia de usuario:** Como administrador, quiero una forma de comprobar si la infraestructura de capacitación (tablas, columnas, bucket, RPCs, membresía) está correctamente instalada, para saber qué falta en lugar de adivinar.

#### Criterios de aceptación

1. CUANDO se ejecute la comprobación de diagnóstico ENTONCES el sistema DEBERÁ verificar la existencia de las tablas `training_programs`, `training_documents`, `training_modules`, `training_employees`, `training_progress`, `training_evaluations`, `training_sessions`, `training_program_documents`, `training_module_documents`, `training_document_chunks`, `training_access_sessions`.
2. CUANDO se ejecute la comprobación ENTONCES el sistema DEBERÁ verificar que `training_documents.program_id` y `training_documents.file_url` admiten `NULL`.
3. CUANDO se ejecute la comprobación ENTONCES el sistema DEBERÁ verificar que existe el bucket de storage `training-documents` y que es privado.
4. CUANDO se ejecute la comprobación ENTONCES el sistema DEBERÁ verificar que existen las funciones `is_training_admin`, `calculate_training_progress`, `hire_training_candidate`, `publish_training_program`, `create_training_program`, `create_training_program_version`, `replace_training_modules`, `finalize_training_evaluation`, `complete_training_module_without_evaluation`, `increment_training_time`, `append_training_session_messages`, `detach_training_program_document` y `start_training_module`.
5. CUANDO se ejecute la comprobación ENTONCES el sistema DEBERÁ verificar que las variables de entorno `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están definidas, e informar si `OPENROUTER_API_KEY` falta.
6. CUANDO alguna verificación falle ENTONCES el sistema DEBERÁ indicar el elemento concreto que falta y la migración o acción que lo provee.
7. CUANDO todas las verificaciones pasen ENTONCES el sistema DEBERÁ reportar el entorno como apto para el flujo de capacitación.

### Requisito 2 — Errores de subida visibles y accionables

**Historia de usuario:** Como administrador que sube documentos, quiero ver exactamente qué archivo falló y por qué, para poder corregirlo.

#### Criterios de aceptación

1. CUANDO todos los archivos de una petición fallen ENTONCES `POST /api/training/documents` NO DEBERÁ responder con `success: true`.
2. CUANDO al menos un archivo falle ENTONCES la respuesta DEBERÁ incluir, por cada fallo, el nombre del archivo y un motivo específico distinguible entre: tamaño excedido, tipo/extensión no coincidente, texto insuficiente, PDF escaneado que requiere OCR, fallo de storage, fallo de base de datos.
3. CUANDO la interfaz reciba una respuesta con `failures` no vacío ENTONCES DEBERÁ mostrar un mensaje de error por cada archivo fallido, y NO DEBERÁ mostrar el toast de éxito si no se procesó ningún documento.
4. CUANDO la interfaz reciba una respuesta parcial (algunos éxitos y algunos fallos) ENTONCES DEBERÁ mostrar ambos resultados de forma diferenciada.
5. CUANDO un fallo se origine en el servidor ENTONCES el sistema DEBERÁ registrar en el log del servidor la causa técnica completa, sin exponer detalles internos sensibles al cliente.

### Requisito 3 — Subida y procesamiento de documentos funcional

**Historia de usuario:** Como administrador, quiero subir PDF, DOCX, TXT y MD a un programa en borrador y que queden listos para que la IA los use.

#### Criterios de aceptación

1. CUANDO se suba un archivo válido a un programa en estado `draft` ENTONCES el sistema DEBERÁ almacenarlo en el bucket `training-documents` bajo la ruta `{orgId}/{scope|roleId}/{documentId}/{nombreSaneado}`.
2. CUANDO el archivo sea PDF, DOCX, TXT o MD ENTONCES el sistema DEBERÁ extraer su texto y crear una fila en `training_documents` con `status` `ready`, `needs_ocr` o `failed` según el texto obtenido.
3. CUANDO el documento quede en estado `ready` ENTONCES el sistema DEBERÁ generar sus fragmentos en `training_document_chunks`.
4. CUANDO el documento se procese correctamente ENTONCES el sistema DEBERÁ crear la asociación en `training_program_documents` con un `sort_order` consecutivo.
5. CUANDO ya exista un documento con el mismo `checksum_sha256` en el mismo `org_id` y `scope` ENTONCES el sistema DEBERÁ reutilizar el documento existente en lugar de duplicarlo, y asociarlo al programa.
6. CUANDO falle cualquier paso posterior a la subida a storage ENTONCES el sistema DEBERÁ revertir el archivo en storage y la fila en base de datos creados en esa iteración.
7. CUANDO `OPENROUTER_API_KEY` no esté definida o el análisis con IA falle o exceda su tiempo límite ENTONCES el documento DEBERÁ quedar igualmente en estado `ready` sin resumen ni temas, y el flujo NO DEBERÁ interrumpirse.
8. CUANDO el programa no esté en estado `draft` ENTONCES el sistema DEBERÁ rechazar la subida con un mensaje que explique que solo los borradores aceptan documentos nuevos.

### Requisito 4 — Biblioteca y asociación de documentos

**Historia de usuario:** Como administrador, quiero reutilizar documentos institucionales entre programas y desvincular los que ya no apliquen.

#### Criterios de aceptación

1. CUANDO se abra la configuración de un programa ENTONCES el sistema DEBERÁ listar los documentos asociados y los disponibles para asociar.
2. CUANDO se asocie un documento de la biblioteca ENTONCES el sistema DEBERÁ crearlo en `training_program_documents` y reflejarlo en la interfaz sin recargar la página.
3. CUANDO se intente desvincular un documento que ya es fuente de un módulo ENTONCES el sistema DEBERÁ rechazar la operación e informar que el documento está en uso.
4. CUANDO se desvincule un documento no utilizado por ningún módulo ENTONCES el sistema DEBERÁ eliminar la asociación y actualizar la interfaz.
5. CUANDO el programa esté publicado ENTONCES el sistema DEBERÁ impedir asociar o desvincular documentos.

### Requisito 5 — Generación de módulos con IA

**Historia de usuario:** Como administrador, quiero generar los módulos del curso a partir de los documentos ya procesados.

#### Criterios de aceptación

1. CUANDO ningún documento asociado esté en estado `ready` ENTONCES el sistema DEBERÁ impedir la generación e informar que los documentos aún se están procesando.
2. CUANDO existan documentos en estado `ready` y se solicite la generación ENTONCES el sistema DEBERÁ crear módulos con secciones, duración estimada y documentos fuente vinculados en `training_module_documents`.
3. CUANDO la respuesta de la IA no cumpla el esquema esperado ENTONCES el sistema DEBERÁ rechazar la generación con un error explícito y NO DEBERÁ persistir módulos parciales.
4. CUANDO la generación tenga éxito ENTONCES la interfaz DEBERÁ mostrar los módulos creados con su orden, duración y estado de evaluación.
5. CUANDO se cree un módulo manual ENTONCES el sistema DEBERÁ permitirlo sin secciones y permitir editar título, descripción y duración después.

### Requisito 6 — Publicación y versionado del programa

**Historia de usuario:** Como administrador, quiero publicar un programa para poder asignarlo a contrataciones, y crear versiones nuevas sin alterar la publicada.

#### Criterios de aceptación

1. CUANDO un programa no tenga módulos ENTONCES el sistema DEBERÁ impedir su publicación e informar el motivo.
2. CUANDO se publique un programa ENTONCES el sistema DEBERÁ cambiar su estado a `published`, registrar `published_at` y marcarlo como solo lectura en la interfaz.
3. CUANDO ya exista un programa publicado para la misma organización y vacante ENTONCES el sistema DEBERÁ impedir publicar un segundo y explicar el conflicto.
4. CUANDO se cree una nueva versión borrador desde un programa publicado ENTONCES el sistema DEBERÁ generar un nuevo programa en estado `draft` con versión incrementada y redirigir a su configuración.
5. CUANDO un programa esté publicado o archivado ENTONCES la interfaz DEBERÁ deshabilitar toda edición de campos, documentos y módulos.

### Requisito 7 — Contratación y emisión del enlace de acceso

**Historia de usuario:** Como administrador, quiero contratar a un candidato aprobado y entregarle un enlace de capacitación.

#### Criterios de aceptación

1. CUANDO se contrate a un candidato con un programa publicado ENTONCES el sistema DEBERÁ crear o reutilizar su registro en `training_employees` de forma idempotente por `candidate_result_id`.
2. CUANDO el programa no esté publicado, no tenga vacante asociada o no tenga módulos ENTONCES el sistema DEBERÁ rechazar la contratación con un mensaje específico para cada caso.
3. CUANDO la organización del candidato o su vacante no coincidan con las del programa ENTONCES el sistema DEBERÁ rechazar la contratación.
4. CUANDO la contratación tenga éxito ENTONCES el sistema DEBERÁ devolver un enlace de acceso de un solo uso, almacenar solo su hash y una fecha de expiración, y revocar las sesiones activas anteriores del empleado.
5. CUANDO se vuelva a contratar al mismo candidato ENTONCES el sistema DEBERÁ emitir un enlace nuevo, reactivar el acceso y no crear un empleado duplicado.

### Requisito 8 — Acceso del empleado por enlace

**Historia de usuario:** Como empleado nuevo, quiero abrir mi enlace de capacitación y entrar al centro sin necesitar una cuenta.

#### Criterios de aceptación

1. CUANDO se abra `/training/[token]` con un enlace válido y vigente ENTONCES el sistema DEBERÁ crear una sesión de acceso, guardar su token en una cookie `HttpOnly` y redirigir al centro de capacitación.
2. CUANDO el enlace sea inválido, esté revocado o haya expirado ENTONCES el sistema DEBERÁ mostrar un mensaje que distinga cada caso y NO DEBERÁ crear sesión.
3. CUANDO se cree una sesión nueva ENTONCES el sistema DEBERÁ revocar las sesiones activas previas del mismo empleado.
4. CUANDO se acceda a `/training/center` sin sesión válida ni usuario autenticado con asignación ENTONCES el sistema DEBERÁ redirigir fuera del centro en lugar de mostrar una página vacía o con error.
5. CUANDO la comprobación de acceso en el servidor dependa de columnas de `training_employees` ENTONCES esas columnas DEBERÁN existir en el esquema, verificado por el Requisito 1.

### Requisito 9 — Flujo de capacitación del empleado

**Historia de usuario:** Como empleado en capacitación, quiero recorrer los módulos con el tutor IA y que mi progreso se guarde.

#### Criterios de aceptación

1. CUANDO el empleado entre al centro ENTONCES el sistema DEBERÁ cargar su programa, sus módulos y su progreso por módulo (`locked`, `in_progress`, `completed`).
2. CUANDO el empleado inicie un módulo desbloqueado ENTONCES el sistema DEBERÁ marcarlo como `in_progress` de forma transaccional.
3. CUANDO el empleado intente abrir un módulo bloqueado ENTONCES el sistema DEBERÁ rechazar la operación.
4. CUANDO el empleado converse con el tutor ENTONCES el sistema DEBERÁ responder usando únicamente los fragmentos de los documentos del módulo como contexto, y citar los fragmentos utilizados.
5. CUANDO el tutor devuelva una cita que no corresponda a un fragmento real del contexto ENTONCES el sistema DEBERÁ descartar esa cita sin descartar el mensaje.
6. CUANDO el empleado acumule tiempo en un módulo ENTONCES el sistema DEBERÁ persistir el progreso y permitir retomarlo tras recargar.
7. CUANDO el contenido del módulo se haya cubierto y no haya evaluación ENTONCES el sistema DEBERÁ permitir completar el módulo, actualizar el progreso general y desbloquear el siguiente.

### Requisito 10 — Evaluación y cierre

**Historia de usuario:** Como empleado, quiero responder la evaluación del módulo y saber si aprobé.

#### Criterios de aceptación

1. CUANDO un módulo tenga evaluación habilitada ENTONCES el sistema DEBERÁ exigirla antes de permitir completarlo.
2. CUANDO se envíen respuestas ENTONCES el sistema DEBERÁ calificar automáticamente las de opción múltiple y verdadero/falso, y calificar las abiertas con IA.
3. CUANDO `OPENROUTER_API_KEY` no esté disponible y existan preguntas abiertas ENTONCES el sistema DEBERÁ informar la limitación en lugar de fallar de forma silenciosa.
4. CUANDO la calificación termine ENTONCES el sistema DEBERÁ registrar el intento, la puntuación y si se aprobó, mediante una operación transaccional.
5. CUANDO la puntuación alcance el mínimo del programa ENTONCES el sistema DEBERÁ marcar el módulo como completado, actualizar el progreso general y devolver el siguiente módulo.
6. CUANDO la puntuación no alcance el mínimo ENTONCES el sistema DEBERÁ permitir reintentar y llevar la cuenta de intentos.
7. CUANDO se completen todos los módulos ENTONCES el sistema DEBERÁ reflejar el 100 % de progreso y el estado final del empleado.

### Requisito 11 — Visibilidad para el administrador

**Historia de usuario:** Como administrador, quiero ver el avance real de cada empleado en capacitación.

#### Criterios de aceptación

1. CUANDO se abra el panel de capacitación ENTONCES el sistema DEBERÁ mostrar programas, módulos y empleados de la organización activa.
2. CUANDO se abra el progreso de un empleado ENTONCES el sistema DEBERÁ mostrar su estado por módulo, puntuaciones e intentos.
3. CUANDO la carga de datos falle ENTONCES la interfaz DEBERÁ mostrar el error en lugar de una lista vacía sin explicación.
4. CUANDO el usuario no sea `owner` ni `admin` de la organización ENTONCES el sistema DEBERÁ negar el acceso con un mensaje claro y no con una pantalla en blanco.

### Requisito 12 — Cobertura de pruebas

**Historia de usuario:** Como equipo de desarrollo, quiero pruebas que fallen si el flujo de capacitación se rompe otra vez.

#### Criterios de aceptación

1. CUANDO se ejecute la suite de pruebas ENTONCES DEBERÁ existir una prueba que falle si `POST /api/training/documents` responde `success: true` habiendo fallado todos los archivos.
2. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de reversión para fallo de storage, fallo de inserción del documento y fallo de inserción de fragmentos.
3. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas del rechazo de subida a programas no borrador y del rechazo de generación sin documentos `ready`.
4. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de acceso por token para los casos válido, inválido, revocado y expirado.
5. CUANDO se ejecute la suite completa del proyecto ENTONCES DEBERÁ pasar sin regresiones en las pruebas de capacitación existentes (`src/__tests__/training/`).

## Fuera de alcance

- Rediseño visual del Centro de Capacitación.
- OCR para PDF escaneados: se mantiene el estado `needs_ocr` sin implementar el procesamiento.
- Búsqueda semántica por embeddings; se conserva la búsqueda de texto existente.
- Notificaciones por correo asociadas a la contratación.
- Migración a un proveedor de IA distinto de OpenRouter.
