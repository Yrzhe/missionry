import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { changePassword, updateMe, api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import { useAppStore } from '../../../lib/store';
import { Shell } from '../Shell';
import { RulesEditor } from '../RulesEditor';
import type { FormEvent } from 'react';

export function SettingsAccount() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session, setSession } = useAppStore(useShallow((state) => ({ session: state.session, setSession: state.setSession })));
  const [name, setName] = useState(session?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNameSubmitting, setIsNameSubmitting] = useState(false);
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !isSubmitting;
  const canSubmitName = name.trim().length > 0 && name.trim() !== (session?.name ?? '') && !isNameSubmitting;

  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!name.trim()) return;
    setIsNameSubmitting(true);
    try {
      const nextSession = await updateMe({ name: name.trim() });
      setSession(nextSession);
      setName(nextSession.name ?? name.trim());
      void queryClient.invalidateQueries({ queryKey: queryKeys.missions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminMissions });
      setMessage(t('account.nameUpdated'));
    } catch (nameError) {
      setError(nameError instanceof Error ? nameError.message : t('account.nameUpdateFailed'));
    } finally {
      setIsNameSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword.length < 8) {
      setError(t('account.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('account.passwordMismatch'));
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('account.passwordUpdated'));
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : t('account.updateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell title={t('account.title')} meta={<span className="mp-muted">{t('account.security')}</span>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('nav.settings')}</div>
          <h1>{t('account.title')}</h1>
          <p className="mp-muted">{t('account.subtitle')}</p>
        </div>
      </div>
      <form className="mp-card mp-form-panel" onSubmit={submitName}>
        <h2>{t('account.profile')}</h2>
        <label>{t('account.displayName')}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
        <button className="mp-button dark" disabled={!canSubmitName}>{isNameSubmitting ? t('common.saving') : t('account.saveName')}</button>
      </form>
      <form className="mp-card mp-form-panel" onSubmit={submit}>
        <h2>{t('account.password')}</h2>
        <label>{t('account.currentPassword')}<input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        <label>{t('account.newPassword')}<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" /></label>
        <label>{t('account.confirmNewPassword')}<input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" /></label>
        <button className="mp-button dark" disabled={!canSubmit}>{isSubmitting ? t('common.saving') : t('account.submit')}</button>
      </form>
      <RulesEditor
        title={t('rules.globalTitle')}
        hint={t('rules.globalHint')}
        queryKey={['me', 'rules']}
        load={api.myRules}
        save={api.updateMyRules}
      />
      {message ? <div className="mp-success">{message}</div> : null}
      {error ? <div className="mp-denied">{error}</div> : null}
    </Shell>
  );
}
