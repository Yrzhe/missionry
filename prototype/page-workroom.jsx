// Mission Workroom — the core surface

function Workroom({ setRoute, route, missionState, setMissionState }) {
  const m = MISSIONS.find(x => x.id === route.id) || MISSIONS[0];
  const [tab, setTab] = React.useState('plan');
  const [selectedCard, setSelectedCard] = React.useState(null);
  const [selectedArtifact, setSelectedArtifact] = React.useState(null);
  const [showApprovalModal, setShowApprovalModal] = React.useState(false);

  // simulated execution: progress workCards based on missionState
  const cards = WORK_CARDS.map(c => {
    if (missionState === 'draft') return { ...c, status: 'queued', cost: 0, time: null };
    if (missionState === 'completed') return { ...c, status: 'done' };
    return c;
  });

  const status = missionState === 'draft' ? 'planning'
    : missionState === 'completed' ? 'completed'
    : 'running';

  return (
    <>
      <Topbar
        crumbs={['Missions', m.title]}
        actions={
          <>
            <StatusBadge status={status}/>
            <button className="btn btn-sm btn-ghost"><Icon name="pause" size={12}/> Pause</button>
            <button className="btn btn-sm btn-ghost"><Icon name="stop" size={12}/></button>
            <button className="btn btn-sm btn-primary" onClick={() => setShowApprovalModal(true)} disabled={missionState !== 'completed'}>
              {missionState === 'completed' ? 'Review & complete' : 'Awaiting agents…'}
            </button>
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', minHeight: 'calc(100vh - 52px)' }}>
        {/* Main column */}
        <div style={{ minWidth: 0, borderRight: '1px solid var(--line)' }}>
          {/* Mission header */}
          <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Mission · {m.id.toUpperCase().replace('-','-')}</div>
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>{m.title}</h2>
            <p className="muted" style={{ fontSize: 14, maxWidth: 760, marginBottom: 16 }}>{m.objective}</p>

            <div className="row" style={{ gap: 24, fontSize: 12, color: 'var(--ink-3)' }}>
              <div className="row-tight"><Icon name="clock" size={12}/> Started 14m ago</div>
              <div className="row-tight"><Icon name="coin" size={12}/> $2.84 / $8.00</div>
              <div className="row-tight"><Icon name="users" size={12}/> 7 agents</div>
              <div className="row-tight"><Icon name="artifact" size={12}/> 5 artifacts</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ padding: '0 32px', background: 'var(--bg)', position: 'sticky', top: 52, zIndex: 5 }}>
            <div className="tabs">
              <div className={cls('tab', tab === 'plan' && 'active')} onClick={() => setTab('plan')}>Plan <span className="tab-count">{cards.length}</span></div>
              <div className={cls('tab', tab === 'activity' && 'active')} onClick={() => setTab('activity')}>Activity <span className="tab-count">{TRACE.length}</span></div>
              <div className={cls('tab', tab === 'artifacts' && 'active')} onClick={() => setTab('artifacts')}>Artifacts <span className="tab-count">{ARTIFACTS.length}</span></div>
              <div className={cls('tab', tab === 'discussion' && 'active')} onClick={() => setTab('discussion')}>Discussion</div>
            </div>
          </div>

          <div style={{ padding: '24px 32px 60px' }}>
            {tab === 'plan' && <PlanTab cards={cards} selected={selectedCard} onSelect={setSelectedCard} missionState={missionState}/>}
            {tab === 'activity' && <ActivityTab missionState={missionState}/>}
            {tab === 'artifacts' && <ArtifactsTab onSelect={setSelectedArtifact} selected={selectedArtifact} setRoute={setRoute}/>}
            {tab === 'discussion' && <DiscussionTab/>}
          </div>
        </div>

        {/* Right rail */}
        <WorkroomRail missionState={missionState} setMissionState={setMissionState} cards={cards} setRoute={setRoute}/>
      </div>

      {showApprovalModal && <CompletionModal onClose={() => setShowApprovalModal(false)} setRoute={setRoute}/>}
    </>
  );
}

