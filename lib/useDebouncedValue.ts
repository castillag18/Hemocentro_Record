"use client";

import { useEffect, useState } from "react";

/** Retrasa actualizaciones (p. ej. búsqueda) para no consultar la BD en cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
