import { z } from "zod";

const NAME_MAX_LENGTH = 80;

/** Trims and collapses internal whitespace runs to a single space. */
const normalizeName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

export const studentJoinSchema = z.object({
  firstName: z.preprocess(
    normalizeName,
    z
      .string()
      .min(1, "First name is required")
      .max(NAME_MAX_LENGTH, "First name is too long")
  ),
  lastName: z.preprocess(
    normalizeName,
    z
      .string()
      .min(1, "Last name is required")
      .max(NAME_MAX_LENGTH, "Last name is too long")
  ),
});

export type StudentJoinValues = z.infer<typeof studentJoinSchema>;
