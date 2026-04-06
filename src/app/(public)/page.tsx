import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { siteConfig } from "@/config/site";
import { serverTRPC } from "@/lib/trpc/server";
import { PostType } from "@/core/types/cms";
import { PostCard } from "@/core/components/PostCard";
import { TagCloud } from "@/core/components/TagCloud";
import { db } from "@/server/db";
import { getCodedRouteSEO } from "@/core/crud/page-seo";
import { getLocale } from "@/lib/locale-server";
import { localePath } from "@/lib/locale";
import { getServerTranslations } from "@/lib/translations-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const seo = await getCodedRouteSEO(db, "", locale).catch(() => null);

  return {
    title: seo?.seoTitle || siteConfig.seo.title,
    description: seo?.metaDescription || siteConfig.seo.description,
    ...(seo?.noindex && { robots: { index: false, follow: false } }),
  };
}

export default async function HomePage() {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  let recentPosts: Array<{
    id: string;
    slug: string;
    title: string;
    metaDescription: string | null;
    publishedAt: Date | null;
    tags: { id: string; name: string; slug: string }[];
  }> = [];

  let categories: Array<{
    name: string;
    slug: string;
  }> = [];

  try {
    const api = await serverTRPC();
    const [postData, catData] = await Promise.all([
      api.cms.listPublished({
        type: PostType.BLOG,
        lang: locale,
        page: 1,
        pageSize: 6,
      }),
      api.categories.listPublished({
        lang: locale,
        page: 1,
        pageSize: 8,
      }),
    ]);
    recentPosts = postData.results;
    categories = catData.results;
  } catch {
    // DB may not be initialized yet
  }

  const [featured, ...rest] = recentPosts;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-(--surface-primary) py-20">
        <div className="container text-center">
          <h1 className="text-4xl font-bold tracking-tight text-(--text-primary) sm:text-5xl">
            {siteConfig.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-(--text-secondary)">
            {siteConfig.description}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/blog"
              className="btn btn-primary rounded-lg px-6 py-3 text-sm shadow-sm"
            >
              {__("Read the Blog")}
            </Link>
            <Link
              href="/portfolio"
              className="btn btn-secondary rounded-lg px-6 py-3 text-sm shadow-sm"
            >
              {__("View Portfolio")}
            </Link>
          </div>
        </div>
      </section>

      {/* Recent posts */}
      {featured && (
        <section className="section-alt">
          <div className="container">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-(--text-primary)">
                {__("Recent Posts")}
              </h2>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500"
              >
                {__("View all")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Featured post — full width */}
            <div className="mt-8">
              <PostCard
                title={featured.title}
                href={localePath(`/blog/${featured.slug}`, locale)}
                metaDescription={featured.metaDescription}
                publishedAt={featured.publishedAt}
                tags={featured.tags}
                locale={locale}
                variant="card"
              />
            </div>

            {/* Rest — grid */}
            {rest.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
                  <PostCard
                    key={post.id}
                    title={post.title}
                    href={localePath(`/blog/${post.slug}`, locale)}
                    metaDescription={post.metaDescription}
                    publishedAt={post.publishedAt}
                    tags={post.tags}
                    locale={locale}
                    variant="card"
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Category showcase */}
      {categories.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="text-2xl font-bold text-(--text-primary)">
              {__("Categories")}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={{
                    pathname: "/category/[slug]",
                    params: { slug: cat.slug },
                  }}
                  className="rounded-lg border border-(--border-primary) bg-(--surface-secondary) p-4 text-center text-sm font-medium text-(--text-primary) transition-colors hover:border-brand-300 hover:text-brand-600"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tag cloud */}
      <TagCloud
        lang={locale}
        limit={15}
        sectionTitle={__("Popular Tags")}
        sectionClassName="section-alt"
        containerClassName="container"
      />
    </div>
  );
}
