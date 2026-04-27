import type { FastifyInstance } from 'fastify'
import { INVITE_CODE_CHARS, INVITE_CODE_LENGTH, INVITE_CODE_MAX_RETRIES } from './constants.js'

export async function generateUniqueInviteCode(fastify: FastifyInstance): Promise<string> {
  for (let attempt = 0; attempt < INVITE_CODE_MAX_RETRIES; attempt++) {
    const code = Array.from(
      { length: INVITE_CODE_LENGTH },
      () => INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)],
    ).join('')

    const existing = await fastify.prisma.user.findUnique({ where: { inviteCode: code } })
    if (!existing) return code
  }

  throw new Error('Failed to generate unique invite code')
}
