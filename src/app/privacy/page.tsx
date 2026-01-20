import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacybeleid – Vortexx',
  description: 'Privacybeleid voor Vortexx urenregistratie.',
}

export default function PrivacyPage() {
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Privacybeleid</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Laatst bijgewerkt: 2026-01-21
      </p>

      <section className="mt-6 space-y-4 text-gray-900 dark:text-gray-100">
        <p>
          Dit privacybeleid beschrijft hoe Vortexx ("wij", "ons") omgaat met persoonsgegevens
          binnen de Vortexx urenregistratie-app (de "Dienst"). We verwerken alleen gegevens die
          nodig zijn om urenregistratie mogelijk te maken.
        </p>

        <h2 className="text-xl font-semibold mt-6">1. Welke gegevens verwerken we?</h2>
        <p>Afhankelijk van gebruik kunnen we de volgende gegevens verwerken:</p>
        <ul className="list-disc pl-6 space-y-1 text-gray-800 dark:text-gray-200">
          <li>
            Accountgegevens: naam, e-mailadres en rol (bijv. werknemer/admin) voor toegang en beheer.
          </li>
          <li>
            Urenregistratiegegevens: datum, start/stop tijden, opdrachtgever, locatie (tekst),
            kilometers en (optioneel) parkeerkosten, plus status (bijv. goedgekeurd).
          </li>
          <li>
            Instellingen: bijvoorbeeld uurtarief (optioneel) en thuisadres (optioneel) om kilometerberekening
            te ondersteunen.
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">2. Waarvoor gebruiken we deze gegevens?</h2>
        <ul className="list-disc pl-6 space-y-1 text-gray-800 dark:text-gray-200">
          <li>Om uren te registreren, te tonen en te exporteren.</li>
          <li>Om beheer mogelijk te maken (werknemers, rollen, opdrachtgevers).</li>
          <li>Om kilometers te berekenen (indien je deze functie gebruikt).</li>
          <li>Om agenda-suggesties te tonen (indien je Google Agenda koppelt).</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">3. Diensten van derden</h2>
        <p>
          We gebruiken de volgende (sub)verwerkers/diensten om de Dienst te leveren. We delen alleen
          de minimale gegevens die nodig zijn voor de betreffende functionaliteit.
        </p>

        <div className="space-y-3">
          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
            <h3 className="font-semibold">Supabase (auth & database)</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              We gebruiken Supabase voor inloggen (authenticatie) en het opslaan van gegevens zoals
              profielen en urenregistraties.
            </p>
          </div>

          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
            <h3 className="font-semibold">Google Agenda (optioneel)</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Als je Google Agenda koppelt, lezen we agenda-items om suggesties te tonen. We vragen alleen
              leesrechten (readonly) en gebruiken deze gegevens uitsluitend voor het tonen van suggesties.
              Je kunt de koppeling op elk moment intrekken via je Google-account.
            </p>
          </div>

          <div className="border border-orange-200/60 dark:border-orange-500/30 rounded-lg p-4 bg-white/60 dark:bg-gray-900/40">
            <h3 className="font-semibold">Kaart-/route-service (kilometers, optioneel)</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Voor kilometerberekening kan een externe route-service worden gebruikt. Daarbij worden
              adressen/locaties als invoer gebruikt om de rijafstand te bepalen.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-semibold mt-6">4. Cookies en lokale opslag</h2>
        <p>
          We gebruiken technische cookies en/of lokale opslag om je ingelogd te houden en de Dienst
          correct te laten functioneren (bijvoorbeeld voor sessiebeheer). We gebruiken geen tracking cookies
          voor advertenties.
        </p>

        <h2 className="text-xl font-semibold mt-6">5. Bewaartermijnen</h2>
        <p>
          We bewaren gegevens niet langer dan nodig is voor het doel waarvoor ze zijn verzameld,
          of zolang als wettelijk vereist. Urenregistratie kan historisch bewaard blijven voor administratie.
        </p>

        <h2 className="text-xl font-semibold mt-6">6. Beveiliging</h2>
        <p>
          We nemen passende beveiligingsmaatregelen om gegevens te beschermen, waaronder toegangscontrole
          en het beperken van rechten per gebruiker (bijv. admin/werknemer).
        </p>

        <h2 className="text-xl font-semibold mt-6">7. Jouw rechten</h2>
        <p>
          Je hebt (afhankelijk van de wetgeving) rechten zoals inzage, correctie en verwijdering van gegevens.
          Neem contact op met je beheerder of de organisatie die de Dienst beheert om een verzoek in te dienen.
        </p>

        <h2 className="text-xl font-semibold mt-6">8. Contact</h2>
        <p>
          Vragen over dit privacybeleid? Neem contact op met de beheerder van de applicatie binnen jouw organisatie.
        </p>

        <div className="mt-8 text-xs text-gray-500 dark:text-gray-400">
          Let op: dit is een algemene privacy-tekst en kan aangepast moeten worden aan jouw organisatie (bijv.
          bedrijfsnaam, adres, contactgegevens, specifieke wettelijke grondslagen).
        </div>
      </section>
    </main>
  )
}
