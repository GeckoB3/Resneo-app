import { useEffect, useState } from 'react';

// `useEffect` is not invoked during server rendering, meaning
// we can use this to determine if we're on the server or not.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const [value, setValue] = useState<S | C>(server);
  // Hydration: swap server-rendered value to the client value after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(client);
  }, [client]);

  return value;
}
