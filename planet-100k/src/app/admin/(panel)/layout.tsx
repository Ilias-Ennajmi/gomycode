import { requireAdmin } from '@/core/security';
import { logout } from '../actions';
import Nav from '../_ui/Nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Back-office | Planet Sport 100K' };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="bo">
      <header className="bo-bar">
        <img src="/brand/planet-sport-white.png" alt="Planet Sport" width={785} height={118} />
        <Nav />
        <form action={logout}>
          <button className="b b-dark" style={{ borderColor: '#fff' }}>
            Se déconnecter
          </button>
        </form>
      </header>
      <main className="bo-main">{children}</main>
    </div>
  );
}
