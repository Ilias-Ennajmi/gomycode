import QRCode from 'qrcode';
import { isAdmin } from '@/core/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdmin())) return new Response('Non autorisé', { status: 401 });
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return new Response('Introuvable', { status: 404 });
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const url = `${proto}://${req.headers.get('host')}/jeu/${slug}`;
  const png = await QRCode.toBuffer(url, { width: 1600, margin: 3, errorCorrectionLevel: 'M' });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-100k-${slug}.png"`,
      'Cache-Control': 'no-store',
    },
  });
}
