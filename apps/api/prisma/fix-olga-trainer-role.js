import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TARGET_EMAIL = 'olgaiarotska75@gmail.com'
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 6
const INVITE_CODE_MAX_RETRIES = 10

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < INVITE_CODE_MAX_RETRIES; attempt++) {
    const code = Array.from(
      { length: INVITE_CODE_LENGTH },
      () => INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)],
    ).join('')

    const existing = await prisma.user.findUnique({ where: { inviteCode: code } })
    if (!existing) return code
  }

  throw new Error('Failed to generate unique invite code')
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      inviteCode: true,
      trainerId: true,
    },
  })

  if (!user) {
    throw new Error(`User not found: ${TARGET_EMAIL}`)
  }

  const inviteCode = user.inviteCode ?? await generateUniqueInviteCode()
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      role: 'TRAINER',
      inviteCode,
      trainerId: null,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      inviteCode: true,
      trainerId: true,
      isActive: true,
    },
  })

  console.log('User updated:')
  console.log(`  id:         ${updated.id}`)
  console.log(`  email:      ${updated.email}`)
  console.log(`  name:       ${updated.name}`)
  console.log(`  role:       ${updated.role}`)
  console.log(`  inviteCode: ${updated.inviteCode}`)
  console.log(`  trainerId:  ${updated.trainerId}`)
  console.log(`  isActive:   ${updated.isActive}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
