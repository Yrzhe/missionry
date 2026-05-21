import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import type { MissionAgentRow, MissionSummary } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

type NewMissionForm = {
  title: string;
  objective: string;
  dailyBudgetCents: string;
};

const STATUS_FILTERS = ['all', 'active', 'running', 'planning', 'blocked', 'completed'] as const;

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;
const initials = (name?: string) => (name ?? '-').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '-';

function issuePercent(mission: MissionSummary) {
  const total = mission.issues?.total ?? 0;
  if (!total) return 0;
  return Math.round(((mission.issues?.completed ?? 0) / total) * 100);
}

export function MissionsHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const missions = useAppStore((state) => state.missions);
  const workrooms = useAppStore((state) => state.workrooms);
  const setMissions = useAppStore((state) => state.setMissions);
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewMissionForm>({ title: '', objective: '', dailyBudgetCents: '2500' });

  const agentOptions = useMemo(() => {
    const rows = new Map<string, MissionAgentRow['agent']>();
    Object.values(workrooms).forEach((workroom) => {
      workroom.agentInstances.forEach((row) => rows.set(row.agent.id, row.agent));
    });
    return Array.from(rows.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [workrooms]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return missions.filter((mission) => {
      const workroom = workrooms[mission.id];
      const matchesStatus = statusFilter === 'all' || mission.status === statusFilter;
      const matchesAgent = agentFilter === 'all' || workroom?.agentInstances.some((row) => row.agent.id === agentFilter);
      const matchesQuery = !normalizedQuery || [mission.title, mission.objective, mission.owner?.displayName].some((value) => value?.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesAgent && matchesQuery;
    });
  }, [agentFilter, missions, query, statusFilter, workrooms]);

  const stats = useMemo(() => {
    const active = missions.filter((mission) => ['active', 'running', 'planning'].includes(mission.status)).length;
    return {
      active,
      pending: missions.reduce((sum, mission) => sum + (mission.pendingCount ?? 0), 0),
      artifacts: missions.reduce((sum, mission) => sum + (mission.artifactCount ?? 0), 0),
      spend: missions.reduce((sum, mission) => sum + (mission.spentCents ?? mission.missionSpendCents ?? 0), 0),
      activeSandboxes: missions.reduce((sum, mission) => sum + (mission.sandboxSummary?.activeSandboxCount ?? (mission.sandboxSummary?.state === 'running' ? 1 : 0)), 0),
      burn: missions.reduce((sum, mission) => sum + (mission.sandboxSummary?.burnRateCentsPerMinute ?? 0), 0),
    };
  }, [missions]);

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.createMission({
        title: form.title.trim(),
        objective: form.objective.trim(),
        dailyBudgetCents: Number(form.dailyBudgetCents),
      });
      const next = await api.missions();
      setMissions(next.items);
      setModalOpen(false);
      setForm({ title: '', objective: '', dailyBudgetCents: '2500' });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('missions.createError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell
      title={t('missions.title')}
      meta={<span className="mp-muted">{t('missions.endpoint')}</span>}
      actions={<button className="mp-button dark" onClick={() => setModalOpen(true)}>{t('missions.new')}</button>}
    >
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('missions.endpoint')}</div>
          <h1>{t('missions.title')}</h1>
          <p className="mp-muted">{t('missions.subtitle')}</p>
        </div>
        <label className="mp-search">
          <span className="mp-label">{t('missions.search')}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('missions.searchPlaceholder')} />
        </label>
      </div>

      <div className="mp-metrics">
        <Stat label={t('missions.stat.active')} value={String(stats.active)} sub={`${stats.activeSandboxes} ${t('missions.stat.activeSandboxes')}`} />
        <Stat label={t('missions.stat.pending')} value={String(stats.pending)} sub={t('missions.stat.pendingSub')} />
        <Stat label={t('missions.stat.artifacts')} value={String(stats.artifacts)} sub={t('missions.stat.artifactsSub')} />
        <Stat label={t('missions.stat.spend')} value={money(stats.spend)} sub={`${t('common.burn')} ${stats.burn.toFixed(1)}${t('common.centsPerMinute')}`} />
      </div>

      <div className="mp-filterbar">
        <div className="mp-filter-pills">
          {STATUS_FILTERS.map((status) => (
            <button key={status} className={`mp-button ${statusFilter === status ? 'dark' : ''}`} onClick={() => setStatusFilter(status)}>
              {status === 'all' ? t('common.all') : t(`status.${status}`, status)}
            </button>
          ))}
        </div>
        <label className="mp-inline-field">
          <span>{t('missions.filter')}</span>
          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
            <option value="all">{t('missions.allAgents')}</option>
            {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}
          </select>
        </label>
      </div>

      <div className="mp-card mp-list">
        {rows.length ? rows.map((mission) => (
          <MissionRow key={mission.id} mission={mission} agents={workrooms[mission.id]?.agentInstances ?? []} onOpen={() => navigate(`/missions/${mission.id}`)} />
        )) : <EmptyCta title={t('missions.empty.title')} body={t('missions.empty.body')} action={t('missions.empty.action')} onAction={() => setModalOpen(true)} />}
      </div>

      {modalOpen ? (
        <div className="mp-modal-backdrop" role="presentation">
          <form className="mp-modal" onSubmit={submitMission}>
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('missions.modal.endpoint')}</div>
                <h2>{t('missions.modal.title')}</h2>
              </div>
              <button type="button" className="mp-button" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
            </div>
            <label>{t('missions.modal.missionTitle')}<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <label>{t('missions.modal.objective')}<textarea value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} required /></label>
            <label>{t('missions.modal.dailyBudgetCents')}<input value={form.dailyBudgetCents} onChange={(event) => setForm((current) => ({ ...current, dailyBudgetCents: event.target.value }))} type="number" min={0} required /></label>
            {error ? <div className="mp-denied">{error}</div> : null}
            <button className="mp-button dark" disabled={isSubmitting}>{isSubmitting ? t('common.saving') : t('common.create')}</button>
          </form>
        </div>
      ) : null}
    </Shell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div><div className="mp-muted mp-small">{sub}</div></div>;
}

