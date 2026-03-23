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
      data: { email: 'trainer@test.com', name: 'Олексій Тренер', passwordHash, role: 'TRAINER' },
    })
    console.log('Trainer created: trainer@test.com')
  } else {
    console.log('Trainer exists: trainer@test.com')
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
        u = await prisma.user.create({ data: { email: ae, name, passwordHash, role: 'ATHLETE' } })
        console.log(`Athlete created: ${ae}`)
      }
      return u
    }),
  )

  // ── Track&Speed team ───────────────────────────────────
  let team = await prisma.trainerTeam.findFirst({ where: { trainerId: trainer.id, name: 'Track&Speed' } })
  if (!team) {
    team = await prisma.trainerTeam.create({ data: { trainerId: trainer.id, name: 'Track&Speed' } })
    console.log('Team Track&Speed created')
  }

  // Add athletes to team
  for (const athlete of athletes) {
    await prisma.teamMember.upsert({
      where: { teamId_athleteId: { teamId: team.id, athleteId: athlete.id } },
      create: { teamId: team.id, athleteId: athlete.id },
      update: {},
    })
  }
  console.log('Athletes added to team')

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
          teamId: team.id,
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

  console.log('\nSeed complete.')
  console.log('Trainer:  trainer@test.com / changeme123')
  console.log('Athletes: ivan.koval@test.com / olena.bondar@test.com (password: changeme123)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
