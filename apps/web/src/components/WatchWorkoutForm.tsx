import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WatchWorkoutStep, WatchSport } from '@training-plan/shared'

/** "4:30" → 270 seconds. Returns 0 if invalid. */
function paceToSec(str: string): number {
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

/** 270 → "4:30" */
function secToPace(sec: number | undefined): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export type DraftStep = Partial<WatchWorkoutStep> & { type: WatchWorkoutStep['type']; _id: string }

export const SPORT_OPTIONS: { value: WatchSport; label: string }[] = [
  { value: 'RUNNING', label: 'Біг' },
  { value: 'CYCLING', label: 'Велосипед' },
  { value: 'SWIMMING', label: 'Плавання' },
]

export const STEP_TYPE_OPTIONS: { value: WatchWorkoutStep['type']; label: string }[] = [
  { value: 'WARMUP', label: 'Розминка' },
  { value: 'ACTIVE', label: 'Активно' },
  { value: 'RECOVERY', label: 'Відновлення' },
  { value: 'COOLDOWN', label: 'Заминка' },
  { value: 'REST', label: 'Відпочинок' },
  { value: 'REPEAT_BEGIN', label: '↩ Початок повтору' },
  { value: 'REPEAT_END', label: '↩ Кінець повтору' },
]

let _idCounter = 0
export function makeStep(type: WatchWorkoutStep['type']): DraftStep {
  const _id = String(++_idCounter)
  if (type === 'REPEAT_BEGIN') return { _id, type, repeatCount: 4, durationUnit: 'OPEN', targetUnit: 'OPEN' }
  if (type === 'REPEAT_END') return { _id, type, durationUnit: 'OPEN', targetUnit: 'OPEN' }
  return { _id, type, durationUnit: 'DISTANCE', targetUnit: 'OPEN' }
}

export function toWatchSteps(steps: DraftStep[]): WatchWorkoutStep[] {
  return steps.map(({ _id: _ignored, ...rest }) => rest as WatchWorkoutStep)
}

export function fromWatchSteps(steps: WatchWorkoutStep[]): DraftStep[] {
  return steps.map((s) => ({ ...s, _id: String(++_idCounter) }))
}

// ─── Depth calculation ────────────────────────────────────────────────────────
function calcDepths(steps: DraftStep[]): number[] {
  const depths: number[] = []
  let d = 0
  for (const step of steps) {
    if (step.type === 'REPEAT_BEGIN') { depths.push(d); d++ }
    else if (step.type === 'REPEAT_END') { d = Math.max(0, d - 1); depths.push(d) }
    else depths.push(d)
  }
  return depths
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────
function DragHandle({ listeners, attributes }: { listeners?: object; attributes?: object }) {
  return (
    <div
      {...listeners}
      {...attributes}
      style={{
        cursor: 'grab',
        padding: '0 4px',
        alignSelf: 'center',
        color: 'var(--color-text-muted)',
        opacity: 0.5,
        fontSize: 16,
        lineHeight: 1,
        userSelect: 'none',
        touchAction: 'none',
      }}
      title="Перетягнути"
    >
      ⠿
    </div>
  )
}

// ─── Single sortable step row ─────────────────────────────────────────────────
function SortableStepRow({
  step,
  index,
  depth,
  onChange,
  onRemove,
}: {
  step: DraftStep
  index: number
  depth: number
  onChange: (idx: number, updated: DraftStep) => void
  onRemove: (idx: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step._id })
  const set = (patch: Partial<DraftStep>) => onChange(index, { ...step, ...patch })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginLeft: depth * 12,
  }

  if (step.type === 'REPEAT_BEGIN') {
    return (
      <div ref={setNodeRef} style={style}>
        <div className="card" style={{ background: '#f0f9ff', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <DragHandle listeners={listeners} attributes={attributes} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>↩ Повтор</span>
            <input
              type="number"
              min={2}
              max={50}
              value={step.repeatCount ?? 4}
              onChange={(e) => set({ repeatCount: parseInt(e.target.value) || 2 })}
              style={{ width: 60, textAlign: 'center' }}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>разів</span>
            <button type="button" className="btn-danger" style={{ marginLeft: 'auto' }} onClick={() => onRemove(index)}>✕</button>
          </div>
        </div>
      </div>
    )
  }

  if (step.type === 'REPEAT_END') {
    return (
      <div ref={setNodeRef} style={style}>
        <div className="card" style={{ background: '#f0f9ff', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DragHandle listeners={listeners} attributes={attributes} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>↩ Кінець повтору</span>
            <button type="button" className="btn-danger" style={{ marginLeft: 'auto' }} onClick={() => onRemove(index)}>✕</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <DragHandle listeners={listeners} attributes={attributes} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', flex: 1 }}>

          <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Тип</label>
            <select value={step.type} onChange={(e) => set({ type: e.target.value as WatchWorkoutStep['type'] })}>
              {STEP_TYPE_OPTIONS.filter((o) => o.value !== 'REPEAT_BEGIN' && o.value !== 'REPEAT_END').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ flex: '1 1 110px', margin: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Тривалість</label>
            <select
              value={step.durationUnit ?? 'DISTANCE'}
              onChange={(e) => set({ durationUnit: e.target.value as WatchWorkoutStep['durationUnit'], durationValue: undefined })}
            >
              <option value="DISTANCE">Дистанція</option>
              <option value="TIME">Час</option>
              <option value="OPEN">Відкрита</option>
            </select>
          </div>

          {step.durationUnit !== 'OPEN' && (
            <div className="form-group" style={{ flex: '0 1 90px', margin: 0 }}>
              <label style={{ fontSize: '0.75rem' }}>{step.durationUnit === 'DISTANCE' ? 'Метрів' : 'Секунд'}</label>
              <input
                type="number"
                min={1}
                value={step.durationValue ?? ''}
                onChange={(e) => set({ durationValue: parseInt(e.target.value) || undefined })}
                placeholder={step.durationUnit === 'DISTANCE' ? '800' : '180'}
              />
            </div>
          )}

          <div className="form-group" style={{ flex: '0 1 100px', margin: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Темп</label>
            <select
              value={step.targetUnit ?? 'OPEN'}
              onChange={(e) => set({ targetUnit: e.target.value as WatchWorkoutStep['targetUnit'], targetFrom: undefined, targetTo: undefined })}
            >
              <option value="OPEN">Без цілі</option>
              <option value="PACE">Темп</option>
            </select>
          </div>

          {step.targetUnit === 'PACE' && (
            <>
              <div className="form-group" style={{ flex: '0 1 80px', margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Від (хв/км)</label>
                <input
                  type="text"
                  value={secToPace(step.targetFrom)}
                  onChange={(e) => {
                    const sec = paceToSec(e.target.value)
                    set({ targetFrom: sec || undefined })
                  }}
                  placeholder="4:00"
                  maxLength={5}
                />
              </div>
              <div className="form-group" style={{ flex: '0 1 80px', margin: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>До (хв/км)</label>
                <input
                  type="text"
                  value={secToPace(step.targetTo)}
                  onChange={(e) => {
                    const sec = paceToSec(e.target.value)
                    set({ targetTo: sec || undefined })
                  }}
                  placeholder="4:30"
                  maxLength={5}
                />
              </div>
            </>
          )}

          <div className="form-group" style={{ flex: '2 1 130px', margin: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Назва (опціонально)</label>
            <input
              type="text"
              value={step.name ?? ''}
              onChange={(e) => set({ name: e.target.value || undefined })}
            />
          </div>
          </div>

          <button type="button" className="btn-danger" style={{ flexShrink: 0, alignSelf: 'flex-start' }} onClick={() => onRemove(index)}>✕</button>
        </div>
      </div>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────
export function WatchWorkoutStepList({
  steps,
  onChange,
}: {
  steps: DraftStep[]
  onChange: (steps: DraftStep[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const depths = calcDepths(steps)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = steps.findIndex((s) => s._id === active.id)
    const newIdx = steps.findIndex((s) => s._id === over.id)
    if (oldIdx !== -1 && newIdx !== -1) onChange(arrayMove(steps, oldIdx, newIdx))
  }

  const updateStep = (idx: number, updated: DraftStep) =>
    onChange(steps.map((s, i) => (i === idx ? updated : s)))

  const removeStep = (idx: number) =>
    onChange(steps.filter((_, i) => i !== idx))

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map((s) => s._id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, idx) => (
            <SortableStepRow
              key={step._id}
              step={step}
              index={idx}
              depth={depths[idx] ?? 0}
              onChange={updateStep}
              onRemove={removeStep}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
