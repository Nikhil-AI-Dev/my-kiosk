// src/App.tsx
import React, { useState } from "react";
import {
  Page,
  Container,
  HeaderBar,
  SectionTitle,
  Card,
  Input,
  Button,
  Subtle,
} from "./ui";

export default function App() {
  const [tab, setTab] = useState<"kiosk" | "manager" | "settings">("kiosk");

  return (
    <Page>
      <HeaderBar
        title="Timeclock Kiosk"
        subtitle="Org: o · Site: s · Device: d"
        tabs={[
          { id: "kiosk", label: "Kiosk", active: tab === "kiosk", onClick: () => setTab("kiosk") },
          { id: "manager", label: "Manager", active: tab === "manager", onClick: () => setTab("manager") },
          { id: "settings", label: "Settings", active: tab === "settings", onClick: () => setTab("settings") },
        ]}
      />

      <Container>
        {tab === "kiosk" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Employee Kiosk */}
            <section>
              <SectionTitle>Employee Kiosk</SectionTitle>

              <Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card title="Enter your Employee ID">
                    <Input placeholder="e.g., E12345" />
                  </Card>

                  <Card title="Device status">
                    <div className="font-medium">Online</div>
                    <Subtle>Unsynced events: 0</Subtle>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Button>Clock-in</Button>
                    <Button>Clock-out</Button>
                  </div>

                  <Card title="Last event">
                    <div className="text-white/90">x · clock-in · 5/31/2025, 4:40:10 PM</div>
                  </Card>
                </div>

                <div className="mt-6">
                  <div className="text-sm text-white/60 mb-2">New here?</div>
                  <Button>Self-register</Button>
                </div>
              </Card>
            </section>

            {/* Right: Kiosk Event Log */}
            <section>
              <SectionTitle>Kiosk Event Log (this device)</SectionTitle>
              <Card>
                <div className="flex items-center justify-between text-sm text-white/60 mb-3">
                  <div>Showing latest events for this device</div>
                  <div className="flex gap-4">
                    <span>Queued: 0</span>
                    <span>Synced: 1</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-white inline-block" />
                    <div className="font-semibold">x · CLOCK-IN</div>
                  </div>
                  <div className="text-sm text-white/60 mt-1">
                    5/31/2025, 4:40:10 PM · Seq 1 · Factors: employeeId + simulated
                  </div>
                </div>
              </Card>
            </section>
          </div>
        )}

        {tab === "manager" && (
          <div className="space-y-6">
            <SectionTitle>Manager</SectionTitle>
            <Card>
              <div className="text-white/80">
                Placeholder — we’ll wire approvals and directory after the UI is locked.
              </div>
            </Card>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-6">
            <SectionTitle>Settings</SectionTitle>
            <Card>
              <div className="text-white/80">
                Placeholder — enrollment, selfie retention, admin code come next.
              </div>
            </Card>
          </div>
        )}
      </Container>
    </Page>
  );
}
