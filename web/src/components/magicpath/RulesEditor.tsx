import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';

type RulesEditorProps = {
  title: string;
  hint: string;
  queryKey: readonly unknown[];
  load: () => Promise<{ rules: string }>;
  save: (content: string) => Promise<{ rules: string }>;
};

// Edit an AGENTS.md-style rulebook (global or per-mission). Plain Markdown
// textarea that agents read and follow.
export function RulesEditor({ title, hint, queryKey, load, save }: RulesEditorProps) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey, queryFn: load });
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data.rules ?? '');
  }, [query.data, dirty]);
  const mutation = useMutation({
    mutationFn: () => save(draft),
    onSuccess: () => { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });
  return (
    <section className="mp-card mp-rules-editor">
      <div className="mp-section-title"><div><strong>{title}</strong><p className="mp-muted">{hint}</p></div></div>
      <textarea
        className="mp-rules-textarea"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        placeholder={t('rules.placeholder')}
      />
      <div className="mp-rules-actions">
        {saved ? <span className="mp-muted">{t('rules.saved')}</span> : null}
        <button className="mp-button dark" disabled={mutation.isPending || !dirty} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </section>
  );
}
