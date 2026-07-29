import 'server-only';

import { NextResponse } from 'next/server';
import { TrainingAuthError } from './auth';
import type { TrainingErrorLanguage } from './document-errors';
import { resolveTrainingRpcError } from './rpc-errors';

/**
 * Fallo de una operación de capacitación que ya tiene un status HTTP decidido
 * y un mensaje pensado para el cliente.
 *
 * Complementa a `TrainingAuthError` (diseño, sección 6): esa cubre
 * autenticación y permisos; esta cubre el resto de precondiciones de negocio
 * que hoy se colapsan en un `500` opaco (programa no publicado, documento en
 * uso, módulo bloqueado, etc.).
 *
 * Sigue el mismo patrón deliberadamente: extiende `Error`, recibe `message` y
 * `status`, y fija `this.name` para que el log del servidor identifique el
 * tipo. El `message` es el texto que viaja al cliente, así que nunca debe
 * contener detalle interno: la causa técnica se registra aparte.
 */
export class TrainingOperationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'TrainingOperationError';
  }
}

/**
 * Convierte una excepción capturada en la respuesta de error de una ruta de
 * capacitación.
 *
 * Orden de reconocimiento, de lo más explícito a lo más genérico:
 *
 * 1. `TrainingAuthError`: autenticación y permisos.
 * 2. `TrainingOperationError`: precondición de negocio ya clasificada por la
 *    ruta o por un helper.
 * 3. Excepción de una RPC de capacitación reconocida por el catálogo de
 *    `rpc-errors.ts`.
 * 4. `500` genérico.
 *
 * El paso 3 es intencional: cualquier ruta que ya delegue su `catch` aquí
 * traduce las excepciones de Postgres sin cambios adicionales, y un
 * identificador desconocido devuelve `null` y cae en el `500`, así que el
 * comportamiento por defecto no cambia.
 *
 * `language` es `'en'` por defecto porque los textos en inglés del catálogo
 * reproducen los que las rutas de capacitación ya devuelven hoy para estas
 * mismas condiciones. Una ruta que quiera el texto en español para la interfaz
 * de administración lo pide explícitamente.
 *
 * En todos los casos se registra el error completo en el log del servidor
 * antes de responder (Requisito 2.5).
 */
export function trainingApiErrorResponse(
  error: unknown,
  context: string,
  language: TrainingErrorLanguage = 'en',
) {
  console.error(context, error);

  if (error instanceof TrainingAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  if (error instanceof TrainingOperationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  const rpcResolution = resolveTrainingRpcError(error, language);

  if (rpcResolution) {
    return NextResponse.json(
      { error: rpcResolution.message },
      { status: rpcResolution.status }
    );
  }

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
