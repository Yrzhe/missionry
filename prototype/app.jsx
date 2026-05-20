// Main App entry — wires all pages, theme, and tweaks panel

const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "missionState": "running"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULS);
  const [route, setRoute] = React.useState({ name: 'missions' });

  // Apply theme
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
  }, [tweaks.theme]);

  // Active mission state controls workroom progression
  const missionState = tweaks.missionState;
  const setMissionState = (s) => setTweak('missionState', s);

  return (
    <div className="app" data-screen-label={route.name}>
      <Sidebar route={route} setRoute={setRoute} missionState={missionState}/>
      <main className="main">
        {route.name === 'missions' && <MissionsHome setRoute={setRoute}/>}
        {route.name === 'create' && <CreateMission setRoute={setRoute}/>}
        {route.name === 'proposal' && <TeamProposalPage setRoute={setRoute}/>}
        {route.name === 'workroom' && <Workroom setRoute={setRoute} route={route} missionState={missionState} setMissionState={setMissionState}/>}
        {route.name === 'artifact' && <ArtifactPage setRoute={setRoute} route={route}/>}
        {route.name === 'agent' && <AgentProfilePage setRoute={setRoute} route={route}/>}
        {route.name === 'agents' && <AgentLibraryPage setRoute={setRoute}/>}
        {route.name === 'artifacts' && <ArtifactsListPage setRoute={setRoute}/>}
        {route.name === 'growth' && <GrowthCenter setRoute={setRoute}/>}
        {route.name === 'extensions' && <ExtensionsHub setRoute={setRoute}/>}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Appearance">
          <TweakRadio label="Theme" value={tweaks.theme} onChange={v => setTweak('theme', v)}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}/>
        </TweakSection>
        <TweakSection title="Mission progression" subtitle="Advances the workroom demo state">
          <TweakRadio label="State" value={tweaks.missionState} onChange={v => setTweak('missionState', v)}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'running', label: 'Running' },
              { value: 'completed', label: 'Completed' },
            ]}/>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.4 }}>
            Open the running mission "Design a multi-agent collaboration product" from the sidebar to see this take effect.
          </div>
        </TweakSection>
        <TweakSection title="Jump to">
          <TweakButton label="Missions home" onClick={() => setRoute({ name: 'missions' })}/>
          <TweakButton label="Create Mission" onClick={() => setRoute({ name: 'create' })}/>
          <TweakButton label="Team Proposal" onClick={() => setRoute({ name: 'proposal' })}/>
          <TweakButton label="Workroom (M-1)" onClick={() => setRoute({ name: 'workroom', id: 'm-1' })}/>
          <TweakButton label="Artifact detail" onClick={() => setRoute({ name: 'artifact', id: 'a-2' })}/>
          <TweakButton label="Agent profile (Iris)" onClick={() => setRoute({ name: 'agent', id: 'strategist' })}/>
          <TweakButton label="Growth Center" onClick={() => setRoute({ name: 'growth' })}/>
          <TweakButton label="Extensions Hub" onClick={() => setRoute({ name: 'extensions' })}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// Simple Artifacts list page
function ArtifactsListPage({ setRoute }) {
  return (
    <>
      <Topbar crumbs={['Artifacts']}/>
      <div className="content stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>All artifacts · 28</div>
          <h1>Outputs your missions produced.</h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {ARTIFACTS.map(a => {
            const ag = AGENTS[a.agentId];
            return (
              <div key={a.id} className="card card-hover" onClick={() => setRoute({ name: 'artifact', id: a.id })}>
                <div className="row-tight" style={{ marginBottom: 8 }}>
                  <StatusBadge status={a.status}/>
                  <span className="label-tiny mono">{a.id.toUpperCase()} · v{a.version}</span>
                </div>
                <div className="serif" style={{ fontSize: 17, marginBottom: 8 }}>{a.title}</div>
                <div className="row-tight muted" style={{ fontSize: 12 }}>
                  <AgentAvatar id={a.agentId} size="sm"/>
                  <span>{ag.name}</span>
                  <span>· {a.updated}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { App, ArtifactsListPage });
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
