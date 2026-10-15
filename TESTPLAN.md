# MyMysteryBox venteliste: oppsett og testplan

Supabase er fasiten for listen: alle påmeldinger, samtykker, utsendinger og trekninger ligger der.
Brevo sender bare e-postene. Hvis Brevo-kontoen skulle bli stengt, mister dere ingenting, og dere kan bytte
leverandør ved å endre `EMAIL_PROVIDER`.

## 0. Før dere starter

1. Supabase-prosjektet må ligge i en EU-region (Frankfurt). Sjekk under Project Settings > General.
2. Opprett Brevo-konto på selskapet (OÜ-en), og slå på tofaktorinnlogging for alle brukere.
3. **Send en e-post til Brevo-support før dere går live.** Brevo krever forhåndsgodkjenning for «gambling, casino
   and other money games». Mystery boxes er salg av fysiske varer, men et innslag av tilfeldighet kan bli tolket
   dit. Beskriv modellen (fysiske produkter og samlekort, ingen pengepremier) og få skriftlig OK. Gjør dette
   tidlig, så dere ikke blir stengt midt i en kampanje.
4. Gratisplanen i Brevo tillater 300 e-poster per dag. Før dere kjører annonser eller influencer-trafikk må dere
   oppgradere til Starter, ellers stopper bekreftelses-e-postene midt på dagen.

## 1. Brevo-oppsett

1. **Domene:** Senders & IP > Domains > legg til avsenderdomenet. Legg inn DNS-postene Brevo viser (DKIM og
   Brevo-kode) i Cloudflare, med proxy **av** (grå sky). Legg også inn DMARC:
   `_dmarc  TXT  v=DMARC1; p=none; rua=mailto:dmarc@[DOMENE]`, og skjerp til `p=quarantine` etter et par uker.
2. **Avsender:** `hello@[DOMENE]` (eller `mail.[DOMENE]` som subdomene for å skjerme hoveddomenets omdømme).
3. **API-nøkkel:** SMTP & API > API Keys > ny nøkkel kalt `supabase-waitlist`. Den legges KUN i Supabase Secrets.
4. **Lister:** Lag to lister, «Waitlist (confirmed)» og «Marketing consent». Noter ID-ene.
5. **Kontaktattributter:** Contacts > Settings > Attributes: `COUNTRY_CODE` (tekst), `MARKETING_CONSENT`
   (boolean), `SIGNUP_SOURCE` (tekst).
6. **Webhook:** Transactional > Settings > Webhooks > URL
   `https://[PROSJEKT].supabase.co/functions/v1/brevo-webhook?secret=[BREVO_WEBHOOK_SECRET]`,
   med hendelsene hard bounce, spam, unsubscribed og blocked.

## 2. Cloudflare Turnstile

Under testing brukes Cloudflares testnøkler, som alltid godkjenner:
site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
Før lansering: Turnstile > Add site > legg inn både `mymysterybox-landing.pages.dev` og domenet > bytt til ekte nøkler (site key i `public/assets/config.js`, secret i Supabase).

## 3. Supabase Secrets

| Navn | Testverdi | Live-verdi |
|---|---|---|
| `SITE_URL` | `https://mymysterybox-landing.pages.dev` | `https://[DOMENE]` |
| `ALLOWED_ORIGINS` | `https://mymysterybox-landing.pages.dev,*.mymysterybox-landing.pages.dev` | samme + `https://[DOMENE],https://www.[DOMENE]` |
| `EMAIL_PROVIDER` | `brevo` | `brevo` |
| `EMAIL_MODE` | `sandbox`, deretter `allowlist` | `live` |
| `EMAIL_ALLOWLIST` | `@nordiciq.no,roy@...` | (tom) |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` / `EMAIL_REPLY_TO` | `hello@[DOMENE]` / `MyMysteryBox` / support-adresse | samme |
| `BREVO_API_KEY` | nøkkelen | samme |
| `BREVO_LIST_ID_WAITLIST` / `BREVO_LIST_ID_MARKETING` | liste-ID-ene | samme |
| `BREVO_WEBHOOK_SECRET` | lang tilfeldig streng | samme |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` | ekte secret |
| `IP_HASH_SALT` / `UNSUBSCRIBE_SECRET` | lange tilfeldige strenger (`openssl rand -hex 32`) | samme, **aldri bytt etter lansering** |
| `CONSENT_TEXT_VERSION` | `v1` | øk når skjemateksten endres |
| `COMPANY_FOOTER` | `[SELSKAP] OÜ, [ADRESSE], Estonia` | samme |

Bytter dere `UNSUBSCRIBE_SECRET` etter lansering, slutter avmeldingslenkene i allerede sendte e-poster å virke.

## 4. Testfase A: sandbox (ingenting sendes)

`EMAIL_MODE=sandbox`. Brevo validerer API-kallet, men leverer ingenting. Svaret fra `subscribe` inneholder da
`debugConfirmUrl`, og skjemaet viser en «Sandbox mode»-lenke.

