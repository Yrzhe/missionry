// Missions home + Create flow + Team Proposal pages

function MissionsHome({ setRoute }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = MISSIONS.filter(m => filter === 'all' ? true : filter === 'active' ? ['running','planning','waiting_user_approval','waiting_team_approval','blocked'].includes(m.status) : m.status === filter);
  const stats = {
    active: MISSIONS.filter(m => ['running','planning','waiting_user_approval'].includes(m.status)).length,
    pending: MISSIONS.reduce((s,m) => s + m.pending, 0),
    artifacts: MISSIONS.reduce((s,m) => s + m.artifacts, 0),
  };

  return (
    <>
      <Topbar crumbs={['Missions']} actions={
        <>
          <button className="btn btn-sm"><Icon name="search" size={13}/> Search</button>
          <button className="btn btn-sm btn-primary" onClick={() => setRoute({ name: 'create' })}><Icon name="plus" size={12}/> New Mission</button>
        </>
      }/>
      <div className="content stack-6">
        {/* Hero */}
        <div style={{ paddingTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Workspace · Sasha Kim</div>
          <h1 style={{ maxWidth: 760, marginBottom: 8 }}>Build an AI team around every complex task.</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 640, marginBottom: 0 }}>
            Create a Mission. We'll find, reuse, or spin up the agents it needs — and keep the plan, runs, costs, and artifacts in one place.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard label="Active missions" value={stats.active} sub="2 awaiting your input"/>
          <StatCard label="Pending approvals" value={stats.pending} sub="3 high priority" tone="amber"/>
          <StatCard label="Artifacts this week" value={stats.artifacts} sub="9 accepted"/>
          <StatCard label="Spend this week" value="$5.39" sub="of $25 budget"/>
        </div>

        {/* Filters */}
        <div className="between">
          <div className="row" style={{ gap: 4 }}>
            {['all','active','running','waiting_user_approval','completed','draft','archived'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cls('btn btn-sm', filter === f ? 'btn-primary' : 'btn-ghost')}>
                {f === 'all' ? 'All' : f === 'waiting_user_approval' ? 'Awaiting you' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="row-tight muted" style={{ fontSize: 12 }}>
            <span>Sort by</span>
            <button className="btn btn-sm btn-ghost">Recently updated <Icon name="chevD" size={11}/></button>
          </div>
        </div>

        {/* Mission list */}
        <div className="stack-3">
          {filtered.map(m => <MissionRow key={m.id} m={m} onOpen={() => setRoute({ name: 'workroom', id: m.id })}/>)}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="card">
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="serif" style={{ fontSize: 32, lineHeight: 1, color: tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>{value}</div>
      <div className="label-tiny" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function MissionRow({ m, onOpen }) {
  return (
    <div className="card card-hover" onClick={onOpen}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight" style={{ marginBottom: 6 }}>
            <StatusBadge status={m.status}/>
            <span className="label-tiny mono">M-{m.id.split('-')[1].padStart(4,'0')}</span>
            <span className="label-tiny">· {m.updated}</span>
          </div>
          <div className="serif" style={{ fontSize: 19, marginBottom: 4 }}>{m.title}</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14, maxWidth: 720 }}>{m.objective}</div>

          <div className="row" style={{ gap: 24, fontSize: 12, color: 'var(--ink-3)' }}>
            {m.agentIds.length > 0 && (
              <div className="row-tight">
                <div className="av-stack">
                  {m.agentIds.slice(0, 5).map(id => <AgentAvatar key={id} id={id} size="sm"/>)}
                </div>
                <span style={{ marginLeft: 4 }}>{m.agentIds.length} agents</span>
              </div>
            )}
            {m.activeCard && (
              <div className="row-tight">
                <div className="spinner"/>
                <span style={{ color: 'var(--amber)' }}>{m.activeCard}</span>
              </div>
            )}
            {m.artifacts > 0 && <div className="row-tight"><Icon name="artifact" size={12}/> {m.artifacts} artifacts</div>}
            {m.budget && <div className="row-tight"><Icon name="coin" size={12}/> ${m.cost.toFixed(2)} / ${m.budget.toFixed(2)}</div>}
            {m.pending > 0 && <div className="row-tight" style={{ color: 'var(--ocean)' }}><Icon name="bell" size={12}/> {m.pending} pending</div>}
          </div>
        </div>

        <div style={{ width: 180, flexShrink: 0 }}>
          {m.progress > 0 && m.progress < 1 && (
            <>
              <div className="between" style={{ marginBottom: 6 }}>
                <span className="label-tiny">Progress</span>
                <span className="label-tiny mono">{Math.round(m.progress * 100)}%</span>
              </div>
              <div className="progress"><div className="progress-bar" style={{ width: `${m.progress * 100}%`, background: m.status === 'running' ? 'var(--running)' : 'var(--sage)' }}/></div>
            </>
          )}
          {m.progress === 1 && <div className="row-tight" style={{ color: 'var(--sage)', fontSize: 12 }}><Icon name="check" size={13}/> Completed</div>}
          {m.status === 'draft' && <div className="muted" style={{ fontSize: 12 }}>Not started</div>}
        </div>
      </div>
    </div>
  );
}

// ====== Create Mission ======
function CreateMission({ setRoute }) {
  const [step, setStep] = React.useState(1);
  const [title, setTitle] = React.useState('Design a multi-agent collaboration product');
  const [objective, setObjective] = React.useState("Define product positioning, core flows, agent team formation, agent growth mechanics, and a demo plan for a new multi-agent workspace.");
  const [budget, setBudget] = React.useState('8.00');
  const [allowNew, setAllowNew] = React.useState(true);
  const [allowMemory, setAllowMemory] = React.useState(true);

  return (
    <>
      <Topbar crumbs={['Missions', 'New']} actions={<button className="btn btn-sm btn-ghost" onClick={() => setRoute({ name: 'missions' })}><Icon name="x" size={13}/> Cancel</button>}/>
      <div className="content content-narrow stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Step {step} of 2 · {step === 1 ? 'Describe' : 'Brief'}</div>
          <h1>{step === 1 ? 'What do you want to get done?' : 'Mission Brief'}</h1>
        </div>

        {step === 1 ? (
          <div className="stack-4">
            <div className="card stack-3">
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Title</div>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)}/>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Objective</div>
                <textarea className="textarea" rows={5} value={objective} onChange={e => setObjective(e.target.value)} placeholder="Describe the outcome you want, not the steps."/>
              </div>
              <div className="divider"/>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Budget cap</div>
                  <div className="row-tight">
                    <span className="muted">$</span>
                    <input className="input" style={{ width: 100 }} value={budget} onChange={e => setBudget(e.target.value)}/>
                  </div>
                </div>
                <div style={{ flex: 2, minWidth: 240 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Permissions</div>
                  <div className="stack-2">
                    <Toggle label="Allow creating new agents" sub="If no library agent matches" checked={allowNew} onChange={setAllowNew}/>
                    <Toggle label="Allow writing memory" sub="Persist learnings to agent profiles" checked={allowMemory} onChange={setAllowMemory}/>
                  </div>
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <span className="label-tiny">Templates</span>
              {['Competitive scan','Bug triage','Feedback synthesis','Product design'].map(t => (
                <button key={t} className="chip" style={{ cursor: 'pointer' }}>{t}</button>
              ))}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-lg btn-primary" onClick={() => setStep(2)}>
                Generate Mission Brief <Icon name="arrow" size={13}/>
              </button>
            </div>
          </div>
        ) : (
          <MissionBrief title={title} objective={objective} budget={budget} onBack={() => setStep(1)} onContinue={() => setRoute({ name: 'proposal' })}/>
        )}
      </div>
    </>
  );
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <label className="row" style={{ cursor: 'pointer', gap: 12 }}>
      <span style={{
        width: 30, height: 18, borderRadius: 999,
        background: checked ? 'var(--ink)' : 'var(--line-2)',
        position: 'relative', flexShrink: 0, transition: 'background 0.15s'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%', background: 'var(--surface)',
          transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }}/>
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>{label}</div>
        <div className="label-tiny">{sub}</div>
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }}/>
    </label>
  );
}

function MissionBrief({ title, objective, budget, onBack, onContinue }) {
  const [analyzing, setAnalyzing] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setAnalyzing(false), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="stack-4 animate-in">
      <div className="card stack-4">
        <div className="row-tight" style={{ color: analyzing ? 'var(--amber)' : 'var(--sage)', fontSize: 12 }}>
          {analyzing ? <><div className="spinner"/> Atlas is parsing your mission…</> : <><Icon name="check" size={13}/> Brief ready · Atlas (Lead Agent)</>}
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Title</div>
          <div className="serif" style={{ fontSize: 22 }}>{title}</div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Objective</div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{objective}</div>
        </div>

        <div className="divider"/>

        <BriefSection icon="bolt" label="Mission type" value="Product design · Strategy · Demo planning" loading={analyzing}/>
        <BriefSection icon="artifact" label="Expected artifacts" value="PRD · Information architecture · Demo flow · Risk memo · Metric tree" loading={analyzing}/>
        <BriefSection icon="users" label="Suggested roles" value="Lead · Researcher · Strategist · UX Architect · Critic · Writer · Metrics Designer" loading={analyzing}/>
        <BriefSection icon="layers" label="Complexity" value="High — multi-agent recommended (7 specialists)" loading={analyzing}/>
        <BriefSection icon="coin" label="Budget cap" value={`$${budget} (estimated $3.20 use)`} loading={analyzing}/>

        {!analyzing && (
          <div style={{ background: 'var(--amber-bg)', border: '1px solid transparent', borderRadius: 8, padding: 12 }}>
            <div className="row-tight" style={{ color: 'var(--amber)', fontSize: 12, marginBottom: 4 }}>
              <Icon name="bolt" size={13}/> <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Heads up</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Demo scope is wide. Consider constraining outputs to a single PRD and 7 page surfaces — otherwise the team may produce unfocused artifacts.
            </div>
          </div>
        )}
      </div>

      <div className="between">
        <button className="btn" onClick={onBack}><Icon name="arrowL" size={13}/> Edit objective</button>
        <button className="btn btn-lg btn-primary" disabled={analyzing} onClick={onContinue}>
          Compile Agent Team <Icon name="arrow" size={13}/>
        </button>
      </div>
    </div>
  );
}

function BriefSection({ icon, label, value, loading }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'baseline' }}>
      <div className="row-tight" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
        <Icon name={icon} size={13}/> {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink)', minHeight: 18 }}>
        {loading ? <span className="muted">…</span> : value}
      </div>
    </div>
  );
}

Object.assign(window, { MissionsHome, CreateMission });
