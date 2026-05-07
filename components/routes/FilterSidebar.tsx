"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlidersHorizontalIcon } from "lucide-react";

export interface FilterState {
  parkTypes: string[];
  difficulties: string[];
  maxLength: number;
  sort: string;
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

const parkTypes = ["urban", "forest", "waterfront", "national"];
const difficulties = ["easy", "moderate", "hard"];

export default function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const [open, setOpen] = useState(true);

  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="md:hidden mb-2" onClick={() => setOpen(!open)}>
        <SlidersHorizontalIcon className="h-4 w-4 mr-1" /> Filters
      </Button>
      <Card className={`${open ? "block" : "hidden"} md:block`}>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium mb-2">Park Type</p>
            <div className="space-y-1.5">
              {parkTypes.map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer capitalize">
                  <Checkbox
                    checked={filters.parkTypes.includes(t)}
                    onCheckedChange={() => onChange({ ...filters, parkTypes: toggle(filters.parkTypes, t) })}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">Difficulty</p>
            <div className="flex gap-1 flex-wrap">
              {difficulties.map((d) => (
                <Badge
                  key={d}
                  variant={filters.difficulties.includes(d) ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => onChange({ ...filters, difficulties: toggle(filters.difficulties, d) })}
                >
                  {d}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium mb-2">Max Length: {filters.maxLength} km</p>
            <Slider
              min={1} max={50} step={1}
              value={[filters.maxLength]}
              onValueChange={([v]) => onChange({ ...filters, maxLength: v })}
            />
          </div>
          <div>
            <p className="font-medium mb-2">Sort By</p>
            <div className="flex flex-col gap-1">
              {["popular", "new", "short"].map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer capitalize">
                  <input type="radio" name="sort" value={s} checked={filters.sort === s} onChange={() => onChange({ ...filters, sort: s })} />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
