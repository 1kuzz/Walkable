"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { UploadCloudIcon, XIcon } from "lucide-react";

interface PhotoUploaderProps {
  routeId?: string;
  waypointId?: string;
  onUpload?: (url: string) => void;
}

export default function PhotoUploader({ routeId, waypointId, onUpload }: PhotoUploaderProps) {
  const [previews, setPreviews] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setPreviews((prev) => [
      ...prev,
      ...accepted.map((f) => ({ file: f, preview: URL.createObjectURL(f) })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    maxSize: 10 * 1024 * 1024,
  });

  const uploadAll = async () => {
    setUploading(true);
    for (const { file } of previews) {
      const fd = new FormData();
      fd.append("file", file);
      if (routeId) fd.append("routeId", routeId);
      if (waypointId) fd.append("waypointId", waypointId);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) onUpload?.(data.url);
    }
    setPreviews([]);
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive ? "Drop photos here" : "Drag & drop photos, or click to select"}
        </p>
      </div>
      {previews.length > 0 && (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {previews.map(({ preview }, i) => (
              <div key={i} className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} className="w-full h-full object-cover rounded" alt="" />
                <button
                  onClick={() => setPreviews((p) => p.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                  aria-label="Remove photo"
                >
                  <XIcon className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
          <Button onClick={uploadAll} disabled={uploading} className="w-full">
            {uploading ? "Uploading..." : `Upload ${previews.length} photo${previews.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
