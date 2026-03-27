# Sub-Contractor Rol Implementatie

Deze documentatie beschrijft de nieuwe Sub-Contractor rol en het systeem voor handmatig uren toevoegen.

## Overzicht

### Nieuwe Rol: Sub-Contractor
De Sub-Contractor rol stelt gebruikers in staat om:
- Uren voor zichzelf in te voeren (zoals een normale werknemer)
- Uren voor toegewezen werknemers in te voeren en te beheren
- Hun eigen uren en die van toegewezen werknemers in te zien

### Admin Mogelijkheden
Admins kunnen nu:
- Werknemers handmatig uren toewijzen via de "+ Uren Toevoegen" knop op de homepage
- Sub-Contractor toewijzingen beheren (welke sub-contractors welke werknemers kunnen beheren)
- Uren goedkeuren/afkeuren

## Database Setup

Voer het volgende SQL script uit in je Supabase SQL editor:

```bash
# Bestand: sub_contractor_roles.sql
```

Dit creëert:
1. Tabel `sub_contractor_assignments` - volgt welke sub-contractors welke werknemers kunnen beheren
2. RLS policies voor sub-contractors om uren in te voeren voor toegewezen werknemers
3. Permissies voor admins om alles te beheren

## Componenten

### 1. AddHoursModal (ManualHoursEntry.tsx)
**Locatie:** `src/components/ManualHoursEntry.tsx`

Dit is een herbruikbare modale component die:
- Admins toelaat handmatig uren toe te voegen voor elke werknemer
- Sub-contractors toelaat handmatig uren toe te voegen voor zichzelf en toegewezen werknemers
- Te openen is via de "+ Uren Toevoegen" knop op de homepage

### 2. SubContractorAssignments
**Locatie:** `src/components/SubContractorAssignments.tsx`

Alleen voor admins beschikbaar. Hiermee kunnen admins:
- Sub-contractors toewijzen aan werknemers
- Toewijzingen verwijderen
- Een overzicht zien van alle toewijzingen

**Page:**
- `/admin/sub-contractor-assignments` - admin-beveiligd

## UI Updates

### Homepage
- Nieuwe knop: **"+ Uren Toevoegen"** in de header van de week view
- Opent een modale dialog waar je een medewerker kunt selecteren en uren kunt invoegen
- Beschikbaar voor admins en sub-contractors

### Navigatie
- `/admin/sub-contractor-assignments` link alleen voor admins

## Workflow

### Een Sub-Contractor Aanmaken

1. Ga naar `/admin/roles` (Werknemers)
2. Voeg een nieuwe werknemer toe
3. Selecteer "Sub-Contractor" als rol bij het aanmaken

### Sub-Contractor Toewijzen aan Werknemers

1. Ga naar `/admin/sub-contractor-assignments`
2. Selecteer een Sub-Contractor en een Werknemer
3. Klik "Toevoegen"

Nu kan die Sub-Contractor uren voor die werknemer invoeren.

### Handmatig Uren Toevoegen (Admin/Sub-Contractor)

1. Ga naar de homepage (Uren sectie)
2. Klik op **"+ Uren Toevoegen"** knop
3. Selecteer een medewerker (als admin alles, als sub-contractor alleen jezelf en toegewezen werknemers)
4. Vul datum, start- en eindtijd in
5. Klik "Uren toevoegen"

## Permissies Samenvatting

| Actie | Admin | Sub-Contractor | Employee |
|-------|-------|---|----------|
| Eigen uren invoeren | ✅ | ✅ | ✅ |
| Uren voor anderen invoeren | ✅ | ✅* | ❌ |
| Uren goedkeuren | ✅ | ❌ | ❌ |
| Toewijzingen beheren | ✅ | ❌ | ❌ |
| Werknemers beheren | ✅ | ❌ | ❌ |

*Alleen voor aan hen toegewezen werknemers

## Technische Details

### RLS Policies
Zie `sub_contractor_roles.sql` voor de volledige RLS policies:
- Sub-contractors kunnen time_entries SELECT/INSERT/UPDATE/DELETE voor zichzelf en toegewezen werknemers
- Admins kunnen alle time_entries beheren
- Werknemers kunnen alleen hun eigen entries beheren

### API Routes
De volgende API route is bijgewerkt:
- `/api/admin/users` (POST) - accepteert nu 'admin', 'employee', en 'sub-contractor' als rol

### TypeScript Types

De volgende types zijn bijgewerkt om 'sub-contractor' te ondersteunen:
- `Profile.role`: `'admin' | 'employee' | 'sub-contractor'`
- `UserManagement` component: alle role selecties
- `AddHoursModal` component: rol-specifieke logica

## Testen

1. **Test Admin Workflow:**
   - Log in als admin
   - Maak een Sub-Contractor aan
   - Maak een Werknemer aan
   - Wijs de Sub-Contractor toe aan de Werknemer
   - Klik "Uren Toevoegen" op homepage en voeg handmatig uren in voor beiden

2. **Test Sub-Contractor Workflow:**
   - Log in als Sub-Contractor
   - Klik "Uren Toevoegen" op homepage
   - Check dat alleen jezelf en toegewezen werknemers zichtbaar zijn
   - Voer uren in

3. **Test Security:**
   - Log in als werknemer (niet-admin, niet-sub-contractor)
   - Controleer dat `/admin/*` routes niet toegankelijk zijn
   - Controleer dat je alleen je eigen uren kunt zien/invoeren
   - Er is geen "Uren Toevoegen" knop zichtbaar

## Toekomstige Verbeteringen

Mogelijke uitbreidingen:
- Bulkimport van uren
- Uren editeren na invoering
- Rapportage per sub-contractor
- Goedkeuringswerkstroom
