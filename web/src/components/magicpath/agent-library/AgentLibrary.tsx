import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import type { AgentLibraryItem, AgentWorkCardList, MissionSummary, WorkCard } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

type AgentForm = {
  displayName: string;
  role: string;
  avatarSeed: string;
};

type AgentEditForm = {
  displayName: string;
  role: string;
  soul: string;
  identity: string;
  skills: string;
};

const ROLE_FILTERS = ['all', 'pm', 'research', 'frontend', 'backend'] as const;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AG';
}

function agentRole(agent: AgentLibraryItem) {
  return agent.role ?? agent.globalIdentity?.role ?? 'agent';
}

function avatarSeed(agent: AgentLibraryItem) {
  const avatar = agent.avatar as { avatarSeed?: string; color?: string } | undefined;
  return avatar?.avatarSeed ?? agent.slug ?? agent.id;
}

function avatarColor(agent: AgentLibraryItem) {
  const colors = ['#5e7a5a', '#3f6577', '#6b4a6f', '#b8701f', '#7a7163', '#a8442a'];
  const avatar = agent.avatar as { color?: string } | undefined;
  if (avatar?.color) return avatar.color;
  const seed = avatarSeed(agent);
  const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[total % colors.length];
}

export function AgentLibrary() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const missionsQuery = useQuery({ queryKey: queryKeys.missions, queryFn: api.missions });
  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: api.agents });
  const missions = missionsQuery.data?.items ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const [filter, setFilter] = useState<(typeof ROLE_FILTERS)[number]>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [recruitAgent, setRecruitAgent] = useState<AgentLibraryItem | null>(null);
  const [editAgent, setEditAgent] = useState<AgentLibraryItem | null>(null);
  const [form, setForm] = useState<AgentForm>({ displayName: '', role: 'agent', avatarSeed: '' });
  const [editForm, setEditForm] = useState<AgentEditForm>({ displayName: '', role: '', soul: '', identity: '', skills: '' });
  const [editMemory, setEditMemory] = useState('');
  const [editProfile, setEditProfile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createAgentMutation = useMutation({
    mutationFn: api.createAgent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      setCreateOpen(false);
      setForm({ displayName: '', role: 'agent', avatarSeed: '' });
    },
  });
  const recruitMutation = useMutation({
    mutationFn: ({ missionId, agentId }: { missionId: string; agentId: string }) => api.recruitAgentToMission(missionId, agentId),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.missions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workroom(variables.missionId) }),
      ]);
      setRecruitAgent(null);
    },
  });
  const updateAgentMutation = useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: Parameters<typeof api.updateAgent>[1] }) => api.updateAgent(agentId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      setEditAgent(null);
    },
  });
  const busy = createAgentMutation.isPending || recruitMutation.isPending || updateAgentMutation.isPending;

  const rows = useMemo(() => {
    return agents.filter((agent) => filter === 'all' || agentRole(agent).toLowerCase().includes(filter));
  }, [agents, filter]);

  async function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createAgentMutation.mutateAsync({
        displayName: form.displayName.trim(),
        role: form.role.trim(),
        avatarSeed: form.avatarSeed.trim() || form.displayName.trim().toLowerCase().replace(/\s+/g, '-'),
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('agents.createError'));
    }
  }

  async function recruit(mission: MissionSummary) {
    if (!recruitAgent) return;
    setError(null);
    try {
      await recruitMutation.mutateAsync({ missionId: mission.id, agentId: recruitAgent.id });
    } catch (recruitError) {
      setError(recruitError instanceof Error ? recruitError.message : t('agents.recruitError'));
    }
  }

  function openEdit(agent: AgentLibraryItem) {
    setEditAgent(agent);
    setEditForm({
      displayName: agent.displayName,
      role: agentRole(agent),
      soul: agent.soul ?? '',
      identity: agent.identity ?? agent.globalIdentity?.baseConfigSummary ?? '',
      skills: (agent.skills ?? []).join(', '),
    });
    setEditMemory('');
    setEditProfile('');
    void Promise.all([api.agentMemory(agent.id), api.memoryProfile()])
      .then(([mem, prof]) => { setEditMemory(mem.memory ?? ''); setEditProfile(prof.profile ?? ''); })
      .catch(() => undefined);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAgent) return;
    const agentId = editAgent.id;
    setError(null);
    try {
      // Save memory (MEMORY.md) + owner profile (USER.md) alongside the config.
      await Promise.all([
        api.updateAgentMemory(agentId, editMemory),
        api.updateMemoryProfile(editProfile),
      ]);
      await updateAgentMutation.mutateAsync({
        agentId,
        input: {
          displayName: editForm.displayName.trim(),
          role: editForm.role.trim(),
          soul: editForm.soul.trim(),
          identity: editForm.identity.trim(),
          skills: editForm.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
        },
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('agents.edit.error'));
    }
  }

  return (
    <Shell title={t('agents.title')} meta={<span className="mp-muted mp-mono">{t('agents.endpoint')}</span>} actions={<button className="mp-button dark" onClick={() => setCreateOpen(true)}>{t('agents.new')}</button>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('agents.endpoint')}</div>
          <h1>{t('agents.libraryTitle')}</h1>
          <p className="mp-muted">{t('agents.subtitle')}</p>
        </div>
        <div className="mp-filter-pills">
          {ROLE_FILTERS.map((role) => <button key={role} className={`mp-button ${filter === role ? 'dark' : ''}`} onClick={() => setFilter(role)}>{role === 'all' ? t('common.all') : t(`agents.role.${role}`)}</button>)}
        </div>
      </div>

      {rows.length ? (
        <div className="mp-agent-grid">
          {rows.map((agent) => <AgentCard key={agent.id} agent={agent} onEdit={() => openEdit(agent)} onRecruit={() => setRecruitAgent(agent)} />)}
        </div>
      ) : (
        <EmptyCta title={t('agents.empty.title')} body={t('agents.empty.body')} action={t('agents.empty.action')} onAction={() => setCreateOpen(true)} />
      )}

      {createOpen ? (
        <div className="mp-modal-backdrop" role="presentation">
          <form className="mp-modal" onSubmit={submitAgent}>
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('agents.modal.endpoint')}</div>
                <h2>{t('agents.modal.title')}</h2>
              </div>
              <button type="button" className="mp-button" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
            </div>
            <label>{t('agents.modal.displayName')}<input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required /></label>
            <label>{t('agents.modal.role')}<input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} required /></label>
            <label>{t('agents.modal.avatarSeed')}<input value={form.avatarSeed} onChange={(event) => setForm((current) => ({ ...current, avatarSeed: event.target.value }))} /></label>
            {error ? <div className="mp-denied">{error}</div> : null}
            <button className="mp-button dark" disabled={busy}>{busy ? t('common.saving') : t('common.create')}</button>
          </form>
        </div>
      ) : null}

      {recruitAgent ? (
        <div className="mp-modal-backdrop" role="presentation">
          <div className="mp-modal">
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('agents.recruit.endpoint')}</div>
                <h2>{t('agents.recruit.title', { name: recruitAgent.displayName })}</h2>
              </div>
              <button type="button" className="mp-button" onClick={() => setRecruitAgent(null)}>{t('common.cancel')}</button>
            </div>
            <div className="mp-recruit-list">
              {missions.length ? missions.map((mission) => <button className="mp-recruit-row" key={mission.id} disabled={busy} onClick={() => void recruit(mission)}><strong>{mission.title}</strong><span className="mp-muted">{mission.status}</span></button>) : <p className="mp-muted">{t('agents.recruit.noMissions')}</p>}
            </div>
            {error ? <div className="mp-denied">{error}</div> : null}
          </div>
        </div>
      ) : null}

      {editAgent ? (
        <div className="mp-modal-backdrop" role="presentation">
          <form className="mp-modal" onSubmit={submitEdit}>
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('agents.edit.endpoint')}</div>
                <h2>{t('agents.edit.title', { name: editAgent.displayName })}</h2>
              </div>
              <button type="button" className="mp-button" onClick={() => setEditAgent(null)}>{t('common.cancel')}</button>
            </div>
            <label>{t('agents.modal.displayName')}<input value={editForm.displayName} onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))} required /></label>
            <label>{t('agents.modal.role')}<input value={editForm.role} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))} required /></label>
            <label>{t('agents.edit.soul')}<textarea value={editForm.soul} onChange={(event) => setEditForm((current) => ({ ...current, soul: event.target.value }))} /></label>
            <label>{t('agents.edit.identity')}<textarea value={editForm.identity} onChange={(event) => setEditForm((current) => ({ ...current, identity: event.target.value }))} /></label>
            <label>{t('agents.edit.skills')}<input value={editForm.skills} onChange={(event) => setEditForm((current) => ({ ...current, skills: event.target.value }))} placeholder={t('agents.edit.skillsPlaceholder')} /></label>
            <label>{t('agents.edit.memory')}<textarea value={editMemory} onChange={(event) => setEditMemory(event.target.value)} placeholder={t('agents.edit.memoryPlaceholder')} /><span className="mp-muted mp-field-hint">{t('agents.edit.memoryHint')}</span></label>
            <label>{t('agents.edit.userProfile')}<textarea value={editProfile} onChange={(event) => setEditProfile(event.target.value)} placeholder={t('agents.edit.userProfilePlaceholder')} /><span className="mp-muted mp-field-hint">{t('agents.edit.userProfileHint')}</span></label>
            {error ? <div className="mp-denied">{error}</div> : null}
            <button className="mp-button dark" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
          </form>
        </div>
      ) : null}
    </Shell>
  );
}

