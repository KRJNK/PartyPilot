# Wolny Deck — brief produktu

**Status:** kierunek do sprawdzenia z DJ-ami; nie zatwierdzona specyfikacja ani decyzja o zmianie nazwy PartyPilot.
**Data:** 2026-10-15

## Idea

Wolny Deck to robocza nazwa mobilnego narzędzia do prowadzenia działalności przez DJ-a weselnego. DJ używa go do obsługi zapytań, terminów, dojazdów, ofert, umów i płatności. To **kokpit DJ-a**, nie system do organizowania wesela przez parę młodą.

Klient nie zakłada konta i nie musi korzystać z aplikacji. Dostaje ofertę lub umowę jako plik/link przesłany przez DJ-a, najlepiej w dotychczasowym kanale komunikacji.

## Dla kogo i jaka wartość

**Główny użytkownik:** samodzielny DJ weselny lub mała ekipa, pracujący głównie z telefonu i obsługujący zapytania w e-mailu oraz komunikatorach.

**Obietnica:** szybko sprawdzić, co wymaga reakcji, co jest zarezerwowane, czy kolejne granie logistycznie się spina, ile pieniędzy jest do pobrania i co można zrobić z zapytaniem o zajęty termin.

Produkt nie powinien wymagać od DJ-a prowadzenia rozbudowanego CRM-u ani przepisywania tych samych danych w wielu miejscach.

## Zasady projektu

- **Telefon przede wszystkim:** PWA instalowana z przeglądarki na ekranie głównym; bez wymogu pobierania ze sklepu na start.
- **Prostota obsługi:** najpierw najbliższe wydarzenie i sprawy wymagające działania; szczegóły biznesowe dostępne głębiej.
- **Jeden panel dla DJ-a:** brak kont i portalu klienta w MVP.
- **AI pomaga, DJ zatwierdza:** AI może wyciągnąć dane z wiadomości i przygotować szkic odpowiedzi lub dokumentu, ale nie wysyła niczego ani nie potwierdza rezerwacji bez decyzji DJ-a.
- **Bez nieoficjalnego grzebania w skrzynkach:** początkowo przekazanie wiadomości na dedykowany adres, wklejenie treści lub ręczne dodanie zapytania. Integracje skrzynek i mediów społecznościowych dopiero po sprawdzeniu wykonalności i zapotrzebowania.

## Główne przepływy

1. **Zapytanie → karta:** DJ przekazuje wiadomość lub dodaje zapytanie. Aplikacja proponuje datę, miejsce, dane kontaktowe i treść; DJ sprawdza je względem oryginału. Powinna wykrywać prawdopodobne duplikaty i dopinać dalszą korespondencję do istniejącego zapytania.
2. **Karta → decyzja:** DJ widzi termin, lokalizację, status, wartość i następny krok. Może przygotować ofertę, odłożyć sprawę, oznaczyć jako przegraną albo rozważyć przekazanie kontaktu innemu DJ-owi.
3. **Termin → logistyka:** kalendarz pokazuje wydarzenia oraz czasy przygotowania i zakończenia pracy, lokalizacje, szacowany przejazd i konfigurowalne bufory. Przy sąsiadujących wydarzeniach system pokazuje konflikt lub ryzyko i wyjaśnia jego przyczynę. To ostrzeżenie dla DJ-a, nie gwarancja, że dojazd się uda.
4. **Oferta → umowa → płatność:** z profilu firmy, pakietów i danych wydarzenia powstaje oferta lub umowa do sprawdzenia i wysłania klientowi. DJ śledzi wysłanie, podpis/akceptację, zaliczkę i pozostałą płatność oraz dostaje przypomnienia.
5. **Zajęty termin → polecenie:** DJ może przekazać zapytanie zaufanemu DJ-owi. Na początku można rejestrować przekazanie i prowizję ręcznie. Dane klienta udostępnia się dopiero w zgodnym z prawem i uzgodnionym przez klienta procesie.

## Informacje, które muszą mieć znaczenie

### Kalendarz i dojazd

Kalendarz jest podstawową funkcją, nie dodatkiem. Każde wydarzenie powinno móc przechowywać:

- datę oraz godziny grania, montażu i demontażu;
- dokładny adres miejsca i opcjonalny adres startowy/koniec trasy;
- czas przejazdu, źródło lub sposób jego ustalenia oraz bufor ustawiany przez DJ-a;
- status terminu (np. zapytanie, wstępna blokada z terminem wygaśnięcia, potwierdzone, anulowane);
- informację, czy DJ ma ekipę lub drugi zestaw, jeśli wpływa to na możliwość równoległych zleceń.

System nie powinien z góry zakładać, że każdy może zagrać tylko jedno wydarzenie dziennie ani że zawsze da się zagrać dwa. Ma uwzględnić godziny, lokalizacje, przygotowanie, dojazd i bufory; konflikt pozostawić widoczny do decyzji DJ-a. Sposób szacowania tras i uwzględniania ruchu pozostaje do wyboru.

### Widok działalności

