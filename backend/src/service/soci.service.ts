import * as packageJson from '../../package.json';

export const getSoci = async (event: any) => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { id: '1', nome: 'Mario Rossi', email: 'mario.rossi@example.com' },
      { id: '2', nome: 'Luca Bianchi', email: 'luca.bianchi@example.com' },
    ])
  };
};

export const createSocio = async (event: any) => {
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'not implemented'
    })
  };
};
