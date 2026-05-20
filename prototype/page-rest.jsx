// Artifact, Agent Profile, Growth Center pages

// ====== Artifact Content (shared) ======
function ArtifactContent({ artifactId, compact }) {
  // Sample content matching artifact id
  const contentMap = {
    'a-1': (
      <div className="doc">
        <h1>Competitive brief — 8 adjacent products</h1>
        <p className="muted" style={{ fontSize: 14 }}>Survey of products in the chat-with-agents, workflow-builder, and agent-marketplace neighborhoods. Filtered for products that touch multi-agent task execution.</p>
        <h2>Summary</h2>
        <p>Three product shapes dominate today: <em>single-agent chat</em>, <em>workflow builders</em>, and <em>agent marketplaces</em>. None treat the task itself as the primary object — they treat the chat, the graph, or the agent as the primary object.</p>
        <h3>Pattern: chat-as-task-room</h3>
        <p>Five of eight products surveyed put a chat thread at the center of their UI even when the actual goal is a multi-step task. This conflates the conversation log with the unit of work.</p>
        <blockquote>Opportunity: position around <strong>Mission as the primary object</strong>. The chat becomes a coordination layer, not the deliverable.</blockquote>
        {!compact && (<>
          <h3>Pattern: agent-as-product</h3>
          <p>Marketplaces sell <em>agents</em>. Users discover individual agents by capability and run them one at a time. Composition is manual.</p>
          <h2>Differentiation hooks</h2>
          <ul><li>Compile a <strong>team</strong>, not pick one agent.</li><li>Show <strong>source</strong>: reuse / adapt / create.</li><li>Make agent <strong>growth</strong> reviewable.</li></ul>
        </>)}
      </div>
    ),
    'a-2': (
      <div className="doc">
        <h1>Positioning canvas: Mission, not Chat</h1>
        <h2>One-liner</h2>
        <p>A workspace where humans <em>compile, supervise, and train</em> a team of AI specialists around a specific mission — instead of chatting with one agent or wiring a workflow.</p>
        <h2>Core stance</h2>
        <ul><li>The unit of work is a <strong>Mission</strong>, not a chat.</li><li>The system organizes an <strong>Agent Team</strong>, not a contact list.</li><li>Agents execute <strong>Work Cards</strong>, not loose messages.</li><li>Process is a <strong>Trace</strong>, not a chat log.</li><li>Outcome is an <strong>Artifact</strong>, not a one-off reply.</li></ul>
        {!compact && (<>
          <h2>Why now</h2>
          <p>Single-agent ceilings are visible. Power users already keep three to five AI tools open simultaneously. The bottleneck is no longer model capability; it is task organization.</p>
        </>)}
      </div>
    ),
    'a-3': (
      <div className="doc">
        <h1>IA blueprint + 7 page specs</h1>
        <h2>Information architecture</h2>
        <p>Seven core surfaces: Missions home, Create Mission, Team Proposal, Mission Workroom, Artifact, Agent Profile, Growth Center.</p>
        <h3>Workroom layout</h3>
        <p>Sidebar nav · main area split into Plan / Activity / Artifacts / Discussion tabs · right rail for team, budget, approvals.</p>
        <blockquote>Resist the urge to make the chat surface the primary view. Plan and Artifacts must be reachable in one click.</blockquote>
      </div>
    ),
    'a-4': (
      <div className="doc">
        <h1>Metric tree</h1>
        <h2>North star</h2>
        <p><strong>Accepted Mission Artifacts</strong> — count of artifacts that pass user review.</p>
        <h2>Anti-metrics</h2>
        <ul><li>Message count <em>(noise, not value)</em></li><li>Number of agents <em>(complexity, not value)</em></li><li>Chat session length <em>(frustration proxy)</em></li></ul>
        <h2>Diagnostic</h2>
        <ul><li>Team Proposal approval rate</li><li>Average time to accepted artifact</li><li>Agent reuse rate</li><li>Cost per accepted artifact</li></ul>
      </div>
    ),
    'a-5': (
      <div className="doc">
        <h1>PRD v0.1 — Multi-Agent Task Workspace</h1>
        <p className="muted">Synthesized by Quill from 4 upstream artifacts.</p>
        <h2>1. Users → problem</h2>
        <p>AI-native operators (PMs, tech leads, founders, analysts) keep multiple AI tools open and copy context between them. There is no shared task object. Outcomes don't accumulate.</p>
        <h2>2. Solution</h2>
        <p>A workspace where every complex task becomes a <strong>Mission</strong>. The system compiles an Agent Team, dispatches work cards, traces execution, and sinks results into reviewable artifacts.</p>
        <h2>3. Core concepts</h2>
        <p className="streaming">Mission · Agent · Team Compiler · Team Proposal · Work Card · Lead Agent · Execution Trace · Artifact · Growth Proposal…</p>
      </div>
    ),
  };
  return contentMap[artifactId] || <div className="muted">Artifact content placeholder.</div>;
}

