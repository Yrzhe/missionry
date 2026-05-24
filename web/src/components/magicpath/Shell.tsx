import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useAppStore } from '../../lib/store';
import type { ReactNode } from 'react';
import { MissionryMark } from '../MissionryMark';
import { NavIcon } from './NavIcon';

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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('missionry.sidebar') === 'collapsed');

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    localStorage.setItem('missionry.locale', next);
    void i18n.changeLanguage(next);
  };
  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('missionry.sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  return (
    <div className={`mp-shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="mp-sidebar">
        <div className="mp-brand">
          <div className="mp-logo"><MissionryMark /></div>
          <div>
            <div className="mp-brand-name">{t('app.name')}</div>
            <div className="mp-muted mp-small">{t('app.workspace')}</div>
          </div>
        </div>
        <nav className="mp-nav">
          <NavItem to="/concierge" label={t('nav.concierge')} mark={<NavIcon name="concierge" />} />
          <NavItem to="/missions" label={t('nav.missions')} mark={<NavIcon name="missions" />} count={missionsQuery.data?.items.length || undefined} />
          <NavItem to="/agents" label={t('nav.agents')} mark={<NavIcon name="agents" />} />
          <NavItem to="/skills" label={t('nav.skills')} mark={<NavIcon name="skills" />} />
          <NavItem to="/schedules" label={t('nav.schedules')} mark={<NavIcon name="schedules" />} />
          <NavItem to="/artifacts" label={t('nav.artifacts')} mark={<NavIcon name="artifacts" />} />
          <NavItem to="/growth" label={t('nav.growth')} mark={<NavIcon name="growth" />} />
          <details className={`mp-nav-group ${settingsOpen ? 'active' : ''}`} open={settingsOpen}>
            <summary><span className="mp-nav-mark"><NavIcon name="settings" /></span><span>{t('nav.settings')}</span></summary>
            <div className="mp-nav-subitems">
              <NavItem to="/settings/budget" label={t('nav.budget')} mark="·" />
              <NavItem to="/settings/environment" label={t('nav.environment')} mark="·" />
              <NavItem to="/settings/account" label={t('nav.account')} mark="·" />
            </div>
          </details>
          {session?.role === 'admin' ? <NavItem to="/admin" label={t('nav.admin')} mark={<NavIcon name="admin" />} count={adminMissionsQuery.data?.items.length || undefined} /> : null}
        </nav>
        <button
          type="button"
          className="mp-sidebar-toggle"
          onClick={toggleSidebar}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          <span className="mp-sidebar-toggle-icon">{collapsed ? '»' : '«'}</span>
          <span className="mp-sidebar-toggle-label">{t('nav.collapse')}</span>
        </button>
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

function NavItem({ to, label, mark, count }: { to: string; label: string; mark: ReactNode; count?: number }) {
  return (
    <NavLink to={to} title={label} className={({ isActive }) => `mp-nav-item ${isActive ? 'active' : ''}`}>
      <span className="mp-nav-mark">{mark}</span>
      <span className="mp-nav-label">{label}</span>
      {count !== undefined ? <span className="mp-nav-count">{count}</span> : null}
    </NavLink>
  );
}
