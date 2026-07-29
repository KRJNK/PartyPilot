# Chat Widget — AI Asystent

Samodzielny widget czatu AI dla platformy Wedding SaaS. Osadzany na stronie
sprzedawcy/usługodawcy — pływający bąbelek czatu, który pozwala parom młodym
rozmawiać z asystentem AI.

## Jak osadzić

Dodaj ten kod na swojej stronie:

```html
<script src="https://widget.weddingsaas.pl/chat.js"
        data-tenant-id="TWOJ_TENANT_ID"
        async></script>
```

## Opcje

| Atrybut | Opis | Domyślnie |
|---------|------|-----------|
| `data-tenant-id` | Twój ID tenanta (wymagane) | — |
| `data-api-base` | URL API | `https://api.weddingsaas.pl/api` |
| `data-position` | Pozycja przycisku | `bottom-right` |

## Wymagania

- Żadnych zależności, frameworków ani build tools
- Działa z każdą stroną HTML
- Wspiera wszystkie nowoczesne przeglądarki (Chrome, Firefox, Safari, Edge)

## Funkcje

- **Pływający bąbelek czatu** — pozycjonowany bottom-right lub bottom-left
- **Panel czatu** — 380×500px na desktopie, pełny ekran na mobile
- **Wiadomości w czasie rzeczywistym** — wysyłanie i odbieranie odpowiedzi AI
- **Wskaźnik pisania** — animowane kropki podczas oczekiwania na odpowiedź
- **Szybkie odpowiedzi** — podpowiedzi (chipy) przy pierwszym otwarciu
- **Persystencja konwersacji** — historia przechowywana w localStorage
- **Dark mode** — automatyczne dostosowanie do preferencji systemu
- **Dostępność klawiaturowa** — Esc zamyka, Enter wysyła
- **Powiadomienia dźwiękowe** — subtelny dźwięk przy odpowiedzi AI (gdy czat zamknięty)
- **Plik CSS wstrzykiwany przez JS** — brak dodatkowych requestów

## API JavaScript

Widget udostępnia globalny obiekt `window.WeddingSaaSChat`:

```js
// Otwórz panel czatu
WeddingSaaSChat.open();

// Zamknij panel czatu
WeddingSaaSChat.close();

// Przełącz panel
WeddingSaaSChat.toggle();

// Wyślij wiadomość programowo
WeddingSaaSChat.send("Jakie macie pakiety?");
```

## Kolorystyka

Widget automatycznie pobiera kolor primary z profilu tenanta.
Można też nadpisać CSS custom properties:

```css
:root {
  --wsc-primary: #C9A96E;
  --wsc-bg: #ffffff;
  --wsc-text: #1a1a1a;
  --wsc-bubble-bg: #f0f0f0;
  --wsc-input-bg: #f8f8f8;
}
```

## Jak to działa

1. Klient klika bąbelek czatu na Twojej stronie
2. AI asystent odpowiada na pytania o Twoje usługi, pakiety i ceny
3. Kiedy klient jest gotowy na rezerwację, AI zbiera jego dane kontaktowe
4. Otrzymujesz powiadomienie email z zakwalifikowanym leadem

## Rozwój

```bash
# Otwórz demo lokalnie
open index.html
```

Widget jest w pełni samodzielny — nie wymaga serwera deweloperskiego.
Po prostu otwórz `index.html` w przeglądarce.

## Struktura plików

```
chat-widget/
├── index.html    — Strona demo
├── chat.js       — Główny widget (IIFE, wstrzykuje CSS)
├── chat.css      — Style widgetu (osobny plik + inline w JS)
└── README.md     — Instrukcja
```

## Licencja

Wedding SaaS — wewnętrzny komponent platformy.
