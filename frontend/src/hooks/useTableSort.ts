import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

interface UseTableSortOptions<T> {
  initialKey?: keyof T;
  numericKeys?: (keyof T)[];
}

/**
 * Ordinamento generico per tabelle: click sull'header di una colonna per
 * ordinare, click di nuovo per invertire la direzione. `numericKeys` indica
 * quali campi vanno confrontati come numeri (es. valori DECIMAL di Postgres
 * arrivano come stringa via JSON, "10.00" < "9.00" in ordine alfabetico).
 */
export function useTableSort<T>(items: T[], options: UseTableSortOptions<T> = {}) {
  const [sortKey, setSortKey] = useState<keyof T | null>(options.initialKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const numericKeys = options.numericKeys ?? [];

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const isNumeric = numericKeys.includes(sortKey);
    return [...items].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = isNumeric
        ? Number(av) - Number(bv)
        : String(av).localeCompare(String(bv), 'it', { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIndicator = (key: keyof T) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return { sorted, toggleSort, sortIndicator };
}
