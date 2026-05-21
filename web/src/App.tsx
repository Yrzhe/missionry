import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminConsole } from './components/magicpath/admin-console/AdminConsole';
import { AgentLibrary } from './components/magicpath/agent-library/AgentLibrary';
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
import { subscribeMissionEvents } from './lib/sse';
import { useAppStore } from './lib/store';
import { SignUp } from './pages/SignUp';

const VISIBLE_MISSION_LIMIT = 25;

function isLoggedOutError(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function App() {
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'login'>('checking');
  const setSession = useAppStore((state) => state.setSession);
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
  const [error, setError] = useState<string | null>(null);
  const missions = useAppStore((state) => state.missions);
  const setMissions = useAppStore((state) => state.setMissions);
  const setWorkroom = useAppStore((state) => state.setWorkroom);
  const setWorkroomLoading = useAppStore((state) => state.setWorkroomLoading);
  const setBudget = useAppStore((state) => state.setBudget);
  const setSpend = useAppStore((state) => state.setSpend);
  const setAdmin = useAppStore((state) => state.setAdmin);
  const session = useAppStore((state) => state.session);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        let missionItems = (await api.missions()).items;
        if (!missionItems.length) {
          await api.createDemoMission();
          missionItems = (await api.missions()).items;
        }
        if (!alive) return;
        setMissions(missionItems);
        await Promise.all(
          missionItems.slice(0, VISIBLE_MISSION_LIMIT).map(async (mission) => {
            if (alive) setWorkroomLoading(mission.id, true);
            try {
              const workroom = await api.workroom(mission.id);
              if (alive) setWorkroom(mission.id, workroom);
            } catch {
              if (alive) setWorkroomLoading(mission.id, false);
            }
          }),
        );
        if (!alive) return;
        setBudget({
          dailyBudgetCents: missionItems.reduce((sum, mission) => sum + (mission.budgetCapCents ?? mission.dailyBudgetCents ?? 0), 0),
          globalCapCents: 0,
          currentSpendCents: {
            total: missionItems.reduce((sum, mission) => sum + (mission.spentCents ?? mission.missionSpendCents ?? 0), 0),
            llm: 0,
            sandbox: 0,
            other: 0,
          },
          burnRateCentsPerMinute: missionItems.reduce((sum, mission) => sum + (mission.sandboxSummary?.burnRateCentsPerMinute ?? 0), 0),
        });
        setSpend(missionItems.map((mission) => ({
          missionId: mission.id,
          title: mission.title,
          owner: mission.owner,
          capCents: mission.budgetCapCents,
          spentCents: mission.spentCents,
          burnRateCentsPerMinute: mission.sandboxSummary?.burnRateCentsPerMinute,
          status: mission.status,
        })));
        if (session?.role === 'admin') {
          const [adminOverview, adminUsers, adminWhitelist, adminMissions] = await Promise.all([
            api.adminOverview(),
            api.adminUsers(),
            api.adminWhitelist(),
            api.adminMissions(),
          ]);
          if (alive) setAdmin({ adminOverview, adminUsers: adminUsers.items, adminWhitelist: adminWhitelist.items, adminMissions: adminMissions.items });
        }
        setError(null);
      } catch (loadError) {
        if (alive) setError(loadError instanceof Error ? loadError.message : 'load_failed');
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [session?.role, setAdmin, setBudget, setMissions, setSpend, setWorkroom, setWorkroomLoading]);

  if (error && !missions.length) return <FullPageState label="common.error" detail={error} />;
  return <MissionEventBridge />;
}

function MissionEventBridge() {
  const missions = useAppStore((state) => state.missions);
  useEffect(() => {
    const unsubscribers = missions.slice(0, VISIBLE_MISSION_LIMIT).map((mission) => subscribeMissionEvents(mission.id));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [missions]);
  return <RouterRoutes />;
}

function RouterRoutes() {
  const firstMissionId = useAppStore((state) => state.missions[0]?.id);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/missions" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/missions" element={<MissionsHome />} />
      <Route path="/missions/:id" element={<WorkroomLoader />} />
      <Route path="/missions/:id/agents/:instanceId" element={<AgentProfileControlCenter />} />
      <Route path="/agents" element={<AgentLibrary />} />
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
  const { id } = useParams();
  const setWorkroom = useAppStore((state) => state.setWorkroom);
  const setWorkroomLoading = useAppStore((state) => state.setWorkroomLoading);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setWorkroomLoading(id, true);
    void api.workroom(id)
      .then((workroom) => {
        if (alive) setWorkroom(id, workroom);
      })
      .catch(() => {
        if (alive) setWorkroomLoading(id, false);
      });
    return () => {
      alive = false;
    };
  }, [id, setWorkroom, setWorkroomLoading]);
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
        <div className="mp-logo">M</div>
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
