import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================================
   KIOSK TIME CLOCK – BLACK & WHITE (MVP, functional + MVP layout)
   - Employee ID flow (+ biometric hold + optional selfie)
   - Self-register with manager approval
   - Device enrollment & admin code (demo only)
   - Local offline queue + event log
   - CSV export
   - **Layout tweak**: Kiosk left + Event Log right on lg screens
============================================================================ */

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowISO = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function sha256(str: string) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DB_KEY = "bw_kiosk_db_v2";
const TABS = ["kiosk", "manager", "settings"] as const;
type Tab = (typeof TABS)[number];

/* --------------------------------- Types ---------------------------------- */
interface Employee {
  id: string;
  orgId: string;
  siteId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  status: "pending" | "active" | "disabled";
  createdAt: string;
  profileSelfie?: string;
}

interface EventRecord {
  id: string;
  orgId: string;
  siteId: string;
  deviceId: string;
  employeeId: string; // internal id reference
  type: "clock-in" | "clock-out";
  ts: string;
  factors: { identity: "employeeId" | "fingerprint" | "nfc" | "qr"; biometric: "strong" | "weak" | "simulated" };
  selfieDataUrl?: string;
  offlineSeq: number;
  synced: boolean;
}

interface DeviceSettings {
  enrolled: boolean;
  orgId: string;
  siteId: string;
  deviceId: string;
  online: boolean;
  selfieRetentionWeeks: number;
  requireSelfie: boolean;
  requireStrongBiometric: boolean;
  adminCodeHash?: string;
}

interface DB {
  employees: Employee[];
  events: EventRecord[];
  device: DeviceSettings;
  pendingSeq: number;
}

/* --------------------------------- DB ------------------------------------- */
function loadDB(): DB {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const init: DB = {
      employees: [],
      events: [],
      device: {
        enrolled: true,
        orgId: "o",
        siteId: "s",
        deviceId: "d",
        online: true,
        selfieRetentionWeeks: 4,
        requireSelfie: true,
        requireStrongBiometric: true,
        adminCodeHash: undefined,
      },
      pendingSeq: 1,
    };
    sha256("246810").then((h) => {
      init.device.adminCodeHash = h;
      localStorage.setItem(DB_KEY, JSON.stringify(init));
    });
    return init;
  }
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(DB_KEY);
    return loadDB();
  }
}

function saveDB(db: DB) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function purgeOldSelfies(db: DB) {
  const weeks = db.device.selfieRetentionWeeks;
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  db.events = db.events.map((e) => {
    if (e.selfieDataUrl && new Date(e.ts).getTime() < cutoff) {
      changed = true;
      return { ...e, selfieDataUrl: undefined };
    }
    return e;
  });
  if (changed) saveDB(db);
}

/* ------------------------------ Camera hook ------------------------------- */
function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (videoRef.current) {
        (videoRef.current as HTMLVideoElement).srcObject = stream;
        await (videoRef.current as HTMLVideoElement).play();
      }
      setActive(true);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Unable to access camera");
    }
  };

  const stop = () => {
    const v = videoRef.current;
    if (v && (v as any).srcObject) {
      ((v as any).srcObject as MediaStream).getTracks().forEach((t: MediaStreamTrack) => t.stop());
      (v as any).srcObject = null;
    }
    setActive(false);
  };

  const capture = (w = 320, h = 320) => {
    const v = videoRef.current;
    if (!v) return null;
    const canvas = document.createElement("canvas");
    const size = Math.min((v as HTMLVideoElement).videoWidth || w, (v as HTMLVideoElement).videoHeight || h, 640);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      v as HTMLVideoElement,
      ((v as HTMLVideoElement).videoWidth - size) / 2,
      ((v as HTMLVideoElement).videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size
    );
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  return { videoRef, active, error, start, stop, capture };
}

/* --------------------- Biometric presence (simulated) --------------------- */
function BiometricHoldButton({ onConfirm }: { onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);

  const startHold = () => {
    setHolding(true);
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 1200);
      setProgress(p);
      if (p < 1) {
        timer.current = requestAnimationFrame(step);
      } else {
        onConfirm();
        navigator.vibrate?.(50);
        setHolding(false);
        setProgress(0);
      }
    };
    timer.current = requestAnimationFrame(step);
  };
  const cancelHold = () => {
    if (timer.current) cancelAnimationFrame(timer.current);
    setHolding(false);
    setProgress(0);
  };

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      className="relative w-full rounded-2xl border border-white/40 bg-black text-white py-5 font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-white/80"
    >
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        <div className="h-full bg-white/10" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="relative z-10">{holding ? "Keep holding…" : "Hold 1.2s to confirm"}</span>
    </button>
  );
}

