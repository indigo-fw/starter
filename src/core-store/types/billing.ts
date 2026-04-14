/** Frozen snapshot of an org's billing profile at order time. */
export interface BillingProfileSnapshot {
  legalName: string;
  companyRegistrationId?: string | null;
  vatId?: string | null;
  taxExempt: boolean;
  invoiceEmail?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}
