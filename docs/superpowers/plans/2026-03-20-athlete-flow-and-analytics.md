# Athlete Flow & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the athlete training flow (group + individual plan detail pages), add traffic-light monitoring for trainers, and add workout volume badges + weekly load chart.

**Architecture:** Backend adds two new endpoints (single group plan fetch, atomic session+feedback creation, volume stats). Frontend rewrites GroupPlanDetailPage and IndividualPlanPage to use a one-step select+feedback flow. FeedbackSummaryPage gets traffic-light indicators. WeeklyCalendarPage gets volume badges and a load chart using recharts.

**Tech Stack:** Fastify + Prisma (backend), React + TanStack Query + recharts (frontend), existing CSS classes (no new UI lib changes needed)

---

## Parsed Data Reference

The workout parser extracts this structure from free-text like `4*800м через 3 хв відпочинку. 2 серії між серіями 5 хв. Пейс 1:20-1:25 хлопці 1:30-1:35 дівчата`:

```json
{
  "blocks": [{ "sets": 4, "distance": "800м", "rest": "3 хв", "series": 2, "seriesRest": "5 хв" }],
  "pace": { "men": "1:20-1:25", "women": "1:30-1:35" }
}
```

**Volume formula:** `sets × distance_meters × series / 1000 = km`
Example: `4 × 800 × 2 / 1000 = 6.4 км`

**Parser limitations:**
- Cross-country (minutes without distance) — no km calculable
- Strength exercises — no distance, volume = 0
- In these cases: raw text is shown as-is, no volume badge appears

**Feature priority:**
1. Volume badge on each workout card — minimal code, immediate visible value
2. Weekly volume in "Мій план" summary — concrete number instead of just "виконано"
3. Structured workout display — replaces raw text with formatted card (sets / distance / pace)
4. Load chart — useful once 3–4 weeks of real data accumulates

---

## File Map

| File | Change |
|------|--------|
| `apps/api/src/routes/athlete.ts` | Add `GET /my/plans/group/:id`, `POST /my/sessions/with-feedback`, `GET /my/stats/volume` |
| `apps/web/src/pages/GroupPlanDetailPage.tsx` | Full rewrite — new query, back button, one-step flow, no border-left |
| `apps/web/src/pages/IndividualPlanPage.tsx` | Rewrite — remove "Розпочати", one-step inline feedback, back button |
| `apps/web/src/pages/trainer/FeedbackSummaryPage.tsx` | Add traffic-light dots + team members with no session |
| `apps/api/src/routes/plans.ts` | Extend `GET /:id/feedback` to include all team members (no-session = pending) |
| `apps/web/src/pages/WeeklyCalendarPage.tsx` | Add volume badge on group plan cards, volume in weekly summary, VolumeChart |
| `apps/web/src/utils/volume.ts` | New — parse distance string → meters, compute volume from parsedData |
| `apps/web/src/components/WorkoutCard.tsx` | New — structured workout display (blocks + pace + volume badge), falls back to rawText |
| `apps/web/package.json` | Add `recharts` (ships own types since v2 — no `@types/recharts` needed) |

---

## Task 1: Backend — `GET /my/plans/group/:id`

**Files:**
- Modify: `apps/api/src/routes/athlete.ts`

The current `GroupPlanDetailPage` fetches a plan by filtering from `/my/plans/week` — this breaks for non-current-week plans and doesn't invalidate properly. Add a direct fetch endpoint.

- [ ] **Step 1: Add the endpoint to `apps/api/src/routes/athlete.ts`**

Insert after the `/plans/individual` route (around line 106), before `/sessions`:

```typescript
// Get single group plan by id (for athlete detail view)
fastify.get('/plans/group/:id', async (request, reply) => {
  const athleteId = request.user.sub
  const { id } = request.params as { id: string }

  const plan = await fastify.prisma.trainingPlan.findUnique({
    where: { id },
    include: {
      exerciseGroups: { orderBy: { order: 'asc' } },
      team: { select: { id: true, name: true } },
      sessions: {
        where: { athleteId },
        include: { feedback: true },
      },
    },
  })

  if (!plan) return reply.status(404).send({ error: 'Plan not found' })

  // Verify athlete is in the team (teamId is always set for GROUP plans)
  if (!plan.teamId) return reply.status(403).send({ error: 'Forbidden' })
  const member = await fastify.prisma.teamMember.findUnique({
    where: { teamId_athleteId: { teamId: plan.teamId, athleteId } },
  })
  if (!member) return reply.status(403).send({ error: 'Forbidden' })

  return plan
})
```

- [ ] **Step 2: Test manually (or via curl)**

```bash
# After docker is running:
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/my/plans/group/<planId>
# Expected: plan object with exerciseGroups and sessions arrays
```

