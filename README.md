# ProfManager

Application de gestion pour professeurs de cours particuliers — élèves, groupes,
présence, paiements et certificats. Fonctionne **localement** (fichier SQLite),
sans base de données externe ni service cloud.

---

## Stack technique

- **Next.js 16** (App Router, Turbopack, Server Actions, React 19)
- **TypeScript** (strict)
- **Base de données locale SQLite** via **sql.js** (wasm), accessée par un shim
  compatible Supabase (`src/lib/db/supabase-shim.ts`). Aucune connexion réseau
  requise pour les données.
- **Authentification locale** (utilisateur fictif `default-user`) — pas de
  Supabase Auth, pas de compte à créer.
- **TailwindCSS v4** + **shadcn/ui** (composants vendored)
- **TanStack Table**, **Recharts**, **Zod** + **React Hook Form**
- **Electron** (dossier `electron/`) — packaging desktop Windows
- i18n : français / arabe / anglais (RTL)

> La structure du schéma et les données de démonstration sont définies dans
> `src/lib/db/schema.ts` (`SCHEMA_SQL`, `SEED_SQL`).

---

## Installation

Prérequis : Node.js ≥ 22 (recommandé : Node 24) et pnpm.

```bash
npm install        # installe les dépendances
cp .env.example .env
npm run dev        # serveur de développement
```

Ouvrez **http://localhost:3456** dans votre navigateur.

La base (`profmanager.db`) et les données de démonstration sont créées
automatiquement au premier lancement.

---

## Scripts disponibles

| Script               | Description                                      |
|----------------------|--------------------------------------------------|
| `npm run dev`        | Serveur de développement (port 3456)             |
| `npm run build`      | Build de production                              |
| `npm run start`      | Serveur de production (après `build`)            |
| `npm run lint`       | ESLint                                           |
| `npm run build:electron` | Build Next.js + packaging de l'app desktop   |

---

## Variables d'environnement

| Variable              | Requise | Défaut        | Description                              |
|-----------------------|---------|---------------|------------------------------------------|
| `NEXT_PUBLIC_APP_URL` | non     | `http://localhost:3456` | URL publique de l'app            |
| `NEXT_PUBLIC_APP_NAME`| non     | `ProfManager` | Nom affiché                              |
| `DEFAULT_USER_ID`     | non     | `default-user`| ID de l'utilisateur local authentifié    |
| `LOCAL_DB_PATH`       | non     | `./profmanager.db` | Chemin du fichier SQLite           |

Les anciennes variables Supabase / Prisma (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
`DIRECT_URL`) **ne sont plus utilisées** par le code et peuvent être retirées.

---

## Application desktop (Electron)

```bash
npm run build:electron
```

Produit l'installeur dans `electron/dist/`. L'app desktop démarre un serveur
Next.js local (standalone) et charge `/overview` dans une fenêtre Electron.

---

## Structure

```
├── src/
│   ├── app/                 # Routes Next.js (dashboard, api)
│   ├── components/          # Composants UI (shadcn vendored) + métier
│   └── lib/
│       ├── db/              # schema.ts + supabase-shim.ts (SQLite/sql.js)
│       ├── auth.ts          # Contexte utilisateur local (getTenantContext)
│       └── i18n/            # fr / ar / en
├── electron/                # Wrapper desktop + build
├── scripts/                 # Scripts de build / déploiement
└── profmanager.db           # Base SQLite locale (générée au premier run)
```
