/**
 * Shared helpers, types, and data arrays for the Indigo seed scripts.
 * Extracted from init.ts — do not change logic, only the module boundary.
 */

import * as readline from 'readline';
import crypto from 'crypto';
import { deflateSync } from 'zlib';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CompanyInfo {
  siteName: string;
  siteUrl: string;
  companyName: string;
  companyAddress: string;
  companyId: string;
  companyJurisdiction: string;
  contactEmail: string;
  companyVat: string;
  companyPhone: string;
  companyCountry: string;
  supportEmail: string;
}

// ─── CLI Helpers ───────────────────────────────────────────────────────────

export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptPassword(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptWithDefault(question: string, defaultValue: string): Promise<string> {
  const answer = await prompt(`${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

export async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ─── Utility Helpers ───────────────────────────────────────────────────────

export function log(emoji: string, msg: string): void {
  console.log(`${emoji} ${msg}`);
}

export function simpleSlugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function token(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── PNG Generation ────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xFF]!;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crcBuf]);
}

export function createPlaceholderPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    raw[offset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Seed Data ─────────────────────────────────────────────────────────────

export const SEED_IMAGES = [
  { filename: 'blog-header-01.png', width: 1200, height: 630, r: 230, g: 126, b: 100, alt: 'Placeholder image — warm coral' },
  { filename: 'blog-header-02.png', width: 1200, height: 630, r: 100, g: 149, b: 230, alt: 'Placeholder image — cool blue' },
  { filename: 'blog-header-03.png', width: 1200, height: 630, r: 100, g: 190, b: 130, alt: 'Placeholder image — green' },
  { filename: 'blog-header-04.png', width: 1200, height: 630, r: 160, g: 120, b: 210, alt: 'Placeholder image — purple' },
  { filename: 'blog-header-05.png', width: 1200, height: 630, r: 220, g: 170, b: 80, alt: 'Placeholder image — amber' },
  { filename: 'blog-header-06.png', width: 1200, height: 630, r: 80, g: 180, b: 200, alt: 'Placeholder image — teal' },
  { filename: 'portfolio-01.png', width: 800, height: 600, r: 70, g: 140, b: 200, alt: 'Placeholder image — ocean blue' },
  { filename: 'portfolio-02.png', width: 800, height: 600, r: 200, g: 100, b: 160, alt: 'Placeholder image — magenta' },
  { filename: 'portfolio-03.png', width: 800, height: 600, r: 140, g: 180, b: 70, alt: 'Placeholder image — lime' },
  { filename: 'portfolio-04.png', width: 800, height: 600, r: 200, g: 140, b: 80, alt: 'Placeholder image — orange' },
  { filename: 'showcase-01.png', width: 540, height: 960, r: 180, g: 80, b: 160, alt: 'Placeholder image — deep magenta' },
  { filename: 'showcase-02.png', width: 540, height: 960, r: 80, g: 160, b: 190, alt: 'Placeholder image — cyan' },
];

export const CATEGORIES_DATA = [
  { name: 'Tutorials', slug: 'tutorials', title: 'Tutorials', content: 'Step-by-step guides and walkthroughs for developers of all skill levels. Learn practical techniques through hands-on examples and detailed explanations.', order: 1 },
  { name: 'News', slug: 'news', title: 'News & Updates', content: 'Latest announcements, release notes, and industry news. Stay informed about new features, breaking changes, and ecosystem developments.', order: 2 },
  { name: 'Development', slug: 'development', title: 'Development', content: 'Technical articles covering web development, software architecture, and programming best practices. Deep dives into TypeScript, React, and the T3 Stack.', order: 3 },
  { name: 'Design', slug: 'design', title: 'Design & UX', content: 'User experience, interface design, and visual design patterns. Practical advice on creating intuitive and accessible digital products.', order: 4 },
  { name: 'Business', slug: 'business', title: 'Business & SaaS', content: 'Entrepreneurship, SaaS growth strategies, and product management. Insights on building and scaling software businesses.', order: 5 },
  { name: 'DevOps', slug: 'devops', title: 'DevOps & Infrastructure', content: 'Cloud infrastructure, CI/CD pipelines, containerization, and deployment strategies. Practical guides for reliable and scalable systems.', order: 6 },
];

export const TAGS_DATA = [
  'Next.js', 'TypeScript', 'React', 'Tailwind CSS', 'PostgreSQL', 'tRPC',
  'Authentication', 'Performance', 'Testing', 'Docker', 'SEO', 'Accessibility',
];

// ─── Blog Generation ───────────────────────────────────────────────────────

export const TOPICS = [
  'TypeScript', 'Next.js', 'React', 'Tailwind CSS', 'PostgreSQL',
  'API Design', 'Authentication', 'Web Performance', 'Unit Testing',
  'CI/CD', 'SEO', 'Accessibility', 'State Management', 'Database Design',
  'Docker',
];

export const TITLE_PATTERNS = [
  'Getting Started with {topic}',
  '{topic}: A Comprehensive Guide',
  'Best Practices for {topic}',
  'Common {topic} Mistakes and How to Fix Them',
  'Advanced {topic} Patterns for Production Apps',
  '{topic} for Beginners: What You Need to Know',
  'Mastering {topic} Step by Step',
  'Why {topic} Matters for Modern Web Development',
  '{topic} Tips and Tricks for Experienced Developers',
  'The Ultimate {topic} Reference',
  'How to Improve Your {topic} Workflow',
  '{topic} in Practice: Real-World Examples',
  'Building Scalable Applications with {topic}',
  'A Practical Guide to {topic}',
];

export const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',
  'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula.',
  'Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat. Aliquam erat volutpat. Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus. Phasellus ultrices nulla quis nibh. Quisque a lectus.',
  'Fusce convallis metus id felis luctus adipiscing. Pellentesque egestas, neque sit amet convallis pulvinar, justo nulla eleifend augue, ac auctor orci leo non est. Quisque id mi. Ut tincidunt tincidunt erat. Etiam vestibulum volutpat enim. Diam quis enim lobortis scelerisque fermentum.',
  'Morbi in sem quis dui placerat ornare. Pellentesque odio nisi, euismod in, pharetra a, ultricies in, diam. Sed arcu. Cras consequat. Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat.',
  'Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Morbi lacinia molestie dui. Praesent blandit dolor. Sed non quam. In vel mi sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis laoreet.',
  'Donec lacus nunc, viverra nec, blandit vel, egestas et, augue. Vestibulum tincidunt malesuada tellus. Ut ultrices ultrices enim. Curabitur sit amet mauris. Morbi in dui quis est pulvinar ullamcorper. Nulla facilisi. Integer lacinia sollicitudin massa.',
  'Etiam iaculis nunc ac metus. Ut id nisl quis enim dignissim sagittis. Etiam sollicitudin, ipsum eu pulvinar rutrum, tellus ipsum laoreet sapien, quis venenatis ante odio sit amet eros. Proin magna. Duis vel nibh at velit scelerisque suscipit.',
  'Maecenas malesuada elit lectus felis, malesuada ultricies. Curabitur et ligula. Ut molestie a, ultricies porta urna. Vestibulum commodo volutpat a, convallis ac, laoreet enim. Phasellus fermentum in, dolor. Pellentesque facilisis. Nulla imperdiet sit amet magna.',
  'Sed lectus. Integer euismod lacus luctus magna. Quisque cursus, metus vitae pharetra auctor, sem massa mattis sem, at interdum magna augue eget diam. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Morbi lacinia molestie dui.',
  'Nunc nec neque. Phasellus leo dolor, tempus non, auctor et, hendrerit quis, nisi. Curabitur ligula sapien, tincidunt non, euismod vitae, posuere imperdiet, leo. Maecenas malesuada. Praesent congue erat at massa. Sed cursus turpis vitae tortor.',
  'Suspendisse potenti. Fusce ac felis sit amet ligula pharetra condimentum. Maecenas egestas arcu quis ligula mattis placerat. Duis lobortis massa imperdiet quam. Suspendisse potenti. Pellentesque commodo eros a enim. Vestibulum turpis sem, aliquet eget.',
  'Aliquam erat volutpat. Nunc fermentum tortor ac porta dapibus. In rutrum ac purus sit amet tempus. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nulla facilisi. Cras non velit nec nisi vulputate nonummy. Maecenas tincidunt lacus at velit.',
  'Vivamus vestibulum ntulla nec ante. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos hymenaeos. Curabitur sodales ligula in libero. Sed dignissim lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean quam.',
];

export const SECTION_HEADINGS = [
  'Overview', 'Key Concepts', 'Getting Started', 'Configuration',
  'Basic Usage', 'Advanced Features', 'Best Practices', 'Common Patterns',
  'Error Handling', 'Performance Considerations', 'Testing Strategies',
  'Deployment', 'Troubleshooting', 'Summary', 'Next Steps',
  'Architecture', 'Implementation Details', 'Security Considerations',
  'Monitoring and Observability', 'Migration Guide',
];

export function generateBlogPost(index: number) {
  const topicIdx = index % TOPICS.length;
  const patternIdx = Math.floor(index / TOPICS.length) % TITLE_PATTERNS.length;
  const topic = TOPICS[topicIdx]!;
  const title = TITLE_PATTERNS[patternIdx]!.replace('{topic}', topic);
  const slug = simpleSlugify(title);

  // Generate content with 2-5 sections
  const sectionCount = 2 + (index % 4);
  let content = LOREM_PARAGRAPHS[index % LOREM_PARAGRAPHS.length]! + '\n\n';
  for (let s = 0; s < sectionCount; s++) {
    const hIdx = (index * 7 + s * 3) % SECTION_HEADINGS.length;
    content += `## ${SECTION_HEADINGS[hIdx]!}\n\n`;
    content += LOREM_PARAGRAPHS[(index * 3 + s * 5) % LOREM_PARAGRAPHS.length]! + '\n\n';
    if ((index + s) % 3 === 0) {
      content += LOREM_PARAGRAPHS[(index * 3 + s * 5 + 7) % LOREM_PARAGRAPHS.length]! + '\n\n';
    }
  }

  // Assign category (deterministic)
  const categoryIdx = index % CATEGORIES_DATA.length;

  // Assign 2-3 tags
  const tagCount = 2 + (index % 2);
  const tagIndices: number[] = [];
  for (let t = 0; t < tagCount; t++) {
    const tagIdx = (index * 3 + t * 7) % TAGS_DATA.length;
    if (!tagIndices.includes(tagIdx)) {
      tagIndices.push(tagIdx);
    }
  }

  // Status: 90 published, 3 scheduled, 8 draft
  let status = 1; // published
  if (index >= 93) status = 0;       // draft (last 8)
  else if (index >= 90) status = 2;  // scheduled (3)

  // Spread published dates over 6 months
  const daysAgo = Math.floor((100 - index) * 1.8);
  const publishedAt = index < 90
    ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    : status === 2
      ? new Date(Date.now() + (index - 89) * 7 * 24 * 60 * 60 * 1000)
      : null;

  // Featured image (cycle through 6 blog headers)
  const imageIdx = (index % 6) + 1;
  const featuredImage = `/api/uploads/seed/blog-header-${String(imageIdx).padStart(2, '0')}.png`;

  const metaDescription = `A comprehensive article about ${topic}. ${LOREM_PARAGRAPHS[0]!.slice(0, 100)}...`;

  return { title, slug, content, categoryIdx, tagIndices, status, publishedAt, featuredImage, metaDescription, topic };
}
