import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { finishBankSession, syncBanks } from "../services/accountService";

export default function BankCallbackPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Finishing bank connection…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const flow = JSON.parse(sessionStorage.getItem("bank_flow") ?? "{}");
        const code = params.get("code");
        if (params.get("error") || !code) throw new Error(params.get("error") || "No authorization code returned");
        if (flow.state && params.get("state") !== flow.state) throw new Error("State mismatch, please try again");
        await finishBankSession(code, flow.bank, flow.country);
        setMsg("Importing balances and transactions…");
        await syncBanks();
        sessionStorage.removeItem("bank_flow");
        nav("/bank", { replace: true });
      } catch (e: any) { setMsg(e.message); }
    })();
  }, []);

  return <div className="card"><h3>Bank connection</h3><p>{msg}</p></div>;
}
