import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { invalidateMission, queryKeys } from '../../../lib/query';
import type { TFunction } from 'i18next';
import type {
  CreateWorkCardInput,
  MissionAgentRow,
  MissionChatMessage,
  MissionEnvironmentVariable,
  MissionEvent,
  MissionFileContent,
  MissionFileEntry,
  MissionSandboxReadModel,
  WorkCard,
  WorkroomReadModel,
} from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';
import { Markdown } from '../Markdown';

type NewWorkCardForm = {
  title: string;
  description: string;
  assigneeInstanceId: string;
  tier: CreateWorkCardInput['sandboxAffinity']['tier'];
};

type WorkroomTab = 'plan' | 'activity' | 'artifacts';

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;
const EMPTY_MESSAGES: MissionChatMessage[] = [];
const EMPTY_EVENTS: MissionEvent[] = [];
const ROOT_PATH = '';

export function Workroom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkroomTab>('plan');
  const workroomQuery = useQuery({
    queryKey: queryKeys.workroom(id ?? ''),
    queryFn: () => api.workroom(id ?? ''),
    enabled: Boolean(id),
  });
  const chatQuery = useQuery({
    queryKey: queryKeys.missionChat(id ?? ''),
    queryFn: () => api.missionChat(id ?? ''),
    enabled: Boolean(id),
  });
  const eventsQuery = useQuery({
    queryKey: queryKeys.missionEvents(id ?? ''),
    queryFn: () => api.missionEvents(id ?? ''),
    enabled: Boolean(id) && activeTab === 'activity',
  });
  const workroom = workroomQuery.data;
  const chatMessages = chatQuery.data?.items ?? EMPTY_MESSAGES;
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewWorkCardForm>({ title: '', description: '', assigneeInstanceId: '', tier: 'tier0' });
  const [chatBody, setChatBody] = useState('');
  const [showSilenced, setShowSilenced] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [sandboxAction, setSandboxAction] = useState<string | null>(null);
  const [planAction, setPlanAction] = useState(false);
  const [workCardAction, setWorkCardAction] = useState<string | null>(null);
  const [directThreadAction, setDirectThreadAction] = useState<string | null>(null);

  const defaultAssignee = workroom?.agentInstances[0]?.instance.id ?? '';
  const selectedAssignee = form.assigneeInstanceId || defaultAssignee;
  const leaderInstanceId = workroom?.mission.leaderInstanceId ?? (workroom?.mission.owner?.type === 'agent' ? workroom.mission.owner.agentInstanceId : undefined);
  const visibleMessages = showSilenced ? chatMessages : chatMessages.filter((message) => message.body !== '[NO]');
  const mentionQuery = chatBody.match(/@([\w.-]*)$/)?.[1].toLowerCase();
  const mentionOptions = mentionQuery === undefined ? [] : (workroom?.agentInstances ?? []).filter((row) => row.agent.displayName.toLowerCase().includes(mentionQuery)).slice(0, 5);
  const missionEvents = useMemo(() => {
    const source = eventsQuery.data?.items ?? EMPTY_EVENTS;
    return [...source].sort((a, b) => eventTime(b) - eventTime(a));
  }, [eventsQuery.data?.items]);

  const guardrailProgress = useMemo(() => {
    if (!workroom?.metricStrip.dailyBudgetCents) return 0;
    return Math.min(100, Math.round((workroom.metricStrip.missionSpendCents / workroom.metricStrip.dailyBudgetCents) * 100));
  }, [workroom]);

  function refreshMissionQueries() {
    if (!id) return;
    invalidateMission(id);
  }

  const generatePlanMutation = useMutation({
    mutationFn: () => api.decomposeMission(id ?? ''),
    onSuccess: refreshMissionQueries,
  });

  const startWorkCardMutation = useMutation({
    mutationFn: (workCardId: string) => api.startWorkCard(id ?? '', workCardId),
    onSuccess: refreshMissionQueries,
  });

  const createWorkCardMutation = useMutation({
    mutationFn: (input: CreateWorkCardInput) => api.createWorkCard(id ?? '', input),
    onSuccess: refreshMissionQueries,
  });

  const sandboxMutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: refreshMissionQueries,
  });

  const sendChatMutation = useMutation({
    mutationFn: (body: string) => api.sendMissionChat(id ?? '', body),
    onSuccess: async (response) => {
      if (!id) return;
      queryClient.setQueryData<{ items: MissionChatMessage[] }>(queryKeys.missionChat(id), (existing) => {
        const byId = new Map((existing?.items ?? []).map((message) => [message.id, message]));
        if (response.message) byId.set(response.message.id, response.message);
        response.agentReplies.forEach((reply) => byId.set(reply.id, reply));
        return { items: Array.from(byId.values()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) };
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.missionChat(id) });
      setChatBody('');
    },
  });

  const directThreadMutation = useMutation({
    mutationFn: (instanceId: string) => api.createDirectThread(id ?? '', instanceId),
  });
  const deleteMissionMutation = useMutation({
    mutationFn: () => api.deleteMission(id ?? ''),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.missions });
      navigate('/missions', { replace: true });
    },
  });

  async function generatePlan() {
    if (!id) return;
    setPlanAction(true);
    setError(null);
    try {
      await generatePlanMutation.mutateAsync();
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : t('workroom.generatePlan.error'));
    } finally {
      setPlanAction(false);
    }
  }

  async function startWorkCard(workCardId: string) {
    if (!id) return;
    setWorkCardAction(workCardId);
    setError(null);
    try {
      await startWorkCardMutation.mutateAsync(workCardId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : t('workroom.startCard.error'));
    } finally {
      setWorkCardAction(null);
    }
  }

  async function openDirectThread(instanceId: string) {
    if (!id) return;
    setDirectThreadAction(instanceId);
    setError(null);
    try {
      const response = await directThreadMutation.mutateAsync(instanceId);
      navigate(`/chat/${response.chatThreadId}`);
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : t('workroom.directThread.error'));
    } finally {
      setDirectThreadAction(null);
    }
  }

  async function submitWorkCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedAssignee) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createWorkCardMutation.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assigneeInstanceId: selectedAssignee,
        status: 'approved',
        sandboxAffinity: { tier: form.tier, reason: 'manual' },
      });
      setModalOpen(false);
      setForm({ title: '', description: '', assigneeInstanceId: '', tier: 'tier0' });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('workroom.newCard.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runSandboxAction(key: string, action: () => Promise<unknown>) {
    setSandboxAction(key);
    setError(null);
    try {
      await sandboxMutation.mutateAsync(action);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('workroom.sandboxActionError'));
    } finally {
      setSandboxAction(null);
    }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !chatBody.trim()) return;
    setChatError(null);
    setIsSendingChat(true);
    try {
      await sendChatMutation.mutateAsync(chatBody.trim());
    } catch (sendError) {
      setChatError(sendError instanceof Error ? sendError.message : t('workroom.chat.sendError'));
    } finally {
      setIsSendingChat(false);
    }
  }

  async function deleteMission() {
    if (!id || !workroom || !window.confirm(t('missions.delete.confirm', { title: workroom.mission.title }))) return;
    setError(null);
    try {
      await deleteMissionMutation.mutateAsync();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('missions.delete.error'));
    }
  }

  function insertMention(row: MissionAgentRow) {
    const handle = row.agent.displayName.toLowerCase().replace(/[\s_]+/g, '-');
    setChatBody((current) => current.replace(/@[\w.-]*$/, `@${handle} `));
  }

  if (!workroom && workroomQuery.isLoading) {
    return (
      <Shell title={t('workroom.route')} meta={<span className="mp-muted">{t('workroom.loadingMeta')}</span>}>
        <WorkroomSkeleton />
      </Shell>
    );
  }

  if (!workroom) {
    return (
      <Shell title={t('workroom.route')} meta={<span className="mp-muted">{t('workroom.loadingMeta')}</span>}>
        <div className="mp-empty mp-empty-cta"><h2>{t('workroom.empty.title')}</h2><p>{workroomQuery.error instanceof Error ? workroomQuery.error.message : t('workroom.empty.body')}</p></div>
      </Shell>
    );
  }

  const strip = workroom.metricStrip;
  const canStartMission = workroom.missionSandbox.state === 'none' || workroom.missionSandbox.state === 'paused';
  const canPauseMission = workroom.missionSandbox.state === 'running';
  const ownerName = workroom.mission.owner?.type === 'agent'
    ? workroom.agentInstances.find((row) => row.instance.id === workroom.mission.owner?.agentInstanceId || row.agent.id === workroom.mission.owner?.agentId)?.agent.displayName ?? workroom.mission.owner?.displayName ?? '-'
    : workroom.mission.owner?.displayName ?? '-';

  return (
    <Shell
      title={t('workroom.route')}
      meta={<span className="mp-muted">{t('workroom.meta')}</span>}
      actions={<div className="mp-row-tight"><button className="mp-button" onClick={() => setModalOpen(true)}>{t('workroom.newCard')}</button><button className="mp-button danger" disabled={deleteMissionMutation.isPending} onClick={() => void deleteMission()}>{deleteMissionMutation.isPending ? t('common.saving') : t('common.delete')}</button></div>}
    >
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('common.owner')}: {ownerName}</div>
          <h1>{workroom.mission.title || t('workroom.title')}</h1>
          <p className="mp-muted">{workroom.mission.objective}</p>
        </div>
        <span className="mp-chip"><span className="mp-status-dot running" />{workroom.costGuardrailStatus?.state ?? t('workroom.guardrail')}</span>
      </div>

      <div className="mp-metrics">
        <Stat label={t('workroom.metric.active')} value={String(strip.activeSandboxCount)} sub={`${strip.privateCap.activePrivateSandboxes}/${strip.privateCap.maxConcurrentPrivateSandboxes} ${t('workroom.metric.private')}`} />
        <Stat label={t('workroom.metric.burn')} value={`${strip.burnRateCentsPerMinute.toFixed(1)}${t('common.centsPerMinute')}`} sub={t('workroom.metric.autoPause')} />
        <Stat label={t('workroom.metric.spend')} value={money(strip.missionSpendCents)} sub={`${money(strip.dailyBudgetCents)} ${t('workroom.metric.daily')}`} />
        <Stat label={t('common.open')} value={String(workroom.openIssues)} sub={workroom.updatedAt ?? t('common.updated')} />
      </div>

      <section className="mp-card mp-guardrail">
        <div>
          <strong>{t('workroom.guardrail')}</strong>
          <p className="mp-muted">{t('workroom.guardrailBody')}</p>
        </div>
        <div className="mp-progress-wrap">
          <div className="mp-progress"><div style={{ width: `${guardrailProgress}%` }} /></div>
          <div className="mp-muted mp-small">{money(strip.missionSpendCents)} / {money(strip.dailyBudgetCents)}</div>
        </div>
      </section>

      <section className="mp-card mp-env-area">
        <div className="mp-env-status">
          <div>
            <div className="mp-label">{t('workroom.environment.title')}</div>
            <h2>{t('workroom.environment.heading')}</h2>
            <p className="mp-muted">{t('workroom.environment.lifecycle')}</p>
            <span className="mp-chip">{t('workroom.environment.auto')}</span>
          </div>
          <div className="mp-env-status-line">
            <span className="mp-chip dark"><span className={`mp-status-dot ${workroom.missionSandbox.state}`} />{t(`status.${workroom.missionSandbox.state}`)}</span>
            <span className="mp-muted">{(workroom.missionSandbox.burnRateCentsPerMinute ?? 0).toFixed(1)}{t('common.centsPerMinute')}</span>
            <div className="mp-row-tight">
              {canStartMission ? <button className="mp-button" disabled={sandboxAction === `mission:${workroom.mission.id}`} onClick={() => void runSandboxAction(`mission:${workroom.mission.id}`, () => api.startMissionSandbox(workroom.mission.id))}>{sandboxAction === `mission:${workroom.mission.id}` ? t('common.saving') : t('workroom.startSandbox')}</button> : null}
              {canPauseMission ? <button className="mp-button" disabled={sandboxAction === `mission:${workroom.mission.id}`} onClick={() => void runSandboxAction(`mission:${workroom.mission.id}`, () => api.pauseMissionSandbox(workroom.mission.id))}>{sandboxAction === `mission:${workroom.mission.id}` ? t('common.saving') : t('workroom.pauseSandbox')}</button> : null}
            </div>
          </div>
        </div>
        <MissionEnvironmentPanel missionId={workroom.mission.id} />
        <FileBrowser missionId={workroom.mission.id} />
      </section>

      <section className="mp-card mp-agent-sandbox-compact">
        <div className="mp-section-title">
          <div>
            <strong>{t('workroom.agentSandboxes')}</strong>
            <p className="mp-muted">{t('workroom.agentSandboxNote')}</p>
          </div>
          <button className="mp-button" onClick={() => navigate('/agents')}>{t('agents.title')}</button>
        </div>
        <div className="mp-private-lines">
          {workroom.agentInstances.length ? workroom.agentInstances.map((row) => (
            <AgentSandboxLine
              key={row.instance.id}
              row={row}
              isBusy={sandboxAction === row.instance.id}
              onStart={() => void runSandboxAction(row.instance.id, () => api.startAgentSandbox(workroom.mission.id, row.instance.id))}
              onPause={() => void runSandboxAction(row.instance.id, () => api.pauseAgentSandbox(workroom.mission.id, row.instance.id))}
              isOpeningChat={directThreadAction === row.instance.id}
              onOpenChat={() => void openDirectThread(row.instance.id)}
            />
          )) : <EmptyCta title={t('workroom.emptyAgents.title')} body={t('workroom.emptyAgents.body')} action={t('workroom.emptyAgents.action')} onAction={() => navigate('/agents')} />}
        </div>
      </section>

      <div className="mp-workroom-layout">
        <section className="mp-card mp-panel">
          <div className="mp-tabs" role="tablist">
            {(['plan', 'activity', 'artifacts'] as WorkroomTab[]).map((tab) => (
              <button key={tab} className={`mp-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{t(`workroom.${tab}`)}</button>
            ))}
          </div>
          {activeTab === 'plan' ? <PlanTab workroom={workroom} isGeneratingPlan={planAction} activeWorkCardId={workCardAction} onGeneratePlan={() => void generatePlan()} onStartWorkCard={(workCardId) => void startWorkCard(workCardId)} onNewCard={() => setModalOpen(true)} /> : null}
          {activeTab === 'activity' ? <ActivityTab events={missionEvents} /> : null}
          {activeTab === 'artifacts' ? <FileBrowser missionId={workroom.mission.id} expanded /> : null}
        </section>

        <section className="mp-card mp-chat-panel">
          <div className="mp-section-title">
            <div>
              <div className="mp-label">{t('workroom.chat.label')}</div>
              <strong>{t('workroom.chat.title')}</strong>
            </div>
            <label className="mp-inline-check"><input type="checkbox" checked={showSilenced} onChange={(event) => setShowSilenced(event.target.checked)} />{t('workroom.chat.showSilenced')}</label>
          </div>
          <div className="mp-chat-scroll">
            {visibleMessages.length ? visibleMessages.map((message) => <ChatMessage key={message.id} message={message} workroom={workroom} leaderInstanceId={leaderInstanceId} />) : <div className="mp-empty mp-empty-cta"><p>{t('workroom.chat.empty')}</p></div>}
          </div>
          <form className="mp-chat-composer" onSubmit={sendChat}>
            <div className="mp-mention-wrap">
              <textarea value={chatBody} onChange={(event) => setChatBody(event.target.value)} placeholder={t('workroom.chat.placeholder')} />
              {mentionOptions.length ? (
                <div className="mp-mention-menu">
                  {mentionOptions.map((row) => <button type="button" key={row.instance.id} data-mention-id={row.instance.id} onClick={() => insertMention(row)}>@{row.agent.displayName}</button>)}
                </div>
              ) : null}
            </div>
            <button className="mp-button dark" disabled={isSendingChat || !chatBody.trim()}>{isSendingChat ? t('common.saving') : t('common.send')}</button>
          </form>
          {chatError ? <div className="mp-denied">{chatError}</div> : null}
        </section>
      </div>

      {modalOpen ? (
        <div className="mp-modal-backdrop" role="presentation">
          <form className="mp-modal" onSubmit={submitWorkCard}>
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('workroom.newCard.label')}</div>
                <h2>{t('workroom.newCard.title')}</h2>
              </div>
              <button type="button" className="mp-button" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
            </div>
            <label>{t('workroom.newCard.cardTitle')}<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <label>{t('workroom.newCard.description')}<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>{t('workroom.assignee')}<select value={selectedAssignee} onChange={(event) => setForm((current) => ({ ...current, assigneeInstanceId: event.target.value }))} required>{workroom.agentInstances.map((row) => <option key={row.instance.id} value={row.instance.id}>{row.agent.displayName} · {row.role}</option>)}</select></label>
            <label>{t('workroom.affinity')}<select value={form.tier} onChange={(event) => setForm((current) => ({ ...current, tier: event.target.value as NewWorkCardForm['tier'] }))}><option value="tier0">{t('workroom.tier0')}</option><option value="mission">{t('workroom.tierMission')}</option><option value="private">{t('workroom.tierPrivate')}</option></select></label>
            {error ? <div className="mp-denied">{error}</div> : null}
            <button className="mp-button dark" disabled={isSubmitting || !selectedAssignee}>{isSubmitting ? t('common.saving') : t('common.create')}</button>
          </form>
        </div>
      ) : null}
    </Shell>
  );
}

function WorkroomSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="mp-skeleton-page">
      <div className="mp-skeleton-line wide" />
      <div className="mp-metrics">
        {[0, 1, 2, 3].map((item) => <div className="mp-card mp-stat" key={item}><div className="mp-skeleton-line" /><div className="mp-skeleton-line short" /></div>)}
      </div>
      <section className="mp-card mp-skeleton-panel"><h2>{t('common.loading')}</h2><p className="mp-muted">{t('workroom.loadingMeta')}</p></section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div><div className="mp-muted mp-small">{sub}</div></div>;
}

function PlanTab({ workroom, isGeneratingPlan, activeWorkCardId, onGeneratePlan, onStartWorkCard, onNewCard }: { workroom: WorkroomReadModel; isGeneratingPlan: boolean; activeWorkCardId: string | null; onGeneratePlan: () => void; onStartWorkCard: (workCardId: string) => void; onNewCard: () => void }) {
  const { t } = useTranslation();
  const queuePositions = useMemo(() => queuePositionByCard(workroom.workCards), [workroom.workCards]);
  const hasCards = workroom.workCards.length > 0;
  return (
    <div className="mp-tab-panel">
      <section className="mp-plan-cta">
        <div>
          <strong>{hasCards ? t('workroom.autonomy.title') : t('workroom.autonomy.waitingTitle')}</strong>
          <p className="mp-muted">{hasCards ? t('workroom.autonomy.body') : t('workroom.autonomy.waitingBody')}</p>
        </div>
        <button className="mp-button" disabled={isGeneratingPlan || !workroom.agentInstances.length} onClick={onGeneratePlan}>{isGeneratingPlan ? t('common.saving') : t('workroom.generatePlan.regenerate')}</button>
      </section>
      <div className="mp-section-title">
        <strong>{t('workroom.cards')}</strong>
        <button className="mp-button" onClick={onNewCard}>{t('workroom.newCard')}</button>
      </div>
      <div className="mp-workcard-list">
        {workroom.workCards.length ? workroom.workCards.map((card) => <WorkCardRow key={card.id} card={card} queuePosition={queuePositions.get(card.id)} workroom={workroom} isStarting={activeWorkCardId === card.id} onStart={() => onStartWorkCard(card.id)} />) : <div className="mp-empty mp-empty-cta"><h2>{t('workroom.autonomy.waitingTitle')}</h2><p>{t('workroom.autonomy.waitingBody')}</p></div>}
      </div>
    </div>
  );
}

function queuePositionByCard(cards: WorkCard[]) {
  const byAssignee = new Map<string, number>();
  const result = new Map<string, number>();
  cards.forEach((card) => {
    if (card.status !== 'queued') return;
    if (typeof card.queuePosition === 'number') {
      result.set(card.id, card.queuePosition);
      return;
    }
    const key = card.assigneeInstanceId ?? 'unassigned';
    const next = (byAssignee.get(key) ?? 0) + 1;
    byAssignee.set(key, next);
    result.set(card.id, next);
  });
  return result;
}

function ActivityTab({ events }: { events: MissionEvent[] }) {
  const { t } = useTranslation();
  return (
    <div className="mp-tab-panel">
      <div className="mp-section-title"><strong>{t('workroom.activityTitle')}</strong><span className="mp-muted">{t('workroom.activityHint')}</span></div>
      <div className="mp-activity-list">
        {events.length ? events.map((event, index) => <ActivityRow event={event} key={`${event.auditEventId ?? event.type}-${event.occurredAt ?? index}`} />) : <div className="mp-empty"><p>{t('workroom.activityEmpty')}</p></div>}
      </div>
    </div>
  );
}

function ActivityRow({ event }: { event: MissionEvent }) {
  const { t } = useTranslation();
  const actor = eventActor(event, t);
  return (
    <div className="mp-activity-row">
      <span className="mp-chip">{eventActionLabel(event.type, t)}</span>
      <div>
        <strong>{event.payload?.diffSummary ?? event.payload?.subjectType ?? eventActionLabel(event.type, t)}</strong>
        <p className="mp-muted">{actor} · {event.payload?.subjectType ?? event.payload?.model ?? t('workroom.activitySystem')}</p>
      </div>
      <span className="mp-muted">{event.occurredAt ?? '-'}</span>
    </div>
  );
}

function eventTime(event: MissionEvent) {
  const raw = event.occurredAt ?? event.createdAt ?? event.updatedAt ?? '';
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventActor(event: MissionEvent, t: TFunction) {
  const actorType = event.actorType ?? event.payload?.actor?.type;
  const actorName = event.authorName ?? event.actorName ?? event.payload?.actor?.displayName ?? event.payload?.actor?.name;
  if (actorName) return actorName;
  if (actorType === 'user') return t('workroom.activityActor.user');
  if (actorType === 'agent' || actorType === 'agent_instance') return event.payload?.actor?.id ?? t('workroom.activityActor.agent');
  if (actorType === 'system') return t('workroom.activityActor.system');
  return event.payload?.actor?.id ?? t('workroom.activityActor.system');
}

function eventActionLabel(type: string, t: TFunction) {
  return t(`workroom.activity.action.${type}`, { defaultValue: type.replace(/_/g, ' ') });
}

function FileBrowser({ missionId, expanded = false }: { missionId: string; expanded?: boolean }) {
  const { t } = useTranslation();
  const [path, setPath] = useState(ROOT_PATH);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const filesQuery = useQuery({
    queryKey: queryKeys.missionFiles(missionId, path),
    queryFn: () => api.missionFiles(missionId, path),
    retry: 1,
  });
  const contentQuery = useQuery({
    queryKey: queryKeys.missionFileContent(missionId, selectedPath ?? ''),
    queryFn: () => api.missionFileContent(missionId, selectedPath ?? ''),
    enabled: selectedPath !== null,
    retry: 1,
  });
  const entries: MissionFileEntry[] = filesQuery.data?.items ?? [];
  const selected: MissionFileContent | undefined = contentQuery.data;

  function openEntry(entry: MissionFileEntry) {
    if (entry.type === 'directory') {
      setPath(entry.path);
      setSelectedPath(null);
      return;
    }
    setSelectedPath(entry.path);
  }

  return (
    <div className={`mp-file-browser ${expanded ? 'expanded' : ''}`}>
      <div className="mp-section-title">
        <div>
          <strong>{t('workroom.files.title')}</strong>
          <p className="mp-muted">{t('workroom.files.subtitle')}</p>
        </div>
        {path ? <button className="mp-button" onClick={() => { setPath(ROOT_PATH); setSelectedPath(null); }}>{t('workroom.files.root')}</button> : null}
      </div>
      {filesQuery.isError ? <div className="mp-denied">{t('workroom.files.error')} · {filesQuery.error instanceof Error ? filesQuery.error.message : ''}<button className="mp-button" onClick={() => void filesQuery.refetch()}>{t('common.retry')}</button></div> : null}
      <div className="mp-file-grid">
        <div className="mp-file-list">
          {filesQuery.isLoading ? <div className="mp-muted">{t('common.loading')}</div> : null}
          {entries.length ? entries.map((entry) => (
            <button className="mp-file-row" key={entry.path} onClick={() => openEntry(entry)}>
              <span>{t(entry.type === 'directory' ? 'workroom.files.kind.directory' : 'workroom.files.kind.file')}</span>
              <strong>{entry.name}</strong>
              <span className="mp-muted">{entry.size ? `${Math.round(entry.size / 1024)} KB` : ''}</span>
            </button>
          )) : !filesQuery.isLoading && !filesQuery.isError ? <div className="mp-empty"><p>{t('workroom.files.empty')}</p></div> : null}
        </div>
        <div className="mp-file-preview">
          {selected ? (
            <>
              <div className="mp-label">{selected.path}</div>
              {selected.path.endsWith('.md') || selected.mimeType?.includes('markdown') ? <Markdown value={selected.content} /> : <pre>{selected.content}</pre>}
            </>
          ) : contentQuery.isError ? <p className="mp-denied">{t('workroom.files.previewError')} · {contentQuery.error instanceof Error ? contentQuery.error.message : ''} <button className="mp-button" onClick={() => void contentQuery.refetch()}>{t('common.retry')}</button></p> : contentQuery.isLoading ? <p className="mp-muted">{t('common.loading')}</p> : <p className="mp-muted">{t('workroom.files.select')}</p>}
        </div>
      </div>
    </div>
  );
}

function MissionEnvironmentPanel({ missionId }: { missionId: string }) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const environmentQuery = useQuery({
    queryKey: queryKeys.missionEnvironment(missionId),
    queryFn: () => api.missionEnvironment(missionId),
  });
  const variables = environmentQuery.data?.variables ?? [];
  const updateMutation = useMutation({
    mutationFn: (next: MissionEnvironmentVariable[]) => api.updateMissionEnvironment(missionId, next),
    onSuccess: async () => {
      setKey('');
      setValue('');
      await environmentQuery.refetch();
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key.trim()) return;
    setError(null);
    try {
      const next = [...variables.filter((item) => item.key !== key.trim()), { key: key.trim(), value, masked: true, isSecret: true }];
      await updateMutation.mutateAsync(next);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('workroom.environment.updateError'));
    }
  }

  async function remove(name: string) {
    setError(null);
    try {
      await updateMutation.mutateAsync(variables.filter((item) => item.key !== name));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('workroom.environment.updateError'));
    }
  }

  return (
    <section className="mp-env-vars">
      <div className="mp-section-title">
        <div>
          <strong>{t('workroom.environment.variables')}</strong>
          <p className="mp-muted">{t('workroom.environment.variablesHint')}</p>
        </div>
        {environmentQuery.isFetching ? <span className="mp-muted">{t('common.loading')}</span> : null}
      </div>
      {environmentQuery.isError ? <div className="mp-denied">{t('workroom.environment.loadError')}<button className="mp-button" onClick={() => void environmentQuery.refetch()}>{t('common.retry')}</button></div> : null}
      <div className="mp-env-var-list">
        {variables.length ? variables.map((item) => (
          <div className="mp-env-var-row" key={item.key}>
            <strong>{item.key}</strong>
            <span className="mp-muted">{item.masked !== false ? t('workroom.environment.masked') : item.value ?? ''}</span>
            <button className="mp-button danger" disabled={updateMutation.isPending} onClick={() => void remove(item.key)}>{t('common.delete')}</button>
          </div>
        )) : <div className="mp-muted mp-small">{t('workroom.environment.empty')}</div>}
      </div>
      <form className="mp-env-var-form" onSubmit={submit}>
        <input value={key} onChange={(event) => setKey(event.target.value)} placeholder={t('workroom.environment.keyPlaceholder')} />
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t('workroom.environment.valuePlaceholder')} />
        <button className="mp-button" disabled={updateMutation.isPending || !key.trim()}>{updateMutation.isPending ? t('common.saving') : t('workroom.environment.add')}</button>
      </form>
      {error ? <div className="mp-denied">{error}</div> : null}
    </section>
  );
}

function AgentSandboxLine({ row, isBusy, isOpeningChat, onStart, onPause, onOpenChat }: { row: MissionAgentRow; isBusy: boolean; isOpeningChat: boolean; onStart: () => void; onPause: () => void; onOpenChat: () => void }) {
  const { t } = useTranslation();
  const sandbox: MissionSandboxReadModel = { state: 'none', ...row.instance.sandboxSummary };
  const canStart = sandbox.state === 'none' || sandbox.state === 'paused';
  const canPause = sandbox.state === 'running';
  return (
    <div className="mp-private-line">
      <strong>{row.agent.displayName}</strong>
      <span className="mp-chip"><span className={`mp-status-dot ${sandbox.state}`} />{t(`status.${sandbox.state}`)}</span>
      <span className="mp-muted">{(sandbox.burnRateCentsPerMinute ?? 0).toFixed(1)}{t('common.centsPerMinute')}</span>
      <span className="mp-muted">{row.role}</span>
      <div className="mp-row-tight">
        <button className="mp-button" disabled={isOpeningChat} onClick={onOpenChat}>{isOpeningChat ? t('common.saving') : t('workroom.openChat')}</button>
        {canStart ? <button className="mp-button" disabled={isBusy} onClick={onStart}>{isBusy ? t('common.saving') : t('workroom.startSandbox.advanced')}</button> : null}
        {canPause ? <button className="mp-button" disabled={isBusy} onClick={onPause}>{isBusy ? t('common.saving') : t('workroom.pauseSandbox')}</button> : null}
      </div>
    </div>
  );
}

function ChatMessage({ message, workroom, leaderInstanceId }: { message: MissionChatMessage; workroom: WorkroomReadModel; leaderInstanceId?: string }) {
  const { t } = useTranslation();
  const isUser = message.authorType === 'user';
  const isLeader = Boolean(message.authorInstanceId && message.authorInstanceId === leaderInstanceId);
  const authorName = message.authorName || (message.authorInstanceId ? workroom.agentInstances.find((row) => row.instance.id === message.authorInstanceId)?.agent.displayName : undefined) || t('workroom.chat.unknown');
  return (
    <div className={`mp-chat-bubble ${isUser ? 'user' : ''}`}>
      <div className="mp-chat-author">
        <span>{authorName}</span>
        {isLeader ? <span className="mp-chip dark">{t('workroom.chat.leader')}</span> : null}
        <span className="mp-muted">{message.createdAt}</span>
      </div>
      <Markdown value={message.body} />
    </div>
  );
}

function WorkCardRow({ card, queuePosition, workroom, isStarting, onStart }: { card: WorkCard; queuePosition?: number; workroom: WorkroomReadModel; isStarting: boolean; onStart: () => void }) {
  const { t } = useTranslation();
  const assignee = workroom.agentInstances.find((row) => row.instance.id === card.assigneeInstanceId);
  const tier = card.sandboxAffinity?.tier ?? 'tier0';
  const canRerun = ['done', 'failed'].includes(card.status);
  const flow = workCardFlow(card.status);
  return (
    <article className={`mp-workcard-item status-${card.status}`}>
      <div className="mp-workcard-main">
        <div className="mp-section-title">
          <strong>{card.title}</strong>
          <span className={`mp-chip ${card.status === 'running' ? 'dark' : ''}`}>{card.status === 'queued' && queuePosition ? t('workroom.queuePosition', { position: queuePosition }) : t(`status.${card.status}`, card.status)}</span>
        </div>
        <div className="mp-workcard-flow" aria-label={t('workroom.flow.label')}>
          {(['queued', 'running', 'done'] as const).map((step) => <span key={step} className={`mp-flow-step ${flow[step]}`}>{t(`status.${step}`)}</span>)}
        </div>
        <Markdown value={card.description ?? t('workroom.cardNoDescription')} compact />
      </div>
      <div className="mp-workcard-meta">
        <Info label={t('workroom.assignee')} value={assignee?.agent.displayName ?? '-'} />
        <Info label={t('workroom.affinity')} value={t(tier === 'mission' ? 'workroom.tierMission' : tier === 'private' ? 'workroom.tierPrivate' : 'workroom.tier0')} />
        <Info label={t('workroom.cost')} value={money(card.cost?.spentCents)} />
        {canRerun ? <button className="mp-button" disabled={isStarting} onClick={onStart}>{isStarting ? t('common.saving') : t('workroom.rerunCard')}</button> : null}
      </div>
    </article>
  );
}

function workCardFlow(status: string) {
  const order = ['proposed', 'approved', 'pending', 'queued', 'running', 'done'];
  const normalized = status === 'failed' ? 'done' : status;
  const index = order.indexOf(normalized);
  return {
    queued: index >= order.indexOf('queued') ? 'done' : index >= 0 ? 'next' : 'next',
    running: status === 'running' ? 'active' : index > order.indexOf('running') ? 'done' : 'next',
    done: status === 'done' ? 'done' : status === 'failed' ? 'failed' : 'next',
  };
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="mp-kv"><span className="mp-muted">{label}</span><span className="mp-wrap">{value}</span></div>;
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
