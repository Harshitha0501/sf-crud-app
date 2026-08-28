import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");
    if (error) {
      toast.error(`Login failed: ${error}`);
      nav("/login", { replace: true });
      return;
    }
    if (token) {
      localStorage.setItem("sf_session", token);
      toast.success("Logged in to Salesforce");
      nav("/", { replace: true });
    } else {
      nav("/login", { replace: true });
    }
  }, [params, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-300">
      Completing sign-in…
    </div>
  );
}