| # | Test | Forventet |
|---|---|---|
| A1 | Meld på ny e-post | Suksess-melding. Rad i `subscribers` med `confirmed_at` tom. Rad i `email_events` med `status=sent`, `mode=sandbox`. |
| A2 | Klikk sandbox-lenken | «You're in». `confirmed_at` satt, `confirm_token_hash` tom. |
| A3 | Klikk samme lenke igjen | «This link doesn't work». |
| A4 | Meld på samme e-post igjen | Samme suksess-melding (avslører ikke at e-posten finnes). `email_events` får `already_in`. |
| A5 | Ugyldig e-post / uten land / uten avkrysning | Feilmelding i skjemaet, ingen rad i databasen. |
| A6 | Fyll honeypot-feltet via devtools | «Suksess», men ingen rad lagres. |
| A7 | 6 påmeldinger på 10 min fra samme nett | Den sjette får «Too many sign-ups…». |
| A8 | Feil `BREVO_API_KEY` | Skjemaet viser «couldn't send the confirmation email». `email_events` har `status=failed` med feilkode. **Dette er testen for at feil aldri blir stille.** |
| A9 | Land i `excluded_countries` | Påmelding OK, `giveawayEntered=false`, e-posten nevner ikke premien. |
| A10 | Les tabeller med anon-nøkkelen direkte (`/rest/v1/subscribers`) | Tom liste eller 401. Ingen persondata ut. |
| A12 | Åpne `/admin` og logg inn med admin-brukeren | Tall, giveaway-listen og eksport fungerer. En vanlig bruker får «not an admin». |
| A11 | `rpc/waitlist_count` og `rpc/public_giveaway` med anon-nøkkelen | Returnerer tall og premie-info, ikke e-poster. |

## 5. Testfase B: allowlist (ekte e-post til teamet)

`EMAIL_MODE=allowlist`, `EMAIL_ALLOWLIST=@nordiciq.no,...`. Andre adresser logges som `skipped`.

| # | Test | Forventet |
|---|---|---|
| B1 | Meld på Gmail-, Outlook- og iCloud-adresser fra teamet | E-posten kommer i **innboksen**, ikke spam. Riktig avsender, emne og knapp. |
| B2 | Send til adressen fra mail-tester.com | Score 9/10 eller bedre. SPF, DKIM og DMARC = pass. |
| B3 | Åpne e-posten på mobil og i mørk modus | Lesbar, knappen fungerer. |
| B4 | Bekreft, og sjekk Brevo > Contacts | Kontakten ligger i «Waitlist (confirmed)», og i «Marketing consent» bare hvis boksen var krysset av. |
| B5 | Klikk «Unsubscribe» i e-posten | `/unsubscribe`-siden, deretter `unsubscribed_at` satt og kontakten blokkert i Brevo. |
| B6 | Gmail sin innebygde «Avslutt abonnement»-knapp | Samme resultat som B5 (one-click). |
| B7 | Ikke-allowlistet adresse | Suksess i skjemaet, `email_events.status=skipped`, ingen e-post sendt. |
| B8 | Vent 7 dager eller sett `confirm_sent_at` 8 dager tilbake, og klikk lenken | «This link has expired». |

## 6. Testfase C: trekning (med en testgiveaway)

1. Opprett giveaway `test-draw` med `ends_at` om 10 minutter, status `active`, `winners_count=2`.
2. Meld på og bekreft 5 testadresser. Meld på 1 adresse uten å bekrefte, og 1 fra et ekskludert land.
3. Etter `ends_at`: `lock` → `eligibleCount=5`, `entries_hash` lagret og synlig via `rpc/public_giveaway`.
4. `lock` en gang til → `already_locked`.
5. `draw` → én vinner blant de 5. `draw` igjen → en annen vinner. Tredje `draw` → `all_winners_drawn`.
6. `forfeit` den ene → `draw` igjen gir en ny vinner som aldri er trukket før.
7. Prøv å slette eller endre en rad i `giveaway_draws` eller `giveaway_entries` i SQL-editoren → blokkeres.
8. Kall `draw-winner` uten innlogging, og som innlogget ikke-admin → 401 / 403.
9. Slett testgiveawayen og testdata før lansering (se under).

## 7. Go-live-sjekkliste

- [ ] Skriftlig OK fra Brevo-support på forretningsmodellen
- [ ] Brevo-plan som tåler forventet volum per dag
- [ ] SPF, DKIM og DMARC = pass, mail-tester 9/10 eller bedre
- [ ] Ekte Turnstile-nøkler (site key i koden, secret i Supabase)
- [ ] `EMAIL_MODE=live`, `EMAIL_ALLOWLIST` tom
- [ ] `SITE_URL` og `ALLOWED_ORIGINS` = produksjonsdomenet
- [ ] Testdata slettet (`delete from email_events; delete from subscribers where email like '%@nordiciq.no';` osv.)
- [ ] Ekte giveaway opprettet og satt `active`, med riktige `excluded_countries`
- [ ] Giveaway Terms og Privacy Policy publisert, og Brevo og Supabase nevnt som databehandlere
- [ ] Første ekte påmelding fra en privat Gmail-adresse kommer fram i innboksen

## 8. Automatiske tester

`deno test --allow-env tests/` (kjøres også automatisk av GitHub Actions på hver PR) tester at tilfeldig trekning er jevnt fordelt, at
avmeldingssignaturen ikke kan forfalskes, at sandbox-flagget havner riktig i Brevo-kallet, at allowlist stopper
fremmede adresser, og at feil fra Brevo kommer ut som `failed` i stedet for å forsvinne.

## 9. Visuell test på enheter

Test på ekte enheter, ikke bare i nettleserens mobilvisning:

| Enhet | Sjekk |
|---|---|
| iPhone (Safari), både liten og stor modell | Ingen zoom når du trykker i e-postfeltet. Den faste knappen havner over hjem-streken. Menyen låser scrolling bak seg. |
| Android (Chrome) | Tastaturet dekker ikke «Enter the draw». Den faste knappen nederst dukker opp og forsvinner riktig. |
| iPad, stående og liggende | Stående viser nettbrettoppsettet, liggende (1024 px+) viser desktop. |
| Laptop 1280 px og stor skjerm 1440 px+ | Skjemaet overlapper scenen med boksen riktig, og menyen vises som lenker i toppen. |
| Mobil på tregt 4G (devtools-throttling) | Siden er brukbar innen 3 sekunder, og skjemaet virker før animasjonene er lastet. |

Ingenting skal kunne scrolles sidelengs.
