import { notFound } from 'next/navigation';
import { rpc } from '@/core/db';
import { readDeviceId } from '@/core/security';
import type { GameState } from '@/core/types';
import Game from './Game';

export const dynamic = 'force-dynamic';

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) notFound();
  const deviceId = await readDeviceId();
  const state = await rpc<GameState | { found: false }>('game_state', { slug, device_id: deviceId ?? '' });
  if (!state.found) notFound();
  return <Game initial={state} />;
}
