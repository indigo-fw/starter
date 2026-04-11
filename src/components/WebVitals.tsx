'use client';

import { useEffect } from 'react';
import type { Metric } from 'web-vitals';

function reportMetric(metric: Metric) {
  // Send to analytics endpoint if configured, otherwise log in dev
  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
  if (endpoint) {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
    });
    // Use sendBeacon for reliability during page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body);
    } else {
      fetch(endpoint, { body, method: 'POST', keepalive: true }).catch(() => {});
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.debug('[WebVitals]', metric.name, Math.round(metric.value), metric.rating);
  }
}

export function WebVitals() {
  useEffect(() => {
    import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      onCLS(reportMetric);
      onINP(reportMetric);
      onLCP(reportMetric);
      onFCP(reportMetric);
      onTTFB(reportMetric);
    });
  }, []);

  return null;
}
