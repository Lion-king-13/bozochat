/** Charge apps/api/.env en local (Node 22+). En production, Coolify injecte les variables. */
export function loadDotenv() {
  try {
    process.loadEnvFile();
  } catch {
    // pas de fichier .env : normal en CI et en production
  }
}