---

## Task 2: Backend — Atomic `POST /my/sessions/with-feedback`

**Files:**
- Modify: `apps/api/src/routes/athlete.ts`

The current flow requires two round-trips: create session then submit feedback. This causes bugs — after selecting a group, the session is created but the page doesn't re-render with the feedback form. Atomic endpoint fixes this.

- [ ] **Step 1: Add the schema and endpoint to `apps/api/src/routes/athlete.ts`**

Add schema near the top of the file (after existing schemas):

```typescript
const sessionWithFeedbackSchema = z.object({
  planId: z.string().uuid().optional(),
  individualPlanDayId: z.string().uuid().optional(),
  exerciseGroupId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'PARTIAL', 'SKIPPED']),
  rpe: z.number().int().min(1).max(10),
  comment: z.string().optional(),
})
```

Add endpoint after the existing `POST /sessions` route:

```typescript
// Create session + submit feedback atomically
fastify.post('/sessions/with-feedback', async (request, reply) => {
  const athleteId = request.user.sub
  const body = sessionWithFeedbackSchema.parse(request.body)

  if (!body.planId && !body.individualPlanDayId) {
    return reply.status(400).send({ error: 'planId or individualPlanDayId required' })
  }

  const result = await fastify.prisma.$transaction(async (tx) => {
    // Upsert session (athlete may revisit)
    let session = body.planId
      ? await tx.athleteSession.findFirst({
          where: { athleteId, planId: body.planId },
        })
      : await tx.athleteSession.findFirst({
          where: { athleteId, individualPlanDayId: body.individualPlanDayId },
        })

    if (!session) {
      session = await tx.athleteSession.create({
        data: {
          athleteId,
          planId: body.planId,
          individualPlanDayId: body.individualPlanDayId,
          exerciseGroupId: body.exerciseGroupId,
          date: new Date(body.date),
        },
      })
    } else if (body.exerciseGroupId && session.exerciseGroupId !== body.exerciseGroupId) {
      // Athlete changed their group selection — update it
      session = await tx.athleteSession.update({
        where: { id: session.id },
        data: { exerciseGroupId: body.exerciseGroupId },
      })
    }

    const feedback = await tx.sessionFeedback.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        status: body.status,
        rpe: body.rpe,
        comment: body.comment,
      },
      update: {
        status: body.status,
        rpe: body.rpe,
        comment: body.comment,
      },
    })

    return { session, feedback }
  })

  return reply.status(201).send(result)
})
```

- [ ] **Step 2: Test with curl**

```bash
curl -X POST http://localhost:3001/api/my/sessions/with-feedback \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"planId":"<id>","exerciseGroupId":"<gid>","date":"2026-03-20","status":"COMPLETED","rpe":7}'
# Expected: 201 { session: {...}, feedback: {...} }
```

---

## Task 3: Backend — `GET /my/stats/volume`

**Files:**
- Modify: `apps/api/src/routes/athlete.ts`

Returns per-week volume (km) for the last N weeks based on parsedData from exercise groups the athlete logged sessions for.

- [ ] **Step 1: Add the endpoint**

Add after the `/sessions` GET route:

```typescript
// Weekly volume stats for chart
fastify.get('/stats/volume', async (request) => {
  const athleteId = request.user.sub
  const { weeks = '8' } = request.query as { weeks?: string }
  const numWeeks = Math.min(parseInt(weeks, 10) || 8, 26)

  // Get sessions with exercise group parsedData for last N weeks
  const since = new Date()
  since.setDate(since.getDate() - numWeeks * 7)

  const sessions = await fastify.prisma.athleteSession.findMany({
    where: { athleteId, date: { gte: since } },
    include: {
      exerciseGroup: { select: { parsedData: true } },
      feedback: { select: { status: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Group by week start (Monday)
  const weekMap: Record<string, number> = {}

  for (const session of sessions) {
    if (!session.exerciseGroup?.parsedData) continue

    const d = new Date(session.date)
    const day = d.getDay() === 0 ? 7 : d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + 1)
    const weekKey = monday.toISOString().split('T')[0]

    // Calculate volume from parsedData
    const parsed = session.exerciseGroup.parsedData as {
      blocks?: Array<{ sets?: number; distance?: string; series?: number }>
    }
    let volumeKm = 0
    for (const block of parsed.blocks ?? []) {
      const meters = parseDistanceMeters(block.distance ?? '')
      if (meters > 0) {
        volumeKm += (block.sets ?? 1) * (block.series ?? 1) * meters / 1000
      }
    }

    weekMap[weekKey] = (weekMap[weekKey] ?? 0) + volumeKm
  }

  return Object.entries(weekMap)
    .map(([week, volume]) => ({ week, volume: Math.round(volume * 10) / 10 }))
    .sort((a, b) => a.week.localeCompare(b.week))
})
```

