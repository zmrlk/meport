/**
 * Profile Freshness Check
 *
 * Shows a nudge when profile is >14 days old.
 */

import { DIM, YELLOW, CYAN } from "./display.js";

export function checkFreshness(updatedAt: string, pl = false): void {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays >= 14) {
    if (pl) {
      console.log(
        YELLOW("  ℹ ") +
          DIM(`Profil ma ${ageDays} dni. Uruchom `) +
          CYAN("meport refresh") +
          DIM(" żeby go odświeżyć.")
      );
    } else {
      console.log(
        YELLOW("  ℹ ") +
          DIM(`Profile is ${ageDays} days old. Run `) +
          CYAN("meport refresh") +
          DIM(" for a tune-up.")
      );
    }
    console.log();
  }
}
