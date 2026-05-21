import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import type { DirectThreadMessage } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';
import { Markdown } from '../Markdown';

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;

export function DirectAgentThread() {
  const { threadId = '' } = useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadQuery = useQuery({
    queryKey: queryKeys.directThread(threadId),
    queryFn: () => api.directThread(threadId),
    enabled: Boolean(threadId),
  });
  const thread = threadQuery.data ?? null;
  const workroomQuery = useQuery({
    queryKey: queryKeys.workroom(thread?.missionId ?? ''),
    queryFn: () => api.workroom(thread?.missionId ?? ''),
    enabled: Boolean(thread?.missionId),
  });
  const directEventsQuery = useQuery({
    queryKey: thread?.missionId ? queryKeys.missionEvents(thread.missionId) : ['direct-thread-events', threadId],
    queryFn: () => api.missionEvents(thread?.missionId ?? ''),
    enabled: Boolean(thread?.missionId),
  });
  const sendMutation = useMutation({
    mutationFn: (messageBody: string) => api.sendDirectThreadMessage(threadId, messageBody),
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.directThread(threadId) });
      if (thread?.missionId) await queryClient.invalidateQueries({ queryKey: queryKeys.missionEvents(thread.missionId) });
    },
  });

  const workroom = workroomQuery.data;
  const agentRow = thread && workroom ? workroom.agentInstances.find((row) => row.instance.id === thread.agentInstanceId) : undefined;
  const directEvents = useMemo(() => (directEventsQuery.data?.items ?? []).filter((event) => event.payload?.subjectId === threadId || event.type === 'direct_thread_message_sent' || event.type === 'direct_thread_ready').slice(0, 6), [directEventsQuery.data?.items, threadId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!threadId || !body.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await sendMutation.mutateAsync(body.trim());
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('chat.sendError'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Shell title={t('chat.title')} meta={<span className="mp-muted">{t('chat.meta')}</span>}>
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
            <span className="mp-chip">{t('chat.live')}</span>
          </div>
          <div className="mp-chat-scroll">
            {threadQuery.isLoading ? <div className="mp-muted">{t('common.loading')}</div> : thread?.messages.length ? thread.messages.map((message) => <DirectMessage key={message.id} message={message} agentName={agentRow?.agent.displayName} />) : <div className="mp-empty mp-empty-cta"><h2>{t('chat.empty.title')}</h2><p>{threadQuery.error instanceof Error ? threadQuery.error.message : t('chat.empty.body')}</p></div>}
          </div>
          <form className="mp-chat-composer" onSubmit={submit}>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('chat.placeholder')} />
            <button className="mp-button dark" disabled={isSending || !body.trim()}>{isSending ? t('common.saving') : t('common.send')}</button>
          </form>
          {error ? <div className="mp-denied">{error}</div> : null}
        </section>

        <aside className="mp-card mp-direct-side">
          <div className="mp-label">{t('chat.context')}</div>
          <h2>{agentRow?.agent.displayName ?? t('chat.title')}</h2>
          <Info label={t('nav.missions')} value={workroom?.mission.title ?? '-'} />
          <Info label={t('agent.instance')} value={agentRow?.instance.displayAlias ?? agentRow?.agent.displayName ?? '-'} />
          <Info label={t('agent.sandbox')} value={agentRow?.instance.sandboxSummary?.state ?? 'none'} />
          <Info label={t('common.burn')} value={`${agentRow?.instance.sandboxSummary?.burnRateCentsPerMinute ?? 0}${t('common.centsPerMinute')}`} />
          <Info label={t('common.spend')} value={money(0)} />
          <div className="mp-direct-events">
            {directEvents.map((event) => (
              <div key={`${event.type}-${event.auditEventId ?? event.occurredAt}`}>
                <span className="mp-chip">{event.type}</span>
                <span>{event.payload?.diffSummary ?? '-'}</span>
                <span className="mp-muted">{event.occurredAt ?? '-'}</span>
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
        <span>{isUser ? t('chat.you') : agentName ?? t('workroom.chat.unknown')}</span>
        <span className="mp-muted mp-mono">{message.createdAt}</span>
      </div>
      <Markdown value={message.body} />
      {message.auditEventId ? <div className="mp-muted mp-small">{t('chat.audit')}</div> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="mp-kv"><span className="mp-muted">{label}</span><span className="mp-mono mp-wrap">{value}</span></div>;
}

function initials(value: string) {
  return value.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DT';
}
