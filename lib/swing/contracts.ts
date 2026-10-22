import { z } from "zod";
import { isCaptureManifest, type CaptureManifest } from "./manifest";

// Client provenance is diagnostic data, never a server-side accuracy certificate.
export const captureManifestSchema = z.custom<CaptureManifest>(isCaptureManifest, "Invalid swing capture manifest.");
export type { CaptureManifest } from "./manifest";
