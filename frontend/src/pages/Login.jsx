import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Cloud, LogIn, ShieldCheck } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sf_session")) {
      nav("/", { replace: true });
      return;
    }
    api
      .get("/auth/config")
      .then((r) => setConfigured(r.data.configured))
      .catch(() => setConfigured(false));
    const err = params.get("error");
    if (err) toast.error(`Login failed: ${err}`);
  }, [nav, params]);

  const startLogin = () => {
    if (!configured) {
      toast.error(
        "Backend is missing Salesforce OAuth credentials. Configure backend/.env",
      );
      return;
    }
    setLoading(true);
    window.location.href = `${API}/auth/login`;
  };

  return (
    <div className="min-h-screen bg-[#0b1220] bg-grid text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="cloud-glow rounded-2xl bg-slate-900/70 backdrop-blur-md border border-sky-500/20 p-8 fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400">
              <Cloud size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Salesforce CRUD Console
              </h1>
              <p className="text-sm text-slate-400">
                OAuth 2.0 via External Client App
              </p>
            </div>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            Sign in to your Salesforce Developer Org to view, create, update
            and delete records across{" "}
            <span className="text-sky-300 font-medium">
              Account, Opportunity, Lead, Contact and Case
            </span>{" "}
            without leaving this app.
          </p>

          <Button
            data-testid="sf-login-btn"
            onClick={startLogin}
            disabled={loading}
            className="w-full h-12 text-base bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-xl transition-all"
          >
            <LogIn className="mr-2" size={18} />
            {loading ? "Redirecting…" : "Login with Salesforce"}
          </Button>

          {!configured && (
            <div
              data-testid="config-warning"
              className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"
            >
              Backend not configured. Set{" "}
              <code className="text-amber-200">SF_CLIENT_ID</code>,{" "}
              <code className="text-amber-200">SF_CLIENT_SECRET</code>,{" "}
              <code className="text-amber-200">SF_REDIRECT_URI</code> and{" "}
              <code className="text-amber-200">FRONTEND_URL</code> in{" "}
              <code className="text-amber-200">backend/.env</code>.
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} className="text-emerald-400" />
            Access &amp; refresh tokens are stored server-side. Only a session
            token lives in your browser.
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Built for the Associate Software Engineer assignment · React +
          FastAPI + MongoDB
        </p>
        <p className="mt-2 text-center text-xs">
          <a
            data-testid="download-source-link"
            href="/sf-crud-app.zip"
            className="text-sky-400 hover:text-sky-300 underline underline-offset-4"
            download
          >
            Download full source (.zip)
          </a>
        </p>
      </div>
    </div>
  );
}
