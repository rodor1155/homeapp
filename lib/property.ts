/** The property-type picklist, shared by onboarding and settings so the two
 *  forms can't drift apart. Client-safe. */
export const PROPERTY_TYPES = [
  "House",
  "Flat / Apartment",
  "Bungalow",
  "Condo",
  "Townhouse",
  "Other",
] as const;
