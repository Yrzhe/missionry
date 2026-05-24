import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import type { CreateScheduleInput } from '../../../lib/types';
import { Shell } from '../Shell';

const INTERVALS = [
  { minutes: 30, key: 'every30m' },
  { minutes: 60, key: 'hourly' },
  { minutes: 360, key: 'every6h' },
  { minutes: 1440, key: 'daily' },
] as const;

type ScopeOption = 'mission' | 'agent' | 'workspace';

export function Schedules() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const schedulesQuery = useQuery({ queryKey: queryKeys.schedules, queryFn: () => api.schedules() });
  const missionsQuery = useQuery({ queryKey: queryKeys.missions, queryFn: api.missions });
  const items = schedulesQuery.data?.items ?? [];
  const missions = missionsQuery.data?.items ?? [];

  const [scope, setScope] = useState<ScopeOption>('mission');
  const [missionId, setMissionId] = useState('');
  const [agentInstanceId, setAgentInstanceId] = useState('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(1440);
  const [error, setError] = useState<string | null>(null);

  // Agent picker needs the selected mission's instances.
  const workroomQuery = useQuery({
    queryKey: queryKeys.workroom(missionId),
    queryFn: () => api.workroom(missionId),
    enabled: scope === 'agent' && Boolean(missionId),
  });
  const agentRows = workroomQuery.data?.agentInstances ?? [];

  const missionTitle = useMemo(() => new Map(missions.map((m) => [m.id, m.title])), [missions]);

  const createMutation = useMutation({
    mutationFn: (input: CreateScheduleInput) => api.createSchedule(input),
    onSuccess: async () => {
      setTitle(''); setPrompt('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules });
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('schedules.createError')),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.updateSchedule(id, { enabled }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.schedules }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSchedule(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.schedules }); },
  });

  function submit() {
    setError(null);
    if (!title.trim() || !prompt.trim()) { setError(t('schedules.missingFields')); return; }
    if ((scope === 'mission' || scope === 'agent') && !missionId) { setError(t('schedules.missingMission')); return; }
    if (scope === 'agent' && !agentInstanceId) { setError(t('schedules.missingAgent')); return; }
    createMutation.mutate({
      scope,
      missionId: scope === 'workspace' ? undefined : missionId,
      agentInstanceId: scope === 'agent' ? agentInstanceId : undefined,
      title: title.trim(),
      prompt: prompt.trim(),
      intervalMinutes,
    });
  }

  function intervalLabel(minutes: number) {
    const preset = INTERVALS.find((i) => i.minutes === minutes);
    return preset ? t(`schedules.interval.${preset.key}`) : t('schedules.interval.everyN', { count: minutes });
  }

  return (
    <Shell title={t('schedules.title')} meta={<span className="mp-muted">{t('schedules.subtitle')}</span>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('schedules.title')}</div>
          <h1>{t('schedules.heading')}</h1>
          <p className="mp-muted">{t('schedules.intro')}</p>
        </div>
      </div>

      <section className="mp-card mp-schedule-form">
        <div className="mp-section-title"><strong>{t('schedules.new')}</strong></div>
        <div className="mp-schedule-grid">
          <label>{t('schedules.scope')}
            <select value={scope} onChange={(e) => setScope(e.target.value as ScopeOption)}>
              <option value="mission">{t('schedules.scope.mission')}</option>
              <option value="agent">{t('schedules.scope.agent')}</option>
              <option value="workspace">{t('schedules.scope.workspace')}</option>
            </select>
          </label>
          {scope !== 'workspace' ? (
            <label>{t('schedules.mission')}
              <select value={missionId} onChange={(e) => { setMissionId(e.target.value); setAgentInstanceId(''); }}>
                <option value="">{t('schedules.pickMission')}</option>
                {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </label>
          ) : null}
          {scope === 'agent' ? (
            <label>{t('schedules.agent')}
              <select value={agentInstanceId} onChange={(e) => setAgentInstanceId(e.target.value)} disabled={!missionId}>
                <option value="">{t('schedules.pickAgent')}</option>
                {agentRows.map((row) => <option key={row.instance.id} value={row.instance.id}>{row.agent.displayName} · {row.role}</option>)}
              </select>
            </label>
          ) : null}
          <label>{t('schedules.every')}
            <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
              {INTERVALS.map((i) => <option key={i.minutes} value={i.minutes}>{t(`schedules.interval.${i.key}`)}</option>)}
            </select>
          </label>
        </div>
        <label>{t('schedules.titleField')}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('schedules.titlePlaceholder')} /></label>
        <label>{t('schedules.prompt')}<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('schedules.promptPlaceholder')} /></label>
        {error ? <div className="mp-denied">{error}</div> : null}
        <button className="mp-button dark" disabled={createMutation.isPending} onClick={submit}>{createMutation.isPending ? t('common.saving') : t('schedules.create')}</button>
      </section>

      <div className="mp-card mp-list">
        {items.length ? items.map((s) => (
          <div key={s.id} className="mp-schedule-row">
            <div className="mp-schedule-main">
              <strong>{s.title}</strong>
              <span className="mp-muted mp-schedule-meta">
                {t(`schedules.scope.${s.scope}`)}
                {s.missionId ? ` · ${missionTitle.get(s.missionId) ?? s.missionId}` : ''}
                {' · '}{intervalLabel(s.intervalMinutes)}
                {' · '}{t('schedules.next')}: {new Date(s.nextRunAt).toLocaleString()}
              </span>
              <p className="mp-muted mp-schedule-prompt">{s.prompt}</p>
            </div>
            <div className="mp-schedule-actions">
              <label className="mp-inline-check">
                <input type="checkbox" checked={s.enabled} onChange={() => toggleMutation.mutate({ id: s.id, enabled: !s.enabled })} />
                {s.enabled ? t('schedules.enabled') : t('schedules.paused')}
              </label>
              <button className="mp-button danger" onClick={() => deleteMutation.mutate(s.id)}>{t('common.delete')}</button>
            </div>
          </div>
        )) : <div className="mp-empty"><p>{t('schedules.empty')}</p></div>}
      </div>
    </Shell>
  );
}
