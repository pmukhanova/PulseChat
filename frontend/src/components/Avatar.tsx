import { initials } from '../lib/format';

const colors = ['violet', 'blue', 'cyan', 'rose', 'amber', 'green'] as const;

function colorForName(name: string): (typeof colors)[number] {
  const hash = [...name].reduce((result, letter) => result + letter.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? 'blue';
}

interface AvatarProps {
  username: string;
  size?: 'small' | 'medium' | 'large';
  group?: boolean;
}

export function Avatar({ username, size = 'medium', group = false }: AvatarProps) {
  return (
    <span className={`avatar avatar--${size} avatar--${colorForName(username)}`} aria-hidden="true">
      {group ? 'G' : initials(username)}
    </span>
  );
}
