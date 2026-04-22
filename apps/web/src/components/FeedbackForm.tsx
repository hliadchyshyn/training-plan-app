import { useState } from 'react'
import type { FeedbackStatus } from '../types/common.js'
import { STATUS_LABELS } from '../utils/constants.js'

interface Props {
  namePrefix?: string
  isPending: boolean
  initialValues?: { status: FeedbackStatus; rpe: number; comment: string | null }
  onSubmit: (values: { status: FeedbackStatus; rpe: number; comment: string }) => void
  onCancel: () => void
}

export function FeedbackForm({ namePrefix = 'status', isPending, initialValues, onSubmit, onCancel }: Props) {
  const [status, setStatus] = useState<FeedbackStatus | undefined>(initialValues?.status)
  const [rpe, setRpe] = useState(initialValues?.rpe ?? 5)
  const [comment, setComment] = useState(initialValues?.comment ?? '')

  return (
    <>
      <div className="form-group">
        <label style={{ fontWeight: 600 }}>Як пройшло?</label>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          {(['COMPLETED', 'PARTIAL', 'SKIPPED'] as FeedbackStatus[]).map((s) => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, cursor: 'pointer' }}>
              <input
                type="radio"
                name={namePrefix}
                checked={status === s}
                onChange={() => setStatus(s)}
                style={{ width: 'auto' }}
              />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>RPE (навантаження): {rpe}</label>
        <input
          type="range" min={1} max={10} value={rpe}
          onChange={(e) => setRpe(+e.target.value)}
          style={{ padding: 0, border: 'none' }}
        />
      </div>
      <div className="form-group">
        <label>Коментар (необов'язково)</label>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn-primary"
          disabled={!status || isPending}
          onClick={() => status && onSubmit({ status, rpe, comment })}
        >
          {isPending ? 'Збереження...' : initialValues ? 'Оновити відгук' : 'Зберегти відгук'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Скасувати</button>
      </div>
    </>
  )
}
