import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { BrandLogo, Drawer, Icon } from '../components/ui';
import { marketingNavigation } from './content';
import './marketing.css';

export function MarketingButton({ to = '/register', children, secondary = false }: { to?: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`mk-button ${secondary ? 'mk-button-secondary' : ''}`} to={to}>{children}<Icon name="arrow-right" /></Link>;
}

export default function MarketingLayout({ children, home = false }: { children: ReactNode; home?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  return <div className={`mk-site ${home ? 'mk-home' : 'mk-interior'}`}>
    <header className="mk-header">
      <div className="mk-container mk-header-inner">
        <Link to="/" aria-label="Trang chủ An Hưu" className="mk-logo"><BrandLogo inverted height={34} /></Link>
        <nav className="mk-nav" aria-label="Điều hướng chính">
          {marketingNavigation.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}>{item.label}</NavLink>)}
        </nav>
        <div className="mk-header-actions"><Link to="/login">Đăng nhập</Link><Link to="/register" className="mk-button mk-small">Bắt đầu miễn phí<Icon name="arrow-right" /></Link></div>
        <button className="mk-menu" type="button" aria-label="Mở menu" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="grid" /></button>
      </div>
    </header>
    <Drawer open={open} title="An Hưu" onClose={() => setOpen(false)}>
      <nav className="mk-mobile-nav" aria-label="Điều hướng chính trên di động">
        {marketingNavigation.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setOpen(false)}>{item.label}</NavLink>)}
        <Link to="/login" onClick={() => setOpen(false)}>Đăng nhập</Link><Link to="/register" onClick={() => setOpen(false)}>Bắt đầu miễn phí</Link>
      </nav>
    </Drawer>
    <main id="main-content">{children}</main>
    <footer className="mk-footer"><div className="mk-container">
      <div className="mk-footer-top">
        <div className="mk-footer-brand"><Link to="/" aria-label="An Hưu - về trang chủ" className="mk-footer-logo"><BrandLogo inverted height={46} /></Link><p>Chuẩn bị hôm nay.<br /><span>An yên cho ngày mai.</span></p><small>Đồng hành cùng bạn trên hành trình chuẩn bị tài chính cho tuổi hưu.</small></div>
        <nav className="mk-footer-links" aria-label="Khám phá An Hưu"><h2>Khám phá</h2>{marketingNavigation.map(item => <Link key={item.path} to={item.path}>{item.label}</Link>)}</nav>
        <nav className="mk-footer-links" aria-label="Tài khoản"><h2>Kế hoạch của bạn</h2><Link to="/register">Tạo tài khoản</Link><Link to="/login">Đăng nhập tài khoản<Icon name="arrow-right" /></Link></nav>
        <div className="mk-footer-start"><span className="mk-footer-start-icon"><Icon name="compass" /></span><h2>Bắt đầu thật đơn giản.</h2><p>Thử một kịch bản hưu trí.<br />Chưa cần tạo tài khoản.</p><Link to="/mo-phong">Thử mô phỏng<span><Icon name="arrow-right" /></span></Link></div>
      </div>
      <div className="mk-footer-bottom">
        <span>© An Hưu. Nền tảng lập kế hoạch hưu trí.</span>
        <small>Công cụ tham khảo. Không cam kết kết quả tài chính.</small>
      </div>
    </div></footer>
  </div>;
}

export function FinalCTA() {
  return <section className="mk-section mk-final"><div className="mk-container"><div className="mk-final-panel"><span className="mk-eyebrow">TƯƠNG LAI BẮT ĐẦU TỪ HÔM NAY</span><h2>Một bước nhỏ hôm nay.<br /><span>Một tuổi hưu chủ động.</span></h2><p>Cho những dự định ngày mai một kế hoạch rõ ràng.</p><MarketingButton>Bắt đầu lập kế hoạch</MarketingButton><small>Miễn phí trải nghiệm · Không cần thẻ ngân hàng</small></div></div></section>;
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="mk-page-intro mk-container"><span className="mk-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{children}</p></div>;
}
