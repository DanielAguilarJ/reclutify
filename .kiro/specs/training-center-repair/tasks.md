# Plan de implementación — Reparación del Centro de Capacitación

- [x] 1. Función SQL de reporte de entorno
- [x] 1.1 Crear la migración `supabase/migrations/202607280001_training_environment_report.sql`
  - Definir `public.training_environment_report()` como `SECURITY DEFINER` con `SET search_path = public`, devolviendo `JSONB`
  - Introspeccionar tablas con `information_schema.tables`: `training_programs`, `training_documents`, `training_modules`, `training_employees`, `training_progress`, `training_evaluations`, `training_sessions`, `training_program_documents`, `training_module_documents`, `training_document_chunks`, `training_access_sessions`
  - Introspeccionar nulabilidad con `information_schema.columns` leyendo `is_nullable` para `training_documents.program_id`, `training_documents.file_url` y `training_employees.token`
  - Introspeccionar presencia de `training_employees.user_id`
  - Introspeccionar funciones con `pg_proc` unido a `pg_namespace`: `is_training_admin`, `hire_training_candidate`, `finalize_training_evaluation`, `complete_training_module`, `start_training_module`, `detach_training_program_document`
  - Introspeccionar `storage.buckets` devolviendo `exists`, `public` y `file_size_limit` de `training-documents`
  - Introspeccionar `pg_indexes` para `uniq_published_training_program_per_role`
  - `REVOKE ALL ... FROM PUBLIC` y `GRANT EXECUTE ... TO service_role`, siguiendo el patrón de `public.is_training_admin`
  - _Requisitos: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Módulo y endpoint de diagnóstico
- [x] 2.1 Crear `src/lib/training/diagnostics.ts`
  - Marcar con `import 'server-only'`
  - Definir el catálogo de checks esperados con `id`, `label`, `severity` (`critical` o `warning`) y `remediation` apuntando a la migración concreta
  - Implementar `collectViaRpc(admin)` invocando `training_environment_report()`
  - Implementar `collectViaProbe(admin)` con `select` de `limit 0` por tabla, `listBuckets()` para storage y `rpc()` con argumentos inválidos por función, distinguiendo `42883` de error de argumentos
  - Implementar el normalizador que produce el array `checks` y el `summary` con `passed`, `failed` y `warnings`
  - Implementar la comprobación de variables de entorno, marcando `OPENROUTER_API_KEY` como `warning`
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2.2 Crear `src/app/api/training/diagnostics/route.ts`
  - `GET` con `orgId` opcional; si falta, resolverlo desde `user_profiles.org_id` del usuario autenticado
  - Autorizar con `requireOrgAdmin(orgId)` y devolver `403` si no es `owner` ni `admin`
  - Intentar `collectViaRpc` y caer a `collectViaProbe` cuando la RPC no exista, indicando el origen en `source`
  - Incluir la membresía del usuario consultante en la respuesta
  - Calcular `ok` como verdadero solo si ningún check `critical` falla
  - `export const runtime = 'nodejs'`
  - _Requisitos: 1.5, 1.6, 1.7, 11.4_

- [x] 2.3 Crear `src/__tests__/training/diagnostics.test.ts`
  - Devuelve el reporte cuando la RPC existe
  - Cae al sondeo cuando la RPC responde `42883` e identifica los elementos faltantes
  - Resuelve `orgId` desde `user_profiles` cuando no se pasa por query
  - Responde `403` a un usuario sin rol `owner` ni `admin`
  - `OPENROUTER_API_KEY` ausente produce `warning`, no `failed`, y no altera `ok`
  - _Requisitos: 1.5, 1.6, 1.7, 12.5_

- [x] 3. Migración consolidada de reparación del esquema
- [x] 3.1 Crear `supabase/migrations/202607280002_training_v2_consolidated_repair.sql`
  - Portar el contenido de `supabase/repair_training_v2.sql` verificando que cada sentencia sea idempotente
  - Conservar `supabase/repair_training_v2.sql` como camino manual alternativo
  - No aplicar la migración a ninguna base de datos como parte de esta tarea
  - _Requisitos: 1.6, 3.1, 3.3, 3.4, 7.1, 8.1_

