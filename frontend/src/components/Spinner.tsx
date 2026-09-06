export function Spinner({ label = 'Загрузка' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}
