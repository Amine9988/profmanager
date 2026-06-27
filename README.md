# ProfManager

Plateforme SaaS multi-tenant pour professeurs de cours particuliers — gestion des
élèves, groupes (fawj), présence, et paiements.

> ⚠️ **Version sans Stripe.** Le module de facturation SaaS (abonnements payants
> de la plateforme) a été volontairement retiré de cette version. Les paiements
> élève → professeur (cash, virement) restent fonctionnels et sont gérés
> manuellement (sans passerelle de paiement en ligne).

---

## Stack technique

- **Next.js 16** (App Router, Server Actions, React 19)
- **TypeScript** (strict mode)
- **PostgreSQL** via **Supabase** (Auth + DB)
- **Prisma 5** (ORM)
- **TailwindCSS v4** + **shadcn/ui** (composants vendored, pas de dépendance CLI)
- **TanStack Table** (tables de données)
- **Recharts** (graphiques)
- **Zod** + **React Hook Form** (validation)

---

## ⚠️ Important — généré hors-ligne

Ce projet a été généré dans un environnement sans accès réseau à
`binaries.prisma.sh` (les engines Prisma n'ont donc **pas pu être téléchargés
ni vérifiés ici**). Le schéma (`prisma/schema.prisma`) a été écrit et relu
manuellement avec soin, mais vous devez impérativement lancer cette commande
en premier sur votre machine (réseau ouvert) :

```bash
npx prisma generate
```

Si cette commande échoue ou que `npm run build` révèle des erreurs TypeScript
liées au client Prisma généré, c'est normal vu le contexte de génération —
relancez `npx prisma generate` puis `npm run build` à nouveau.

---

## Installation

### 1. Cloner / décompresser le projet

```bash
cd profmanager
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplissez `.env` avec vos vraies valeurs Supabase (voir section suivante).

### 3. Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → New project
2. Project Settings → API → copiez `Project URL`, `anon public`, `service_role`
3. Project Settings → Database → Connection string → copiez l'URI (pooler ET direct)

Remplissez dans `.env` :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[password]@[host]:5432/postgres
```

### 4. Générer le client Prisma + migrer la base

```bash
npx prisma generate
npx prisma db push
```

### 5. Appliquer les Row-Level Security policies

Dans Supabase Dashboard → SQL Editor, copiez-collez le contenu de
`prisma/rls-policies.sql` et exécutez-le.

> Note : la sécurité multi-tenant repose **en premier lieu** sur le filtre
> explicite `tenantId` dans chaque requête Prisma (`src/server/actions/*`),
> dérivé exclusivement de la session serveur authentifiée
> (`src/lib/auth.ts → getTenantContext()`). Les policies RLS sont une
> **deuxième couche de défense**.

### 6. Seed (données de démonstration)

```bash
npm run db:seed
```

Cela crée un tenant de démo avec 3 matières, 3 groupes, 15 élèves, 4 semaines
de séances passées (avec présence) et des paiements variés.

> ⚠️ Le seed utilise un `userId` factice (`00000000-0000-0000-0000-000000000001`).
> Pour tester l'application normalement, **créez votre propre compte via
> `/signup`** — cela créera automatiquement votre tenant. Le tenant de démo
> du seed sert surtout à visualiser des données réalistes via Prisma Studio
> (`npm run db:studio`).

### 7. Lancer en développement

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

---

## Scripts disponibles

| Script | Description |
|---|---|
| `npm run dev` | Lance le serveur de développement |
| `npm run build` | Build de production |
| `npm run start` | Lance le serveur de production (après build) |
| `npm run lint` | Vérifie le code avec ESLint |
| `npm run db:generate` | Génère le client Prisma |
| `npm run db:push` | Pousse le schéma vers la base (sans migration formelle) |
| `npm run db:migrate` | Crée une migration Prisma formelle |
| `npm run db:seed` | Remplit la base avec des données de démo |
| `npm run db:studio` | Ouvre Prisma Studio (interface visuelle de la DB) |

