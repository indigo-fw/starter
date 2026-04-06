// Engine config — interfaces for pricing plan and FAQ definitions

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

export interface PricingFaq {
  question: string;
  answer: string;
}
