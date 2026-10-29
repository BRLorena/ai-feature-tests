import type { CategoryKey } from "../../src/schemas";

export interface CategorizeCase {
  id: string;
  locale: "en" | "pt" | "es" | "fr";
  description: string;
  expected: CategoryKey;
}

/**
 * Expense descriptions with one clearly correct category, 9 per locale.
 * Ambiguous items (e.g. "books": shopping or education?) are left out on purpose:
 * a case belongs here only if a person would agree on the answer.
 */
export const categorizeCases: CategorizeCase[] = [
  { id: "en-groceries", locale: "en", description: "Weekly groceries at Whole Foods", expected: "foodDining" },
  { id: "en-electricity", locale: "en", description: "Monthly electricity bill", expected: "billsUtilities" },
  { id: "en-netflix", locale: "en", description: "Netflix subscription", expected: "entertainment" },
  { id: "en-train", locale: "en", description: "Train ticket to work", expected: "transportation" },
  { id: "en-pharmacy", locale: "en", description: "Prescription at the pharmacy", expected: "healthcare" },
  { id: "en-hotel", locale: "en", description: "Hotel in Lisbon for 3 nights", expected: "travel" },
  { id: "en-course", locale: "en", description: "Online Python course on Udemy", expected: "education" },
  { id: "en-shoes", locale: "en", description: "New running shoes", expected: "shopping" },
  { id: "en-accountant", locale: "en", description: "Accountant fees for my company", expected: "business" },

  { id: "pt-lunch", locale: "pt", description: "Almoço no restaurante", expected: "foodDining" },
  { id: "pt-water", locale: "pt", description: "Conta da água", expected: "billsUtilities" },
  { id: "pt-cinema", locale: "pt", description: "Bilhetes de cinema", expected: "entertainment" },
  { id: "pt-fuel", locale: "pt", description: "Gasolina para o carro", expected: "transportation" },
  { id: "pt-dentist", locale: "pt", description: "Consulta no dentista", expected: "healthcare" },
  { id: "pt-flight", locale: "pt", description: "Voo para Paris nas férias", expected: "travel" },
  { id: "pt-tuition", locale: "pt", description: "Propinas da universidade", expected: "education" },
  { id: "pt-sweater", locale: "pt", description: "Camisola nova na Zara", expected: "shopping" },
  { id: "pt-company", locale: "pt", description: "Registo da marca da minha empresa", expected: "business" },

  { id: "es-dinner", locale: "es", description: "Cena en un restaurante", expected: "foodDining" },
  { id: "es-gas-bill", locale: "es", description: "Factura del gas", expected: "billsUtilities" },
  { id: "es-concert", locale: "es", description: "Entradas para un concierto", expected: "entertainment" },
  { id: "es-taxi", locale: "es", description: "Taxi al aeropuerto", expected: "transportation" },
  { id: "es-medicine", locale: "es", description: "Medicamentos en la farmacia", expected: "healthcare" },
  { id: "es-flight", locale: "es", description: "Billete de avión a Roma para las vacaciones", expected: "travel" },
  { id: "es-english", locale: "es", description: "Matrícula del curso de inglés", expected: "education" },
  { id: "es-shoes", locale: "es", description: "Zapatos nuevos", expected: "shopping" },
  { id: "es-office", locale: "es", description: "Alquiler de la oficina de mi empresa", expected: "business" },

  { id: "fr-groceries", locale: "fr", description: "Courses au supermarché", expected: "foodDining" },
  { id: "fr-electricity", locale: "fr", description: "Facture d'électricité", expected: "billsUtilities" },
  { id: "fr-spotify", locale: "fr", description: "Abonnement Spotify", expected: "entertainment" },
  { id: "fr-metro", locale: "fr", description: "Ticket de métro", expected: "transportation" },
  { id: "fr-doctor", locale: "fr", description: "Rendez-vous chez le médecin", expected: "healthcare" },
  { id: "fr-hotel", locale: "fr", description: "Hôtel à Barcelone pour le week-end", expected: "travel" },
  { id: "fr-piano", locale: "fr", description: "Cours de piano", expected: "education" },
  { id: "fr-trousers", locale: "fr", description: "Nouveau pantalon", expected: "shopping" },
  { id: "fr-software", locale: "fr", description: "Licence de logiciel comptable pour mon entreprise", expected: "business" },
];
