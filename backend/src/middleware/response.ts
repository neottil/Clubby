/**
 * Helper per costruire risposte HTTP standardizzate per API Gateway v2
 */

import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HttpError } from './auth.js';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export function ok(data: unknown, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

export function created(data: unknown): APIGatewayProxyStructuredResultV2 {
  return ok(data, 201);
}

export function noContent(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

export function errorResponse(error: unknown): APIGatewayProxyStructuredResultV2 {
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
  fn: (...args: any[]) => Promise<APIGatewayProxyStructuredResultV2>
) {
  return async (...args: any[]): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
