"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteQuiz } from "@/lib/quizzes/actions";

export function DeleteQuizButton({
  quizId,
  quizTitle,
}: {
  quizId: string;
  quizTitle: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="destructive" size="sm" />}
      >
        <Trash2 className="size-4" />
        Delete draft
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{quizTitle}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the draft and its question structure.
            This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={deleteQuiz.bind(null, quizId)}>
            <AlertDialogAction type="submit" variant="destructive">
              Delete
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
