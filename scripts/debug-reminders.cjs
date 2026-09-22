const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const donors = await p.donor.findMany({
    where: { OR: [{ name: { contains: "Castilla" } }, { email: { contains: "orlandojs" } }] },
    include: { reminderLogs: { orderBy: { sentAt: "desc" }, take: 10 } },
  });
  console.log(JSON.stringify(donors, null, 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
