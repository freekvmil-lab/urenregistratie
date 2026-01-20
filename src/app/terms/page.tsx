import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Algemene voorwaarden – Vortexx',
  description: 'Algemene voorwaarden voor het gebruik van Vortexx urenregistratie.',
}

export default function TermsPage() {
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Algemene voorwaarden</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Laatst bijgewerkt: 2026-01-21</p>

      <section className="mt-6 space-y-4 text-gray-900 dark:text-gray-100">
        <p>
          Deze algemene voorwaarden (de “Voorwaarden”) zijn van toepassing op het gebruik van de Vortexx
          urenregistratie-app (de “Dienst”). Door de Dienst te gebruiken ga je akkoord met deze Voorwaarden.
        </p>

        <h2 className="text-xl font-semibold mt-6">1. De Dienst</h2>
        <p>
          De Dienst biedt functionaliteit voor het registreren, beheren en exporteren van gewerkte uren.
          Afhankelijk van de configuratie kunnen ook functies beschikbaar zijn zoals kilometerberekening
          en (optioneel) agenda-suggesties.
        </p>

        <h2 className="text-xl font-semibold mt-6">2. Toegang en accounts</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-800 dark:text-gray-200">
          <li>Je bent verantwoordelijk voor het vertrouwelijk houden van je inloggegevens.</li>
          <li>Je mag de Dienst alleen gebruiken voor legitieme bedrijfsdoeleinden.</li>
          <li>
            Beheerders kunnen gebruikers aanmaken, rollen toekennen en accounts deactiveren/ verwijderen
            volgens het beleid van de organisatie.
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">3. Correct gebruik</h2>
        <p>
          Je mag de Dienst niet gebruiken op een manier die schade kan veroorzaken, de beveiliging kan
          ondermijnen of de beschikbaarheid kan beïnvloeden. Misbruik kan leiden tot (tijdelijke) blokkering.
        </p>

        <h2 className="text-xl font-semibold mt-6">4. Gegevens en inhoud</h2>
        <p>
          Je bent verantwoordelijk voor de juistheid van de ingevoerde gegevens (zoals uren, opdrachtgever,
          locatie en eventuele kilometers). De Dienst kan validaties bieden, maar dit vervangt geen controle
          door de organisatie.
        </p>

        <h2 className="text-xl font-semibold mt-6">5. Exports</h2>
        <p>
          Exportfunctionaliteit is bedoeld voor administratie en rapportage. Je bent verantwoordelijk voor
          het zorgvuldig omgaan met geëxporteerde bestanden (bijv. CSV) en het delen daarvan alleen met
          bevoegde personen.
        </p>

        <h2 className="text-xl font-semibold mt-6">6. Integraties van derden (optioneel)</h2>
        <div className="space-y-3">
          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
            <h3 className="font-semibold">Google Agenda</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Als je een Google Agenda koppelt, is het gebruik ook onderworpen aan de voorwaarden en het
              beleid van Google. Je kunt de koppeling op ieder moment intrekken via je Google-account.
            </p>
          </div>

          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
            <h3 className="font-semibold">Route-/kaartservice (kilometers)</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Kilometerberekening kan gebruikmaken van een externe route-/kaartservice. We geven alleen
              de benodigde input door (bijv. adressen/locaties) om de routeafstand te bepalen.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-semibold mt-6">7. Beschikbaarheid en wijzigingen</h2>
        <p>
          We streven naar een betrouwbare Dienst, maar we kunnen geen ononderbroken beschikbaarheid garanderen.
          We mogen functionaliteit aanpassen of (tijdelijk) uitschakelen voor onderhoud, beveiliging of
          verbeteringen.
        </p>

        <h2 className="text-xl font-semibold mt-6">8. Aansprakelijkheid</h2>
        <p>
          Voor zover wettelijk toegestaan is de aansprakelijkheid beperkt tot directe schade en uitgesloten
          voor indirecte schade (zoals gevolgschade, verlies van data of winstderving). De organisatie die
          de Dienst gebruikt blijft verantwoordelijk voor de administratieve verwerking.
        </p>

        <h2 className="text-xl font-semibold mt-6">9. Beëindiging</h2>
        <p>
          We of de organisatiebeheerder kunnen toegang beëindigen of beperken bij misbruik, veiligheidsrisico’s
          of overtreding van deze Voorwaarden.
        </p>

        <h2 className="text-xl font-semibold mt-6">10. Toepasselijk recht</h2>
        <p>
          Op deze Voorwaarden is in principe het recht van het land van de organisatie van toepassing,
          tenzij anders overeengekomen.
        </p>

        <h2 className="text-xl font-semibold mt-6">11. Contact</h2>
        <p>
          Voor vragen over deze Voorwaarden kun je contact opnemen met de beheerder van de applicatie binnen
          jouw organisatie.
        </p>

        <div className="mt-8 text-xs text-gray-500 dark:text-gray-400">
          Let op: dit is een algemene tekst en kan aangepast moeten worden aan jouw organisatie (bijv.
          bedrijfsnaam, contactgegevens, specifieke afspraken/SLA, toepasselijk recht).
        </div>
      </section>
    </main>
  )
}
