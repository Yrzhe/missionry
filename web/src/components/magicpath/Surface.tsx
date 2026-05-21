import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../lib/store';
import type { MissionAgentRow, MissionSandboxReadModel } from '../../lib/types';
import { Shell } from './Shell';
import { AgentTaskList } from './agent-library/AgentLibrary';

type Page =
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

export function MagicPathSurface(props: SurfaceProps) {
  const { t } = useTranslation();
  return (
    <Shell title={t(`nav.${props.page === 'budget' || props.page === 'environment' ? 'settings' : props.page}`)}>
      {props.page === 'agents' ? <AgentsPage /> : null}
      {props.page === 'agent' ? <AgentPage missionId={props.missionId} instanceId={props.instanceId} /> : null}
      {props.page === 'artifacts' ? <ArtifactsPage /> : null}
      {props.page === 'growth' ? <GrowthPage /> : null}
      {props.page === 'budget' ? <BudgetPage /> : null}
      {props.page === 'environment' ? <EnvironmentPage /> : null}
      {props.page === 'chat' ? <ChatPage threadId={props.threadId} /> : null}
      {props.page === 'admin' ? <AdminPage /> : null}
    </Shell>
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
        <Info label={t('workroom.lazySlot')} value={t(`status.${state}`)} />
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
            <span className="mp-muted">{t('workroom.processes')}</span>
          </div>
        )) : <span className="mp-muted">{t('status.none')}</span>}
      </div>
    </section>
  );
}

function AgentsPage() {
  const { t } = useTranslation();
  const workroomsMap = useAppStore((state) => state.workrooms);
  const workrooms = Object.values(workroomsMap);
  const agents = new Map<string, MissionAgentRow>();
  workrooms.forEach((workroom) => workroom.agentInstances.forEach((row) => agents.set(row.agent.id, row)));
  return (
    <>
      <PageHead label={t('agents.endpoint')} title={t('agents.title')} subtitle={t('agents.subtitle')} />
      <div className="mp-grid three">{Array.from(agents.values()).map((row) => <AgentCard row={row} key={row.instance.id} />)}</div>
      {!agents.size ? <EmptyNote title={t('agents.empty.title')} body={t('agents.empty.body')} /> : null}
    </>
  );
}

function AgentPage({ missionId, instanceId }: { missionId?: string; instanceId?: string }) {
  const { t } = useTranslation();
  const workroom = useAppStore((state) => (missionId ? state.workrooms[missionId] : undefined));
  const row = workroom?.agentInstances.find((item) => item.instance.id === instanceId);
  return (
    <>
      <PageHead label={t('agent.instance')} title={t('agent.title')} subtitle={row?.agent.displayName ?? t('agent.noInstance')} />
      {row ? <div className="mp-grid two"><AgentCard row={row} /><SandboxPanel sandbox={{ state: 'none', ...row.instance.sandboxSummary }} /></div> : <EmptyNote title={t('agent.empty.title')} body={t('agent.empty.body')} />}
    </>
  );
}

function AgentCard({ row }: { row: MissionAgentRow }) {
  const { t } = useTranslation();
  return (
    <section className="mp-card">
      <div className="mp-section-title"><strong>{row.agent.displayName}</strong><span className="mp-chip">{row.role}</span></div>
      <Info label={t('agent.global')} value={row.agent.globalIdentity?.role ?? '-'} />
      <Info label={t('agent.instance')} value={row.instance.displayAlias ?? row.agent.displayName} />
      <Info label={t('common.status')} value={row.instance.workState?.status ?? '-'} />
      <Info label={t('agent.sandbox')} value={row.instance.sandboxSummary?.state ?? 'none'} />
      <AgentTaskList agentId={row.agent.id} />
    </section>
  );
}

function ArtifactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const firstMissionId = useAppStore((state) => state.missions[0]?.id);
  return <><PageHead label={t('artifacts.title')} title={t('artifacts.title')} subtitle={t('artifacts.subtitle')} /><EmptyNote title={t('artifacts.empty.title')} body={t('artifacts.empty.body')} action={t('artifacts.empty.action')} onAction={() => navigate(firstMissionId ? `/missions/${firstMissionId}` : '/missions')} /></>;
}

