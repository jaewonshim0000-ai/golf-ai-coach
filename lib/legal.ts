/**
 * The facts the privacy policy and terms depend on, in one place. Everything
 * in [brackets] is a decision for the owner or their lawyer; set `draft` to
 * false once the wording has been reviewed, and the draft banner goes away.
 */
export const LEGAL = {
  draft: true,
  company: "[Company legal name]",
  address: "[Registered address]",
  contact: "[support@your-domain]",
  updated: "[Date of this version]",
  /** Players younger than this may not create an account. */
  minAge: 16,
  jurisdiction: "[Governing law and courts]",
  dataRegion: "[Supabase project region]",
  backupDays: "[backup retention, e.g. 7]",
  refunds: "[Refund policy: e.g. no refunds for partial months, except where the law requires one]",
} as const;
