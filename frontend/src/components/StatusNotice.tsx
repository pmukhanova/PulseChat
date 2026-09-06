import { AlertIcon, CheckIcon } from './Icons';

interface StatusNoticeProps {
  kind?: 'error' | 'success' | 'info';
  children: string;
}

export function StatusNotice({ kind = 'error', children }: StatusNoticeProps) {
  return (
    <div className={`status-notice status-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'success' ? <CheckIcon /> : <AlertIcon />}
      <span>{children}</span>
    </div>
  );
}
