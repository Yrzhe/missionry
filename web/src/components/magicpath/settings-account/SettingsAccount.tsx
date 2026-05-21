import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../../lib/api';
import { Shell } from '../Shell';
import type { FormEvent } from 'react';

export function SettingsAccount() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !isSubmitting;

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
      <form className="mp-card mp-form-panel" onSubmit={submit}>
        <label>{t('account.currentPassword')}<input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        <label>{t('account.newPassword')}<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" /></label>
        <label>{t('account.confirmNewPassword')}<input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" /></label>
        {message ? <div className="mp-success">{message}</div> : null}
        {error ? <div className="mp-denied">{error}</div> : null}
        <button className="mp-button dark" disabled={!canSubmit}>{isSubmitting ? t('common.saving') : t('account.submit')}</button>
      </form>
    </Shell>
  );
}
