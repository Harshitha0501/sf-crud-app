import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function RecordDialog({
  open,
  mode,
  object,
  fields,
  record,
  onClose,
  onSave,
}) {
  const [values, setValues] = useState({});
  const readOnly = mode === "view";

  useEffect(() => {
    if (!open) return;
    const initial = {};
    for (const f of fields) {
      initial[f.name] = record ? record[f.name] ?? "" : "";
    }
    setValues(initial);
  }, [open, fields, record]);

  const title =
    mode === "create"
      ? `New ${object}`
      : mode === "edit"
        ? `Edit ${object}`
        : `${object} details`;

  const handleChange = (name, val) =>
    setValues((prev) => ({ ...prev, [name]: val }));

  const submit = (e) => {
    e.preventDefault();
    if (readOnly) return onClose();
    const payload = {};
    for (const f of fields) {
      const v = values[f.name];
      if (v !== "" && v !== null && v !== undefined) payload[f.name] = v;
    }
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        data-testid="record-dialog"
        className="bg-slate-900 border-slate-700 text-slate-100 max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-slate-100">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {record?.Id && (
            <div className="text-xs text-slate-500">
              ID: <span className="text-slate-300 font-mono">{record.Id}</span>
            </div>
          )}
          {fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`fld-${f.name}`} className="text-slate-300">
                {f.label}
                {f.required && <span className="text-rose-400 ml-1">*</span>}
              </Label>
              <Input
                id={`fld-${f.name}`}
                data-testid={`field-${f.name}`}
                type={
                  f.type === "number"
                    ? "number"
                    : f.type === "date"
                      ? "date"
                      : "text"
                }
                value={values[f.name] ?? ""}
                onChange={(e) => handleChange(f.name, e.target.value)}
                disabled={readOnly}
                required={!!f.required && !readOnly}
                className="bg-slate-950 border-slate-700 text-slate-100 focus-visible:ring-sky-500 disabled:opacity-70"
              />
            </div>
          ))}
        </form>
        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
            data-testid="dialog-cancel-btn"
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button
              onClick={submit}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
              data-testid="dialog-save-btn"
            >
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