Przydatne podsumowania mogą obejmować: nowe zapytania i sprawy bez odpowiedzi, nadchodzące wydarzenia, przychód przewidywany i zrealizowany, zaliczki oraz dopłaty do pobrania, koszty dojazdu/noclegu oraz wynik według miesiąca. Dane mają wynikać z kart, które DJ i tak prowadzi — nie z dodatkowego ręcznego raportowania.

## Zakres etapami

### MVP — najpierw użyteczny kokpit

- mobilny panel/PWA dla DJ-a;
- karta zapytania i ręczne dodawanie/przekazywanie wiadomości;
- kalendarz z wydarzeniami i statusami terminów;
- lokalizacje, czasy pracy i konfigurowalne bufory przejazdu; wyraźne ostrzeżenie o kolizji;
- pakiety, dodatki, wycena i dane firmy;
- generowanie dokumentów PDF do sprawdzenia przez DJ-a;
- śledzenie zaliczki i dopłaty, przypomnienia dla DJ-a;
- podstawowy ekran „wymaga uwagi / najbliższe granie / płatności”.

### Później, po walidacji

- integracje z Gmail/Outlook lub innymi skrzynkami, jeśli wystarczy liczba DJ-ów z tych usług i uda się uzyskać wymagane zgody;
- automatyczne rozpoznawanie i łączenie wątków oraz szkice odpowiedzi;
- rozbudowane raporty finansowe i koszty;
- sieć poleceń/odstępowania zapytań z regułami prowizji i akceptacją przekazania danych;
- integracje kalendarzy, tras i podpisu elektronicznego — każdą osobno ocenić pod kątem kosztu, ograniczeń i faktycznej potrzeby.

### Poza zakresem na teraz

- publiczny widget rezerwacji dla par;
- konto, portal lub aplikacja klienta;
- chatbot rozmawiający z parą bez udziału DJ-a;
- automatyczne odrzucanie zapytań albo wysyłanie wiadomości bez zatwierdzenia;
- złożona giełda z automatycznym rozliczaniem prowizji, zanim powstanie aktywna i zaufana sieć DJ-ów.

## Co można rozważyć z PartyPilot

Po sprawdzeniu kodu pod kątem dopasowania, jako kandydatów do ponownego użycia warto ocenić:

- rezerwacje, statusy i widok kalendarza;
- pakiety/usługi i dane firmy;
- generowanie PDF-ów umów;
- przypomnienia o płatnościach;
- pliki powiązane ze zleceniem.

- Do przeprojektowania: przypisywanie pracowników — ewentualnie krąg zaufanych DJ-ów i polecenia.
- Do pominięcia w pierwszym podejściu: publiczny widget rezerwacji i czat dla klientów.
- Nie zakładać, że moduły PartyPilot można przenieść bez zmian: najpierw porównać ich obecne zachowanie z powyższymi potrzebami.

## Ryzyka i otwarte decyzje

- **Pozyskanie danych z maili/Instagrama:** kanały i dostawcy są różni. MVP ma działać także bez integracji; nie budować na scrapingu ani obchodzeniu zabezpieczeń.
- **Logistyka:** czas przejazdu zależy od trasy i warunków. Trzeba wybrać źródło danych, sposób odświeżania i odpowiedzialność za bufory; komunikować szacunki, nie pewniki.
- **Polecenia i dane osobowe:** przed przekazywaniem danych klienta ustalić zgodę, zakres informacji, odpowiedzialność oraz sposób rozliczenia prowizji.
- **Umowy i podpisy:** ustalić wymagany proces prawny i dostawcę, zanim reklamować dokumenty jako podpisywane elektronicznie.
- **Model przychodu:** abonament, opłata za przekazane zlecenie lub usługa wdrożeniowa pozostają do przetestowania.
- **Nazwa i relacja z PartyPilot:** „Wolny Deck” jest nazwą roboczą produktu/kierunku. Nie zdecydowano, czy będzie osobnym produktem, czy przebudową PartyPilot.

## Walidacja przed większą budową

Przetestować przepływ z DJ-ami, z którymi użytkownik współpracuje. Najpierw obserwować prawdziwy proces obsługi zapytania i planowania dojazdu, a następnie przez krótki pilotaż prowadzić karty oraz kalendarz z użyciem istniejących narzędzi i ręcznej pomocy AI. Sprawdzić, czy DJ wraca do narzędzia, czy wychwytuje konflikty, czy oszczędza czas oraz za co byłby gotów zapłacić. Dopiero powtarzający się i opłacany problem uzasadnia wybór funkcji do budowy.

## Decyzje przyjęte w rozmowie

- **2026-10-15:** produkt jest przede wszystkim dla DJ-a; klient nie potrzebuje konta ani dostępu do aplikacji.
- **2026-10-15:** kalendarz jest potrzebny; planowanie ma uwzględniać realne dojazdy i możliwość grania w kolejnych lokalizacjach.
- **2026-10-15:** priorytetem jest wygoda na telefonie i prostota, przy zachowaniu użytecznych informacji o działalności.
- **2026-10-15:** „Wolny Deck” to zaakceptowana nazwa robocza; relacja produktu do PartyPilot pozostaje otwarta.
