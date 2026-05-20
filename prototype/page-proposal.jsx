// Team Proposal page

function TeamProposalPage({ setRoute }) {
  const tp = TEAM_PROPOSAL;
  const [members, setMembers] = React.useState(tp.members);
  const [selected, setSelected] = React.useState(tp.members[0].agentId);
  const [approving, setApproving] = React.useState(false);

  const totalBudget = members.reduce((s, m) => s + m.budget, 0);
  const counts = {
    reuse: members.filter(m => m.source === 'reuse').length,
    adapt: members.filter(m => m.source === 'adapt').length,
    create: members.filter(m => m.source === 'create').length,
  };

  const removeMember = (agentId) => {
    setMembers(members.filter(m => m.agentId !== agentId));
    if (selected === agentId && members.length > 1) setSelected(members[0].agentId);
  };

  const approve = () => {
    setApproving(true);
    setTimeout(() => setRoute({ name: 'workroom', id: 'm-1', autoStart: true }), 1200);
  };

  return (
    <>
      <Topbar
        crumbs={['Missions', 'Design a multi-agent collaboration product', 'Team Proposal']}
        actions={<button className="btn btn-sm btn-ghost" onClick={() => setRoute({ name: 'create' })}><Icon name="arrowL" size={13}/> Back</button>}
      />
      <div className="content stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Team Compiler · Proposal v1</div>
          <h1 style={{ maxWidth: 760 }}>Atlas suggests this team for your mission.</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 720 }}>
            7 agents — {counts.reuse} reused from your library, {counts.adapt} adapted, {counts.create} created on the fly. You decide who joins, what they can touch, and what to spend.
          </p>
        </div>

        {/* Summary strip */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <SummaryCell label="Estimated cost" value={`$${tp.estimatedCost.toFixed(2)}`} sub={`of $8.00 budget`}/>
            <SummaryCell label="Estimated time" value={tp.estimatedTime} sub="parallel where possible"/>
            <SummaryCell label="Composition" value={`${counts.reuse} · ${counts.adapt} · ${counts.create}`} sub="reuse / adapt / create" mono/>
            <SummaryCell label="Approvals required" value="2" sub="artifact accept · memory write" last/>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'flex-start' }}>
          {/* Members */}
          <div>
            <div className="between" style={{ marginBottom: 12 }}>
              <div className="eyebrow">Recommended team · {members.length} agents</div>
              <button className="btn btn-sm btn-ghost"><Icon name="sparkle" size={12}/> Regenerate</button>
            </div>
            <div className="stack-3">
              {members.map(m => (
                <ProposalMemberRow key={m.agentId} member={m} selected={selected === m.agentId}
                  onSelect={() => setSelected(m.agentId)} onRemove={() => removeMember(m.agentId)}/>
              ))}
              <button className="card" style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', color: 'var(--ink-3)', padding: 14 }}>
                <span className="row-tight" style={{ justifyContent: 'center' }}><Icon name="plus" size={13}/> Add another agent</span>
              </button>
            </div>
          </div>

          {/* Detail panel */}
          <div className="card" style={{ position: 'sticky', top: 70 }}>
            {(() => {
              const m = members.find(x => x.agentId === selected);
              if (!m) return <div className="muted">Select an agent to inspect.</div>;
              const a = AGENTS[m.agentId];
              return (
                <div className="stack-4">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <AgentAvatar id={m.agentId} size="lg"/>
                    <div style={{ flex: 1 }}>
                      <div className="serif" style={{ fontSize: 18 }}>{a.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{a.role}</div>
                      <div className="row-tight" style={{ marginTop: 6 }}>
                        <SourceBadge source={m.source}/>
                        {m.matchScore && <span className="chip mono">match {(m.matchScore * 100).toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Why this agent</div>
                    <div style={{ fontSize: 13 }}>{m.reason}</div>
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Responsibility</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{m.responsibility}</div>
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Tools allowed</div>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {a.tools.map(t => <span key={t} className="chip mono">{t}</span>)}
                    </div>
                  </div>

                  <div className="divider"/>

                  <div className="stack-2">
                    <PermissionRow label="Read mission context" allowed/>
                    <PermissionRow label="Create artifacts" allowed={['lead','strategist','ux','metrics','writer','research'].includes(m.agentId)}/>
                    <PermissionRow label="Write to long-term memory" allowed={false} note="needs your approval"/>
                    <PermissionRow label="Call external APIs" allowed={m.agentId === 'research'}/>
                  </div>

                  <div className="divider"/>

                  <div className="between">
                    <span className="label-tiny">Budget allocation</span>
                    <span className="mono" style={{ fontSize: 12 }}>${m.budget.toFixed(2)}</span>
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-sm" style={{ flex: 1 }}>Replace</button>
                    <button className="btn btn-sm" style={{ flex: 1 }}>Lower scope</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.agentId)}>Remove</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Risks */}
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>System notes & risks</div>
          <div className="stack-2">
            {tp.risks.map((r, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <span className={cls('badge', r.level === 'medium' ? 'badge-running' : 'badge-queued')} style={{ marginTop: 2 }}>{r.level}</span>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Approve */}
        <div className="between" style={{
          position: 'sticky', bottom: 0, background: 'var(--bg)',
          padding: '14px 0', borderTop: '1px solid var(--line)', marginTop: -8
        }}>
          <div className="row" style={{ gap: 16 }}>
            <Toggle label="Allow new agents" sub="" checked={true} onChange={()=>{}}/>
            <Toggle label="Allow memory writes" sub="" checked={false} onChange={()=>{}}/>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn">Save as template</button>
            <button className="btn btn-lg btn-primary" onClick={approve} disabled={approving}>
              {approving ? <><div className="spinner"/> Starting mission…</> : <>Approve & launch team <Icon name="play" size={12}/></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryCell({ label, value, sub, mono, last }) {
  return (
    <div style={{ padding: 18, borderRight: last ? 'none' : '1px solid var(--line)' }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className={cls('serif', mono && 'mono')} style={{ fontSize: mono ? 22 : 26, lineHeight: 1, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</div>
      <div className="label-tiny" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function ProposalMemberRow({ member, selected, onSelect, onRemove }) {
  const a = AGENTS[member.agentId];
  return (
    <div className={cls('card card-hover')} style={{
      borderColor: selected ? 'var(--ink)' : undefined,
      borderWidth: selected ? 2 : 1,
      padding: selected ? 17 : 18,
    }} onClick={onSelect}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <AgentAvatar id={member.agentId} size="lg"/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight" style={{ marginBottom: 2 }}>
            <span className="serif" style={{ fontSize: 17 }}>{a.name}</span>
            <span className="muted" style={{ fontSize: 13 }}>· {a.role}</span>
            <SourceBadge source={member.source}/>
            {member.matchScore && <span className="chip mono">{(member.matchScore * 100).toFixed(0)}%</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>{member.responsibility}</div>
          <div className="row" style={{ gap: 16, fontSize: 12, color: 'var(--ink-3)' }}>
            <span className="row-tight"><Icon name="bolt" size={12}/> {a.skills.length} skills</span>
            <span className="row-tight"><Icon name="settings" size={12}/> {a.tools.length} tools</span>
            <span className="row-tight"><Icon name="coin" size={12}/> ${member.budget.toFixed(2)}</span>
            {a.lifecycle === 'permanent' && <span className="row-tight"><Icon name="check" size={12}/> {a.missionsCompleted} prior runs</span>}
            {a.lifecycle === 'ephemeral' && <span className="row-tight" style={{ color: 'var(--plum)' }}><Icon name="flask" size={12}/> ephemeral · new</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon name="x" size={13}/></button>
      </div>
    </div>
  );
}

function PermissionRow({ label, allowed, note }) {
  return (
    <div className="row" style={{ fontSize: 12 }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: allowed ? 'var(--sage-bg)' : 'var(--bg-sunk)',
        color: allowed ? 'var(--sage)' : 'var(--ink-4)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {allowed ? <Icon name="check" size={10}/> : <Icon name="x" size={10}/>}
      </span>
      <span style={{ flex: 1, color: 'var(--ink-2)' }}>{label}</span>
      {note && <span className="label-tiny" style={{ color: 'var(--amber)' }}>{note}</span>}
    </div>
  );
}

Object.assign(window, { TeamProposalPage });
