"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { listingImageAcceptedMimeTypes, listingImageMaxSizeBytes } from "@/lib/catalog/index";

export type SavedPhotoPreview = { id: string; src: string; filename: string; alt?: string };

export function photoPreviewIssue(file: Pick<File, "type" | "size">) {
  if (!(listingImageAcceptedMimeTypes as readonly string[]).includes(file.type)) {
    return "Preview unavailable. Choose a JPEG, PNG, WebP, AVIF, or GIF image. Videos are not supported.";
  }
  if (!file.size) return "This file is empty. Choose another image.";
  if (file.size > listingImageMaxSizeBytes) return `This image is too large. Choose an image of ${listingImageMaxSizeBytes / (1024 * 1024)} MB or smaller.`;
  return null;
}

/** Each mounted image owns its browser URL and releases it on replacement or removal. */
export function createFilePhotoPreview(file: File) {
  if (photoPreviewIssue(file)) return null;
  const src = URL.createObjectURL(file);
  let disposed = false;
  return {
    src,
    dispose() {
      if (!disposed) URL.revokeObjectURL(src);
      disposed = true;
    }
  };
}

function PreviewImage({ source, alt, className, onError, eager = false }: {
  source: File | string;
  alt: string;
  className: string;
  onError: () => void;
  eager?: boolean;
}) {
  const attachImage = useCallback((image: HTMLImageElement | null) => {
    if (!image || typeof source === "string") return;
    const preview = createFilePhotoPreview(source);
    if (!preview) return;
    image.src = preview.src;
    return preview.dispose;
  }, [source]);

  return <img alt={alt} className={className} decoding="async" loading={eager ? "eager" : "lazy"} onError={onError} ref={attachImage}
    src={typeof source === "string" ? source : undefined} />;
}

function EnlargedPhoto({ source, filename, alt, close }: {
  source: File | string;
  filename: string;
  alt: string;
  close: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  function closeDialog() {
    dialogRef.current?.close();
    close();
  }

  return (
    <dialog aria-labelledby={headingId} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,64rem)] overflow-auto rounded-xl bg-white p-4 shadow-xl backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); closeDialog(); }} onClose={close} ref={dialogRef}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <h4 className="min-w-0 break-all font-semibold text-zinc-900" id={headingId}>{filename}</h4>
        <button className="button-secondary shrink-0 px-3 py-2 text-sm" onClick={closeDialog} type="button">Close photo</button>
      </div>
      {failed ? <p role="status">This image could not be displayed. Try another image.</p> :
        <PreviewImage alt={alt} className="mx-auto max-h-[72dvh] max-w-full object-contain" eager onError={() => setFailed(true)} source={source} />}
    </dialog>
  );
}

function PhotoThumbnail({ source, filename, alt, issue }: {
  source: File | string;
  filename: string;
  alt: string;
  issue: string | null;
}) {
  const [failedSource, setFailedSource] = useState<File | string | null>(null);
  const [openedSource, setOpenedSource] = useState<File | string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unavailable = issue ?? (failedSource === source ? "This image could not be displayed. Try another image." : null);

  return (
    <li className="min-w-0 rounded-lg border border-zinc-200 bg-white p-2">
      {unavailable ? <p className="flex min-h-24 items-center rounded bg-zinc-100 p-2 text-xs text-zinc-600">{unavailable}</p> :
        <button aria-label={`Enlarge photo: ${filename}`} className="flex w-full flex-col overflow-hidden rounded bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          onClick={() => setOpenedSource(source)} ref={buttonRef} type="button">
          <PreviewImage alt={alt} className="h-28 w-full object-contain" onError={() => setFailedSource(source)} source={source} />
          <span className="block px-2 py-1 text-xs text-zinc-600">Enlarge</span>
        </button>}
      <p className="mt-2 break-all text-xs text-zinc-700">{filename}</p>
      {openedSource === source && !unavailable ? <EnlargedPhoto alt={alt} close={() => {
        setOpenedSource(null);
        buttonRef.current?.focus();
      }} filename={filename} source={source} /> : null}
    </li>
  );
}

export function PhotoThumbnails({ files = [], images = [], label = "Item photos" }: {
  files?: readonly File[];
  images?: readonly SavedPhotoPreview[];
  label?: string;
}) {
  if (!files.length && !images.length) return null;
  return (
    <ul aria-label={label} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
      {images.map((photo) => <PhotoThumbnail alt={photo.alt ?? photo.filename} filename={photo.filename} key={photo.id}
        issue={/^https?:\/\//i.test(photo.src) || (photo.src.startsWith("/") && !photo.src.startsWith("//")) ? null : "This saved image cannot be previewed."} source={photo.src} />)}
      {files.map((file, index) => <PhotoThumbnail alt={`Selected item photo: ${file.name}`} filename={file.name}
        issue={photoPreviewIssue(file)} key={`${file.name}:${file.size}:${file.lastModified}:${index}`} source={file} />)}
    </ul>
  );
}
