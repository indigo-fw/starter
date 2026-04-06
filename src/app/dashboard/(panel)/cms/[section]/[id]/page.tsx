import { notFound } from 'next/navigation';

import { getContentTypeByAdminSlug } from '@/config/cms';
import { PostForm } from '@/components/admin/PostForm';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { PortfolioForm } from '@/components/admin/PortfolioForm';
import { ShowcaseForm } from '@/components/admin/ShowcaseForm';
import { TermForm } from '@/components/admin/TermForm';

interface Props {
  params: Promise<{ section: string; id: string }>;
}

export default async function EditCmsItemPage({ params }: Props) {
  const { section, id } = await params;
  const contentType = getContentTypeByAdminSlug(section);

  if (!contentType) {
    notFound();
  }

  if (contentType.id === 'category') {
    return <CategoryForm categoryId={id} />;
  }

  if (contentType.id === 'portfolio') {
    return <PortfolioForm portfolioId={id} />;
  }

  if (contentType.id === 'showcase') {
    return <ShowcaseForm showcaseId={id} />;
  }

  if (contentType.id === 'tag') {
    return <TermForm tagId={id} />;
  }

  return <PostForm contentType={contentType} postId={id} />;
}
