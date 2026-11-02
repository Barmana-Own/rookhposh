import { useSearchParams } from 'react-router-dom';

export function useProductQuery(defaultStatus) {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const filter = ['all', 'active', 'pending', 'rejected'].includes(params.get('status')) ? params.get('status') : search ? 'all' : defaultStatus;
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
  const change = (key, value) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value === '' || value == null) next.delete(key); else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    return next;
  });
  return { search, filter, page, setSearch: value => change('q', value), setFilter: value => change('status', value), setPage: value => change('page', value) };
}