// ====== Plan Tab ======
function PlanTab({ cards, selected, onSelect, missionState }) {
  return (
    <div className="stack-4">
      <div className="between">
        <div className="eyebrow">Work cards · 7 total</div>
        <div className="row-tight muted" style={{ fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sage)' }}/> done
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--running)', marginLeft: 8 }}/> running
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-4)', marginLeft: 8 }}/> queued
        </div>
      </div>

      {/* Plan as a timeline / dependency view */}
      <div className="stack-3">
        {cards.map((c, i) => <WorkCardRow key={c.id} card={c} index={i + 1} onSelect={() => onSelect(c.id === selected ? null : c.id)} expanded={selected === c.id}/>)}
      </div>
    </div>
  );
}

function WorkCardRow({ card, index, onSelect, expanded }) {
  const a = AGENTS[card.agentId];
  const statusColor = {
    done: 'var(--sage)', running: 'var(--running)', queued: 'var(--ink-4)',
    blocked: 'var(--blocked)', waiting_approval: 'var(--ocean)', failed: 'var(--blocked)'
  }[card.status];

  return (
    <div className="card card-hover" onClick={onSelect} style={{ borderColor: expanded ? 'var(--ink)' : undefined, borderWidth: expanded ? 2 : 1, padding: expanded ? 17 : 18 }}>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: card.status === 'running' ? 'var(--amber-bg)' : card.status === 'done' ? 'var(--sage-bg)' : 'var(--bg-sunk)',
          color: statusColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600
        }}>
          {card.status === 'running' ? <div className="spinner"/> : card.status === 'done' ? <Icon name="check" size={14}/> : index}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight" style={{ marginBottom: 4 }}>
            <span className="label-tiny mono">{card.id.toUpperCase()}</span>
            <StatusBadge status={card.status}/>
            {card.status === 'running' && card.progress && <span className="label-tiny mono">{Math.round(card.progress * 100)}%</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{card.title}</div>
          <div className="row" style={{ gap: 14, fontSize: 12, color: 'var(--ink-3)' }}>
            <div className="row-tight">
              <AgentAvatar id={card.agentId} size="sm"/>
              <span>{a.name}</span>
            </div>
            {card.time && <span className="row-tight mono"><Icon name="clock" size={11}/> {card.time}</span>}
            <span className="row-tight mono"><Icon name="coin" size={11}/> ${card.cost.toFixed(2)} / ${card.budget.toFixed(2)}</span>
            {card.deps.length > 0 && <span className="label-tiny">depends on {card.deps.join(', ').toUpperCase()}</span>}
          </div>
          {card.status === 'running' && card.progress && (
            <div className="progress" style={{ marginTop: 10 }}><div className="progress-bar" style={{ width: `${card.progress*100}%`, background: 'var(--running)' }}/></div>
          )}
        </div>

        <div className="row-tight" style={{ flexShrink: 0 }}>
          {card.status === 'running' && <span className="streaming"></span>}
          <Icon name={expanded ? 'chevD' : 'chevR'} size={14} className="dim"/>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }} className="stack-3 animate-in">
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Deliverable</div>
            <div style={{ fontSize: 13 }}>{card.deliverable}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm">View trace</button>
            <button className="btn btn-sm">Re-run</button>
            <button className="btn btn-sm">Reassign</button>
            <button className="btn btn-sm btn-ghost">Edit description</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== Activity Tab ======
