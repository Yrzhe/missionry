import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import type { CreateWorkCardInput, MissionAgentRow, MissionChatMessage, MissionSandboxReadModel, WorkCard, WorkroomReadModel } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

type NewWorkCardForm = {
  title: string;
  description: string;
  assigneeInstanceId: string;
  tier: CreateWorkCardInput['sandboxAffinity']['tier'];
};

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;
const EMPTY_MESSAGES: MissionChatMessage[] = [];

export function Workroom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const workroom = useAppStore((state) => (id ? state.workrooms[id] : undefined));
  const setWorkroom = useAppStore((state) => state.setWorkroom);
  const missionChatsMap = useAppStore((state) => state.missionChats);
  const chatMessages = id ? missionChatsMap[id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  const setMissionChat = useAppStore((state) => state.setMissionChat);
  const appendMissionChat = useAppStore((state) => state.appendMissionChat);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewWorkCardForm>({ title: '', description: '', assigneeInstanceId: '', tier: 'tier0' });
  const [chatBody, setChatBody] = useState('');
  const [showSilenced, setShowSilenced] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [sandboxAction, setSandboxAction] = useState<string | null>(null);

  const defaultAssignee = workroom?.agentInstances[0]?.instance.id ?? '';
  const selectedAssignee = form.assigneeInstanceId || defaultAssignee;
  const leaderInstanceId = workroom?.mission.leaderInstanceId ?? (workroom?.mission.owner?.type === 'agent' ? workroom.mission.owner.agentInstanceId : undefined);
  const visibleMessages = showSilenced ? chatMessages : chatMessages.filter((message) => message.body !== '[NO]');
  const mentionQuery = chatBody.match(/@([\w.-]*)$/)?.[1].toLowerCase();
  const mentionOptions = mentionQuery === undefined ? [] : (workroom?.agentInstances ?? []).filter((row) => row.agent.displayName.toLowerCase().includes(mentionQuery)).slice(0, 5);

  const guardrailProgress = useMemo(() => {
    if (!workroom?.metricStrip.dailyBudgetCents) return 0;
    return Math.min(100, Math.round((workroom.metricStrip.missionSpendCents / workroom.metricStrip.dailyBudgetCents) * 100));
  }, [workroom]);

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
        sandboxAffinity: { tier: form.tier, reason: 'manual' },
      });
      const next = await api.workroom(id);
      setWorkroom(id, next);
      setModalOpen(false);
      setForm({ title: '', description: '', assigneeInstanceId: '', tier: 'tier0' });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('workroom.newCard.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

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

  async function refreshWorkroom() {
    if (!id) return;
    const next = await api.workroom(id);
    setWorkroom(id, next);
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

  if (!workroom) {
    return (
      <Shell title={t('workroom.route')} meta={<span className="mp-muted mp-mono">{t('workroom.endpointTemplate')}</span>}>
        <div className="mp-empty mp-empty-cta"><h2>{t('workroom.empty.title')}</h2><p>{t('workroom.empty.body')}</p></div>
      </Shell>
    );
  }

  const strip = workroom.metricStrip;

  return (
    <Shell
      title={t('workroom.route')}
      meta={<span className="mp-muted mp-mono">{t('workroom.endpoint', { id: workroom.mission.id })}</span>}
      actions={<button className="mp-button dark" onClick={() => setModalOpen(true)}>{t('workroom.newCard')}</button>}
    >
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('common.owner')}: {workroom.mission.owner?.displayName ?? '-'}</div>
          <h1>{workroom.mission.title || t('workroom.title')}</h1>
          <p className="mp-muted">{workroom.mission.objective}</p>
        </div>
        <span className="mp-chip"><span className="mp-status-dot running" />{workroom.costGuardrailStatus?.state ?? t('workroom.guardrail')}</span>
      </div>

      <div className="mp-metrics">
        <Stat label={t('workroom.metric.active')} value={String(strip.activeSandboxCount)} sub={`${strip.privateCap.activePrivateSandboxes}/${strip.privateCap.maxConcurrentPrivateSandboxes} ${t('workroom.metric.private')}`} />
        <Stat label={t('workroom.metric.burn')} value={`${strip.burnRateCentsPerMinute.toFixed(1)}${t('common.centsPerMinute')}`} sub={t('workroom.sseCostEvent')} />
        <Stat label={t('workroom.metric.spend')} value={money(strip.missionSpendCents)} sub={`${money(strip.dailyBudgetCents)} ${t('workroom.metric.daily')}`} />
        <Stat label={t('common.open')} value={String(workroom.openIssues)} sub={workroom.updatedAt ?? '-'} />
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

      <div className="mp-grid two">
        <SandboxControlCard
          title={t('workroom.missionSandbox')}
          sandbox={workroom.missionSandbox}
          isBusy={sandboxAction === `mission:${workroom.mission.id}`}
          onStart={() => void runSandboxAction(`mission:${workroom.mission.id}`, () => api.startMissionSandbox(workroom.mission.id))}
          onPause={() => void runSandboxAction(`mission:${workroom.mission.id}`, () => api.pauseMissionSandbox(workroom.mission.id))}
        />
        <section className="mp-card">
          <div className="mp-section-title">
            <strong>{t('workroom.agentSandboxes')}</strong>
            <span className="mp-muted mp-mono">{t('workroom.privateSandboxEndpoint')}</span>
          </div>
          <div className="mp-agent-sandbox-list">
            {workroom.agentInstances.length ? workroom.agentInstances.map((row) => (
              <AgentSandboxRow
                key={row.instance.id}
                row={row}
                isBusy={sandboxAction === row.instance.id}
                onStart={() => void runSandboxAction(row.instance.id, () => api.startAgentSandbox(workroom.mission.id, row.instance.id))}
                onPause={() => void runSandboxAction(row.instance.id, () => api.pauseAgentSandbox(workroom.mission.id, row.instance.id))}
              />
            )) : <EmptyCta title={t('workroom.emptyAgents.title')} body={t('workroom.emptyAgents.body')} action={t('workroom.emptyAgents.action')} onAction={() => navigate('/agents')} />}
          </div>
        </section>
      </div>

      <div className="mp-grid two">
        <section className="mp-card mp-chat-panel">
          <div className="mp-section-title">
            <div>
              <div className="mp-label">{t('workroom.chat.endpoint')}</div>
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

        <section className="mp-card mp-panel">
          <div className="mp-tabs">
            <button className="mp-tab active">{t('workroom.plan')}</button>
            <button className="mp-tab">{t('workroom.activity')}</button>
            <button className="mp-tab">{t('workroom.artifacts')}</button>
          </div>
          <div className="mp-section-title">
            <strong>{t('workroom.cards')}</strong>
            <span className="mp-muted mp-mono">{t('workroom.workCardsEndpoint')}</span>
          </div>
          {workroom.workCards.length ? workroom.workCards.map((card) => <WorkCardRow key={card.id} card={card} workroom={workroom} />) : <EmptyCta title={t('workroom.emptyCards.title')} body={t('workroom.emptyCards.body')} action={t('workroom.emptyCards.action')} onAction={() => setModalOpen(true)} />}
        </section>

      </div>

      {modalOpen ? (
        <div className="mp-modal-backdrop" role="presentation">
          <form className="mp-modal" onSubmit={submitWorkCard}>
            <div className="mp-section-title">
              <div>
                <div className="mp-label">{t('workroom.newCard.endpoint')}</div>
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

function SandboxControlCard({ title, sandbox, isBusy, onStart, onPause }: { title: string; sandbox: MissionSandboxReadModel; isBusy: boolean; onStart: () => void; onPause: () => void }) {
  const { t } = useTranslation();
  const canStart = sandbox.state === 'none' || sandbox.state === 'paused';
  const canPause = sandbox.state === 'running';
  return (
    <section className="mp-card">
      <div className="mp-section-title">
        <div>
          <div className="mp-label">{title}</div>
          <h2>{sandbox.sandboxId ?? t('workroom.lazySlot')}</h2>
        </div>
        <span className="mp-chip">{t(`status.${sandbox.state}`)}</span>
      </div>
      <div className="mp-sandbox-control-grid">
        <Info label={t('common.burn')} value={`${(sandbox.burnRateCentsPerMinute ?? 0).toFixed(1)}${t('common.centsPerMinute')}`} />
        <Info label={t('workroom.lastActivity')} value={sandbox.lastActivityAt ?? '-'} />
        <Info label={t('workroom.r2Snapshot')} value={sandbox.r2SnapshotKey ?? '-'} />
      </div>
      <div className="mp-row-tight">
        {canStart ? <button className="mp-button dark" disabled={isBusy} onClick={onStart}>{isBusy ? t('common.saving') : t('workroom.startSandbox')}</button> : null}
        {canPause ? <button className="mp-button" disabled={isBusy} onClick={onPause}>{isBusy ? t('common.saving') : t('workroom.pauseSandbox')}</button> : null}
      </div>
    </section>
  );
}

function AgentSandboxRow({ row, isBusy, onStart, onPause }: { row: MissionAgentRow; isBusy: boolean; onStart: () => void; onPause: () => void }) {
  const { t } = useTranslation();
  const sandbox: MissionSandboxReadModel = { state: 'none', ...row.instance.sandboxSummary };
  const canStart = sandbox.state === 'none' || sandbox.state === 'paused';
  const canPause = sandbox.state === 'running';
  return (
    <div className="mp-agent-sandbox-row">
      <div>
        <strong>{row.agent.displayName}</strong>
        <p className="mp-muted">{row.role} · {sandbox.sandboxId ?? row.instance.id}</p>
      </div>
      <span className="mp-chip">{t(`status.${sandbox.state}`)}</span>
      <span className="mp-muted">{(sandbox.burnRateCentsPerMinute ?? 0).toFixed(1)}{t('common.centsPerMinute')}</span>
      <span className="mp-muted">{sandbox.lastActivityAt ?? '-'}</span>
      <div className="mp-row-tight">
        {canStart ? <button className="mp-button dark" disabled={isBusy} onClick={onStart}>{t('workroom.startSandbox')}</button> : null}
        {canPause ? <button className="mp-button" disabled={isBusy} onClick={onPause}>{t('workroom.pauseSandbox')}</button> : null}
      </div>
    </div>
  );
}

function ChatMessage({ message, workroom, leaderInstanceId }: { message: MissionChatMessage; workroom: WorkroomReadModel; leaderInstanceId?: string }) {
  const { t } = useTranslation();
  const isUser = message.authorType === 'user';
  const isLeader = Boolean(message.authorInstanceId && message.authorInstanceId === leaderInstanceId);
  const agent = message.authorInstanceId ? workroom.agentInstances.find((row) => row.instance.id === message.authorInstanceId) : undefined;
  const authorName = agent?.agent.displayName ?? message.authorName;
  return (
    <div className={`mp-chat-bubble ${isUser ? 'user' : ''}`}>
      <div className="mp-chat-author">
        <span>{authorName}</span>
        {isLeader ? <span className="mp-chip dark">{t('workroom.chat.leader')}</span> : null}
        <span className="mp-muted mp-mono">{message.createdAt}</span>
      </div>
      <div>{message.body}</div>
    </div>
  );
}

function WorkCardRow({ card, workroom }: { card: WorkCard; workroom: WorkroomReadModel }) {
  const { t } = useTranslation();
  const assignee = workroom.agentInstances.find((row) => row.instance.id === card.assigneeInstanceId);
  const tier = card.sandboxAffinity?.tier ?? 'tier0';
  return (
    <div className="mp-workcard-row">
      <div>
        <strong>{card.title}</strong>
        <p className="mp-muted">{card.description ?? card.id}</p>
      </div>
      <span className="mp-chip">{t(`status.${card.status}`, card.status)}</span>
      <div>
        <div className="mp-muted mp-small">{t('workroom.assignee')}</div>
        {assignee?.agent.displayName ?? '-'}
      </div>
      <div>
        <div className="mp-muted mp-small">{t('workroom.affinity')}</div>
        {t(tier === 'mission' ? 'workroom.tierMission' : tier === 'private' ? 'workroom.tierPrivate' : 'workroom.tier0')}
      </div>
      <div>
        <div className="mp-muted mp-small">{t('workroom.cost')}</div>
        {money(card.cost?.spentCents)}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="mp-kv"><span className="mp-muted">{label}</span><span className="mp-mono mp-wrap">{value}</span></div>;
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