- [x] 4. Taxonomía de errores de documentos
- [x] 4.1 Crear `src/lib/training/document-errors.ts`
  - Definir el tipo `TrainingDocumentErrorCode` con `FILE_TOO_LARGE`, `FILE_TYPE_MISMATCH`, `STORAGE_UPLOAD_FAILED`, `STORAGE_DOWNLOAD_FAILED`, `TEXT_EXTRACTION_FAILED`, `TEXT_TOO_SHORT`, `DATABASE_INSERT_FAILED`, `CHUNKS_INSERT_FAILED`, `ASSOCIATION_FAILED` y `UNKNOWN`
  - Definir la clase `TrainingDocumentError` con `code`, `fileName`, `message` y `cause`
  - Definir `DOCUMENT_ERROR_MESSAGES` con texto en español e inglés por código
  - Exponer un helper que convierta cualquier error en `{ fileName, code, message }` sin serializar `cause`
  - No incluir `NEEDS_OCR` como código de error
  - _Requisitos: 2.2, 2.5_

- [x] 5. Extracción de la lógica de procesamiento
- [x] 5.1 Crear `src/lib/training/process-document.ts`
  - Extraer el cuerpo del bucle por archivo de `src/app/api/training/documents/route.ts` a `processTrainingDocument`
  - Recibir `admin`, `orgId`, `roleId`, `scope`, `programId`, `documentId`, `storagePath`, `fileName` y `fileBuffer`
  - Validar tamaño real y detectar el tipo con `detectTrainingFileKind` sobre los bytes
  - Calcular el checksum, deduplicar por `org_id` y `scope`, y reutilizar el documento existente cuando corresponda
  - Extraer texto de PDF, DOCX, TXT y MD, y asignar `status` `ready`, `needs_ocr` o `failed`
  - Insertar fragmentos en `training_document_chunks` cuando el estado sea `ready`
  - Crear la asociación en `training_program_documents` con `sort_order` consecutivo
  - Ejecutar el análisis con IA de forma opcional, sin interrumpir el flujo si falta la clave, falla o expira
  - Lanzar `TrainingDocumentError` con el código correspondiente en cada punto de fallo
  - Conservar la reversión existente de objeto en storage y fila de documento
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 5.2 Refactorizar `src/app/api/training/documents/route.ts` como camino heredado
  - Sustituir el cuerpo del bucle por llamadas a `processTrainingDocument`
  - Poblar `failures` con `{ fileName, code, message }`
  - Responder `200` con `success: true` cuando al menos un archivo se procesó
  - Responder `422` con `success: false` cuando ningún archivo se procesó
  - Registrar `console.error` estructurado por fallo con `code`, `fileName` y `cause`
  - Mantener el rechazo de programas que no estén en `draft`
  - _Requisitos: 2.1, 2.2, 2.5, 3.8_

- [x] 5.3 Extender `src/__tests__/training/upload-documents.test.ts`
  - Responde `422` con `success: false` cuando todos los archivos fallan
  - Responde `200` con `success: true` y `failures` no vacío en el caso mixto
  - Cada elemento de `failures` incluye un `code` de la taxonomía, verificado por separado para storage, inserción de documento e inserción de fragmentos
  - La causa técnica no aparece en el cuerpo de la respuesta
  - Las pruebas de reversión existentes siguen pasando tras la extracción
  - _Requisitos: 12.1, 12.2, 12.3_

- [x] 6. Rutas de subida directa
- [x] 6.1 Crear `src/app/api/training/documents/upload-url/route.ts`
  - `POST` con `{ programId, scope, fileName, fileSize }` validado con un esquema de Zod en `src/lib/training/contracts.ts`
  - Autorizar con `requireProgramAdmin(programId)`
  - Rechazar si el programa no está en `draft`
  - Rechazar `scope: 'role'` cuando el programa no tenga `role_id`
  - Rechazar si `fileSize` excede `MAX_TRAINING_FILE_SIZE`, sin generar URL
  - Generar `documentId` en el servidor y derivar `storagePath` como `{orgId}/{scope|roleId}/{documentId}/{nombreSaneado}`
  - Devolver `{ documentId, storagePath, signedUrl, token }` usando `createSignedUploadUrl`
  - `export const runtime = 'nodejs'`
  - _Requisitos: 3.1, 3.8_

