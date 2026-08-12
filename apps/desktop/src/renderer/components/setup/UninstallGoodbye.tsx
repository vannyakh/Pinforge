import React, { useState } from "react";
import { Button, Checkbox } from "@arco-design/web-react";
import logoUrl from "@renderer/assets/logo.png";
import { api } from "@renderer/api";

export type UninstallGoodbyeProps = {
  onCancel: () => void;
};

function platformRemoveHint(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Mac|iPhone|iPad/i.test(ua)) {
    return "After quitting, drag Pinforge from Applications to the Trash to finish removing the app.";
  }
  if (/Windows/i.test(ua)) {
    return "After quitting, remove Pinforge from Apps & features if the uninstaller does not open automatically.";
  }
  return "After quitting, remove the Pinforge application from your system to finish uninstalling.";
}

const UninstallGoodbye: React.FC<UninstallGoodbyeProps> = ({ onCancel }) => {
  const [clearData, setClearData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmUninstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.uninstallApp({ clearData });
      if (!res.ok) {
        setError(res.message || "Uninstall failed");
        setBusy(false);
      }
      // On success the process exits; keep busy state.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="env-setup env-goodbye" data-theme="dark">
      <header className="env-setup__titlebar">
        <div className="env-setup__brand">
          <img className="env-setup__brand-logo" src={logoUrl} alt="" draggable={false} />
          <span className="env-setup__brand-name">Pinforge</span>
          <span className="env-setup__brand-tag">Uninstall</span>
        </div>
      </header>

      <main className="env-goodbye__stage">
        <div className="env-goodbye__glow" aria-hidden />
        <img className="env-goodbye__logo" src={logoUrl} alt="Pinforge" draggable={false} />
        <h1 className="env-goodbye__title">Goodbye from Pinforge</h1>
        <p className="env-goodbye__lead">
          Thanks for trying Pinforge. Confirm below to uninstall and leave the app.
        </p>
        <p className="env-goodbye__hint">{platformRemoveHint()}</p>

        <label className="env-goodbye__check">
          <Checkbox checked={clearData} disabled={busy} onChange={(v) => setClearData(Boolean(v))}>
            Remove all Pinforge data from this computer
          </Checkbox>
        </label>
        <p className="env-goodbye__check-hint">
          Settings, download history, installed tools, and extensions. Your saved media folders are
          not deleted.
        </p>

        {error && <p className="env-goodbye__error">{error}</p>}

        <div className="env-goodbye__actions">
          <Button disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            status="danger"
            type="primary"
            loading={busy}
            onClick={() => void confirmUninstall()}
          >
            Uninstall
          </Button>
        </div>
      </main>
    </div>
  );
};

export default UninstallGoodbye;
