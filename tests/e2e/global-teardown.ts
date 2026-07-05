import PocketBase from "pocketbase";
import { E2E_TEST_EMAIL } from "./fixtures/test-user";

/**
 * Corre una vez al final de toda la suite: borra las submissions que los
 * tests de submission-flow.spec.ts crearon en la PocketBase REAL de
 * Railway bajo el usuario de test dedicado, para que correr la suite
 * repetidas veces no acumule basura en el dashboard/historial de esa
 * cuenta. El usuario de test en sí NO se borra (login/plan quedan listos
 * para la próxima corrida, evita recrearlos cada vez).
 */
export default async function globalTeardown() {
  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!pbUrl || !adminEmail || !adminPassword) return;

  const pb = new PocketBase(pbUrl);
  await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);

  const user = await pb
    .collection("users")
    .getFirstListItem(pb.filter("email = {:email}", { email: E2E_TEST_EMAIL }))
    .catch(() => null);
  if (!user) return;

  const submissions = await pb.collection("submissions").getFullList({
    filter: pb.filter("user = {:userId}", { userId: user.id }),
  });
  for (const submission of submissions) {
    await pb.collection("submissions").delete(submission.id).catch(() => {});
  }
}
