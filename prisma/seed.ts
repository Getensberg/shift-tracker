// Демо-справочник: сотрудники из табеля + две тестовые группы.
// Запуск: npm run db:seed
import { seedDemo } from "../src/lib/demo";
import { prisma } from "../src/lib/db";

seedDemo()
  .then(() => console.log("Seed: готово"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
