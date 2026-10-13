import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  category?: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  category = 'Atelier Piece',
  className = 'w-full h-full object-cover',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F4F3EF] text-[#575653] p-6 text-center select-none ${className}`}
      >
        <Package className="w-7 h-7 stroke-[1.25] mb-2 text-[#8C6D46]" />
        <span className="text-xs tracking-wide font-medium text-[#141413] line-clamp-1">
          {alt}
        </span>
        <span className="text-[11px] text-[#787774] mt-0.5">{category}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
      loading="lazy"
    />
  );
};
