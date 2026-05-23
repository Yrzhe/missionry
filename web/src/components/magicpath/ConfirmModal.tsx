import { useTranslation } from 'react-i18next';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

// In-app confirmation dialog. Replaces window.confirm(), which browsers/extensions
// can silently suppress ("don't allow this page to create more dialogs"), making
// gated actions like delete appear to do nothing.
export function ConfirmModal({ open, title, body, confirmLabel, cancelLabel, danger, busy, error, onConfirm, onCancel }: ConfirmModalProps) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="mp-modal-backdrop" role="presentation" onClick={() => { if (!busy) onCancel(); }}>
      <div className="mp-modal mp-confirm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {body ? <p className="mp-muted mp-wrap">{body}</p> : null}
        {error ? <div className="mp-denied">{error}</div> : null}
        <div className="mp-confirm-actions">
          <button type="button" className="mp-button" disabled={busy} onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</button>
          <button type="button" className={`mp-button ${danger ? 'danger' : 'dark'}`} disabled={busy} onClick={onConfirm}>
            {busy ? t('common.saving') : (confirmLabel ?? t('common.delete'))}
          </button>
        </div>
      </div>
    </div>
  );
}
