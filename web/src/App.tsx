import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminConsole } from './components/magicpath/admin-console/AdminConsole';
import { AgentLibrary } from './components/magicpath/agent-library/AgentLibrary';
import { Concierge } from './components/magicpath/concierge/Concierge';
import { SkillLibrary } from './components/magicpath/skill-library/SkillLibrary';
import { Schedules } from './components/magicpath/schedules/Schedules';
import { AgentProfileControlCenter } from './components/magicpath/agent-profile-control-center/AgentProfileControlCenter';
import { DirectAgentThread } from './components/magicpath/direct-agent-thread/DirectAgentThread';
import { GrowthCenter } from './components/magicpath/growth-center/GrowthCenter';
import { MissionsHome } from './components/magicpath/missions-home/MissionsHome';
import { SettingsBudget } from './components/magicpath/settings-budget/SettingsBudget';
import { SettingsEnvironment } from './components/magicpath/settings-environment/SettingsEnvironment';
import { SettingsAccount } from './components/magicpath/settings-account/SettingsAccount';
import { MagicPathSurface } from './components/magicpath/Surface';
import { Workroom } from './components/magicpath/workroom/Workroom';
import { ApiError, api, login, resolveSession } from './lib/api';
import { queryKeys } from './lib/query';
import { subscribeMissionEvents } from './lib/sse';
import { useAppStore } from './lib/store';
import { SignUp } from './pages/SignUp';
import { MissionryMark } from './components/MissionryMark';

const SSE_MISSION_LIMIT = 4;

function isLoggedOutError(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function App() {
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'login'>('checking');
  const { setSession } = useAppStore(useShallow((state) => ({ setSession: state.setSession })));
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/signup' || location.pathname === '/login') {
      setAuthState('login');
      return;
    }
    let alive = true;
    resolveSession()
      .then((session) => {
        if (!alive) return;
        setSession(session);
        setAuthState('ready');
      })
      .catch((error) => {
        if (!alive) return;
        setSession(null);
        setAuthState(isLoggedOutError(error) ? 'login' : 'ready');
      });
    return () => {
      alive = false;
    };
  }, [location.pathname, setSession]);

  if (location.pathname === '/signup') return <SignUp onSignedIn={() => setAuthState('ready')} />;
  if (authState === 'checking') return <FullPageState label="common.loading" />;
  if (authState === 'login') return <LoginScreen onReady={() => setAuthState('ready')} />;
  return <AppDataGate />;
}

function AppDataGate() {
  const missionsQuery = useQuery({
    queryKey: queryKeys.missions,
    queryFn: api.missions,
  });

  if (missionsQuery.isError && !missionsQuery.data?.items?.length) {
    return <FullPageState label="common.error" detail={missionsQuery.error instanceof Error ? missionsQuery.error.message : 'load_failed'} />;
  }
  return <MissionEventBridge missions={missionsQuery.data?.items ?? []} />;
}

function MissionEventBridge({ missions }: { missions: Awaited<ReturnType<typeof api.missions>>['items'] }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const currentMissionId = location.pathname.match(/^\/missions\/([^/]+)/)?.[1];
  const subscribedMissions = useMemo(() => {
    const byId = new Map(missions.map((mission) => [mission.id, mission]));
    const current = currentMissionId ? byId.get(currentMissionId) : undefined;
    const foreground = missions.filter((mission) => mission.id !== currentMissionId).slice(0, SSE_MISSION_LIMIT);
    return current ? [current, ...foreground] : foreground;
  }, [currentMissionId, missions]);
  useEffect(() => {
    const unsubscribers = subscribedMissions.map((mission) => subscribeMissionEvents(mission.id));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [subscribedMissions, queryClient]);
  return <RouterRoutes firstMissionId={missions[0]?.id} />;
}

function RouterRoutes({ firstMissionId }: { firstMissionId?: string }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/missions" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/missions" element={<MissionsHome />} />
      <Route path="/missions/:id" element={<WorkroomLoader />} />
      <Route path="/missions/:id/agents/:instanceId" element={<AgentProfileControlCenter />} />
      <Route path="/agents" element={<AgentLibrary />} />
      <Route path="/concierge" element={<Concierge />} />
      <Route path="/skills" element={<SkillLibrary />} />
      <Route path="/schedules" element={<Schedules />} />
      <Route path="/artifacts" element={<MagicPathSurface page="artifacts" />} />
      <Route path="/growth" element={<GrowthCenter />} />
      <Route path="/settings/budget" element={<SettingsBudget />} />
      <Route path="/settings/environment" element={<SettingsEnvironment />} />
      <Route path="/settings/account" element={<SettingsAccount />} />
      <Route path="/admin" element={<AdminConsole />} />
      <Route path="/chat/:threadId" element={<DirectAgentThread />} />
      <Route path="*" element={<Navigate to={firstMissionId ? `/missions/${firstMissionId}` : '/missions'} replace />} />
    </Routes>
  );
}

function WorkroomLoader() {
  return <Workroom />;
}

function LoginScreen({ onReady }: { onReady: () => void }) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const canSubmit = useMemo(() => email.length > 3 && password.length > 0, [email, password]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login(email, password);
      const session = await resolveSession();
      useAppStore.getState().setSession(session);
      onReady();
      navigate(location.pathname === '/' || location.pathname === '/login' ? '/missions' : location.pathname);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t('auth.error'));
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="mp-logo"><MissionryMark /></div>
        <h1>{t('auth.title')}</h1>
        <p className="mp-muted">{t('auth.subtitle')}</p>
        <label>{t('auth.email')}<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
        <label>{t('auth.password')}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        {error ? <div className="mp-denied">{t('auth.error')} · {error}</div> : <div className="mp-muted mp-small">{t('auth.dev')}</div>}
        <button className="mp-button dark" disabled={!canSubmit}>{t('auth.submit')}</button>
        <div className="auth-links">
          <LinkLike href="/signup" label={t('auth.signup.cta')} />
          <button type="button" className="auth-text-button" onClick={() => window.alert(t('auth.reset.unavailable'))}>{t('auth.reset.forgot')}</button>
        </div>
        <button type="button" className="mp-button" onClick={() => void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}>{t('common.language')}</button>
      </form>
    </main>
  );
}

function LinkLike({ href, label }: { href: string; label: string }) {
  const navigate = useNavigate();
  return <button type="button" className="auth-text-button" onClick={() => navigate(href)}>{label}</button>;
}

function FullPageState({ label, detail }: { label: string; detail?: string }) {
  const { t } = useTranslation();
  return <main className="login-screen"><div className="login-card"><h1>{t(label)}</h1>{detail ? <p className="mp-muted">{detail}</p> : null}</div></main>;
}

export default App;