- [x] 6.2 Crear `src/app/api/training/documents/process/route.ts`
  - `POST` con `{ programId, scope, documentId, storagePath, fileName }` validado con Zod
  - Autorizar con `requireProgramAdmin(programId)` y rechazar si el programa no está en `draft`
  - Descargar el objeto con el cliente admin y lanzar `STORAGE_DOWNLOAD_FAILED` si falla
  - Delegar en `processTrainingDocument`
  - Borrar el objeto del bucket cuando la validación posterior a la descarga falle
  - Traducir `TrainingDocumentError` a una respuesta con `code` y `message`
  - `export const runtime = 'nodejs'` y `maxDuration = 60`
  - _Requisitos: 2.2, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 6.3 Crear `src/__tests__/training/upload-url.test.ts`
  - Devuelve URL firmada para un programa en `draft`
  - Rechaza si el programa no es `draft`
  - Rechaza si `fileSize` excede el máximo, sin generar URL
  - Rechaza `scope: 'role'` en un programa sin `role_id`
  - Responde `403` a un usuario sin rol `owner` ni `admin`
  - _Requisitos: 3.8, 12.3_

- [x] 6.4 Crear `src/__tests__/training/process-document.test.ts`
  - Bytes que no coinciden con la extensión declarada producen `FILE_TYPE_MISMATCH` y el objeto se borra del bucket
  - Tamaño real por encima del límite produce `FILE_TOO_LARGE` y el objeto se borra
  - Fallo de descarga produce `STORAGE_DOWNLOAD_FAILED`
  - Checksum duplicado reutiliza el documento existente y borra el objeto recién subido
  - Un PDF sin texto suficiente queda en `needs_ocr` y cuenta como procesado, no como fallo
  - _Requisitos: 3.2, 3.5, 3.6, 12.2_

- [x] 7. Interfaz de subida y diagnóstico
- [x] 7.1 Reescribir la orquestación de subida en `src/app/admin/training/configure/[programId]/page.tsx`
  - Sustituir `handleParseDocuments` por un flujo por archivo de tres pasos: pedir URL firmada, subir con `uploadToSignedUrl` desde el cliente del navegador, llamar a `process`
  - Añadir estado por archivo con valores `pending`, `uploading`, `processing`, `done` y `failed`
  - Renderizar un panel bajo la zona de arrastre con una fila por archivo y su motivo de fallo
  - Conservar en `uploadFiles` los archivos que fallaron y retirar solo los procesados
  - Reservar el toast para el resultado agregado, diferenciando éxito total, resultado parcial y fallo total
  - Recargar la biblioteca de documentos al finalizar
  - _Requisitos: 2.3, 2.4_

- [x] 7.2 Añadir el banner de diagnóstico en `src/app/admin/training/page.tsx`
  - Consultar `GET /api/training/diagnostics` al cargar el panel
  - Mostrar los checks fallidos con su remediación cuando `ok` sea falso
  - Reutilizar el patrón de `src/components/admin/SyncStatusBanner.tsx`, parametrizándolo si es viable en lugar de crear un componente nuevo
  - No bloquear la carga del panel si el diagnóstico falla
  - _Requisitos: 1.6, 11.3, 11.4_

- [x] 8. Traducción de errores de RPC
- [x] 8.1 Crear `src/lib/training/rpc-errors.ts`
  - Mapear `training_program_not_found`, `training_program_not_published`, `training_program_has_no_role`, `training_program_has_no_modules`, `training_document_in_use`, `candidate_result_not_found`, `candidate_org_mismatch`, `candidate_role_mismatch` y `forbidden` a `{ status, message }`
  - Reconocer el prefijo `exception: ` que hoy se inspecciona de forma manual en las rutas
  - Devolver `null` para excepciones desconocidas, para que caigan en el 500 genérico
  - _Requisitos: 4.3, 5.1, 6.1, 6.3, 7.2, 7.3_