/* --------------------------------- App ------------------------------------ */
export default function App() {
  const [db, setDb] = useState<DB>(() => loadDB());
  const [tab, setTab] = useState<Tab>("kiosk");
  const [adminAuthed, setAdminAuthed] = useState(false);

  useEffect(() => {
    purgeOldSelfies(db);
  }, []);
  useEffect(() => {
    purgeOldSelfies(db);
  }, [db.device.selfieRetentionWeeks]);

  // very light "sync": mark unsynced as synced if we're online
  useEffect(() => {
    if (!db.device.online) return;
    const next = { ...db };
    let changed = false;
    next.events = next.events.map((e) => (!e.synced ? ((changed = true), { ...e, synced: true }) : e));
    if (changed) save(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.device.online]);

  const save = (next: DB) => {
    setDb(next);
    saveDB(next);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white text-black grid place-content-center font-bold">⏱</div>
          <div>
            <div className="font-semibold tracking-wide">Timeclock Kiosk</div>
            <div className="text-xs text-white/60">
              {db.device.enrolled ? (
                <>Org: {db.device.orgId} · Site: {db.device.siteId} · Device: {db.device.deviceId}</>
              ) : (
                <span className="text-red-300">Not enrolled</span>
              )}
            </div>
          </div>
        </div>
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-xl border ${
                tab === t ? "bg-white text-black border-white" : "border-white/30"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {/* Wider only for Kiosk to allow 2-up layout */}
      <main className={`p-6 mx-auto ${tab === "kiosk" ? "max-w-6xl" : "max-w-xl"}`}>
        {tab === "kiosk" && <KioskView db={db} save={save} />}
        {tab === "manager" && (
          <ManagerView db={db} save={save} adminAuthed={adminAuthed} setAdminAuthed={setAdminAuthed} />
        )}
        {tab === "settings" && <SettingsView db={db} save={save} />}
      </main>
    </div>
  );
}

/* ------------------------------ Section UI -------------------------------- */
function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      <h2 className="text-sm font-semibold tracking-wide mb-3 text-white/90">{title}</h2>
      <div className="border border-white/15 rounded-2xl p-4 bg-white/5 backdrop-blur-sm">{children}</div>
    </section>
  );
}

