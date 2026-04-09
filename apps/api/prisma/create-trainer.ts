import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const email = 'lupewkalupu@gmail.com'
  const name = 'Наталія Лупу'
  const password = process.argv[2] ?? 'changeme123'

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`User already exists:`)
    console.log(`  id:    ${existing.id}`)
    console.log(`  email: ${existing.email}`)
    console.log(`  role:  ${existing.role}`)
    console.log(`\nWEBHOOK_TRAINER_ID=${existing.id}`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase()

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), name, passwordHash, role: 'TRAINER', inviteCode },
  })

  console.log(`Trainer created:`)
  console.log(`  id:         ${user.id}`)
  console.log(`  email:      ${user.email}`)
  console.log(`  inviteCode: ${user.inviteCode}`)
  console.log(`\nWEBHOOK_TRAINER_ID=${user.id}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
