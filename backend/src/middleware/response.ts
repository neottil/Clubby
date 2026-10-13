/**
 * Helper per costruire risposte HTTP standardizzate
 */

import { HttpError, type ResponseResult } from './auth.js';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

export function ok(data: unknown, statusCode = 200): ResponseResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

export function created(data: unknown): ResponseResult {
  return ok(data, 201);
}

export function noContent(): ResponseResult {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

export function errorResponse(error: unknown): ResponseResult {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }

  console.error('Unexpected error:', error);
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Errore interno del server' }),
  };
}

/**
 * Wrapper che gestisce automaticamente le eccezioni di un handler
 */
export function withErrorHandling(
  fn: (...args: any[]) => Promise<ResponseResult>
) {
  return async (...args: any[]): Promise<ResponseResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
