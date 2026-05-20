// Extensions Hub — unified Connections + Skills + Env, plus install drawer

function ExtensionsHub({ setRoute }) {
  const [tab, setTab] = React.useState('all');
  const [openExt, setOpenExt] = React.useState(null);

  const all = [
    ...CONNECTIONS.map(c => ({ ...c, _kind: 'connection' })),
    ...SKILLS.map(s => ({ ...s, _kind: 'skill' })),
  ];
  const list = tab === 'all' ? all
    : tab === 'connections' ? all.filter(x => x._kind === 'connection')
    : tab === 'skills' ? all.filter(x => x._kind === 'skill')
    : tab === 'installed' ? all.filter(x => x.status === 'connected' || (x._kind === 'skill' && x.installedOn.length > 0))
    : tab === 'env' ? [] : all;

  return (
    <>
      <Topbar crumbs={['Extensions']} actions={
        <>
          <button className="btn btn-sm"><Icon name="search" size={12}/> Browse marketplace</button>
          <button className="btn btn-sm btn-primary"><Icon name="plus" size={12}/> New skill</button>
        </>
      }/>
      <div className="content stack-6">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Extensions · Connections, Skills, and Env</div>
          <h1 style={{ maxWidth: 800 }}>Everything your agents can plug into.</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 720 }}>
            Connect external services, install skill packages, and manage workspace secrets. Skills can live in a public library or stay private to a single agent.
          </p>
        </div>

        {/* Big stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <ExtStat icon="layers" label="Connections" value={`${CONNECTIONS.filter(c => c.status === 'connected').length}/${CONNECTIONS.length}`} sub="connected"/>
          <ExtStat icon="bolt" label="Skills" value={SKILLS.length} sub={`${SKILLS.filter(s => s.scope === 'public').length} public · ${SKILLS.filter(s => s.scope === 'private').length} private`}/>
          <ExtStat icon="settings" label="Env vars" value={ENV_VARS.length} sub={`${ENV_VARS.filter(e => e.orphan).length} orphaned`}/>
          <ExtStat icon="bell" label="Needs attention" value={1} sub="Sentry re-auth" tone="amber"/>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[['all','All',all.length],['connections','Connections',CONNECTIONS.length],['skills','Skills',SKILLS.length],['installed','Installed',null],['env','Environment',ENV_VARS.length]].map(([id,l,c]) => (
            <div key={id} className={cls('tab', tab===id && 'active')} onClick={()=>setTab(id)}>
              {l}{c !== null && <span className="tab-count">{c}</span>}
            </div>
          ))}
        </div>

        {tab === 'env' ? (
          <EnvVars/>
        ) : (
          <>
            {tab === 'all' || tab === 'connections' ? (
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Connections · OAuth and tokens</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {CONNECTIONS.map(c => <ConnectionCard key={c.id} c={c} onOpen={() => setOpenExt({ kind: 'connection', id: c.id })}/>)}
                </div>
              </div>
            ) : null}

            {tab === 'all' || tab === 'skills' ? (
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Skills · Public library</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  {SKILLS.filter(s => s.scope !== 'private').map(s => <SkillCard key={s.id} s={s} onOpen={() => setOpenExt({ kind: 'skill', id: s.id })}/>)}
                </div>
                <div className="eyebrow" style={{ margin: '24px 0 12px' }}>Private skills · Owned by a single agent</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  {SKILLS.filter(s => s.scope === 'private').map(s => <SkillCard key={s.id} s={s} onOpen={() => setOpenExt({ kind: 'skill', id: s.id })}/>)}
                </div>
              </div>
            ) : null}

            {tab === 'installed' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {list.map(x => x._kind === 'connection'
                  ? <ConnectionCard key={x.id} c={x} onOpen={() => setOpenExt({ kind: 'connection', id: x.id })}/>
                  : <SkillCard key={x.id} s={x} onOpen={() => setOpenExt({ kind: 'skill', id: x.id })}/>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {openExt && <ExtensionDrawer ext={openExt} onClose={() => setOpenExt(null)} setRoute={setRoute}/>}
    </>
  );
}

function ExtStat({ icon, label, value, sub, tone }) {
  return (
    <div className="card">
      <div className="row-tight" style={{ marginBottom: 8, color: tone === 'amber' ? 'var(--amber)' : 'var(--ink-3)' }}>
        <Icon name={icon} size={13}/>
        <span className="eyebrow" style={{ color: tone === 'amber' ? 'var(--amber)' : undefined }}>{label}</span>
      </div>
      <div className="serif" style={{ fontSize: 26, lineHeight: 1, color: tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>{value}</div>
      <div className="label-tiny" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function ConnectionCard({ c, onOpen }) {
  const statusInfo = {
    connected: { badge: 'badge-done', label: 'Connected' },
    available: { badge: 'badge-draft', label: 'Connect' },
    error: { badge: 'badge-blocked', label: 'Re-auth' },
  }[c.status];
  return (
    <div className="card card-hover" onClick={onOpen}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <BrandLogo id={c.id} size={38} color={c.color}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight">
            <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
            <span className={cls('badge', statusInfo.badge)}>{statusInfo.label}</span>
          </div>
          <div className="label-tiny mono" style={{ marginTop: 2 }}>connection · {c.tools.length} tools</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, minHeight: 32 }}>{c.desc}</p>
      <div className="between" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {c.status === 'connected' ? <span className="mono">{c.account}</span> : <span>{c.installs} installs</span>}
        {c.usedBy.length > 0 && (
          <div className="row-tight">
            <span className="label-tiny">used by</span>
            <div className="av-stack">{c.usedBy.slice(0,3).map(id => <AgentAvatar key={id} id={id} size="sm"/>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillCard({ s, onOpen }) {
  return (
    <div className="card card-hover" onClick={onOpen} style={{
      borderLeft: `3px solid var(--${s.color})`,
      paddingLeft: 18,
    }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `var(--${s.color}-bg)`, color: `var(--${s.color})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
        }}>{s.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-tight" style={{ marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
            {s.verified && <span className="badge badge-done" title="Verified by Missionry">✓ verified</span>}
            {s.scope === 'private' && <span className="badge badge-create">private</span>}
            {s.scope === 'team' && <span className="badge badge-running">team</span>}
          </div>
          <div className="label-tiny mono" style={{ marginBottom: 6 }}>skill · v{s.version} · by {s.author}</div>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10 }}>{s.desc}</p>
          <div className="between" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            <div className="row" style={{ gap: 12 }}>
              <span>{s.uses.toLocaleString()} uses</span>
              {s.rating && <span>{s.rating}★</span>}
              <span>{s.steps} steps</span>
              {s.requires.length > 0 && <span className="row-tight"><Icon name="bolt" size={10}/> requires {s.requires.join(', ')}</span>}
            </div>
            {s.installedOn.length > 0 && (
              <div className="row-tight">
                <span className="label-tiny">on</span>
                <div className="av-stack">{s.installedOn.slice(0,3).map(id => <AgentAvatar key={id} id={id} size="sm"/>)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Drawer ======
function ExtensionDrawer({ ext, onClose, setRoute }) {
  const item = ext.kind === 'connection'
    ? CONNECTIONS.find(c => c.id === ext.id)
    : SKILLS.find(s => s.id === ext.id);
  if (!item) return null;

  const [installScope, setInstallScope] = React.useState('agent');
  const [installAgent, setInstallAgent] = React.useState('research');

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,28,23,0.45)', zIndex: 100,
      display: 'flex', justifyContent: 'flex-end'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', width: 560, maxWidth: '100vw', height: '100vh',
        boxShadow: 'var(--shadow-lg)', overflow: 'auto',
        display: 'flex', flexDirection: 'column'
      }} className="animate-in">
        {/* Header */}
        <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--line)' }}>
          <div className="between" style={{ marginBottom: 14 }}>
            <span className="eyebrow">{ext.kind === 'connection' ? 'Connection' : 'Skill'}</span>
            <button className="icon-btn" onClick={onClose}><Icon name="x" size={14}/></button>
          </div>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            {ext.kind === 'connection' ? (
              <BrandLogo id={item.id} size={56} color={item.color} rounded={12}/>
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                background: `var(--${item.color}-bg)`, color: `var(--${item.color})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26
              }}>{item.emoji}</div>
            )}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>{item.name}</h2>
              <div className="muted" style={{ fontSize: 13 }}>{item.desc}</div>
              {ext.kind === 'skill' && (
                <div className="row-tight" style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>
                  <span className="mono">v{item.version}</span>
                  <span>·</span>
                  <span>{item.author}</span>
                  {item.verified && <><span>·</span><span style={{ color: 'var(--sage)' }}>✓ verified</span></>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: 28, flex: 1 }} className="stack-6">
          {ext.kind === 'connection' ? (
            <>
              <DrawerSection title="Status">
                {item.status === 'connected' && (
                  <div className="card" style={{ background: 'var(--sage-bg)', borderColor: 'transparent' }}>
                    <div className="row-tight" style={{ color: 'var(--sage)' }}>
                      <Icon name="check" size={13}/>
                      <span style={{ fontSize: 13 }}>Connected as <span className="mono">{item.account}</span></span>
                    </div>
                  </div>
                )}
                {item.status === 'available' && (
                  <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                    Connect with {item.name} →
                  </button>
                )}
                {item.status === 'error' && (
                  <div className="card" style={{ background: 'var(--rust-bg)', borderColor: 'transparent' }}>
                    <div className="row-tight" style={{ color: 'var(--rust)', marginBottom: 6 }}>
                      <Icon name="bolt" size={13}/> <span style={{ fontSize: 13, fontWeight: 500 }}>Token expired</span>
                    </div>
                    <button className="btn btn-sm">Re-authenticate</button>
                  </div>
                )}
              </DrawerSection>

              <DrawerSection title="Tools this provides">
                <div className="stack-2">
                  {item.tools.map(t => (
                    <div key={t} className="row" style={{ padding: 10, background: 'var(--bg-elev)', borderRadius: 6, gap: 10 }}>
                      <Icon name="bolt" size={12} className="dim"/>
                      <span className="mono" style={{ fontSize: 12, flex: 1 }}>{t}</span>
                    </div>
                  ))}
                </div>
              </DrawerSection>

              <DrawerSection title="OAuth scopes">
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {item.scopes.map(s => <span key={s} className="chip mono">{s}</span>)}
                </div>
              </DrawerSection>

              {item.usedBy.length > 0 && (
                <DrawerSection title={`In use by ${item.usedBy.length} agent${item.usedBy.length > 1 ? 's' : ''}`}>
                  <div className="stack-2">
                    {item.usedBy.map(id => {
                      const a = AGENTS[id];
                      return (
                        <div key={id} className="row" style={{ padding: 10, background: 'var(--bg-elev)', borderRadius: 6, gap: 10, cursor: 'pointer' }}
                          onClick={() => { onClose(); setRoute({ name: 'agent', id }); }}>
                          <AgentAvatar id={id} size="sm"/>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13 }}>{a.name}</div>
                            <div className="label-tiny">{a.role}</div>
                          </div>
                          <Icon name="chevR" size={12} className="dim"/>
                        </div>
                      );
                    })}
                  </div>
                </DrawerSection>
              )}

              {item.status === 'connected' && (
                <DrawerSection title="Danger zone">
                  <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>Disconnect</button>
                </DrawerSection>
              )}
            </>
          ) : (
            <>
              {item.requires.length > 0 && (
                <div className="card" style={{ background: 'var(--amber-bg)', borderColor: 'transparent' }}>
                  <div className="row-tight" style={{ color: 'var(--amber)', marginBottom: 6 }}>
                    <Icon name="bolt" size={13}/> <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requires</span>
                  </div>
                  <div className="row-tight" style={{ flexWrap: 'wrap' }}>
                    {item.requires.map(r => {
                      const conn = CONNECTIONS.find(c => c.id === r);
                      return (
                        <span key={r} className="chip" style={{ background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {conn && <span style={{ width: 14, height: 14, display: 'inline-block' }}><BrandLogo id={conn.id} size={14} color={conn.color} rounded={3}/></span>}
                          {conn?.name || r}
                          {conn?.status === 'connected' && <span style={{ color: 'var(--sage)' }}>✓</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <DrawerSection title="Install on">
                <div className="row" style={{ gap: 4, marginBottom: 12 }}>
                  {[['agent','Specific agent'],['workspace','Whole workspace'],['team','Team library']].map(([v, l]) => (
                    <button key={v} className={cls('btn btn-sm', installScope === v ? 'btn-primary' : 'btn-ghost')} onClick={() => setInstallScope(v)}>{l}</button>
                  ))}
                </div>
                {installScope === 'agent' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                    {Object.values(AGENTS).map(a => {
                      const installed = item.installedOn.includes(a.id);
                      const selected = installAgent === a.id;
                      return (
                        <button key={a.id} onClick={() => setInstallAgent(a.id)} style={{
                          display: 'flex', gap: 8, alignItems: 'center',
                          padding: 8, borderRadius: 6,
                          border: `1px solid ${selected ? 'var(--ink)' : 'var(--line)'}`,
                          background: selected ? 'var(--bg-sunk)' : 'var(--surface)',
                          cursor: 'pointer', textAlign: 'left'
                        }}>
                          <AgentAvatar id={a.id} size="sm"/>
                          <span style={{ flex: 1, fontSize: 12 }}>{a.name}</span>
                          {installed && <span className="label-tiny" style={{ color: 'var(--sage)' }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
                  {item.installedOn.includes(installAgent) && installScope === 'agent' ? 'Already installed' : `Install on ${installScope === 'agent' ? AGENTS[installAgent].name : installScope}`}
                </button>
              </DrawerSection>

              <DrawerSection title="What it does">
                <div className="stack-2">
                  {[1,2,3,4,5].slice(0, item.steps).map(i => (
                    <div key={i} className="row" style={{ gap: 10, padding: 8, fontSize: 13 }}>
                      <span className="mono" style={{ width: 18, color: 'var(--ink-4)' }}>{i.toString().padStart(2,'0')}</span>
                      <span style={{ color: 'var(--ink-2)' }}>{
                        ['Read mission objective and context', 'Gather inputs from prior artifacts', 'Apply skill template', 'Generate structured output', 'Write artifact + flag open questions', 'Trigger reviewer hand-off'][i-1]
                      }</span>
                    </div>
                  ))}
                </div>
              </DrawerSection>

              <DrawerSection title="Stats">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <MiniStatCell label="Uses" value={item.uses.toLocaleString()}/>
                  <MiniStatCell label="Rating" value={item.rating ? `${item.rating}★` : '—'}/>
                  <MiniStatCell label="Installed on" value={item.installedOn.length}/>
                </div>
              </DrawerSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerSection({ title, children }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function MiniStatCell({ label, value }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-elev)', borderRadius: 6 }}>
      <div className="label-tiny">{label}</div>
      <div className="serif" style={{ fontSize: 18, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ====== Env Vars ======
function EnvVars() {
  return (
    <div className="stack-4">
      <div className="between">
        <div className="eyebrow">Environment · {ENV_VARS.length} entries</div>
        <button className="btn btn-sm btn-primary"><Icon name="plus" size={11}/> Add variable</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 110px 130px 60px', padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-elev)', fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Key</span><span>Value</span><span>Scope</span><span>Used by</span><span></span>
        </div>
        {ENV_VARS.map(e => (
          <div key={e.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 110px 130px 60px', padding: '12px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', fontSize: 13 }}>
            <div>
              <div className="mono" style={{ fontSize: 12 }}>{e.key}</div>
              <div className="label-tiny">{e.label}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.value}</span>
            <span><span className="badge badge-queued">{e.scope}</span></span>
            <span>
              {e.usedBy.length > 0 ? <span className="chip mono">{e.usedBy[0]}</span>
                : e.orphan ? <span className="badge badge-blocked">orphaned</span>
                : <span className="muted">—</span>}
            </span>
            <button className="icon-btn"><Icon name="settings" size={12}/></button>
          </div>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--bg-elev)', fontSize: 12, color: 'var(--ink-2)' }}>
        <div className="row-tight" style={{ marginBottom: 6, color: 'var(--ink)' }}>
          <Icon name="eye" size={12}/> <span style={{ fontWeight: 500 }}>Secrets are never sent to agents directly.</span>
        </div>
        Tools resolve env values at call-time inside the sandbox. Agents see only that the connection succeeded — never the raw token.
      </div>
    </div>
  );
}

Object.assign(window, { ExtensionsHub });
