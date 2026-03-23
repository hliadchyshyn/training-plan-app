import { calcVolumeKm } from '../utils/volume.js'

interface WorkoutBlock {
  sets?: number
  distance?: string
  duration?: string
  rest?: string
  series?: number
  seriesRest?: string
  intensity?: string
}

interface ParsedWorkout {
  blocks?: WorkoutBlock[]
  pace?: { general?: string; men?: string; women?: string }
  notes?: string
}

interface WorkoutCardProps {
  rawText: string
  parsedData?: unknown
}

export function WorkoutCard({ rawText, parsedData }: WorkoutCardProps) {
  const parsed = parsedData as ParsedWorkout | null

  if (!parsed?.blocks?.length) {
    return <div style={{ whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{rawText}</div>
  }

  const volumeKm = calcVolumeKm(parsedData)

  return (
    <div style={{ fontSize: '0.875rem' }}>
      {parsed.blocks.map((block, i) => (
        <div
          key={i}
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
            padding: '0.375rem 0',
            borderBottom: i < parsed.blocks!.length - 1 ? '1px solid var(--color-border)' : 'none',
          }}
        >
          {(block.sets || block.distance || block.duration) && (
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              {block.sets && `${block.sets}×`}{block.distance ?? block.duration}
            </span>
          )}
          {block.rest && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
              відп. {block.rest}
            </span>
          )}
          {block.series && block.series > 1 && (
            <span style={{ background: '#f3f4f6', borderRadius: 4, padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}>
              {block.series} серії{block.seriesRest && ` · між серіями ${block.seriesRest}`}
            </span>
          )}
          {block.intensity && (
            <span style={{ color: '#7c3aed', fontSize: '0.75rem', fontWeight: 600 }}>
              {block.intensity}
            </span>
          )}
        </div>
      ))}

      {parsed.pace && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#1e40af', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {parsed.pace.general && <span>Пейс: {parsed.pace.general}</span>}
          {parsed.pace.men && <span>хлопці: {parsed.pace.men}</span>}
          {parsed.pace.women && <span>дівчата: {parsed.pace.women}</span>}
        </div>
      )}

      {parsed.notes && (
        <div style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {parsed.notes}
        </div>
      )}

      {volumeKm > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.6875rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: 9999, fontWeight: 600 }}>
            ~{volumeKm} км
          </span>
        </div>
      )}
    </div>
  )
}