function AgentCard({ agent, onEdit, onRecruit }: { agent: AgentLibraryItem; onEdit: () => void; onRecruit: () => void }) {
  const { t } = useTranslation();
  const role = agentRole(agent);
  const skills = agent.skills ?? [];
  return (
    <article className="mp-card mp-agent-card">
      <div className="mp-agent-card-head">
        <div className="mp-agent-avatar" style={{ background: avatarColor(agent) }}>{initials(agent.displayName)}</div>
        <div>
          <h2>{agent.displayName}</h2>
          <p className="mp-muted">{role}</p>
        </div>
      </div>
      <div className="mp-row-tight">
        <span className="mp-chip">{t('agents.avatarSeed')}: {avatarSeed(agent)}</span>
        <span className="mp-chip">{t('agents.model')}: {agent.model ?? agent.globalIdentity?.baseConfigSummary ?? '-'}</span>
      </div>
      <p className="mp-muted">{t('agents.skills')}: {skills.length ? skills.join(', ') : t('common.pending')}</p>
      <AgentTaskList agentId={agent.id} compact />
      <div className="mp-row-tight">
        <button className="mp-button dark" onClick={onRecruit}>{t('agents.recruit.action')}</button>
        <button className="mp-button" onClick={onEdit}>{t('agents.edit.action')}</button>
      </div>
      <div className="mp-muted mp-mono mp-small">{agent.updatedAt ?? agent.createdAt ?? agent.id}</div>
    </article>
  );
}

