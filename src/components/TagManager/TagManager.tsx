import { useState } from 'react';
import {
  TAG_COLORS,
  colorHex,
  hexRgba,
  generateTagId,
  createUpdateTag,
  editUpdateTag,
  deleteUpdateTag,
  type UpdateTag,
} from '../../services/updateTags';
import styles from './TagManager.module.css';

interface Props {
  tags: UpdateTag[];
  onClose: () => void;
  onReload: () => void;
}

type Mode = 'list' | 'create' | { edit: UpdateTag };

export function TagManager({ tags, onClose, onReload }: Props) {
  const [mode, setMode] = useState<Mode>('list');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('teal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function openCreate() { setLabel(''); setColor('teal'); setError(''); setMode('create'); }
  function openEdit(t: UpdateTag) { setLabel(t.label); setColor(t.color); setError(''); setMode({ edit: t }); }

  async function handleSave() {
    if (!label.trim()) { setError('Label is required'); return; }
    setSaving(true); setError('');
    try {
      if (mode === 'create') {
        await createUpdateTag({ id: generateTagId(), label: label.trim(), color });
      } else if (typeof mode === 'object') {
        await editUpdateTag(mode.edit.id, { label: label.trim(), color });
      }
      onReload();
      setMode('list');
    } catch {
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await deleteUpdateTag(id);
      onReload();
      setConfirmDel(null);
    } catch {
      setError('Failed to delete. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const isForm = mode !== 'list';
  const h = colorHex(color);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {mode === 'list' ? 'Manage Tags' : mode === 'create' ? 'New Tag' : 'Edit Tag'}
          </h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        {isForm ? (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Label</label>
              <input
                className={styles.input}
                value={label}
                onChange={(e) => { setLabel(e.target.value); setError(''); }}
                placeholder="Tag name"
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Color</label>
              <div className={styles.palette}>
                {Object.entries(TAG_COLORS).map(([key, { hex, name }]) => (
                  <button
                    key={key}
                    type="button"
                    title={name}
                    className={`${styles.swatch} ${color === key ? styles.swatchActive : ''}`}
                    style={{ background: hex }}
                    onClick={() => setColor(key)}
                  />
                ))}
              </div>
              <span
                className={styles.previewChip}
                style={{
                  background: hexRgba(h, 0.18),
                  border: `1px solid ${hexRgba(h, 0.5)}`,
                  color: h,
                }}
              >
                {label || 'Preview'}
              </span>
            </div>

            <div className={styles.actions}>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button className={styles.cancelBtn} onClick={() => setMode('list')}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <ul className={styles.tagList}>
              {tags.length === 0 && (
                <li className={styles.empty}>No tags yet. Create your first one.</li>
              )}
              {tags.map((t) => {
                const th = colorHex(t.color);
                return (
                  <li key={t.id} className={styles.tagRow}>
                    <span
                      className={styles.tagChip}
                      style={{
                        background: hexRgba(th, 0.18),
                        border: `1px solid ${hexRgba(th, 0.5)}`,
                        color: th,
                      }}
                    >
                      {t.label}
                    </span>
                    <div className={styles.tagActions}>
                      {confirmDel === t.id ? (
                        <>
                          <button
                            className={styles.confirmDelBtn}
                            onClick={() => handleDelete(t.id)}
                            disabled={saving}
                          >
                            Confirm
                          </button>
                          <button className={styles.cancelSmBtn} onClick={() => setConfirmDel(null)}>
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={styles.editTagBtn} onClick={() => openEdit(t)}>Edit</button>
                          <button className={styles.deleteTagBtn} onClick={() => setConfirmDel(t.id)}>✕</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={styles.actions}>
              <button className={styles.saveBtn} onClick={openCreate}>+ New Tag</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
