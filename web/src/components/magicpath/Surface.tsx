import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../lib/store';
import type { MissionAgentRow, MissionSandboxReadModel, MissionSummary } from '../../lib/types';

type Page =
  | 'missions'
  | 'workroom'
  | 'agents'
  | 'agent'
  | 'artifacts'
  | 'growth'
  | 'budget'
  | 'environment'
  | 'chat'
  | 'admin';

type SurfaceProps = {
  page: Page;
  missionId?: string;
  instanceId?: string;
  threadId?: string;
};

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;
const percent = (mission: MissionSummary) => {
  const total = mission.issues?.total ?? 0;
  return total ? Math.round(((mission.issues?.completed ?? 0) / total) * 100) : 0;
};

export function MagicPathSurface(props: SurfaceProps) {
  const { t, i18n } = useTranslation();
  const session = useAppStore((state) => state.session);
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
          <NavItem to="/missions" label={t('nav.missions')} mark="●" />
          <NavItem to="/agents" label={t('nav.agents')} mark="◐" />
          <NavItem to="/artifacts" label={t('nav.artifacts')} mark="□" />
          <NavItem to="/growth" label={t('nav.growth')} mark="↻" />
          <NavItem to="/settings/budget" label={t('nav.budget')} mark="⚙" />
          <NavItem to="/settings/environment" label={t('nav.environment')} mark="◇" />
          {session?.role === 'admin' ? <NavItem to="/admin" label={t('nav.admin')} mark="◆" /> : null}
        </nav>
      </aside>
      <main className="mp-main">
        <header className="mp-topbar">
          <strong>{t(`nav.${props.page === 'workroom' ? 'missions' : props.page === 'budget' ? 'settings' : props.page}`)}</strong>
          <span className="mp-muted mp-mono">{session?.email ?? t('common.loading')}</span>
          <button className="mp-button mp-lang" onClick={toggleLanguage}>{t('common.language')}</button>
        </header>
        <section className="mp-content">
          {props.page === 'missions' ? <MissionsPage /> : null}
          {props.page === 'workroom' ? <WorkroomPage missionId={props.missionId} /> : null}
          {props.page === 'agents' ? <AgentsPage /> : null}
          {props.page === 'agent' ? <AgentPage missionId={props.missionId} instanceId={props.instanceId} /> : null}
          {props.page === 'artifacts' ? <ArtifactsPage /> : null}
          {props.page === 'growth' ? <GrowthPage /> : null}
          {props.page === 'budget' ? <BudgetPage /> : null}
          {props.page === 'environment' ? <EnvironmentPage /> : null}
          {props.page === 'chat' ? <ChatPage threadId={props.threadId} /> : null}
          {props.page === 'admin' ? <AdminPage /> : null}
        </section>
      </main>
    </div>
  );
}

function NavItem({ to, label, mark }: { to: string; label: string; mark: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `mp-nav-item ${isActive ? 'active' : ''}`}>
      <span>{mark}</span>
      <span>{label}</span>
    </NavLink>
  );
}

