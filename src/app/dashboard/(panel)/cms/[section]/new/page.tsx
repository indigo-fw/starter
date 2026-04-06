import { notFound } from 'next/navigation';

import { getContentTypeByAdminSlug } from '@/config/cms';
import { PostForm } from '@/components/admin/PostForm';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { PortfolioForm } from '@/components/admin/PortfolioForm';
import { ShowcaseForm } from '@/components/admin/ShowcaseForm';
import { TermForm } from '@/components/admin/TermForm';

interface Props {
  params: Promise<{ section: string }>;
}

export default async function NewCmsItemPage({ params }: Props) {
  const { section } = await params;
  const contentType = getContentTypeByAdminSlug(section);

  if (!contentType) {
    notFound();
  }

  if (contentType.id === 'category') {
    return <CategoryForm />;
  }

  if (contentType.id === 'portfolio') {
    return <PortfolioForm />;
  }

  if (contentType.id === 'showcase') {
    return <ShowcaseForm />;
  }

  if (contentType.id === 'tag') {
    return <TermForm />;
  }

  return <PostForm contentType={contentType} />;
}
