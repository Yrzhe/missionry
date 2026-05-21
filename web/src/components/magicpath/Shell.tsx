import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useAppStore } from '../../lib/store';
import type { ReactNode } from 'react';

type ShellProps = {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function Shell({ title, meta, actions, children }: ShellProps) {
  const { t, i18n } = useTranslation();
  const { session } = useAppStore(useShallow((state) => ({ session: state.session })));
  const missionsQuery = useQuery({ queryKey: queryKeys.missions, queryFn: api.missions });
  const adminMissionsQuery = useQuery({
    queryKey: queryKeys.adminMissions,
    queryFn: api.adminMissions,
    enabled: session?.role === 'admin',
  });
  const location = useLocation();
  const settingsOpen = location.pathname.startsWith('/settings');
  const displayName = session?.name?.trim() || session?.email;

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    localStorage.setItem('missionry.locale', next);
    void i18n.changeLanguage(next);
  };

  return (
    <div className="mp-shell">
      <aside className="mp-sidebar">
        <div className="mp-brand">
          <div className="mp-logo">M</div>
          <div>
            <div className="mp-brand-name">{t('app.name')}</div>
            <div className="mp-muted mp-small">{t('app.workspace')}</div>
          </div>
        </div>
        <nav className="mp-nav">
          <NavItem to="/missions" label={t('nav.missions')} mark="●" count={missionsQuery.data?.items.length || undefined} />
          <NavItem to="/agents" label={t('nav.agents')} mark="◐" />
          <NavItem to="/artifacts" label={t('nav.artifacts')} mark="□" />
          <NavItem to="/growth" label={t('nav.growth')} mark="↻" />
          <details className={`mp-nav-group ${settingsOpen ? 'active' : ''}`} open={settingsOpen}>
            <summary><span>⚙</span><span>{t('nav.settings')}</span></summary>
            <div className="mp-nav-subitems">
              <NavItem to="/settings/budget" label={t('nav.budget')} mark="·" />
              <NavItem to="/settings/environment" label={t('nav.environment')} mark="·" />
              <NavItem to="/settings/account" label={t('nav.account')} mark="·" />
            </div>
          </details>
          {session?.role === 'admin' ? <NavItem to="/admin" label={t('nav.admin')} mark="◆" count={adminMissionsQuery.data?.items.length || undefined} /> : null}
        </nav>
      </aside>
      <main className="mp-main">
        <header className="mp-topbar">
          <strong>{title}</strong>
          {meta ?? <span className="mp-muted mp-mono">{session?.email ?? t('common.loading')}</span>}
          <div className="mp-topbar-actions">
            <span className="mp-session-name">{displayName ?? t('common.loading')}</span>
            <button className="mp-button mp-lang" onClick={toggleLanguage}>{t('common.language')}</button>
            {actions}
          </div>
        </header>
        <section className="mp-content">{children}</section>
      </main>
    </div>
  );
}

function NavItem({ to, label, mark, count }: { to: string; label: string; mark: string; count?: number }) {
  return (
    <NavLink to={to} className={({ isActive }) => `mp-nav-item ${isActive ? 'active' : ''}`}>
      <span>{mark}</span>
      <span>{label}</span>
      {count !== undefined ? <span className="mp-nav-count">{count}</span> : null}
    </NavLink>
  );
}
