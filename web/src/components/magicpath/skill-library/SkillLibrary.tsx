import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query';
import { Shell } from '../Shell';
import { Markdown } from '../Markdown';

export function SkillLibrary() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({ queryKey: queryKeys.skills, queryFn: api.skills });
  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: api.agents });
  const skills = skillsQuery.data?.items ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Shell title={t('skills.title')} meta={<span className="mp-muted">{t('skills.subtitle')}</span>}>
      <div className="mp-head">
        <div>
          <div className="mp-label">{t('skills.title')}</div>
          <h1>{t('skills.libraryTitle')}</h1>
          <p className="mp-muted">{t('skills.intro')}</p>
        </div>
      </div>
      <div className="mp-skill-grid">
        {skills.length ? skills.map((s) => (
          <button key={s.id} className="mp-skill-card" onClick={() => setOpenId(s.id)}>
            <strong>{s.name}</strong>
            <p className="mp-muted mp-skill-desc">{s.description}</p>
            <div className="mp-skill-foot">
              <span className="mp-chip">{t('skills.equippedCount', { count: s.equippedAgentIds.length })}</span>
              {s.source?.startsWith('github:') ? <span className="mp-muted">GitHub</span> : null}
            </div>
          </button>
        )) : <div className="mp-empty mp-empty-cta"><h2>{t('skills.emptyTitle')}</h2><p>{t('skills.emptyBody')}</p></div>}
      </div>
      {openId ? <SkillDetailModal skillId={openId} agents={agents} onClose={() => setOpenId(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: queryKeys.skills })} /> : null}
    </Shell>
  );
}

function SkillDetailModal({ skillId, agents, onClose, onSaved }: { skillId: string; agents: Array<{ id: string; displayName: string }>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: queryKeys.skill(skillId), queryFn: () => api.skill(skillId) });
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (detailQuery.data) setEquipped(new Set(detailQuery.data.equippedAgentIds));
  }, [detailQuery.data]);
  const saveMutation = useMutation({
    mutationFn: () => api.setSkillAgents(skillId, Array.from(equipped)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.skill(skillId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
      ]);
      onSaved();
      onClose();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : t('skills.saveError')),
  });
  function toggle(agentId: string) {
    setEquipped((prev) => { const next = new Set(prev); if (next.has(agentId)) next.delete(agentId); else next.add(agentId); return next; });
  }
  const detail = detailQuery.data;
  return (
    <div className="mp-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="mp-modal mp-skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mp-section-title">
          <div>
            <div className="mp-label">{t('skills.skill')}</div>
            <h2>{detail?.name ?? skillId}</h2>
          </div>
          <button type="button" className="mp-button" onClick={onClose}>{t('common.close')}</button>
        </div>
        {detail ? <p className="mp-muted">{detail.description}</p> : null}
        <div className="mp-skill-modal-body">
          <div className="mp-skill-content">
            <div className="mp-label">SKILL.md</div>
            {detail ? <Markdown value={detail.content || t('skills.noContent')} /> : <p className="mp-muted">{t('common.loading')}</p>}
          </div>
          <div className="mp-skill-equip">
            <div className="mp-label">{t('skills.equipOn')}</div>
            <div className="mp-skill-agent-list">
              {agents.length ? agents.map((a) => (
                <label key={a.id} className="mp-inline-check mp-skill-agent">
                  <input type="checkbox" checked={equipped.has(a.id)} onChange={() => toggle(a.id)} />
                  {a.displayName}
                </label>
              )) : <p className="mp-muted">{t('skills.noAgents')}</p>}
            </div>
          </div>
        </div>
        {err ? <div className="mp-denied">{err}</div> : null}
        <button className="mp-button dark" disabled={saveMutation.isPending} onClick={() => { setErr(null); saveMutation.mutate(); }}>{saveMutation.isPending ? t('common.saving') : t('skills.saveEquip')}</button>
      </div>
    </div>
  );
}
