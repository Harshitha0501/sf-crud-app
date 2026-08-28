import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent
        data-testid="confirm-dialog"
        className="bg-slate-900 border-slate-700 text-slate-100"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-100">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-400">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="confirm-cancel"
            onClick={onCancel}
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-delete"
            onClick={onConfirm}
            className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
