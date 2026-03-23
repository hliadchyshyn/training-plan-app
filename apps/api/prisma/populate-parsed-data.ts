import { PrismaClient } from '@prisma/client'
import { parseWorkout } from '../src/parsers/workout.js'

const prisma = new PrismaClient()

async function main() {
  const all = await prisma.exerciseGroup.findMany({ select: { id: true, rawText: true, parsedData: true } })
  const groups = all.filter((g) => g.parsedData === null)

  console.log(`Updating ${groups.length} exercise groups...`)

  for (const group of groups) {
    const parsed = parseWorkout(group.rawText)
    if (parsed) {
      await prisma.exerciseGroup.update({
        where: { id: group.id },
        data: { parsedData: parsed },
      })
    }
  }

  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
