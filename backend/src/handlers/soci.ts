// backend/src/lambda.ts - Routing ottimizzato
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getSoci } from '../service/soci.service';
import { createSocio } from '../service/soci.service';

// Router leggero senza framework
const routes: Record<string, Record<string, Function>> = {
  'GET': {
    '/api/soci': getSoci,
  },
  'POST': {
    '/api/soci': createSocio,
  }
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;
  
  console.log(`${method} ${path}`);
  
  // Routing diretto
  const handler = routes[method]?.[path];
  
  if (!handler) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  }
  
  try {
    return await handler(event);
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
