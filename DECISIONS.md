# Décisions techniques

## 1. Recherche globale (Cmd+K) — `cmdk`
- **Choix** : `cmdk` plutôt qu'une recherche custom.
- **Raison** : Composant accessible, optimisé pour le clavier, avec `Command`, `CommandInput`, `CommandList`, etc. déjà prêts à l'emploi. Fonctionne avec `Dialog` shadcn.
- **Alternative écartée** : Écrire un composant de search avec `useState` + `debounce` + rendu manuel — plus de code, moins accessible.

## 2. Import Excel — `papaparse` + `xlsx`
- **Format attendu** : CSV (`.csv`) ou Excel (`.xlsx`/.`xls`).
- **En-têtes tolérées** : `Nom complet`, `Nom`, `fullName`, `Niveau`, `gradeLevel`, `École`, `ecole`, `schoolName`, `Téléphone`, `telephone`, `Email`, `email`.
- **Validation** : Chaque ligne est validée via le `studentSchema` Zod existant. Les lignes invalides (fullName manquant) sont ignorées avec un rapport d'erreurs.

## 3. Forfaits — Décompte automatique
- **Règle métier** : Le décompte du forfait se fait UNIQUEMENT si `isPresent !== wasPresent` (évite de décompter 2× si on re-clique "Présent").
- **Transaction Prisma** : `$transaction` assure que l'attendance et le décompte du forfait sont atomiques.
- **Réincrément** : Si on repasse de "Présent" à "Absent", le compteur se ré-incrémente. Le statut du forfait repasse à `"active"` si il était `"exhausted"`.

## 4. PDF Reçu — `@react-pdf/renderer`
- **Route** : Route handler `GET /api/receipts/[paymentId]` — aucune page client, simple téléchargement.
- **Génération** : `renderToStream()` côté serveur. Le fichier est envoyé avec `Content-Type: application/pdf` et `Content-Disposition: attachment`.
- **Sécurité** : Vérifie `getTenantContext()` et que le Payment appartient au tenant avant de générer le PDF.

## 5. Notifications — Fire-and-forget
- **Déclenchement** : Les fonctions `checkAbsenceAlerts()` et `checkOverduePayments()` sont appelées en `void ...` dans `getDashboardKPIs()` pour ne pas bloquer le rendu.
- **Anti-doublon** : Une notification de même type n'est pas recréée si une existe déjà depuis moins de 7 jours.
- **`markAllPresent`** : Déclenche aussi le décompte des forfaits (via transaction avec boucle sur les étudiants).

## 6. Traduction arabe — i18n custom (sans next-intl)
- **Choix** : Provider React custom plutôt que `next-intl` avec middleware de routage.
- **Raison** : Le middleware existant gère déjà Supabase Auth. Ajouter le locale routing de `next-intl` complexifiait inutilement la stack et nécessitait de modifier toutes les routes.
- **Fonctionnement** : Provider React + cookie `locale=fr|ar`. Le `lang` et `dir` sont mis à jour côté client via `document.documentElement`.
- **Clés de traduction** : Structure hiérarchique par page/section : `{page}.{element}`. Les paramètres dynamiques utilisent `{param}` dans le template.
- **RTL** : Les composants shadcn/ui utilisent Tailwind avec des classes logiques (`ms-`/`me-` au lieu de `ml-`/`mr-`) — déjà géré par Tailwind en fonction de `dir`.
- **Non traduit** : Les données utilisateur (noms d'élèves, notes, etc.) restent dans leur langue d'origine.