function GrowthPage() {
  const { t } = useTranslation();
  const events = useAppStore((state) => state.events);
  return (
    <>
      <PageHead label={t('growth.feed')} title={t('growth.title')} subtitle={t('growth.subtitle')} />
      <div className="mp-grid three">
        <section className="mp-card"><h2>{t('growth.feed')}</h2>{events.length ? events.map((event, index) => <div className="mp-event" key={index}>{event.type}</div>) : <p className="mp-muted">{t('growth.empty.feed')}</p>}</section>
        <section className="mp-card"><h2>{t('growth.candidates')}</h2><p className="mp-muted">{t('growth.empty.candidates')}</p></section>
        <section className="mp-card"><h2>{t('growth.rollbacks')}</h2><p className="mp-muted">{t('growth.empty.rollbacks')}</p></section>
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
      <PageHead label={t('budget.breakdown')} title={t('budget.title')} subtitle={t('budget.subtitle')} />
      <div className="mp-metrics">
        <Stat label={t('budget.daily')} value={money(budget?.dailyBudgetCents)} />
        <Stat label={t('budget.global')} value={money(budget?.globalCapCents)} />
        <Stat label={t('budget.current')} value={money(budget?.currentSpendCents?.total)} />
        <Stat label={t('workroom.metric.burn')} value={`${budget?.burnRateCentsPerMinute ?? 0}c/min`} />
      </div>
      <section className="mp-card">
        <div className="mp-section-title"><strong>{t('budget.breakdown')}</strong><span className="mp-muted">{t('common.updated')}</span></div>
        {spend.map((row) => <div className="mp-row" key={row.missionId}><strong>{row.title}</strong><span>{row.owner?.displayName ?? row.ownerEmail ?? '-'}</span><span>{money(row.spentCents ?? row.spendCents)}</span><span>{row.burnRateCentsPerMinute ?? 0}c/min</span></div>)}
        {!spend.length ? <EmptyNote title={t('budget.empty.title')} body={t('budget.empty.body')} /> : null}
      </section>
    </>
  );
}

function EnvironmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workroomsMap = useAppStore((state) => state.workrooms);
  const workroom = Object.values(workroomsMap)[0];
  const sandbox = workroom?.missionSandbox;
  return (
    <>
      <PageHead label={t('workroom.environment.title')} title={t('environment.title')} subtitle={t('environment.subtitle')} />
      {sandbox ? <SandboxPanel sandbox={sandbox} /> : <EmptyNote title={t('environment.empty.title')} body={t('environment.empty.body')} action={t('environment.empty.action')} onAction={() => navigate('/missions')} />}
    </>
  );
}

function ChatPage({ threadId }: { threadId?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHead label={t('chat.messages')} title={t('chat.title')} subtitle={t('chat.subtitle')} />
      <section className="mp-card mp-chat"><div className="mp-muted">{threadId ? t('chat.context') : t('common.loading')}</div><textarea placeholder={t('chat.placeholder')} /><button className="mp-button dark">{t('common.send')}</button></section>
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
      <PageHead label={t('admin.overview')} title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div className="mp-metrics">
        <Stat label={t('common.spend')} value={money(overview?.totalSpendCents)} />
        <Stat label={t('nav.missions')} value={String(overview?.missionCount ?? 0)} />
        <Stat label={t('admin.users')} value={String(overview?.activeUserCount ?? 0)} />
      </div>
      <div className="mp-grid two">
        <section className="mp-card"><h2>{t('admin.users')}</h2>{users.length ? users.map((user) => <div className="mp-row" key={user.userId}><span>{user.email}</span><span>{user.role}</span><span>{money(user.todaySpendCents ?? user.dailySpendCents)}</span><span>{money(user.dailyBudgetCents)}</span></div>) : <p className="mp-muted">{t('admin.empty.users')}</p>}</section>
        <section className="mp-card"><h2>{t('admin.whitelist')}</h2>{whitelist.length ? whitelist.map((entry) => <div className="mp-row" key={entry.id}><span>{entry.type}</span><span>{entry.value}</span><span>{String(Boolean(entry.enabled))}</span></div>) : <p className="mp-muted">{t('admin.empty.whitelist')}</p>}</section>
      </div>
      <section className="mp-card"><h2>{t('admin.allMissions')}</h2>{missions.length ? missions.map((mission, index) => <div className="mp-row" key={mission.missionId ?? mission.title ?? index}><span>{mission.ownerEmail ?? '-'}</span><span>{mission.title}</span><span>{mission.status ?? '-'}</span><span>{money(mission.spendCents ?? mission.spentCents)}</span></div>) : <p className="mp-muted">{t('admin.empty.missions')}</p>}</section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div>{sub ? <div className="mp-muted mp-small">{sub}</div> : null}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="mp-label">{label}</div><div className="mp-mono mp-wrap">{value}</div></div>;
}

function EmptyNote({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="mp-empty mp-empty-cta"><h2>{title}</h2><p>{body}</p>{action && onAction ? <button className="mp-button dark" onClick={onAction}>{action}</button> : null}</div>;
}
