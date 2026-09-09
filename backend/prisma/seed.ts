import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main() {
  const prisma = new PrismaClient();
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'changeme123456';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 chars');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, passwordHash: hash, role: 'admin' } });
    console.log('Admin seeded:', email);
  } else {
    console.log('Admin already exists');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