/* ------------------------------ Kiosk View -------------------------------- */
function KioskView({ db, save }: { db: DB; save: (x: DB) => void }) {
  const [mode, setMode] = useState<"home" | "register" | "punch">("home");
  const [typedEmployeeId, setTypedEmployeeId] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [punchType, setPunchType] = useState<"clock-in" | "clock-out">("clock-in");
  const cam = useCamera();

  const resolveEmployee = (empId: string) => {
    const e = db.employees.find(
      (x) =>
        x.orgId === db.device.orgId &&
        x.siteId === db.device.siteId &&
        x.employeeId.toLowerCase() === empId.trim().toLowerCase()
    );
    setEmployee(e || null);
  };

  const startPunch = () => {
    if (!db.device.enrolled) {
      alert("Device not enrolled. Contact admin.");
      return;
    }
    resolveEmployee(typedEmployeeId);
    setMode("punch");
  };

  const completePunch = async (selfie?: string) => {
    if (!db.device.enrolled) return;
    const emp = employee;
    if (!emp) return;
    if (emp.status !== "active") {
      alert("Employee not approved yet.");
      return;
    }
    const seq = db.pendingSeq;
    const ev: EventRecord = {
      id: uid(),
      orgId: db.device.orgId,
      siteId: db.device.siteId,
      deviceId: db.device.deviceId,
      employeeId: emp.id,
      type: punchType,
      ts: nowISO(),
      factors: { identity: "employeeId", biometric: db.device.requireStrongBiometric ? "simulated" : "weak" },
      selfieDataUrl: db.device.requireSelfie ? selfie : undefined,
      offlineSeq: seq,
      synced: db.device.online ? true : false,
    };
    const next: DB = { ...db, events: [...db.events, ev], pendingSeq: seq + 1 };
    save(next);
    setTypedEmployeeId("");
    setEmployee(null);
    setMode("home");
    alert(`${punchType.replace("-", " ")} recorded for ${emp.firstName} ${emp.lastName}`);
  };

  const deviceEvents = useMemo(
    () =>
      db.events
        .filter(
          (e) => e.orgId === db.device.orgId && e.siteId === db.device.siteId && e.deviceId === db.device.deviceId
        )
        .sort((a, b) => b.ts.localeCompare(a.ts)),
    [db]
  );
  const queuedCount = deviceEvents.filter((e) => !e.synced).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* LEFT: Employee Kiosk */}
      <Section title="Employee Kiosk" className="mb-0">
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm">Enter your Employee ID</label>
              <input
                value={typedEmployeeId}
                onChange={(e) => setTypedEmployeeId(e.target.value)}
                placeholder="e.g., E12345"
                className="w-full bg-black text-white border border-white/40 rounded-xl px-4 py-3 mt-1"
              />
              <div className="text-xs text-white/60 mt-2">Your entry will be validated locally, then synced.</div>
            </div>

            <div className="rounded-xl border border-white/20 p-4">
              <div className="font-medium">Device status</div>
              <div className="text-sm text-white/60">
                {db.device.enrolled ? (db.device.online ? "Online" : "Offline") : "Not enrolled"}
              </div>
              <div className="text-xs text-white/50 mt-1">Unsynced events: {queuedCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setPunchType("clock-in");
                startPunch();
              }}
              className="rounded-2xl border border-white/40 py-4 font-semibold"
            >
              Clock-in
            </button>
            <button
              onClick={() => {
                setPunchType("clock-out");
                startPunch();
              }}
              className="rounded-2xl border border-white/40 py-4 font-semibold"
            >
              Clock-out
            </button>
          </div>

          <div className="rounded-xl border border-white/20 p-4">
            <div className="text-sm text-white/60">Last event</div>
            {deviceEvents[0] ? (
              <div className="text-white/90">
                {resolveEmpName(deviceEvents[0].employeeId, db.employees)} · {deviceEvents[0].type} ·{" "}
                {new Date(deviceEvents[0].ts).toLocaleString()}
              </div>
            ) : (
              <div className="text-white/60">No events yet.</div>
            )}
          </div>

          <div className="rounded-xl border border-white/20 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm">New here?</div>
              <div className="text-xs text-white/60">Create your profile.</div>
            </div>
            <button onClick={() => setMode("register")} className="px-3 py-2 rounded-xl border border-white/40">
              Self-register
            </button>
          </div>
        </div>

        {/* Register modal */}
        {mode === "register" && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 grid place-items-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-black p-6">
              <div className="text-lg font-semibold mb-4">Self-register</div>
              <RegisterCard
                onCancel={() => setMode("home")}
                onSubmit={(emp) => {
                  const next: DB = { ...db, employees: [...db.employees, emp] };
                  save(next);
                  setMode("home");
                  alert("Registered. Waiting for manager approval.");
                }}
                cam={cam}
                orgId={db.device.orgId}
                siteId={db.device.siteId}
              />
            </div>
          </div>
        )}

        {/* Punch flow modal */}
        {mode === "punch" && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 grid place-items-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-black p-6">
              <PunchFlow
                typedEmployeeId={typedEmployeeId}
                employee={employee}
                type={punchType}
                onCancel={() => {
                  setEmployee(null);
                  setMode("home");
                }}
                onResolve={(emp) => setEmployee(emp)}
                onComplete={completePunch}
                requireSelfie={db.device.requireSelfie}
                db={db}
              />
            </div>
          </div>
        )}
      </Section>

      {/* RIGHT: Event Log */}
      <Section title="Kiosk Event Log (this device)" className="mb-0">
        <div className="flex items-center justify-between mb-3 text-sm text-white/70">
          <div>Showing latest events for this device</div>
          <div className="flex gap-3">
            <span>Queued: {queuedCount}</span>
            <span>Synced: {deviceEvents.length - queuedCount}</span>
          </div>
        </div>

        <div className="space-y-3 max-h-[540px] overflow-auto pr-1">
          {deviceEvents.slice(0, 50).map((e) => {
            const emp = db.employees.find((x) => x.id === e.employeeId);
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-white/15 p-3">
                <div className={`w-2 h-2 rounded-full ${e.synced ? "bg-white" : "bg-white/40"}`} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeId})` : "Unknown"} ·{" "}
                    <span className="uppercase">{e.type}</span>
                  </div>
                  <div className="text-xs text-white/60">
                    {new Date(e.ts).toLocaleString()} · Seq {e.offlineSeq} · Factors: {e.factors.identity} +{" "}
                    {e.factors.biometric}
                  </div>
                </div>
                {e.selfieDataUrl && (
                  <img
                    src={e.selfieDataUrl}
                    alt="selfie"
                    className="ml-auto w-12 h-12 object-cover rounded-lg border border-white/20"
                  />
                )}
              </div>
            );
          })}
          {deviceEvents.length === 0 && <div className="text-white/60">No events yet.</div>}
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------- Registration -------------------------------- */
function RegisterCard({
  onCancel,
  onSubmit,
  cam,
  orgId,
  siteId,
}: {
  onCancel: () => void;
  onSubmit: (e: Employee) => void;
  cam: ReturnType<typeof useCamera>;
  orgId: string;
  siteId: string;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const validPhone = (p: string) => p === "" || /^\+?[0-9]{7,15}$/.test(p);

  const submit = () => {
    if (!employeeId || !firstName || !lastName) {
      alert("Employee ID, First and Last name are required");
      return;
    }
    if (!validPhone(phone)) {
      alert("Phone should be digits with optional + and 7-15 total");
      return;
    }
    const emp: Employee = {
      id: uid(),
      orgId,
      siteId,
      employeeId: employeeId.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      status: "pending",
      createdAt: nowISO(),
      profileSelfie: cam.active ? cam.capture() || undefined : undefined,
    };
    onSubmit(emp);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <label className="block">
          Employee ID
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2" />
        </label>
        <label className="block">
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2" />
        </label>
        <label className="block">
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2" />
        </label>
        <label className="block">
          Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2" placeholder="+15551234567" />
        </label>
        <label className="block">
          Address (optional)
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2" rows={3} />
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/40">Cancel</button>
          <button onClick={submit} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">Submit</button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm text-white/60">Optional profile selfie</div>
        {!cam.active ? (
          <button
            onClick={cam.start}
            className="w-full aspect-video rounded-2xl border border-white/30 grid place-content-center"
          >
            Enable camera
          </button>
        ) : (
          <div className="space-y-2">
            <video ref={cam.videoRef} className="w-full aspect-video rounded-2xl border border-white/30 object-cover" />
            <div className="flex gap-2">
              <button onClick={() => cam.stop()} className="flex-1 rounded-xl border border-white/40 py-2">Stop</button>
              <button className="flex-1 rounded-xl border border-white/40 py-2 bg-white text-black">Capture on Submit</button>
            </div>
            {cam.error && <div className="text-xs text-red-400 mt-1">{cam.error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Punch Flow -------------------------------- */
function PunchFlow({
  typedEmployeeId,
  employee,
  type,
  onCancel,
  onResolve,
  onComplete,
  requireSelfie,
  db,
}: {
  typedEmployeeId: string;
  employee: Employee | null;
  type: "clock-in" | "clock-out";
  onCancel: () => void;
  onResolve: (e: Employee) => void;
  onComplete: (selfie?: string) => void;
  requireSelfie: boolean;
  db: DB;
}) {
  const cam = useCamera();
  const [step, setStep] = useState<"identify" | "presence" | "selfie">(employee ? "presence" : "identify");

  const tryResolve = () => {
    const e = db.employees.find(
      (x) =>
        x.orgId === db.device.orgId &&
        x.siteId === db.device.siteId &&
        x.employeeId.toLowerCase() === typedEmployeeId.trim().toLowerCase()
    );
    if (!e) {
      alert("Employee ID not found. Please self-register or contact manager.");
      return;
    }
    if (e.status !== "active") {
      alert("Employee is not approved yet.");
      return;
    }
    onResolve(e);
    setStep("presence");
  };

  const confirmPresence = async () => {
    setStep(requireSelfie ? "selfie" : (undefined as any));
    if (!requireSelfie) {
      await sleep(150);
      onComplete();
    }
  };

  const takeSelfieAndComplete = () => {
    const shot = cam.active ? cam.capture() || undefined : undefined;
    onComplete(shot);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/20 p-4">
        <div className="text-sm text-white/60">Punch</div>
        <div className="text-lg font-semibold">{type.toUpperCase()}</div>
      </div>

      {step === "identify" && (
        <div className="rounded-2xl border border-white/20 p-4 space-y-3">
          <div className="text-sm text-white/60">Confirm your Employee ID</div>
          <div className="flex gap-2">
            <input defaultValue={typedEmployeeId} readOnly className="flex-1 bg-black text-white border border-white/40 rounded-xl px-4 py-3" />
            <button onClick={tryResolve} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
              Continue
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/40">Cancel</button>
          </div>
        </div>
      )}

      {step === "presence" && (
        <div className="rounded-2xl border border-white/20 p-4">
          <div className="text-sm text-white/60 mb-2">Biometric presence (simulated)</div>
          <BiometricHoldButton onConfirm={confirmPresence} />
          <div className="text-xs text-white/50 mt-2">
            In production, wire to device biometrics (Android/iOS) or external fingerprint (Android).
          </div>
          <div className="pt-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/40">Cancel</button>
          </div>
        </div>
      )}

      {step === "selfie" && (
        <div className="rounded-2xl border border-white/20 p-4">
          <div className="text-sm text-white/60 mb-2">Audit selfie</div>
          {!cam.active ? (
            <button
              onClick={cam.start}
              className="w-full aspect-video rounded-2xl border border-white/30 grid place-content-center"
            >
              Enable camera
            </button>
          ) : (
            <video ref={cam.videoRef} className="w-full aspect-video rounded-2xl border border-white/30 object-cover" />
          )}
          <div className="flex gap-3 pt-3">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-white/40">Cancel</button>
            <button onClick={takeSelfieAndComplete} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
              Capture & Complete
            </button>
          </div>
          {cam.error && <div className="text-xs text-red-400 mt-1">{cam.error}</div>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Manager View ------------------------------- */
function ManagerView({
  db,
  save,
  adminAuthed,
  setAdminAuthed,
}: {
  db: DB;
  save: (x: DB) => void;
  adminAuthed: boolean;
  setAdminAuthed: (b: boolean) => void;
}) {
  const [code, setCode] = useState("");
  const [filterSite, setFilterSite] = useState(db.device.siteId);

  const login = async () => {
    if (!db.device.adminCodeHash) {
      alert("Admin code not set. Ask admin.");
      return;
    }
    const ok = (await sha256(code)) === db.device.adminCodeHash;
    if (ok) {
      setAdminAuthed(true);
      setCode("");
    } else alert("Invalid admin code");
  };

  if (!adminAuthed) {
    return (
      <div className="max-w-xl mx-auto">
        <Section title="Manager/Admin access" className="mb-0">
          <input
            type="password"
            placeholder="Enter Admin Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2"
          />
          <div className="pt-3">
            <button onClick={login} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
              Enter
            </button>
          </div>
          <div className="text-xs text-white/50 mt-2">Demo default: 246810 (can be changed by Admin in Settings).</div>
        </Section>
      </div>
    );
  }

  const approve = (id: string) => {
    const next = { ...db, employees: db.employees.map((e) => (e.id === id ? { ...e, status: "active" } : e)) };
    save(next);
  };
  const disable = (id: string) => {
    const next = { ...db, employees: db.employees.map((e) => (e.id === id ? { ...e, status: "disabled" } : e)) };
    save(next);
  };

  const siteEvents = [...db.events].filter((e) => e.siteId === filterSite).sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Section title="Approvals" className="mb-0">
        <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
          {db.employees
            .filter((e) => e.status !== "active")
            .map((e) => (
              <div key={e.id} className="flex items-center gap-3 border border-white/20 rounded-2xl p-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {e.firstName} {e.lastName} ({e.employeeId})
                  </div>
                  <div className="text-xs text-white/60">
                    Phone: {e.phone || "—"} · Submitted: {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                {e.profileSelfie && (
                  <img
                    src={e.profileSelfie}
                    className="ml-auto w-10 h-10 rounded-lg object-cover border border-white/20"
                  />
                )}
                <div className="ml-auto flex gap-2">
                  <button onClick={() => approve(e.id)} className="px-3 py-2 rounded-xl border border-white/40 bg-white text-black">
                    Approve
                  </button>
                  <button onClick={() => disable(e.id)} className="px-3 py-2 rounded-xl border border-white/40">
                    Disable
                  </button>
                </div>
              </div>
            ))}
          {db.employees.filter((e) => e.status !== "active").length === 0 && (
            <div className="text-white/60">No pending approvals.</div>
          )}
        </div>
      </Section>

      <Section title="Events & Selfies" className="mb-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-white/60">Site</span>
          <input value={filterSite} onChange={(e) => setFilterSite(e.target.value)} className="bg-black text-white border border-white/30 rounded-xl px-3 py-1" />
        </div>
        <div className="max-h-[480px] overflow-auto space-y-3 pr-1">
          {siteEvents.map((e) => {
            const emp = db.employees.find((x) => x.id === e.employeeId);
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-white/15 p-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeId})` : e.employeeId} ·{" "}
                    <span className="uppercase">{e.type}</span>
                  </div>
                  <div className="text-xs text-white/60">
                    {new Date(e.ts).toLocaleString()} · Synced: {e.synced ? "Yes" : "No"} · Factors: {e.factors.identity}{" "}
                    + {e.factors.biometric}
                  </div>
                </div>
                {e.selfieDataUrl ? (
                  <img src={e.selfieDataUrl} alt="selfie" className="ml-auto w-14 h-14 object-cover rounded-lg border border-white/20" />
                ) : (
                  <div className="ml-auto text-xs text-white/40">No selfie</div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Employee Directory (this site)">
        <EmployeeDirectory db={db} save={save} />
      </Section>

      <Section title="CSV Export (Local)">
        <CSVExport events={siteEvents} employees={db.employees} />
      </Section>

      <Section title="Admin Session">
        <button onClick={() => setAdminAuthed(false)} className="px-4 py-2 rounded-xl border border-white/40">
          Sign out
        </button>
      </Section>
    </div>
  );
}

