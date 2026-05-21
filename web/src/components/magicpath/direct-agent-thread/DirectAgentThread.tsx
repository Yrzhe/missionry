import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import type { DirectThreadMessage, DirectThreadReadModel } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;

export function DirectAgentThread() {
  const { threadId = '' } = useParams();
  const { t } = useTranslation();
  const events = useAppStore((state) => state.events);
  const workrooms = useAppStore((state) => state.workrooms);
  const [thread, setThread] = useState<DirectThreadReadModel | null>(null);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workroom = thread ? workrooms[thread.missionId] : undefined;
  const agentRow = thread && workroom ? workroom.agentInstances.find((row) => row.instance.id === thread.agentInstanceId) : undefined;
  const directEvents = useMemo(() => events.filter((event) => event.payload?.subjectId === threadId || event.type === 'direct_thread_message_sent' || event.type === 'direct_thread_ready').slice(0, 6), [events, threadId]);

  async function refresh() {
    if (!threadId) return;
    const next = await api.directThread(threadId);
    setThread(next);
    setError(null);
  }

  useEffect(() => {
    void refresh().catch((loadError) => setError(loadError instanceof Error ? loadError.message : t('chat.loadError')));
  }, [threadId]);

  useEffect(() => {
    const matched = events.some((event) => event.payload?.subjectId === threadId && (event.type === 'direct_thread_message_sent' || event.type === 'direct_thread_ready'));
    if (matched) void refresh().catch(() => undefined);
  }, [events, threadId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!threadId || !body.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await api.sendDirectThreadMessage(threadId, body.trim());
      setThread((current) => current ? {
        ...current,
        messages: [...current.messages, ...[response.message, response.agentReply].filter((message): message is DirectThreadMessage => Boolean(message))],
        lastMessageAt: response.agentReply?.createdAt ?? response.message?.createdAt ?? current.lastMessageAt,
      } : current);
      setBody('');
      await refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('chat.sendError'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Shell title={t('chat.title')} meta={<span className="mp-muted mp-mono">GET/POST /api/public/direct-threads/:threadId/messages</span>}>
      <div className="mp-head">
        <div className="mp-avatar lg">{initials(agentRow?.agent.displayName ?? threadId)}</div>
        <div>
          <div className="mp-label">{t('chat.route')}</div>
          <h1>{agentRow ? t('chat.titleWithAgent', { name: agentRow.agent.displayName }) : t('chat.title')}</h1>
          <p className="mp-muted">{t('chat.subtitle')}</p>
        </div>
      </div>

      <div className="mp-direct-layout">
        <section className="mp-card mp-direct-chat">
          <div className="mp-section-title">
            <strong>{t('chat.messages')}</strong>
            <span className="mp-chip">SSE direct_thread_message_sent</span>
          </div>
          <div className="mp-chat-scroll">
            {thread?.messages.length ? thread.messages.map((message) => <DirectMessage key={message.id} message={message} agentName={agentRow?.agent.displayName} />) : <div className="mp-empty mp-empty-cta"><h2>{t('chat.empty.title')}</h2><p>{t('chat.empty.body')}</p></div>}
          </div>
          <form className="mp-chat-composer" onSubmit={submit}>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('chat.placeholder')} />
            <button className="mp-button dark" disabled={isSending || !body.trim()}>{isSending ? t('common.saving') : t('common.send')}</button>
          </form>
          {error ? <div className="mp-denied">{error}</div> : null}
        </section>

        <aside className="mp-card mp-direct-side">
          <div className="mp-label">{t('chat.context')}</div>
          <h2>{thread?.threadId ?? threadId}</h2>
          <Info label="missionId" value={thread?.missionId ?? '-'} />
          <Info label="agentInstanceId" value={thread?.agentInstanceId ?? '-'} />
          <Info label={t('agent.instance')} value={agentRow?.instance.displayAlias ?? agentRow?.instance.id ?? '-'} />
          <Info label={t('agent.sandbox')} value={agentRow?.instance.sandboxSummary?.state ?? 'none'} />
          <Info label={t('common.burn')} value={`${agentRow?.instance.sandboxSummary?.burnRateCentsPerMinute ?? 0}${t('common.centsPerMinute')}`} />
          <Info label={t('common.spend')} value={money(0)} />
          <div className="mp-direct-events">
            {directEvents.map((event) => (
              <div key={`${event.type}-${event.auditEventId ?? event.occurredAt}`}>
                <span className="mp-chip">{event.type}</span>
                <span>{event.payload?.diffSummary ?? '-'}</span>
                <span className="mp-muted mp-mono">{event.auditEventId ?? '-'}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function DirectMessage({ message, agentName }: { message: DirectThreadMessage; agentName?: string }) {
  const { t } = useTranslation();
  const isUser = message.sender.type === 'user';
  return (
    <div className={`mp-chat-bubble ${isUser ? 'user' : ''}`}>
      <div className="mp-chat-author">
        <span>{isUser ? t('chat.you') : agentName ?? message.sender.id}</span>
        <span className="mp-muted mp-mono">{message.createdAt}</span>
      </div>
      <div>{message.body}</div>
      {message.auditEventId ? <div className="mp-muted mp-mono mp-small">{t('chat.audit')}: {message.auditEventId}</div> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="mp-kv"><span className="mp-muted">{label}</span><span className="mp-mono mp-wrap">{value}</span></div>;
}

function initials(value: string) {
  return value.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DT';
}
