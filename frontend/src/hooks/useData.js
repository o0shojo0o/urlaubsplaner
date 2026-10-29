import { useEffect, useState } from 'react';
export function useData(loader, dependencies) {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    Promise.resolve()
      .then(loader)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, dependencies);
  return [data, error];
}
