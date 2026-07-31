# Booking Widget

Samodzielny widget rezerwacyjny dla branży weselnej. Dodaje pływający przycisk na stronie Twojego
biznesu, który po kliknięciu otwiera 3-etapowy formularz rezerwacji online.

## Jak osadzić

Dodaj ten kod na swojej stronie (przed zamknięciem `</body>`):

```html
<script src="https://widget.partypilot.pl/widget.js"
        data-tenant-id="TWOJ_TENANT_ID"
        async></script>
```

Widget wstrzyknie pływający przycisk w prawym dolnym rogu strony. Po kliknięciu otworzy się
modal z formularzem rezerwacji.

## Opcje

| Atrybut | Opis | Domyślnie |
|---------|------|-----------|
| `data-tenant-id` | Twój ID tenanta **(wymagane)** | — |
| `data-api-base` | URL API backendu | `https://api.partypilot.pl/api` |
| `data-position` | Pozycja przycisku (`bottom-right` / `bottom-left`) | `bottom-right` |

## Dostosowywanie

Kolor przycisku i motyw są automatycznie pobierane z ustawień Twojego konta
(pole `primary_color`). Nie musisz nic konfigurować — kolorystyka dopasuje się
automatycznie po załadowaniu danych Twojego profilu.

## 3-etapowy formularz

1. **Wybierz termin** — kalendarz z zaznaczonymi zajętymi datami
2. **Twoje dane** — formularz z danymi kontaktowymi i wyborem pakietu
3. **Potwierdzenie** — podsumowanie rezerwacji i wysłanie

Po wysłaniu rezerwacji klient otrzymuje potwierdzenie na ekranie.

## Wymagania techniczne

- Żadnych zależności — czysty JavaScript (vanilla JS)
- Działa na każdej stronie: WordPress, Wix, Shopify, Webflow, własny HTML
- Nie wymaga frameworków ani bibliotek
- Wszystkie style są wstrzykiwane automatycznie — nie kolidują z istniejącymi stylami strony
- Klasy CSS są prefiksowane (`ws-*`), aby uniknąć konfliktów
- Obsługa ciemnego motywu (dark mode) poprzez `prefers-color-scheme`

## API

Widget korzysta z następujących publicznych endpointów API:

| Endpoint | Opis |
|----------|------|
| `GET /api/public/{tenant_id}` | Informacje o tenancie (nazwa, logo, kolor) |
| `GET /api/public/{tenant_id}/packages` | Lista pakietów |
| `GET /api/public/{tenant_id}/availability?month=YYYY-MM` | Zajęte daty w miesiącu |
| `POST /api/public/{tenant_id}/bookings` | Utworzenie rezerwacji |

## Zaawansowane

Widget eksportuje obiekt `window.PartyPilotWidget` z metodami:

```js
// Otwórz widget
window.PartyPilotWidget.open();

// Zamknij widget
window.PartyPilotWidget.close();

// Resetuj do kroku 1
window.PartyPilotWidget.reset();
```

## Rozwój

```bash
# Struktura plików
booking-widget/
├── index.html    # Strona demo do testowania
├── widget.js     # Główny skrypt widgetu (IIFE, vanilla JS)
├── widget.css    # Style widgetu (wstrzykiwane przez JS)
└── README.md     # Ta instrukcja

# Walidacja składni
node --check widget.js
```

Widget jest w pełni samodzielny — `widget.js` wstrzykuje `widget.css` do strony
w momencie ładowania. W produkcji oba pliki powinny być serwowane z CDN.
