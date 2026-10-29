/**
 * Response contracts of the AI endpoints, derived from src/lib/groq.ts in the app.
 */
import { z } from "zod";

export const CATEGORY_KEYS = [
  "foodDining",
  "transportation",
  "shopping",
  "entertainment",
  "billsUtilities",
  "healthcare",
  "travel",
  "education",
  "business",
  "other",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** English labels shown in the category dropdown (messages/en.json). */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  foodDining: "Food & Dining",
  transportation: "Transportation",
  shopping: "Shopping",
  entertainment: "Entertainment",
  billsUtilities: "Bills & Utilities",
  healthcare: "Healthcare",
  travel: "Travel",
  education: "Education",
  business: "Business",
  other: "Other",
};

export const categorizeResponse = z.object({ category: z.enum(CATEGORY_KEYS) }).strict();

export const parseExpenseResponse = z
  .object({
    amount: z.number().nullable(),
    description: z.string().min(1),
    category: z.enum(CATEGORY_KEYS).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const insightsResponse = z
  .object({
    summary: z.string().min(1),
    trends: z.array(z.string()),
    recommendations: z.array(z.string()),
    alerts: z.array(z.string()),
  })
  .strict();
export type Insights = z.infer<typeof insightsResponse>;

export const errorResponse = z.object({ error: z.string().min(1) });