// ====== Artifact Detail Page ======
function ArtifactPage({ setRoute, route }) {
  const a = ARTIFACTS.find(x => x.id === route.id) || ARTIFACTS[0];
  const ag = AGENTS[a.agentId];
  return (
    <>
      <Topbar
        crumbs={['Missions', 'Design a multi-agent collaboration product', 'Artifacts', a.title]}
        actions={
          <>
            <button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12}/> Export</button>
            <button className="btn btn-sm">Request revision</button>
            <button className="btn btn-sm btn-primary">Accept</button>
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', minHeight: 'calc(100vh - 52px)' }}>
        <div style={{ padding: '40px 56px', overflow: 'auto', borderRight: '1px solid var(--line)' }}>
          <div className="row-tight" style={{ marginBottom: 14 }}>
            <StatusBadge status={a.status}/>
            <span className="label-tiny mono">{a.id.toUpperCase()} · v{a.version}</span>
          </div>
          <div style={{ maxWidth: 720 }}>
            <ArtifactContent artifactId={a.id}/>
          </div>
        </div>
        <aside style={{ background: 'var(--bg-elev)', padding: '24px 22px' }} className="stack-6">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Generated by</div>
            <div className="row" style={{ gap: 10 }}>
              <AgentAvatar id={a.agentId} size="lg"/>
              <div>
                <div style={{ fontWeight: 500 }}>{ag.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{ag.role}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Provenance</div>
            <div className="stack-2" style={{ fontSize: 12 }}>
              <div className="row" style={{ gap: 8 }}><Icon name="folder" size={12}/> Mission M-1</div>
              <div className="row" style={{ gap: 8 }}><Icon name="bolt" size={12}/> Work card WC-{a.cardId.split('-')[1]}</div>
              <div className="row" style={{ gap: 8 }}><Icon name="layers" size={12}/> 12 trace events</div>
              <div className="row" style={{ gap: 8 }}><Icon name="artifact" size={12}/> 3 source artifacts</div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Versions</div>
            <div className="stack-2">
              <VersionRow v={1} time="now" current/>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Reviewers</div>
            <div className="row-tight">
              <AgentAvatar id="critic" size="sm"/>
              <span style={{ fontSize: 12 }}>Vex queued — will review next.</span>
            </div>
          </div>

          <div className="card" style={{ background: 'var(--surface)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Comment</div>
            <textarea className="textarea" placeholder="Reply or @mention…" rows={3}/>
            <button className="btn btn-sm btn-primary" style={{ marginTop: 8, width: '100%' }}>Post</button>
          </div>
        </aside>
      </div>
    </>
  );
}

function VersionRow({ v, time, current }) {
  return (
    <div className="row" style={{ gap: 8, fontSize: 12, padding: '4px 0' }}>
      <span className="mono" style={{ minWidth: 26, color: current ? 'var(--ink)' : 'var(--ink-3)' }}>v{v}</span>
      <span style={{ flex: 1, color: 'var(--ink-2)' }}>{current ? 'Current draft' : 'Earlier'}</span>
      <span className="label-tiny">{time}</span>
    </div>
  );
}

// ====== Agent Profile + Coaching Chat ======
function AgentProfilePage({ setRoute, route }) {
  const id = route.id || 'strategist';
  const a = AGENTS[id];
  const [tab, setTab] = React.useState('overview');

  return (
    <>
      <Topbar
        crumbs={['Agent Library', a.name]}
        actions={
          <>
            <button className="btn btn-sm">Run in new mission</button>
            {a.lifecycle === 'ephemeral' && <button className="btn btn-sm btn-primary"><Icon name="check" size={12}/> Promote to Candidate</button>}
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 'calc(100vh - 52px)' }}>
        <div style={{ padding: '32px 40px', borderRight: '1px solid var(--line)' }} className="stack-6">
          <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
            <AgentAvatar id={id} size="xl"/>
            <div style={{ flex: 1 }}>
              <div className="row-tight" style={{ marginBottom: 6 }}>
                <span className={cls('badge', a.lifecycle === 'permanent' ? 'badge-done' : a.lifecycle === 'candidate' ? 'badge-running' : 'badge-create')}>
                  {a.lifecycle}
                </span>
                <span className="label-tiny mono">v{1}.0.{a.missionsCompleted}</span>
              </div>
              <h1 style={{ fontSize: 32, marginBottom: 4 }}>{a.name}</h1>
              <div className="muted" style={{ fontSize: 15 }}>{a.role}</div>
              <p style={{ marginTop: 12, maxWidth: 640, color: 'var(--ink-2)' }}>{a.desc}</p>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <MiniStat label="Missions" value={a.missionsCompleted}/>
            <MiniStat label="Avg rating" value={a.rating ? `${a.rating}★` : '—'}/>
            <MiniStat label="Avg cost" value={a.avgCost ? `$${a.avgCost.toFixed(2)}` : '—'}/>
            <MiniStat label="Failure rate" value={a.failureRate ? `${(a.failureRate*100).toFixed(0)}%` : '—'}/>
          </div>

          <div className="tabs">
            {['overview','memory','skills','history'].map(t => (
              <div key={t} className={cls('tab', tab === t && 'active')} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="stack-6">
              <ProfileSection title="Capabilities">
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {a.capabilities.map(c => <span key={c} className="chip">{c}</span>)}
                </div>
              </ProfileSection>
              <ProfileSection title="Tools">
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {a.tools.map(t => <span key={t} className="chip mono">{t}</span>)}
                </div>
              </ProfileSection>
              <ProfileSection title="Memory scopes">
                <div className="stack-2">
                  {a.memory.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>No memories yet — this agent is ephemeral.</span> :
                    a.memory.map((m, i) => (
                      <div key={i} className="row" style={{ gap: 8, padding: 10, background: 'var(--bg-elev)', borderRadius: 6 }}>
                        <Icon name="dot" size={10} className="dim"/>
                        <span style={{ fontSize: 13 }}>{m}</span>
                      </div>
                    ))
                  }
                </div>
              </ProfileSection>
            </div>
          )}

          {tab === 'memory' && <ProfileSection title="Long-term memory"><div className="muted">2 entries · last updated 3 days ago</div></ProfileSection>}
          {tab === 'skills' && (
            <div className="stack-6">
              <ProfileSection title="Installed skills" right={<button className="btn btn-sm" onClick={() => setRoute({ name: 'extensions' })}><Icon name="plus" size={11}/> Browse library</button>}>
                <div className="stack-2">
                  {SKILLS.filter(sk => sk.installedOn.includes(id)).map(sk => (
                    <div key={sk.id} className="card" style={{ padding: 12, borderLeft: `3px solid var(--${sk.color})` }}>
                      <div className="between" style={{ alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div className="row-tight">
                            <span style={{ fontSize: 14 }}>{sk.emoji} {sk.name}</span>
                            {sk.verified && <span className="badge badge-done">✓</span>}
                            {sk.scope === 'private' && <span className="badge badge-create">private</span>}
                            <span className="label-tiny mono">v{sk.version}</span>
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sk.desc}</div>
                          <div className="label-tiny" style={{ marginTop: 6 }}>{sk.uses} runs · {sk.steps}-step skill</div>
                        </div>
                        <button className="btn btn-sm btn-ghost"><Icon name="settings" size={12}/></button>
                      </div>
                    </div>
                  ))}
                  {SKILLS.filter(sk => sk.installedOn.includes(id)).length === 0 && (
                    <div className="muted" style={{ padding: 16, fontSize: 13 }}>No skills installed yet. <a onClick={() => setRoute({ name: 'extensions' })} style={{ color: 'var(--ocean)', cursor: 'pointer' }}>Browse the library →</a></div>
                  )}
                </div>
              </ProfileSection>

              <ProfileSection title="Connections this agent uses">
                <div className="stack-2">
                  {CONNECTIONS.filter(c => c.usedBy.includes(id)).map(c => (
                    <div key={c.id} className="card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => setRoute({ name: 'extensions' })}>
                      <div className="row" style={{ gap: 12 }}>
                        <BrandLogo id={c.id} size={32} color={c.color} rounded={6}/>
                        <div style={{ flex: 1 }}>
                          <div className="row-tight"><span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span><span className="badge badge-done">connected</span></div>
                          <div className="label-tiny mono" style={{ marginTop: 2 }}>{c.tools.length} tools · {c.account}</div>
                        </div>
                        <Icon name="chevR" size={12} className="dim"/>
                      </div>
                    </div>
                  ))}
                  {CONNECTIONS.filter(c => c.usedBy.includes(id)).length === 0 && (
                    <div className="muted" style={{ padding: 16, fontSize: 13 }}>No connections in use.</div>
                  )}
                </div>
              </ProfileSection>
            </div>
          )}
          {tab === 'history' && (
            <ProfileSection title="Recent missions">
              <div className="stack-2">
                {MISSIONS.filter(m => m.agentIds.includes(id)).slice(0, 5).map(m => (
                  <div key={m.id} className="card" style={{ padding: 12 }}>
                    <div className="between">
                      <div>
                        <div className="row-tight"><StatusBadge status={m.status}/><span style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</span></div>
                        <div className="label-tiny" style={{ marginTop: 4 }}>{m.updated} · ${m.cost.toFixed(2)}</div>
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={() => setRoute({ name: 'workroom', id: m.id })}>Open</button>
                    </div>
                  </div>
                ))}
              </div>
            </ProfileSection>
          )}
        </div>

        {/* Coaching Chat */}
        <CoachingChat agent={a}/>
      </div>
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label-tiny">{label}</div>
      <div className="serif" style={{ fontSize: 22, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ProfileSection({ title, children, right }) {
  return (
    <div>
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="eyebrow">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function CoachingChat({ agent }) {
  const [messages, setMessages] = React.useState([
    { role: 'agent', text: `Hi — I'm ${agent.name}. You can train me here. Anything you say will become a Growth Proposal you review before it's saved.` },
    { role: 'user', text: 'When you write PRDs, always lead with users and the problem. Never start with a feature list.' },
    { role: 'agent', text: 'Got it. I\'ll draft this as a Growth Proposal:', proposal: { type: 'output_style', title: 'Lead with users → problem → solution' } },
  ]);
  const [draft, setDraft] = React.useState('');
  const [scope, setScope] = React.useState('user');

  const send = () => {
    if (!draft.trim()) return;
    setMessages([...messages, { role: 'user', text: draft }, { role: 'agent', text: 'Captured. I\'ll add this to the Growth Center for your review.', proposal: { type: 'memory', title: draft.slice(0, 60) } }]);
    setDraft('');
  };

  return (
    <aside style={{ background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--line)' }}>
        <div className="row-tight" style={{ marginBottom: 4, color: 'var(--plum)' }}>
          <Icon name="pen" size={13}/>
          <span className="eyebrow" style={{ color: 'var(--plum)' }}>Coaching chat</span>
        </div>
        <div className="serif" style={{ fontSize: 17 }}>Train {agent.name}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Private. Suggestions become Growth Proposals — nothing writes to long-term memory until you approve.</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }} className="stack-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'row' : 'row'} style={{ alignItems: 'flex-start', gap: 10, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'agent' && <AgentAvatar id={agent.id} size="sm"/>}
            <div style={{
              maxWidth: '82%',
              background: m.role === 'user' ? 'var(--ink)' : 'var(--surface)',
              color: m.role === 'user' ? 'var(--bg)' : 'var(--ink)',
              padding: '8px 12px', borderRadius: 10,
              fontSize: 13, border: m.role === 'agent' ? '1px solid var(--line)' : 'none'
            }}>
              {m.text}
              {m.proposal && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--plum-bg)', color: 'var(--plum)', borderRadius: 6 }}>
                  <div className="row-tight" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Icon name="growth" size={11}/> Growth proposal · {m.proposal.type}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13 }}>{m.proposal.title}</div>
                </div>
              )}
            </div>
            {m.role === 'user' && <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>SK</div>}
          </div>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
        <div className="row-tight" style={{ marginBottom: 8, fontSize: 11 }}>
          <span className="label-tiny">Scope:</span>
          {['user','team','agent'].map(s => (
            <button key={s} className={cls('btn btn-sm', scope === s ? 'btn-primary' : 'btn-ghost')} onClick={() => setScope(s)} style={{ padding: '2px 8px', fontSize: 11 }}>{s}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={`Coach ${agent.name}…`}/>
          <button className="btn btn-primary" onClick={send}>Send</button>
        </div>
      </div>
    </aside>
  );
}

// ====== Agent Library ======
function AgentLibraryPage({ setRoute }) {
  return (
    <>
      <Topbar crumbs={['Agent Library']}/>
      <div className="content stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Library · 12 agents</div>
          <h1>Your AI talent pool.</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 640 }}>Reusable specialists. Each one carries memory, skills, and a track record. Ephemeral agents from past missions live here as Candidates until you promote or archive them.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="Search agents…" style={{ maxWidth: 320 }}/>
          {['All','Permanent','Candidate','Ephemeral'].map(t => <button key={t} className="chip">{t}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {Object.values(AGENTS).map(a => (
            <div key={a.id} className="card card-hover" onClick={() => setRoute({ name: 'agent', id: a.id })}>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <AgentAvatar id={a.id} size="lg"/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="serif" style={{ fontSize: 16 }}>{a.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.role}</div>
                  <div className="row-tight" style={{ marginTop: 6 }}>
                    <span className={cls('badge', a.lifecycle === 'permanent' ? 'badge-done' : 'badge-create')}>{a.lifecycle}</span>
                    {a.rating && <span className="label-tiny mono">{a.rating}★</span>}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 12 }}>{a.desc}</p>
              <div className="row" style={{ gap: 14, marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                <span>{a.missionsCompleted} missions</span>
                {a.avgCost && <span>${a.avgCost.toFixed(2)} avg</span>}
                <span>{a.skills.length} skills</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ====== Growth Center ======
function GrowthCenter({ setRoute }) {
  const [decisions, setDecisions] = React.useState({});
  const [filter, setFilter] = React.useState('pending');

  const decide = (id, decision) => setDecisions({ ...decisions, [id]: decision });

  const proposals = GROWTH_PROPOSALS;
  const pending = proposals.filter(p => !decisions[p.id]);
  const approved = proposals.filter(p => decisions[p.id] === 'approved').length;
  const rejected = proposals.filter(p => decisions[p.id] === 'rejected').length;

  return (
    <>
      <Topbar crumbs={['Growth Center']} actions={
        <button className="btn btn-sm btn-primary" disabled={pending.length === 0}>Apply {proposals.length - pending.length} decisions</button>
      }/>
      <div className="content stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Growth Engine · 8 proposals from M-1</div>
          <h1>What your team learned.</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 720 }}>
            After each mission, your agents propose what they'd like to keep — new memories, skills, identities, team templates. Nothing is saved until you approve. Everything is reversible.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <StatCard label="Pending" value={pending.length} sub="from this week"/>
          <StatCard label="Approved" value={approved} sub="will be applied" tone="amber"/>
          <StatCard label="Rejected" value={rejected} sub="discarded"/>
          <StatCard label="Rollbacks available" value={3} sub="last 30 days"/>
        </div>

        <div className="row" style={{ gap: 4 }}>
          {[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['applied','Applied']].map(([f, l]) => (
            <button key={f} className={cls('btn btn-sm', filter === f ? 'btn-primary' : 'btn-ghost')} onClick={() => setFilter(f)}>
              {l}
            </button>
          ))}
        </div>

        <div className="stack-3">
          {proposals.map(p => {
            const d = decisions[p.id];
            if (filter === 'pending' && d) return null;
            if (filter === 'approved' && d !== 'approved') return null;
            if (filter === 'rejected' && d !== 'rejected') return null;
            return <GrowthCard key={p.id} p={p} decision={d} onDecide={(x) => decide(p.id, x)}/>;
          })}
        </div>
      </div>
    </>
  );
}

function GrowthCard({ p, decision, onDecide }) {
  const typeMap = {
    memory: { color: 'ocean', icon: 'book', label: 'Memory' },
    skill: { color: 'amber', icon: 'bolt', label: 'New skill' },
    identity: { color: 'plum', icon: 'sparkle', label: 'Identity' },
    tool_policy: { color: 'sage', icon: 'settings', label: 'Tool policy' },
    output_style: { color: 'amber', icon: 'pen', label: 'Output style' },
    team_template: { color: 'plum', icon: 'users', label: 'Team template' },
    failure_pattern: { color: 'rust', icon: 'eye', label: 'Failure pattern' },
  };
  const t = typeMap[p.type];

  return (
    <div className="card" style={{
      borderLeft: `3px solid var(--${t.color})`,
      paddingLeft: 18,
      opacity: decision ? 0.7 : 1,
      transition: 'opacity 0.2s'
    }}>
      <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `var(--${t.color}-bg)`, color: `var(--${t.color})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon name={t.icon} size={16}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight" style={{ marginBottom: 4 }}>
            <span className="badge" style={{ background: `var(--${t.color}-bg)`, color: `var(--${t.color})`, borderColor: 'transparent' }}>{t.label}</span>
            <span className="badge badge-queued">{p.scope} scope</span>
            <span className={cls('badge', p.risk === 'low' ? 'badge-done' : p.risk === 'medium' ? 'badge-running' : 'badge-blocked')}>{p.risk} risk</span>
          </div>
          <div className="serif" style={{ fontSize: 17, marginBottom: 4 }}>{p.title}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>{p.description}</div>
          <details>
            <summary className="label-tiny" style={{ cursor: 'pointer', color: 'var(--ink-3)' }}>Evidence ({p.evidence.length})</summary>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--ink-2)' }}>
              {p.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </details>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {decision === 'approved' && <span className="badge badge-done"><Icon name="check" size={10}/> Approved</span>}
          {decision === 'rejected' && <span className="badge badge-blocked"><Icon name="x" size={10}/> Rejected</span>}
          {!decision && (
            <>
              <button className="btn btn-sm" onClick={() => onDecide('rejected')}><Icon name="x" size={11}/> Reject</button>
              <button className="btn btn-sm btn-primary" onClick={() => onDecide('approved')}><Icon name="check" size={11}/> Approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ArtifactPage, AgentProfilePage, AgentLibraryPage, GrowthCenter, ArtifactContent });
