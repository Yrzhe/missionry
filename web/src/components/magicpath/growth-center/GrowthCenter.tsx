import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import type { MissionEvent } from '../../../lib/types';
import { Shell } from '../Shell';

type GrowthTab = 'feed' | 'candidates' | 'rollbacks';
type FeedFilter = 'all' | 'unreviewed' | 'reviewed' | 'rolled_back';

export function GrowthCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const events = useAppStore((state) => state.events);
  const missions = useAppStore((state) => state.missions);
  const [tab, setTab] = useState<GrowthTab>('feed');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const feed = useMemo(() => events.filter(isGrowthEvent), [events]);
  const visibleFeed = filter === 'all' ? feed : feed.filter((event) => eventStatus(event) === filter);
  const candidates = useMemo(() => events.filter((event) => event.type.includes('candidate') || event.payload?.subjectType === 'growth_candidate'), [events]);
  const rollbacks = useMemo(() => events.filter((event) => event.type.includes('rollback') || event.payload?.diffSummary?.startsWith('rollback:')), [events]);
  const highRiskCount = feed.filter((event) => risk(event) === 'high').length;

  async function rollback(event: MissionEvent) {
    if (!event.auditEventId) return;
    setBusyId(event.auditEventId);
    setError(null);
    try {
      await api.rollbackAuditEvent(event.auditEventId);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : t('growth.rollbackError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Shell title={t('growth.title')} meta={<span className="mp-muted mp-mono">{endpointForTab(tab)}</span>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('growth.costNote')}</div>
          <h1>{t('growth.title')}</h1>
          <p className="mp-muted">{t('growth.subtitle')}</p>
        </div>
        <button className="mp-button dark" onClick={() => navigate(missions[0] ? `/missions/${missions[0].id}` : '/missions')}>{t('growth.cta.openMission')}</button>
      </div>

      <div className="mp-metrics">
        <Stat label={t('growth.stat.unreviewed')} value={String(feed.filter((event) => eventStatus(event) === 'unreviewed').length)} />
        <Stat label={t('growth.stat.reviewed')} value={String(feed.filter((event) => eventStatus(event) === 'reviewed').length)} />
        <Stat label={t('growth.stat.rolledBack')} value={String(rollbacks.length)} />
        <Stat label={t('growth.stat.risk')} value={String(highRiskCount)} />
      </div>

      <section className="mp-card mp-growth">
        <div className="mp-tabs">
          <button className={`mp-tab ${tab === 'feed' ? 'active' : ''}`} onClick={() => setTab('feed')}>{t('growth.feed')}</button>
          <button className={`mp-tab ${tab === 'candidates' ? 'active' : ''}`} onClick={() => setTab('candidates')}>{t('growth.candidates')}</button>
          <button className={`mp-tab ${tab === 'rollbacks' ? 'active' : ''}`} onClick={() => setTab('rollbacks')}>{t('growth.rollbacks')}</button>
        </div>

        {tab === 'feed' ? (
          <div className="mp-panel-pad">
            <div className="mp-row-tight mp-filter-row">
              {(['all', 'unreviewed', 'reviewed', 'rolled_back'] as FeedFilter[]).map((key) => (
                <button className={`mp-button ${filter === key ? 'dark' : ''}`} key={key} onClick={() => setFilter(key)}>{t(`growth.filter.${key}`)}</button>
              ))}
            </div>
            <div className="mp-growth-feed">
              {visibleFeed.length ? visibleFeed.map((event) => (
                <div className="mp-growth-row" key={event.auditEventId ?? `${event.type}-${event.occurredAt}`}>
                  <span className="mp-muted mp-mono">{event.auditEventId ?? '-'}</span>
                  <strong>{event.payload?.actor?.id ?? event.payload?.agentId ?? '-'}</strong>
                  <span>{missionTitle(event, missions)}</span>
                  <span className="mp-chip">{event.type}</span>
                  <div>
                    <div>{event.payload?.diffSummary ?? event.payload?.subjectType ?? event.type}</div>
                    <div className="mp-muted mp-small">{event.occurredAt ?? '-'}</div>
                  </div>
                  <div className="mp-row-tight">
                    <span className="mp-chip">{t('growth.risk')}: {t(`growth.risk.${risk(event)}`)}</span>
                    <button className="mp-button" disabled={!event.auditEventId || busyId === event.auditEventId} onClick={() => void rollback(event)}>{busyId === event.auditEventId ? t('common.saving') : t('common.rollback')}</button>
                  </div>
                </div>
              )) : <EmptyCta title={t('growth.empty.feed.title')} body={t('growth.empty.feed.body')} action={t('growth.empty.feed.action')} onAction={() => navigate(missions[0] ? `/missions/${missions[0].id}` : '/missions')} />}
            </div>
          </div>
        ) : null}

        {tab === 'candidates' ? (
          <div className="mp-panel-pad">
            {candidates.length ? <div className="mp-growth-candidate-grid">{candidates.map((event) => <CandidateCard key={event.auditEventId ?? event.occurredAt ?? event.type} event={event} />)}</div> : <EmptyCta title={t('growth.empty.candidates.title')} body={t('growth.empty.candidates.body')} action={t('growth.empty.candidates.action')} onAction={() => navigate('/agents')} />}
          </div>
        ) : null}

        {tab === 'rollbacks' ? (
          <div className="mp-panel-pad">
            {rollbacks.length ? rollbacks.map((event) => <RollbackRow event={event} key={event.auditEventId ?? event.occurredAt ?? event.type} />) : <EmptyCta title={t('growth.empty.rollbacks.title')} body={t('growth.empty.rollbacks.body')} action={t('growth.empty.rollbacks.action')} onAction={() => setTab('feed')} />}
          </div>
        ) : null}
      </section>
      {error ? <div className="mp-denied">{error}</div> : null}
    </Shell>
  );
}

function endpointForTab(tab: GrowthTab) {
  if (tab === 'candidates') return 'GET /api/public/growth-center/candidates';
  if (tab === 'rollbacks') return 'POST /api/public/audit-events/:auditEventId/rollback';
  return 'GET /api/public/missions/:id/events';
}

function isGrowthEvent(event: MissionEvent) {
  return event.type.includes('memory') || event.type.includes('config') || event.type.includes('candidate') || event.type.includes('rollback') || event.payload?.subjectType === 'agent' || event.payload?.subjectType === 'growth_candidate';
}

function eventStatus(event: MissionEvent): FeedFilter {
  if (event.type.includes('rollback') || event.payload?.diffSummary?.startsWith('rollback:')) return 'rolled_back';
  if (event.type.includes('review')) return 'reviewed';
  return 'unreviewed';
}

function risk(event: MissionEvent) {
  if (event.type.includes('credential') || event.type.includes('rollback')) return 'high';
  if (event.type.includes('cross') || event.type.includes('config')) return 'medium';
  return 'low';
}

function missionTitle(event: MissionEvent, missions: Array<{ id: string; title: string }>) {
  return missions.find((mission) => mission.id === event.missionId)?.title ?? event.missionId ?? '-';
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div></div>;
}

function CandidateCard({ event }: { event: MissionEvent }) {
  const { t } = useTranslation();
  return (
    <div className="mp-growth-candidate">
      <div className="mp-section-title"><strong>{event.payload?.diffSummary ?? event.type}</strong><span className="mp-chip">{event.payload?.subjectType ?? t('growth.candidate')}</span></div>
      <p className="mp-muted">{event.payload?.payloadRef?.r2Key ?? t('growth.candidateFallback')}</p>
      <div className="mp-row-tight"><button className="mp-button dark">{t('common.enable')}</button><button className="mp-button">{t('common.dismiss')}</button></div>
    </div>
  );
}

function RollbackRow({ event }: { event: MissionEvent }) {
  return (
    <div className="mp-growth-rollback-row">
      <span className="mp-muted mp-mono">{event.auditEventId ?? '-'}</span>
      <strong>{event.payload?.subjectId ?? event.type}</strong>
      <span>{event.payload?.diffSummary ?? '-'}</span>
      <span className="mp-muted">{event.occurredAt ?? '-'}</span>
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
