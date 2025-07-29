import config from '../config';

interface GenerateQrCodePayload {
  data: string;
  size?: number;
  encoding?: 'utf-8' | 'UTF-8';
}

export function generateQrCodeUrl({ data, size = 150, encoding = 'UTF-8' }: GenerateQrCodePayload): string {
  const encodedData = encodeURIComponent(data);
  return `${config.CHART_API_URL}?chs=${size}x${size}&cht=qr&chl=${encodedData}&choe=${encoding}`;
}
