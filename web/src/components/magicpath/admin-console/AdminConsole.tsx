import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import { useAppStore } from '../../../lib/store';
import type { WhitelistEntry } from '../../../lib/types';
import type { FormEvent } from 'react';
import { Shell } from '../Shell';

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;

export function AdminConsole() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session } = useAppStore(useShallow((state) => ({ session: state.session })));
  const [form, setForm] = useState<{ type: WhitelistEntry['type']; value: string }>({ type: 'email', value: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = session?.role === 'admin';
  const overviewQuery = useQuery({ queryKey: queryKeys.adminOverview, queryFn: api.adminOverview, enabled });
  const usersQuery = useQuery({ queryKey: queryKeys.adminUsers, queryFn: api.adminUsers, enabled });
  const whitelistQuery = useQuery({ queryKey: queryKeys.adminWhitelist, queryFn: api.adminWhitelist, enabled });
  const missionsQuery = useQuery({ queryKey: queryKeys.adminMissions, queryFn: api.adminMissions, enabled });
  const overview = overviewQuery.data;
  const users = usersQuery.data?.items ?? [];
  const whitelist = whitelistQuery.data?.items ?? [];
  const missions = missionsQuery.data?.items ?? [];
  const invalidateAdmin = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminWhitelist }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminMissions }),
    ]);
  };
  const addMutation = useMutation({
    mutationFn: ({ type, value }: { type: WhitelistEntry['type']; value: string }) => api.addWhitelistEntry(type, value),
    onSuccess: async () => {
      setForm({ type: 'email', value: '' });
      await invalidateAdmin();
    },
  });
  const removeMutation = useMutation({
    mutationFn: api.removeWhitelistEntry,
    onSuccess: invalidateAdmin,
  });

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.value.trim()) return;
    setBusyId('add');
    setError(null);
    try {
      await addMutation.mutateAsync({ type: form.type, value: form.value.trim() });
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t('admin.whitelistAddError'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await removeMutation.mutateAsync(id);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t('admin.whitelistRemoveError'));
    } finally {
      setBusyId(null);
    }
  }

  if (session?.role !== 'admin') {
    return <Shell title={t('admin.title')}><div className="mp-denied">{t('admin.denied')}</div></Shell>;
  }

  return (
    <Shell title={t('admin.title')} meta={<span className="mp-muted">{t('admin.overview')}</span>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('admin.overview')}</div>
          <h1>{t('admin.title')}</h1>
          <p className="mp-muted">{t('admin.subtitle')}</p>
        </div>
        <span className="mp-chip dark">{t('admin.superAdmin')} · {session.email}</span>
      </div>

      <div className="mp-metrics admin-kpis">
        <Stat label={t('admin.totalSpend')} value={money(overview?.totalSpendCents)} />
        <Stat label={t('nav.missions')} value={String(overview?.missionCount ?? missions.length)} />
        <Stat label={t('admin.users')} value={String(overview?.activeUserCount ?? users.length)} />
        <Stat label={t('admin.whitelist')} value={String(whitelist.length)} />
      </div>

      <section className="mp-card mp-admin-block">
        <div className="mp-section-title"><strong>{t('admin.users')}</strong><span className="mp-muted">{t('admin.userManagement')}</span></div>
        <div className="mp-admin-user-row mp-label"><span>{t('common.email')}</span><span>{t('common.role')}</span><span>{t('admin.todaySpend')}</span><span>{t('admin.dailyBudget')}</span></div>
        {users.length ? users.map((user, index) => (
          <div className="mp-admin-user-row" key={`${user.userId ?? user.email ?? 'user'}-${index}`}>
            <span>{user.email}</span>
            <span className={`mp-chip ${user.role === 'admin' ? 'dark' : ''}`}>{user.role}</span>
            <span>{money(user.todaySpendCents ?? user.dailySpendCents)}</span>
            <span>{money(user.dailyBudgetCents)}</span>
          </div>
        )) : <EmptyNote title={t('admin.empty.users.title')} body={t('admin.empty.users.body')} />}
      </section>

      <section className="mp-card mp-admin-block">
        <div className="mp-section-title"><strong>{t('admin.whitelist')}</strong><span className="mp-muted">{t('admin.accessList')}</span></div>
        <div className="mp-admin-white-row mp-label"><span>{t('admin.type')}</span><span>{t('admin.value')}</span><span>{t('admin.enabled')}</span><span>{t('admin.createdBy')}</span><span /></div>
        {whitelist.length ? whitelist.map((entry, index) => (
          <div className="mp-admin-white-row" key={`${entry.id ?? `${entry.type}-${entry.value}`}-${index}`}>
            <span className="mp-chip">{entry.type}</span>
            <span>{entry.value}</span>
            <span>{entry.enabled ? t('common.enable') : '-'}</span>
            <span className="mp-muted">{entry.createdBy ?? '-'}</span>
            <button className="mp-button danger" disabled={busyId === entry.id} onClick={() => void removeEntry(entry.id)}>{busyId === entry.id ? t('common.saving') : t('common.delete')}</button>
          </div>
        )) : <EmptyNote title={t('admin.empty.whitelist.title')} body={t('admin.empty.whitelist.body')} />}
        <form className="mp-admin-add-row" onSubmit={addEntry}>
          <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as WhitelistEntry['type'] }))}>
            <option value="email">email</option>
            <option value="suffix">suffix</option>
          </select>
          <input value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} placeholder={t('admin.whitelistPlaceholder')} />
          <button className="mp-button dark" disabled={busyId === 'add' || !form.value.trim()}>{busyId === 'add' ? t('common.saving') : t('admin.addWhitelist')}</button>
        </form>
      </section>

      <section className="mp-card mp-admin-block">
        <div className="mp-section-title"><strong>{t('admin.allMissions')}</strong><span className="mp-muted">{t('admin.missionRegistry')}</span></div>
        <div className="mp-admin-mission-row mp-label"><span>{t('admin.ownerEmail')}</span><span>{t('admin.missionTitle')}</span><span>{t('common.status')}</span><span>{t('admin.spendCap')}</span><span>{t('common.burn')}</span></div>
        {missions.length ? missions.map((mission, index) => (
          <div className="mp-admin-mission-row" key={`${mission.missionId ?? mission.title ?? 'mission'}-${index}`}>
            <span>{mission.ownerEmail ?? mission.owner?.displayName ?? '-'}</span>
            <span>{mission.title}</span>
            <span className="mp-chip">{mission.status ?? '-'}</span>
            <span>{money(mission.spentCents ?? mission.spendCents ?? mission.missionSpendCents)} / {money(mission.capCents ?? mission.dailyBudgetCents)}</span>
            <span>{mission.burnRateCentsPerMinute ?? mission.sandboxSummary?.burnRateCentsPerMinute ?? 0}{t('common.centsPerMinute')}</span>
          </div>
        )) : <EmptyNote title={t('admin.empty.missions.title')} body={t('admin.empty.missions.body')} />}
      </section>
      {error ? <div className="mp-denied">{error}</div> : null}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="mp-card mp-stat"><div className="mp-label">{label}</div><div className="mp-value">{value}</div></div>;
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return <div className="mp-empty mp-empty-cta"><h2>{title}</h2><p>{body}</p></div>;
}