export function AgentTaskList({ agentId, compact = false }: { agentId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const tasksQuery = useQuery({
    queryKey: queryKeys.agentWorkCards(agentId),
    queryFn: () => api.agentWorkCards(agentId),
  });
  const tasks: AgentWorkCardList | null = tasksQuery.data ? { running: tasksQuery.data.running ?? null, queued: tasksQuery.data.queued ?? [], recentDone: tasksQuery.data.recentDone ?? [] } : null;

  const queued = tasks?.queued ?? [];
  const recentDone = tasks?.recentDone ?? [];
  return (
    <section className={`mp-agent-tasks ${compact ? 'compact' : ''}`}>
      <div className="mp-section-title">
        <strong>{t('agents.tasks.title')}</strong>
        {tasksQuery.isLoading ? <span className="mp-muted">{t('common.loading')}</span> : null}
      </div>
      {tasksQuery.isError ? <div className="mp-muted mp-small">{t('agents.tasks.unavailable')}</div> : null}
      {tasks?.running ? <TaskRow card={tasks.running} label={t('agents.tasks.running')} /> : <div className="mp-muted mp-small">{t('agents.tasks.noRunning')}</div>}
      {queued.length ? (
        <div className="mp-agent-task-group">
          <div className="mp-label">{t('agents.tasks.queued')}</div>
          {queued.map((card, index) => <TaskRow key={card.id} card={card} label={t('agents.tasks.queuePosition', { position: card.queuePosition ?? index + 1 })} />)}
        </div>
      ) : <div className="mp-muted mp-small">{t('agents.tasks.noQueued')}</div>}
      {recentDone.length ? (
        <div className="mp-agent-task-group">
          <div className="mp-label">{t('agents.tasks.recentDone')}</div>
          {recentDone.slice(0, compact ? 3 : 8).map((card) => <TaskRow key={card.id} card={card} label={t('status.done')} />)}
        </div>
      ) : null}
    </section>
  );
}

function TaskRow({ card, label }: { card: WorkCard; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="mp-agent-task-row">
      <span className={`mp-chip ${card.status === 'running' ? 'dark' : ''}`}>{label}</span>
      <div>
        <strong>{card.title}</strong>
        <p className="mp-muted">{card.missionTitle ?? card.missionId ?? '-'} · {t(`status.${card.status}`, card.status)}</p>
      </div>
    </div>
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
