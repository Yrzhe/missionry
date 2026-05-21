import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import type { AgentLibraryItem, MissionAgentRow, MissionSummary } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

type NewMissionForm = {
  title: string;
  objective: string;
  dailyBudgetCents: string;
  leaderMode: 'default' | 'pick' | 'human';
  leaderAgentId: string;
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
  const queryClient = useQueryClient();
  const missionsQuery = useQuery({ queryKey: queryKeys.missions, queryFn: api.missions });
  const missions = missionsQuery.data?.items ?? [];
  // NOTE: the list intentionally does NOT prefetch each mission's full workroom.
  // Doing that fired one /workroom request per mission (×N) and, combined with the
  // SSE invalidate→refetch loop, exhausted browser connections (ERR_INSUFFICIENT_RESOURCES
  // → white screen). The list renders from the mission summary only.
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewMissionForm>({ title: '', objective: '', dailyBudgetCents: '2500', leaderMode: 'default', leaderAgentId: '' });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: api.agents,
  });
  const libraryAgents: AgentLibraryItem[] = agentsQuery.data?.items ?? [];

  // Filter options come from the lightweight global agents list (one request),
  // not from every mission's workroom.
  const agentOptions = useMemo(
    () => libraryAgents.map((agent) => ({ id: agent.id, displayName: agent.displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [libraryAgents],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return missions.filter((mission) => {
      const matchesStatus = statusFilter === 'all' || mission.status === statusFilter;
      const matchesAgent = agentFilter === 'all' || mission.owner?.agentId === agentFilter;
      const matchesQuery = !normalizedQuery || [mission.title, mission.objective, mission.owner?.displayName].some((value) => value?.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesAgent && matchesQuery;
    });
  }, [agentFilter, missions, query, statusFilter]);

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

  const createMissionMutation = useMutation({
    mutationFn: api.createMission,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.missions });
      setModalOpen(false);
      setForm({ title: '', objective: '', dailyBudgetCents: '2500', leaderMode: 'default', leaderAgentId: '' });
      navigate(`/missions/${created.missionId}`, { replace: false });
    },
  });

  const createDemoMutation = useMutation({
    mutationFn: api.createDemoMission,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.missions });
      if (created.missionId) navigate(`/missions/${created.missionId}`);
    },
  });
  const deleteMissionMutation = useMutation({
    mutationFn: api.deleteMission,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.missions });
    },
  });

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createMissionMutation.mutateAsync({
        title: form.title.trim(),
        objective: form.objective.trim(),
        dailyBudgetCents: Number(form.dailyBudgetCents),
        leaderMode: form.leaderMode,
        leaderAgentId: form.leaderMode === 'pick' ? form.leaderAgentId : undefined,
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('missions.createError'));
    }
  }

  async function createDemoMission() {
    setError(null);
    try {
      await createDemoMutation.mutateAsync();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('missions.createError'));
    }
  }

  async function deleteMission(mission: MissionSummary) {
    if (!window.confirm(t('missions.delete.confirm', { title: mission.title }))) return;
    setError(null);
    try {
      await deleteMissionMutation.mutateAsync(mission.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('missions.delete.error'));
    }
  }

  const isSubmitting = createMissionMutation.isPending || createDemoMutation.isPending || deleteMissionMutation.isPending;

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
          <MissionRow key={mission.id} mission={mission} agents={[]} isDeleting={deleteMissionMutation.variables === mission.id && deleteMissionMutation.isPending} onDelete={() => void deleteMission(mission)} onOpen={() => navigate(`/missions/${mission.id}`)} />
        )) : <EmptyCta title={t('missions.empty.title')} body={t('missions.empty.body')} action={t('missions.empty.action')} secondaryAction={t('missions.empty.demoAction')} onAction={() => setModalOpen(true)} onSecondaryAction={() => void createDemoMission()} />}
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
            <fieldset className="mp-fieldset">
              <legend>{t('missions.modal.leader')}</legend>
              <label className="mp-radio-line"><input type="radio" name="leaderMode" checked={form.leaderMode === 'default'} onChange={() => setForm((current) => ({ ...current, leaderMode: 'default', leaderAgentId: '' }))} />{t('missions.modal.leader.default')}</label>
              <label className="mp-radio-line"><input type="radio" name="leaderMode" checked={form.leaderMode === 'pick'} onChange={() => setForm((current) => ({ ...current, leaderMode: 'pick' }))} />{t('missions.modal.leader.pick')}</label>
              <label className="mp-radio-line"><input type="radio" name="leaderMode" checked={form.leaderMode === 'human'} onChange={() => setForm((current) => ({ ...current, leaderMode: 'human', leaderAgentId: '' }))} />{t('missions.modal.leader.human')}</label>
            </fieldset>
            {form.leaderMode === 'pick' ? (
              <label>
                {t('missions.modal.leaderAgent')}
                <select value={form.leaderAgentId} onChange={(event) => setForm((current) => ({ ...current, leaderAgentId: event.target.value }))} required>
                  <option value="">{agentsQuery.isLoading ? t('common.loading') : t('missions.modal.leaderAgentPlaceholder')}</option>
                  {libraryAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}
                </select>
              </label>
            ) : null}
            {error ? <div className="mp-denied">{error}</div> : null}
            <button className="mp-button dark" disabled={isSubmitting || (form.leaderMode === 'pick' && !form.leaderAgentId)}>{isSubmitting ? t('common.saving') : t('common.create')}</button>
          </form>
        </div>
      ) : null}
    </Shell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div><div className="mp-muted mp-small">{sub}</div></div>;
}

function MissionRow({ mission, agents, isDeleting, onOpen, onDelete }: { mission: MissionSummary; agents: MissionAgentRow[]; isDeleting: boolean; onOpen: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const ownerName = mission.owner?.displayName ?? '-';
  const spend = mission.spentCents ?? mission.missionSpendCents ?? 0;
  const budget = mission.budgetCapCents ?? mission.dailyBudgetCents ?? 0;
  const sandboxState = mission.sandboxSummary?.state ?? 'none';

  return (
    <div className="mp-mission-row">
      <button className="mp-mission-row-main" onClick={onOpen}>
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
      <button className="mp-button danger mp-row-delete" disabled={isDeleting} onClick={onDelete}>{isDeleting ? t('common.saving') : t('common.delete')}</button>
    </div>
  );
}

function EmptyCta({ title, body, action, secondaryAction, onAction, onSecondaryAction }: { title: string; body: string; action: string; secondaryAction?: string; onAction: () => void; onSecondaryAction?: () => void }) {
  return (
    <div className="mp-empty mp-empty-cta">
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="mp-row-tight">
        <button className="mp-button dark" onClick={onAction}>{action}</button>
        {secondaryAction && onSecondaryAction ? <button className="mp-button" onClick={onSecondaryAction}>{secondaryAction}</button> : null}
      </div>
    </div>
  );
}