Add the helper function at the top of the file (outside the plugin), after the imports. **Note:** this is intentionally duplicated from `apps/web/src/utils/volume.ts` — the backend cannot import web utilities. Keep both in sync if the regex ever changes.

```typescript
function parseDistanceMeters(str: string): number {
  const m = str.match(/(\d+(?:\.\d+)?)\s*(км|km|м|m)/i)
  if (!m) return 0
  const val = parseFloat(m[1])
  return /км|km/i.test(m[2]) ? val * 1000 : val
}
```

- [ ] **Step 2: Test**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/my/stats/volume?weeks=4
# Expected: [{ week: "2026-03-10", volume: 6.0 }, ...]
```

---

## Task 4: Frontend — Volume utility

**Files:**
- Create: `apps/web/src/utils/volume.ts`

Shared client-side utility to compute workout volume from parsedData. Used in WeeklyCalendarPage and GroupPlanDetailPage.

- [ ] **Step 1: Create `apps/web/src/utils/volume.ts`**

```typescript
interface WorkoutBlock {
  sets?: number
  distance?: string
  series?: number
}

interface ParsedWorkout {
  blocks?: WorkoutBlock[]
}

export function parseDistanceMeters(str: string): number {
  const m = str?.match(/(\d+(?:\.\d+)?)\s*(км|km|м|m)/i)
  if (!m) return 0
  const val = parseFloat(m[1])
  return /км|km/i.test(m[2]) ? val * 1000 : val
}

export function calcVolumeKm(parsedData: unknown): number {
  const parsed = parsedData as ParsedWorkout | null
  if (!parsed?.blocks?.length) return 0
  let total = 0
  for (const block of parsed.blocks) {
    const meters = parseDistanceMeters(block.distance ?? '')
    if (meters > 0) {
      total += (block.sets ?? 1) * (block.series ?? 1) * meters / 1000
    }
  }
  return Math.round(total * 10) / 10
}
```

---

## Task 5: Frontend — Add recharts

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add recharts to package.json**

In `apps/web/package.json`, add to dependencies:
```json
"recharts": "^2.12.7"
```

- [ ] **Step 2: Install in the running container**

```bash
docker compose exec -w /workspace web npm install recharts
```

Expected output: `added X packages` with no errors.

---

## Task 6: Frontend — Rewrite `GroupPlanDetailPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/GroupPlanDetailPage.tsx`

**Bug list being fixed:**
- queryFn fetches from `/my/plans/week` → replace with `GET /my/plans/group/:id`
- `selectedGroup` initialized before plan loads → remove, use plan session data
- `selectGroup.onSuccess` only invalidates `['week']` → not needed anymore (one-step flow)
- `borderLeft: '4px solid var(--color-success)'` on feedback card → remove
- No back button → add `← Назад`
- Flow: select group → immediately show inline feedback form → submit atomically

**New flow:**
1. Page loads → shows groups + back button
2. If athlete has NO session: click group → that group card shows inline feedback form (with group name highlighted)
3. Submit → `POST /my/sessions/with-feedback` → success → query invalidates → page shows feedback card
4. If athlete HAS session with feedback: show read-only feedback card (no border-left)

- [ ] **Step 1: Rewrite `GroupPlanDetailPage.tsx`**

```tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { calcVolumeKm } from '../utils/volume.js'
import type { FeedbackStatus } from '@training-plan/shared'

interface ExerciseGroup {
  id: string
  name: string
  rawText: string
  parsedData: unknown
}

interface Feedback {
  status: FeedbackStatus
  rpe: number
  comment: string | null
}

interface Session {
  id: string
  exerciseGroupId: string | null
  feedback: Feedback | null
}

interface Plan {
  id: string
  date: string
  title: string | null
  notes: string | null
  exerciseGroups: ExerciseGroup[]
  sessions: Session[]
  team: { id: string; name: string } | null
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL: 'Частково',
  SKIPPED: 'Пропущено',
}

