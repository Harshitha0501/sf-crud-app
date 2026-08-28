import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Cloud,
  LogOut,
  Plus,
  RefreshCcw,
  Pencil,
  Trash2,
  Eye,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import RecordDialog from "@/components/RecordDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

const PAGE_SIZE = 20;

export default function Dashboard() {
  const [objects, setObjects] = useState([]);
  const [selected, setSelected] = useState("Account");
  const [fields, setFields] = useState([]);
  const [records, setRecords] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totalSize, setTotalSize] = useState(null);
  const [me, setMe] = useState(null);

  const [dialog, setDialog] = useState({ open: false, mode: "create", record: null });
  const [confirm, setConfirm] = useState({ open: false, record: null });

  const scrollRef = useRef(null);

  useEffect(() => {
    api.get("/objects").then((r) => setObjects(r.data.objects)).catch(() => {});
    api.get("/auth/me").then((r) => setMe(r.data)).catch(() => {});
  }, []);

  const loadFields = useCallback(async (obj) => {
    const r = await api.get(`/objects/${obj}/fields`);
    setFields(r.data.fields);
  }, []);

  const loadPage = useCallback(
    async (obj, pageOffset, append) => {
      setLoading(true);
      try {
        const r = await api.get(`/objects/${obj}/records`, {
          params: { offset: pageOffset, limit: PAGE_SIZE },
        });
        setHasMore(r.data.hasMore);
        setRecords((prev) => (append ? [...prev, ...r.data.records] : r.data.records));
        if (r.data.totalSize != null) setTotalSize(r.data.totalSize);
      } catch (e) {
        toast.error(
          e?.response?.data?.detail
            ? typeof e.response.data.detail === "string"
              ? e.response.data.detail
              : "Failed to load records"
            : "Failed to load records",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selected) return;
    setRecords([]);
    setOffset(0);
    setHasMore(false);
    setTotalSize(null);
    loadFields(selected);
    loadPage(selected, 0, false);
  }, [selected, loadFields, loadPage]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      const next = offset + PAGE_SIZE;
      setOffset(next);
      loadPage(selected, next, true);
    }
  };

  const refresh = () => {
    setOffset(0);
    loadPage(selected, 0, false);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    localStorage.removeItem("sf_session");
    window.location.href = "/login";
  };

  const openCreate = () => setDialog({ open: true, mode: "create", record: null });
  const openEdit = (rec) => setDialog({ open: true, mode: "edit", record: rec });
  const openView = (rec) => setDialog({ open: true, mode: "view", record: rec });

  const saveRecord = async (payload) => {
    try {
      if (dialog.mode === "create") {
        await api.post(`/objects/${selected}/records`, { fields: payload });
        toast.success(`${selected} created`);
      } else {
        await api.patch(`/objects/${selected}/records/${dialog.record.Id}`, {
          fields: payload,
        });
        toast.success(`${selected} updated`);
      }
      setDialog({ open: false, mode: "create", record: null });
      refresh();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Save failed");
    }
  };

  const doDelete = async () => {
    const rec = confirm.record;
    if (!rec) return;
    try {
      await api.delete(`/objects/${selected}/records/${rec.Id}`);
      toast.success(`${selected} deleted`);
      setConfirm({ open: false, record: null });
      setRecords((prev) => prev.filter((r) => r.Id !== rec.Id));
      if (totalSize != null) setTotalSize(totalSize - 1);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400">
              <Cloud size={22} />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">
                Salesforce CRUD Console
              </div>
              <div className="text-xs text-slate-500">
                {me?.display_name || me?.username || "Signed in"} ·{" "}
                <span className="text-slate-400">{me?.instance_url}</span>
              </div>
            </div>
          </div>
          <Button
            data-testid="logout-btn"
            variant="ghost"
            onClick={logout}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <LogOut size={16} className="mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-slate-400">
              Salesforce Object
            </label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger
                data-testid="object-select"
                className="w-[260px] h-11 bg-slate-900 border-slate-700 text-slate-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                {objects.map((o) => (
                  <SelectItem
                    key={o}
                    value={o}
                    data-testid={`object-option-${o}`}
                    className="focus:bg-slate-800"
                  >
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500">
              {totalSize != null
                ? `${totalSize.toLocaleString()} total · showing ${records.length}`
                : `Showing ${records.length}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              data-testid="refresh-btn"
              onClick={refresh}
              variant="outline"
              className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
            >
              <RefreshCcw size={16} className="mr-2" />
              Refresh
            </Button>
            <Button
              data-testid="new-record-btn"
              onClick={openCreate}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
            >
              <Plus size={16} className="mr-2" />
              New {selected}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="records-scroll overflow-auto rounded-xl border border-slate-800 bg-slate-950/60"
          style={{ maxHeight: "calc(100vh - 260px)" }}
          data-testid="records-scroll"
        >
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                {fields.map((f) => (
                  <th key={f.name} className="px-4 py-3 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.Id}
                  data-testid={`record-row-${r.Id}`}
                  className="border-t border-slate-800/70 hover:bg-slate-900/60 transition-colors fade-in"
                >
                  {fields.map((f) => (
                    <td key={f.name} className="px-4 py-3 text-slate-200">
                      {formatCell(r[f.name])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          data-testid={`row-actions-${r.Id}`}
                          size="icon"
                          variant="ghost"
                          className="text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      >
                        <DropdownMenuItem
                          data-testid={`view-btn-${r.Id}`}
                          onClick={() => openView(r)}
                          className="focus:bg-slate-800"
                        >
                          <Eye size={14} className="mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`edit-btn-${r.Id}`}
                          onClick={() => openEdit(r)}
                          className="focus:bg-slate-800"
                        >
                          <Pencil size={14} className="mr-2" /> Update
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`delete-btn-${r.Id}`}
                          onClick={() => setConfirm({ open: true, record: r })}
                          className="text-rose-300 focus:text-rose-200 focus:bg-rose-500/10"
                        >
                          <Trash2 size={14} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td
                    colSpan={fields.length + 1}
                    className="text-center text-slate-500 py-16"
                  >
                    No {selected} records yet. Click "New {selected}" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              Loading records…
            </div>
          )}
          {!loading && !hasMore && records.length > 0 && (
            <div className="text-center text-xs text-slate-500 py-4">
              End of results
            </div>
          )}
        </div>
      </main>

      <RecordDialog
        open={dialog.open}
        mode={dialog.mode}
        object={selected}
        fields={fields}
        record={dialog.record}
        onClose={() => setDialog({ open: false, mode: "create", record: null })}
        onSave={saveRecord}
      />

      <ConfirmDialog
        open={confirm.open}
        title={`Delete ${selected} record?`}
        description="This action cannot be undone."
        onCancel={() => setConfirm({ open: false, record: null })}
        onConfirm={doDelete}
      />
    </div>
  );
}

function formatCell(v) {
  if (v === null || v === undefined || v === "") return <span className="text-slate-600">—</span>;
  if (typeof v === "number") return v.toLocaleString();
  const s = String(v);
  if (s.length > 60) return s.slice(0, 57) + "…";
  return s;
}
