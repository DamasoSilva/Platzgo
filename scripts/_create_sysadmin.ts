import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "damaso.neto@hotmail.com";
  const password = "12345678";
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      password_hash: hash,
      role: "SYSADMIN",
      emailVerified: new Date(),
      name: "Damaso Neto",
    },
    create: {
      email,
      password_hash: hash,
      role: "SYSADMIN",
      emailVerified: new Date(),
      name: "Damaso Neto",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