function MissionRow({ mission, agents, onOpen }: { mission: MissionSummary; agents: MissionAgentRow[]; onOpen: () => void }) {
  const { t } = useTranslation();
  const ownerName = mission.owner?.displayName ?? '-';
  const spend = mission.spentCents ?? mission.missionSpendCents ?? 0;
  const budget = mission.budgetCapCents ?? mission.dailyBudgetCents ?? 0;
  const sandboxState = mission.sandboxSummary?.state ?? 'none';

  return (
    <button className="mp-mission-row" onClick={onOpen}>
      <div>
        <div className="mp-row-tight">
          <span className="mp-chip"><span className={`mp-status-dot ${mission.status}`} />{t(`status.${mission.status}`, mission.status)}</span>
          {mission.owner?.type === 'agent' ? <span className="mp-chip dark">{t('missions.pm')}: {ownerName}</span> : null}
          <span className="mp-muted mp-small">{t('common.updated')}: {mission.updatedAt ?? mission.updated ?? '-'}</span>
        </div>
        <h2>{mission.title}</h2>
        <p className="mp-muted">{mission.objective}</p>
        <div className="mp-facts">
          <span>{t('common.owner')}: {ownerName}</span>
          <span className="mp-avatar-stack"><span className="mp-avatar owner">{initials(ownerName)}</span>{agents.slice(0, 4).map((row) => <span className="mp-avatar" key={row.instance.id}>{initials(row.agent.displayName)}</span>)}</span>
          <span>{mission.artifactCount ?? 0} {t('common.artifacts')}</span>
          <span>{mission.pendingCount ?? 0} {t('common.pending')}</span>
        </div>
      </div>
      <div className="mp-sidecell">
        <span className="mp-chip"><strong>{mission.issues?.completed ?? 0}/{mission.issues?.total ?? 0}</strong> {t('common.issues')} · {issuePercent(mission)}%</span>
        <span>{t('common.budget')}: {money(spend)} / {money(budget)}</span>
        <span>{t('common.burn')}: {(mission.sandboxSummary?.burnRateCentsPerMinute ?? 0).toFixed(1)}{t('common.centsPerMinute')}</span>
        <span>{t('common.sandbox')}: {t(`status.${sandboxState}`)}</span>
      </div>
    </button>
  );
}

function EmptyCta({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="mp-empty mp-empty-cta">
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="mp-button dark" onClick={onAction}>{action}</button>
    </div>
  );
}