function EmployeeDirectory({ db }: { db: DB; save: (x: DB) => void }) {
  const siteEmps = db.employees.filter((e) => e.siteId === db.device.siteId);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-white/70">
          <tr className="border-b border-white/20">
            <th className="text-left py-2">Employee ID</th>
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Phone</th>
            <th className="text-left py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {siteEmps.map((e) => (
            <tr key={e.id} className="border-b border-white/10">
              <td className="py-2">{e.employeeId}</td>
              <td className="py-2">
                {e.firstName} {e.lastName}
              </td>
              <td className="py-2">{e.phone || "—"}</td>
              <td className="py-2">{e.status}</td>
            </tr>
          ))}
          {siteEmps.length === 0 && (
            <tr>
              <td className="py-3 text-white/60" colSpan={4}>
                No employees at this site yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- CSV Export --------------------------------- */
function CSVExport({ events, employees }: { events: EventRecord[]; employees: Employee[] }) {
  const csv = React.useMemo(() => {
    const header = [
      "eventId",
      "employeeName",
      "employeeBusinessId",
      "type",
      "timestamp",
      "synced",
      "biometric",
      "hasSelfie",
    ].join(",");
    const rows = events.map((e) => {
      const emp = employees.find((x) => x.id === e.employeeId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : "";
      const empBizId = emp?.employeeId || "";
      return [
        e.id,
        JSON.stringify(empName),
        empBizId,
        e.type,
        e.ts,
        String(e.synced),
        e.factors.biometric,
        String(!!e.selfieDataUrl),
      ].join(",");
    });
    return [header, ...rows].join("\n");
  }, [events, employees]);

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="flex items-center gap-3">
      <button onClick={download} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
        Download CSV
      </button>
      <div className="text-xs text-white/50">Exports current site events (local demo).</div>
    </div>
  );
}

/* ----------------------------- Settings View ------------------------------ */
function SettingsView({ db, save }: { db: DB; save: (x: DB) => void }) {
  const [online, setOnline] = useState(db.device.online);
  const [requireSelfie, setRequireSelfie] = useState(db.device.requireSelfie);
  const [ret, setRet] = useState(db.device.selfieRetentionWeeks);
  const [token, setToken] = useState("");
  const [adminCode, setAdminCode] = useState("");

  const enroll = () => {
    if (!token.includes("|")) {
      alert("Invalid token format. Expected ORG|SITE|…");
      return;
    }
    const [org, site] = token.split("|");
    const next = {
      ...db,
      device: { ...db.device, enrolled: true, orgId: org, siteId: site, online, requireSelfie, selfieRetentionWeeks: ret },
    };
    save(next);
    setToken("");
    alert("Device enrolled.");
  };

  const setCode = async () => {
    if (!adminCode) {
      alert("Enter a numeric admin code");
      return;
    }
    const next = { ...db, device: { ...db.device, adminCodeHash: await sha256(adminCode) } };
    save(next);
    setAdminCode("");
    alert("Admin code updated.");
  };

  const savePrefs = () => {
    const next = { ...db, device: { ...db.device, online, requireSelfie, selfieRetentionWeeks: ret } };
    save(next);
    alert("Settings saved.");
  };

  const factoryReset = () => {
    if (!confirm("This will clear all local data and unenroll the device. Continue?")) return;
    localStorage.removeItem(DB_KEY);
    window.location.reload();
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Section title="Enrollment & Identity (Read-only after bind)">
        {db.device.enrolled ? (
          <div className="grid gap-2 text-sm">
            <div>
              <span className="text-white/60">Org ID:</span> <span className="font-semibold">{db.device.orgId}</span>
            </div>
            <div>
              <span className="text-white/60">Site ID:</span> <span className="font-semibold">{db.device.siteId}</span>
            </div>
            <div>
              <span className="text-white/60">Device ID:</span> <span className="font-semibold">{db.device.deviceId}</span>
            </div>
            <div className="text-white/60">
              To rebind, perform a Factory Reset (demo). In production, use portal-issued revoke & rebind tokens.
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="text-sm text-white/60">Enter Enrollment Token (from Admin Portal)</div>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ORG-ID|SITE-ID|DATE"
              className="bg-black text-white border border-white/30 rounded-xl px-3 py-2"
            />
            <button onClick={enroll} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
              Enroll Device
            </button>
          </div>
        )}
      </Section>

      <Section title="Connectivity & Privacy">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          <span className="text-sm">Simulate Online</span>
        </label>
        <label className="flex items-center gap-2 mt-3">
          <input type="checkbox" checked={requireSelfie} onChange={(e) => setRequireSelfie(e.target.checked)} />
          <span className="text-sm">Require audit selfie</span>
        </label>
        <label className="block text-sm mt-3">
          Selfie retention (weeks)
          <input
            type="number"
            value={ret}
            min={0}
            max={26}
            onChange={(e) => setRet(Number(e.target.value))}
            className="mt-1 w-full bg-black text-white border border-white/30 rounded-xl px-3 py-2"
          />
        </label>
        <div className="flex gap-3 pt-3">
          <button onClick={savePrefs} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
            Save
          </button>
          <button
            onClick={() => {
              const next = { ...db, device: { ...db.device, online } };
              save(next);
            }}
            className="px-4 py-2 rounded-xl border border-white/40"
          >
            Sync now
          </button>
        </div>
      </Section>

      <Section title="Admin Code (Demo)">
        <div className="text-sm text-white/60 mb-2">Set or rotate the Admin Code used for Manager access.</div>
        <input
          type="password"
          placeholder="Enter new code (e.g., 6 digits)"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
          className="bg-black text-white border border-white/30 rounded-xl px-3 py-2"
        />
        <div className="pt-3">
          <button onClick={setCode} className="px-4 py-2 rounded-xl border border-white/40 bg-white text-black">
            Update Admin Code
          </button>
        </div>
        <div className="text-xs text-white/50 mt-2">
          Default is <strong>246810</strong> for demo. In production, codes come from the Admin Portal.
        </div>
      </Section>

      <Section title="Danger Zone">
        <button onClick={factoryReset} className="px-4 py-2 rounded-xl border border-white/40">
          Factory reset
        </button>
        <div className="text-xs text-white/50 mt-2">Clears local data and unenrolls device.</div>
      </Section>
    </div>
  );
}

/* -------------------------------- helpers --------------------------------- */
function resolveEmpName(employeeInternalId: string, list: Employee[]) {
  const e = list.find((x) => x.id === employeeInternalId);
  if (!e) return "Unknown";
  return `${e.firstName} ${e.lastName} (${e.employeeId})`;
}
