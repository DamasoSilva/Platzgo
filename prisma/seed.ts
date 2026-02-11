import "dotenv/config";

import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { Role, SportType } from "../src/generated/prisma/enums";
import { slugify } from "../src/lib/utils/slug";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");

  const seedDemoData = process.env.SEED_DEMO_DATA === "1";

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const sysadminEmail = process.env.SEED_SYSADMIN_EMAIL ?? "sysadmin@playhub.local";
    const sysadminPassword = process.env.SEED_SYSADMIN_PASSWORD ?? "sysadmin123";

    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@playhub.local";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

    const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? "customer@playhub.local";
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "customer123";

    const [sysadminHash, adminHash, customerHash] = await Promise.all([
      bcrypt.hash(sysadminPassword, 10),
      bcrypt.hash(adminPassword, 10),
      bcrypt.hash(customerPassword, 10),
    ]);

    const sysadmin = await prisma.user.upsert({
      where: { email: sysadminEmail },
      update: {
        name: "Sysadmin",
        role: Role.SYSADMIN,
        password_hash: sysadminHash,
      },
      create: {
        email: sysadminEmail,
        name: "Sysadmin",
        role: Role.SYSADMIN,
        password_hash: sysadminHash,
      },
      select: { id: true, email: true },
    });

    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        name: "Admin",
        role: Role.ADMIN,
        password_hash: adminHash,
      },
      create: {
        email: adminEmail,
        name: "Admin",
        role: Role.ADMIN,
        password_hash: adminHash,
      },
      select: { id: true, email: true },
    });

    const customer = await prisma.user.upsert({
      where: { email: customerEmail },
      update: {
        name: "Customer",
        role: Role.CUSTOMER,
        password_hash: customerHash,
      },
      create: {
        email: customerEmail,
        name: "Customer",
        role: Role.CUSTOMER,
        password_hash: customerHash,
      },
      select: { id: true, email: true },
    });

    let establishment: { id: string; name: string } | null = null;
    if (seedDemoData) {
      const existingEst = await prisma.establishment.findFirst({
        where: { ownerId: admin.id },
        select: { id: true },
      });

      establishment = existingEst
        ? await prisma.establishment.update({
            where: { id: existingEst.id },
            data: {
              name: "PlayHub Arena",
              slug: slugify("PlayHub Arena"),
              description: "Estabelecimento de exemplo para testes.",
              whatsapp_number: "+55 11 99999-9999",
              address_text: "Av. Paulista, 1000 - São Paulo, SP",
              latitude: -23.564,
              longitude: -46.653,
              opening_time: "08:00",
              closing_time: "23:00",
            },
            select: { id: true, name: true },
          })
        : await prisma.establishment.create({
            data: {
              ownerId: admin.id,
              name: "PlayHub Arena",
              slug: slugify("PlayHub Arena"),
              description: "Estabelecimento de exemplo para testes.",
              whatsapp_number: "+55 11 99999-9999",
              address_text: "Av. Paulista, 1000 - São Paulo, SP",
              latitude: -23.564,
              longitude: -46.653,
              opening_time: "08:00",
              closing_time: "23:00",
            },
            select: { id: true, name: true },
          });

      // Criar algumas quadras (idempotente por (establishmentId, name)).
      const courtSeeds = [
        {
          name: "Quadra Futsal 1",
          sport_type: SportType.FUTSAL,
          price_per_hour: 12000,
          discount_percentage_over_90min: 10,
          photo_urls: ["https://images.unsplash.com/photo-1521412644187-c49fa049e84d"],
        },
        {
          name: "Beach Tennis 1",
          sport_type: SportType.BEACH_TENNIS,
          price_per_hour: 18000,
          discount_percentage_over_90min: 10,
          photo_urls: ["https://images.unsplash.com/photo-1521412644187-c49fa049e84d"],
        },
      ];

      for (const c of courtSeeds) {
        const existing = await prisma.court.findFirst({
          where: { establishmentId: establishment.id, name: c.name },
          select: { id: true },
        });

        if (existing) {
          await prisma.court.update({
            where: { id: existing.id },
            data: {
              sport_type: c.sport_type,
              price_per_hour: c.price_per_hour,
              discount_percentage_over_90min: c.discount_percentage_over_90min,
              photo_urls: c.photo_urls,
            },
          });
        } else {
          await prisma.court.create({
            data: {
              establishmentId: establishment.id,
              name: c.name,
              sport_type: c.sport_type,
              price_per_hour: c.price_per_hour,
              discount_percentage_over_90min: c.discount_percentage_over_90min,
              photo_urls: c.photo_urls,
            },
          });
        }
      }

      // Motivos padrão de inativação (idempotente por título)
      const defaultReasons = ["Manutenção", "Reforma", "Clima", "Evento", "Indisponibilidade temporária"];
      for (const title of defaultReasons) {
        const existing = await prisma.courtInactivationReason.findFirst({
          where: { title },
          select: { id: true },
        });
        if (!existing) {
          await prisma.courtInactivationReason.create({
            data: { title, createdById: sysadmin.id },
          });
        }
      }
    }

    console.log("Seed concluído:");
    console.log(`- Sysadmin: ${sysadmin.email} / ${sysadminPassword}`);
    console.log(`- Admin: ${admin.email} / ${adminPassword}`);
    console.log(`- Customer: ${customer.email} / ${customerPassword}`);
    if (establishment) {
      console.log(`- Establishment: ${establishment.name}`);
    } else {
      console.log("- Demo: desativado (sistema inicia sem estabelecimento/quadras/motivos)");
      console.log("  Para popular dados de exemplo: defina SEED_DEMO_DATA=1 e rode npm run seed");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
