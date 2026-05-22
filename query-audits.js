const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.audit.findMany({ select: { id: true, clientId: true, createdAt: true }, take: 10 })
  .then(r => { console.log(JSON.stringify(r, null, 2)); })
  .catch(e => console.error(e))
  .finally(() => p.$disconnect());
