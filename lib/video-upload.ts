export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function validateVideo(file: { size: number; type: string; name: string }): string | null {
  if (!file.size) return "This video is empty. Choose another file.";
  if (file.size > MAX_VIDEO_BYTES) return "Choose a video smaller than 50 MB.";
  if (!/\.(mp4|mov|webm)$/i.test(file.name) || !["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) {
    return "Choose an MP4, MOV, or WebM video.";
  }
  return null;
}

export function privateVideoPath(value: string, userId: string): string | null {
  const prefix = `supabase://swing-videos/${userId}/`;
  if (!value.startsWith(prefix)) return null;
  const file = value.slice(prefix.length);
  if (!/^[a-f0-9-]+\.(mp4|mov|webm)$/i.test(file)) return null;
  return `${userId}/${file}`;
}