- [x] 8.2 Añadir `TrainingOperationError` en `src/lib/training/http.ts`
  - Definir la clase con `message` y `status`
  - Hacer que `trainingApiErrorResponse` la reconozca, igual que hace con `TrainingAuthError`
  - Mantener el 500 genérico como comportamiento por defecto
  - _Requisitos: 2.5, 11.3_

- [x] 8.3 Aplicar la traducción en las rutas que invocan RPCs
  - `src/app/api/training/programs/[programId]/documents/route.ts` para asociación y desasociación
  - `src/app/api/training/generate-modules/route.ts`
  - `src/app/api/training/programs/[programId]/publish/route.ts`
  - `src/app/api/training/programs/[programId]/versions/route.ts`
  - `src/app/api/training/hire-candidate/route.ts`
  - `src/app/api/training/start-module/route.ts`, `complete-module/route.ts` y `evaluate-module/route.ts`
  - Centralizar en el mapa el parseo que hoy está disperso
  - _Requisitos: 4.3, 5.1, 5.3, 6.1, 6.3, 6.4, 7.2, 7.3, 9.3, 10.4, 10.5, 10.6_

- [x] 8.4 Crear `src/__tests__/training/rpc-errors.test.ts`
  - Cada identificador del mapa produce su status y mensaje
  - Una excepción desconocida cae en `500` con mensaje genérico
  - El prefijo `exception: ` se reconoce correctamente
  - _Requisitos: 12.5_

- [x] 9. Pruebas del acceso del empleado
- [x] 9.1 Crear `src/__tests__/training/access.test.ts`
  - Enlace válido crea sesión, fija la cookie `HttpOnly` y revoca las sesiones previas
  - Enlace inválido produce `401` con su mensaje
  - Enlace revocado produce `401` con su mensaje
  - Enlace expirado produce `401` con su mensaje
  - Colisión en el índice único de sesión activa se resuelve revocando y reintentando
  - _Requisitos: 8.1, 8.2, 8.3, 12.4_

- [x] 10. Verificación final
- [x] 10.1 Ejecutar la suite completa y el build
  - Ejecutar `vitest --run` y confirmar que no hay regresiones en `admin.test.ts`, `chat.test.ts`, `complete-module.test.ts`, `evaluate-module.test.ts` y `page.test.tsx`
  - Ejecutar el build de Next.js y resolver cualquier error de tipos introducido
  - _Requisitos: 12.5_

- [x] 10.2 Documentar el procedimiento de aplicación del esquema
  - Añadir al README o a un documento de operaciones los pasos para aplicar las migraciones y ejecutar el diagnóstico
  - Indicar explícitamente que la migración consolidada debe aplicarse primero en un entorno de pruebas y con respaldo, nunca directamente en producción sin confirmación
  - _Requisitos: 1.6, 1.7_

## Notas de ejecución

**Las migraciones no se aplican como parte de estas tareas.** Las tareas 1.1 y 3.1 solo crean los archivos. Aplicarlas contra una base de datos con datos es una operación de riesgo medio que requiere confirmación explícita, respaldo y un entorno de pruebas previo.

**Verificación manual pendiente de entorno.** Los siguientes casos no pueden cubrirse con pruebas unitarias porque dependen de la plataforma de despliegue y deben ejecutarse contra una vista previa desplegada:

- Subir un PDF de más de 5 MB. Es el caso que hoy falla en producción por el límite de cuerpo de petición y funciona en local.
- Subir un archivo de 20 MB y confirmar que se rechaza sin dejar objeto huérfano en el bucket.
- Renombrar un `.exe` a `.pdf` y confirmar el rechazo por `FILE_TYPE_MISMATCH` con borrado del objeto.
- Recorrido completo: generar módulos, publicar, contratar, abrir el enlace, completar un módulo con evaluación.
