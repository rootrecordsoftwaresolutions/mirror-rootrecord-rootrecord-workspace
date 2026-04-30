
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageDropzoneProps {
  file: File | null;
  onChange: (f: File | null) => void;
  uploading?: boolean;
}

export function ImageDropzone({ file, onChange, uploading }: ImageDropzoneProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0];
      if (!f) return;
      onChange(f);
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(f);
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'image/png': [], 'image/jpeg': [], 'image/webp': [], 'image/gif': [] },
    maxSize: 5 * 1024 * 1024,
  });

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    onChange(null);
  };

  return (
    <div
      {...getRootProps()}
      data-testid="logo-dropzone"
      className={cn(
        'relative flex h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-sm transition-colors',
        isDragActive
          ? 'border-sol-green bg-sol-green/5 text-sol-green'
          : 'border-border bg-ink-700/30 hover:border-sol-green/50 text-muted-foreground',
      )}
    >
      <input {...getInputProps()} data-testid="logo-input" />
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Logo preview"
            className="h-full w-full object-contain rounded-xl p-3"
          />
          <button
            type="button"
            onClick={clear}
            data-testid="logo-clear"
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1 hover:bg-black/80"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 rounded-xl">
              <Loader2 className="h-5 w-5 animate-spin text-sol-green" />
            </div>
          )}
        </>
      ) : (
        <>
          <ImagePlus className="h-7 w-7 mb-2" />
          <span className="font-medium text-foreground">
            {isDragActive ? 'Drop the image here' : 'Drag & drop or click to upload'}
          </span>
          <span className="text-xs mt-1">PNG, JPG, WEBP, GIF · max 5 MB</span>
          {file && !previewUrl && (
            <span className="mt-2 text-xs">{file.name}</span>
          )}
        </>
      )}
    </div>
  );
}
