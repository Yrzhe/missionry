// Shared components

function cls(...xs) { return xs.filter(Boolean).join(' '); }

// ====== Icon ======
function Icon({ name, size = 14, className = '' }) {
  const s = { width: size, height: size };
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home: <><path d="M3 10l7-6 7 6v8a1 1 0 0 1-1 1h-4v-6h-4v6H4a1 1 0 0 1-1-1z" {...stroke}/></>,
    plus: <><path d="M10 4v12M4 10h12" {...stroke}/></>,
    search: <><circle cx="9" cy="9" r="5" {...stroke}/><path d="M13 13l3 3" {...stroke}/></>,
    folder: <><path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" {...stroke}/></>,
    users: <><circle cx="7" cy="7" r="3" {...stroke}/><path d="M2 16c0-2.8 2.2-5 5-5s5 2.2 5 5" {...stroke}/><circle cx="14" cy="7" r="2.5" {...stroke}/><path d="M12 11.5c1.5 0 4.5 1 4.5 4" {...stroke}/></>,
    sparkle: <><path d="M10 3l1.5 4.5L16 9l-4.5 1.5L10 15l-1.5-4.5L4 9l4.5-1.5z" {...stroke}/></>,
    artifact: <><rect x="4" y="3" width="12" height="14" rx="1.5" {...stroke}/><path d="M7 7h6M7 10h6M7 13h4" {...stroke}/></>,
    growth: <><path d="M3 16l5-6 3 3 6-7" {...stroke}/><path d="M14 6h3v3" {...stroke}/></>,
    check: <><path d="M4 10l4 4 8-8" {...stroke}/></>,
    x: <><path d="M5 5l10 10M5 15L15 5" {...stroke}/></>,
    chevR: <><path d="M7 4l6 6-6 6" {...stroke}/></>,
    chevD: <><path d="M4 7l6 6 6-6" {...stroke}/></>,
    settings: <><circle cx="10" cy="10" r="2.5" {...stroke}/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M4.4 15.6l1.4-1.4M14.2 5.8l1.4-1.4" {...stroke}/></>,
    play: <><path d="M6 4l10 6-10 6z" {...stroke} fill="currentColor"/></>,
    pause: <><rect x="5" y="4" width="3" height="12" rx="1" fill="currentColor"/><rect x="12" y="4" width="3" height="12" rx="1" fill="currentColor"/></>,
    stop: <><rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor"/></>,
    bolt: <><path d="M11 2L4 11h5l-1 7 7-9h-5z" {...stroke}/></>,
    book: <><path d="M4 4h5a3 3 0 0 1 3 3v9a2 2 0 0 0-2-2H4zM16 4h-5a3 3 0 0 0-3 3v9a2 2 0 0 1 2-2h6z" {...stroke}/></>,
    bell: <><path d="M5 8a5 5 0 0 1 10 0v3l1.5 3h-13L5 11z" {...stroke}/><path d="M8 16a2 2 0 0 0 4 0" {...stroke}/></>,
    clock: <><circle cx="10" cy="10" r="7" {...stroke}/><path d="M10 6v4l3 2" {...stroke}/></>,
    coin: <><circle cx="10" cy="10" r="7" {...stroke}/><path d="M10 6v8M8 8h3a2 2 0 0 1 0 4H8" {...stroke}/></>,
    eye: <><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" {...stroke}/><circle cx="10" cy="10" r="2" {...stroke}/></>,
    pen: <><path d="M3 17l4-1 9-9-3-3-9 9z" {...stroke}/></>,
    arrow: <><path d="M4 10h12M11 5l5 5-5 5" {...stroke}/></>,
    arrowL: <><path d="M16 10H4M9 5l-5 5 5 5" {...stroke}/></>,
    dot: <><circle cx="10" cy="10" r="3" fill="currentColor"/></>,
    flask: <><path d="M8 3h4v4l4 8a2 2 0 0 1-1.8 3H5.8A2 2 0 0 1 4 15l4-8z" {...stroke}/></>,
    layers: <><path d="M10 3l8 4-8 4-8-4z" {...stroke}/><path d="M2 11l8 4 8-4M2 15l8 4 8-4" {...stroke}/></>,
    sun: <><circle cx="10" cy="10" r="3.5" {...stroke}/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M4.4 15.6l1.4-1.4M14.2 5.8l1.4-1.4" {...stroke}/></>,
    moon: <><path d="M16 11.5A6 6 0 1 1 8.5 4a5 5 0 0 0 7.5 7.5z" {...stroke}/></>,
  };
  return <svg viewBox="0 0 20 20" style={s} className={className}>{paths[name] || null}</svg>;
}

