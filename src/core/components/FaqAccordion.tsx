'use client';

import './pricing.css';

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  faqs: FaqItem[];
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  return (
    <div className="max-w-3xl mx-auto divide-y divide-(--border-primary)">
      {faqs.map((faq) => (
        <details key={faq.question} className="faq-item group py-4">
          <summary className="flex items-center justify-between cursor-pointer text-left font-medium">
            {faq.question}
            <svg
              className="w-5 h-5 text-(--text-secondary) shrink-0 transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </summary>
          <p className="mt-3 text-sm text-(--text-secondary) leading-relaxed">
            {faq.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
