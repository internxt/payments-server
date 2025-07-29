import config from '../../src/config';
import { generateQrCodeUrl } from '../../src/utils/generateQrCodeUrl';

describe('Generating a QR Code', () => {
  test('When generating a QR Code, then it should return a valid URL', () => {
    const url = generateQrCodeUrl({ data: 'test' });
    expect(url).toBe(`${config.CHART_API_URL}?chs=150x150&cht=qr&chl=test&choe=UTF-8`);
  });
});
