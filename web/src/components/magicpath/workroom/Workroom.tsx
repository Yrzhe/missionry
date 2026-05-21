import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import type { TFunction } from 'i18next';
import type {
  CreateWorkCardInput,
  MissionAgentRow,
  MissionChatMessage,
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
  const workroom = useAppStore((state) => (id ? state.workrooms[id] : undefined));
  const isWorkroomLoading = useAppStore((state) => (id ? state.workroomLoading[id] === true : false));
  const setWorkroom = useAppStore((state) => state.setWorkroom);
  const missionChatsMap = useAppStore((state) => state.missionChats);
  const chatMessages = id ? missionChatsMap[id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  const setMissionChat = useAppStore((state) => state.setMissionChat);
  const appendMissionChat = useAppStore((state) => state.appendMissionChat);
  const storeEvents = useAppStore((state) => state.events);
  const [activeTab, setActiveTab] = useState<WorkroomTab>('plan');
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
  const [remoteEvents, setRemoteEvents] = useState<MissionEvent[]>(EMPTY_EVENTS);
  const lastRefreshEvent = useRef<string | null>(null);

  const defaultAssignee = workroom?.agentInstances[0]?.instance.id ?? '';
  const selectedAssignee = form.assigneeInstanceId || defaultAssignee;
  const leaderInstanceId = workroom?.mission.leaderInstanceId ?? (workroom?.mission.owner?.type === 'agent' ? workroom.mission.owner.agentInstanceId : undefined);
  const visibleMessages = showSilenced ? chatMessages : chatMessages.filter((message) => message.body !== '[NO]');
  const mentionQuery = chatBody.match(/@([\w.-]*)$/)?.[1].toLowerCase();
  const mentionOptions = mentionQuery === undefined ? [] : (workroom?.agentInstances ?? []).filter((row) => row.agent.displayName.toLowerCase().includes(mentionQuery)).slice(0, 5);
  const missionEvents = useMemo(() => {
    const local = storeEvents.filter((event) => !id || event.missionId === id);
    const source = remoteEvents.length ? remoteEvents : local;
    return [...source].sort((a, b) => eventTime(b) - eventTime(a));
  }, [id, remoteEvents, storeEvents]);

  const guardrailProgress = useMemo(() => {
    if (!workroom?.metricStrip.dailyBudgetCents) return 0;
    return Math.min(100, Math.round((workroom.metricStrip.missionSpendCents / workroom.metricStrip.dailyBudgetCents) * 100));
  }, [workroom]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.missionChat(id)
      .then((response) => {
        if (alive) setMissionChat(id, response.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, setMissionChat]);

  useEffect(() => {
    if (!id || activeTab !== 'activity') return;
    let alive = true;
    api.missionEvents(id)
      .then((response) => {
        if (alive) setRemoteEvents(response.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeTab, id]);

  const refreshWorkroom = useCallback(async () => {
    if (!id) return;
    const next = await api.workroom(id);
    setWorkroom(id, next);
  }, [id, setWorkroom]);

  useEffect(() => {
    if (!id) return;
    const event = storeEvents.find((item) => item.missionId === id && shouldRefreshWorkroom(item.type));
    if (!event) return;
    const eventKey = `${event.auditEventId ?? event.type}:${event.occurredAt ?? ''}:${event.payload?.subjectId ?? ''}`;
    if (lastRefreshEvent.current === eventKey) return;
    lastRefreshEvent.current = eventKey;
    void refreshWorkroom().catch(() => undefined);
  }, [id, refreshWorkroom, storeEvents]);

  async function generatePlan() {
    if (!id) return;
    setPlanAction(true);
    setError(null);
    try {
      await api.decomposeMission(id);
      await refreshWorkroom();
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
      await api.startWorkCard(id, workCardId);
      await refreshWorkroom();
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
      const response = await api.createDirectThread(id, instanceId);
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
      await api.createWorkCard(id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        assigneeInstanceId: selectedAssignee,
        status: 'approved',
        sandboxAffinity: { tier: form.tier, reason: 'manual' },
      });
      await refreshWorkroom();
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
      await action();
      await refreshWorkroom();
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
      const response = await api.sendMissionChat(id, chatBody.trim());
      if (response.message) appendMissionChat(id, response.message);
      response.agentReplies.forEach((reply) => appendMissionChat(id, reply));
      setChatBody('');
    } catch (sendError) {
      setChatError(sendError instanceof Error ? sendError.message : t('workroom.chat.sendError'));
    } finally {
      setIsSendingChat(false);
    }
  }

  function insertMention(row: MissionAgentRow) {
    const handle = row.agent.displayName.toLowerCase().replace(/[\s_]+/g, '-');
    setChatBody((current) => current.replace(/@[\w.-]*$/, `@${handle} `));
  }

  if (!workroom && isWorkroomLoading) {
    return (
      <Shell title={t('workroom.route')} meta={<span className="mp-muted">{t('workroom.loadingMeta')}</span>}>
        <div className="mp-empty"><h2>{t('common.loading')}</h2><p>{t('workroom.loadingMeta')}</p></div>
      </Shell>
    );
  }

  if (!workroom) {
    return (
      <Shell title={t('workroom.route')} meta={<span className="mp-muted">{t('workroom.loadingMeta')}</span>}>
        <div className="mp-empty mp-empty-cta"><h2>{t('workroom.empty.title')}</h2><p>{t('workroom.empty.body')}</p></div>
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
      actions={<button className="mp-button dark" onClick={() => setModalOpen(true)}>{t('workroom.newCard')}</button>}
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div><div className="mp-muted mp-small">{sub}</div></div>;
}

function PlanTab({ workroom, isGeneratingPlan, activeWorkCardId, onGeneratePlan, onStartWorkCard, onNewCard }: { workroom: WorkroomReadModel; isGeneratingPlan: boolean; activeWorkCardId: string | null; onGeneratePlan: () => void; onStartWorkCard: (workCardId: string) => void; onNewCard: () => void }) {
  const { t } = useTranslation();
  const queuePositions = useMemo(() => queuePositionByCard(workroom.workCards), [workroom.workCards]);
  return (
    <div className="mp-tab-panel">
      <section className="mp-plan-cta">
        <div>
          <strong>{t('workroom.generatePlan.title')}</strong>
          <p className="mp-muted">{t('workroom.generatePlan.body')}</p>
        </div>
        <button className="mp-button dark" disabled={isGeneratingPlan || !workroom.agentInstances.length} onClick={onGeneratePlan}>{isGeneratingPlan ? t('common.saving') : t('workroom.generatePlan.action')}</button>
      </section>
      <div className="mp-section-title">
        <strong>{t('workroom.cards')}</strong>
        <button className="mp-button" onClick={onNewCard}>{t('workroom.newCard')}</button>
      </div>
      <div className="mp-workcard-list">
        {workroom.workCards.length ? workroom.workCards.map((card) => <WorkCardRow key={card.id} card={card} queuePosition={queuePositions.get(card.id)} workroom={workroom} isStarting={activeWorkCardId === card.id} onStart={() => onStartWorkCard(card.id)} />) : <EmptyCta title={t('workroom.emptyCards.title')} body={t('workroom.emptyCards.body')} action={t('workroom.generatePlan.action')} onAction={onGeneratePlan} />}
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

function shouldRefreshWorkroom(type: string) {
  return ['work_card_allocated', 'work_card_assigned', 'work_card_queued', 'work_card_dequeued', 'work_card_updated', 'work_card_started', 'work_card_completed', 'work_card_failed', 'mission_spend_updated', 'sandbox_burn', 'cost_event'].includes(type);
}

function FileBrowser({ missionId, expanded = false }: { missionId: string; expanded?: boolean }) {
  const { t } = useTranslation();
  const [path, setPath] = useState(ROOT_PATH);
  const [entries, setEntries] = useState<MissionFileEntry[]>([]);
  const [selected, setSelected] = useState<MissionFileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.missionFiles(missionId, path)
      .then((response) => {
        if (alive) setEntries(response.items);
      })
      .catch((fileError) => {
        if (alive) {
          setEntries([]);
          setError(fileError instanceof Error ? fileError.message : t('workroom.files.error'));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [missionId, path, t]);

  async function openEntry(entry: MissionFileEntry) {
    if (entry.type === 'directory') {
      setPath(entry.path);
      setSelected(null);
      setContentError(null);
      return;
    }
    setContentError(null);
    try {
      const content = await api.missionFileContent(missionId, entry.path);
      setSelected(content);
    } catch (openError) {
      setSelected(null);
      setContentError(openError instanceof Error ? openError.message : t('workroom.files.previewError'));
    }
  }

  return (
    <div className={`mp-file-browser ${expanded ? 'expanded' : ''}`}>
      <div className="mp-section-title">
        <div>
          <strong>{t('workroom.files.title')}</strong>
          <p className="mp-muted">{t('workroom.files.subtitle')}</p>
        </div>
        {path ? <button className="mp-button" onClick={() => { setPath(ROOT_PATH); setSelected(null); }}>{t('workroom.files.root')}</button> : null}
      </div>
      {error ? <div className="mp-denied">{t('workroom.files.error')} · {error}</div> : null}
      <div className="mp-file-grid">
        <div className="mp-file-list">
          {loading ? <div className="mp-muted">{t('common.loading')}</div> : null}
          {entries.length ? entries.map((entry) => (
            <button className="mp-file-row" key={entry.path} onClick={() => void openEntry(entry)}>
              <span>{t(entry.type === 'directory' ? 'workroom.files.kind.directory' : 'workroom.files.kind.file')}</span>
              <strong>{entry.name}</strong>
              <span className="mp-muted">{entry.size ? `${Math.round(entry.size / 1024)} KB` : ''}</span>
            </button>
          )) : <div className="mp-empty"><p>{t('workroom.files.empty')}</p></div>}
        </div>
        <div className="mp-file-preview">
          {selected ? (
            <>
              <div className="mp-label">{selected.path}</div>
              {selected.path.endsWith('.md') || selected.mimeType?.includes('markdown') ? <Markdown value={selected.content} /> : <pre>{selected.content}</pre>}
            </>
          ) : contentError ? <p className="mp-denied">{t('workroom.files.previewError')} · {contentError}</p> : <p className="mp-muted">{t('workroom.files.select')}</p>}
        </div>
      </div>
    </div>
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
        {canStart ? <button className="mp-button" disabled={isBusy} onClick={onStart}>{isBusy ? t('common.saving') : t('workroom.startSandbox')}</button> : null}
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
  const canStart = ['proposed', 'approved', 'queued', 'pending', 'failed'].includes(card.status);
  return (
    <article className="mp-workcard-item">
      <div className="mp-workcard-main">
        <div className="mp-section-title">
          <strong>{card.title}</strong>
          <span className={`mp-chip ${card.status === 'running' ? 'dark' : ''}`}>{card.status === 'queued' && queuePosition ? t('workroom.queuePosition', { position: queuePosition }) : t(`status.${card.status}`, card.status)}</span>
        </div>
        <Markdown value={card.description ?? t('workroom.cardNoDescription')} compact />
      </div>
      <div className="mp-workcard-meta">
        <Info label={t('workroom.assignee')} value={assignee?.agent.displayName ?? '-'} />
        <Info label={t('workroom.affinity')} value={t(tier === 'mission' ? 'workroom.tierMission' : tier === 'private' ? 'workroom.tierPrivate' : 'workroom.tier0')} />
        <Info label={t('workroom.cost')} value={money(card.cost?.spentCents)} />
        {canStart ? <button className="mp-button dark" disabled={isStarting} onClick={onStart}>{isStarting ? t('common.saving') : t('workroom.startCard')}</button> : null}
      </div>
    </article>
  );
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
