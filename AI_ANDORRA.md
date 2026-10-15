# Regler for AI Andorra i dette repoet

Lim inn seksjonen «Systeminstruks» i assistenten `nordiciq-github` (eller som første melding i en ny chat)
før du ber den jobbe i `NordicIQ-Dev/mymysterybox-landing`. Bruk deretter promptene i promptbiblioteket.

## Systeminstruks

```
Du jobber i GitHub-repoet NordicIQ-Dev/mymysterybox-landing: en statisk landingsside for MyMysteryBox
som hostes på Cloudflare Pages fra mappen public/. Det finnes ingen byggesteg, ingen npm og ingen rammeverk.

Struktur:
- public/index.html            selve landingssiden (engelsk tekst)
- public/assets/styles.css     all styling, designtokens øverst i :root
- public/assets/app.js         skjema, nedtelling, meny, fast knapp på mobil
- public/assets/api.js         liten klient mot Supabase (ikke endre)
- public/assets/config.js      offentlige nøkler og landliste
- public/confirm.html, unsubscribe.html, privacy.html, giveaway-terms.html, admin.html, 404.html
- public/_headers, public/_redirects   sikkerhetsheadere og ruting
- supabase/ og .github/        backend og automatisk deploy

Regler:
1. Lag alltid en ny branch fra main og en pull request. Skriv aldri direkte til main.
2. Én oppgave per pull request. Endre bare filene oppgaven gjelder.
3. Ikke endre supabase/, .github/, public/_headers, public/assets/api.js eller admin-filene
   med mindre oppgaven eksplisitt sier det.
4. Ikke legg til biblioteker, rammeverk, CDN-skript, sporingskoder eller nye eksterne domener.
5. All tekst på nettsiden er på engelsk. Kort, tydelig, uten utropstegn og uten emoji.
6. Følg designet: farger og fonter kun fra :root-variablene i styles.css. Instrument Serif for overskrifter,
   Geist for resten. Gull (--gold) bare i små detaljer, aldri på knapper eller store flater.
   Ingen store bokstaver i overskrifter, ingen gradienter som pynt, ingen skrå elementer.
7. Behold all eksisterende tilgjengelighet: label på alle felt, alt-tekst på bilder, minst 44px klikkflater.
8. Når du endrer en fil: hent den først, gjør minst mulig endring, og skriv tilbake hele filen uendret
   utenom akkurat det oppgaven ber om.
9. Beskriv i PR-en: hva som er endret, hvilke filer, og hva jeg skal sjekke i Cloudflare-forhåndsvisningen.
10. Er du usikker, still ett spørsmål før du endrer noe. Ikke gjett på tall, datoer, priser eller juridisk tekst.
```

## Promptbibliotek

Premie, datoer, antall vinnere og ekskluderte land ligger i **databasen**, ikke i koden. De endres i
`/admin`, ikke via AI Andorra.

**1. Koble til Supabase**
```
Oppdater public/assets/config.js: sett supabaseUrl til "[PROJECT URL]" og supabaseAnonKey til "[ANON KEY]".
Lag branch config/supabase og en pull request. Ikke endre noe annet.
```

**2. Ekte Turnstile-nøkkel før lansering**
```
Oppdater public/assets/config.js: sett turnstileSiteKey til "[SITE KEY]". Lag branch config/turnstile og en
pull request. Ikke endre noe annet.
```

**3. Eget domene**
```
Bytt ut alle forekomster av [YOUR DOMAIN] i public/index.html med [domene.com] (canonical, og:url og og:image).
Lag branch config/domain og en pull request. Ikke endre noe annet.
```

**4. Selskapsinformasjon i footer**
```
Bytt ut [COMPANY NAME], [ADDRESS], [NUMBER] og [SUPPORT EMAIL] i footeren i alle HTML-filene i public/ med:
[selskapsnavn] OÜ, [adresse], registry code [nummer], [support-epost]. Lag branch content/footer og en pull
request. Ikke endre noe annet.
```

**5. Endre kategoriene i «What could be inside»**
```
I public/index.html, seksjonen id="inside": erstatt de fire radene med disse, samme HTML-struktur
(<div class="row"><span class="w serif">Navn</span><p>Beskrivelse</p></div>):
- [Navn]: [én setning på engelsk]
- [Navn]: [én setning på engelsk]
Lag branch content/categories og en pull request. Ikke endre noe annet.
```

**6. Nytt FAQ-spørsmål**
```
I public/index.html, seksjonen id="faq": legg til et nytt <details class="q"> nederst i .faq-list med samme
struktur som de andre. Spørsmål: "[spørsmål]". Svar: "[svar]". Lag branch content/faq og en pull request.
Ikke endre noe annet.
```

**7. Sette inn premiebilde**
```
Jeg har lastet opp bildet public/assets/prize.jpg (minst 1600 px bredt). I public/index.html, inne i
<div class="panel"> i seksjonen id="prize": erstatt svg-elementet med
<img src="/assets/prize.jpg" alt="[kort beskrivelse av premien]" width="1600" height="1600" loading="lazy"
style="width: 100%; height: 100%; object-fit: cover">.
Lag branch content/prize-image og en pull request. Ikke endre noe annet.
```

**8. Bytte til ekte logo**
```
Jeg har lastet opp public/assets/logo.svg. I alle HTML-filene i public/: erstatt den innebygde svg-en inne i
elementer med class="logo" med <img src="/assets/logo.svg" alt="" width="22" height="22">. Behold teksten
MyMysteryBox ved siden av. Lag branch brand/logo og en pull request. Ikke endre noe annet.
```

**9. Juridiske tekster**
```
Erstatt innholdet i <main> i public/giveaway-terms.html med denne godkjente teksten, med <h2> for hver
overskrift og <p> for hvert avsnitt. Fjern DRAFT-linjen. Tekst: [lim inn]. Lag branch legal/terms og en pull
request. Ikke endre noe annet.
```

**10. Legge til land i nedtrekkslisten**
```
I public/assets/config.js: legg til landkodene [XX, YY] i countries-listen (ISO 3166-1 alpha-2, store
bokstaver). Lag branch config/countries og en pull request. Ikke endre noe annet.
```

## Slik godkjenner du en PR

1. Åpne forhåndsvisnings-URL-en Cloudflare har kommentert i PR-en, på både Mac og mobil.
2. Se «Files changed»: endringen skal bare berøre filene oppgaven gjaldt. Er det endret mer, avvis PR-en.
3. Er GitHub Actions rød (bare relevant når supabase/ er endret), ikke merge.
4. Merge. Cloudflare publiserer til produksjon i løpet av et minutt.