// ====== Agent Avatar ======
function AgentAvatar({ id, size = 'md', status = null, ring = false }) {
  const a = AGENTS[id];
  if (!a) return null;
  const sizeClass = { sm: 'agent-av-sm', md: '', lg: 'agent-av-lg', xl: 'agent-av-xl' }[size] || '';
  return (
    <span className={cls('agent-av', sizeClass)} style={{ background: a.gradient, borderColor: ring ? 'var(--ink)' : undefined }}>
      <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>{a.emoji}</span>
      {status && <span className={cls('status-dot', status)} />}
    </span>
  );
}

// ====== Source badge ======
function SourceBadge({ source }) {
  const map = {
    reuse: { cls: 'badge-reuse', label: 'Reuse', desc: 'From library' },
    adapt: { cls: 'badge-adapt', label: 'Adapt', desc: 'Reused + overlay' },
    create: { cls: 'badge-create', label: 'Create', desc: 'New for this mission' },
  };
  const m = map[source];
  return <span className={cls('badge', m.cls)}><span className="badge-dot" />{m.label}</span>;
}

// ====== Status badge ======
function StatusBadge({ status }) {
  const map = {
    draft: ['badge-draft', 'Draft'],
    planning: ['badge-queued', 'Planning'],
    waiting_team_approval: ['badge-waiting', 'Awaiting team approval'],
    running: ['badge-running', 'Running'],
    waiting_user_approval: ['badge-waiting', 'Awaiting your approval'],
    blocked: ['badge-blocked', 'Blocked'],
    completed: ['badge-done', 'Completed'],
    archived: ['badge-draft', 'Archived'],
    queued: ['badge-queued', 'Queued'],
    done: ['badge-done', 'Done'],
    failed: ['badge-blocked', 'Failed'],
    cancelled: ['badge-draft', 'Cancelled'],
    waiting_approval: ['badge-waiting', 'Needs approval'],
    needs_review: ['badge-waiting', 'Needs review'],
    accepted: ['badge-done', 'Accepted'],
  };
  const [c, l] = map[status] || ['badge-draft', status];
  return <span className={cls('badge', c)}><span className="badge-dot" />{l}</span>;
}

// ====== Sidebar ======
function Sidebar({ route, setRoute, missionState }) {
  const items = [
    { id: 'missions', icon: 'home', label: 'Missions', count: 6 },
    { id: 'agents', icon: 'users', label: 'Agent Library', count: 12 },
    { id: 'artifacts', icon: 'artifact', label: 'Artifacts', count: 28 },
    { id: 'extensions', icon: 'bolt', label: 'Extensions', count: CONNECTIONS.length + SKILLS.length },
    { id: 'growth', icon: 'growth', label: 'Growth Center', count: 8 },
  ];
  const recentMissions = MISSIONS.slice(0, 4);
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">Missionry</div>
          <div className="brand-sub mono">workspace</div>
        </div>
      </div>

      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setRoute({ name: 'create' })}>
        <Icon name="plus" size={13}/> New Mission
      </button>

      <div className="nav-section">Workspace</div>
      {items.map(it => (
        <div key={it.id} className={cls('nav-item', route.name === it.id && 'active')} onClick={() => setRoute({ name: it.id })}>
          <Icon name={it.icon} className="nav-icon" />
          <span>{it.label}</span>
          <span className="nav-count">{it.count}</span>
        </div>
      ))}

      <div className="nav-section">Recent Missions</div>
      {recentMissions.map(m => (
        <div key={m.id} className={cls('nav-item', route.name === 'workroom' && route.id === m.id && 'active')} onClick={() => setRoute({ name: 'workroom', id: m.id })}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: m.status === 'running' ? 'var(--running)' : m.status === 'completed' ? 'var(--done)' : m.status === 'waiting_user_approval' ? 'var(--waiting)' : 'var(--ink-4)'
          }}/>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="user-pill">
          <div className="user-avatar">SK</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Sasha Kim</div>
            <div className="label-tiny">Sandbox · Pro</div>
          </div>
          <Icon name="settings" size={14} className="dim"/>
        </div>
      </div>
    </aside>
  );
}

// ====== Topbar ======
function Topbar({ crumbs, actions }) {
  return (
    <div className="topbar">
      <div className="topbar-crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--ink)' : undefined, fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-spacer"/>
      <div className="topbar-actions">
        {actions}
        <button className="icon-btn" title="Notifications"><Icon name="bell" size={15}/></button>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, AgentAvatar, SourceBadge, StatusBadge, Sidebar, Topbar, cls });