---

## Structure du projet

```
profmanager/
├── prisma/
│   ├── schema.prisma          # Schéma complet (19 modèles)
│   ├── rls-policies.sql       # Row-Level Security PostgreSQL
│   └── seed.ts                # Données de démonstration
├── src/
│   ├── app/
│   │   ├── (marketing)/        # Landing page publique
│   │   ├── (auth)/             # Login, signup
│   │   ├── (onboarding)/       # Wizard post-inscription
│   │   └── (dashboard)/        # App principale (protégée)
│   │       ├── overview/       # Dashboard KPIs
│   │       ├── students/       # Élèves
│   │       ├── groups/         # Groupes (fawj)
│   │       ├── attendance/     # Présence (mobile-first)
│   │       ├── payments/       # Paiements & factures
│   │       ├── reports/        # Statistiques
│   │       └── settings/       # Réglages tenant
│   ├── components/
│   │   ├── ui/                 # shadcn/ui (vendored manuellement)
│   │   ├── shared/              # Layout, sidebar, kpi-card...
│   │   ├── students/, groups/, attendance/, payments/, charts/
│   ├── lib/
│   │   ├── auth.ts              # ⚠️ CŒUR multi-tenant (getTenantContext)
│   │   ├── prisma.ts
│   │   ├── supabase/             # client, server, middleware
│   │   └── validations/          # Schémas Zod
│   ├── server/actions/           # Server Actions (CRUD par domaine)
│   └── middleware.ts             # Protection des routes
└── .env.example
```

---

## Sécurité multi-tenant — comment ça marche

1. **Aucun `tenantId` n'est jamais reçu depuis le client** (pas de query
   param, pas de champ caché). Il est systématiquement dérivé de
   `getTenantContext()` qui lit la session Supabase authentifiée côté
   serveur, puis recherche le `TenantUser` correspondant en base.
2. **Chaque requête Prisma** dans `src/server/actions/*.ts` filtre
   explicitement par `tenantId` (lecture ET écriture). Une tentative de
   modifier une ressource d'un autre tenant retourne `count: 0` (no-op),
   jamais une erreur qui révélerait l'existence de la ressource.
3. **Row-Level Security PostgreSQL** (`prisma/rls-policies.sql`) ajoute une
   deuxième couche au niveau base de données.
4. **Audit log** (`createAuditLog`) enregistré sur chaque action sensible
   (création, modification, archivage).

### ⚠️ À FAIRE avant la mise en production

Ce projet a été généré rapidement pour poser des fondations solides, mais
**aucun test automatisé n'a pu être exécuté** dans cet environnement (pas
d'accès à une vraie base PostgreSQL). Avant tout déploiement réel :

- [ ] Écrivez et exécutez un test d'isolation cross-tenant (Tenant A ne peut
      pas lire/modifier les données de Tenant B) — voir le pattern dans
      `src/server/actions/students.ts` pour comprendre le filtre appliqué.
- [ ] Testez le flow complet : signup → onboarding → création groupe →
      inscription élève → marquage présence → paiement.
- [ ] Vérifiez le responsive sur un vrai téléphone (375px), en particulier
      `/attendance/session/[id]`.
- [ ] Le rôle "owner" a un accès total codé en dur dans `requirePermission()`
      (`src/lib/auth.ts`). Les rôles "teacher" et "assistant" existent en
      base mais **aucune permission concrète ne leur est encore assignée**
      (table `role_permissions` vide après seed) — à compléter selon vos
      besoins métier avant d'inviter des collaborateurs.

---

## Réintégrer Stripe plus tard

Le module Stripe a été retiré pour cette version. Pour le réintégrer :

1. `npm install stripe`
2. Ajouter `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET` dans `.env`
3. Ajouter les modèles `Plan` et `Subscription` dans `schema.prisma`
   (voir la section correspondante du document de spécifications original)
4. Créer `src/server/actions/billing.ts` et la route webhook
   `src/app/api/webhooks/stripe/route.ts`
