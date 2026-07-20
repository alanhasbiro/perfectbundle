export interface BundleItemLike {
  name: string;
  description: string;
  why: string;
  estPriceRange: string;
  searchQuery: string;
  tags: string[];
  imageUrl?: string;
  imageIsRepresentative?: boolean;
  imageCreditName?: string;
  imageCreditUrl?: string;
  imageSource?: string;
  productUrl?: string;
  productPrice?: string;
  productMerchant?: string;
}

export interface BundleContentLike {
  theme: string;
  rationale: string;
  estTotal: string;
  items: BundleItemLike[];
}
