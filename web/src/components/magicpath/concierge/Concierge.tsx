import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import type { ConciergeChatMessage } from '../../../lib/types';
import { Shell } from '../Shell';
import { Markdown } from '../Markdown';

const EMPTY: ConciergeChatMessage[] = [];

export function Concierge() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatQuery = useQuery({ queryKey: queryKeys.conciergeChat, queryFn: api.conciergeChat });
  const overviewQuery = useQuery({ queryKey: queryKeys.conciergeOverview, queryFn: api.conciergeOverview });
  const messages = chatQuery.data?.items ?? EMPTY;
  const overview = overviewQuery.data;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const toBottom = () => { el.scrollTop = el.scrollHeight; };
    toBottom();
    const raf = requestAnimationFrame(toBottom);
    const timer = setTimeout(toBottom, 150);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.sendConciergeChat(body),
    onMutate: async (body: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conciergeChat });
      const optimisticId = `optimistic_${Date.now()}`;
      const optimistic: ConciergeChatMessage = { id: optimisticId, authorType: 'user', body, createdAt: new Date().toISOString() };
      queryClient.setQueryData<{ items: ConciergeChatMessage[] }>(queryKeys.conciergeChat, (e) => ({ items: [...(e?.items ?? []), optimistic] }));
      setDraft('');
      return { optimisticId };
    },
    onSuccess: async (response, _b, ctx) => {
      queryClient.setQueryData<{ items: ConciergeChatMessage[] }>(queryKeys.conciergeChat, (e) => {
        const byId = new Map((e?.items ?? []).filter((m) => m.id !== ctx?.optimisticId).map((m) => [m.id, m]));
        byId.set(response.message.id, response.message);
        byId.set(response.reply.id, response.reply);
        return { items: Array.from(byId.values()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) };
      });
      // The concierge may have created agents/missions — refresh the snapshot + lists.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conciergeOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
        queryClient.invalidateQueries({ queryKey: queryKeys.missions }),
      ]);
    },
    onError: (sendError, _b, ctx) => {
      if (ctx?.optimisticId) queryClient.setQueryData<{ items: ConciergeChatMessage[] }>(queryKeys.conciergeChat, (e) => ({ items: (e?.items ?? []).filter((m) => m.id !== ctx.optimisticId) }));
      setErr(sendError instanceof Error ? sendError.message : t('concierge.sendError'));
    },
  });

  function submit() {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    setErr(null);
    sendMutation.mutate(body);
  }

  return (
    <Shell title={t('concierge.title')} meta={<span className="mp-muted">{t('concierge.subtitle')}</span>}>
      <div className="mp-concierge-layout">
        <section className="mp-card mp-concierge-chat">
          <div className="mp-section-title">
            <div>
              <strong>{t('concierge.title')}</strong>
              <p className="mp-muted">{t('concierge.intro')}</p>
            </div>
          </div>
          <div className="mp-concierge-scroll" ref={scrollRef}>
            {messages.length ? messages.map((m) => (
              <div key={m.id} className={`mp-chat-bubble ${m.authorType === 'user' ? 'user' : ''}`}>
                <div className="mp-chat-author"><strong>{m.authorType === 'user' ? t('workroom.chat.you') : t('concierge.name')}</strong></div>
                {m.authorType === 'user' ? <p className="mp-wrap">{m.body}</p> : <Markdown value={m.body} />}
              </div>
            )) : <div className="mp-empty"><p>{t('concierge.empty')}</p></div>}
            {sendMutation.isPending ? <div className="mp-chat-replying"><span className="mp-typing-dot" /><span className="mp-typing-dot" /><span className="mp-typing-dot" />{t('concierge.thinking')}</div> : null}
          </div>
          <div className="mp-card-composer">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={t('concierge.placeholder')} />
            <button className="mp-button dark" disabled={sendMutation.isPending || !draft.trim()} onClick={submit}>{sendMutation.isPending ? t('common.saving') : t('common.send')}</button>
          </div>
          {err ? <div className="mp-denied">{err}</div> : null}
        </section>

        <section className="mp-card mp-concierge-overview">
          <div className="mp-section-title"><strong>{t('concierge.overview')}</strong></div>
          <div className="mp-label">{t('concierge.agents')}</div>
          <div className="mp-concierge-list">
            {(overview?.agents ?? []).map((a) => (
              <div key={a.id} className="mp-concierge-row">
                <strong>{a.name}</strong>
                <span className="mp-muted">{a.role} · {t('concierge.inMissions', { count: a.missionCount })}</span>
                {a.running.length ? <span className="mp-chip dark">{t('concierge.running', { count: a.running.length })}</span> : null}
              </div>
            ))}
            {!overview?.agents.length ? <p className="mp-muted">—</p> : null}
          </div>
          <div className="mp-label">{t('concierge.missions')}</div>
          <div className="mp-concierge-list">
            {(overview?.missions ?? []).map((m) => (
              <Link key={m.id} to={`/missions/${m.id}`} className="mp-concierge-row mp-concierge-mission">
                <strong>{m.title}</strong>
                <span className="mp-muted">{m.status} · {Object.entries(m.cards).map(([s, n]) => `${s}:${n}`).join(' ') || t('concierge.noCards')}</span>
              </Link>
            ))}
            {!overview?.missions.length ? <p className="mp-muted">—</p> : null}
          </div>
        </section>
      </div>
    </Shell>
  );
}
