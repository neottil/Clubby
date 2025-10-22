import { useEffect, useState } from 'react';

type Socio = {
  id: string;
  nome: string;
  email: string;
};

function App() {
  const [soci, setSoci] = useState<Socio[]>([]);

  useEffect(() => {
    fetch('http://localhost:3000/api/soci')
      .then(res => res.json())
      .then((data: Socio[]) => setSoci(data))
      .catch(err => console.error('Errore fetch soci:', err));
  }, []);

  return (
    <div>
      <h1>Lista Soci</h1>
      <ul>
        {soci.map(socio => (
          <li key={socio.id}>
            {socio.nome} - {socio.email}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
