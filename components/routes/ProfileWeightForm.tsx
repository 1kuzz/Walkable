"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProfileWeightFormProps {
  initialWeightKg: number;
}

export default function ProfileWeightForm({ initialWeightKg }: ProfileWeightFormProps) {
  const [weightKg, setWeightKg] = useState(initialWeightKg.toString());
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Calorie settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="weightKg">Your weight (kg)</label>
          <Input
            id="weightKg"
            type="number"
            min={30}
            max={300}
            step={0.1}
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setStatus(null);
              const response = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weightKg: Number(weightKg) }),
              });
              setSaving(false);
              setStatus(response.ok ? "Saved" : "Could not save your weight");
            }}
          >
            {saving ? "Saving…" : "Save weight"}
          </Button>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
