import type { PropsWithChildren } from 'react';
import { LogoMark, MessageIcon, ShieldIcon, UsersIcon } from './Icons';

interface AuthShellProps extends PropsWithChildren {
  title: string;
  subtitle: string;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="О PulseChat">
        <div className="auth-story__glow auth-story__glow--one" />
        <div className="auth-story__glow auth-story__glow--two" />
        <div className="brand brand--light">
          <LogoMark className="brand__mark" />
          <span>PulseChat</span>
        </div>

        <div className="auth-story__content">
          <p className="eyebrow eyebrow--light">Всегда на связи</p>
          <h1>Общение в ритме вашей команды.</h1>
          <p>
            Личные диалоги и групповые обсуждения с мгновенной доставкой сообщений.
          </p>

          <div className="auth-features">
            <div className="auth-feature"><MessageIcon /><span>Сообщения в реальном времени</span></div>
            <div className="auth-feature"><UsersIcon /><span>Группы с понятными ролями</span></div>
            <div className="auth-feature"><ShieldIcon /><span>Доступ только для участников</span></div>
          </div>
        </div>

        <p className="auth-story__caption">Учебный проект VK Education · Кейс «Мессенджер»</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__mobile-brand brand">
          <LogoMark className="brand__mark" />
          <span>PulseChat</span>
        </div>
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="eyebrow">Добро пожаловать</p>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
