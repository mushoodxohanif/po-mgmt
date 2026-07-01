import "dotenv/config";

import { prisma } from "@/lib/db";
import { parseDescriptionToSpecs } from "@/lib/services/part-specs";

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ id: number; description: string | null }>
  >`
    SELECT id, description
    FROM parts
    WHERE description IS NOT NULL
      AND description <> ''
      AND (specs = '{}'::jsonb OR specs IS NULL)
  `;

  let updated = 0;

  for (const part of rows) {
    if (!part.description) continue;
    const specs = parseDescriptionToSpecs(part.description);
    if (Object.keys(specs).length === 0) continue;

    await prisma.part.update({
      where: { id: part.id },
      data: { specs },
    });
    updated++;
  }

  console.log(`Backfilled specs for ${updated} of ${rows.length} parts.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
