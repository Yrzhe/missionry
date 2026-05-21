import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, login, resolveSession, signUp } from '../lib/api';
import { useAppStore } from '../lib/store';
import { MissionryMark } from '../components/MissionryMark';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveErrorKey(error: ApiError) {
  if (error.status === 403 && error.code === 'error.auth.not_whitelisted') return 'error.auth.not_whitelisted_user';
  if (error.status === 422 && error.code === 'user_already_exists') return 'error.auth.user_already_exists';
  return error.messageKey ?? error.code;
}

export function SignUp({ onSignedIn }: { onSignedIn?: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAppStore((state) => state.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showLoginLink, setShowLoginLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailError = email && !EMAIL_PATTERN.test(email) ? t('auth.signup.emailInvalid') : null;
  const passwordError = password && password.length < 8 ? t('auth.signup.passwordMin') : null;
  const confirmError = confirmPassword && password !== confirmPassword ? t('auth.signup.passwordMismatch') : null;
  const canSubmit = useMemo(
    () => EMAIL_PATTERN.test(email) && password.length >= 8 && password === confirmPassword && name.trim().length > 0 && !isSubmitting,
    [confirmPassword, email, isSubmitting, name, password],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowLoginLink(false);
    if (!EMAIL_PATTERN.test(email)) {
      setError(t('auth.signup.emailInvalid'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.signup.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp(email.trim(), password, name.trim());
      await login(email.trim(), password);
      const session = await resolveSession();
      setSession(session);
      onSignedIn?.();
      navigate('/missions', { replace: true });
    } catch (signupError) {
      if (signupError instanceof ApiError) {
        const key = resolveErrorKey(signupError);
        const translated = key && i18n.exists(key) ? t(key) : signupError.message;
        setError(translated);
        setShowLoginLink(signupError.status === 422 && signupError.code === 'user_already_exists');
      } else {
        setError(t('auth.signup.error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card signup-page" onSubmit={submit}>
        <div className="mp-logo"><MissionryMark /></div>
        <h1>{t('auth.signup.title')}</h1>
        <p className="mp-muted">{t('auth.signup.subtitle')}</p>
        <label>
          {t('auth.email')}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          {emailError ? <span className="mp-field-error">{emailError}</span> : null}
        </label>
        <label>
          {t('auth.password')}
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" />
          {passwordError ? <span className="mp-field-error">{passwordError}</span> : null}
        </label>
        <label>
          {t('auth.signup.confirmPassword')}
          <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" />
          {confirmError ? <span className="mp-field-error">{confirmError}</span> : null}
        </label>
        <label>
          {t('auth.signup.name')}
          <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" />
        </label>
        {error ? (
          <div className="mp-denied">
            {error}
            {showLoginLink ? <> <Link to="/login">{t('auth.signup.signInInstead')}</Link></> : null}
          </div>
        ) : (
          <div className="mp-muted mp-small">{t('auth.signup.whitelistHint')}</div>
        )}
        <button className="mp-button dark" disabled={!canSubmit}>{isSubmitting ? t('auth.signup.submitting') : t('auth.signup.submit')}</button>
        <div className="auth-links">
          <Link to="/login">{t('auth.signup.hasAccount')}</Link>
          <button type="button" className="mp-button" onClick={() => void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}>{t('common.language')}</button>
        </div>
      </form>
    </main>
  );
}
