export type Photo = {
  id: string;
  url: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  createdAt: string;
};
