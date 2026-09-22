/**
 * Crea un usuario admin para login con Google.
 * Uso: node scripts/add-google-admin.cjs zynktechsas@gmail.com "Nombre Apellido"
 */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const email = (process.argv[2] || "").trim().toLowerCase();
const name = (process.argv[3] || "Administrador Google").trim();
const tempPassword = process.argv[4] || "GoogleAdmin123!";

if (!email || !email.includes("@")) {
  console.error("Uso: node scripts/add-google-admin.cjs <email> [nombre] [password-temporal]");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuario ya existe: ${email}`);
    return;
  }
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.adminUser.create({
    data: { email, name, passwordHash, role: "admin", active: true },
  });
  console.log(`Usuario creado: ${email} (rol admin)`);
  console.log(`Contraseña temporal: ${tempPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