export function GroupPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ status?: FeedbackStatus; rpe: number; comment: string }>({ rpe: 5, comment: '' })

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ['plan', id],
    queryFn: () => api.get(`/my/plans/group/${id}`).then((r) => r.data),
  })

  const mySession = plan?.sessions[0]

  const submitWithFeedback = useMutation({
    mutationFn: (data: typeof feedbackForm & { exerciseGroupId: string }) =>
      api.post('/my/sessions/with-feedback', {
        planId: id,
        exerciseGroupId: data.exerciseGroupId,
        date: plan?.date.split('T')[0],
        status: data.status,
        rpe: data.rpe,
        comment: data.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', id] })
      qc.invalidateQueries({ queryKey: ['week'] })
      setSelectedGroupId(null)
    },
  })

  if (isLoading) return <div className="page">Завантаження...</div>
  if (!plan) return <div className="page">План не знайдено</div>

  const planDate = new Date(plan.date).toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="page">
      <button
        className="btn-secondary"
        style={{ fontSize: '0.875rem', marginBottom: '1rem', padding: '0.25rem 0.75rem' }}
        onClick={() => navigate(-1)}
      >
        ← Назад
      </button>

      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
        {plan.title ?? 'Групове тренування'}
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        {planDate}{plan.team && ` · ${plan.team.name}`}
      </p>

      {plan.notes && (
        <div className="card" style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
          {plan.notes}
        </div>
      )}

      {/* Feedback already submitted */}
      {mySession?.feedback && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Відгук збережено</p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge badge-${mySession.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`}>
              {STATUS_LABELS[mySession.feedback.status]}
            </span>
            <span style={{ fontSize: '0.875rem' }}>RPE: {mySession.feedback.rpe}</span>
            {mySession.feedback.comment && (
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {mySession.feedback.comment}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Group selection (only if no feedback yet) */}
      {!mySession?.feedback && (
        <>
          <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
            {selectedGroupId ? 'Залиште відгук:' : 'Оберіть свою групу:'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {plan.exerciseGroups.map((group) => {
              const isSelected = selectedGroupId === group.id
              const volumeKm = calcVolumeKm(group.parsedData)

              return (
                <div
                  key={group.id}
                  className="card"
                  style={{
                    cursor: isSelected ? 'default' : 'pointer',
                    border: isSelected
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    opacity: selectedGroupId && !isSelected ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => {
                    if (!selectedGroupId) setSelectedGroupId(group.id)
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{group.name}</div>
                    {volumeKm > 0 && (
                      <span style={{ fontSize: '0.6875rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: 9999, fontWeight: 600 }}>
                        ~{volumeKm} км
                      </span>
                    )}
                  </div>
                  <div style={{ whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{group.rawText}</div>

                  {/* Inline feedback form when this group is selected */}
                  {isSelected && (
                    <div
                      style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Як пройшло?</label>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                          {(['COMPLETED', 'PARTIAL', 'SKIPPED'] as FeedbackStatus[]).map((s) => (
                            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="status"
                                value={s}
                                checked={feedbackForm.status === s}
                                onChange={() => setFeedbackForm((f) => ({ ...f, status: s }))}
                                style={{ width: 'auto' }}
                              />
                              {STATUS_LABELS[s]}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label>RPE (навантаження): {feedbackForm.rpe}</label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={feedbackForm.rpe}
                          onChange={(e) => setFeedbackForm((f) => ({ ...f, rpe: +e.target.value }))}
                          style={{ padding: 0, border: 'none' }}
                        />
                      </div>
                      <div className="form-group">
                        <label>Коментар (необов'язково)</label>
                        <textarea
                          rows={2}
                          value={feedbackForm.comment}
                          onChange={(e) => setFeedbackForm((f) => ({ ...f, comment: e.target.value }))}
                          placeholder="Як пройшло тренування?"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn-primary"
                          disabled={!feedbackForm.status || submitWithFeedback.isPending}
                          onClick={() => submitWithFeedback.mutate({ ...feedbackForm, exerciseGroupId: group.id })}
                        >
                          {submitWithFeedback.isPending ? 'Збереження...' : 'Зберегти відгук'}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => setSelectedGroupId(null)}
                        >
                          Скасувати
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open a group plan → see groups + back button. Click a group → feedback form opens inline. Submit → page shows green confirmation card. Navigate back → weekly calendar shows "Виконано" badge.

---

## Task 7: Frontend — Rewrite `IndividualPlanPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/IndividualPlanPage.tsx`

**Changes:**
- Add back button
- Remove "Розпочати" button — clicking the day card directly opens feedback form
- Feedback submission uses `POST /my/sessions/with-feedback`
- If already has feedback: show read-only badge (no edit for now)

- [ ] **Step 1: Rewrite `IndividualPlanPage.tsx`**

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client.js'
import type { FeedbackStatus } from '@training-plan/shared'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface IndPlanDay {
  id: string
  dayOfWeek: number
  rawText: string | null
  sessions: Array<{
    id: string
    feedback: { status: FeedbackStatus; rpe: number; comment: string | null } | null
  }>
}

interface IndPlan {
  id: string
  weekStart: string
  notes: string | null
  days: IndPlanDay[]
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL: 'Частково',
  SKIPPED: 'Пропущено',
}

export function IndividualPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [feedbackForm, setFeedbackForm] = useState<{ status?: FeedbackStatus; rpe: number; comment: string }>({ rpe: 5, comment: '' })

  const { data: plans, isLoading } = useQuery<IndPlan[]>({
    queryKey: ['individual-plans'],
    queryFn: () => api.get('/my/plans/individual').then((r) => r.data),
  })

  const plan = plans?.find((p) => p.id === id)

  const submitWithFeedback = useMutation({
    mutationFn: ({ dayId, date }: { dayId: string; date: string }) =>
      api.post('/my/sessions/with-feedback', {
        individualPlanDayId: dayId,
        date,
        status: feedbackForm.status,
        rpe: feedbackForm.rpe,
        comment: feedbackForm.comment || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['individual-plans'] })
      qc.invalidateQueries({ queryKey: ['week'] })
      setActiveDayId(null)
    },
  })

  if (isLoading) return <div className="page">Завантаження...</div>
  if (!plan) return <div className="page">План не знайдено</div>

  const weekStart = new Date(plan.weekStart)
  const dateForDay = (dow: number) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dow - 1)
    return d.toISOString().split('T')[0]
  }

  return (
    <div className="page">
      <button
        className="btn-secondary"
        style={{ fontSize: '0.875rem', marginBottom: '1rem', padding: '0.25rem 0.75rem' }}
        onClick={() => navigate(-1)}
      >
        ← Назад
      </button>

      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>
        Індивідуальний план
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Тиждень {plan.weekStart.slice(0, 10)}
      </p>

      {plan.notes && (
        <div className="card" style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
          {plan.notes}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {DAY_NAMES.map((name, idx) => {
          const dow = idx + 1
          const day = plan.days.find((d) => d.dayOfWeek === dow)
          const session = day?.sessions[0]
          const isActive = activeDayId === day?.id
          const date = dateForDay(dow)

          if (!day?.rawText) {
            return (
              <div key={dow} className="card" style={{ opacity: 0.4, display: 'flex', gap: '1rem' }}>
                <strong style={{ width: 30 }}>{name}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Відпочинок</span>
              </div>
            )
          }

          return (
            <div
              key={dow}
              className="card"
              style={{
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
                cursor: session?.feedback ? 'default' : 'pointer',
                border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
              onClick={() => {
                if (!session?.feedback && !isActive) {
                  setActiveDayId(day.id)
                  setFeedbackForm({ rpe: 5, comment: '', status: undefined })
                }
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <strong style={{ width: 30, flexShrink: 0 }}>{name}</strong>
                <div style={{ flex: 1, whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{day.rawText}</div>
                {session?.feedback && (
                  <span className={`badge badge-${session.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`} style={{ flexShrink: 0 }}>
                    {STATUS_LABELS[session.feedback.status]}
                  </span>
                )}
                {!session?.feedback && !isActive && (
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-primary)', flexShrink: 0 }}>Залишити відгук →</span>
                )}
              </div>

              {session?.feedback && session.feedback.comment && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', paddingLeft: 46 }}>
                  RPE: {session.feedback.rpe} · {session.feedback.comment}
                </div>
              )}
              {session?.feedback && !session.feedback.comment && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', paddingLeft: 46 }}>
                  RPE: {session.feedback.rpe}
                </div>
              )}

              {/* Inline feedback form */}
              {isActive && (
                <div
                  style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="form-group">
                    <label style={{ fontWeight: 600 }}>Як пройшло?</label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                      {(['COMPLETED', 'PARTIAL', 'SKIPPED'] as FeedbackStatus[]).map((s) => (
                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`status-${day.id}`}
                            checked={feedbackForm.status === s}
                            onChange={() => setFeedbackForm((f) => ({ ...f, status: s }))}
                            style={{ width: 'auto' }}
                          />
                          {STATUS_LABELS[s]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>RPE (навантаження): {feedbackForm.rpe}</label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={feedbackForm.rpe}
                      onChange={(e) => setFeedbackForm((f) => ({ ...f, rpe: +e.target.value }))}
                      style={{ padding: 0, border: 'none' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Коментар (необов'язково)</label>
                    <textarea
                      rows={2}
                      value={feedbackForm.comment}
                      onChange={(e) => setFeedbackForm((f) => ({ ...f, comment: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn-primary"
                      disabled={!feedbackForm.status || submitWithFeedback.isPending}
                      onClick={() => submitWithFeedback.mutate({ dayId: day.id, date })}
                    >
                      {submitWithFeedback.isPending ? 'Збереження...' : 'Зберегти відгук'}
                    </button>
                    <button className="btn-secondary" onClick={() => setActiveDayId(null)}>
                      Скасувати
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open an individual plan → back button visible. Click a day → feedback form opens inline (no "Розпочати" step). Submit → badge appears. Navigate back.

---

## Task 8: Frontend — FeedbackSummaryPage traffic lights

**Files:**
- Modify: `apps/web/src/pages/trainer/FeedbackSummaryPage.tsx`
- Modify: `apps/api/src/routes/plans.ts` (extend feedback endpoint to include all team members)

**Traffic light logic:**
- Green dot: COMPLETED
- Yellow dot: PARTIAL, or session exists but no feedback
- Red dot: SKIPPED, or RPE >= 9

The current feedback endpoint only returns athletes who started a session. We need to also show team members who have not started at all (pending = yellow).

- [ ] **Step 1: Extend `GET /plans/:id/feedback` in `apps/api/src/routes/plans.ts`**

Find the `/:id/feedback` route handler and replace it:

```typescript
// Get plan feedback (trainer) - includes all team members
fastify.get(
  '/:id/feedback',
  { preHandler: fastify.requireRole(['TRAINER', 'ADMIN']) },
  async (request, reply) => {
    const { id } = request.params as { id: string }

    // Check if this is a group plan
    const plan = await fastify.prisma.trainingPlan.findUnique({
      where: { id },
      include: { team: { include: { members: { include: { athlete: { select: { id: true, name: true, email: true } } } } } } },
    })

    if (plan) {
      const sessions = await fastify.prisma.athleteSession.findMany({
        where: { planId: id },
        include: {
          athlete: { select: { id: true, name: true, email: true } },
          exerciseGroup: { select: { id: true, name: true } },
          feedback: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      // Build map of athleteId -> session
      const sessionMap = new Map(sessions.map((s) => [s.athleteId, s]))

      // Include all team members, marking those without sessions
      const teamMembers = plan.team?.members ?? []
      const result = teamMembers.map((member) => {
        const session = sessionMap.get(member.athleteId)
        return {
          id: session?.id ?? `pending-${member.athleteId}`,
          athlete: member.athlete,
          exerciseGroup: session?.exerciseGroup ?? null,
          date: session?.date ?? null,
          feedback: session?.feedback ?? null,
          hasSession: !!session,
        }
      })

      // Add athletes who have a session but aren't team members (edge case)
      for (const session of sessions) {
        if (!teamMembers.find((m) => m.athleteId === session.athleteId)) {
          result.push({
            id: session.id,
            athlete: session.athlete,
            exerciseGroup: session.exerciseGroup,
            date: session.date,
            feedback: session.feedback,
            hasSession: true,
          })
        }
      }

      return result
    }

    // Individual plan fallback
    const dayIds = (
      await fastify.prisma.individualPlanDay.findMany({
        where: { planId: id },
        select: { id: true },
      })
    ).map((d) => d.id)

    return fastify.prisma.athleteSession.findMany({
      where: { individualPlanDayId: { in: dayIds } },
      include: {
        athlete: { select: { id: true, name: true, email: true } },
        individualPlanDay: true,
        feedback: true,
      },
    })
  },
)
```

- [ ] **Step 2: Rewrite `FeedbackSummaryPage.tsx`**

```tsx
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.js'

interface FeedbackItem {
  id: string
  athlete: { id: string; name: string; email: string }
  exerciseGroup: { id: string; name: string } | null
  date: string | null
  feedback: { status: string; rpe: number; comment: string | null } | null
  hasSession?: boolean
}

function TrafficDot({ status, rpe, hasSession }: { status?: string; rpe?: number; hasSession?: boolean }) {
  let color = '#e5e7eb' // grey = no session
  let title = 'Не розпочато'

  if (hasSession && !status) {
    color = '#fbbf24' // yellow = started, no feedback
    title = 'Розпочато, без відгуку'
  } else if (status === 'SKIPPED') {
    color = '#ef4444' // red
    title = 'Пропущено'
  } else if ((rpe ?? 0) >= 9) {
    // High RPE overrides COMPLETED→red, PARTIAL→red
    color = '#ef4444'
    title = 'Висока RPE'
  } else if (status === 'COMPLETED') {
    color = '#22c55e' // green
    title = 'Виконано'
  } else if (status === 'PARTIAL') {
    color = '#f59e0b' // yellow
    title = 'Частково'
  }

  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 10, height: 10,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

export function FeedbackSummaryPage() {
  const { id } = useParams<{ id: string }>()

  const { data: sessions = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback', id],
    queryFn: () => api.get(`/plans/${id}/feedback`).then((r) => r.data),
  })

  const withFeedback = sessions.filter((s) => s.feedback)
  const avgRpe = withFeedback.length
    ? (withFeedback.reduce((sum, s) => sum + (s.feedback?.rpe ?? 0), 0) / withFeedback.length).toFixed(1)
    : null

  const completed = withFeedback.filter((s) => s.feedback?.status === 'COMPLETED').length
  const partial = withFeedback.filter((s) => s.feedback?.status === 'PARTIAL').length
  const skipped = withFeedback.filter((s) => s.feedback?.status === 'SKIPPED').length

  return (
    <div className="page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/trainer" style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          ← Назад до панелі
        </Link>
      </div>
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Відгуки спортсменів
      </h2>

      {isLoading && <p style={{ color: 'var(--color-text-muted)' }}>Завантаження...</p>}

      {!isLoading && sessions.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Ще немає відгуків</p>
      )}

      {sessions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {avgRpe && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Середній RPE</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{avgRpe}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Відповіли</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{withFeedback.length} / {sessions.length}</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {completed > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> {completed}</span>}
              {partial > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> {partial}</span>}
              {skipped > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> {skipped}</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sessions.map((session) => (
          <div key={session.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <TrafficDot
              status={session.feedback?.status}
              rpe={session.feedback?.rpe}
              hasSession={session.hasSession}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{session.athlete.name}</span>
                  {session.exerciseGroup && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginLeft: '0.5rem' }}>
                      {session.exerciseGroup.name}
                    </span>
                  )}
                </div>
                {session.feedback && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`badge badge-${session.feedback.status.toLowerCase() as 'completed' | 'partial' | 'skipped'}`}>
                      {session.feedback.status === 'COMPLETED' ? 'Виконано' : session.feedback.status === 'PARTIAL' ? 'Частково' : 'Пропущено'}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>RPE {session.feedback.rpe}</span>
                  </div>
                )}
                {!session.feedback && !session.hasSession && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Не розпочато</span>
                )}
                {!session.feedback && session.hasSession && (
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Без відгуку</span>
                )}
              </div>
              {session.feedback?.comment && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {session.feedback.comment}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Open Відгуки for a plan → all team members listed with traffic dots. Green for completed, yellow for partial/no feedback, red for skipped/high RPE.

---

## Task 9: Frontend — Volume badges in WeeklyCalendarPage + VolumeChart

**Files:**
- Modify: `apps/web/src/pages/WeeklyCalendarPage.tsx`

**Changes:**
- Import `calcVolumeKm` from `../utils/volume.js`
- Extend the existing `ExerciseGroup` interface (line 11) to include `parsedData?: unknown` — required for TypeScript to allow accessing `parsedData` on group objects
- Show total week volume in the weekly summary card
- Add recharts `BarChart` below the calendar showing last 8 weeks of load
- **Note:** Volume summary only covers group plans (individual plan days don't have parsedData structure), so athletes on individual-only plans will see no volume. This is a known limitation.

Note: recharts must be installed (Task 5) before this task.

- [ ] **Step 0: Extend `ExerciseGroup` interface in `WeeklyCalendarPage.tsx`**

Find the existing interface at the top of the file:
```tsx
interface ExerciseGroup { id: string; name: string }
```
Replace with:
```tsx
interface ExerciseGroup { id: string; name: string; parsedData?: unknown }
```

- [ ] **Step 1: Add volume badge to group plan cards and weekly summary**

In `WeeklyCalendarPage.tsx`, add this import at the top:
```tsx
import { calcVolumeKm } from '../utils/volume.js'
```

In the weekly summary card section (around line 108), after avg RPE, add total week volume:

```tsx
const weekVolumeKm = groupPlans.reduce((sum, plan) => {
  const session = plan.sessions[0]
  if (!session?.exerciseGroupId) return sum
  const group = plan.exerciseGroups.find((g) => g.id === session.exerciseGroupId)
  return sum + (group ? calcVolumeKm(group.parsedData) : 0)
}, 0)
```

Add inside the summary card div:
```tsx
{weekVolumeKm > 0 && (
  <span style={{ color: '#1e40af' }}>
    Обсяг: <strong>{Math.round(weekVolumeKm * 10) / 10} км</strong>
  </span>
)}
```

On group plan cards (the link block, line ~167), add volume badge next to exercise group tags:
```tsx
{plan.exerciseGroups.map((g) => {
  const vol = calcVolumeKm(g.parsedData)
  return (
    <span key={g.id} style={{ fontSize: '0.6875rem', background: '#dbeafe', color: '#1e40af', padding: '0.125rem 0.5rem', borderRadius: 9999 }}>
      {g.name}{vol > 0 ? ` ~${vol}км` : ''}
    </span>
  )
})}
```

- [ ] **Step 2: Add VolumeChart component below the calendar**

Add to `WeeklyCalendarPage.tsx` (after the existing imports):

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
```

Add `VolumeChart` component definition before `WeeklyCalendarPage`:

```tsx
function VolumeChart() {
  const { data: volumeData = [] } = useQuery<Array<{ week: string; volume: number }>>({
    queryKey: ['volume-stats'],
    queryFn: () => api.get('/my/stats/volume?weeks=8').then((r) => r.data),
  })

  if (volumeData.length === 0) return null

  const chartData = volumeData.map((d) => ({
    week: d.week.slice(5).replace('-', '.'),
    volume: d.volume,
  }))

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Тижневий обсяг (км)</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${v} км`, 'Обсяг']} />
          <Bar dataKey="volume" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Add `<VolumeChart />` at the bottom of `WeeklyCalendarPage` return JSX, after the days grid.

- [ ] **Step 3: Verify in browser**

Main page shows volume next to exercise group tags (if parsedData has distance). Weekly summary shows total km. Below the calendar a bar chart renders with 8 weeks of load.

---

## Task 10: Frontend — Structured workout display component

**Files:**
- Create: `apps/web/src/components/WorkoutCard.tsx`
- Modify: `apps/web/src/pages/GroupPlanDetailPage.tsx` (use WorkoutCard instead of rawText)

Replace the raw `rawText` dump with a structured view using `parsedData`. Falls back to raw text when parsedData is null (parser couldn't parse the format).

- [ ] **Step 1: Create `apps/web/src/components/WorkoutCard.tsx`**

```tsx
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

  // Fall back to raw text if no structured data
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
          {/* Sets × distance */}
          {(block.sets || block.distance) && (
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              {block.sets && `${block.sets}×`}{block.distance ?? block.duration}
            </span>
          )}

          {/* Rest */}
          {block.rest && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
              відп. {block.rest}
            </span>
          )}

          {/* Series */}
          {block.series && block.series > 1 && (
            <span style={{ background: '#f3f4f6', borderRadius: 4, padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}>
              {block.series} серії
              {block.seriesRest && ` · між серіями ${block.seriesRest}`}
            </span>
          )}

          {/* Intensity */}
          {block.intensity && (
            <span style={{ color: '#7c3aed', fontSize: '0.75rem', fontWeight: 600 }}>
              {block.intensity}
            </span>
          )}
        </div>
      ))}

      {/* Pace info */}
      {parsed.pace && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#1e40af', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {parsed.pace.general && <span>Пейс: {parsed.pace.general}</span>}
          {parsed.pace.men && <span>хлопці: {parsed.pace.men}</span>}
          {parsed.pace.women && <span>дівчата: {parsed.pace.women}</span>}
        </div>
      )}

      {/* Notes */}
      {parsed.notes && (
        <div style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {parsed.notes}
        </div>
      )}

      {/* Volume badge */}
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
```

- [ ] **Step 2: Use `WorkoutCard` in `GroupPlanDetailPage.tsx`**

Add import:
```tsx
import { WorkoutCard } from '../components/WorkoutCard.js'
```

Replace the rawText line inside the group card:
```tsx
// Old:
<div style={{ whiteSpace: 'pre-line', fontSize: '0.875rem' }}>{group.rawText}</div>

// New:
<WorkoutCard rawText={group.rawText} parsedData={group.parsedData} />
```

Remove the separate `volumeKm` badge above the group name (already rendered inside WorkoutCard now):
```tsx
// Remove this block — WorkoutCard renders its own volume badge:
// {volumeKm > 0 && (
//   <span style={{ ...}}>~{volumeKm} км</span>
// )}
```

- [ ] **Step 3: Verify in browser**

Open a group plan that has parsedData (plans created after seed or after using parse-workout). The raw text `4*800м через 3 хв...` should show as a formatted card with `4×800м | відп. 3 хв | 2 серії`. Plans where parser returned null still show raw text. Volume badge appears inside the card.

---

## Verification Checklist

- [ ] `GET /my/plans/group/:id` returns plan with sessions for the authenticated athlete
- [ ] `POST /my/sessions/with-feedback` creates session + feedback atomically (test with Prisma transaction — if feedback fails, session rolls back)
- [ ] `GET /my/stats/volume` returns volume grouped by week
- [ ] GroupPlanDetailPage: back button works, select group → inline feedback → submit → confirmation card (no border-left), page invalidates correctly
- [ ] IndividualPlanPage: back button works, click day → inline feedback → submit → badge appears
- [ ] FeedbackSummaryPage: all team members shown (even no-session), traffic dots colored correctly
- [ ] WorkoutCard renders structured view (sets/distance/pace/volume) when parsedData present, falls back to rawText otherwise
- [ ] Volume badges show on exercise group tags in WeeklyCalendarPage
- [ ] VolumeChart renders below the weekly calendar
- [ ] No TypeScript errors in any modified file
