import { VerificationPolicyInputError } from "./policy";

export function parseAnnouncementVideo(value: unknown): { kind: "youtube" | "hosted"; src: string; url: string } | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const invalid = () => new VerificationPolicyInputError("Enter a YouTube video link or an HTTPS MP4/WebM video URL.");
  if (text.length > 1000) throw invalid();
  let url: URL;
  try { url = new URL(text); } catch { throw invalid(); }
  if (url.protocol !== "https:" || url.username || url.password) throw invalid();
  const host = url.hostname.toLowerCase();
  if (["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
    const id = host === "youtu.be" ? url.pathname.slice(1)
      : url.pathname === "/watch" ? url.searchParams.get("v")
        : /^\/(?:embed|shorts)\/([^/]+)$/u.exec(url.pathname)?.[1];
    if (!id || !/^[\w-]{11}$/u.test(id)) throw invalid();
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, url: text };
  }
  if (!/\.(mp4|webm)$/iu.test(url.pathname)) throw invalid();
  return { kind: "hosted", src: text, url: text };
}
