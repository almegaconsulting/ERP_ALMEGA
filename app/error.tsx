'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{padding:40,fontFamily:'system-ui'}}><h1>No se pudo abrir el espacio de trabajo</h1><p>Tus datos guardados se conservan. Puedes volver a intentarlo.</p><button onClick={reset}>Volver a intentar</button></main>;
}
