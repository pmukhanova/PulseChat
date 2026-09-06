import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 42" role="img" aria-label="PulseChat">
      <rect width="42" height="42" rx="14" fill="currentColor" />
      <path d="M11 22h5l2.2-7 4.1 15 2.7-9H31" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>;
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;
}

export function UsersIcon(props: IconProps) {
  return <Icon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
}

export function UserPlusIcon(props: IconProps) {
  return <Icon {...props}><path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8" cy="7" r="4" /><path d="M19 8v6M16 11h6" /></Icon>;
}

export function LogOutIcon(props: IconProps) {
  return <Icon {...props}><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></Icon>;
}

export function SendIcon(props: IconProps) {
  return <Icon {...props}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Icon>;
}

export function ChevronUpIcon(props: IconProps) {
  return <Icon {...props}><path d="m18 15-6-6-6 6" /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
}

export function MoreIcon(props: IconProps) {
  return <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>;
}

export function EditIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></Icon>;
}

export function TrashIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></Icon>;
}

export function ShieldIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></Icon>;
}

export function MessageIcon(props: IconProps) {
  return <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.6-4.8A8 8 0 1 1 21 15Z" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m20 6-11 11-5-5" /></Icon>;
}

export function AlertIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 17h.01" /></Icon>;
}
