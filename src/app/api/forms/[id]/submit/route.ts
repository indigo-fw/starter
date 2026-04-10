import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsForms, cmsFormSubmissions } from '@/server/db/schema';
import { enqueueEmail } from '@/server/jobs/email/index';
import { getRedis } from '@/core/lib/infra/redis';
import { checkRateLimit } from '@/core/lib/infra/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limit: 5 submissions per form per IP per hour (Redis-backed, fail-open)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateKey = `form-submit:${id}:${ip}`;
    const redis = getRedis();
    const rl = await checkRateLimit(redis, rateKey, {
      windowMs: 3600_000,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions' },
        { status: 429 }
      );
    }

    // Fetch form
    const form = await db.query.cmsForms.findFirst({
      where: eq(cmsForms.id, id),
    });
    if (!form || !form.active) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Honeypot check
    if (form.honeypotField && body[form.honeypotField]) {
      // Silently reject spam
      return NextResponse.json({ message: form.successMessage });
    }

    // Validate required fields
    const fields = form.fields as Array<{
      id: string;
      label: string;
      required?: boolean;
      type: string;
    }>;
    for (const field of fields) {
      if (field.required && !body[field.id]) {
        return NextResponse.json(
          { error: `${field.label} is required` },
          { status: 400 }
        );
      }
    }

    // Save submission
    await db.insert(cmsFormSubmissions).values({
      formId: id,
      data: body,
      ip,
      userAgent: request.headers.get('user-agent'),
    });

    // Send email notification
    if (form.recipientEmail) {
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const fieldLabels = new Map(fields.map((f) => [f.id, f.label]));
      const lines = Object.entries(body)
        .filter(([key]) => key !== form.honeypotField)
        .map(
          ([key, val]) =>
            `<p><strong>${esc(fieldLabels.get(key) ?? key)}:</strong> ${esc(String(val))}</p>`
        )
        .join('\n');

      await enqueueEmail({
        to: form.recipientEmail,
        subject: `New submission: ${esc(form.name)}`,
        html: `<h2>New form submission</h2>\n<p>Form: ${esc(form.name)}</p>\n<hr/>\n${lines}`,
      });
    }

    return NextResponse.json({ message: form.successMessage });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