function ActivityTab({ missionState }) {
  const events = missionState === 'draft' ? TRACE.slice(0, 1) : missionState === 'completed' ? TRACE : TRACE;
  const [filter, setFilter] = React.useState('all');
  const [agentFilter, setAgentFilter] = React.useState(null);
  const filtered = events.filter(e => {
    if (filter === 'messages' && e.type !== 'message') return false;
    if (filter === 'tasks' && !e.type.startsWith('task_')) return false;
    if (filter === 'tools' && e.type !== 'tool_call') return false;
    if (filter === 'artifacts' && e.type !== 'artifact_created') return false;
    if (agentFilter && e.agentId !== agentFilter) return false;
    return true;
  });

  return (
    <div className="stack-4">
      <div className="between">
        <div className="row" style={{ gap: 4 }}>
          {['all','messages','tasks','tools','artifacts'].map(f => (
            <button key={f} className={cls('btn btn-sm', filter === f ? 'btn-primary' : 'btn-ghost')} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="row-tight">
          <span className="label-tiny">Filter by agent</span>
          {Object.values(AGENTS).slice(0, 7).map(a => (
            <button key={a.id} onClick={() => setAgentFilter(agentFilter === a.id ? null : a.id)}
              style={{ opacity: agentFilter && agentFilter !== a.id ? 0.35 : 1, transition: 'opacity 0.15s' }}>
              <AgentAvatar id={a.id} size="sm"/>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '4px 18px' }}>
        {filtered.map((e, i) => <TraceEvent key={i} event={e}/>)}
      </div>
    </div>
  );
}

function TraceEvent({ event: e }) {
  const a = e.agentId ? AGENTS[e.agentId] : null;
  const typeIcon = {
    message: 'pen', task_created: 'plus', task_started: 'play', task_completed: 'check',
    task_failed: 'x', tool_call: 'bolt', artifact_created: 'artifact', handoff: 'arrow',
    parallel_started: 'layers', mission_started: 'sparkle', streaming: 'pen'
  }[e.type] || 'dot';
  const typeColor = {
    task_completed: 'var(--sage)', task_failed: 'var(--blocked)',
    artifact_created: 'var(--plum)', handoff: 'var(--ocean)',
    streaming: 'var(--amber)'
  }[e.type] || 'var(--ink-3)';

  return (
    <div className="feed-event">
      <div style={{ position: 'relative' }}>
        {a ? <AgentAvatar id={e.agentId} size="sm"/> : (
          <div style={{
            width: 22, height: 22, borderRadius: 6, background: 'var(--bg-sunk)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: typeColor
          }}>
            <Icon name={typeIcon} size={12}/>
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row-tight" style={{ marginBottom: 2 }}>
          {a && <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>}
          <span className="feed-time">{e.t}</span>
          <span className="chip mono" style={{ fontSize: 9, padding: '1px 5px' }}>{e.type}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }} className={e.live ? 'streaming' : ''}>
          {e.text}
        </div>
      </div>
    </div>
  );
}

// ====== Artifacts Tab ======
function ArtifactsTab({ onSelect, selected, setRoute }) {
  const [open, setOpen] = React.useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: open ? '320px 1fr' : '1fr', gap: 18 }}>
      <div className="stack-2">
        {ARTIFACTS.map(a => {
          const ag = AGENTS[a.agentId];
          return (
            <div key={a.id} className="card card-hover" onClick={() => setOpen(open === a.id ? null : a.id)}
              style={{ padding: 14, borderColor: open === a.id ? 'var(--ink)' : undefined, borderWidth: open === a.id ? 2 : 1 }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 40, borderRadius: 4, flexShrink: 0,
                  background: 'var(--bg-sunk)', border: '1px solid var(--line)',
                  display: 'flex', alignItems: 'flex-start', padding: '6px 4px',
                  fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-4)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                    <div style={{ height: 1, background: 'var(--ink-4)', width: '70%' }}/>
                    <div style={{ height: 1, background: 'var(--ink-4)', width: '90%' }}/>
                    <div style={{ height: 1, background: 'var(--ink-4)', width: '60%' }}/>
                    <div style={{ height: 1, background: 'var(--ink-4)', width: '80%' }}/>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-tight" style={{ marginBottom: 2 }}>
                    <StatusBadge status={a.status}/>
                    <span className="label-tiny mono">v{a.version}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }} className={a.streaming ? 'streaming' : ''}>{a.title}</div>
                  <div className="row-tight" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    <AgentAvatar id={a.agentId} size="sm"/>
                    <span>{ag.name}</span>
                    <span>·</span>
                    <span>{a.updated}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {open && <ArtifactPreview artifactId={open} onExpand={() => setRoute({ name: 'artifact', id: open })}/>}
    </div>
  );
}

function ArtifactPreview({ artifactId, onExpand }) {
  const a = ARTIFACTS.find(x => x.id === artifactId);
  const ag = AGENTS[a.agentId];
  return (
    <div className="card animate-in" style={{ padding: 0, position: 'sticky', top: 100, alignSelf: 'flex-start', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
      <div className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
        <div className="row-tight">
          <AgentAvatar id={a.agentId} size="sm"/>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ag.name}</span>
          <span className="muted" style={{ fontSize: 12 }}>· {a.updated}</span>
        </div>
        <div className="row-tight">
          <button className="btn btn-sm" onClick={onExpand}><Icon name="eye" size={12}/> Open</button>
        </div>
      </div>
      <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
        <ArtifactContent artifactId={artifactId} compact/>
      </div>
      <div className="between" style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
        <span className="label-tiny">Sources: 3 work cards · 12 trace events</span>
        <div className="row-tight">
          <button className="btn btn-sm">Request revision</button>
          <button className="btn btn-sm btn-primary">Accept</button>
        </div>
      </div>
    </div>
  );
}

// ====== Discussion Tab ======
function DiscussionTab() {
  const messages = [
    { agentId: 'lead', t: '2m', text: 'Iris and Cedar agree the core object should be Mission. Tally suggests "Accepted Mission Artifacts" as north star. Should I lock this framing before Quill writes section 1?' },
    { agentId: 'critic', t: '1m', text: '@Atlas — strong agree on framing. One pushback: don\'t describe Agents as "members" in the doc. Use "executors" or "specialists" to keep the team-as-tool metaphor sharp.' },
    { agentId: 'strategist', t: '1m', text: 'Going with "specialists". Updating positioning v2.' },
  ];
  const [draft, setDraft] = React.useState('');
  return (
    <div className="stack-4">
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '4px 18px', maxHeight: 480, overflowY: 'auto' }}>
          {messages.map((msg, i) => {
            const a = AGENTS[msg.agentId];
            return (
              <div key={i} className="feed-event">
                <AgentAvatar id={msg.agentId} size="sm"/>
                <div>
                  <div className="row-tight" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{a.role} · {msg.t}</span>
                  </div>
                  <div style={{ fontSize: 14 }}>{msg.text}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Reply or @mention an agent…" value={draft} onChange={e => setDraft(e.target.value)} style={{ flex: 1 }}/>
            <button className="btn btn-primary">Send</button>
          </div>
          <div className="row-tight" style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>
            <span>Mention:</span>
            {['Atlas','Marlow','Iris','Cedar','Vex','Quill','Tally'].map(n => <span key={n} className="chip mono" style={{ fontSize: 10 }}>@{n}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Right rail ======
function WorkroomRail({ missionState, setMissionState, cards, setRoute }) {
  const team = ['lead','research','strategist','ux','metrics','critic','writer'];
  const totalCost = cards.reduce((s, c) => s + c.cost, 0);
  const budget = 8.0;

  return (
    <aside style={{ background: 'var(--bg-elev)', padding: '20px 22px', overflow: 'auto' }} className="stack-6">
      {/* Approvals */}
      {missionState === 'completed' && (
        <div className="card" style={{ background: 'var(--ocean-bg)', borderColor: 'transparent' }}>
          <div className="row-tight" style={{ color: 'var(--ocean)', marginBottom: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <Icon name="bell" size={12}/> Pending approval
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Quill finished PRD v0.1. Awaiting your accept.</div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-primary" style={{ flex: 1 }}>Review</button>
            <button className="btn btn-sm" style={{ flex: 1 }}>Snooze</button>
          </div>
        </div>
      )}

      {/* Budget */}
      <div>
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="eyebrow">Budget</span>
          <span className="mono" style={{ fontSize: 12 }}>${totalCost.toFixed(2)} / ${budget.toFixed(2)}</span>
        </div>
        <div className="progress" style={{ height: 6 }}>
          <div className="progress-bar" style={{ width: `${(totalCost/budget)*100}%`, background: 'var(--amber)' }}/>
        </div>
        <div className="label-tiny" style={{ marginTop: 6 }}>{Math.round((totalCost/budget)*100)}% used · est. $0.36 remaining</div>
      </div>

      {/* Team */}
      <div>
        <div className="between" style={{ marginBottom: 10 }}>
          <span className="eyebrow">Agent team</span>
          <button className="btn btn-sm btn-ghost"><Icon name="plus" size={11}/></button>
        </div>
        <div className="stack-2">
          {team.map(id => <RailAgent key={id} id={id} missionState={missionState} cards={cards} setRoute={setRoute}/>)}
        </div>
      </div>

      {/* Mission state controls */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Mission state</div>
        <div className="card" style={{ padding: 12 }}>
          <div className="stack-2">
            {['draft','running','completed'].map(s => (
              <button key={s} className={cls('btn btn-sm', missionState === s ? 'btn-primary' : 'btn-ghost')}
                style={{ justifyContent: 'flex-start', width: '100%' }}
                onClick={() => setMissionState(s)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s === 'running' ? 'var(--running)' : s === 'completed' ? 'var(--sage)' : 'var(--ink-4)' }}/>
                {s === 'draft' ? 'Draft' : s === 'running' ? 'Running' : 'Completed'}
              </button>
            ))}
          </div>
          <div className="label-tiny" style={{ marginTop: 8 }}>Demo control — simulates time progression</div>
        </div>
      </div>

      {/* Stop */}
      <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
        <Icon name="stop" size={12}/> Stop all agents
      </button>
    </aside>
  );
}

function RailAgent({ id, missionState, cards, setRoute }) {
  const a = AGENTS[id];
  const card = cards.find(c => c.agentId === id);
  const status = missionState === 'draft' ? 'idle' :
    missionState === 'completed' ? 'done' :
    card?.status === 'running' ? 'running' :
    card?.status === 'done' ? 'done' :
    card?.status === 'queued' ? 'queued' : 'idle';

  return (
    <div className="row" style={{ gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-sunk)'}
      onMouseLeave={(e) => e.currentTarget.style.background = ''}
      onClick={() => setRoute({ name: 'agent', id })}>
      <AgentAvatar id={id} size="md" status={status}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
        <div className="label-tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status === 'running' && card ? card.title :
           status === 'done' ? 'Idle · ready' :
           status === 'queued' && card ? `Queued · ${card.title}` :
           a.role}
        </div>
      </div>
      {status === 'running' && <div className="spinner"/>}
    </div>
  );
}

// ====== Completion Modal ======
function CompletionModal({ onClose, setRoute }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,28,23,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 14, padding: 28, maxWidth: 520, width: '100%',
        boxShadow: 'var(--shadow-lg)'
      }} className="stack-4 animate-in">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Mission completed</div>
          <h2>Atlas wrapped your mission.</h2>
          <p className="muted" style={{ fontSize: 14 }}>5 artifacts produced. 7 work cards completed. $2.84 spent of $8.00.</p>
        </div>
        <div className="card" style={{ background: 'var(--bg-elev)' }}>
          <div className="row-tight" style={{ marginBottom: 8 }}>
            <Icon name="growth" size={14}/> <span style={{ fontWeight: 500 }}>8 growth proposals</span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Review what your agents learned and decide what to keep.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Later</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onClose(); setRoute({ name: 'growth' }); }}>Open Growth Center →</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Workroom });
