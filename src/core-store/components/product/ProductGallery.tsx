'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { useBlankTranslations } from '@/lib/translations';

interface GalleryImage {
  url: string;
  alt: string | null;
}

export function ProductGallery({
  featuredImage,
  images,
  productName,
  onImageChange,
}: {
  featuredImage: string | null;
  images: GalleryImage[];
  productName: string;
  onImageChange?: (url: string) => void;
}) {
  const __ = useBlankTranslations();

  const allImages = [
    ...(featuredImage ? [{ url: featuredImage, alt: productName }] : []),
    ...images.filter((img) => img.url !== featuredImage),
  ];

  const [mainImage, setMainImage] = useState(featuredImage);

  function selectImage(url: string) {
    setMainImage(url);
    onImageChange?.(url);
  }

  return (
    <div className="product-gallery">
      <div className="product-gallery-main">
        {mainImage ? (
          <Image
            src={mainImage}
            alt={productName}
            width={600}
            height={600}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        ) : (
          <div className="product-card-image-placeholder" style={{ height: '100%' }}>
            <Package className="h-16 w-16" />
          </div>
        )}
      </div>
      {allImages.length > 1 && (
        <div className="product-gallery-thumbs">
          {allImages.map((img, i) => (
            <button
              key={i}
              type="button"
              className="product-gallery-thumb"
              data-active={mainImage === img.url ? 'true' : undefined}
              onClick={() => selectImage(img.url)}
              aria-label={img.alt ?? `${__('Image')} ${i + 1}`}
            >
              <Image src={img.url} alt={img.alt ?? ''} width={64} height={64} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
