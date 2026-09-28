"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";

type Photo = { id: string; publicUrl: string; altText?: string | null; isPrimary?: boolean };

export function ListingPhotoGallery({ images, title }: { images: Photo[]; title: string }) {
  const photos = [...images].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const photo = photos[selected] ?? photos[0];
  function open(index = selected) {
    setSelected(index);
    returnFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    returnFocus.current?.focus();
  }
  useEffect(() => {
    const showLinkedGallery = () => {
      if (window.location.hash === "#photos" && images.length) dialog.current?.showModal();
    };
    showLinkedGallery();
    window.addEventListener("hashchange", showLinkedGallery);
    return () => window.removeEventListener("hashchange", showLinkedGallery);
  }, [images.length]);
  if (!photo) return <div className="media-placeholder flex min-h-72 items-center justify-center">Photos coming soon</div>;
  const move = (direction: number) => setSelected((index) => (index + direction + photos.length) % photos.length);
  return <section className="space-y-3" aria-label="Listing photos" id="photos">
    <button className="gallery-main media-frame relative block w-full" type="button" onClick={() => open()} aria-label={`Enlarge ${title}, photo ${selected + 1} of ${photos.length}`}>
      <img src={photo.publicUrl} alt={photo.altText || title} className="h-full w-full object-contain" />
      <span className="gallery-enlarge">View full photo · {selected + 1} / {photos.length}</span>
    </button>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Photo gallery</h2>
      <button className="button-secondary px-3 py-2 text-sm" type="button" onClick={() => open()}>View all {photos.length} photos</button>
    </div>
    <div className="gallery-thumbnails">
      {photos.map((image, index) => <button key={image.id} type="button" aria-label={`View photo ${index + 1} of ${photos.length}`} aria-pressed={index === selected}
        className="gallery-thumbnail" onClick={() => open(index)}>
        <img src={image.publicUrl} alt={image.altText || `${title}, photo ${index + 1}`} loading="lazy" className="h-full w-full object-contain" />
      </button>)}
    </div>
    <dialog ref={dialog} className="photo-viewer" aria-labelledby={headingId} onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); move(1); } }}>
      <div className="photo-viewer__body">
        <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold" id={headingId}>{title}</h2>
          <button className="button-secondary shrink-0 px-4 py-2" type="button" onClick={close}>Close photos</button></div>
        <img key={photo.id} src={photo.publicUrl} alt={photo.altText || title} className="photo-viewer__image" />
        <div className="flex items-center justify-between gap-3">
          <button className="button-secondary px-4 py-3" type="button" disabled={photos.length < 2} onClick={() => move(-1)}>← Previous</button>
          <span role="status">Photo {selected + 1} of {photos.length}</span>
          <button className="button-secondary px-4 py-3" type="button" disabled={photos.length < 2} onClick={() => move(1)}>Next →</button>
        </div>
        <a className="text-sm underline" href={photo.publicUrl} target="_blank" rel="noreferrer">Open original image</a>
      </div>
    </dialog>
  </section>;
}
