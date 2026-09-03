import { z } from "zod";
import { QUIZ_DIFFICULTIES, QUIZ_FORMATS, isDifficultyAllowed } from "./format.ts";

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const DURATION_MAX_MINUTES = 480; // 8 hours — a sane app-level cap, not a DB constraint.

/** Converts a blank form field to `undefined` so `.optional()` applies to it. */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalDurationMinutes = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: "Time limit must be a number" })
    .int("Time limit must be a whole number of minutes")
    .min(1, "Time limit must be at least 1 minute")
    .max(DURATION_MAX_MINUTES, `Time limit must be ${DURATION_MAX_MINUTES} minutes or fewer`)
    .optional()
);

const optionalDeadline = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid deadline")
    .refine(
      (value) => Date.parse(value) > Date.now(),
      "Deadline must be in the future"
    )
    .optional()
);

export const quizFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(TITLE_MAX_LENGTH, `Title must be ${TITLE_MAX_LENGTH} characters or fewer`),
    description: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .max(DESCRIPTION_MAX_LENGTH, `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`)
        .optional()
    ),
    format: z.enum(QUIZ_FORMATS, { error: "Select a quiz format" }),
    difficulty: z.enum(QUIZ_DIFFICULTIES, { error: "Select a difficulty level" }),
    multipleChoiceCount: z.coerce
      .number({ error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Must be 0 or more"),
    trueFalseCount: z.coerce
      .number({ error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Must be 0 or more"),
    durationMinutes: optionalDurationMinutes,
    deadline: optionalDeadline,
  })
  .refine((data) => isDifficultyAllowed(data.format, data.difficulty), {
    message: "This difficulty isn't available for the selected quiz format.",
    path: ["difficulty"],
  })
  .refine((data) => data.format !== "vocabulary" || data.trueFalseCount === 0, {
    message: "Vocabulary Quiz doesn't support True/False questions.",
    path: ["trueFalseCount"],
  })
  .refine(
    (data) => data.multipleChoiceCount + data.trueFalseCount >= 1,
    {
      message: "Add at least one question — Multiple Choice or True/False",
      path: ["multipleChoiceCount"],
    }
  );

export type QuizFormValues = z.infer<typeof quizFormSchema>;
