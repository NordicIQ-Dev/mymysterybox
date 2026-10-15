# Oppsett: MyMysteryBox fra AI Andorra via GitHub til Cloudflare

```
AI Andorra (Open WebUI + GitHub MCP)
        │  lager branch + pull request
        ▼
GitHub: NordicIQ-Dev/mymysterybox-landing
        │  PR  → Cloudflare lager forhåndsvisning (egen URL per PR)
        │  PR  → GitHub Actions tester backend-koden
        │  du merger til main
        ▼
Cloudflare Pages (public/)            Supabase (EU)
  nettsiden, ingen byggesteg     ◄──►  database + edge functions
                                        │  deployes automatisk av GitHub Actions
                                        ▼
                                      Brevo (e-post)
```

AI Andorra kan ikke merge selv (merge-verktøyet er filtrert bort), og det er riktig: du ser forhåndsvisningen
av hver endring før den går live.

## 1. Legg koden i GitHub (gjør dette selv, ikke via AI Andorra)

Første opplasting bør du gjøre manuelt. Filene er for store til at en lokal modell bør skrive dem via MCP;
det er lett at noe blir endret underveis.

1. GitHub > NordicIQ-Dev > New repository > `mymysterybox-landing`, privat, uten README.
2. Pakk ut zip-filen på Mac-en.
3. På den tomme repo-siden: «uploading an existing file» > dra inn **innholdet** i mappen (ikke selve mappen).
   Skjulte mapper (`.github`) følger ikke alltid med ved dra-og-slipp i nettleseren. Sjekk at
   `.github/workflows/supabase-functions.yml` ligger i repoet; hvis ikke, lag filen via «Add file > Create new file»
   og lim inn innholdet.
4. Commit til `main`.
5. Gi tokenet `ai-andorra` tilgang til det nye repoet (GitHub > Settings > Developer settings > Fine-grained tokens >
   ai-andorra > Repository access > legg til `mymysterybox-landing`, med Contents og Pull requests: Read and write).
6. Settings > Branches > Add rule for `main`: «Require a pull request before merging». Da kan heller ikke AI Andorra
   skrive direkte til main ved en feil.

## 2. Supabase

1. supabase.com > New project i NordicIQ-organisasjonen, navn `mymysterybox`, region **Frankfurt (eu-central-1)**.
2. SQL Editor > lim inn hele `supabase/migrations/20261015000000_waitlist.sql` > Run.
3. Authentication > Users > Add user > din e-post og et sterkt passord (dette blir admin-brukeren).
   Slå av «Allow new users to sign up» under Authentication > Sign In / Providers, så ingen andre kan registrere seg.
4. SQL Editor, gjør brukeren til admin:
   `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'DIN@EPOST';`
5. Edge Functions > Secrets: legg inn alle verdiene fra TESTPLAN.md seksjon 3.
6. Project Settings > API: kopier **Project URL** og **anon/publishable key** til `public/assets/config.js`
   (gjøres via en PR, se prompt 1 i AI_ANDORRA.md). Begge er laget for å ligge åpent i nettleseren.

## 3. Automatisk deploy av backenden (GitHub Actions)

1. supabase.com > Account > Access Tokens > Generate, navn `github-mymysterybox`.
2. GitHub-repoet > Settings > Secrets and variables > Actions:
   - New repository secret: `SUPABASE_ACCESS_TOKEN` = tokenet
   - Variables > New: `SUPABASE_PROJECT_REF` = id-en fra `https://<id>.supabase.co`
3. Actions > «Supabase functions» > Run workflow. Den kjører testene og deployer alle funksjonene.
   Etter dette skjer det automatisk hver gang noe under `supabase/functions` endres på main.

## 4. Cloudflare Pages

1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git > NordicIQ-Dev > `mymysterybox-landing`.
2. Framework preset: **None**. Build command: **tom**. Build output directory: **public**.
3. Save and Deploy. Siden ligger nå på `https://mymysterybox-landing.pages.dev`.
4. Hver PR får automatisk en egen forhåndsvisnings-URL, som Cloudflare skriver som kommentar i PR-en.

Bruker dere Workers med statiske filer i stedet (slik som nordiciq-lab), ligger `wrangler.jsonc` klar: velg
Workers > Import a repository, og deploy-kommando `npx wrangler deploy`.

## 5. Beskytt /admin med Cloudflare Access (sterkt anbefalt)

Admin-siden krever allerede innlogging og admin-rolle i databasen. Legg i tillegg Cloudflare Zero Trust foran,
på samme måte som ai.nordiciq.io:

Zero Trust > Access > Applications > Add > Self-hosted > domene `mymysterybox-landing.pages.dev` (og senere
eget domene) med sti `admin*` > policy: kun dine godkjente e-poster.

## 6. Turnstile, Brevo og domene

- Turnstile: følg TESTPLAN.md seksjon 2 (testnøkler nå, ekte nøkler før lansering).
- Brevo: følg TESTPLAN.md seksjon 1.
- Eget domene: Pages-prosjektet > Custom domains > legg til domenet. Oppdater deretter `SITE_URL`,
  `ALLOWED_ORIGINS`, Turnstile-domenene og domene-plassholderne i `index.html` (canonical og og:url/og:image).

## 7. Test

Kjør TESTPLAN.md fase A, B og C mot `mymysterybox-landing.pages.dev`, og fase 9 på ekte telefoner.

## Hva AI Andorra skal og ikke skal gjøre

Les `AI_ANDORRA.md`. Kort fortalt: AI Andorra endrer innhold og design i `public/`, én oppgave per PR.
Backend (`supabase/`), workflows og sikkerhetsheadere endres bare når du ber eksplisitt om det.
