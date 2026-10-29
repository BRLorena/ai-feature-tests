import type { CategoryKey } from "../../src/schemas";

export interface ParseCase {
  id: string;
  locale: "en" | "pt" | "es" | "fr";
  text: string;
  expected: {
    amount: number | null;
    category: CategoryKey;
    /** Days relative to the server's date (0 = today, -1 = yesterday), or an absolute YYYY-MM-DD. */
    date: number | string;
  };
}

/**
 * Natural-language expenses, as a user would type them in "Quick Add".
 * The decimal and thousands separators follow each locale (12,50 € in pt/es/fr).
 */
export const parseCases: ParseCase[] = [
  { id: "en-groceries-yesterday", locale: "en", text: "Spent $45.50 on groceries yesterday", expected: { amount: 45.5, category: "foodDining", date: -1 } },
  { id: "en-uber", locale: "en", text: "Uber ride to the airport for $32", expected: { amount: 32, category: "transportation", date: 0 } },
  { id: "en-coffee-morning", locale: "en", text: "Coffee at Starbucks $6.50 this morning", expected: { amount: 6.5, category: "foodDining", date: 0 } },
  { id: "en-bill-thousands", locale: "en", text: "Paid the $1,250.00 electricity and water bill", expected: { amount: 1250, category: "billsUtilities", date: 0 } },
  { id: "en-words", locale: "en", text: "Movie tickets, twenty dollars", expected: { amount: 20, category: "entertainment", date: 0 } },
  { id: "en-absolute-date", locale: "en", text: "Doctor visit copay of 25 dollars on 2026-10-01", expected: { amount: 25, category: "healthcare", date: "2026-10-01" } },
  { id: "en-no-amount", locale: "en", text: "Lunch with the team", expected: { amount: null, category: "foodDining", date: 0 } },

  { id: "pt-groceries-comma", locale: "pt", text: "Gastei 12,50 € no supermercado ontem", expected: { amount: 12.5, category: "foodDining", date: -1 } },
  { id: "pt-flight-thousands", locale: "pt", text: "Bilhete de avião para o Porto, 1.250,00 €", expected: { amount: 1250, category: "travel", date: 0 } },
  { id: "pt-pharmacy", locale: "pt", text: "Farmácia 8,90 €", expected: { amount: 8.9, category: "healthcare", date: 0 } },

  { id: "es-fuel-yesterday", locale: "es", text: "Gasté 30 euros en gasolina ayer", expected: { amount: 30, category: "transportation", date: -1 } },
  { id: "es-dinner-comma", locale: "es", text: "Cena con amigos 45,75 €", expected: { amount: 45.75, category: "foodDining", date: 0 } },
  { id: "es-bill-date", locale: "es", text: "Factura de la luz 89,99 € el 15 de octubre de 2026", expected: { amount: 89.99, category: "billsUtilities", date: "2026-10-15" } },

  { id: "fr-groceries-yesterday", locale: "fr", text: "Courses au supermarché 54,30 € hier", expected: { amount: 54.3, category: "foodDining", date: -1 } },
  { id: "fr-hotel-space-thousands", locale: "fr", text: "Hôtel à Nice, 1 250 €", expected: { amount: 1250, category: "travel", date: 0 } },
  { id: "fr-netflix", locale: "fr", text: "Abonnement Netflix 13,49 €", expected: { amount: 13.49, category: "entertainment", date: 0 } },
];