function PageHead({ label, title, subtitle }: { label: string; title: string; subtitle: string }) {
  return (
    <div className="mp-head">
      <div>
        <div className="mp-label">{label}</div>
        <h1>{title}</h1>
        <p className="mp-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function MissionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const missions = useAppStore((state) => state.missions);
  return (
    <>
      <PageHead label="/api/public/missions" title={t('missions.title')} subtitle={t('missions.subtitle')} />
      <div className="mp-card mp-list">
        {missions.length ? missions.map((mission) => (
          <button className="mp-mission-row" key={mission.id} onClick={() => navigate(`/missions/${mission.id}`)}>
            <div>
              <div className="mp-row-tight">
                <span className="mp-chip">{t(`status.${mission.status}`, mission.status)}</span>
                {mission.owner?.type === 'agent' ? <span className="mp-chip dark">{t('missions.pm')}: {mission.owner.displayName}</span> : null}
                <span className="mp-muted mp-mono mp-small">{mission.id}</span>
              </div>
              <h2>{mission.title}</h2>
              <p className="mp-muted">{mission.objective}</p>
              <div className="mp-facts">
                <span>{t('common.owner')}: {mission.owner?.displayName ?? '-'}</span>
                <span>{t('common.artifacts')}: {mission.artifactCount ?? 0}</span>
                <span>{t('common.pending')}: {mission.pendingCount ?? 0}</span>
              </div>
            </div>
            <div className="mp-sidecell">
              <span className="mp-chip">{mission.issues?.completed ?? 0}/{mission.issues?.total ?? 0} {t('common.issues')} · {percent(mission)}%</span>
              <span>{t('common.budget')}: {money(mission.spentCents ?? mission.missionSpendCents)} / {money(mission.budgetCapCents ?? mission.dailyBudgetCents)}</span>
              <span>{t('common.burn')}: {mission.sandboxSummary?.burnRateCentsPerMinute ?? 0}c/min</span>
              <span>{t(`status.${mission.sandboxSummary?.state ?? 'none'}`)}</span>
            </div>
          </button>
        )) : <Empty />}
      </div>
    </>
  );
}

function WorkroomPage({ missionId }: { missionId?: string }) {
  const { t } = useTranslation();
  const events = useAppStore((state) => state.events);
  const workroom = useAppStore((state) => (missionId ? state.workrooms[missionId] : undefined));
  if (!workroom) return <Empty />;
  const strip = workroom.metricStrip;
  return (
    <>
      <PageHead label="/api/public/missions/:id/workroom" title={workroom.mission.title || t('workroom.title')} subtitle={workroom.mission.objective} />
      <div className="mp-metrics">
        <Stat label={t('workroom.metric.active')} value={String(strip.activeSandboxCount)} sub={`${strip.privateCap.activePrivateSandboxes}/${strip.privateCap.maxConcurrentPrivateSandboxes} ${t('workroom.metric.private')}`} />
        <Stat label={t('workroom.metric.burn')} value={`${strip.burnRateCentsPerMinute.toFixed(1)}c/min`} sub="cost_event + sandbox_burn" />
        <Stat label={t('workroom.metric.spend')} value={money(strip.missionSpendCents)} sub={`${money(strip.dailyBudgetCents)} ${t('workroom.metric.daily')}`} />
        <Stat label={t('common.open')} value={String(workroom.openIssues)} sub={workroom.costGuardrailStatus?.state ?? '-'} />
      </div>
      <SandboxPanel sandbox={workroom.missionSandbox} />
      <div className="mp-grid two">
        <section className="mp-card">
          <div className="mp-section-title"><strong>{t('workroom.cards')}</strong><span className="mp-muted mp-mono">/work-cards</span></div>
          {workroom.workCards.map((card) => (
            <div className="mp-row" key={card.id}>
              <div>
                <strong>{card.title}</strong>
                <p className="mp-muted">{card.description}</p>
              </div>
              <span className="mp-chip">{t(`status.${card.status}`, card.status)}</span>
              <span>{card.sandboxAffinity?.tier ?? 'tier0'}</span>
              <span>{money(card.cost?.spentCents)}</span>
            </div>
          ))}
        </section>
        <section className="mp-card">
          <div className="mp-section-title"><strong>{t('workroom.events')}</strong><span className="mp-muted mp-mono">SSE</span></div>
          {events.slice(0, 8).map((event, index) => (
            <div className="mp-event" key={`${event.auditEventId ?? event.type}-${index}`}>
              <span className="mp-chip">{event.type}</span>
              <span>{event.payload?.sandboxId ?? event.missionId ?? '-'}</span>
              <span className="mp-muted mp-mono">{event.auditEventId ?? '-'}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function SandboxPanel({ sandbox }: { sandbox: MissionSandboxReadModel }) {
  const { t } = useTranslation();
  const state = sandbox.state ?? 'none';
  return (
    <section className="mp-card mp-sandbox" data-sandbox-state={state}>
      <div className="mp-section-title">
        <strong>{t('workroom.missionSandbox')}</strong>
        <span className={`mp-chip ${state === 'running' ? 'dark' : ''}`}>{t(`status.${state}`)}</span>
      </div>
      <div className="mp-sandbox-grid">
        <Info label={t('workroom.lazySlot')} value={sandbox.sandboxId ?? 'mission:<missionId>'} />
        <Info label={t('workroom.repoPath')} value={sandbox.repoPath ?? '-'} />
        <Info label={t('workroom.r2Snapshot')} value={sandbox.r2SnapshotKey ?? '-'} />
        <Info label={t('workroom.envVersion')} value={sandbox.environmentVersionId ?? '-'} />
        <Info label={t('workroom.credentials')} value={(sandbox.injectedCredentialIds ?? []).join(', ') || '-'} />
        <Info label={t('workroom.variables')} value={(sandbox.injectedVariableKeys ?? []).join(', ') || '-'} />
      </div>
      <div className="mp-processes">
        {(sandbox.processes ?? []).length ? sandbox.processes?.map((process) => (
          <div className="mp-event" key={process.id}>
            <span className="mp-chip">{process.status}</span>
            <span>{process.command}</span>
            <span className="mp-muted mp-mono">{process.terminalSessionId ?? process.streamId ?? '-'}</span>
          </div>
        )) : <span className="mp-muted">{t('status.none')}</span>}
      </div>
    </section>
  );
}

function AgentsPage() {
  const { t } = useTranslation();
  const workrooms = useAppStore((state) => Object.values(state.workrooms));
  const agents = new Map<string, MissionAgentRow>();
  workrooms.forEach((workroom) => workroom.agentInstances.forEach((row) => agents.set(row.agent.id, row)));
  return (
    <>
      <PageHead label="/api/public/missions/:id/agents" title={t('agents.title')} subtitle={t('agents.subtitle')} />
      <div className="mp-grid three">{Array.from(agents.values()).map((row) => <AgentCard row={row} key={row.instance.id} />)}</div>
      {!agents.size ? <Empty /> : null}
    </>
  );
}

function AgentPage({ missionId, instanceId }: { missionId?: string; instanceId?: string }) {
  const { t } = useTranslation();
  const workroom = useAppStore((state) => (missionId ? state.workrooms[missionId] : undefined));
  const row = workroom?.agentInstances.find((item) => item.instance.id === instanceId);
  return (
    <>
      <PageHead label="/api/public/missions/:id/agent-instances/:instanceId" title={t('agent.title')} subtitle={row?.agent.displayName ?? t('agent.noInstance')} />
      {row ? <div className="mp-grid two"><AgentCard row={row} /><SandboxPanel sandbox={{ state: 'none', ...row.instance.sandboxSummary }} /></div> : <Empty />}
    </>
  );
}

function AgentCard({ row }: { row: MissionAgentRow }) {
  const { t } = useTranslation();
  return (
    <section className="mp-card">
      <div className="mp-section-title"><strong>{row.agent.displayName}</strong><span className="mp-chip">{row.role}</span></div>
      <Info label={t('agent.global')} value={row.agent.globalIdentity?.role ?? row.agent.id} />
      <Info label={t('agent.instance')} value={row.instance.displayAlias ?? row.instance.id} />
      <Info label={t('common.status')} value={row.instance.workState?.status ?? '-'} />
      <Info label={t('agent.sandbox')} value={row.instance.sandboxSummary?.state ?? 'none'} />
    </section>
  );
}

function ArtifactsPage() {
  const { t } = useTranslation();
  return <><PageHead label="/api/public/missions/:id/workroom" title={t('artifacts.title')} subtitle={t('artifacts.subtitle')} /><Empty /></>;
}

function GrowthPage() {
  const { t } = useTranslation();
  const events = useAppStore((state) => state.events);
  return (
    <>
      <PageHead label="/api/public/growth-center/*" title={t('growth.title')} subtitle={t('growth.subtitle')} />
      <div className="mp-grid three">
        <section className="mp-card"><h2>{t('growth.feed')}</h2>{events.map((event, index) => <div className="mp-event" key={index}>{event.type}</div>)}</section>
        <section className="mp-card"><h2>{t('growth.candidates')}</h2><Empty /></section>
        <section className="mp-card"><h2>{t('growth.rollbacks')}</h2><Empty /></section>
      </div>
    </>
  );
}

function BudgetPage() {
  const { t } = useTranslation();
  const budget = useAppStore((state) => state.budget);
  const spend = useAppStore((state) => state.spend);
  return (
    <>
      <PageHead label="/api/public/settings/budget" title={t('budget.title')} subtitle={t('budget.subtitle')} />
      <div className="mp-metrics">
        <Stat label={t('budget.daily')} value={money(budget?.dailyBudgetCents)} />
        <Stat label={t('budget.global')} value={money(budget?.globalCapCents)} />
        <Stat label={t('budget.current')} value={money(budget?.currentSpendCents?.total)} />
        <Stat label={t('workroom.metric.burn')} value={`${budget?.burnRateCentsPerMinute ?? 0}c/min`} />
      </div>
      <section className="mp-card">
        <div className="mp-section-title"><strong>{t('budget.breakdown')}</strong><span className="mp-muted mp-mono">/settings/budget/missions</span></div>
        {spend.map((row) => <div className="mp-row" key={row.missionId}><strong>{row.title}</strong><span>{row.owner?.displayName ?? row.ownerEmail ?? '-'}</span><span>{money(row.spentCents ?? row.spendCents)}</span><span>{row.burnRateCentsPerMinute ?? 0}c/min</span></div>)}
        {!spend.length ? <Empty /> : null}
      </section>
    </>
  );
}

function EnvironmentPage() {
  const { t } = useTranslation();
  const workroom = useAppStore((state) => Object.values(state.workrooms)[0]);
  const sandbox = workroom?.missionSandbox;
  return (
    <>
      <PageHead label="/api/public/missions/:id/environment" title={t('environment.title')} subtitle={t('environment.subtitle')} />
      {sandbox ? <SandboxPanel sandbox={sandbox} /> : <Empty />}
    </>
  );
}

function ChatPage({ threadId }: { threadId?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHead label="/api/public/direct-threads/:threadId/messages" title={t('chat.title')} subtitle={t('chat.subtitle')} />
      <section className="mp-card mp-chat"><div className="mp-muted mp-mono">{threadId}</div><textarea placeholder={t('chat.placeholder')} /><button className="mp-button dark">{t('common.send')}</button></section>
    </>
  );
}

function AdminPage() {
  const { t } = useTranslation();
  const session = useAppStore((state) => state.session);
  const overview = useAppStore((state) => state.adminOverview);
  const users = useAppStore((state) => state.adminUsers);
  const whitelist = useAppStore((state) => state.adminWhitelist);
  const missions = useAppStore((state) => state.adminMissions);
  if (session?.role !== 'admin') return <div className="mp-denied">{t('admin.denied')}</div>;
  return (
    <>
      <PageHead label="/api/public/admin/*" title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div className="mp-metrics">
        <Stat label={t('common.spend')} value={money(overview?.totalSpendCents)} />
        <Stat label={t('nav.missions')} value={String(overview?.missionCount ?? 0)} />
        <Stat label={t('admin.users')} value={String(overview?.activeUserCount ?? 0)} />
      </div>
      <div className="mp-grid two">
        <section className="mp-card"><h2>{t('admin.users')}</h2>{users.map((user) => <div className="mp-row" key={user.userId}><span>{user.email}</span><span>{user.role}</span><span>{money(user.todaySpendCents ?? user.dailySpendCents)}</span><span>{money(user.dailyBudgetCents)}</span></div>)}</section>
        <section className="mp-card"><h2>{t('admin.whitelist')}</h2>{whitelist.map((entry) => <div className="mp-row" key={entry.id}><span>{entry.type}</span><span>{entry.value}</span><span>{String(Boolean(entry.enabled))}</span></div>)}</section>
      </div>
      <section className="mp-card"><h2>{t('admin.allMissions')}</h2>{missions.map((mission, index) => <div className="mp-row" key={mission.missionId ?? mission.title ?? index}><span>{mission.ownerEmail ?? '-'}</span><span>{mission.title}</span><span>{mission.status ?? '-'}</span><span>{money(mission.spendCents ?? mission.spentCents)}</span></div>)}</section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div>{sub ? <div className="mp-muted mp-small">{sub}</div> : null}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="mp-label">{label}</div><div className="mp-mono mp-wrap">{value}</div></div>;
}

function Empty() {
  const { t } = useTranslation();
  return <div className="mp-empty">{t('common.empty')}</div>;
}
