import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { parseWorkout } from '../src/parsers/workout.js'

const prisma = new PrismaClient()

function getMonday(offset = 0): Date {
  const today = new Date()
  const day = today.getDay() === 0 ? 7 : today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - day + 1 + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set')
    process.exit(1)
  }

  // ── Admin ──────────────────────────────────────────────
  let admin = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 12)
    admin = await prisma.user.create({
      data: { email: email.toLowerCase(), name: 'Admin', passwordHash, role: 'ADMIN' },
    })
    console.log(`Admin created: ${email}`)
  } else {
    console.log(`Admin exists: ${email}`)
  }

  // ── Trainer ────────────────────────────────────────────
  let trainer = await prisma.user.findFirst({ where: { email: { equals: 'trainer@test.com', mode: 'insensitive' } } })
  if (!trainer) {
    const passwordHash = await bcrypt.hash('changeme123', 10)
    trainer = await prisma.user.create({
      data: { email: 'trainer@test.com', name: 'Олексій Тренер', passwordHash, role: 'TRAINER', inviteCode: 'TEST01' },
    })
    console.log('Trainer created: trainer@test.com (code: TEST01)')
  } else {
    // Ensure existing trainer has an invite code
    if (!trainer.inviteCode) {
      trainer = await prisma.user.update({ where: { id: trainer.id }, data: { inviteCode: 'TEST01' } })
      console.log('Trainer invite code set: TEST01')
    } else {
      console.log(`Trainer exists: trainer@test.com (code: ${trainer.inviteCode})`)
    }
  }

  // ── Test athletes ──────────────────────────────────────
  const athletesSeed = [
    { email: 'ivan.koval@test.com', name: 'Іван Коваль' },
    { email: 'olena.bondar@test.com', name: 'Олена Бондар' },
  ]
  const athletes = await Promise.all(
    athletesSeed.map(async ({ email: ae, name }) => {
      let u = await prisma.user.findFirst({ where: { email: { equals: ae, mode: 'insensitive' } } })
      if (!u) {
        const passwordHash = await bcrypt.hash('changeme123', 10)
        u = await prisma.user.create({ data: { email: ae, name, passwordHash, role: 'ATHLETE', trainerId: trainer!.id } })
        console.log(`Athlete created: ${ae}`)
      } else if (!u.trainerId) {
        u = await prisma.user.update({ where: { id: u.id }, data: { trainerId: trainer!.id } })
        console.log(`Athlete linked to trainer: ${ae}`)
      }
      return u
    }),
  )

  // ── Group plans: this week + next week ─────────────────
  const groupPlanDefs = [
    // This week
    { daysOffset: 0, title: 'Швидкісне тренування', groups: [
        { name: 'Витривалість 1', rawText: '3*1000м через 3 хв відпочинку. Пейс 3:20-3:30 хлопці 3:50-4:00 дівчата' },
        { name: 'Спринт 1', rawText: '6*100м через 2 хв відпочинку. Темп максимальний' },
      ],
    },
    { daysOffset: 2, title: 'Аеробне тренування', groups: [
        { name: 'Витривалість 1', rawText: '5*800м через 2 хв відпочинку. 3 серії між серіями 5 хв. Пейс 4:00-4:10' },
      ],
    },
    { daysOffset: 4, title: 'Змішане', groups: [
        { name: 'Витривалість 1', rawText: '4*400м через 90 сек. Пейс 1:20 хлопці 1:35 дівчата' },
        { name: 'Спринт 2', rawText: '8*60м з низького старту через 90 сек' },
      ],
    },
    // Next week
    { daysOffset: 7, title: 'Темпове тренування', groups: [
        { name: 'Витривалість 1', rawText: '2*2000м через 5 хв відпочинку. Пейс 3:40-3:50' },
      ],
    },
    { daysOffset: 9, title: 'Швидкісна витривалість', groups: [
        { name: 'Витривалість 1', rawText: '5*600м через 3 хв відпочинку. Пейс 1:55-2:05' },
        { name: 'Спринт 1', rawText: '4*150м через 3 хв. Темп 90%' },
      ],
    },
    { daysOffset: 11, title: 'Відновлення + швидкість', groups: [
        { name: 'Витривалість 2', rawText: 'Крос 20 хв легко. Пейс 5:00-5:30' },
        { name: 'Спринт 1', rawText: '6*80м прискорень через 2 хв' },
      ],
    },
  ]

  const thisMonday = getMonday(0)
  for (const def of groupPlanDefs) {
    const date = addDays(thisMonday, def.daysOffset)
    const existing = await prisma.trainingPlan.findFirst({
      where: { trainerId: trainer.id, date, title: def.title, type: 'GROUP' },
    })
    if (!existing) {
      await prisma.trainingPlan.create({
        data: {
          trainerId: trainer.id,
          date,
          type: 'GROUP',
          title: def.title,
          exerciseGroups: {
            create: def.groups.map((g, i) => ({
              name: g.name,
              rawText: g.rawText,
              order: i,
              parsedData: parseWorkout(g.rawText) ?? undefined,
            })),
          },
        },
      })
      console.log(`Group plan created: ${def.title} (${date.toISOString().slice(0, 10)})`)
    }
  }

  // ── Individual plans for athlete[0]: this week + next week ─
  const indPlanDefs = [
    {
      weekOffset: 0,
      days: [
        { dow: 1, text: '3*1000м через 3 хв відпочинку\nПейс 3:20-3:30\nЗосередитись на техніці бігу' },
        { dow: 3, text: '5*800м через 2 хв\n3 серії, між серіями 5 хв\nПейс 4:00-4:10' },
        { dow: 5, text: '4*400м через 90 сек\nПейс 1:20-1:25\nМаксимальна концентрація' },
        { dow: 6, text: 'Відновлювальний крос 30 хв\nПейс 5:30-6:00 (легко)' },
      ],
    },
    {
      weekOffset: 1,
      days: [
        { dow: 1, text: '2*2000м через 5 хв\nПейс 3:40-3:50' },
        { dow: 2, text: 'Техніка + стрибки\n10*30м стрибки через 2 хв\n8*60м прискорень' },
        { dow: 4, text: '5*600м через 3 хв\nПейс 1:55-2:05' },
        { dow: 6, text: 'Легкий крос 25 хв + розтяжка' },
      ],
    },
  ]

  for (const def of indPlanDefs) {
    const weekStart = getMonday(def.weekOffset)
    const existing = await prisma.individualPlan.findFirst({
      where: { trainerId: trainer.id, athleteId: athletes[0].id, weekStart },
    })
    if (!existing) {
      await prisma.individualPlan.create({
        data: {
          trainerId: trainer.id,
          athleteId: athletes[0].id,
          weekStart,
          days: { create: def.days.map((d) => ({ dayOfWeek: d.dow, rawText: d.text })) },
        },
      })
      console.log(`Individual plan created for ${athletes[0].name} week+${def.weekOffset}`)
    }
  }

  // ── Workout Templates ──────────────────────────────────
  const existingTemplates = await prisma.workoutTemplate.count({ where: { creatorId: trainer.id } })
  if (existingTemplates === 0) {
    const templates = [
      // ── RUNNING ────────────────────────────────────────
      {
        name: 'Розминка 10 хв + заминка',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Базова розминка і заминка для будь-якого тренування',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Розминка' },
          { type: 'ACTIVE', durationUnit: 'OPEN', targetUnit: 'OPEN', name: 'Основна частина' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка' },
        ],
      },
      {
        name: 'Інтервали 10×400м',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Класичне швидкісне тренування. Пейс: 3:00-3:30/км',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 900, targetUnit: 'OPEN', name: 'Розминка 15 хв' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 10 },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 400, targetUnit: 'PACE', targetFrom: 180, targetTo: 210, name: '400м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 90, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      {
        name: 'Інтервали 5×1000м',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Тренування на порозі. Пейс: 3:20-3:50/км',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 900, targetUnit: 'OPEN', name: 'Розминка 15 хв' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 5 },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 1000, targetUnit: 'PACE', targetFrom: 200, targetTo: 230, name: '1000м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 180, targetUnit: 'OPEN', name: 'Відпочинок 3 хв' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка' },
        ],
      },
      {
        name: 'Темповий біг 20 хв',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Безперервний темповий біг. Пейс: 3:45-4:10/км',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Розминка 10 хв' },
          { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 1200, targetUnit: 'PACE', targetFrom: 225, targetTo: 250, name: 'Темп 20 хв' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      {
        name: 'Пірамідні інтервали',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: '200-400-600-800-600-400-200м. Класична піраміда',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 900, targetUnit: 'OPEN', name: 'Розминка 15 хв' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 200, targetUnit: 'PACE', targetFrom: 165, targetTo: 185, name: '200м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 60, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 400, targetUnit: 'PACE', targetFrom: 180, targetTo: 200, name: '400м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 90, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 600, targetUnit: 'PACE', targetFrom: 190, targetTo: 210, name: '600м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 120, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 800, targetUnit: 'PACE', targetFrom: 200, targetTo: 220, name: '800м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 180, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 600, targetUnit: 'PACE', targetFrom: 190, targetTo: 210, name: '600м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 120, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 400, targetUnit: 'PACE', targetFrom: 180, targetTo: 200, name: '400м' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 90, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 200, targetUnit: 'PACE', targetFrom: 165, targetTo: 185, name: '200м' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      {
        name: 'Легкий відновлювальний крос 30 хв',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Відновлення після важких тренувань. Пейс: 5:30-6:30/км',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 300, targetUnit: 'OPEN', name: 'Ходьба 5 хв' },
          { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 1800, targetUnit: 'PACE', targetFrom: 330, targetTo: 390, name: 'Легкий крос' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 300, targetUnit: 'OPEN', name: 'Ходьба + розтяжка' },
        ],
      },
      {
        name: 'Фартлек 40 хв',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Вільні прискорення. 5 хв легко → 2 хв швидко × 6',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Розминка 10 хв' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 6 },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 300, targetUnit: 'PACE', targetFrom: 300, targetTo: 360, name: 'Легко 5 хв' },
          { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 120, targetUnit: 'PACE', targetFrom: 210, targetTo: 240, name: 'Швидко 2 хв' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      {
        name: 'Спринти 8×100м',
        sport: 'RUNNING' as const,
        isPublic: true,
        notes: 'Максимальна швидкість. Повний відпочинок між повторами',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 900, targetUnit: 'OPEN', name: 'Розминка 15 хв' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 8 },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 100, targetUnit: 'OPEN', name: '100м максимально' },
          { type: 'REST', durationUnit: 'TIME', durationValue: 180, targetUnit: 'OPEN', name: 'Відпочинок 3 хв' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка' },
        ],
      },
      // ── CYCLING ────────────────────────────────────────
      {
        name: 'Велосипед — аеробна база 60 хв',
        sport: 'CYCLING' as const,
        isPublic: true,
        notes: 'Рівномірний аеробний темп для розвитку бази',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Розкочування 10 хв' },
          { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 2400, targetUnit: 'OPEN', name: 'Аеробний темп 40 хв' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      {
        name: 'Велосипед — інтервали 5×5 хв',
        sport: 'CYCLING' as const,
        isPublic: true,
        notes: 'VO2max інтервали. 5 хв зусилля / 5 хв відновлення',
        steps: [
          { type: 'WARMUP', durationUnit: 'TIME', durationValue: 900, targetUnit: 'OPEN', name: 'Розкочування 15 хв' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 5 },
          { type: 'ACTIVE', durationUnit: 'TIME', durationValue: 300, targetUnit: 'OPEN', name: 'Зусилля 5 хв' },
          { type: 'RECOVERY', durationUnit: 'TIME', durationValue: 300, targetUnit: 'OPEN', name: 'Відновлення 5 хв' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'TIME', durationValue: 600, targetUnit: 'OPEN', name: 'Заминка 10 хв' },
        ],
      },
      // ── SWIMMING ────────────────────────────────────────
      {
        name: 'Плавання — аеробна витривалість',
        sport: 'SWIMMING' as const,
        isPublic: true,
        notes: '10×100м з відпочинком 20 сек. Рівний темп',
        steps: [
          { type: 'WARMUP', durationUnit: 'DISTANCE', durationValue: 200, targetUnit: 'OPEN', name: 'Розминка 200м' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 10 },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 100, targetUnit: 'OPEN', name: '100м' },
          { type: 'REST', durationUnit: 'TIME', durationValue: 20, targetUnit: 'OPEN', name: 'Відпочинок' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'DISTANCE', durationValue: 200, targetUnit: 'OPEN', name: 'Заминка 200м' },
        ],
      },
      {
        name: 'Плавання — швидкісні 8×50м',
        sport: 'SWIMMING' as const,
        isPublic: true,
        notes: 'Спринти 50м з повним відновленням',
        steps: [
          { type: 'WARMUP', durationUnit: 'DISTANCE', durationValue: 300, targetUnit: 'OPEN', name: 'Розминка 300м' },
          { type: 'REPEAT_BEGIN', durationUnit: 'OPEN', targetUnit: 'OPEN', repeatCount: 8 },
          { type: 'ACTIVE', durationUnit: 'DISTANCE', durationValue: 50, targetUnit: 'OPEN', name: '50м максимально' },
          { type: 'REST', durationUnit: 'TIME', durationValue: 60, targetUnit: 'OPEN', name: 'Відпочинок 60 сек' },
          { type: 'REPEAT_END', durationUnit: 'OPEN', targetUnit: 'OPEN' },
          { type: 'COOLDOWN', durationUnit: 'DISTANCE', durationValue: 200, targetUnit: 'OPEN', name: 'Заминка' },
        ],
      },
    ]

    for (const t of templates) {
      await prisma.workoutTemplate.create({
        data: {
          creatorId: trainer.id,
          name: t.name,
          sport: t.sport,
          steps: t.steps as import('@prisma/client').Prisma.InputJsonValue,
          notes: t.notes,
          isPublic: t.isPublic,
        },
      })
      console.log(`Template created: ${t.name}`)
    }
  } else {
    console.log(`Templates already seeded (${existingTemplates} found)`)
  }

  console.log('\nSeed complete.')
  console.log('Trainer:  trainer@test.com / changeme123')
  console.log('Athletes: ivan.koval@test.com / olena.bondar@test.com (password: changeme123)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
